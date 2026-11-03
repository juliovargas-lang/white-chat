// E2E for admin.html (SPEC A8, A9, S5). Local stack only.
// Run (from repo root, with web/ served on 8787):
//   node tests/e2e/settings.mjs   (local stack keys by default)
import { check, finish, rest, makeUser, launch, waitFor, inWidget, waitInWidget, SITE, SERVICE } from './lib.mjs';

async function login(page, { email, password }) {
  await page.goto(`${SITE}/admin/index.html`, { waitUntil: 'networkidle0' });
  await page.type('input[name=email]', email);
  await page.type('input[name=password]', password);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type=submit]')]);
}

const setValue = (page, selector, value) =>
  page.evaluate((s, v) => {
    const input = document.querySelector(s);
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector, value);

const original = (await rest('/rest/v1/widget_settings?id=eq.1&select=*')).data[0];
const browser = await launch();
try {
  const opUser = await makeUser({ fullName: 'Oscar Operator', role: 'operator' });
  const adminUser = await makeUser({ fullName: 'Alice Admin', role: 'admin' });
  const newcomer = await makeUser(); // exists in Auth, no profile yet

  // S5: operator is redirected away
  const op = await (await browser.createBrowserContext()).newPage();
  await login(op, opUser);
  await op.goto(`${SITE}/admin/admin.html`);
  check('S5 operator redirected from admin.html', await waitFor(op, () => location.pathname.endsWith('conversations.html')));

  const adm = await (await browser.createBrowserContext()).newPage();
  adm.on('dialog', (d) => d.accept());
  adm.on('pageerror', (e) => console.log('admin pageerror:', e.message));
  await login(adm, adminUser);
  await adm.goto(`${SITE}/admin/admin.html`, { waitUntil: 'networkidle0' });
  check('admin can open admin.html', adm.url().endsWith('admin.html'), adm.url());

  // A9 branding
  check('A9 form loads current settings', await waitFor(adm, (n) =>
    document.querySelector('[name=chat_name]').value === n, { args: [original.chat_name] }));
  await setValue(adm, '[name=chat_name]', 'Acme Support');
  await setValue(adm, '[name=primary_color]', '#ff5500');
  check('A9 preview updates live', await adm.evaluate(() =>
    document.getElementById('branding-preview').textContent === 'Acme Support'));
  await adm.click('#branding-form button[type=submit]');
  check('A9 save confirms', await waitFor(adm, () => !document.getElementById('branding-ok').hidden));

  const visitor = await (await browser.createBrowserContext()).newPage();
  await visitor.goto(`${SITE}/demo.html`, { waitUntil: 'networkidle0' });
  check('A9 widget shows new chat name', await waitInWidget(visitor, (r) => r?.querySelector('.title')?.textContent === 'Acme Support'));
  // The look now comes from the skin (data-skin), not widget_settings: the saved
  // primary_color (#ff5500) must be ignored; the default classic skin stays blue.
  const bg = await inWidget(visitor, (r) => getComputedStyle(r.querySelector('.bubble')).backgroundColor);
  check('A9 widget ignores widget_settings color (skin drives the look)', bg === 'rgb(58, 99, 255)', bg);

  // A8 staff
  await adm.type('#grant-form [name=email]', 'nobody-here@test.local');
  await adm.type('#grant-form [name=full_name]', 'Nobody');
  await adm.click('#grant-form button[type=submit]');
  check('A8 unknown email shows readable error', await waitFor(adm, () =>
    document.getElementById('grant-error').textContent.includes('No user with that email')));

  await adm.evaluate(() => document.getElementById('grant-form').reset());
  await adm.type('#grant-form [name=email]', newcomer.email);
  await adm.type('#grant-form [name=full_name]', 'Nina Newcomer');
  await adm.click('#grant-form button[type=submit]');
  check('A8 grant access adds row', await waitFor(adm, () =>
    [...document.querySelectorAll('#staff-rows tr')].some((tr) => tr.textContent.includes('Nina Newcomer'))));

  const nina = await (await browser.createBrowserContext()).newPage();
  await login(nina, newcomer);
  check('A8 staff table shows email', await adm.evaluate((e) =>
    [...document.querySelectorAll('#staff-rows tr')].some((tr) => tr.textContent.includes(e)), newcomer.email));
  check('A8 granted user can log in as operator', nina.url().includes('conversations.html'), nina.url());

  await adm.evaluate(() => {
    const tr = [...document.querySelectorAll('#staff-rows tr')].find((t) => t.textContent.includes('Nina Newcomer'));
    const select = tr.querySelector('select');
    select.value = 'admin';
    select.dispatchEvent(new Event('change'));
  });
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    const r = await rest(`/rest/v1/profiles?id=eq.${newcomer.id}&select=role`, { key: SERVICE });
    ok = r.data?.[0]?.role === 'admin';
    if (!ok) await new Promise((res) => setTimeout(res, 200));
  }
  check('A8 change role persists', ok);

  check('A8 own role select is disabled', await adm.evaluate(() =>
    [...document.querySelectorAll('#staff-rows tr')].find((t) => t.textContent.includes('(you)')).querySelector('select').disabled));

  await adm.evaluate(() => {
    const tr = [...document.querySelectorAll('#staff-rows tr')].find((t) => t.textContent.includes('Nina Newcomer'));
    tr.querySelector('button').click();
  });
  check('A8 remove access removes row', await waitFor(adm, () =>
    ![...document.querySelectorAll('#staff-rows tr')].some((tr) => tr.textContent.includes('Nina Newcomer'))));
} finally {
  await rest('/rest/v1/widget_settings?id=eq.1', {
    key: SERVICE, method: 'PATCH',
    body: { chat_name: original.chat_name, primary_color: original.primary_color, secondary_color: original.secondary_color },
  });
  await browser.close();
}

finish();
