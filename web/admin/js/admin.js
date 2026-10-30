import { supabase } from './supabase.js';
import { TEXT } from './text.js';
import { requireStaff } from './auth.js';

const me = await requireStaff({ adminOnly: true });

const $ = (id) => document.getElementById(id);

function flash(okEl, errorEl, error) {
  okEl.hidden = !!error;
  errorEl.textContent = error || '';
  errorEl.hidden = !error;
}

// ---------------------------------------------------------------------------
// Branding (A9)
// ---------------------------------------------------------------------------
const branding = $('branding-form');
const preview = $('branding-preview');

function renderPreview() {
  preview.textContent = branding.chat_name.value || TEXT.chatName;
  preview.style.background = branding.primary_color.value;
  preview.style.color = branding.secondary_color.value;
}

async function loadBranding() {
  const { data } = await supabase
    .from('widget_settings').select('chat_name, primary_color, secondary_color').eq('id', 1).single();
  if (data) {
    branding.chat_name.value = data.chat_name;
    branding.primary_color.value = data.primary_color;
    branding.secondary_color.value = data.secondary_color;
  }
  renderPreview();
}

branding.addEventListener('input', () => {
  $('branding-ok').hidden = true;
  renderPreview();
});

branding.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { data, error } = await supabase
    .from('widget_settings')
    .update({
      chat_name: branding.chat_name.value.trim(),
      primary_color: branding.primary_color.value,
      secondary_color: branding.secondary_color.value,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select();
  if (error || !data?.length) console.error(error);
  flash($('branding-ok'), $('branding-error'), error || !data?.length ? TEXT.genericError : null);
});

// ---------------------------------------------------------------------------
// Staff (A8)
// ---------------------------------------------------------------------------
const rows = $('staff-rows');

function showStaffError(msg) {
  $('staff-error').textContent = msg || '';
  $('staff-error').hidden = !msg;
}

async function loadStaff() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, role').order('full_name');
  if (error) console.error(error);
  rows.replaceChildren(...(data || []).map(staffRow));
}

function staffRow(p) {
  const isMe = p.id === me.id;
  const tr = document.createElement('tr');

  const name = document.createElement('td');
  name.textContent = isMe ? `${p.full_name} ${TEXT.you}` : p.full_name;
  const email = document.createElement('td');
  email.className = 'muted';
  email.textContent = p.email || '—';

  const roleCell = document.createElement('td');
  const select = document.createElement('select');
  for (const [value, label] of [['operator', TEXT.roleOperator], ['admin', TEXT.roleAdmin]]) {
    select.append(new Option(label, value, false, p.role === value));
  }
  select.disabled = isMe; // avoid locking yourself out
  select.addEventListener('change', async () => {
    const { error } = await supabase.from('profiles').update({ role: select.value }).eq('id', p.id);
    showStaffError(error ? TEXT.genericError : '');
    if (error) select.value = p.role;
    else p.role = select.value;
  });
  roleCell.append(select);

  const actions = document.createElement('td');
  if (!isMe) {
    const remove = document.createElement('button');
    remove.className = 'btn btn-danger';
    remove.textContent = TEXT.removeAccess;
    remove.addEventListener('click', async () => {
      if (!confirm(TEXT.confirmRemoveAccess)) return;
      const { error } = await supabase.from('profiles').delete().eq('id', p.id);
      showStaffError(error ? TEXT.genericError : '');
      if (!error) loadStaff();
    });
    actions.append(remove);
  }

  tr.append(name, email, roleCell, actions);
  return tr;
}

const grant = $('grant-form');
grant.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await supabase.rpc('add_staff', {
    p_email: grant.email.value.trim(),
    p_full_name: grant.full_name.value.trim(),
    p_role: grant.role.value,
  });
  if (error) console.error(error);
  const msg = !error ? null : error.message.includes('user_not_found') ? TEXT.userNotFound : TEXT.genericError;
  flash($('grant-ok'), $('grant-error'), msg);
  if (!error) {
    grant.reset();
    loadStaff();
  }
});

await Promise.all([loadBranding(), loadStaff()]);
