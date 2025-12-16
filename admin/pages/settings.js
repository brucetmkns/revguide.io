/**
 * RevGuide - Settings Page
 */

class SettingsPage {
  constructor() {
    this.settings = {};
    this.invitedUsers = [];
    this.init();
  }

  async init() {
    console.log('[Settings] init() started');

    // Show appropriate HubSpot card based on context FIRST to prevent flashing
    this.setupHubSpotCards();

    // Check authentication (redirects to login if not authenticated)
    const isAuthenticated = await AdminShared.checkAuth();
    console.log('[Settings] isAuthenticated:', isAuthenticated);
    if (!isAuthenticated) return;

    // Render sidebar
    AdminShared.renderSidebar('settings');

    // Check if returning from OAuth flow (web context only)
    if (!AdminShared.isExtensionContext) {
      await this.handleOAuthCallback();
    }

    // Load data
    console.log('[Settings] Loading storage data...');
    const data = await AdminShared.loadStorageData();
    this.settings = data.settings;
    this.invitedUsers = data.invitedUsers || [];

    // Populate UI
    this.updateSettingsUI();
    this.renderUsersTable();

    // Load account settings (user email, company name)
    console.log('[Settings] About to call loadAccountSettings()');
    await this.loadAccountSettings();

    // Load HubSpot connection status
    await this.loadHubSpotConnectionStatus();

    // Bind events
    this.bindEvents();
    console.log('[Settings] init() completed');
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

    try {
      // Get connection status from HubSpot client
      const connection = await RevGuideHubSpot.getConnection();

      // Hide loading state
      if (loadingState) loadingState.style.display = 'none';

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
    } catch (error) {
      console.error('Error loading HubSpot connection:', error);
      // Hide loading state and show disconnected state on error
      if (loadingState) loadingState.style.display = 'none';
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
    // Account Settings
    const saveAccountBtn = document.getElementById('saveAccountBtn');
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

    // Delete user buttons (delegated)
    document.getElementById('usersTableBody').addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.delete-user-btn');
      if (deleteBtn) {
        const userId = deleteBtn.dataset.id;
        this.deleteUser(userId);
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
    const userEmailInput = document.getElementById('userEmail');
    const companyNameInput = document.getElementById('companyName');

    // Try to get email - first from profile, then from auth user
    let email = AdminShared.currentUser?.email;
    console.log('[Settings] currentUser:', AdminShared.currentUser);
    console.log('[Settings] email from profile:', email);

    // If no email from profile, get from Supabase auth directly
    if (!email && typeof RevGuideAuth !== 'undefined') {
      try {
        const result = await RevGuideAuth.getUser();
        console.log('[Settings] RevGuideAuth.getUser() result:', result);
        const user = result?.data?.user;
        if (user && user.email) {
          email = user.email;
        }
      } catch (e) {
        console.error('[Settings] Failed to load user email:', e);
      }
    }

    console.log('[Settings] Final email:', email);

    if (email) {
      userEmailInput.value = email;
      userEmailInput.placeholder = '';
    } else {
      userEmailInput.placeholder = 'Unable to load email';
    }

    if (AdminShared.currentOrganization) {
      companyNameInput.value = AdminShared.currentOrganization.name || '';
      this.originalCompanyName = AdminShared.currentOrganization.name || '';
    }
  }

  async saveAccountSettings() {
    const companyNameInput = document.getElementById('companyName');
    const saveBtn = document.getElementById('saveAccountBtn');
    const statusEl = document.getElementById('accountStatus');

    const companyName = companyNameInput.value.trim();

    // Validate
    if (!companyName) {
      this.showAccountStatus('Company name is required', 'error');
      return;
    }

    // Check if changed
    if (companyName === this.originalCompanyName) {
      this.showAccountStatus('No changes to save', 'info');
      return;
    }

    // Show loading state
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving...';

    try {
      // Update organization in Supabase
      const { data, error } = await RevGuideDB.updateOrganization({ name: companyName });

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      this.originalCompanyName = companyName;
      if (AdminShared.currentOrganization) {
        AdminShared.currentOrganization.name = companyName;
      }

      // Update sidebar organization name display
      AdminShared.renderSidebar('settings');

      this.showAccountStatus('Company name updated successfully', 'success');
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

    if (this.invitedUsers.length === 0) {
      tableContainer.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    tableContainer.style.display = 'block';
    emptyState.style.display = 'none';

    tbody.innerHTML = this.invitedUsers.map(user => `
      <tr data-id="${user.id}">
        <td><strong>${AdminShared.escapeHtml(user.email)}</strong></td>
        <td><span class="role-badge ${user.role}">${user.role}</span></td>
        <td><span class="badge badge-${user.status}">${user.status === 'active' ? 'Active' : 'Pending'}</span></td>
        <td>${this.formatDate(user.invitedAt)}</td>
        <td>
          <div class="action-buttons">
            <button class="btn-icon-sm btn-danger-icon delete-user-btn" data-id="${user.id}" title="Remove user">
              <span class="icon icon-trash icon--sm"></span>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
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
    document.getElementById('inviteRole').value = 'user';
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

    // Check for duplicates
    if (this.invitedUsers.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      AdminShared.showToast('This user has already been invited', 'error');
      return;
    }

    // Show loading state
    const sendBtn = document.getElementById('sendInviteBtn');
    const originalText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="icon icon-refresh icon--sm"></span> Sending...';

    try {
      // Send invitation via API
      await this.sendInviteViaAPI(email, role);

      // Create user object
      const user = {
        id: AdminShared.generateId(),
        email: email,
        role: role,
        status: 'pending',
        invitedAt: Date.now()
      };

      // Add to list
      this.invitedUsers.push(user);

      // Save to storage
      await AdminShared.saveStorageData({ invitedUsers: this.invitedUsers });

      // Close modal and refresh table
      this.closeInviteModal();
      this.renderUsersTable();

      AdminShared.showToast(`Invitation sent to ${email}`, 'success');
    } catch (error) {
      console.error('Failed to send invitation:', error);
      AdminShared.showToast(`Failed to send email: ${error.message}`, 'error');
    } finally {
      // Restore button state
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalText;
    }
  }

  async sendInviteViaAPI(email, role) {
    // In web context, use Supabase to create invitation
    if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
      const { data, error } = await RevGuideDB.createInvitation(email, role);
      if (error) {
        throw new Error(error.message);
      }
      return data;
    }

    // In extension context, send via background script
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'sendInviteEmail',
        email: email,
        role: role
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

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async deleteUser(userId) {
    const user = this.invitedUsers.find(u => u.id === userId);
    if (!user) return;

    const confirmed = await AdminShared.showConfirmDialog({
      title: 'Remove User',
      message: `Are you sure you want to remove ${user.email} from your team?`,
      primaryLabel: 'Remove',
      secondaryLabel: 'Cancel',
      showCancel: false
    });

    if (confirmed !== 'primary') return;

    // Remove from list
    this.invitedUsers = this.invitedUsers.filter(u => u.id !== userId);

    // Save to storage
    await AdminShared.saveStorageData({ invitedUsers: this.invitedUsers });

    // Refresh table
    this.renderUsersTable();

    AdminShared.showToast('User removed', 'success');
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

      // Reload connection status
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
