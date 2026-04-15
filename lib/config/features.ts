/**
 * UI feature flags for the chatbot.
 *
 * These are compile-time constants (not env vars) so they work
 * correctly inside Docker without needing build-time arguments.
 * To change a flag, edit the value here and rebuild.
 *
 * true  = feature is visible to users
 * false = feature is hidden from users
 */
export const features = {
  /** Show the model selector dropdown in the chat input */
  showModelSelector: false,

  /** Show the file attachment button in the chat input */
  showAttachments: false,

  /** Show the public/private visibility selector on chats */
  showChatVisibility: false,

  /** Show the "Delete all chats" button in the sidebar */
  showDeleteAllChats: false,

  /** Show the user profile / avatar / login-logout in the sidebar footer */
  showUserProfile: true,
};
