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
  const googleBtn = document.getElementById('googleBtn');
  const microsoftBtn = document.getElementById('microsoftBtn');

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

  // Check if we should auto-start OAuth (provider param from extension sidebar)
  const autoProvider = queryParams.get('provider');
  if (autoProvider && !window.location.hash) {
    // Auto-start OAuth flow immediately
    (async () => {
      try {
        if (autoProvider === 'google') {
          await RevGuideAuth.signInWithGoogle();
        } else if (autoProvider === 'azure') {
          await RevGuideAuth.signInWithMicrosoft();
        }
        // Browser will redirect to OAuth provider
      } catch (err) {
        console.error('OAuth auto-start error:', err);
        showMessage('Failed to start sign-in. Please try again.', 'error');
      }
    })();
    return; // Don't render the page, we're redirecting to OAuth
  }

  // Check for OAuth callback (access_token in hash)
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  if (hashParams.get('access_token')) {
    showMessage('Signing you in...', 'success');
    // Supabase will automatically pick up the token from the URL
    // Wait for session to be established, then check user setup
    setTimeout(async () => {
      try {
        const { data: { session } } = await RevGuideAuth.getSession();
        if (session) {
          // Check if user has a profile
          const { data: profile } = await RevGuideDB.getUserProfile();

          if (profile && profile.organization_id) {
            // User is fully set up, redirect
            window.location.href = getRedirectUrl();
          } else {
            // New OAuth user - check for pending invitation
            const email = session.user.email;
            const { data: invitation } = await RevGuideDB.getPendingInvitationByEmail(email);

            if (invitation) {
              // Accept invitation
              const fullName = session.user.user_metadata?.full_name ||
                               session.user.user_metadata?.name ||
                               email.split('@')[0];
              const { error: acceptError } = await RevGuideDB.acceptInvitation(invitation.id, fullName);

              if (acceptError) {
                console.error('Failed to accept invitation:', acceptError);
                showMessage('Failed to join organization. Please contact support.', 'error');
                return;
              }

              showMessage('Welcome! Redirecting...', 'success');
              setTimeout(() => {
                window.location.href = getRedirectUrl();
              }, 500);
            } else {
              // No invitation - redirect to onboarding
              window.location.href = '/onboarding?oauth=true';
            }
          }
        } else {
          showMessage('Authentication failed. Please try again.', 'error');
          // Clear hash
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }
      } catch (err) {
        console.error('OAuth callback error:', err);
        showMessage('Something went wrong. Please try again.', 'error');
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }
    }, 500);
    return; // Don't proceed with normal page setup while processing OAuth
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

  // Google OAuth
  googleBtn.addEventListener('click', async () => {
    googleBtn.disabled = true;
    googleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Redirecting...
    `;
    hideMessage();

    try {
      const { error } = await RevGuideAuth.signInWithGoogle();
      if (error) {
        showMessage(error.message, 'error');
        googleBtn.disabled = false;
        googleBtn.innerHTML = `
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        `;
      }
      // If no error, browser will redirect to Google
    } catch (err) {
      console.error('Google OAuth error:', err);
      showMessage('Failed to connect to Google. Please try again.', 'error');
      googleBtn.disabled = false;
      googleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      `;
    }
  });

  // Microsoft OAuth
  microsoftBtn.addEventListener('click', async () => {
    microsoftBtn.disabled = true;
    microsoftBtn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;">
        <path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F25022"/>
        <path d="M22 11.4h-9.4V2H22v9.4z" fill="#7FBA00"/>
        <path d="M11.4 22H2v-9.4h9.4V22z" fill="#00A4EF"/>
        <path d="M22 22h-9.4v-9.4H22V22z" fill="#FFB900"/>
      </svg>
      Redirecting...
    `;
    hideMessage();

    try {
      const { error } = await RevGuideAuth.signInWithMicrosoft();
      if (error) {
        showMessage(error.message, 'error');
        microsoftBtn.disabled = false;
        microsoftBtn.innerHTML = `
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;">
            <path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F25022"/>
            <path d="M22 11.4h-9.4V2H22v9.4z" fill="#7FBA00"/>
            <path d="M11.4 22H2v-9.4h9.4V22z" fill="#00A4EF"/>
            <path d="M22 22h-9.4v-9.4H22V22z" fill="#FFB900"/>
          </svg>
          Continue with Microsoft
        `;
      }
      // If no error, browser will redirect to Microsoft
    } catch (err) {
      console.error('Microsoft OAuth error:', err);
      showMessage('Failed to connect to Microsoft. Please try again.', 'error');
      microsoftBtn.disabled = false;
      microsoftBtn.innerHTML = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;">
          <path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F25022"/>
          <path d="M22 11.4h-9.4V2H22v9.4z" fill="#7FBA00"/>
          <path d="M11.4 22H2v-9.4h9.4V22z" fill="#00A4EF"/>
          <path d="M22 22h-9.4v-9.4H22V22z" fill="#FFB900"/>
        </svg>
        Continue with Microsoft
      `;
    }
  });
});
