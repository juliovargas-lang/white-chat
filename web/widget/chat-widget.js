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

  // Must be read synchronously, before any await.
  const script = document.currentScript;
  const SUPABASE_URL = script && script.dataset.supabaseUrl;
  const SUPABASE_KEY = script && script.dataset.supabaseKey;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[white-chat] Missing data-supabase-url or data-supabase-key on the script tag.');
    return;
  }

  const CSS = `
    :host { all: initial; }
    [hidden] { display: none !important; }
    * {
      box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      letter-spacing: normal; text-transform: none;
    }
    .bubble {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
      width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
      background: var(--wc-primary); color: var(--wc-secondary);
      box-shadow: 0 4px 16px rgba(0,0,0,.25); display: flex; align-items: center; justify-content: center;
    }
    .bubble svg { width: 26px; height: 26px; fill: currentColor; }
    .panel {
      position: fixed; right: 20px; bottom: 88px; z-index: 2147483000;
      width: 360px; max-width: calc(100vw - 40px); height: 520px; max-height: calc(100vh - 120px);
      background: #fff; color: #1f2328; border-radius: 12px; overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,.25); display: flex; flex-direction: column;
      font-size: 14px; line-height: 1.4;
    }
    .header {
      background: var(--wc-primary); color: var(--wc-secondary);
      padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
    }
    .title { font-weight: 600; font-size: 16px; margin: 0; }
    .icon-btn { background: none; border: none; color: inherit; cursor: pointer; font-size: 20px; line-height: 1; padding: 0 4px; }
    .body { flex: 1; overflow-y: auto; padding: 16px; background: #f6f7f9; }
    form.start { display: flex; flex-direction: column; gap: 10px; }
    form.start p { margin: 0 0 4px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 500; }
    input, textarea {
      font-size: 14px; padding: 8px 10px; border: 1px solid #d0d7de; border-radius: 8px;
      background: #fff; color: #1f2328; width: 100%;
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
    .who { font-size: 11px; color: #656d76; }
    .text { padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; word-break: break-word; }
    .visitor .text { background: var(--wc-primary); color: var(--wc-secondary); border-bottom-right-radius: 4px; }
    .operator .text { background: #fff; border: 1px solid #e3e6ea; border-bottom-left-radius: 4px; }
    .notice { font-size: 13px; color: #9a6700; background: #fff8c5; border-radius: 8px; padding: 8px 10px; margin: 8px 0 0; }
    .closed { text-align: center; margin-top: 12px; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .footer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #e3e6ea; background: #fff; }
    .footer textarea { min-height: 38px; height: 38px; resize: none; }
    .attach { background: #fff; color: #656d76; border: 1px solid #d0d7de; border-radius: 8px; width: 38px; flex: none; cursor: pointer; font-size: 18px; }
    .attach:disabled { opacity: .6; cursor: default; }
    .file { display: inline-block; padding: 8px 12px; border-radius: 12px; background: #fff; border: 1px solid #e3e6ea; color: #1f2328; text-decoration: none; word-break: break-all; }
    .file:hover { text-decoration: underline; }
    .img { display: block; max-width: 220px; max-height: 220px; border-radius: 12px; border: 1px solid #e3e6ea; }
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
    host.style.setProperty('--wc-primary', settings.primary_color || '#3a63ff');
    host.style.setProperty('--wc-secondary', settings.secondary_color || '#ffffff');

    ui.panel = el('div', { class: 'panel', hidden: '' });
    ui.title = el('h2', { class: 'title', text: settings.chat_name || TEXT.defaultTitle });
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

    const { data: settings, error } = await supabase
      .from('widget_settings').select('chat_name, primary_color, secondary_color').eq('id', 1).maybeSingle();
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
