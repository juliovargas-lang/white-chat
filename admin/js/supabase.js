import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Loaded by ../config.js (classic script) before this module.
const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.WHITE_CHAT_CONFIG;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: 'wc-admin-auth', persistSession: true, autoRefreshToken: true },
});
