/**
 * RevGuide - Login Page
 * Handles email/password authentication
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const loginMessage = document.getElementById('loginMessage');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');

  // Get query params
  const queryParams = new URLSearchParams(window.location.search);
  const requestPath = queryParams.get('request_path');

  // Determine redirect URL after login
  function getRedirectUrl() {
    if (requestPath) {
      // If request_path is provided, redirect there after login
      return requestPath;
    }
    return '/home';
  }

  // Check if already logged in
  const { data: { session } } = await RevGuideAuth.getSession();
  if (session) {
    window.location.href = getRedirectUrl();
    return;
  }

  // Check for error in URL (e.g., from OAuth)
  if (queryParams.get('error')) {
    showMessage(queryParams.get('error_description') || 'Authentication failed', 'error');
    // Keep request_path in URL if present
    if (requestPath) {
      window.history.replaceState({}, '', `${window.location.pathname}?request_path=${encodeURIComponent(requestPath)}`);
    } else {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  // Login form submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) return;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
    hideMessage();

    try {
      const { data, error } = await RevGuideAuth.signIn(email, password);

      if (error) {
        // Handle specific error messages
        if (error.message.includes('Invalid login credentials')) {
          showMessage('Invalid email or password. Please try again.', 'error');
        } else if (error.message.includes('Email not confirmed')) {
          showMessage('Please check your email to confirm your account.', 'error');
        } else {
          showMessage(error.message, 'error');
        }
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign in';
      } else if (data.session) {
        // Login successful
        showMessage('Welcome back! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = getRedirectUrl();
        }, 500);
      }
    } catch (err) {
      console.error('Login error:', err);
      showMessage('Something went wrong. Please try again.', 'error');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign in';
    }
  });

  // Forgot password
  forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    if (!email) {
      showMessage('Please enter your email address first.', 'error');
      emailInput.focus();
      return;
    }

    forgotPasswordLink.style.pointerEvents = 'none';
    forgotPasswordLink.textContent = 'Sending...';

    try {
      const { error } = await RevGuideAuth.resetPassword(email);

      if (error) {
        showMessage(error.message, 'error');
      } else {
        showMessage('Check your email for a password reset link!', 'success');
      }
    } catch (err) {
      console.error('Reset password error:', err);
      showMessage('Failed to send reset email. Please try again.', 'error');
    }

    forgotPasswordLink.style.pointerEvents = 'auto';
    forgotPasswordLink.textContent = 'Forgot password?';
  });

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
