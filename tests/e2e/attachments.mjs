// E2E for attachments (SPEC W8, A10). Local stack only.
// Run (from repo root, with web/ served on 8787): node tests/e2e/attachments.mjs
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  check, finish, sleep, rest, makeUser, launch, waitFor, waitInWidget, startVisitorChat, SITE,
} from './lib.mjs';

// Test files
const dir = mkdtempSync(join(tmpdir(), 'wc-files-'));
const png = join(dir, 'photo.png');
writeFileSync(png, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const pdf = join(dir, 'invoice report.pdf');
writeFileSync(pdf, '%PDF-1.4\n% fake pdf for tests\n');
const big = join(dir, 'big.bin');
writeFileSync(big, Buffer.alloc(31 * 1024 * 1024));

const widgetFileInput = (page) =>
  page.evaluateHandle(() => document.querySelector('#white-chat-root').shadowRoot.querySelector('input[type=file]'));

const browser = await launch();
try {
  const opUser = await makeUser({ fullName: 'Oscar Operator', role: 'operator' });

  const visitor = await (await browser.createBrowserContext()).newPage();
  visitor.on('pageerror', (e) => console.log('widget pageerror:', e.message));
  const name = 'Files Visitor ' + Date.now();
  await startVisitorChat(visitor, { name, question: 'I will send you a photo' });

  const op = await (await browser.createBrowserContext()).newPage();
  op.on('pageerror', (e) => console.log('admin pageerror:', e.message));
  await op.goto(`${SITE}/admin/index.html`, { waitUntil: 'networkidle0' });
  await op.type('input[name=email]', opUser.email);
  await op.type('input[name=password]', opUser.password);
  await Promise.all([op.waitForNavigation({ waitUntil: 'networkidle0' }), op.click('button[type=submit]')]);
  await waitFor(op, (n) => [...document.querySelectorAll('.conv-item')].some((li) => li.textContent.includes(n)), { args: [name] });
  await op.evaluate((n) => [...document.querySelectorAll('.conv-item')].find((li) => li.textContent.includes(n)).click(), name);
  await waitFor(op, () => document.querySelectorAll('.msg').length >= 1);
  await sleep(800);

  // W8: visitor sends an image
  await (await widgetFileInput(visitor)).uploadFile(png);
  check('W8 widget renders sent image', await waitInWidget(visitor, (r) => !!r.querySelector('.msg.visitor img.img'), 10000));
  check('A10 admin receives image in realtime', await waitFor(op, () => !!document.querySelector('.msg.from-visitor img.img'), { timeout: 10000 }));
  const imgOk = await waitFor(op, () => {
    const img = document.querySelector('.msg.from-visitor img.img');
    return img && img.complete && img.naturalWidth > 0;
  });
  check('A10 image is publicly loadable', imgOk);

  // A10: operator sends a PDF
  await (await op.$('#file-input')).uploadFile(pdf);
  check('A10 admin renders sent file link', await waitFor(op, () =>
    [...document.querySelectorAll('.msg.from-operator a.file')].some((a) => a.textContent.includes('invoice report.pdf')), { timeout: 10000 }));
  check('W8 widget receives file link with name and size', await waitInWidget(visitor, (r) =>
    [...r.querySelectorAll('.msg.operator a.file')].some((a) => a.textContent.includes('invoice report.pdf') && /\d+ B\)/.test(a.textContent)), 10000));

  // W8: > 30 MB rejected client-side
  await (await widgetFileInput(visitor)).uploadFile(big);
  check('W8 files > 30MB rejected with notice', await waitInWidget(visitor, (r) =>
    r.querySelector('.body .notice:not([hidden])')?.textContent.includes('too large')));

  // Security: a forged attachment_url must not become a link
  const token = await visitor.evaluate(() => JSON.parse(localStorage.getItem('wc-auth')).access_token);
  const convId = await visitor.evaluate(() => localStorage.getItem('wc-conversation-id'));
  await sleep(1000);
  await rest('/rest/v1/messages', {
    method: 'POST', token,
    body: { conversation_id: convId, sender_type: 'visitor', body: 'forged', attachment_url: 'javascript:alert(1)', attachment_name: 'x' },
  });
  const forgedSafe = await waitFor(op, () => {
    const msg = [...document.querySelectorAll('.msg.from-visitor')].find((m) => m.textContent.includes('forged'));
    return msg && !msg.querySelector('a');
  });
  check('A10 forged attachment_url is not rendered as a link', forgedSafe);
} finally {
  await browser.close();
}

finish();
