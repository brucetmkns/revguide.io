/**
 * RevGuide - Partner Dashboard Page
 *
 * Manages the partner dashboard view including client portals,
 * libraries, and access requests.
 */

class PartnerDashboard {
  constructor() {
    this.clients = [];
    this.libraries = [];
    this.pendingRequests = [];
    this.clientOwnershipStatus = {}; // Map of orgId -> { hasOwner, pendingInvite }
    this.activeTab = 'clients';
    this.inviteOwnerOrgId = null; // Currently selected org for invite modal
    this.init();
  }

  async init() {
    console.log('[PartnerDashboard] init() started');

    // Check authentication
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    // Render sidebar with partner active
    AdminShared.renderSidebar('partner');

    // Verify user is a partner
    const isPartner = await RevGuideDB.isPartner();

    if (!isPartner) {
      // Not a partner - show upgrade message
      document.getElementById('partnerLoadingState').style.display = 'none';
      document.getElementById('notPartnerState').style.display = 'block';
      return;
    }

    // Load partner data
    await this.loadData();

    // Hide loading, show content
    document.getElementById('partnerLoadingState').style.display = 'none';
    document.getElementById('partnerContent').style.display = 'block';

    // Render UI
    this.renderStats();
    this.renderClients();
    this.renderLibraries();
    this.renderRequests();

    // Bind events
    this.bindEvents();

    console.log('[PartnerDashboard] init() completed');
  }

  async loadData() {
    try {
      // Load all data in parallel
      const [statsResult, clientsResult, librariesResult, requestsResult] = await Promise.all([
        RevGuideDB.getPartnerStats(),
        RevGuideDB.getPartnerClients(),
        RevGuideDB.getMyLibraries(),
        RevGuideDB.getMyAccessRequests()
      ]);

      this.clients = clientsResult.data || [];
      this.libraries = librariesResult.data || [];

      // Filter for pending requests
      this.pendingRequests = (requestsResult.data || []).filter(r => r.status === 'pending');

      // Update stats from response or calculate from data
      if (statsResult.data) {
        this.stats = statsResult.data;
      } else {
        this.stats = {
          client_count: this.clients.length,
          library_count: this.libraries.length,
          pending_request_count: this.pendingRequests.length
        };
      }

      // Load ownership status for each client (in parallel)
      await this.loadOwnershipStatus();
    } catch (error) {
      console.error('[PartnerDashboard] Failed to load data:', error);
      AdminShared.showToast('Failed to load partner data', 'error');
    }
  }

  async loadOwnershipStatus() {
    // Load ownership status for all clients in parallel
    const statusPromises = this.clients.map(async (client) => {
      const [ownerResult, inviteResult] = await Promise.all([
        RevGuideDB.orgHasOwner(client.organization_id),
        RevGuideDB.getPendingOwnershipInvitation(client.organization_id)
      ]);

      return {
        orgId: client.organization_id,
        hasOwner: ownerResult.hasOwner,
        pendingInvite: inviteResult.invitation
      };
    });

    const statuses = await Promise.all(statusPromises);

    // Build lookup map
    this.clientOwnershipStatus = {};
    statuses.forEach(status => {
      this.clientOwnershipStatus[status.orgId] = {
        hasOwner: status.hasOwner,
        pendingInvite: status.pendingInvite
      };
    });
  }

  renderStats() {
    document.getElementById('clientCount').textContent = this.stats?.client_count || this.clients.length;
    document.getElementById('libraryCount').textContent = this.stats?.library_count || this.libraries.length;
    document.getElementById('pendingCount').textContent = this.stats?.pending_request_count || this.pendingRequests.length;
  }

