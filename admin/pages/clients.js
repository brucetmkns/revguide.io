/**
 * Clients Page Controller
 * Manages the consultant's client organizations dashboard
 */
class ClientsPage {
  constructor() {
    this.clients = [];
    this.pendingRequests = [];
    this.selectedOrgId = null;
    this.searchTimeout = null;
    this.init();
  }

  async init() {
    console.log('[Clients] Initializing...');

    // Check authentication
    const authResult = await AdminShared.checkAuth();
    if (!authResult) {
      console.log('[Clients] Auth check failed, redirecting...');
      return;
    }

    // Check if user is a consultant
    const isConsultant = await this.checkIsConsultant();
    if (!isConsultant) {
      console.log('[Clients] User is not a consultant, redirecting to home...');
      window.location.href = '/home';
      return;
    }

    // Load data
    await this.loadClients();
    await this.loadPendingRequests();

    // Render UI
    this.renderClients();
    this.renderPendingRequests();

    // Bind events
    this.bindEvents();

    console.log('[Clients] Initialization complete');
  }

  async checkIsConsultant() {
    // Check if user has consultant role in any organization
    if (typeof RevGuideDB !== 'undefined') {
      try {
        const { data: orgs } = await RevGuideDB.getUserOrganizations();
        if (orgs && orgs.length > 0) {
          // User with multiple orgs is likely a consultant
          const hasConsultantRole = orgs.some(org => org.role === 'consultant');
          return hasConsultantRole || orgs.length > 1;
        }
      } catch (error) {
        console.error('[Clients] Error checking consultant status:', error);
      }
    }
    return false;
  }

  async loadClients() {
    if (typeof RevGuideDB !== 'undefined') {
      try {
        const { data: orgs, error } = await RevGuideDB.getUserOrganizations();
        if (error) {
          console.error('[Clients] Error loading organizations:', error);
        } else {
          this.clients = orgs || [];
          console.log('[Clients] Loaded', this.clients.length, 'client organizations');
        }
      } catch (error) {
        console.error('[Clients] Failed to load clients:', error);
      }
    }
  }

  async loadPendingRequests() {
    if (typeof RevGuideDB !== 'undefined') {
      try {
        const { data: requests, error } = await RevGuideDB.getMyAccessRequests();
        if (error) {
          console.error('[Clients] Error loading access requests:', error);
        } else {
          // Only show pending requests
          this.pendingRequests = (requests || []).filter(r => r.status === 'pending');
          console.log('[Clients] Loaded', this.pendingRequests.length, 'pending requests');
        }
      } catch (error) {
        console.error('[Clients] Failed to load pending requests:', error);
      }
    }
  }

