/**
 * RevGuide - Join via Invite Link Page
 *
 * Handles user signup via shareable invite links.
 */

const SUPABASE_URL = 'https://qbdhvhrowmfnacyikkbf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RC5R8c5f-uoyMkoABXCRPg_n3HjyXXS';
const API_BASE_URL = 'https://revguide-api.revguide.workers.dev';

class JoinPage {
  constructor() {
    this.inviteCode = null;
    this.inviteLink = null;
    this.supabase = null;
    this.init();
  }

  async init() {
    // Initialize Supabase client
    this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Extract invite code from URL path (/join/CODE)
    const pathParts = window.location.pathname.split('/');
    const joinIndex = pathParts.indexOf('join');
    if (joinIndex !== -1 && pathParts[joinIndex + 1]) {
      this.inviteCode = pathParts[joinIndex + 1];
    }

    if (!this.inviteCode) {
      this.showError('Invalid invite link. No code provided.');
      return;
    }

    // Check for OAuth callback (access_token in hash)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('access_token')) {
      await this.handleOAuthCallback();
      return;
    }

    // Check if user is already logged in
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session) {
      // User is logged in - check if they're already in the org or offer to join
      await this.handleLoggedInUser(session);
      return;
    }

    // Validate the invite link
    await this.validateInviteLink();

    // Bind form events
    this.bindEvents();
  }

  async handleOAuthCallback() {
    const loadingState = document.getElementById('loadingState');
    loadingState.innerHTML = '<span class="icon icon-loader" style="animation: spin 1s linear infinite;"></span><p style="margin-top: var(--space-4);">Completing signup...</p>';

    try {
      // Wait for Supabase to process the OAuth token
      await new Promise(resolve => setTimeout(resolve, 500));

      const { data: { session } } = await this.supabase.auth.getSession();

      if (!session) {
        this.showError('Authentication failed. Please try again.');
        return;
      }

      // Get user info from OAuth
      const email = session.user.email;
      const fullName = session.user.user_metadata?.full_name ||
                       session.user.user_metadata?.name ||
                       email.split('@')[0];

      // Complete signup via API
      const response = await fetch(`${API_BASE_URL}/api/signup-invite-link-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authUserId: session.user.id,
          email,
          fullName,
          inviteCode: this.inviteCode
        })
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.code === 'USER_EXISTS') {
          // User already exists - just redirect
          window.location.href = '/home';
          return;
        }
        this.showError(result.error || 'Failed to complete signup.');
        return;
      }

      // Clear hash and redirect
      window.history.replaceState({}, '', window.location.pathname);
      window.location.href = '/home';

    } catch (error) {
      console.error('[Join] OAuth callback error:', error);
      this.showError('Something went wrong. Please try again.');
    }
  }

  async validateInviteLink() {
    try {
      // Query the table directly (RLS policy allows public SELECT for valid links)
      const { data, error } = await this.supabase
        .from('invite_links')
        .select('*, organizations(name)')
        .eq('code', this.inviteCode)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error) {
        console.error('[Join] Validation error:', error);
        if (error.code === 'PGRST116') {
          // No rows returned
          this.showError('This invite link is invalid or has expired.');
        } else {
          this.showError('Failed to validate invite link. Please try again.');
        }
        return;
      }

      if (!data) {
        this.showError('This invite link does not exist.');
        return;
      }

      // Check if maxed out
      if (data.max_uses > 0 && data.use_count >= data.max_uses) {
        this.showError('This invite link has reached its maximum number of uses.');
        return;
      }

      // Build the link object with computed fields
      this.inviteLink = {
        ...data,
        organization_id: data.organization_id,
        organization_name: data.organizations?.name || 'this organization',
        remaining_uses: data.max_uses === 0 ? -1 : data.max_uses - data.use_count,
        is_valid: true
      };

      this.showJoinForm();
    } catch (error) {
      console.error('[Join] Error validating link:', error);
      this.showError('Something went wrong. Please try again.');
    }
  }

  showJoinForm() {
    const loadingState = document.getElementById('loadingState');
    const joinContent = document.getElementById('joinContent');
    const orgName = document.getElementById('orgName');
    const spotsBadge = document.getElementById('spotsBadge');

    loadingState.style.display = 'none';
    joinContent.style.display = 'block';

    // Display organization name
    orgName.textContent = this.inviteLink.organization_name || 'this organization';

    // Display remaining spots
    const remaining = this.inviteLink.remaining_uses;
    if (remaining > 0) {
      spotsBadge.textContent = `${remaining} spot${remaining === 1 ? '' : 's'} remaining`;
      spotsBadge.style.display = 'inline-block';
    } else if (remaining === -1) {
      // Unlimited
      spotsBadge.style.display = 'none';
    } else {
      spotsBadge.textContent = 'Limited spots';
      spotsBadge.style.display = 'inline-block';
    }
  }

  showError(message) {
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const errorMessage = document.getElementById('errorMessage');

    loadingState.style.display = 'none';
    errorState.style.display = 'block';
    errorMessage.textContent = message;
  }

  showFormError(message) {
    const formError = document.getElementById('formError');
    formError.textContent = message;
    formError.style.display = 'block';
  }

  hideFormError() {
    const formError = document.getElementById('formError');
    formError.style.display = 'none';
  }

  bindEvents() {
    const form = document.getElementById('joinForm');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    // OAuth buttons
    const googleBtn = document.getElementById('googleBtn');
    const microsoftBtn = document.getElementById('microsoftBtn');

    if (googleBtn) {
      googleBtn.addEventListener('click', () => this.signInWithGoogle());
    }
    if (microsoftBtn) {
      microsoftBtn.addEventListener('click', () => this.signInWithMicrosoft());
    }
  }

  async signInWithGoogle() {
    const googleBtn = document.getElementById('googleBtn');
    if (googleBtn) {
      googleBtn.disabled = true;
      googleBtn.innerHTML = '<span class="icon icon-loader" style="width:20px;height:20px;animation:spin 1s linear infinite;"></span> Redirecting...';
    }

    try {
      // Redirect back to this join page after OAuth
      const redirectTo = `${window.location.origin}/join/${this.inviteCode}`;

      const { error } = await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
      });

      if (error) {
        console.error('[Join] Google OAuth error:', error);
        this.showFormError('Failed to start Google sign-in. Please try again.');
        if (googleBtn) {
          googleBtn.disabled = false;
          googleBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Continue with Google';
        }
      }
      // Browser will redirect to Google
    } catch (err) {
      console.error('[Join] Google OAuth exception:', err);
      this.showFormError('Something went wrong. Please try again.');
    }
  }

  async signInWithMicrosoft() {
    const microsoftBtn = document.getElementById('microsoftBtn');
    if (microsoftBtn) {
      microsoftBtn.disabled = true;
      microsoftBtn.innerHTML = '<span class="icon icon-loader" style="width:20px;height:20px;animation:spin 1s linear infinite;"></span> Redirecting...';
    }

    try {
      // Redirect back to this join page after OAuth
      const redirectTo = `${window.location.origin}/join/${this.inviteCode}`;

      const { error } = await this.supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo,
          scopes: 'openid profile email'
        }
      });

      if (error) {
        console.error('[Join] Microsoft OAuth error:', error);
        this.showFormError('Failed to start Microsoft sign-in. Please try again.');
        if (microsoftBtn) {
          microsoftBtn.disabled = false;
          microsoftBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F25022"/><path d="M22 11.4h-9.4V2H22v9.4z" fill="#7FBA00"/><path d="M11.4 22H2v-9.4h9.4V22z" fill="#00A4EF"/><path d="M22 22h-9.4v-9.4H22V22z" fill="#FFB900"/></svg> Continue with Microsoft';
        }
      }
      // Browser will redirect to Microsoft
    } catch (err) {
      console.error('[Join] Microsoft OAuth exception:', err);
      this.showFormError('Something went wrong. Please try again.');
    }
  }

  async handleSubmit(e) {
    e.preventDefault();
    this.hideFormError();

    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const joinBtn = document.getElementById('joinBtn');

    // Validation
    if (!fullName) {
      this.showFormError('Please enter your name.');
      return;
    }

    if (!email || !this.isValidEmail(email)) {
      this.showFormError('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 8) {
      this.showFormError('Password must be at least 8 characters.');
      return;
    }

    // Disable button and show loading
    joinBtn.disabled = true;
    joinBtn.textContent = 'Creating account...';

    try {
      // Call the API endpoint to create user via invite link
      const response = await fetch(`${API_BASE_URL}/api/signup-invite-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          inviteCode: this.inviteCode
        })
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.code === 'USER_EXISTS') {
          this.showFormError('An account with this email already exists. Please sign in instead.');
        } else {
          this.showFormError(result.error || 'Failed to create account.');
        }
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join Team';
        return;
      }

      // Success - sign in the user
      joinBtn.textContent = 'Signing in...';

      const { error: signInError } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        console.error('[Join] Sign in error:', signInError);
        // Account was created, but sign-in failed - redirect to login
        window.location.href = '/login?message=Account%20created.%20Please%20sign%20in.';
        return;
      }

      // Redirect to home
      window.location.href = '/home';

    } catch (error) {
      console.error('[Join] Signup error:', error);
      this.showFormError('Something went wrong. Please try again.');
      joinBtn.disabled = false;
      joinBtn.textContent = 'Join Team';
    }
  }

  async handleLoggedInUser(session) {
    // User is already logged in
    // Check if they're already a member of this organization
    try {
      const { data: link, error } = await this.supabase
        .from('invite_links')
        .select('*, organizations(name)')
        .eq('code', this.inviteCode)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !link) {
        this.showError('This invite link is invalid or has expired.');
        return;
      }

      // Check if maxed out
      if (link.max_uses > 0 && link.use_count >= link.max_uses) {
        this.showError('This invite link has reached its maximum number of uses.');
        return;
      }

      const orgId = link.organization_id;

      // Check if user is already in this org
      const { data: profile } = await this.supabase
        .from('users')
        .select('id, organization_id')
        .eq('auth_user_id', session.user.id)
        .single();

      if (profile && profile.organization_id === orgId) {
        // Already a member - redirect to home
        window.location.href = '/home';
        return;
      }

      // User exists but not in this org
      // For now, show a message that they need to sign out and use a new account
      // (Adding existing users to new orgs via invite link would require more complex logic)
      const loadingState = document.getElementById('loadingState');
      loadingState.innerHTML = `
        <div style="text-align: center;">
          <p style="margin-bottom: var(--space-4);">You're signed in as <strong>${session.user.email}</strong></p>
          <p style="color: var(--color-text-secondary); margin-bottom: var(--space-4);">
            This invite link is for a different organization. To join, please sign out and create a new account.
          </p>
          <div style="display: flex; gap: var(--space-2); justify-content: center;">
            <a href="/home" class="btn btn-secondary" style="display: inline-block; padding: var(--space-2) var(--space-4); text-decoration: none; border-radius: var(--radius-md); background: var(--color-bg-secondary);">Go to Dashboard</a>
            <button onclick="window.joinPage.signOut()" class="btn btn-primary" style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); background: var(--color-primary); border: none; cursor: pointer;">Sign Out</button>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('[Join] Error checking user status:', error);
      this.showError('Something went wrong. Please try again.');
    }
  }

  async signOut() {
    await this.supabase.auth.signOut();
    window.location.reload();
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.joinPage = new JoinPage();
});
