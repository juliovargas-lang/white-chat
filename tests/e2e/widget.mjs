// E2E for the widget (SPEC W1–W7, W9) with headless Chrome. Local stack only.
// Setup: cd tests/e2e && npm install
// Run:   python3 -m http.server -d web 8787 &   (from repo root)
//        ANON_KEY=... SERVICE_ROLE_KEY=... node tests/e2e/widget.mjs
import puppeteer from 'puppeteer-core';

const SITE = process.env.SITE_URL || 'http://localhost:8787';
const SUPA = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.ANON_KEY;
const SERVICE = process.env.SERVICE_ROLE_KEY;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
if (!ANON || !SERVICE) throw new Error('Missing ANON_KEY / SERVICE_ROLE_KEY');

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(path, { token, key = ANON, method = 'GET', body } = {}) {
  const res = await fetch(SUPA + path, {
    method,
    headers: {
      apikey: key, Authorization: `Bearer ${token || key}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: body && JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json().catch(() => null) };
}

async function makeOperator() {
  const stamp = Date.now();
  const email = `e2e-op${stamp}@test.local`;
  const password = 'Passw0rd!' + stamp;
  const u = await rest('/auth/v1/admin/users', { key: SERVICE, method: 'POST', body: { email, password, email_confirm: true } });
  await rest('/rest/v1/profiles', { key: SERVICE, method: 'POST', body: { id: u.data.id, full_name: 'Olivia Operator', role: 'operator' } });
  const t = await rest('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  return t.data.access_token;
}

// Run a function inside the widget's shadow root.
const inWidget = (page, fn, ...args) =>
  page.evaluate((src, ...a) => {
    const root = document.querySelector('#white-chat-root')?.shadowRoot;
    return new Function('root', '...a', `return (${src})(root, ...a)`)(root, ...a);
  }, fn.toString(), ...args);

async function waitInWidget(page, fn, timeout = 8000, ...args) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await inWidget(page, fn, ...args).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`${SITE}/demo.html`, { waitUntil: 'networkidle0' });

  // W1
  check('W1 widget mounts in shadow DOM', await waitInWidget(page, (r) => !!r?.querySelector('.bubble')));
  const bubbleBg = await inWidget(page, (r) => getComputedStyle(r.querySelector('.bubble')).backgroundColor);
  check('W1 host CSS does not leak into widget', bubbleBg !== 'rgb(255, 255, 0)', bubbleBg);

  // W7 / W9
  const settings = (await rest('/rest/v1/widget_settings?id=eq.1&select=*')).data[0];
  const title = await inWidget(page, (r) => r.querySelector('.title').textContent);
  check('W7 header shows chat_name from settings', title === settings.chat_name, title);
  const formText = await inWidget(page, (r) => r.querySelector('form.start').textContent);
  check('W9 form texts in English', formText.includes('How can we help you?') && formText.includes('ID number'), formText);

  // W2
  await inWidget(page, (r) => r.querySelector('.bubble').click());
  await inWidget(page, (r) => {
    const f = r.querySelector('form.start');
    const set = (n, v) => { f.elements[n].value = v; };
    set('name', 'Visitor E2E'); set('phone', '555-1234'); set('dni', '12345678'); set('question', 'I need help with my order');
    f.requestSubmit();
  });
  check('W2 initial question shown as first message',
    await waitInWidget(page, (r) => r.querySelector('.msg.visitor .text')?.textContent === 'I need help with my order'));
  const closedVisible = await inWidget(page, (r) => r.querySelector('.closed').offsetParent !== null);
  check('W6 closed notice not visible on an open conversation', !closedVisible);
  const convId = await page.evaluate(() => localStorage.getItem('wc-conversation-id'));
  check('W2 conversation id stored', !!convId, String(convId));

  // W3 realtime operator message
  await sleep(1000); // let the realtime channel join
  const OP = await makeOperator();
  await rest('/rest/v1/messages', { method: 'POST', token: OP, body: { conversation_id: convId, sender_type: 'operator', body: 'Hello from support' } });
  check('W3 operator message arrives in realtime',
    await waitInWidget(page, (r) => [...r.querySelectorAll('.msg.operator')].some((m) => m.textContent.includes('Hello from support'))));
  const who = await inWidget(page, (r) => r.querySelector('.msg.operator .who')?.textContent);
  check('W3 operator name shown', who === 'Olivia Operator', who);

  // W4 persistence
  await page.reload({ waitUntil: 'networkidle0' });
  check('W4 history persists after reload',
    await waitInWidget(page, (r) => r.querySelectorAll('.msg').length >= 2));
  await inWidget(page, (r) => r.querySelector('.bubble').click());

  // W5 rate limit (1 visitor message already sent)
  for (let i = 0; i < 5; i++) {
    await waitInWidget(page, (r) => !r.querySelector('.footer .btn').disabled, 3000);
    await inWidget(page, (r, i) => {
      r.querySelector('.footer textarea').value = 'spam ' + i;
      r.querySelector('.footer .btn').click();
    }, i);
  }
  check('W5 rate limit notice shown',
    await waitInWidget(page, (r) => r.querySelector('.body .notice:not([hidden])')?.textContent.includes('too fast')));
  check('W5 input disabled during cooldown', await inWidget(page, (r) => r.querySelector('.footer textarea').disabled));

  // W6 closed
  await rest(`/rest/v1/conversations?id=eq.${convId}`, { method: 'PATCH', token: OP, body: { status: 'closed' } });
  check('W6 closed notice shown in realtime',
    await waitInWidget(page, (r) => r.querySelector('.closed').offsetParent !== null && r.querySelector('.footer').offsetParent === null));
  await inWidget(page, (r) => r.querySelector('.closed .btn').click());
  check('W6 "Start new chat" goes back to the form', await waitInWidget(page, (r) => !!r.querySelector('form.start')));
  check('W6 stored conversation cleared', !(await page.evaluate(() => localStorage.getItem('wc-conversation-id'))));
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
