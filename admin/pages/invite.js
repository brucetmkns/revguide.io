/**
 * RevGuide - Invitation Acceptance Page
 * Handles accepting team invitations via token link
 */

document.addEventListener('DOMContentLoaded', async () => {
  const inviteIcon = document.getElementById('inviteIcon');
  const inviteTitle = document.getElementById('inviteTitle');
  const inviteMessage = document.getElementById('inviteMessage');
  const inviteContent = document.getElementById('inviteContent');

  // Get token from URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) {
    showError('Invalid Invitation', 'No invitation token provided. Please check the link in your email.');
    return;
  }

  // Check if user is logged in
  const { data: { session } } = await RevGuideAuth.getSession();

  if (!session) {
    // Not logged in - redirect to login with return path
    const returnPath = `/invite?token=${encodeURIComponent(token)}`;
    window.location.href = `/login?request_path=${encodeURIComponent(returnPath)}`;
    return;
  }

  // User is logged in - fetch and verify the invitation
  try {
    const { data: invitation, error } = await RevGuideDB.getInvitationByToken(token);

    if (error || !invitation) {
      showError('Invitation Not Found', 'This invitation may have expired or already been used. Please ask your team admin to send a new invitation.');
      return;
    }

    // Check if user's email matches the invitation
    const userEmail = session.user.email.toLowerCase();
    const inviteEmail = invitation.email.toLowerCase();

    if (userEmail !== inviteEmail) {
      showEmailMismatch(invitation, userEmail);
      return;
    }

    // Show invitation details and accept button
    showInvitation(invitation);

  } catch (error) {
    console.error('Error loading invitation:', error);
    showError('Error', 'Failed to load invitation. Please try again.');
  }

  /**
   * Show the invitation details with accept button
   */
  function showInvitation(invitation) {
    const orgName = invitation.organizations?.name || 'Unknown Organization';
    const roleName = invitation.role === 'admin' ? 'Admin' : 'Member';

    inviteContent.innerHTML = `
      <svg class="invite-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <h2 class="invite-title">You're Invited!</h2>
      <p class="invite-message">You've been invited to join a team on RevGuide.</p>

      <div class="invite-details">
        <div class="invite-detail-row">
          <span class="invite-detail-label">Organization</span>
          <span class="invite-detail-value">${escapeHtml(orgName)}</span>
        </div>
        <div class="invite-detail-row">
          <span class="invite-detail-label">Your Role</span>
          <span class="invite-detail-value">${roleName}</span>
        </div>
        <div class="invite-detail-row">
          <span class="invite-detail-label">Email</span>
          <span class="invite-detail-value">${escapeHtml(invitation.email)}</span>
        </div>
      </div>

      <div class="invite-actions">
        <button class="invite-btn invite-btn-primary" id="acceptBtn">Accept Invitation</button>
        <a href="/login" class="invite-btn invite-btn-secondary">Decline</a>
      </div>

      <div class="invite-footer">
        <p>By accepting, you'll join ${escapeHtml(orgName)} and gain access to their shared content.</p>
      </div>
    `;

    // Add accept handler
    document.getElementById('acceptBtn').addEventListener('click', () => acceptInvitation(invitation));
  }

  /**
   * Show email mismatch error
   */
  function showEmailMismatch(invitation, loggedInEmail) {
    inviteContent.innerHTML = `
      <svg class="invite-icon error" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <h2 class="invite-title">Email Mismatch</h2>
      <p class="invite-message">This invitation was sent to a different email address.</p>

      <div class="invite-details">
        <div class="invite-detail-row">
          <span class="invite-detail-label">Invitation for</span>
          <span class="invite-detail-value">${escapeHtml(invitation.email)}</span>
        </div>
        <div class="invite-detail-row">
          <span class="invite-detail-label">You're logged in as</span>
          <span class="invite-detail-value">${escapeHtml(loggedInEmail)}</span>
        </div>
      </div>

      <div class="invite-actions">
        <button class="invite-btn invite-btn-primary" id="logoutBtn">Sign in with ${escapeHtml(invitation.email)}</button>
        <a href="/home" class="invite-btn invite-btn-secondary">Go to Dashboard</a>
      </div>

      <div class="invite-footer">
        <p>You need to sign in with the email address the invitation was sent to.</p>
      </div>
    `;

    // Add logout and redirect handler
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await RevGuideAuth.signOut();
      const returnPath = `/invite?token=${encodeURIComponent(token)}`;
      window.location.href = `/login?request_path=${encodeURIComponent(returnPath)}`;
    });
  }

  /**
   * Accept the invitation
   */
  async function acceptInvitation(invitation) {
    const acceptBtn = document.getElementById('acceptBtn');
    acceptBtn.disabled = true;
    acceptBtn.textContent = 'Accepting...';

    try {
      const { data, error } = await RevGuideDB.acceptInvitation(invitation.id);

      if (error) {
        throw error;
      }

      showSuccess(invitation.organizations?.name || 'the team');

    } catch (error) {
      console.error('Failed to accept invitation:', error);
      acceptBtn.disabled = false;
      acceptBtn.textContent = 'Accept Invitation';
      showError('Failed to Accept', error.message || 'Something went wrong. Please try again.');
    }
  }

  /**
   * Show success state
   */
  function showSuccess(orgName) {
    inviteContent.innerHTML = `
      <svg class="invite-icon success" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <h2 class="invite-title">Welcome to the Team!</h2>
      <p class="invite-message">You've successfully joined ${escapeHtml(orgName)}. You now have access to all shared banners, plays, and wiki entries.</p>

      <div class="invite-actions">
        <a href="/home" class="invite-btn invite-btn-primary">Go to Dashboard</a>
      </div>

      <div class="invite-footer">
        <p>Install the <a href="https://chrome.google.com/webstore" target="_blank">Chrome extension</a> to see content in HubSpot.</p>
      </div>
    `;
  }

  /**
   * Show error state
   */
  function showError(title, message) {
    inviteContent.innerHTML = `
      <svg class="invite-icon error" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <h2 class="invite-title">${escapeHtml(title)}</h2>
      <p class="invite-message">${escapeHtml(message)}</p>

      <div class="invite-actions">
        <a href="/login" class="invite-btn invite-btn-primary">Sign In</a>
        <a href="/" class="invite-btn invite-btn-secondary">Go to Homepage</a>
      </div>
    `;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