  renderClients() {
    const loadingState = document.getElementById('clientsLoadingState');
    const emptyState = document.getElementById('clientsEmptyState');
    const grid = document.getElementById('clientsGrid');

    if (loadingState) loadingState.style.display = 'none';

    if (!this.clients || this.clients.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (grid) grid.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    const activeOrgId = AdminShared.currentOrganization?.id;

    grid.innerHTML = this.clients.map(client => {
      const isActive = client.organization_id === activeOrgId;
      const color = this.getPortalColor(client.organization_id);

      return `
        <div class="client-card ${isActive ? 'active' : ''}" data-org-id="${client.organization_id}">
          <div class="client-card-header">
            <span class="client-color" style="background: ${color}"></span>
            <h4>${AdminShared.escapeHtml(client.organization_name)}</h4>
          </div>
          <div class="client-card-meta">
            ${client.portal_id ? `<span>Portal: ${AdminShared.escapeHtml(client.portal_id)}</span>` : '<span>No HubSpot connected</span>'}
            <span class="role-badge consultant">Consultant</span>
            ${isActive ? '<span class="active-indicator">Active</span>' : ''}
          </div>
          <div class="client-card-actions">
            ${isActive
              ? '<button class="btn btn-secondary" disabled>Currently Active</button>'
              : `<button class="btn btn-primary switch-portal-btn" data-org-id="${client.organization_id}">Switch to Portal</button>`
            }
          </div>
        </div>
      `;
    }).join('');
  }

  renderPendingRequests() {
    const section = document.getElementById('pendingRequestsSection');
    const list = document.getElementById('pendingRequestsList');

    if (!section || !list) return;

    if (!this.pendingRequests || this.pendingRequests.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';

    list.innerHTML = this.pendingRequests.map(request => `
      <div class="pending-request-item" data-request-id="${request.request_id}">
        <div class="pending-request-info">
          <strong>${AdminShared.escapeHtml(request.organization_name)}</strong>
          <span>Requested ${this.formatDate(request.requested_at)}</span>
        </div>
        <span class="badge-pending">Pending</span>
        <button class="btn btn-secondary btn-sm cancel-request-btn" data-id="${request.request_id}">
          Cancel
        </button>
      </div>
    `).join('');
  }

  bindEvents() {
    // Request access buttons
    const requestAccessBtn = document.getElementById('requestAccessBtn');
    const requestAccessEmptyBtn = document.getElementById('requestAccessEmptyBtn');

    if (requestAccessBtn) {
      requestAccessBtn.addEventListener('click', () => this.openRequestAccessModal());
    }
    if (requestAccessEmptyBtn) {
      requestAccessEmptyBtn.addEventListener('click', () => this.openRequestAccessModal());
    }

    // Modal controls
    const closeModal = document.getElementById('closeRequestAccessModal');
    const cancelBtn = document.getElementById('cancelRequestAccessBtn');
    const submitBtn = document.getElementById('submitRequestAccessBtn');
    const modal = document.getElementById('requestAccessModal');

    if (closeModal) {
      closeModal.addEventListener('click', () => this.closeRequestAccessModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeRequestAccessModal());
    }
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitAccessRequest());
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.id === 'requestAccessModal') {
          this.closeRequestAccessModal();
        }
      });
    }

    // Organization search
    const searchInput = document.getElementById('orgSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleOrgSearch(e.target.value));
    }

    // Delegated events for dynamic content
    const grid = document.getElementById('clientsGrid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const switchBtn = e.target.closest('.switch-portal-btn');
        if (switchBtn) {
          const orgId = switchBtn.dataset.orgId;
          this.switchToClient(orgId);
        }
      });
    }

    const pendingList = document.getElementById('pendingRequestsList');
    if (pendingList) {
      pendingList.addEventListener('click', (e) => {
        const cancelBtn = e.target.closest('.cancel-request-btn');
        if (cancelBtn) {
          const requestId = cancelBtn.dataset.id;
          this.cancelRequest(requestId);
        }
      });
    }

    const searchResults = document.getElementById('orgSearchResults');
    if (searchResults) {
      searchResults.addEventListener('click', (e) => {
        const item = e.target.closest('.org-search-item');
        if (item && !item.classList.contains('has-request')) {
          this.selectOrganization(item.dataset.orgId, item.dataset.orgName);
        }
      });
    }
  }

  openRequestAccessModal() {
    const modal = document.getElementById('requestAccessModal');
    const searchInput = document.getElementById('orgSearchInput');
    const results = document.getElementById('orgSearchResults');
    const message = document.getElementById('accessRequestMessage');
    const submitBtn = document.getElementById('submitRequestAccessBtn');

    if (modal) {
      modal.classList.add('open');
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      if (results) results.innerHTML = '';
      if (message) message.value = '';
      if (submitBtn) submitBtn.disabled = true;
      this.selectedOrgId = null;
    }
  }

  closeRequestAccessModal() {
    const modal = document.getElementById('requestAccessModal');
    if (modal) {
      modal.classList.remove('open');
    }
  }

  async handleOrgSearch(query) {
    // Debounce search
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (!query || query.length < 2) {
      const results = document.getElementById('orgSearchResults');
      if (results) results.innerHTML = '';
      return;
    }

    this.searchTimeout = setTimeout(async () => {
      try {
        const { data: orgs, error } = await RevGuideDB.searchOrganizations(query);

        if (error) {
          console.error('[Clients] Search error:', error);
          return;
        }

        this.renderSearchResults(orgs || []);
      } catch (error) {
        console.error('[Clients] Search failed:', error);
      }
    }, 300);
  }

  renderSearchResults(orgs) {
    const results = document.getElementById('orgSearchResults');
    if (!results) return;

    if (orgs.length === 0) {
      results.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--space-4);">No organizations found</p>';
      return;
    }

    results.innerHTML = orgs.map(org => {
      const hasRequest = org.has_pending_request;
      return `
        <div class="org-search-item ${hasRequest ? 'has-request' : ''} ${this.selectedOrgId === org.organization_id ? 'selected' : ''}"
             data-org-id="${org.organization_id}"
             data-org-name="${AdminShared.escapeHtml(org.organization_name)}">
          <div>
            <strong>${AdminShared.escapeHtml(org.organization_name)}</strong>
            ${org.portal_id ? `<br><span style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">Portal: ${org.portal_id}</span>` : ''}
          </div>
          ${hasRequest
            ? '<span class="badge-pending">Request Pending</span>'
            : '<span class="icon icon-chevron-right icon--sm" style="color: var(--color-text-muted);"></span>'
          }
        </div>
      `;
    }).join('');
  }

  selectOrganization(orgId, orgName) {
    this.selectedOrgId = orgId;

    // Update UI to show selection
    const items = document.querySelectorAll('.org-search-item');
    items.forEach(item => {
      item.classList.toggle('selected', item.dataset.orgId === orgId);
    });

    // Enable submit button
    const submitBtn = document.getElementById('submitRequestAccessBtn');
    if (submitBtn) {
      submitBtn.disabled = false;
    }
  }

  async submitAccessRequest() {
    if (!this.selectedOrgId) {
      AdminShared.showToast('Please select an organization', 'error');
      return;
    }

    const message = document.getElementById('accessRequestMessage')?.value.trim() || '';
    const submitBtn = document.getElementById('submitRequestAccessBtn');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="icon icon-loader icon--sm spin"></span> Sending...';
    }

    try {
      const { data, error } = await RevGuideDB.createAccessRequest(this.selectedOrgId, message);

      if (error) {
        throw error;
      }

      // Try to notify admins
      try {
        const { data: admins } = await RevGuideDB.getOrgAdminEmails(this.selectedOrgId);
        if (admins && admins.length > 0) {
          const adminEmails = admins.map(a => a.email);
          const profile = await RevGuideDB.getUserProfile();

          await fetch('https://revguide-api.revguide.workers.dev/api/notify-access-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              adminEmails,
              consultantName: profile.data?.name,
              consultantEmail: profile.data?.email,
              orgName: data.organization_name || 'your organization',
              message
            })
          });
        }
      } catch (emailError) {
        console.error('[Clients] Failed to send notification:', emailError);
      }

      AdminShared.showToast('Access request sent', 'success');
      this.closeRequestAccessModal();

      // Refresh pending requests
      await this.loadPendingRequests();
      this.renderPendingRequests();

    } catch (error) {
      console.error('[Clients] Failed to submit request:', error);
      AdminShared.showToast(error.message || 'Failed to send request', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="icon icon-send icon--sm"></span> Send Request';
      }
    }
  }

  async cancelRequest(requestId) {
    const confirmed = await AdminShared.showConfirmDialog({
      title: 'Cancel Access Request',
      message: 'Are you sure you want to cancel this access request?',
      primaryLabel: 'Cancel Request',
      secondaryLabel: 'Keep Request'
    });

    if (confirmed !== 'primary') return;

    try {
      const { error } = await RevGuideDB.cancelAccessRequest(requestId);

      if (error) {
        throw error;
      }

      AdminShared.showToast('Request cancelled', 'success');

      // Refresh pending requests
      await this.loadPendingRequests();
      this.renderPendingRequests();

    } catch (error) {
      console.error('[Clients] Failed to cancel request:', error);
      AdminShared.showToast('Failed to cancel request', 'error');
    }
  }

  async switchToClient(orgId) {
    try {
      await RevGuideDB.switchOrganization(orgId);
      AdminShared.showToast('Switched to client portal', 'success');

      // Reload the page to refresh all data
      window.location.href = '/home';
    } catch (error) {
      console.error('[Clients] Failed to switch portal:', error);
      AdminShared.showToast('Failed to switch portal', 'error');
    }
  }

  getPortalColor(orgId) {
    // Generate a consistent color from org ID
    if (!orgId) return '#6b7280';

    const hash = orgId.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);

    const colors = [
      '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
      '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'
    ];

    return colors[Math.abs(hash) % colors.length];
  }

  formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ClientsPage();
});
