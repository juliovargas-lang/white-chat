// E2E for widget skins (data-skin on the injector). Local stack only.
// Checks the 4 skins render as distinct designs, the fallback, the inline color
// override, and that embed.js forwards the skin into the iframe.
//   node tests/e2e/skins.mjs
import { check, finish, sleep, launch, SITE, inWidget, waitInWidget } from './lib.mjs';

// Opens the panel (so computed styles resolve on visible nodes) and reads the look.
const LOOK = (r) => {
  if (r.querySelector('.panel').hidden) r.querySelector('.bubble').click();
  const bg = (sel) => getComputedStyle(r.querySelector(sel)).backgroundColor;
  return {
    skin: r.host.dataset.skin,
    panelBg: bg('.panel'),
    bodyBg: bg('.body'),
    bubbleBg: bg('.bubble'),
  };
};

async function look(page, query) {
  await page.goto(`${SITE}/demo.html${query}`, { waitUntil: 'networkidle0' });
  await waitInWidget(page, (r) => !!r?.querySelector('.bubble'));
  return inWidget(page, LOOK);
}

const EXPECTED = {
  classic: 'rgb(58, 99, 255)',
  dark: 'rgb(16, 185, 129)',
  minimal: 'rgb(17, 17, 17)',
  soft: 'rgb(255, 107, 87)',
};

const browser = await launch();
try {
  const page = await browser.newPage();

  // Each skin: host carries data-skin and the bubble uses that skin's accent.
  const looks = {};
  for (const skin of Object.keys(EXPECTED)) {
    const l = await look(page, `?skin=${skin}`);
    looks[skin] = l;
    check(`${skin}: host[data-skin="${skin}"]`, l.skin === skin, l.skin);
    check(`${skin}: bubble uses the skin accent`, l.bubbleBg === EXPECTED[skin], l.bubbleBg);
  }

  // The skins must be visually distinct, not the same design recolored.
  const fingerprints = new Set(
    Object.values(looks).map((l) => `${l.panelBg}/${l.bodyBg}/${l.bubbleBg}`));
  check('the 4 skins are all visually distinct', fingerprints.size === 4, [...fingerprints].join('  '));

  // Unknown skin falls back to classic.
  const bogus = await look(page, '?skin=does-not-exist');
  check('unknown skin falls back to classic', bogus.skin === 'classic', bogus.skin);
  check('fallback uses the classic accent', bogus.bubbleBg === EXPECTED.classic, bogus.bubbleBg);

  // data-primary-color overrides the skin palette.
  const overridden = await look(page, '?skin=dark&primary-color=%23ff0000');
  check('data-primary-color overrides the skin accent', overridden.bubbleBg === 'rgb(255, 0, 0)', overridden.bubbleBg);
  check('override keeps the skin for everything else', overridden.skin === 'dark', overridden.skin);

  // embed.js forwards data-skin into the iframe.
  await page.goto(`${SITE}/demo.html`, { waitUntil: 'networkidle0' });
  await page.evaluate((frame) => {
    const s = document.createElement('script');
    s.src = '/widget/embed.js';
    s.setAttribute('data-frame', frame);
    s.setAttribute('data-skin', 'dark');
    document.body.appendChild(s);
  }, `${SITE}/widget/frame.html`);

  let frame = null;
  for (let i = 0; i < 40 && !frame; i++) {
    frame = page.frames().find((f) => f.url().includes('/widget/frame.html'));
    if (!frame) await sleep(200);
  }
  check('embed.js mounts the iframe', !!frame);

  const sh = (fn) => `(${fn.toString()})(document.querySelector('#white-chat-root').shadowRoot)`;
  let framed = null;
  for (let i = 0; i < 40 && !framed; i++) {
    framed = await frame.evaluate(sh(LOOK)).catch(() => null);
    if (!framed) await sleep(200);
  }
  check('iframe widget gets host[data-skin="dark"]', framed && framed.skin === 'dark', framed && framed.skin);
  check('iframe widget uses the dark accent', framed && framed.bubbleBg === EXPECTED.dark, framed && framed.bubbleBg);
} finally {
  await browser.close();
}

finish();
