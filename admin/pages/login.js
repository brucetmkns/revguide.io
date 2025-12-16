/**
 * RevGuide - Login Page
 * Handles Magic Link, Google OAuth, and HubSpot OAuth via Nango
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const googleBtn = document.getElementById('googleBtn');
  const hubspotBtn = document.getElementById('hubspotBtn');
  const loginMessage = document.getElementById('loginMessage');
  const emailInput = document.getElementById('email');

  // Join Org Modal elements
  const joinOrgModal = document.getElementById('joinOrgModal');
  const existingOrgName = document.getElementById('existingOrgName');
  const existingPortalName = document.getElementById('existingPortalName');
  const joinExistingOrgBtn = document.getElementById('joinExistingOrgBtn');
  const createNewOrgBtn = document.getElementById('createNewOrgBtn');

  // Store pending OAuth completion data
  let pendingOAuthData = null;

  // Check if already logged in
  const { data: { session } } = await RevGuideAuth.getSession();
  if (session) {
    window.location.href = '/home';
    return;
  }

  // Check for auth callback (magic link or OAuth return)
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const queryParams = new URLSearchParams(window.location.search);

  // Handle Supabase auth callback (magic link or Google OAuth)
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

  // Handle Nango OAuth callback (HubSpot)
  const nangoConnectionId = queryParams.get('nango_connection_id');
  if (nangoConnectionId) {
    showMessage('Completing HubSpot connection...', 'success');
    await handleNangoCallback(nangoConnectionId);
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

  // Google OAuth (hidden until configured)
  if (googleBtn) {
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
  }

  // HubSpot OAuth via Nango
  hubspotBtn.addEventListener('click', async () => {
    hubspotBtn.disabled = true;
    hubspotBtn.innerHTML = `
      <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="0"/>
      </svg>
      Connecting...
    `;

    try {
      // Generate a unique connection ID for this auth attempt
      const connectionId = generateConnectionId();

      // Store connection ID in session storage for callback handling
      sessionStorage.setItem('pendingNangoConnection', connectionId);

      // Start Nango OAuth flow
      const result = await RevGuideNango.connectHubSpot(connectionId);

      if (result.success) {
        // OAuth popup completed successfully
        // Check if an org already exists for this portal
        await handleOAuthSuccess(connectionId, result);
      } else {
        showMessage(result.error || 'Failed to connect HubSpot', 'error');
        resetHubSpotButton();
      }
    } catch (err) {
      console.error('HubSpot OAuth error:', err);
      showMessage('Failed to start HubSpot sign-in. Please try again.', 'error');
      resetHubSpotButton();
    }
  });

  // Join Organization Modal handlers
  joinExistingOrgBtn.addEventListener('click', async () => {
    if (!pendingOAuthData) return;

    joinExistingOrgBtn.disabled = true;
    joinExistingOrgBtn.textContent = 'Joining...';

    try {
      await completeOAuthWithOrg(pendingOAuthData.connectionId, pendingOAuthData.organizationId, true);
    } catch (err) {
      showMessage('Failed to join organization. Please try again.', 'error');
      joinExistingOrgBtn.disabled = false;
      joinExistingOrgBtn.textContent = 'Join This Organization';
    }
  });

  createNewOrgBtn.addEventListener('click', async () => {
    if (!pendingOAuthData) return;

    createNewOrgBtn.disabled = true;
    createNewOrgBtn.textContent = 'Creating...';

    try {
      await completeOAuthWithOrg(pendingOAuthData.connectionId, null, false);
    } catch (err) {
      showMessage('Failed to create organization. Please try again.', 'error');
      createNewOrgBtn.disabled = false;
      createNewOrgBtn.textContent = 'Create New Organization';
    }
  });

  // Close modal on backdrop click
  joinOrgModal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    hideJoinOrgModal();
    resetHubSpotButton();
  });

  /**
   * Handle successful OAuth flow
   */
  async function handleOAuthSuccess(connectionId, result) {
    // Get portal info and check for existing org
    const portalInfo = await RevGuideNango.getPortalInfo(connectionId);

    if (!portalInfo) {
      showMessage('Failed to get HubSpot portal info. Please try again.', 'error');
      resetHubSpotButton();
      return;
    }

    // Check if an organization already exists for this portal
    const existingOrg = await RevGuideDB.getOrganizationByPortalId(portalInfo.portalId);

    if (existingOrg) {
      // Show join organization modal
      pendingOAuthData = {
        connectionId,
        portalInfo,
        organizationId: existingOrg.id,
        organizationName: existingOrg.name
      };

      existingOrgName.textContent = existingOrg.name;
      existingPortalName.textContent = portalInfo.portalDomain || portalInfo.portalId;
      showJoinOrgModal();
    } else {
      // No existing org - create new one and sign in
      await completeOAuthWithOrg(connectionId, null, false, portalInfo);
    }
  }

  /**
   * Complete OAuth flow by creating/joining org and signing in
   */
  async function completeOAuthWithOrg(connectionId, existingOrgId, joinExisting, portalInfo = null) {
    showMessage('Setting up your account...', 'success');
    hideJoinOrgModal();

    try {
      // If no portal info provided, fetch it
      if (!portalInfo) {
        portalInfo = await RevGuideNango.getPortalInfo(connectionId);
      }

      let organizationId = existingOrgId;

      if (!joinExisting || !existingOrgId) {
        // Create new organization
        const { data: newOrg, error: orgError } = await RevGuideDB.createOrganization({
          name: portalInfo?.portalName || 'My Organization',
          hubspot_portal_id: portalInfo?.portalId,
          hubspot_portal_domain: portalInfo?.portalDomain,
          nango_connection_id: connectionId
        });

        if (orgError) {
          throw new Error('Failed to create organization');
        }

        organizationId = newOrg.id;
      }

      // Get or create the user and link to org
      const { data: { user } } = await RevGuideAuth.getUser();

      if (user) {
        // User is already signed in - just link to org
        await RevGuideDB.linkUserToOrganization(user.id, organizationId);
      } else {
        // Need to sign in first - store the org ID for after sign in
        sessionStorage.setItem('pendingOrganizationId', organizationId);
        sessionStorage.setItem('pendingConnectionId', connectionId);

        // Redirect to sign up with HubSpot email
        if (portalInfo?.userEmail) {
          // Pre-fill email and send magic link
          emailInput.value = portalInfo.userEmail;
          showMessage('Please sign in to complete setup. Check your email for the magic link.', 'success');
          loginForm.dispatchEvent(new Event('submit'));
        } else {
          showMessage('Please enter your email to complete sign up.', 'success');
          emailInput.focus();
        }
        return;
      }

      // Create HubSpot connection record
      await RevGuideDB.createHubSpotConnection({
        organization_id: organizationId,
        portal_id: portalInfo.portalId,
        portal_domain: portalInfo.portalDomain,
        portal_name: portalInfo.portalName,
        nango_connection_id: connectionId
      });

      // Success - redirect to home
      window.location.href = '/home';
    } catch (err) {
      console.error('OAuth completion error:', err);
      showMessage('Failed to complete setup. Please try again.', 'error');
      resetHubSpotButton();
    }
  }

  /**
   * Handle Nango callback from URL parameter
   */
  async function handleNangoCallback(connectionId) {
    try {
      // Fetch the OAuth completion status from our edge function
      const response = await fetch(`/api/nango/connection?connectionId=${connectionId}`);
      const data = await response.json();

      if (data.isConnected) {
        // Check for pending organization linking
        const pendingOrgId = sessionStorage.getItem('pendingOrganizationId');

        if (pendingOrgId) {
          sessionStorage.removeItem('pendingOrganizationId');
          sessionStorage.removeItem('pendingConnectionId');

          // Link user to org and redirect
          const { data: { user } } = await RevGuideAuth.getUser();
          if (user) {
            await RevGuideDB.linkUserToOrganization(user.id, pendingOrgId);
          }
        }

        window.location.href = '/home';
      } else {
        showMessage('HubSpot connection not found. Please try again.', 'error');
      }
    } catch (err) {
      console.error('Nango callback error:', err);
      showMessage('Failed to complete HubSpot connection.', 'error');
    }
  }

  /**
   * Show the join organization modal
   */
  function showJoinOrgModal() {
    joinOrgModal.style.display = 'flex';
  }

  /**
   * Hide the join organization modal
   */
  function hideJoinOrgModal() {
    joinOrgModal.style.display = 'none';
    pendingOAuthData = null;
  }

  /**
   * Reset HubSpot button to initial state
   */
  function resetHubSpotButton() {
    hubspotBtn.disabled = false;
    hubspotBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984 2.21 2.21 0 00-2.212-2.212 2.21 2.21 0 00-2.212 2.212c0 .863.502 1.609 1.227 1.968v2.879a5.197 5.197 0 00-2.382 1.193l-6.376-4.96a2.567 2.567 0 00.09-.62 2.453 2.453 0 00-2.455-2.456A2.453 2.453 0 002.656 3.56a2.453 2.453 0 002.455 2.456c.405 0 .784-.103 1.12-.28l6.272 4.879a5.19 5.19 0 00-.701 2.605 5.222 5.222 0 005.222 5.222 5.222 5.222 0 005.222-5.222 5.207 5.207 0 00-4.082-5.089zm-1.14 7.526a2.637 2.637 0 01-2.639-2.639 2.637 2.637 0 012.639-2.639 2.637 2.637 0 012.639 2.639 2.637 2.637 0 01-2.639 2.639z"/>
      </svg>
      Continue with HubSpot
    `;
  }

  /**
   * Generate a unique connection ID
   */
  function generateConnectionId() {
    return 'conn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Show a message to the user
   */
  function showMessage(text, type) {
    loginMessage.textContent = text;
    loginMessage.className = `login-message ${type}`;
    loginMessage.style.display = 'block';
  }
});
