// E2E for the admin panel (SPEC A1–A7, A11; W3/W6 end to end). Local stack only.
// Run (from repo root, with web/ served on 8787):
//   node tests/e2e/admin.mjs   (local stack keys by default)
import {
  check, finish, sleep, rest, makeUser, launch, waitFor, inWidget, waitInWidget, startVisitorChat, SITE,
} from './lib.mjs';

async function login(page, { email, password }) {
  await page.goto(`${SITE}/admin/index.html`, { waitUntil: 'networkidle0' });
  await page.type('input[name=email]', email);
  await page.type('input[name=password]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
    page.click('button[type=submit]'),
  ]);
}

const listHas = (page, text) =>
  waitFor(page, (t) => [...document.querySelectorAll('.conv-item')].some((li) => li.textContent.includes(t)), { args: [text] });

const browser = await launch();
try {
  const opUser = await makeUser({ fullName: 'Oscar Operator', role: 'operator' });
  const adminUser = await makeUser({ fullName: 'Alice Admin', role: 'admin' });
  const stranger = await makeUser();

  // A1: user without profile
  const strangerCtx = await browser.createBrowserContext();
  const sp = await strangerCtx.newPage();
  await login(sp, stranger);
  check('A1 user without profile sees "Not authorized"',
    await waitFor(sp, () => document.getElementById('login-error')?.textContent.includes('Not authorized')));
  check('A1 user without profile stays on login', sp.url().includes('/admin/index.html'), sp.url());

  // A1: operator login
  const opCtx = await browser.createBrowserContext();
  const op = await opCtx.newPage();
  op.on('dialog', (d) => d.accept());
  op.on('pageerror', (e) => console.log('admin pageerror:', e.message));
  await login(op, opUser);
  check('A1 operator lands on conversations', op.url().includes('conversations.html'), op.url());
  check('A11 texts rendered from text.js', await waitFor(op, () =>
    document.querySelector('[data-text="filterOpen"]').textContent === 'Open'));
  check('operator does not see Settings link', await op.evaluate(() =>
    document.querySelector('a[href="admin.html"]').hidden));
  await sleep(1000); // realtime join

  // A2: new conversation shows up in realtime
  const visitorCtx = await browser.createBrowserContext();
  const visitor = await visitorCtx.newPage();
  const name = 'Vera Visitor ' + Date.now();
  const convId = await startVisitorChat(visitor, { name, question: 'My package never arrived' });
  check('A2 new conversation appears in realtime', await listHas(op, name));

  // A3/A4: open it
  await op.evaluate((n) => [...document.querySelectorAll('.conv-item')].find((li) => li.textContent.includes(n)).click(), name);
  check('A3 history shows initial question', await waitFor(op, () =>
    [...document.querySelectorAll('.msg.from-visitor')].some((m) => m.textContent.includes('My package never arrived'))));
  check('A4 visitor details shown', await waitFor(op, () =>
    document.querySelector('[data-field=visitor_phone]').textContent === '555-0000'
    && document.querySelector('[data-field=visitor_dni]').textContent === '30111222'));
  check('A7 operator does not see Delete', await op.evaluate(() => document.getElementById('btn-delete').hidden));

  // A3: reply reaches widget
  await op.type('#composer textarea', 'We are checking it right now');
  await op.click('#composer button');
  check('A3/W3 reply reaches widget with operator name', await waitInWidget(visitor, (r) =>
    [...r.querySelectorAll('.msg.operator')].some((m) =>
      m.textContent.includes('We are checking it right now') && m.textContent.includes('Oscar Operator'))));

  // Visitor -> admin realtime
  await inWidget(visitor, (r) => {
    r.querySelector('.footer textarea').value = 'Thanks!';
    r.querySelector('.footer .btn').click();
  });
  check('A3 visitor message arrives in admin realtime', await waitFor(op, () =>
    [...document.querySelectorAll('.msg.from-visitor')].some((m) => m.textContent.includes('Thanks!'))));

  // A5: take
  await op.click('#btn-take');
  check('A5 take assigns conversation to me', await waitFor(op, () =>
    document.getElementById('chat-assigned').textContent.includes('Oscar Operator')));
  check('A5 list shows assignee', await waitFor(op, (n) =>
    [...document.querySelectorAll('.conv-item')].some((li) => li.textContent.includes(n) && li.textContent.includes('Oscar Operator')),
  { args: [name] }));

  // A6: close
  await op.click('#btn-close');
  check('A6 admin shows closed state', await waitFor(op, () =>
    !document.getElementById('chat-closed').hidden && document.getElementById('composer').hidden));
  check('A6/W6 widget shows closed state', await waitInWidget(visitor, (r) => r.querySelector('.closed').offsetParent !== null));

  // A7: admin deletes
  const adminCtx = await browser.createBrowserContext();
  const adm = await adminCtx.newPage();
  adm.on('dialog', (d) => d.accept());
  await login(adm, adminUser);
  check('admin sees Settings link', await waitFor(adm, () => !document.querySelector('a[href="admin.html"]').hidden));
  await adm.click('[data-filter=closed]');
  check('A2 closed filter lists the conversation', await listHas(adm, name));
  await adm.evaluate((n) => [...document.querySelectorAll('.conv-item')].find((li) => li.textContent.includes(n)).click(), name);
  await waitFor(adm, () => !document.getElementById('btn-delete').hidden);
  await adm.click('#btn-delete');
  check('A7 admin can delete conversation', await waitFor(adm, (n) =>
    ![...document.querySelectorAll('.conv-item')].some((li) => li.textContent.includes(n)), { args: [name] }));
  const gone = await rest(`/rest/v1/conversations?id=eq.${convId}&select=id`, { token: adminUser.token });
  check('A7 conversation removed from DB', gone.ok && gone.data.length === 0, JSON.stringify(gone.data));
} finally {
  await browser.close();
}

finish();
