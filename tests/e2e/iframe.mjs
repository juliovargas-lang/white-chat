// E2E for the iframe embed under a strict host CSP (connect-src blocks Supabase).
// Proves the chat works because it runs inside the iframe. Local stack only.
//   node tests/e2e/iframe.mjs
import { check, finish, sleep, launch, SITE } from './lib.mjs';

const sh = (fn) =>
  `(${fn.toString()})(document.querySelector('#white-chat-root').shadowRoot)`;

const browser = await launch();
try {
  const page = await browser.newPage();
  const violations = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await page.goto(`${SITE}/demo-csp.html`, { waitUntil: 'networkidle0' });

  // The host CSP allows framing the widget origin, so the iframe must mount.
  await page.waitForSelector('#white-chat-frame', { timeout: 8000 });
  check('iframe mounts under strict host CSP', true);

  const closedW = await page.$eval('#white-chat-frame', (el) => el.getBoundingClientRect().width);
  check('iframe starts collapsed (bubble only)', closedW < 120, String(closedW));

  // Find the widget document inside the iframe.
  let frame = null;
  for (let i = 0; i < 40 && !frame; i++) {
    frame = page.frames().find((f) => f.url().includes('/widget/frame.html'));
    if (!frame) await sleep(200);
  }
  check('frame document loaded', !!frame);
  const hasBubble = await (async () => {
    for (let i = 0; i < 40; i++) {
      const ok = await frame.evaluate(sh((r) => !!(r && r.querySelector('.bubble')))).catch(() => false);
      if (ok) return true;
      await sleep(200);
    }
    return false;
  })();
  check('widget renders inside the iframe', hasBubble);

  // Open the panel -> frame posts state -> parent enlarges the iframe.
  await frame.evaluate(sh((r) => r.querySelector('.bubble').click()));
  let openW = 0;
  for (let i = 0; i < 25; i++) {
    openW = await page.$eval('#white-chat-frame', (el) => el.getBoundingClientRect().width);
    if (openW > 300) break;
    await sleep(200);
  }
  check('iframe expands when the panel opens (resize via postMessage)', openW > 300, String(openW));

  // Start a conversation: this connects to Supabase FROM INSIDE the iframe,
  // which the host page's connect-src would otherwise block.
  await frame.evaluate(sh((r) => {
    const f = r.querySelector('form.start');
    f.elements.name.value = 'CSP Tester';
    f.elements.phone.value = '555-9000';
    f.elements.dni.value = '77001122';
    f.elements.question.value = 'Does this work behind a strict CSP?';
    f.requestSubmit();
  }));

  const sent = await (async () => {
    for (let i = 0; i < 40; i++) {
      const ok = await frame.evaluate(sh((r) =>
        r.querySelector('.msg.visitor .text')?.textContent === 'Does this work behind a strict CSP?')).catch(() => false);
      if (ok) return true;
      await sleep(250);
    }
    return false;
  })();
  check('conversation starts THROUGH the iframe despite the host CSP', sent);

  check('no CSP violation from the widget on the host page', violations.length === 0, violations[0] || '');
} finally {
  await browser.close();
}

finish();
