// Public Supabase config used by the admin panel and demo.html.
// The anon key is public by design; never put the service_role key here.
// On localhost it points to the local stack (`npx supabase start`), anywhere else to production.
window.WHITE_CHAT_CONFIG = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? {
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    }
  : {
      SUPABASE_URL: 'https://bopowpecmfdgqwlxrccf.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvcG93cGVjbWZkZ3F3bHhyY2NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNjMyNTcsImV4cCI6MjEwODkzOTI1N30.hBK8LgstHDdbCc5NkNK5bk3f1Wzwa3auanvHx3aH7-4',
    };
