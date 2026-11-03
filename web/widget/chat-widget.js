/*!
 * White Chat widget — embeddable live chat backed by Supabase.
 *
 * <script src=".../widget/chat-widget.js"
 *         data-supabase-url="https://xxx.supabase.co"
 *         data-supabase-key="ANON_KEY" defer></script>
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // All user-visible texts. Edit here to change the widget copy.
  // ---------------------------------------------------------------------------
  const TEXT = {
    defaultTitle: 'Chat',
    openButton: 'Open chat',
    closeButton: 'Close chat',
    formIntro: 'Hi! Please tell us a bit about you to start the chat.',
    nameLabel: 'Name',
    phoneLabel: 'Phone',
    dniLabel: 'ID number',
    questionLabel: 'How can we help you?',
    startButton: 'Start chat',
    starting: 'Starting…',
    requiredFields: 'Please fill in all the fields.',
    inputPlaceholder: 'Write a message…',
    sendButton: 'Send',
    you: 'You',
    operatorFallback: 'Support',
    rateLimited: "You're sending messages too fast. Please wait a few seconds.",
    tooManyChats: "You've started too many chats. Please try again later.",
    chatClosed: 'This conversation has been closed.',
    newChat: 'Start new chat',
    genericError: 'Something went wrong. Please try again.',
    loadError: 'The chat could not be loaded.',
    attachButton: 'Attach a file',
    uploading: 'Uploading…',
    fileTooLarge: 'The file is too large (max. 30 MB).',
  };

  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const LS_CONVERSATION = 'wc-conversation-id';
  const RATE_LIMIT_COOLDOWN_MS = 5000;
  const MAX_FILE_BYTES = 30 * 1024 * 1024;
  const BUCKET = 'chat-attachments';

  // The look comes only from the injector (data-* on the script tag), not from
  // widget_settings. A skin is a complete design: palette + shape. Add one by
  // adding a :host([data-skin="<name>"]) block of variables in CSS below.
  const SKINS = ['classic', 'dark', 'minimal', 'soft'];
  const DEFAULT_SKIN = 'classic';

  // Must be read synchronously, before any await.
  const script = document.currentScript;
  const SUPABASE_URL = script && script.dataset.supabaseUrl;
  const SUPABASE_KEY = script && script.dataset.supabaseKey;
  const SKIN = (script && SKINS.includes(script.dataset.skin) && script.dataset.skin) || DEFAULT_SKIN;
  const PRIMARY_COLOR = script && script.dataset.primaryColor;     // optional override of the skin palette
  const SECONDARY_COLOR = script && script.dataset.secondaryColor; // optional override of the skin palette
  const CHAT_NAME = script && script.dataset.chatName;             // optional title override (content, not look)
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[white-chat] Missing data-supabase-url or data-supabase-key on the script tag.');
    return;
  }

  // Every color / radius / shadow / font is a CSS custom property so a skin is
  // just a block of variable values. The :host defaults are the "classic" skin;
  // each :host([data-skin="…"]) block overrides the palette and shape.
  const CSS = `
    :host {
      all: initial;
      --wc-primary: #3a63ff;
      --wc-secondary: #ffffff;
      --wc-surface: #ffffff;
      --wc-surface-2: #f6f7f9;
      --wc-text: #1f2328;
      --wc-muted: #656d76;
      --wc-border: #e3e6ea;
      --wc-op-bubble-bg: #ffffff;
      --wc-radius: 12px;
      --wc-bubble-radius: 50%;
      --wc-msg-radius: 12px;
      --wc-msg-tail: 4px;
      --wc-shadow: 0 8px 32px rgba(0,0,0,.25);
      --wc-bubble-shadow: 0 4px 16px rgba(0,0,0,.25);
      --wc-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    /* classic: the default light theme (matches :host defaults; here for clarity). */
    :host([data-skin="dark"]) {
      --wc-primary: #10b981;
      --wc-secondary: #ffffff;
      --wc-surface: #1e293b;
      --wc-surface-2: #0f172a;
      --wc-text: #e2e8f0;
      --wc-muted: #94a3b8;
      --wc-border: #334155;
      --wc-op-bubble-bg: #1e293b;
      --wc-radius: 14px;
      --wc-shadow: 0 8px 32px rgba(0,0,0,.5);
      --wc-bubble-shadow: 0 0 0 1px rgba(16,185,129,.4), 0 4px 20px rgba(16,185,129,.45);
    }
    :host([data-skin="minimal"]) {
      --wc-primary: #111111;
      --wc-secondary: #ffffff;
      --wc-surface: #ffffff;
      --wc-surface-2: #ffffff;
      --wc-text: #111111;
      --wc-muted: #888888;
      --wc-border: #e5e5e5;
      --wc-op-bubble-bg: #ffffff;
      --wc-radius: 4px;
      --wc-bubble-radius: 8px;
      --wc-msg-radius: 6px;
      --wc-msg-tail: 6px;
      --wc-shadow: none;
      --wc-bubble-shadow: none;
    }
    :host([data-skin="soft"]) {
      --wc-primary: #ff6b57;
      --wc-secondary: #ffffff;
      --wc-surface: #ffffff;
      --wc-surface-2: #fff7f2;
      --wc-text: #4a3f3a;
      --wc-muted: #a08d84;
      --wc-border: #f3ddd2;
      --wc-op-bubble-bg: #ffffff;
      --wc-radius: 20px;
      --wc-bubble-radius: 50%;
      --wc-msg-radius: 18px;
      --wc-msg-tail: 18px;
      --wc-shadow: 0 12px 40px rgba(255,107,87,.28);
      --wc-bubble-shadow: 0 8px 24px rgba(255,107,87,.4);
      --wc-font: ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Quicksand", system-ui, sans-serif;
    }
    /* minimal is flat: a hairline border replaces the panel shadow so it stays visible on white. */
    :host([data-skin="minimal"]) .panel { border: 1px solid var(--wc-border); }

    [hidden] { display: none !important; }
    * {
      box-sizing: border-box; font-family: var(--wc-font);
      letter-spacing: normal; text-transform: none;
    }
    .bubble {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
      width: 56px; height: 56px; border-radius: var(--wc-bubble-radius); border: none; cursor: pointer;
      background: var(--wc-primary); color: var(--wc-secondary);
      box-shadow: var(--wc-bubble-shadow); display: flex; align-items: center; justify-content: center;
    }
    .bubble svg { width: 26px; height: 26px; fill: currentColor; }
    .panel {
      position: fixed; right: 20px; bottom: 88px; z-index: 2147483000;
      width: 360px; max-width: calc(100vw - 40px); height: 520px; max-height: calc(100vh - 120px);
      background: var(--wc-surface); color: var(--wc-text); border-radius: var(--wc-radius); overflow: hidden;
      box-shadow: var(--wc-shadow); display: flex; flex-direction: column;
      font-size: 14px; line-height: 1.4;
    }
    .header {
      background: var(--wc-primary); color: var(--wc-secondary);
      padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
    }
    .title { font-weight: 600; font-size: 16px; margin: 0; }
    .icon-btn { background: none; border: none; color: inherit; cursor: pointer; font-size: 20px; line-height: 1; padding: 0 4px; }
    .body { flex: 1; overflow-y: auto; padding: 16px; background: var(--wc-surface-2); }
    form.start { display: flex; flex-direction: column; gap: 10px; }
    form.start p { margin: 0 0 4px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 500; }
    input, textarea {
      font-size: 14px; padding: 8px 10px; border: 1px solid var(--wc-border); border-radius: 8px;
      background: var(--wc-surface); color: var(--wc-text); width: 100%;
    }
    textarea { resize: vertical; min-height: 70px; }
    .btn {
      background: var(--wc-primary); color: var(--wc-secondary); border: none; border-radius: 8px;
      padding: 9px 14px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .btn:disabled { opacity: .6; cursor: default; }
    .msgs { display: flex; flex-direction: column; gap: 8px; }
    .msg { max-width: 80%; display: flex; flex-direction: column; gap: 2px; }
    .msg.visitor { align-self: flex-end; align-items: flex-end; }
    .msg.operator { align-self: flex-start; }
    .who { font-size: 11px; color: var(--wc-muted); }
    .text { padding: 8px 12px; border-radius: var(--wc-msg-radius); white-space: pre-wrap; word-break: break-word; }
    .visitor .text { background: var(--wc-primary); color: var(--wc-secondary); border-bottom-right-radius: var(--wc-msg-tail); }
    .operator .text { background: var(--wc-op-bubble-bg); color: var(--wc-text); border: 1px solid var(--wc-border); border-bottom-left-radius: var(--wc-msg-tail); }
    .notice { font-size: 13px; color: #9a6700; background: #fff8c5; border-radius: 8px; padding: 8px 10px; margin: 8px 0 0; }
    .closed { text-align: center; margin-top: 12px; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .footer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--wc-border); background: var(--wc-surface); }
    .footer textarea { min-height: 38px; height: 38px; resize: none; }
    .attach { background: var(--wc-surface); color: var(--wc-muted); border: 1px solid var(--wc-border); border-radius: 8px; width: 38px; flex: none; cursor: pointer; font-size: 18px; }
    .attach:disabled { opacity: .6; cursor: default; }
    .file { display: inline-block; padding: 8px 12px; border-radius: var(--wc-msg-radius); background: var(--wc-op-bubble-bg); border: 1px solid var(--wc-border); color: var(--wc-text); text-decoration: none; word-break: break-all; }
    .file:hover { text-decoration: underline; }
    .img { display: block; max-width: 220px; max-height: 220px; border-radius: var(--wc-msg-radius); border: 1px solid var(--wc-border); }
  `;

  const CHAT_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z"/></svg>';

  let supabase = null;
  let conversationId = null;
  let channel = null;
  const seen = new Set();
  const ui = {};

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) node.append(c);
    return node;
  }

  function buildUI(settings) {
    const host = el('div', { id: 'white-chat-root' });
    host.style.all = 'initial'; // inline beats the host page's inherited styles
    const root = host.attachShadow({ mode: 'open' });
    // The skin drives the palette via CSS variables; only override inline when a
    // color came explicitly from the injector (data-primary-color/secondary-color).
    host.dataset.skin = SKIN;
    if (PRIMARY_COLOR) host.style.setProperty('--wc-primary', PRIMARY_COLOR);
    if (SECONDARY_COLOR) host.style.setProperty('--wc-secondary', SECONDARY_COLOR);

    ui.panel = el('div', { class: 'panel', hidden: '' });
    ui.title = el('h2', { class: 'title', text: CHAT_NAME || settings.chat_name || TEXT.defaultTitle });
    const header = el('div', { class: 'header' }, [
      ui.title,
      el('button', { class: 'icon-btn', 'aria-label': TEXT.closeButton, text: '×', onclick: togglePanel }),
    ]);
    ui.body = el('div', { class: 'body' });
    ui.notice = el('p', { class: 'notice', hidden: '' });

    ui.input = el('textarea', { placeholder: TEXT.inputPlaceholder, rows: '1' });
    ui.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    ui.sendBtn = el('button', { class: 'btn', text: TEXT.sendButton, onclick: sendMessage });
    ui.fileInput = el('input', { type: 'file', hidden: '' });
    ui.fileInput.addEventListener('change', () => {
      const file = ui.fileInput.files[0];
      ui.fileInput.value = '';
      if (file) sendFile(file);
    });
    ui.attachBtn = el('button', {
      class: 'attach', title: TEXT.attachButton, 'aria-label': TEXT.attachButton, text: '📎',
      onclick: () => ui.fileInput.click(),
    });
    ui.footer = el('div', { class: 'footer', hidden: '' }, [ui.attachBtn, ui.input, ui.sendBtn, ui.fileInput]);

    ui.panel.append(header, ui.body, ui.footer);
    const bubble = el('button', { class: 'bubble', 'aria-label': TEXT.openButton, html: CHAT_ICON, onclick: togglePanel });

    root.append(el('style', { text: CSS }), ui.panel, bubble);
    document.body.append(host);
    emitState();
  }

  // When embedded through an <iframe> (embed.js), tell the parent whether the
  // panel is open so it can resize the iframe. No-op on a direct embed.
  const framed = window.parent && window.parent !== window;
  function emitState() {
    if (!framed) return;
    try {
      window.parent.postMessage(
        { source: 'white-chat', type: 'state', open: !!(ui.panel && !ui.panel.hidden) }, '*');
    } catch (e) { /* ignore */ }
  }

  function togglePanel() {
    ui.panel.toggleAttribute('hidden');
    emitState();
    if (!ui.panel.hidden) scrollToBottom();
  }

  function showNotice(text) {
    ui.notice.textContent = text;
    ui.notice.hidden = !text;
  }

  function scrollToBottom() {
    ui.body.scrollTop = ui.body.scrollHeight;
  }

  function showForm() {
    ui.footer.hidden = true;
    const field = (label, name, tag = 'input', attrs = {}) =>
      el('label', { text: label }, [el(tag, { name, required: '', ...attrs })]);

    const form = el('form', { class: 'start' }, [
      el('p', { text: TEXT.formIntro }),
      field(TEXT.nameLabel, 'name', 'input', { autocomplete: 'name' }),
      field(TEXT.phoneLabel, 'phone', 'input', { type: 'tel', autocomplete: 'tel' }),
      field(TEXT.dniLabel, 'dni'),
      field(TEXT.questionLabel, 'question', 'textarea'),
    ]);
    const submit = el('button', { class: 'btn', type: 'submit', text: TEXT.startButton });
    form.append(submit, ui.notice);
    form.addEventListener('submit', (e) => { e.preventDefault(); startConversation(form, submit); });

    showNotice('');
    ui.body.replaceChildren(form);
  }

  function showChat() {
    ui.msgs = el('div', { class: 'msgs' });
    ui.closed = el('div', { class: 'closed', hidden: '' }, [
      el('p', { class: 'notice', text: TEXT.chatClosed }),
      el('button', { class: 'btn', text: TEXT.newChat, onclick: resetConversation }),
    ]);
    showNotice('');
    ui.body.replaceChildren(ui.msgs, ui.notice, ui.closed);
    ui.footer.hidden = false;
    seen.clear();
  }

  function renderMessage(m) {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    const isVisitor = m.sender_type === 'visitor';
    const who = isVisitor ? TEXT.you : m.operator_name || TEXT.operatorFallback;
    const node = el('div', { class: `msg ${m.sender_type}` }, [el('span', { class: 'who', text: who })]);
    if (m.body) node.append(el('div', { class: 'text', text: m.body }));
    const attachment = renderAttachment(m);
    if (attachment) node.append(attachment);
    ui.msgs.append(node);
    scrollToBottom();
  }

  // Only links into our own bucket are rendered: attachment_url is client-written data.
  function renderAttachment(m) {
    const prefix = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
    if (!m.attachment_url || !m.attachment_url.startsWith(prefix)) return null;
    const link = el('a', { href: m.attachment_url, target: '_blank', rel: 'noopener noreferrer' });
    if (String(m.attachment_mime || '').startsWith('image/')) {
      link.append(el('img', { class: 'img', src: m.attachment_url, alt: m.attachment_name || '', onload: scrollToBottom }));
    } else {
      link.className = 'file';
      link.textContent = `📄 ${m.attachment_name || 'file'} (${formatSize(m.attachment_size)})`;
    }
    return link;
  }

  function formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function setStatus(status) {
    const closed = status === 'closed';
    ui.closed.hidden = !closed;
    ui.footer.hidden = closed;
    if (closed) showNotice('');
    scrollToBottom();
  }

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  function isRateLimit(error) {
    return !!error && String(error.message || '').includes('rate_limit_exceeded');
  }

  async function startConversation(form, submit) {
    const data = Object.fromEntries(new FormData(form));
    for (const k of Object.keys(data)) data[k] = String(data[k]).trim();
    if (!data.name || !data.phone || !data.dni || !data.question) {
      showNotice(TEXT.requiredFields);
      return;
    }

    submit.disabled = true;
    submit.textContent = TEXT.starting;
    showNotice('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
      const { data: id, error } = await supabase.rpc('start_conversation', {
        p_name: data.name, p_phone: data.phone, p_dni: data.dni, p_question: data.question,
      });
      if (error) throw error;
      localStorage.setItem(LS_CONVERSATION, id);
      await openConversation(id);
    } catch (err) {
      console.error('[white-chat]', err);
      showNotice(isRateLimit(err) ? TEXT.tooManyChats : TEXT.genericError);
      submit.disabled = false;
      submit.textContent = TEXT.startButton;
    }
  }

  async function openConversation(id) {
    const { data: conv, error } = await supabase
      .from('conversations').select('id, status').eq('id', id).maybeSingle();
    if (error || !conv) {
      if (error) console.error('[white-chat]', error);
      localStorage.removeItem(LS_CONVERSATION);
      showForm();
      return;
    }

    conversationId = conv.id;
    showChat();
    await subscribe(conv.id);

    const { data: messages, error: msgError } = await supabase
      .from('messages').select('*').eq('conversation_id', conv.id).order('created_at');
    if (msgError) {
      console.error('[white-chat]', msgError);
      showNotice(TEXT.loadError);
    }
    (messages || []).forEach(renderMessage);
    setStatus(conv.status);
  }

  async function subscribe(id) {
    if (channel) supabase.removeChannel(channel);
    // Right after signInAnonymously the realtime client may still hold the anon key,
    // and RLS would then filter out every event. Hand it the session token explicitly.
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await supabase.realtime.setAuth(session.access_token);
    channel = supabase
      .channel(`white-chat-${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => renderMessage(payload.new))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${id}` },
        (payload) => setStatus(payload.new.status))
      .subscribe();
  }

  async function sendMessage() {
    const body = ui.input.value.trim();
    if (!body || !conversationId || ui.sendBtn.disabled) return;

    ui.sendBtn.disabled = true;
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_type: 'visitor', body })
      .select()
      .single();

    if (!error) {
      ui.input.value = '';
      showNotice('');
      renderMessage(data);
      ui.sendBtn.disabled = false;
      return;
    }

    console.error('[white-chat]', error);
    if (isRateLimit(error)) {
      showNotice(TEXT.rateLimited);
      ui.input.disabled = true;
      setTimeout(() => {
        ui.input.disabled = false;
        ui.sendBtn.disabled = false;
        showNotice('');
      }, RATE_LIMIT_COOLDOWN_MS);
      return;
    }

    // Most likely the conversation was closed (RLS rejects the insert).
    const { data: conv } = await supabase
      .from('conversations').select('status').eq('id', conversationId).maybeSingle();
    if (conv && conv.status === 'closed') setStatus('closed');
    else showNotice(TEXT.genericError);
    ui.sendBtn.disabled = false;
  }

  async function sendFile(file) {
    if (!conversationId) return;
    if (file.size > MAX_FILE_BYTES) {
      showNotice(TEXT.fileTooLarge);
      return;
    }
    ui.attachBtn.disabled = true;
    showNotice(TEXT.uploading);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
      const path = `${conversationId}/${crypto.randomUUID()}-${safeName}`;
      const storage = supabase.storage.from(BUCKET);
      const { error: uploadError } = await storage.upload(path, file, {
        contentType: file.type || 'application/octet-stream',
      });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = storage.getPublicUrl(path);
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId, sender_type: 'visitor', body: null,
          attachment_url: publicUrl, attachment_name: file.name,
          attachment_size: file.size, attachment_mime: file.type || 'application/octet-stream',
        })
        .select()
        .single();
      if (error) throw error;
      showNotice('');
      renderMessage(data);
    } catch (err) {
      console.error('[white-chat]', err);
      showNotice(isRateLimit(err) ? TEXT.rateLimited : TEXT.genericError);
    } finally {
      ui.attachBtn.disabled = false;
    }
  }

  function resetConversation() {
    if (channel) supabase.removeChannel(channel);
    channel = null;
    conversationId = null;
    localStorage.removeItem(LS_CONVERSATION);
    showForm();
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function init() {
    const { createClient } = await import(SUPABASE_JS);
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: 'wc-auth', persistSession: true, autoRefreshToken: true },
    });

    // Only chat_name is read: it's the header text (content). The look comes from
    // the skin on the injector, not from widget_settings' colors.
    const { data: settings, error } = await supabase
      .from('widget_settings').select('chat_name').eq('id', 1).maybeSingle();
    if (error) console.error('[white-chat]', error);
    buildUI(settings || {});

    const storedId = localStorage.getItem(LS_CONVERSATION);
    const { data: { session } } = await supabase.auth.getSession();
    if (storedId && session) await openConversation(storedId);
    else showForm();
  }

  const boot = () => init().catch((err) => console.error('[white-chat] init failed', err));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
