// RLS / security smoke test (SPEC S1–S6, W5). No dependencies, Node 18+.
// Usage (local stack only — needs the service_role key to create staff users):
//   SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY=... SERVICE_ROLE_KEY=... node supabase/tests/rls_smoke.mjs

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.ANON_KEY;
const SERVICE = process.env.SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error('Missing SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY');

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};

async function req(path, { token, key = ANON, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

const anonSignIn = async () => (await req('/auth/v1/signup', { method: 'POST', body: {} })).data.access_token;
const login = async (email, password) =>
  (await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })).data.access_token;

async function createUser(email, password) {
  const r = await req('/auth/v1/admin/users', {
    key: SERVICE, method: 'POST', body: { email, password, email_confirm: true },
  });
  if (!r.ok) throw new Error('createUser: ' + JSON.stringify(r.data));
  return r.data.id;
}

const rpc = (fn, args, token) => req(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args, token });
const startConv = (token) =>
  rpc('start_conversation', { p_name: 'Ann', p_phone: '123', p_dni: '999', p_question: 'Hello?' }, token);
const sendVisitor = (token, conversation_id, body = 'hi') =>
  req('/rest/v1/messages', { method: 'POST', token, body: { conversation_id, sender_type: 'visitor', body } });

const stamp = Date.now();

// --- S2: no session ---
let r = await req('/rest/v1/messages?select=*');
check('S2 anon without session reads no messages', Array.isArray(r.data) && r.data.length === 0, JSON.stringify(r.data));
r = await req('/rest/v1/conversations?select=*');
check('S2 anon without session reads no conversations', Array.isArray(r.data) && r.data.length === 0, JSON.stringify(r.data));
r = await req('/rest/v1/widget_settings?select=*');
check('S2 anon reads widget_settings', r.ok && r.data.length === 1, JSON.stringify(r.data));

// --- Visitors A and B ---
const A = await anonSignIn();
const B = await anonSignIn();
check('anonymous sign-in works', !!A && !!B);

r = await startConv(A);
const convA = r.data;
check('W2 start_conversation returns id', r.ok && typeof convA === 'string', JSON.stringify(r.data));
r = await req(`/rest/v1/messages?conversation_id=eq.${convA}&select=*`, { token: A });
check('W2 initial question is first message', r.ok && r.data.length === 1 && r.data[0].body === 'Hello?', JSON.stringify(r.data));

// --- S1 ---
r = await req(`/rest/v1/messages?conversation_id=eq.${convA}&select=*`, { token: B });
check('S1 B cannot read A messages', r.ok && r.data.length === 0, JSON.stringify(r.data));
r = await req(`/rest/v1/conversations?id=eq.${convA}&select=*`, { token: B });
check('S1 B cannot read A conversation', r.ok && r.data.length === 0, JSON.stringify(r.data));
r = await sendVisitor(B, convA);
check('S1 B cannot write into A conversation', !r.ok, JSON.stringify(r.data));

// --- S3 ---
r = await req('/rest/v1/messages', {
  method: 'POST', token: A,
  body: { conversation_id: convA, sender_type: 'operator', body: 'fake', operator_name: 'Boss' },
});
check('S3 visitor cannot insert operator message', !r.ok, JSON.stringify(r.data));
r = await req('/rest/v1/messages', {
  method: 'POST', token: A,
  body: { conversation_id: convA, sender_type: 'visitor', body: 'x', operator_name: 'Boss' },
});
check('S3 trigger clears operator_name on visitor message', r.ok && r.data[0].operator_name === null, JSON.stringify(r.data));

// --- W5 message rate limit (2 visitor messages so far) ---
for (let i = 0; i < 3; i++) await sendVisitor(A, convA, 'm' + i);
r = await sendVisitor(A, convA, 'too many');
check('W5 6th visitor message in 20s is rejected', !r.ok && JSON.stringify(r.data).includes('rate_limit_exceeded'), JSON.stringify(r.data));

// --- W5 conversation rate limit (3/hour) ---
await startConv(B); await startConv(B); await startConv(B);
r = await startConv(B);
check('W5 4th conversation in an hour is rejected', !r.ok && JSON.stringify(r.data).includes('rate_limit_exceeded'), JSON.stringify(r.data));

