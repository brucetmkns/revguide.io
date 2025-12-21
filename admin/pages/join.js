/**
 * RevGuide - Join via Invite Link Page
 *
 * Handles user signup via shareable invite links.
 */

const SUPABASE_URL = 'https://qbdhvhrowmfnacyikkbf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiZGh2aHJvd21mbmFjeWlra2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQyOTI5NDksImV4cCI6MjA0OTg2ODk0OX0.7FpNlKfhoFfJajMnNy-xRF37px6MrGmPHr-wu0J5f-o';
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
