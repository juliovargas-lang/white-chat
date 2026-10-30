// E2E for the widget (SPEC W1–W7, W9) with headless Chrome. Local stack only.
// Setup: cd tests/e2e && npm install
// Run:   python3 -m http.server -d web 8787 &   (from repo root)
//        ANON_KEY=... SERVICE_ROLE_KEY=... node tests/e2e/widget.mjs
import { check, finish, sleep, rest, makeUser, launch, inWidget, waitInWidget, SITE } from './lib.mjs';

const browser = await launch();
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
  const { token: OP } = await makeUser({ fullName: 'Olivia Operator', role: 'operator' });
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

finish();
