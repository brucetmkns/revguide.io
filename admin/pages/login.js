/**
 * RevGuide - Login Page
 * Handles Magic Link authentication
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const loginMessage = document.getElementById('loginMessage');
  const emailInput = document.getElementById('email');

  // Check if already logged in
  const { data: { session } } = await RevGuideAuth.getSession();
  if (session) {
    window.location.href = '/home';
    return;
  }

  // Check for auth callback (magic link return)
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const queryParams = new URLSearchParams(window.location.search);

  // Handle Supabase auth callback (magic link)
  if (hashParams.get('access_token') || queryParams.get('code')) {
    showMessage('Signing you in...', 'success');
    // Supabase handles the token exchange automatically
    setTimeout(async () => {
      const { data: { session } } = await RevGuideAuth.getSession();
      if (session) {
        window.location.href = '/home';
      } else {
        showMessage('Authentication failed. Please try again.', 'error');
      }
    }, 1000);
    return;
  }

  // Check for error in URL
  if (queryParams.get('error')) {
    showMessage(queryParams.get('error_description') || 'Authentication failed', 'error');
  }

  // Magic link form submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    if (!email) return;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Sending...';

    try {
      const { error } = await RevGuideAuth.signInWithMagicLink(email);

      if (error) {
        showMessage(error.message, 'error');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Send magic link';
      } else {
        showMessage('Check your email for the magic link!', 'success');
        loginBtn.textContent = 'Email sent';
      }
    } catch (err) {
      showMessage('Failed to send magic link. Please try again.', 'error');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Send magic link';
    }
  });

  /**
   * Show a message to the user
   */
  function showMessage(text, type) {
    loginMessage.textContent = text;
    loginMessage.className = `login-message ${type}`;
    loginMessage.style.display = 'block';
  }
});
