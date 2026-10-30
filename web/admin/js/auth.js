import { supabase } from './supabase.js';
import { TEXT, applyText } from './text.js';

const never = () => new Promise(() => {});

async function getProfile(userId) {
  const { data } = await supabase
    .from('profiles').select('id, full_name, role').eq('id', userId).maybeSingle();
  return data;
}

// Signs in and checks the user is staff. Returns an error message or null.
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return TEXT.invalidCredentials;
  if (!(await getProfile(data.user.id))) {
    await supabase.auth.signOut();
    return TEXT.notAuthorized;
  }
  return null;
}

// Returns the current staff profile, or redirects to the login page.
export async function currentStaff() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const profile = await getProfile(session.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    return null;
  }
  // Realtime must use the user's token, otherwise RLS filters out every event.
  await supabase.realtime.setAuth(session.access_token);
  return profile;
}

export async function requireStaff({ adminOnly = false } = {}) {
  const profile = await currentStaff();
  if (!profile) {
    location.href = 'index.html?error=unauthorized';
    return never();
  }
  if (adminOnly && profile.role !== 'admin') {
    location.href = 'conversations.html';
    return never();
  }
  setupHeader(profile);
  return profile;
}

function setupHeader(profile) {
  applyText();
  document.querySelector('[data-user-name]').textContent = `${profile.full_name} (${profile.role})`;
  document.querySelectorAll('[data-admin-only]').forEach((el) => {
    el.hidden = profile.role !== 'admin';
  });
  document.querySelector('[data-logout]').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.href = 'index.html';
  });
}
