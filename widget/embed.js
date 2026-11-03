/*!
 * White Chat — iframe loader for sites with a strict Content Security Policy.
 *
 * The whole chat runs inside an <iframe> served from GitHub Pages, so its calls
 * to Supabase are governed by GitHub Pages' CSP (none), not the host page's.
 * The host page only needs to allow framing that origin (frame-src) and loading
 * this script (script-src). No connect-src / img-src change is required.
 *
 *   <script src=".../web/widget/embed.js" data-skin="dark" defer></script>
 *
 * Optional override: data-frame="https://your-pages-url/widget/frame.html"
 * Look (forwarded to the iframe): data-skin, data-primary-color, data-secondary-color, data-chat-name
 */
(function () {
  'use strict';

  var DEFAULT_FRAME = 'https://juliovargas-lang.github.io/white-chat/widget/frame.html';

  var me = document.currentScript
    || (function () { var s = document.getElementsByTagName('script'); return s[s.length - 1]; })();
  var FRAME_SRC = (me && me.getAttribute('data-frame')) || DEFAULT_FRAME;

  // The widget's look lives on the injector; forward the look attributes that are
  // present to frame.html as query params, which re-applies them to chat-widget.js.
  var url = new URL(FRAME_SRC, location.href);
  ['skin', 'primary-color', 'secondary-color', 'chat-name'].forEach(function (name) {
    var v = me && me.getAttribute('data-' + name);
    if (v) url.searchParams.set(name, v);
  });
  var FRAME_URL = url.href;
  var FRAME_ORIGIN = url.origin;

  if (document.getElementById('white-chat-frame')) return; // avoid double-inject

  var iframe = document.createElement('iframe');
  iframe.id = 'white-chat-frame';
  iframe.title = 'Chat';
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.src = FRAME_URL;

  var s = iframe.style;
  s.position = 'fixed';
  s.right = '0';
  s.bottom = '0';
  s.width = '96px';
  s.height = '96px';
  s.maxWidth = '100vw';
  s.maxHeight = '100vh';
  s.border = '0';
  s.background = 'transparent';
  s.colorScheme = 'normal';
  s.zIndex = '2147483000';
  s.transition = 'width .18s ease, height .18s ease';

  var isOpen = false;

  function applySize() {
    if (!isOpen) { s.width = '96px'; s.height = '96px'; return; }
    if (window.innerWidth < 480) {
      s.width = '100vw';
      s.height = '100vh';
    } else {
      s.width = '400px';
      s.height = Math.min(660, window.innerHeight) + 'px';
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== FRAME_ORIGIN) return;
    var d = e.data || {};
    if (d.source !== 'white-chat') return;
    if (d.type === 'state') {
      isOpen = !!d.open;
      applySize();
    }
  });

  window.addEventListener('resize', applySize);

  function mount() {
    if (!document.getElementById('white-chat-frame')) document.body.appendChild(iframe);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
