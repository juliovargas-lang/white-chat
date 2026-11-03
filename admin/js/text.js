// All user-visible texts of the admin panel. Edit here to change the copy.
// In HTML use data-text="key" (textContent) or data-placeholder="key" (placeholder).
export const TEXT = {
  appName: 'White Chat Admin',
  navConversations: 'Conversations',
  navAdmin: 'Settings',
  logout: 'Log out',

  // Login
  loginTitle: 'Sign in',
  email: 'Email',
  password: 'Password',
  loginButton: 'Sign in',
  signingIn: 'Signing in…',
  invalidCredentials: 'Invalid email or password.',
  notAuthorized: 'Not authorized. Your account has no access to this panel.',

  // Conversations
  filterOpen: 'Open',
  filterClosed: 'Closed',
  noConversations: 'No conversations.',
  selectConversation: 'Select a conversation.',
  unassigned: 'Unassigned',
  assignedTo: 'Assigned to',
  take: 'Take',
  close: 'Close',
  delete: 'Delete',
  confirmClose: 'Close this conversation? The visitor will not be able to write anymore.',
  confirmDelete: 'Delete this conversation and all its messages? This cannot be undone.',
  replyPlaceholder: 'Write a reply…',
  send: 'Send',
  conversationClosed: 'This conversation is closed.',
  visitorDetails: 'Visitor',
  visitorName: 'Name',
  visitorPhone: 'Phone',
  visitorDni: 'ID number',
  startedAt: 'Started',
  status: 'Status',
  statusOpen: 'Open',
  statusClosed: 'Closed',
  support: 'Support',
  attach: 'Attach a file',
  uploading: 'Uploading…',
  fileTooLarge: 'The file is too large (max. 30 MB).',
  genericError: 'Something went wrong. Please try again.',

  // Settings: branding
  brandingTitle: 'Chat branding',
  chatName: 'Chat name',
  primaryColor: 'Primary color',
  secondaryColor: 'Text color on primary',
  preview: 'Preview',
  save: 'Save',
  saved: 'Saved. Reload the website to see the changes in the widget.',

  // Settings: staff
  staffTitle: 'Staff',
  staffName: 'Name',
  staffRole: 'Role',
  roleAdmin: 'Admin',
  roleOperator: 'Operator',
  removeAccess: 'Remove access',
  confirmRemoveAccess: 'Remove panel access for this user?',
  you: '(you)',
  grantTitle: 'Grant access',
  grantHint: 'First create the user in Supabase → Authentication → Users (email + password). Then grant access here with the same email.',
  grantButton: 'Grant access',
  granted: 'Access granted.',
  userNotFound: 'No user with that email. Create it first in Supabase → Authentication → Users.',
};

export function applyText(root = document) {
  root.querySelectorAll('[data-text]').forEach((el) => {
    el.textContent = TEXT[el.dataset.text] ?? el.dataset.text;
  });
  root.querySelectorAll('[data-placeholder]').forEach((el) => {
    el.placeholder = TEXT[el.dataset.placeholder] ?? el.dataset.placeholder;
  });
}
