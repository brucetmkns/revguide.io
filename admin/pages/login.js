/**
 * RevGuide - Login Page
 * Handles Magic Link authentication for existing users
 */

// Edge function URL for checking if email exists
const CHECK_EMAIL_URL = 'https://qbdhvhrowmfnacyikkbf.supabase.co/functions/v1/check-email';

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

  // Check for error in URL (e.g., expired magic link)
  if (hashParams.get('error') || queryParams.get('error')) {
    const errorCode = hashParams.get('error_code') || queryParams.get('error_code');
    const errorDesc = hashParams.get('error_description') || queryParams.get('error_description');

    if (errorCode === 'otp_expired') {
      showMessage('This magic link has expired. Please request a new one.', 'error');
    } else {
      showMessage(errorDesc?.replace(/\+/g, ' ') || 'Authentication failed. Please try again.', 'error');
    }

    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Magic link form submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    if (!email) return;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Checking...';
    hideMessage();

    try {
      // First check if the email exists
      const emailExists = await checkEmailExists(email);

      if (!emailExists) {
        // User doesn't exist - prompt to sign up
        showMessage(
          'No account found with this email. <a href="/signup">Sign up free</a> to get started!',
          'warning'
        );
        loginBtn.disabled = false;
        loginBtn.textContent = 'Send magic link';
        return;
      }

      // User exists - send magic link
      loginBtn.textContent = 'Sending...';
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
      console.error('Login error:', err);
      showMessage('Something went wrong. Please try again.', 'error');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Send magic link';
    }
  });

  /**
   * Check if an email exists in the system
   */
  async function checkEmailExists(email) {
    try {
      const response = await fetch(CHECK_EMAIL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        console.error('Check email failed:', response.status);
        // On error, allow the login attempt (fail open)
        return true;
      }

      const data = await response.json();
      return data.exists === true;
    } catch (err) {
      console.error('Check email error:', err);
      // On error, allow the login attempt (fail open)
      return true;
    }
  }

  /**
   * Show a message to the user
   */
  function showMessage(text, type) {
    loginMessage.innerHTML = text;
    loginMessage.className = `login-message ${type}`;
    loginMessage.style.display = 'block';
  }

  /**
   * Hide the message
   */
  function hideMessage() {
    loginMessage.style.display = 'none';
  }
});