  renderClients() {
    const grid = document.getElementById('clientsGrid');
    const emptyState = document.getElementById('clientsEmptyState');

    if (!this.clients.length) {
      grid.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = this.clients.map(client => {
      const status = this.clientOwnershipStatus[client.organization_id] || {};
      const hasOwner = status.hasOwner;
      const pendingInvite = status.pendingInvite;

      // Determine ownership status display
      let ownershipHtml = '';
      if (hasOwner) {
        ownershipHtml = '<span class="ownership-status has-owner">Owner assigned</span>';
      } else if (pendingInvite) {
        ownershipHtml = `<span class="ownership-status pending-invite">Invite pending: ${AdminShared.escapeHtml(pendingInvite.email)}</span>`;
      } else {
        ownershipHtml = '<span class="ownership-status">No owner yet</span>';
      }

      // Show invite button only if no owner and no pending invite
      const showInviteBtn = !hasOwner && !pendingInvite;

      return `
        <div class="client-card" data-org-id="${client.organization_id}">
          <div class="client-card-header">
            <span class="client-color" style="background: ${this.getPortalColor(client.organization_id)}"></span>
            <h4>${AdminShared.escapeHtml(client.organization_name)}</h4>
          </div>
          <div class="client-card-meta">
            ${client.portal_id ? `<span>Portal: ${AdminShared.escapeHtml(client.portal_id)}</span>` : '<span>No HubSpot connected</span>'}
            <span class="role-badge partner">Partner</span>
          </div>
          <div class="client-card-meta">
            ${ownershipHtml}
          </div>
          <div class="client-card-actions">
            <button class="btn btn-primary switch-portal-btn" data-org-id="${client.organization_id}">
              Manage Portal
            </button>
            ${showInviteBtn ? `
              <button class="btn btn-secondary btn-invite-owner" data-org-id="${client.organization_id}" data-org-name="${AdminShared.escapeHtml(client.organization_name)}">
                Invite Owner
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  renderLibraries() {
    const grid = document.getElementById('librariesGrid');
    const emptyState = document.getElementById('librariesEmptyState');

    if (!this.libraries.length) {
      grid.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = this.libraries.map(library => `
      <div class="library-card" data-library-id="${library.id}">
        <h4>${AdminShared.escapeHtml(library.name)}</h4>
        <p>${AdminShared.escapeHtml(library.description || 'No description')}</p>
        <div class="library-stats">
          <span>v${library.version || '1.0.0'}</span>
          <span>${library.is_public ? 'Public' : 'Private'}</span>
        </div>
        <div class="client-card-actions">
          <a href="/libraries?edit=${library.id}" class="btn btn-secondary">Edit</a>
        </div>
      </div>
    `).join('');
  }

  renderRequests() {
    const list = document.getElementById('requestsList');
    const emptyState = document.getElementById('requestsEmptyState');

    if (!this.pendingRequests.length) {
      list.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    list.style.display = 'block';
    emptyState.style.display = 'none';

    list.innerHTML = this.pendingRequests.map(request => `
      <div class="request-item" data-request-id="${request.request_id}">
        <div class="request-info">
          <strong>${AdminShared.escapeHtml(request.organization_name || 'Unknown Organization')}</strong>
          <span>Requested ${this.formatDate(request.requested_at)}</span>
        </div>
        <span class="badge-pending">Pending</span>
        <button class="btn btn-secondary btn-sm cancel-request-btn" data-request-id="${request.request_id}">
          Cancel
        </button>
      </div>
    `).join('');
  }

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.partner-tab').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Switch portal buttons and invite owner buttons (delegated)
    document.getElementById('clientsGrid').addEventListener('click', async (e) => {
      const switchBtn = e.target.closest('.switch-portal-btn');
      if (switchBtn) {
        const orgId = switchBtn.dataset.orgId;
        await this.switchToPortal(orgId);
        return;
      }

      const inviteBtn = e.target.closest('.btn-invite-owner');
      if (inviteBtn) {
        const orgId = inviteBtn.dataset.orgId;
        const orgName = inviteBtn.dataset.orgName;
        this.showInviteOwnerModal(orgId, orgName);
      }
    });

    // Cancel request buttons (delegated)
    document.getElementById('requestsList')?.addEventListener('click', async (e) => {
      const cancelBtn = e.target.closest('.cancel-request-btn');
      if (cancelBtn) {
        const requestId = cancelBtn.dataset.requestId;
        await this.cancelRequest(requestId);
      }
    });

    // Request access form toggle
    document.getElementById('toggleRequestFormBtn')?.addEventListener('click', () => {
      this.toggleRequestForm();
    });

    // Cancel button in form
    document.getElementById('cancelRequestBtn')?.addEventListener('click', () => {
      this.hideRequestForm();
    });

    // Submit request button
    document.getElementById('submitRequestBtn')?.addEventListener('click', async () => {
      await this.submitAccessRequest();
    });

    // Dismiss success message
    document.getElementById('dismissSuccessBtn')?.addEventListener('click', () => {
      this.hideSuccessMessage();
    });

    // Submit on Enter in email field
    document.getElementById('targetAdminEmail')?.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await this.submitAccessRequest();
      }
    });

    // === Add Portal Form Events ===
    document.getElementById('toggleAddPortalBtn')?.addEventListener('click', () => {
      this.toggleAddPortalForm();
    });

    document.getElementById('cancelAddPortalBtn')?.addEventListener('click', () => {
      this.hideAddPortalForm();
    });

    document.getElementById('submitAddPortalBtn')?.addEventListener('click', async () => {
      await this.submitAddPortal();
    });

    document.getElementById('dismissAddPortalSuccessBtn')?.addEventListener('click', () => {
      this.hideAddPortalSuccess();
    });

    // Submit on Enter in portal name field
    document.getElementById('newPortalName')?.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await this.submitAddPortal();
      }
    });

