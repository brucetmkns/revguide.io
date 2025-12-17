/**
 * RevGuide - Settings Page
 */

const HUBSPOT_CONNECTION_CACHE_KEY = 'revguide_hubspot_connection';
const HUBSPOT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

class SettingsPage {
  constructor() {
    this.settings = {};
    this.teamMembers = [];
    this.pendingInvitations = [];
    this.isViewOnly = false; // View-only mode for members
    this.init();
  }

  // HubSpot connection cache methods
  loadHubSpotConnectionFromCache() {
    try {
      const cached = sessionStorage.getItem(HUBSPOT_CONNECTION_CACHE_KEY);
      if (cached) {
        const { connection, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < HUBSPOT_CACHE_TTL) {
          return connection;
        }
      }
    } catch (e) {}
    return null;
  }

  saveHubSpotConnectionToCache(connection) {
    try {
      sessionStorage.setItem(HUBSPOT_CONNECTION_CACHE_KEY, JSON.stringify({
        connection,
        timestamp: Date.now()
      }));
    } catch (e) {}
  }

  clearHubSpotConnectionCache() {
    try {
      sessionStorage.removeItem(HUBSPOT_CONNECTION_CACHE_KEY);
    } catch (e) {}
  }

  async init() {
    console.log('[Settings] init() started');

    // Show appropriate HubSpot card based on context FIRST to prevent flashing
    this.setupHubSpotCards();

    // Check authentication (redirects to login if not authenticated)
    const isAuthenticated = await AdminShared.checkAuth();
    console.log('[Settings] isAuthenticated:', isAuthenticated);
    if (!isAuthenticated) return;

    // Check if user is a member (view-only mode)
    this.isViewOnly = AdminShared.isMember();

    // Render sidebar
    AdminShared.renderSidebar('settings');

    // Setup view-only UI if member
    if (this.isViewOnly) {
      this.setupViewOnlyMode();
    }

    // Check if returning from OAuth flow (web context only, admin only)
    if (!AdminShared.isExtensionContext && !this.isViewOnly) {
      await this.handleOAuthCallback();
    }

    // Load data
    console.log('[Settings] Loading storage data...');
    const data = await AdminShared.loadStorageData();
    this.settings = data.settings;

    // Populate UI
    this.updateSettingsUI();

    // Load team members from database (web context) or local storage (extension)
    // Only load if admin - members don't need to see the team list
    if (!this.isViewOnly) {
      await this.loadTeamData();
      this.renderUsersTable();
    }

    // Load account settings (user email, company name)
    console.log('[Settings] About to call loadAccountSettings()');
    await this.loadAccountSettings();

    // Load HubSpot connection status (admin only)
    if (!this.isViewOnly) {
      await this.loadHubSpotConnectionStatus();
    }

    // Bind events
    this.bindEvents();
    console.log('[Settings] init() completed');
  }

  setupViewOnlyMode() {
    // Hide HubSpot connection section
    const hubspotCard = document.getElementById('hubspotSettingsCard');
    const hubspotExtCard = document.getElementById('hubspotExtensionCard');
    if (hubspotCard) hubspotCard.style.display = 'none';
    if (hubspotExtCard) hubspotExtCard.style.display = 'none';

    // Hide team management section
    const teamCard = document.getElementById('teamSettingsCard');
    if (teamCard) teamCard.style.display = 'none';

    // Update page title/description
    const sectionDesc = document.querySelector('.section-description');
    if (sectionDesc) {
      sectionDesc.textContent = 'Manage your account preferences.';
    }

    // Add view-only note to account section
    const accountCard = document.getElementById('accountSettingsCard');
    if (accountCard) {
      const note = document.createElement('p');
      note.className = 'settings-note';
      note.textContent = 'Contact your admin to change HubSpot connection or invite team members.';
      note.style.cssText = 'color: var(--color-text-tertiary); font-size: 14px; margin-top: 16px; padding: 12px; background: #f3e8ff; border-radius: 8px;';
      accountCard.appendChild(note);
    }
  }

