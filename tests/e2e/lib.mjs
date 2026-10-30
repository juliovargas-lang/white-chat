// Shared helpers for the E2E scripts. Local stack only (uses the service_role key).
import puppeteer from 'puppeteer-core';

export const SITE = process.env.SITE_URL || 'http://localhost:8787';
export const SUPA = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
export const ANON = process.env.ANON_KEY;
export const SERVICE = process.env.SERVICE_ROLE_KEY;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
if (!ANON || !SERVICE) throw new Error('Missing ANON_KEY / SERVICE_ROLE_KEY');

let failures = 0;
export const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};
export const finish = () => {
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const launch = () =>
  puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

export async function rest(path, { token, key = ANON, method = 'GET', body } = {}) {
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

// Creates an auth user; with `role`, also a staff profile. Returns { email, password, token }.
export async function makeUser({ fullName = 'Test User', role } = {}) {
  const stamp = Date.now() + Math.random().toString(36).slice(2, 6);
  const email = `e2e-${stamp}@test.local`;
  const password = 'Passw0rd!' + stamp;
  const u = await rest('/auth/v1/admin/users', {
    key: SERVICE, method: 'POST', body: { email, password, email_confirm: true },
  });
  if (role) {
    await rest('/rest/v1/profiles', { key: SERVICE, method: 'POST', body: { id: u.data.id, full_name: fullName, role } });
  }
  const t = await rest('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  return { id: u.data.id, email, password, token: t.data.access_token };
}

// Polls `fn` inside the page until it returns truthy.
export async function waitFor(page, fn, { timeout = 8000, args = [] } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn, ...args).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}

// Runs `fn(root, ...args)` with the widget's shadow root.
export const inWidget = (page, fn, ...args) =>
  page.evaluate((src, ...a) => {
    const root = document.querySelector('#white-chat-root')?.shadowRoot;
    return new Function('root', '...a', `return (${src})(root, ...a)`)(root, ...a);
  }, fn.toString(), ...args);

export async function waitInWidget(page, fn, timeout = 8000, ...args) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await inWidget(page, fn, ...args).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}

// Opens demo.html in `page` and starts a conversation. Returns the conversation id.
export async function startVisitorChat(page, { name, question }) {
  await page.goto(`${SITE}/demo.html`, { waitUntil: 'networkidle0' });
  await waitInWidget(page, (r) => !!r?.querySelector('form.start'));
  await inWidget(page, (r, name, question) => {
    r.querySelector('.bubble').click();
    const f = r.querySelector('form.start');
    f.elements.name.value = name;
    f.elements.phone.value = '555-0000';
    f.elements.dni.value = '30111222';
    f.elements.question.value = question;
    f.requestSubmit();
  }, name, question);
  await waitInWidget(page, (r) => !!r.querySelector('.msg.visitor'));
  return page.evaluate(() => localStorage.getItem('wc-conversation-id'));
}
