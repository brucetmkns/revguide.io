/**
 * RevGuide - Login Page
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const googleBtn = document.getElementById('googleBtn');
  const loginMessage = document.getElementById('loginMessage');
  const emailInput = document.getElementById('email');

  // Check if already logged in
  const { data: { session } } = await RevGuideAuth.getSession();
  if (session) {
    window.location.href = 'home.html';
    return;
  }

  // Check for auth callback (magic link or OAuth return)
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const queryParams = new URLSearchParams(window.location.search);

  if (hashParams.get('access_token') || queryParams.get('code')) {
    showMessage('Signing you in...', 'success');
    // Supabase handles the token exchange automatically
    setTimeout(async () => {
      const { data: { session } } = await RevGuideAuth.getSession();
      if (session) {
        window.location.href = 'home.html';
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

  // Google OAuth
  googleBtn.addEventListener('click', async () => {
    googleBtn.disabled = true;

    try {
      const { error } = await RevGuideAuth.signInWithGoogle();
      if (error) {
        showMessage(error.message, 'error');
        googleBtn.disabled = false;
      }
      // User will be redirected to Google
    } catch (err) {
      showMessage('Failed to start Google sign-in.', 'error');
      googleBtn.disabled = false;
    }
  });

  function showMessage(text, type) {
    loginMessage.textContent = text;
    loginMessage.className = `login-message ${type}`;
    loginMessage.style.display = 'block';
  }
});