  /**
   * Load team members and pending invitations from database
   */
  async loadTeamData() {
    // In web context, load from Supabase - parallelize the two queries
    if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
      try {
        // Load team members and invitations in parallel
        const [membersResult, invitationsResult] = await Promise.all([
          RevGuideDB.getTeamMembers(),
          RevGuideDB.getInvitations()
        ]);

        if (membersResult.error) {
          console.error('[Settings] Error loading team members:', membersResult.error);
        } else {
          this.teamMembers = membersResult.data || [];
        }

        if (invitationsResult.error) {
          console.error('[Settings] Error loading invitations:', invitationsResult.error);
        } else {
          this.pendingInvitations = invitationsResult.data || [];
        }

        console.log('[Settings] Loaded', this.teamMembers.length, 'members and', this.pendingInvitations.length, 'invitations');
      } catch (error) {
        console.error('[Settings] Failed to load team data:', error);
      }
    } else {
      // In extension context, use local storage (legacy)
      const data = await AdminShared.loadStorageData();
      this.teamMembers = [];
      this.pendingInvitations = (data.invitedUsers || []).map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        created_at: u.invitedAt ? new Date(u.invitedAt).toISOString() : new Date().toISOString()
      }));
    }
  }

  /**
   * Handle OAuth callback if returning from HubSpot
   */
  async handleOAuthCallback() {
    const oauthReturn = RevGuideHubSpot.checkOAuthReturn();

    if (!oauthReturn.isReturning) {
      return;
    }

    console.log('[Settings] Returning from OAuth flow:', oauthReturn);

    // Clear URL parameters
    RevGuideHubSpot.clearOAuthParams();

    // Clear HubSpot cache so we fetch fresh connection status
    this.clearHubSpotConnectionCache();

    if (oauthReturn.success) {
      const portalName = oauthReturn.portal || 'HubSpot';
      AdminShared.showToast(`Connected to ${portalName} successfully!`, 'success');
    } else if (oauthReturn.error) {
      AdminShared.showToast(`Connection failed: ${oauthReturn.error}`, 'error');
    } else {
      AdminShared.showToast('HubSpot connection was cancelled.', 'warning');
    }
  }

  setupHubSpotCards() {
    const oauthCard = document.getElementById('hubspotOAuthCard');
    // Always show OAuth card
    if (oauthCard) oauthCard.style.display = 'block';
  }

  async loadHubSpotConnectionStatus() {
    const loadingState = document.getElementById('hubspotLoadingState');
    const connectedState = document.getElementById('hubspotConnectedState');
    const disconnectedState = document.getElementById('hubspotDisconnectedState');

    // Try to load from session cache first for instant display
    const cached = this.loadHubSpotConnectionFromCache();
    if (cached !== null) {
      if (loadingState) loadingState.style.display = 'none';
      this.displayHubSpotConnection(cached);
      return;
    }

    try {
      // Get connection status from HubSpot client
      const connection = await RevGuideHubSpot.getConnection();

      // Hide loading state
      if (loadingState) loadingState.style.display = 'none';

      // Cache and display the connection
      this.saveHubSpotConnectionToCache(connection);
      this.displayHubSpotConnection(connection);
    } catch (error) {
      console.error('Error loading HubSpot connection:', error);
      // Hide loading state and show disconnected state on error
      if (loadingState) loadingState.style.display = 'none';
      connectedState.style.display = 'none';
      disconnectedState.style.display = 'block';
      this.currentConnection = null;
    }
  }

  displayHubSpotConnection(connection) {
    const connectedState = document.getElementById('hubspotConnectedState');
    const disconnectedState = document.getElementById('hubspotDisconnectedState');

    if (connection && connection.isConnected) {
      // Show connected state
      connectedState.style.display = 'block';
      disconnectedState.style.display = 'none';

      // Update portal info
      document.getElementById('connectedPortalName').textContent = connection.portalName || 'HubSpot Portal';
      document.getElementById('connectedPortalDomain').textContent = connection.portalDomain || connection.portalId;

      // Store connection for disconnect action
      this.currentConnection = {
        id: connection.connectionId,
        portal_name: connection.portalName,
        portal_domain: connection.portalDomain,
        portal_id: connection.portalId
      };
    } else {
      // Show disconnected state
      connectedState.style.display = 'none';
      disconnectedState.style.display = 'block';
      this.currentConnection = null;
    }
  }

  updateSettingsUI() {
    // Load display options
    document.getElementById('showBanners').checked = this.settings.showBanners !== false;
    document.getElementById('showBattleCards').checked = this.settings.showBattleCards !== false;
    document.getElementById('showPresentations').checked = this.settings.showPresentations !== false;
    document.getElementById('showAdminLinks').checked = this.settings.showAdminLinks !== false;
    document.getElementById('bannerPosition').value = this.settings.bannerPosition || 'top';
  }

  bindEvents() {
    // Account Settings - Edit/Cancel/Save buttons
    const editAccountBtn = document.getElementById('editAccountBtn');
    const cancelAccountBtn = document.getElementById('cancelAccountBtn');
    const saveAccountBtn = document.getElementById('saveAccountBtn');

    if (editAccountBtn) {
      editAccountBtn.addEventListener('click', () => this.enterAccountEditMode());
    }
    if (cancelAccountBtn) {
      cancelAccountBtn.addEventListener('click', () => this.exitAccountEditMode());
    }
    if (saveAccountBtn) {
      saveAccountBtn.addEventListener('click', () => this.saveAccountSettings());
    }

    // HubSpot OAuth buttons (web context)
    const connectHubSpotBtn = document.getElementById('connectHubSpotSettingsBtn');
    const disconnectHubSpotBtn = document.getElementById('disconnectHubSpotBtn');

    if (connectHubSpotBtn) {
      connectHubSpotBtn.addEventListener('click', () => this.connectHubSpot());
    }
    if (disconnectHubSpotBtn) {
      disconnectHubSpotBtn.addEventListener('click', () => this.disconnectHubSpot());
    }

    // Display options - auto-save on change
    document.getElementById('showBanners').addEventListener('change', (e) => {
      this.settings.showBanners = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('showBattleCards').addEventListener('change', (e) => {
      this.settings.showBattleCards = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('showPresentations').addEventListener('change', (e) => {
      this.settings.showPresentations = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('showAdminLinks').addEventListener('change', (e) => {
      this.settings.showAdminLinks = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('bannerPosition').addEventListener('change', (e) => {
      this.settings.bannerPosition = e.target.value;
      this.saveSettings();
    });

    // Import/Export
    document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => this.importData(e));

    // User Management
    document.getElementById('inviteUserBtn').addEventListener('click', () => this.openInviteModal());
    document.getElementById('inviteUserEmptyBtn').addEventListener('click', () => this.openInviteModal());
    document.getElementById('closeInviteModal').addEventListener('click', () => this.closeInviteModal());
    document.getElementById('cancelInviteBtn').addEventListener('click', () => this.closeInviteModal());
    document.getElementById('sendInviteBtn').addEventListener('click', () => this.sendInvitation());

    // Close modal on backdrop click
    document.getElementById('inviteModal').addEventListener('click', (e) => {
      if (e.target.id === 'inviteModal') {
        this.closeInviteModal();
      }
    });

    // User table action buttons (delegated)
    document.getElementById('usersTableBody').addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.delete-user-btn');
      if (deleteBtn) {
        const userId = deleteBtn.dataset.id;
        const type = deleteBtn.dataset.type;
        const email = deleteBtn.dataset.email;
        this.deleteUser(userId, type, email);
        return;
      }

      const resendBtn = e.target.closest('.resend-invite-btn');
      if (resendBtn) {
        const inviteId = resendBtn.dataset.id;
        const email = resendBtn.dataset.email;
        const role = resendBtn.dataset.role;
        this.resendInvitation(inviteId, email, role);
      }
    });
  }

  async saveSettings() {
    await AdminShared.saveStorageData({ settings: this.settings });
    AdminShared.showToast('Settings saved', 'success');
  }

  // ================================
  // Account Settings Methods
  // ================================

  async loadAccountSettings() {
    // Get data from already-loaded AdminShared (populated by checkAuth)
    let email = AdminShared.currentUser?.email;
    let name = AdminShared.currentUser?.name;
    let companyName = AdminShared.currentOrganization?.name;

    // If no email from profile, get from Supabase auth directly (fallback)
    if (!email && typeof RevGuideAuth !== 'undefined') {
      try {
        const result = await RevGuideAuth.getUser();
        const user = result?.data?.user;
        if (user?.email) {
          email = user.email;
        }
      } catch (e) {
        console.error('[Settings] Failed to load user email:', e);
      }
    }

    // Store original values for change detection
    this.originalUserName = name || '';
    this.originalCompanyName = companyName || '';

    // Update display mode values (shown by default)
    this.updateAccountDisplay(name, email, companyName);

    // Also populate edit form inputs for when user clicks Edit
    const userNameInput = document.getElementById('userName');
    const userEmailInput = document.getElementById('userEmail');
    const companyNameInput = document.getElementById('companyName');

    if (userNameInput) userNameInput.value = name || '';
    if (userEmailInput) {
      userEmailInput.value = email || '';
      userEmailInput.placeholder = email ? '' : 'Unable to load email';
    }
    if (companyNameInput) companyNameInput.value = companyName || '';
  }

  updateAccountDisplay(name, email, companyName) {
    const displayName = document.getElementById('displayUserName');
    const displayEmail = document.getElementById('displayUserEmail');
    const displayCompany = document.getElementById('displayCompanyName');

    if (displayName) {
      displayName.textContent = name || 'Not set';
      displayName.classList.toggle('empty', !name);
    }
    if (displayEmail) {
      displayEmail.textContent = email || 'Not available';
      displayEmail.classList.toggle('empty', !email);
    }
    if (displayCompany) {
      displayCompany.textContent = companyName || 'Not set';
      displayCompany.classList.toggle('empty', !companyName);
    }
  }

  enterAccountEditMode() {
    document.getElementById('accountDisplayMode').style.display = 'none';
    document.getElementById('accountEditMode').style.display = 'block';
    document.getElementById('editAccountBtn').style.display = 'none';

    // Focus the first input
    document.getElementById('userName')?.focus();
  }

  exitAccountEditMode() {
    document.getElementById('accountDisplayMode').style.display = 'block';
    document.getElementById('accountEditMode').style.display = 'none';
    document.getElementById('editAccountBtn').style.display = 'block';

    // Reset inputs to original values
    document.getElementById('userName').value = this.originalUserName;
    document.getElementById('companyName').value = this.originalCompanyName;

    // Clear any status message
    this.showAccountStatus('', '');
  }

  async saveAccountSettings() {
    const userNameInput = document.getElementById('userName');
    const companyNameInput = document.getElementById('companyName');
    const saveBtn = document.getElementById('saveAccountBtn');

    const userName = userNameInput.value.trim();
    const companyName = companyNameInput.value.trim();

    // Check if anything changed
    const nameChanged = userName !== this.originalUserName;
    const companyChanged = companyName !== this.originalCompanyName;

    if (!nameChanged && !companyChanged) {
      this.showAccountStatus('No changes to save', 'info');
      return;
    }

    // Show loading state
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving...';

    try {
      // Update user name if changed
      if (nameChanged) {
        const { error: userError } = await RevGuideDB.updateUserProfile({ name: userName });
        if (userError) {
          throw new Error(userError.message);
        }
        this.originalUserName = userName;
        if (AdminShared.currentUser) {
          AdminShared.currentUser.name = userName;
        }
      }

      // Update organization name if changed
      if (companyChanged) {
        const { error: orgError } = await RevGuideDB.updateOrganization({ name: companyName });
        if (orgError) {
          throw new Error(orgError.message);
        }
        this.originalCompanyName = companyName;
        if (AdminShared.currentOrganization) {
          AdminShared.currentOrganization.name = companyName;
        }
      }

      // Update the cache so other pages get the new values instantly
      AdminShared.refreshUserCache();

      // Update sidebar display
      AdminShared.renderSidebar('settings');

      // Update display mode with new values
      const email = document.getElementById('userEmail').value;
      this.updateAccountDisplay(userName, email, companyName);

      // Exit edit mode
      this.exitAccountEditMode();

      AdminShared.showToast('Account settings saved', 'success');
    } catch (error) {
      console.error('Failed to save account settings:', error);
      this.showAccountStatus(`Failed to save: ${error.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalText;
    }
  }

  showAccountStatus(message, type) {
    const statusEl = document.getElementById('accountStatus');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = 'status-message' + (type ? ` ${type}` : '');
    statusEl.style.display = message ? 'block' : 'none';

    // Auto-hide success/info messages after 3 seconds
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        statusEl.style.display = 'none';
      }, 3000);
    }
  }

  async exportData() {
    const data = await AdminShared.loadStorageData();

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      rules: data.rules,
      battleCards: data.battleCards,
      presentations: data.presentations,
      wikiEntries: data.wikiEntries,
      settings: data.settings
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revguide-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    AdminShared.showToast('Data exported successfully', 'success');
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate structure
      if (!importData.version) {
        throw new Error('Invalid backup file format');
      }

      // Confirm import
      const confirmMsg = `This will replace your current data with:\n` +
        `- ${importData.rules?.length || 0} rules\n` +
        `- ${importData.battleCards?.length || 0} plays\n` +
        `- ${importData.presentations?.length || 0} media items\n` +
        `- ${importData.wikiEntries?.length || 0} wiki entries\n\n` +
        `Continue?`;

      if (!confirm(confirmMsg)) {
        event.target.value = '';
        return;
      }

      // Import data
      await AdminShared.saveStorageData({
        rules: importData.rules || [],
        battleCards: importData.battleCards || [],
        presentations: importData.presentations || [],
        wikiEntries: importData.wikiEntries || [],
        settings: importData.settings || this.settings
      });

      AdminShared.showToast('Data imported successfully! Refreshing...', 'success');

      // Reload to show imported data
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      AdminShared.showToast(`Import failed: ${error.message}`, 'error');
    }

    event.target.value = '';
  }

  // ================================
  // User Management Methods
  // ================================

  renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    const tableContainer = document.getElementById('usersTableContainer');
    const emptyState = document.getElementById('usersEmptyState');

    const totalCount = this.teamMembers.length + this.pendingInvitations.length;

    if (totalCount === 0) {
      tableContainer.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    tableContainer.style.display = 'block';
    emptyState.style.display = 'none';

    // Combine and render both active members and pending invitations
    let rows = '';

    // Render active team members first
    for (const member of this.teamMembers) {
      const isCurrentUser = member.auth_user_id === AdminShared.currentUser?.auth_user_id;
      rows += `
        <tr data-id="${member.id}" data-type="member">
          <td>
            <strong>${AdminShared.escapeHtml(member.name || member.email)}</strong>
            ${member.name ? `<br><span class="text-muted">${AdminShared.escapeHtml(member.email)}</span>` : ''}
            ${isCurrentUser ? '<span class="badge badge-info" style="margin-left: 8px;">You</span>' : ''}
          </td>
          <td><span class="role-badge ${member.role}">${member.role}</span></td>
          <td><span class="badge badge-active">Active</span></td>
          <td>${this.formatDate(member.created_at)}</td>
          <td>
            <div class="action-buttons">
              ${!isCurrentUser ? `
                <button class="btn-icon-sm btn-danger-icon delete-user-btn" data-id="${member.id}" data-type="member" data-email="${AdminShared.escapeHtml(member.email)}" title="Remove user">
                  <span class="icon icon-trash icon--sm"></span>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }

    // Render pending invitations
    for (const invite of this.pendingInvitations) {
      rows += `
        <tr data-id="${invite.id}" data-type="invitation">
          <td><strong>${AdminShared.escapeHtml(invite.email)}</strong></td>
          <td><span class="role-badge ${invite.role}">${invite.role}</span></td>
          <td><span class="badge badge-pending">Pending</span></td>
          <td>${this.formatDate(invite.created_at)}</td>
          <td>
            <div class="action-buttons">
              <button class="btn-icon-sm resend-invite-btn" data-id="${invite.id}" data-email="${AdminShared.escapeHtml(invite.email)}" data-role="${invite.role}" title="Resend invitation">
                <span class="icon icon-send icon--sm"></span>
              </button>
              <button class="btn-icon-sm btn-danger-icon delete-user-btn" data-id="${invite.id}" data-type="invitation" data-email="${AdminShared.escapeHtml(invite.email)}" title="Cancel invitation">
                <span class="icon icon-trash icon--sm"></span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }

    tbody.innerHTML = rows;
  }

  formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  openInviteModal() {
    document.getElementById('inviteEmail').value = '';
    document.getElementById('inviteRole').value = 'member';
    document.getElementById('inviteModal').classList.add('open');
    document.getElementById('inviteEmail').focus();
  }

  closeInviteModal() {
    document.getElementById('inviteModal').classList.remove('open');
  }

  async sendInvitation() {
    const email = document.getElementById('inviteEmail').value.trim();
    const role = document.getElementById('inviteRole').value;

    // Validate email
    if (!email) {
      AdminShared.showToast('Please enter an email address', 'error');
      return;
    }

    if (!this.isValidEmail(email)) {
      AdminShared.showToast('Please enter a valid email address', 'error');
      return;
    }

    // Check for duplicates in team members
    if (this.teamMembers.some(m => m.email.toLowerCase() === email.toLowerCase())) {
      AdminShared.showToast('This user is already a team member', 'error');
      return;
    }

    // Check for duplicates in pending invitations
    if (this.pendingInvitations.some(i => i.email.toLowerCase() === email.toLowerCase())) {
      AdminShared.showToast('This user already has a pending invitation', 'error');
      return;
    }

    // Show loading state
    const sendBtn = document.getElementById('sendInviteBtn');
    const originalText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="icon icon-refresh icon--sm"></span> Sending...';

    try {
      // Step 1: Create invitation in database (web context) or local storage (extension)
      let invitationData;
      let orgName = null;

      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        // Get organization name for the email
        const { data: org } = await RevGuideDB.getOrganizationWithConnection();
        orgName = org?.name;

        const { data, error } = await RevGuideDB.createInvitation(email, role);
        if (error) {
          throw new Error(error.message);
        }
        invitationData = data;
      }

      // Step 2: Send email via Cloudflare Worker API (Resend)
      // Include token and org name so the email has an accept link
      const token = invitationData?.token;
      await this.sendInviteEmail(email, role, token, orgName);

      // Update local state
      if (invitationData) {
        this.pendingInvitations.push(invitationData);
      } else {
        // Extension context - store locally
        const user = {
          id: AdminShared.generateId(),
          email: email,
          role: role,
          status: 'pending',
          invitedAt: Date.now()
        };
        this.pendingInvitations.push({
          id: user.id,
          email: user.email,
          role: user.role,
          created_at: new Date(user.invitedAt).toISOString()
        });

        // Save to local storage for extension context
        const data = await AdminShared.loadStorageData();
        const invitedUsers = data.invitedUsers || [];
        invitedUsers.push(user);
        await AdminShared.saveStorageData({ invitedUsers });
      }

      // Close modal and refresh table
      this.closeInviteModal();
      this.renderUsersTable();

      AdminShared.showToast(`Invitation sent to ${email}`, 'success');
    } catch (error) {
      console.error('Failed to send invitation:', error);
      AdminShared.showToast(`Failed to send invitation: ${error.message}`, 'error');
    } finally {
      // Restore button state
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalText;
    }
  }

  /**
   * Send invitation email via Cloudflare Worker (Resend SMTP)
   */
  async sendInviteEmail(email, role, token, orgName) {
    const INVITE_API_URL = 'https://revguide-api.revguide.workers.dev/api/invite';

    // In extension context, use background script
    if (AdminShared.isExtensionContext) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'sendInviteEmail',
          email: email,
          role: role,
          token: token,
          orgName: orgName
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Failed to send email'));
          }
        });
      });
    }

    // In web context, call API directly
    const response = await fetch(INVITE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role, token, orgName })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to send email');
    }

    return result;
  }

  /**
   * Resend invitation email
   */
  async resendInvitation(inviteId, email, role) {
    try {
      // Find the invitation to get its token
      const invitation = this.pendingInvitations.find(i => i.id === inviteId);
      const token = invitation?.token;

      // Get org name
      let orgName = null;
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        const { data: org } = await RevGuideDB.getOrganizationWithConnection();
        orgName = org?.name;
      }

      await this.sendInviteEmail(email, role, token, orgName);
      AdminShared.showToast(`Invitation resent to ${email}`, 'success');
    } catch (error) {
      console.error('Failed to resend invitation:', error);
      AdminShared.showToast(`Failed to resend: ${error.message}`, 'error');
    }
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async deleteUser(userId, type, email) {
    const isMember = type === 'member';
    const title = isMember ? 'Remove Team Member' : 'Cancel Invitation';
    const message = isMember
      ? `Are you sure you want to remove ${email} from your team? They will lose access to shared content.`
      : `Are you sure you want to cancel the invitation to ${email}?`;

    const confirmed = await AdminShared.showConfirmDialog({
      title,
      message,
      primaryLabel: isMember ? 'Remove' : 'Cancel Invitation',
      secondaryLabel: 'Keep',
      showCancel: false
    });

    if (confirmed !== 'primary') return;

    try {
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        // Web context - delete from database
        const client = await RevGuideAuth.waitForClient();

        if (isMember) {
          // Remove user from organization (set organization_id to null)
          const { error } = await client
            .from('users')
            .update({ organization_id: null })
            .eq('id', userId);

          if (error) throw new Error(error.message);

          this.teamMembers = this.teamMembers.filter(m => m.id !== userId);
        } else {
          // Delete invitation
          const { error } = await client
            .from('invitations')
            .delete()
            .eq('id', userId);

          if (error) throw new Error(error.message);

          this.pendingInvitations = this.pendingInvitations.filter(i => i.id !== userId);
        }
      } else {
        // Extension context - update local storage
        const data = await AdminShared.loadStorageData();
        const invitedUsers = (data.invitedUsers || []).filter(u => u.id !== userId);
        await AdminShared.saveStorageData({ invitedUsers });

        this.pendingInvitations = this.pendingInvitations.filter(i => i.id !== userId);
      }

      // Refresh table
      this.renderUsersTable();

      AdminShared.showToast(isMember ? 'Team member removed' : 'Invitation cancelled', 'success');
    } catch (error) {
      console.error('Failed to remove user:', error);
      AdminShared.showToast(`Failed to remove: ${error.message}`, 'error');
    }
  }

  // ================================
  // HubSpot OAuth Methods
  // ================================

  async connectHubSpot() {
    const connectBtn = document.getElementById('connectHubSpotSettingsBtn');

    // Disable button and show loading
    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.innerHTML = `
        <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <circle cx="12" cy="12" r="10"/>
        </svg>
        Connecting...
      `;
    }

    try {
      // Start OAuth flow - this will redirect to HubSpot
      await RevGuideHubSpot.connect(window.location.href);

      // Note: Page will redirect, so code below won't execute
    } catch (error) {
      console.error('HubSpot connection error:', error);
      AdminShared.showToast('Failed to start HubSpot connection. Please try again.', 'error');
      this.resetConnectButton();
    }
  }

  async disconnectHubSpot() {
    if (!this.currentConnection) {
      AdminShared.showToast('No connection to disconnect', 'error');
      return;
    }

    const confirmed = await AdminShared.showConfirmDialog({
      title: 'Disconnect HubSpot',
      message: 'Are you sure you want to disconnect your HubSpot portal? This will disable property fetching and field import.',
      primaryLabel: 'Disconnect',
      secondaryLabel: 'Cancel',
      showCancel: false
    });

    if (confirmed !== 'primary') return;

    const disconnectBtn = document.getElementById('disconnectHubSpotBtn');
    const originalBtnContent = disconnectBtn ? disconnectBtn.innerHTML : '';

    try {
      if (disconnectBtn) {
        disconnectBtn.disabled = true;
        disconnectBtn.textContent = 'Disconnecting...';
      }

      // Disconnect via HubSpot client
      const result = await RevGuideHubSpot.disconnect(this.currentConnection.id);

      if (result.success) {
        AdminShared.showToast('HubSpot disconnected', 'success');
      } else {
        throw new Error(result.error || 'Disconnect failed');
      }

      // Clear cache and reload connection status
      this.clearHubSpotConnectionCache();
      await this.loadHubSpotConnectionStatus();
    } catch (error) {
      console.error('Disconnect error:', error);
      AdminShared.showToast('Failed to disconnect. Please try again.', 'error');
    } finally {
      // Always reset button state
      if (disconnectBtn) {
        disconnectBtn.disabled = false;
        disconnectBtn.innerHTML = originalBtnContent || '<span class="icon icon-x icon--sm"></span> Disconnect';
      }
    }
  }

  resetConnectButton() {
    const connectBtn = document.getElementById('connectHubSpotSettingsBtn');
    if (connectBtn) {
      connectBtn.disabled = false;
      connectBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984 2.21 2.21 0 00-2.212-2.212 2.21 2.21 0 00-2.212 2.212c0 .863.502 1.609 1.227 1.968v2.879a5.197 5.197 0 00-2.382 1.193l-6.376-4.96a2.567 2.567 0 00.09-.62 2.453 2.453 0 00-2.455-2.456A2.453 2.453 0 002.656 3.56a2.453 2.453 0 002.455 2.456c.405 0 .784-.103 1.12-.28l6.272 4.879a5.19 5.19 0 00-.701 2.605 5.222 5.222 0 005.222 5.222 5.222 5.222 0 005.222-5.222 5.207 5.207 0 00-4.082-5.089zm-1.14 7.526a2.637 2.637 0 01-2.639-2.639 2.637 2.637 0 012.639-2.639 2.637 2.637 0 012.639 2.639 2.637 2.637 0 01-2.639 2.639z"/>
        </svg>
        Connect HubSpot
      `;
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new SettingsPage();
});