// --- Staff ---
const pw = 'Passw0rd!' + stamp;
const adminEmail = `admin${stamp}@test.local`;
const opEmail = `op${stamp}@test.local`;
const strangerEmail = `stranger${stamp}@test.local`;
const adminId = await createUser(adminEmail, pw);
await createUser(opEmail, pw);
await createUser(strangerEmail, pw);
await req('/rest/v1/profiles', { key: SERVICE, method: 'POST', body: { id: adminId, full_name: 'Alice Admin', role: 'admin' } });
const ADM = await login(adminEmail, pw);
const STR = await login(strangerEmail, pw);

r = await rpc('add_staff', { p_email: opEmail, p_full_name: 'Oscar Operator', p_role: 'operator' }, ADM);
check('A8 admin add_staff works', r.ok, JSON.stringify(r.data));
const OP = await login(opEmail, pw);

r = await rpc('add_staff', { p_email: strangerEmail, p_full_name: 'X', p_role: 'admin' }, OP);
check('S5 operator cannot add_staff', !r.ok && JSON.stringify(r.data).includes('forbidden'), JSON.stringify(r.data));
r = await rpc('add_staff', { p_email: 'nobody@test.local', p_full_name: 'X' }, ADM);
check('A8 add_staff unknown email -> user_not_found', !r.ok && JSON.stringify(r.data).includes('user_not_found'), JSON.stringify(r.data));

r = await req('/rest/v1/messages?select=*', { token: STR });
check('A1 signed-up user without profile sees nothing', r.ok && r.data.length === 0, JSON.stringify(r.data));
r = await req(`/rest/v1/conversations?id=eq.${convA}&select=*`, { token: OP });
check('staff can read any conversation', r.ok && r.data.length === 1, JSON.stringify(r.data));

r = await req('/rest/v1/messages', {
  method: 'POST', token: OP,
  body: { conversation_id: convA, sender_type: 'operator', body: 'Hi, how can I help?', operator_name: 'Fake' },
});
check('S3 operator_name comes from profile', r.ok && r.data[0].operator_name === 'Oscar Operator', JSON.stringify(r.data));

r = await req(`/rest/v1/conversations?id=eq.${convA}`, { method: 'DELETE', token: OP });
check('S5 operator cannot delete conversation', r.ok && r.data.length === 0, JSON.stringify(r.data));
r = await req('/rest/v1/widget_settings?id=eq.1', { method: 'PATCH', token: OP, body: { chat_name: 'Hacked' } });
check('S5 operator cannot update widget_settings', r.ok && r.data.length === 0, JSON.stringify(r.data));
r = await req(`/rest/v1/profiles?full_name=eq.Oscar%20Operator`, { method: 'PATCH', token: OP, body: { role: 'admin' } });
check('S5 operator cannot promote self', r.ok && r.data.length === 0, JSON.stringify(r.data));
r = await req('/rest/v1/widget_settings?id=eq.1', { method: 'PATCH', token: ADM, body: { chat_name: 'Chat' } });
check('A9 admin can update widget_settings', r.ok && r.data.length === 1, JSON.stringify(r.data));

r = await req(`/rest/v1/conversations?id=eq.${convA}`, {
  method: 'PATCH', token: OP, body: { status: 'closed' },
});
check('A6 operator can close conversation', r.ok && r.data.length === 1, JSON.stringify(r.data));
await new Promise((res) => setTimeout(res, 21000)); // let the message rate-limit window pass
r = await sendVisitor(A, convA, 'after close');
check('S4 visitor cannot write to closed conversation', !r.ok, JSON.stringify(r.data));

// --- S6 storage ---
const upload = (token, path) =>
  fetch(`${URL_}/storage/v1/object/chat-attachments/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: 'hello',
  });
let s = await upload(B, `${convA}/evil.txt`);
check('S6 B cannot upload into A folder', !s.ok, String(s.status));
s = await upload(A, `${convA}/ok-${stamp}.txt`);
check('S6 A can upload into own folder', s.ok, String(s.status) + ' ' + (await s.text()));
s = await upload(A, `not-a-uuid/x.txt`);
check('S6 upload outside a conversation folder rejected', !s.ok, String(s.status));

r = await req(`/rest/v1/conversations?id=eq.${convA}`, { method: 'DELETE', token: ADM });
check('A7 admin can delete conversation', r.ok && r.data.length === 1, JSON.stringify(r.data));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