    // === Invite Owner Modal Events ===
    document.getElementById('cancelInviteOwnerBtn')?.addEventListener('click', () => {
      this.hideInviteOwnerModal();
    });

    document.getElementById('sendInviteOwnerBtn')?.addEventListener('click', async () => {
      await this.submitInviteOwner();
    });

    // Close modal on overlay click
    document.getElementById('inviteOwnerModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'inviteOwnerModal') {
        this.hideInviteOwnerModal();
      }
    });

    // Submit on Enter in owner email field
    document.getElementById('ownerEmail')?.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await this.submitInviteOwner();
      }
    });
  }

  toggleRequestForm() {
    const form = document.getElementById('requestAccessForm');
    const toggleBtn = document.getElementById('toggleRequestFormBtn');
    const successMessage = document.getElementById('requestSuccessMessage');

    // Hide success message if visible
    successMessage.style.display = 'none';

    const isVisible = form.style.display !== 'none';

    if (isVisible) {
      this.hideRequestForm();
    } else {
      form.style.display = 'block';
      toggleBtn.textContent = 'Cancel';
      toggleBtn.setAttribute('aria-expanded', 'true');
      document.getElementById('targetAdminEmail')?.focus();
    }
  }

  hideRequestForm() {
    const form = document.getElementById('requestAccessForm');
    const toggleBtn = document.getElementById('toggleRequestFormBtn');

    form.style.display = 'none';
    toggleBtn.textContent = 'Request Access';
    toggleBtn.setAttribute('aria-expanded', 'false');

    // Clear form fields
    document.getElementById('targetAdminEmail').value = '';
    document.getElementById('requestMessage').value = '';
  }

  showSuccessMessage() {
    const form = document.getElementById('requestAccessForm');
    const successMessage = document.getElementById('requestSuccessMessage');
    const toggleBtn = document.getElementById('toggleRequestFormBtn');

    form.style.display = 'none';
    successMessage.style.display = 'flex';
    toggleBtn.textContent = 'Request Another';
    toggleBtn.setAttribute('aria-expanded', 'false');

    // Clear form fields
    document.getElementById('targetAdminEmail').value = '';
    document.getElementById('requestMessage').value = '';
  }

  hideSuccessMessage() {
    const successMessage = document.getElementById('requestSuccessMessage');
    const toggleBtn = document.getElementById('toggleRequestFormBtn');

    successMessage.style.display = 'none';
    toggleBtn.textContent = 'Request Access';
  }

  // === Add Portal Form Methods ===

  toggleAddPortalForm() {
    const form = document.getElementById('addPortalForm');
    const toggleBtn = document.getElementById('toggleAddPortalBtn');
    const successMessage = document.getElementById('addPortalSuccess');

    // Hide success message if visible
    successMessage.style.display = 'none';

    const isVisible = form.style.display !== 'none';

    if (isVisible) {
      this.hideAddPortalForm();
    } else {
      form.style.display = 'block';
      toggleBtn.textContent = 'Cancel';
      toggleBtn.classList.remove('btn-primary');
      toggleBtn.classList.add('btn-secondary');
      toggleBtn.setAttribute('aria-expanded', 'true');
      document.getElementById('newPortalName')?.focus();
    }
  }

  hideAddPortalForm() {
    const form = document.getElementById('addPortalForm');
    const toggleBtn = document.getElementById('toggleAddPortalBtn');

    form.style.display = 'none';
    toggleBtn.textContent = 'Add Portal';
    toggleBtn.classList.remove('btn-secondary');
    toggleBtn.classList.add('btn-primary');
    toggleBtn.setAttribute('aria-expanded', 'false');

    // Clear form
    document.getElementById('newPortalName').value = '';
  }

  showAddPortalSuccess() {
    const form = document.getElementById('addPortalForm');
    const successMessage = document.getElementById('addPortalSuccess');
    const toggleBtn = document.getElementById('toggleAddPortalBtn');

    form.style.display = 'none';
    successMessage.style.display = 'flex';
    toggleBtn.textContent = 'Add Another';
    toggleBtn.classList.remove('btn-secondary');
    toggleBtn.classList.add('btn-primary');
    toggleBtn.setAttribute('aria-expanded', 'false');

    // Clear form
    document.getElementById('newPortalName').value = '';
  }

  hideAddPortalSuccess() {
    const successMessage = document.getElementById('addPortalSuccess');
    const toggleBtn = document.getElementById('toggleAddPortalBtn');

    successMessage.style.display = 'none';
    toggleBtn.textContent = 'Add Portal';
  }

  async submitAddPortal() {
    const nameInput = document.getElementById('newPortalName');
    const submitBtn = document.getElementById('submitAddPortalBtn');

    const portalName = nameInput.value.trim();

    if (!portalName) {
      AdminShared.showToast('Please enter an organization name', 'error');
      nameInput.focus();
      return;
    }

    // Disable button during request
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
      const { success, organizationId, error } = await RevGuideDB.createClientOrganization(portalName);

      if (!success || error) {
        throw new Error(error?.message || 'Failed to create portal');
      }

      AdminShared.showToast('Portal created successfully', 'success');

      // Show success and refresh data
      this.showAddPortalSuccess();

      // Reload clients to show the new portal
      const { data: clients } = await RevGuideDB.getPartnerClients();
      this.clients = clients || [];
      await this.loadOwnershipStatus();
      this.renderClients();
      this.renderStats();

    } catch (error) {
      console.error('[PartnerDashboard] Create portal error:', error);
      AdminShared.showToast(error.message || 'Failed to create portal', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Portal';
    }
  }

  // === Invite Owner Modal Methods ===

  showInviteOwnerModal(orgId, orgName) {
    this.inviteOwnerOrgId = orgId;

    const modal = document.getElementById('inviteOwnerModal');
    const orgNameEl = document.getElementById('inviteOwnerOrgName');
    const emailInput = document.getElementById('ownerEmail');

    orgNameEl.textContent = `Send an invitation to claim ownership of "${orgName}".`;
    emailInput.value = '';

    modal.style.display = 'flex';
    emailInput.focus();
  }

  hideInviteOwnerModal() {
    const modal = document.getElementById('inviteOwnerModal');
    modal.style.display = 'none';
    this.inviteOwnerOrgId = null;
    document.getElementById('ownerEmail').value = '';
  }

  async submitInviteOwner() {
    const emailInput = document.getElementById('ownerEmail');
    const submitBtn = document.getElementById('sendInviteOwnerBtn');

    const email = emailInput.value.trim();

    // Basic email validation
    if (!email) {
      AdminShared.showToast('Please enter an email address', 'error');
      emailInput.focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      AdminShared.showToast('Please enter a valid email address', 'error');
      emailInput.focus();
      return;
    }

    if (!this.inviteOwnerOrgId) {
      AdminShared.showToast('No organization selected', 'error');
      return;
    }

    // Disable button during request
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      const { success, invitationToken, error } = await RevGuideDB.inviteOrgOwner(
        this.inviteOwnerOrgId,
        email
      );

      if (!success || error) {
        throw new Error(error?.message || 'Failed to send invitation');
      }

      // Send the invitation email via worker
      await this.sendOwnershipInviteEmail(email, invitationToken);

      AdminShared.showToast('Ownership invitation sent', 'success');

      // Close modal and refresh
      this.hideInviteOwnerModal();

      // Refresh ownership status
      await this.loadOwnershipStatus();
      this.renderClients();

    } catch (error) {
      console.error('[PartnerDashboard] Invite owner error:', error);
      AdminShared.showToast(error.message || 'Failed to send invitation', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Invitation';
    }
  }

  async sendOwnershipInviteEmail(email, token) {
    // Get org name for the email
    const client = this.clients.find(c => c.organization_id === this.inviteOwnerOrgId);
    const orgName = client?.organization_name || 'your portal';

    // Get partner info
    const { data: profile } = await RevGuideDB.getUserProfile();

    try {
      const response = await fetch('https://revguide-api.revguide.workers.dev/api/send-ownership-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recipientEmail: email,
          invitationToken: token,
          organizationName: orgName,
          partnerName: profile?.name || 'Your partner'
        })
      });

      if (!response.ok) {
        console.warn('[PartnerDashboard] Email send failed, but invitation was created');
      }
    } catch (emailError) {
      console.warn('[PartnerDashboard] Failed to send invitation email:', emailError);
      // Don't throw - the invitation was created successfully
    }
  }

  async submitAccessRequest() {
    const emailInput = document.getElementById('targetAdminEmail');
    const messageInput = document.getElementById('requestMessage');
    const submitBtn = document.getElementById('submitRequestBtn');

    const targetAdminEmail = emailInput.value.trim();
    const message = messageInput.value.trim();

    // Basic email validation
    if (!targetAdminEmail) {
      AdminShared.showToast('Please enter an email address', 'error');
      emailInput.focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetAdminEmail)) {
      AdminShared.showToast('Please enter a valid email address', 'error');
      emailInput.focus();
      return;
    }

    // Get current user profile
    const { data: profile, error: profileError } = await RevGuideDB.getUserProfile();
    if (profileError || !profile) {
      AdminShared.showToast('Failed to get user profile', 'error');
      return;
    }

    // Disable button during request
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      // Call the worker endpoint
      const response = await fetch('https://revguide-api.revguide.workers.dev/api/request-partner-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          partnerUserId: profile.id,
          partnerEmail: profile.email,
          partnerName: profile.name,
          targetAdminEmail: targetAdminEmail,
          message: message || null
        })
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      // Always show success (enumeration prevention)
      this.showSuccessMessage();

      // Refresh the requests list in case a new one was created
      const { data: requests } = await RevGuideDB.getMyAccessRequests();
      this.pendingRequests = (requests || []).filter(r => r.status === 'pending');
      this.renderRequests();
      this.renderStats();

    } catch (error) {
      console.error('[PartnerDashboard] Submit request error:', error);
      // Still show success for enumeration prevention
      this.showSuccessMessage();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Request';
    }
  }

  switchTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.partner-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabId}Tab`);
    });

    this.activeTab = tabId;
  }

  async switchToPortal(organizationId) {
    try {
      const { success, error } = await RevGuideDB.switchOrganization(organizationId);

      if (!success || error) {
        throw new Error(error?.message || 'Failed to switch portal');
      }

      AdminShared.showToast('Switched to client portal', 'success');

      // Redirect to home page of the new portal
      setTimeout(() => {
        window.location.href = '/home';
      }, 500);

    } catch (error) {
      console.error('[PartnerDashboard] Switch portal error:', error);
      AdminShared.showToast(error.message || 'Failed to switch portal', 'error');
    }
  }

  async cancelRequest(requestId) {
    const confirmed = await AdminShared.showConfirmDialog({
      title: 'Cancel Access Request',
      message: 'Are you sure you want to cancel this access request?',
      primaryLabel: 'Cancel Request',
      secondaryLabel: 'Keep Request',
      showCancel: false
    });

    if (confirmed !== 'primary') return;

    try {
      const { error } = await RevGuideDB.cancelAccessRequest(requestId);

      if (error) {
        throw new Error(error.message);
      }

      AdminShared.showToast('Request cancelled', 'success');

      // Remove from local list and re-render
      this.pendingRequests = this.pendingRequests.filter(r => r.request_id !== requestId);
      this.renderRequests();
      this.renderStats();

    } catch (error) {
      console.error('[PartnerDashboard] Cancel request error:', error);
      AdminShared.showToast(error.message || 'Failed to cancel request', 'error');
    }
  }

  // Helper to generate consistent colors for portals
  getPortalColor(orgId) {
    const colors = [
      '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
      '#f97316', '#eab308', '#22c55e', '#14b8a6',
      '#06b6d4', '#3b82f6'
    ];

    // Simple hash of org ID to pick a color
    let hash = 0;
    const str = orgId || '';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PartnerDashboard();
});
