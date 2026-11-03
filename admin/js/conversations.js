import { supabase } from './supabase.js';
import { TEXT } from './text.js';
import { requireStaff } from './auth.js';

const me = await requireStaff();
const isAdmin = me.role === 'admin';

const BUCKET = 'chat-attachments';
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const PUBLIC_PREFIX = `${window.WHITE_CHAT_CONFIG.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

const $ = (id) => document.getElementById(id);
const els = {
  list: $('conv-list'),
  empty: $('chat-empty'),
  chat: $('chat'),
  title: $('chat-title'),
  assigned: $('chat-assigned'),
  messages: $('messages'),
  closed: $('chat-closed'),
  error: $('chat-error'),
  composer: $('composer'),
  attach: $('btn-attach'),
  fileInput: $('file-input'),
  uploading: $('chat-uploading'),
  take: $('btn-take'),
  close: $('btn-close'),
  del: $('btn-delete'),
  visitor: $('visitor'),
};

const state = {
  filter: 'open',
  conversations: [],
  selected: null, // conversation row
  seen: new Set(), // message ids rendered in the open chat
  staffNames: new Map(), // profile id -> full_name
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmtDate = (iso) => new Date(iso).toLocaleString();
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const staffName = (id) => (id ? state.staffNames.get(id) || '—' : TEXT.unassigned);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showError(msg) {
  els.error.textContent = msg || '';
  els.error.hidden = !msg;
}

async function loadStaffNames() {
  const { data } = await supabase.from('profiles').select('id, full_name');
  state.staffNames = new Map((data || []).map((p) => [p.id, p.full_name]));
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
async function loadList() {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('status', state.filter)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) console.error(error);
  state.conversations = data || [];
  renderList();
}

function renderList() {
  els.list.replaceChildren();
  if (!state.conversations.length) {
    els.list.append(el('li', 'empty', TEXT.noConversations));
    return;
  }
  for (const c of state.conversations) {
    const li = el('li', 'conv-item' + (state.selected?.id === c.id ? ' active' : ''));
    const top = el('div', 'row');
    top.append(el('strong', '', c.visitor_name), el('span', 'muted small', fmtTime(c.updated_at)));
    li.append(top, el('div', 'muted small', staffName(c.assigned_operator_id)));
    li.addEventListener('click', () => selectConversation(c.id));
    els.list.append(li);
  }
}

let listTimer = null;
function scheduleListReload() {
  clearTimeout(listTimer);
  listTimer = setTimeout(loadList, 300);
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
async function selectConversation(id) {
  const { data: conv, error } = await supabase.from('conversations').select('*').eq('id', id).maybeSingle();
  if (error || !conv) {
    clearSelection();
    return;
  }
  history.replaceState(null, '', '#' + id);
  state.selected = conv;
  state.seen.clear();
  els.messages.replaceChildren();
  showError('');
  renderDetail();
  renderList();

  const { data: messages } = await supabase
    .from('messages').select('*').eq('conversation_id', id).order('created_at');
  if (state.selected?.id !== id) return; // user switched meanwhile
  (messages || []).forEach(renderMessage);
}

function clearSelection() {
  state.selected = null;
  history.replaceState(null, '', location.pathname);
  els.chat.hidden = true;
  els.visitor.hidden = true;
  els.empty.hidden = false;
  renderList();
}

function renderDetail() {
  const c = state.selected;
  const closed = c.status === 'closed';
  els.empty.hidden = true;
  els.chat.hidden = false;
  els.visitor.hidden = false;

  els.title.textContent = c.visitor_name;
  els.assigned.textContent = `${TEXT.assignedTo}: ${staffName(c.assigned_operator_id)}`;
  els.take.hidden = closed || c.assigned_operator_id === me.id;
  els.close.hidden = closed;
  els.del.hidden = !isAdmin;
  els.closed.hidden = !closed;
  els.composer.hidden = closed;

  const fields = {
    visitor_name: c.visitor_name,
    visitor_phone: c.visitor_phone,
    visitor_dni: c.visitor_dni,
    created_at: fmtDate(c.created_at),
    status: closed ? TEXT.statusClosed : TEXT.statusOpen,
    assigned: staffName(c.assigned_operator_id),
  };
  els.visitor.querySelectorAll('[data-field]').forEach((dd) => {
    dd.textContent = fields[dd.dataset.field];
  });
}

function renderMessage(m) {
  if (state.seen.has(m.id)) return;
  state.seen.add(m.id);
  const fromVisitor = m.sender_type === 'visitor';
  const who = fromVisitor ? state.selected.visitor_name : m.operator_name || TEXT.support;
  const node = el('div', `msg ${fromVisitor ? 'from-visitor' : 'from-operator'}`);
  node.append(el('span', 'who', `${who} · ${fmtTime(m.created_at)}`));
  if (m.body) node.append(el('div', 'text', m.body));
  const attachment = renderAttachment(m);
  if (attachment) node.append(attachment);
  els.messages.append(node);
  scrollToBottom();
}

const scrollToBottom = () => { els.messages.scrollTop = els.messages.scrollHeight; };

// Only links into our own bucket are rendered: attachment_url is client-written data.
function renderAttachment(m) {
  if (!m.attachment_url || !m.attachment_url.startsWith(PUBLIC_PREFIX)) return null;
  const link = document.createElement('a');
  link.href = m.attachment_url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (String(m.attachment_mime || '').startsWith('image/')) {
    const img = el('img', 'img');
    img.src = m.attachment_url;
    img.alt = m.attachment_name || '';
    img.addEventListener('load', scrollToBottom);
    link.append(img);
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

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function updateSelected(patch) {
  const { data, error } = await supabase
    .from('conversations').update(patch).eq('id', state.selected.id).select().maybeSingle();
  if (error || !data) {
    console.error(error);
    showError(TEXT.genericError);
    return;
  }
  state.selected = data;
  renderDetail();
  scheduleListReload();
}

els.take.addEventListener('click', () => updateSelected({ assigned_operator_id: me.id }));

els.close.addEventListener('click', () => {
  if (confirm(TEXT.confirmClose)) updateSelected({ status: 'closed' });
});

els.del.addEventListener('click', async () => {
  if (!confirm(TEXT.confirmDelete)) return;
  const { error } = await supabase.from('conversations').delete().eq('id', state.selected.id);
  if (error) {
    console.error(error);
    showError(TEXT.genericError);
    return;
  }
  clearSelection();
  loadList();
});

els.composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const textarea = els.composer.body;
  const body = textarea.value.trim();
  if (!body || !state.selected) return;
  const button = els.composer.querySelector('button[type=submit]');
  button.disabled = true;
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: state.selected.id, sender_type: 'operator', body })
    .select()
    .single();
  button.disabled = false;
  if (error) {
    console.error(error);
    showError(TEXT.genericError);
    return;
  }
  textarea.value = '';
  showError('');
  renderMessage(data);
});

els.attach.title = TEXT.attach;
els.attach.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files[0];
  els.fileInput.value = '';
  if (file) sendFile(file);
});

async function sendFile(file) {
  if (!state.selected) return;
  if (file.size > MAX_FILE_BYTES) {
    showError(TEXT.fileTooLarge);
    return;
  }
  const convId = state.selected.id;
  els.attach.disabled = true;
  els.uploading.hidden = false;
  showError('');
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const path = `${convId}/${crypto.randomUUID()}-${safeName}`;
    const storage = supabase.storage.from(BUCKET);
    const { error: uploadError } = await storage.upload(path, file, {
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = storage.getPublicUrl(path);
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: convId, sender_type: 'operator', body: null,
        attachment_url: publicUrl, attachment_name: file.name,
        attachment_size: file.size, attachment_mime: file.type || 'application/octet-stream',
      })
      .select()
      .single();
    if (error) throw error;
    if (state.selected?.id === convId) renderMessage(data);
  } catch (err) {
    console.error(err);
    showError(TEXT.genericError);
  } finally {
    els.attach.disabled = false;
    els.uploading.hidden = true;
  }
}

els.composer.body.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    els.composer.requestSubmit();
  }
});

document.querySelectorAll('[data-filter]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach((t) => t.classList.toggle('active', t === tab));
    state.filter = tab.dataset.filter;
    loadList();
  });
});

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------
supabase
  .channel('admin-inbox')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
    scheduleListReload();
    const id = payload.new?.id || payload.old?.id;
    if (!state.selected || id !== state.selected.id) return;
    if (payload.eventType === 'DELETE') clearSelection();
    else {
      state.selected = payload.new;
      renderDetail();
    }
  })
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
    if (state.selected && payload.new.conversation_id === state.selected.id) renderMessage(payload.new);
  })
  .subscribe();

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
await loadStaffNames();
await loadList();
const fromHash = location.hash.slice(1);
if (fromHash) selectConversation(fromHash);
