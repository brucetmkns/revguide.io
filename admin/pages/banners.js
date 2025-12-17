/**
 * RevGuide - Banners Page
 */

class BannersPage {
  constructor() {
    this.rules = [];
    this.plays = [];
    this.propertiesCache = {};
    this.currentProperties = [];
    this.editingRuleId = null;
    this.originalData = null; // For tracking unsaved changes
    this.activeTab = 'content';
    this.isViewOnly = false; // View-only mode for members
    this.init();
  }

  async init() {
    // Check authentication (redirects to login if not authenticated)
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    // Check if user can edit content (admins, owners, editors can; viewers cannot)
    this.isViewOnly = !AdminShared.canEditContent();

    // Render sidebar
    AdminShared.renderSidebar('banners');

    // Setup view-only UI if member
    if (this.isViewOnly) {
      this.setupViewOnlyMode();
    }

    // Load data
    const data = await AdminShared.loadStorageData();
    this.rules = data.rules || [];
    this.plays = data.battleCards || [];

    // Initialize play select dropdown (only for admins)
    if (!this.isViewOnly) {
      const playSelectEl = document.getElementById('ruleRelatedPlay');
      if (playSelectEl) {
        AdminShared.initPlaySelect(playSelectEl, this.plays);
      }
    }

    // Check for action param (e.g., from home page)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add' && !this.isViewOnly) {
      this.openRuleEditor();
    } else if (urlParams.get('edit') && !this.isViewOnly) {
      // Open editor for specific rule by ID
      const ruleId = urlParams.get('edit');
      const rule = this.rules.find(r => r.id === ruleId);
      if (rule) {
        this.openRuleEditor(rule);
      } else {
        AdminShared.showToast('Banner not found', 'error');
        this.renderRules();
      }
    } else {
      this.renderRules();
    }

    // Bind events (only for admins)
    if (!this.isViewOnly) {
      this.bindEvents();
    }
  }

  setupViewOnlyMode() {
    // Hide add buttons
    const addRuleBtn = document.getElementById('addRuleBtn');
    const createRuleEmptyBtn = document.getElementById('createRuleEmptyBtn');
    if (addRuleBtn) addRuleBtn.style.display = 'none';
    if (createRuleEmptyBtn) createRuleEmptyBtn.style.display = 'none';

    // Update page title/description for viewers
    const sectionHeader = document.querySelector('.section-header h2');
    if (sectionHeader) {
      sectionHeader.textContent = 'Banners';
    }
    const sectionDesc = document.querySelector('.section-description');
    if (sectionDesc) {
      sectionDesc.textContent = 'View banner rules configured by your team admins.';
    }

    // Add view-only badge
    const headerDiv = document.querySelector('.section-header > div');
    if (headerDiv) {
      const badge = document.createElement('span');
      badge.className = 'view-only-badge';
      badge.textContent = 'View Only';
      badge.style.cssText = 'display: inline-block; padding: 4px 12px; background: #f3e8ff; color: #7c3aed; border-radius: 9999px; font-size: 12px; font-weight: 500; margin-left: 12px;';
      const h2 = headerDiv.querySelector('h2');
      if (h2) h2.appendChild(badge);
    }
  }

  bindEvents() {
    // Add rule buttons
    document.getElementById('addRuleBtn').addEventListener('click', () => this.openRuleEditor());
    document.getElementById('createRuleEmptyBtn').addEventListener('click', () => this.openRuleEditor());

    // Search and filter
    document.getElementById('rulesSearch').addEventListener('input', () => this.renderRules());
    document.getElementById('rulesFilter').addEventListener('change', () => this.renderRules());

    // Refresh button
    document.getElementById('refreshBannersBtn').addEventListener('click', () => this.refreshData());

    // Editor navigation
    document.getElementById('backToRules').addEventListener('click', (e) => {
      e.preventDefault();
      this.handleBackNavigation();
    });
    document.getElementById('cancelRuleBtn').addEventListener('click', () => this.handleBackNavigation());
    document.getElementById('saveRuleBtn').addEventListener('click', () => this.saveRule());

    // Tab clicks
    document.getElementById('bannerCardTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.banner-tab');
      if (tab && !tab.disabled) {
        this.switchTab(tab.dataset.tab);
      }
    });

    // Object type change
    document.getElementById('ruleObjectType').addEventListener('change', (e) => this.onObjectTypeChange(e.target.value));

    // Add condition
    document.getElementById('addRuleConditionBtn').addEventListener('click', () => {
      AdminShared.addCondition('ruleConditions', null, this.currentProperties);
    });

    // Logic toggle
    AdminShared.initLogicToggle('ruleLogicToggle');

    // Display on all checkbox
    document.getElementById('ruleDisplayOnAll').addEventListener('change', (e) => {
      AdminShared.toggleConditionsWrapper('ruleConditionsWrapper', e.target.checked);
    });

    // Preview updates
    document.getElementById('ruleTitle').addEventListener('input', () => this.updatePreview());
    document.getElementById('ruleMessage').addEventListener('input', () => this.updatePreview());
    document.getElementById('ruleType').addEventListener('change', () => {
      this.toggleEmbedFields();
      this.updatePreview();
    });
    document.getElementById('ruleEmbedUrl').addEventListener('input', () => this.updatePreview());

    // Rich text editor
    AdminShared.initRichTextEditor('#ruleMessageToolbar', 'ruleMessage', () => this.updatePreview());
  }

  toggleEmbedFields() {
    const type = document.getElementById('ruleType').value;
    const embedUrlGroup = document.getElementById('embedUrlGroup');
    const messageGroup = document.getElementById('messageGroup');

    if (type === 'embed') {
      embedUrlGroup.style.display = 'block';
      messageGroup.style.display = 'none';
    } else {
      embedUrlGroup.style.display = 'none';
      messageGroup.style.display = 'block';
    }
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.banner-tab').forEach(tab => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });

    // Update tab panels
    document.querySelectorAll('.banner-tab-panel').forEach(panel => {
      panel.hidden = panel.id !== `banner-tab-${tabName}`;
    });
  }

  async refreshData() {
    const btn = document.getElementById('refreshBannersBtn');
    const icon = btn.querySelector('.icon');

    // Add spinning animation
    icon.style.animation = 'spin 1s linear infinite';
    btn.disabled = true;

    try {
      // Clear cache and reload
      AdminShared.clearStorageCache();
      const data = await AdminShared.loadStorageData(true);
      this.rules = data.rules || [];
      this.renderRules();
      AdminShared.showToast('Banners refreshed', 'success');
    } catch (e) {
      console.error('Failed to refresh:', e);
      AdminShared.showToast('Failed to refresh', 'error');
    } finally {
      icon.style.animation = '';
      btn.disabled = false;
    }
  }

  renderRules() {
    const search = document.getElementById('rulesSearch').value.toLowerCase();
    const filter = document.getElementById('rulesFilter').value;
    const tbody = document.getElementById('rulesTableBody');
    const emptyState = document.getElementById('rulesEmptyState');
    const table = document.getElementById('rulesTable');

    let filtered = this.rules.filter(rule => {
      if (search && !rule.name.toLowerCase().includes(search) && !rule.title?.toLowerCase().includes(search)) {
        return false;
      }
      if (filter !== 'all' && rule.type !== filter) {
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      table.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    table.style.display = 'table';
    emptyState.style.display = 'none';

    tbody.innerHTML = filtered.map(rule => {
      const objectType = rule.objectTypes?.[0] || 'All';
      const conditionCount = rule.conditions?.length || 0;

      // Build action buttons based on view-only mode
      const actionButtons = this.isViewOnly ? `
        <button class="btn-icon view-rule-btn" data-id="${rule.id}" title="View Details">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      ` : `
        <button class="btn-icon edit-rule-btn" data-id="${rule.id}" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon btn-icon-danger delete-rule-btn" data-id="${rule.id}" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      `;

      // Toggle is disabled for view-only users
      const toggleHtml = this.isViewOnly ? `
        <span class="status-badge ${rule.enabled !== false ? 'active' : 'inactive'}">${rule.enabled !== false ? 'Active' : 'Inactive'}</span>
      ` : `
        <label class="toggle-small">
          <input type="checkbox" class="toggle-rule" data-id="${rule.id}" ${rule.enabled !== false ? 'checked' : ''}>
          <span class="toggle-slider-small"></span>
        </label>
      `;

      return `
        <tr data-id="${rule.id}">
          <td>
            <span class="type-badge" style="background: ${AdminShared.TYPE_COLORS[rule.type] || AdminShared.TYPE_COLORS.info}"></span>
          </td>
          <td><strong>${AdminShared.escapeHtml(rule.name)}</strong></td>
          <td>${AdminShared.escapeHtml(rule.title || '-')}</td>
          <td>${AdminShared.TYPE_LABELS[rule.type] || rule.type}</td>
          <td><span class="object-badge">${objectType}</span></td>
          <td>${conditionCount} condition${conditionCount !== 1 ? 's' : ''}</td>
          <td>${rule.priority || 10}</td>
          <td>${toggleHtml}</td>
          <td>
            <div class="action-buttons">${actionButtons}</div>
          </td>
        </tr>
      `;
    }).join('');

    // Bind row events
    tbody.querySelectorAll('.edit-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => this.editRule(btn.dataset.id));
    });

    tbody.querySelectorAll('.delete-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteRule(btn.dataset.id));
    });

    tbody.querySelectorAll('.toggle-rule').forEach(checkbox => {
      checkbox.addEventListener('change', () => this.toggleRule(checkbox.dataset.id));
    });

    // View button for view-only mode
    tbody.querySelectorAll('.view-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => this.viewRuleDetails(btn.dataset.id));
    });
  }

  viewRuleDetails(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return;

    // Create a simple modal to show rule details
    const modal = document.createElement('div');
    modal.className = 'view-details-modal';
    modal.innerHTML = `
      <div class="view-details-overlay"></div>
      <div class="view-details-content">
        <div class="view-details-header">
          <h3>${AdminShared.escapeHtml(rule.name)}</h3>
          <button class="btn-icon close-details-btn" title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="view-details-body">
          <div class="detail-row">
            <label>Title:</label>
            <span>${AdminShared.escapeHtml(rule.title || '-')}</span>
          </div>
          <div class="detail-row">
            <label>Type:</label>
            <span class="type-badge-inline" style="background: ${AdminShared.TYPE_COLORS[rule.type] || AdminShared.TYPE_COLORS.info}">${AdminShared.TYPE_LABELS[rule.type] || rule.type}</span>
          </div>
          <div class="detail-row">
            <label>Message:</label>
            <div class="detail-message">${rule.message || '-'}</div>
          </div>
          <div class="detail-row">
            <label>Object Type:</label>
            <span>${rule.objectTypes?.[0] || 'All'}</span>
          </div>
          <div class="detail-row">
            <label>Conditions:</label>
            <span>${rule.conditions?.length || 0} condition${(rule.conditions?.length || 0) !== 1 ? 's' : ''}</span>
          </div>
          <div class="detail-row">
            <label>Status:</label>
            <span class="status-badge ${rule.enabled !== false ? 'active' : 'inactive'}">${rule.enabled !== false ? 'Active' : 'Inactive'}</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => modal.remove();
    modal.querySelector('.close-details-btn').addEventListener('click', closeModal);
    modal.querySelector('.view-details-overlay').addEventListener('click', closeModal);
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    });
  }

  openRuleEditor(rule = null) {
    this.editingRuleId = rule?.id || null;
    document.getElementById('ruleEditorTitle').textContent = rule ? 'Edit Banner' : 'Add Banner';

    // Reset to Content tab
    this.switchTab('content');

    // Reset form
    document.getElementById('ruleName').value = rule?.name || '';
    document.getElementById('ruleTitle').value = rule?.title || '';
    document.getElementById('ruleMessage').innerHTML = rule?.message || '';
    document.getElementById('ruleType').value = rule?.type || 'info';
    document.getElementById('rulePriority').value = rule?.priority || 10;
    document.getElementById('ruleEmbedUrl').value = rule?.embedUrl || rule?.url || '';

    // Toggle embed fields visibility
    this.toggleEmbedFields();

    // Set related play
    const playSelectEl = document.getElementById('ruleRelatedPlay');
    if (playSelectEl) {
      AdminShared.setPlaySelectValue(playSelectEl, rule?.relatedPlayId || '', this.plays);
    }

    const objectType = rule?.objectTypes?.[0] || rule?.objectType || '';
    const objectTypeMap = { contact: 'contacts', company: 'companies', deal: 'deals', ticket: 'tickets' };
    const mappedType = objectTypeMap[objectType] || objectType;
    document.getElementById('ruleObjectType').value = mappedType;

    this.currentProperties = [];
    document.getElementById('ruleConditions').innerHTML = '';
    document.getElementById('addRuleConditionBtn').disabled = true;
    document.getElementById('ruleConditionStatus').textContent = '';

    // Display on all
    const displayOnAll = rule?.displayOnAll || false;
    document.getElementById('ruleDisplayOnAll').checked = displayOnAll;
    AdminShared.toggleConditionsWrapper('ruleConditionsWrapper', displayOnAll);

    // Tab visibility - empty means all tabs, otherwise show the number
    const tabVis = rule?.tabVisibility;
    document.getElementById('ruleTabVisibility').value = (tabVis && tabVis !== 'all') ? tabVis : '';

    // Load properties and conditions
    if (mappedType && rule?.conditions?.length) {
      this.loadPropertiesAndConditions(mappedType, rule.conditions);
    } else if (mappedType) {
      this.onObjectTypeChange(mappedType);
    }

    // Set logic
    AdminShared.setLogic('ruleLogicToggle', rule?.logic || 'AND');

    this.updatePreview();

    // Store original data for change detection
    setTimeout(() => {
      this.originalData = this.getCurrentFormData();
    }, 100);

    // Show editor
    document.getElementById('rulesSection').classList.remove('active');
    document.getElementById('ruleEditorSection').classList.add('active');
  }

  getCurrentFormData() {
    const playSelectEl = document.getElementById('ruleRelatedPlay');
    return JSON.stringify({
      name: document.getElementById('ruleName').value,
      title: document.getElementById('ruleTitle').value,
      message: document.getElementById('ruleMessage').innerHTML,
      type: document.getElementById('ruleType').value,
      priority: document.getElementById('rulePriority').value,
      objectType: document.getElementById('ruleObjectType').value,
      displayOnAll: document.getElementById('ruleDisplayOnAll').checked,
      tabVisibility: document.getElementById('ruleTabVisibility').value,
      logic: AdminShared.getLogic('ruleLogicToggle'),
      conditions: AdminShared.getConditions('ruleConditions'),
      embedUrl: document.getElementById('ruleEmbedUrl').value,
      relatedPlayId: playSelectEl ? AdminShared.getPlaySelectValue(playSelectEl) : ''
    });
  }

  hasUnsavedChanges() {
    if (!this.originalData) return false;
    const currentData = this.getCurrentFormData();
    return currentData !== this.originalData;
  }

  async handleBackNavigation() {
    if (this.hasUnsavedChanges()) {
      const result = await AdminShared.showConfirmDialog({
        title: 'Unsaved Changes',
        message: "You haven't saved this banner. Are you sure you want to go back?",
        primaryLabel: 'Save',
        secondaryLabel: 'Discard',
        showCancel: true
      });

      if (result === 'primary') {
        await this.saveRule();
      } else if (result === 'secondary') {
        this.closeRuleEditor();
      }
      // 'cancel' - do nothing, stay on page
    } else {
      this.closeRuleEditor();
    }
  }

  closeRuleEditor() {
    this.editingRuleId = null;
    this.originalData = null;
    document.getElementById('ruleEditorSection').classList.remove('active');
    document.getElementById('rulesSection').classList.add('active');
    this.renderRules();

    // Clear URL params
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  updatePreview() {
    const title = document.getElementById('ruleTitle').value || 'Banner Title';
    const message = document.getElementById('ruleMessage').innerHTML || 'Your message will appear here';
    const type = document.getElementById('ruleType').value;
    const embedUrl = document.getElementById('ruleEmbedUrl').value.trim();

    const preview = document.getElementById('rulePreview');

    if (type === 'embed') {
      const convertedUrl = AdminShared.convertToEmbedUrl(embedUrl);
      if (convertedUrl) {
        preview.innerHTML = `
          <div class="media-preview">
            <iframe
              src="${convertedUrl}"
              frameborder="0"
              allowfullscreen="true"
              mozallowfullscreen="true"
              webkitallowfullscreen="true">
            </iframe>
          </div>
        `;
      } else {
        preview.innerHTML = `
          <div class="media-preview">
            <div class="preview-placeholder">
              <span class="icon icon-presentation icon--xl"></span>
              <p>Enter a URL to preview</p>
            </div>
          </div>
        `;
      }
    } else {
      preview.innerHTML = `
        <div class="preview-banner ${type}">
          <strong>${AdminShared.escapeHtml(title)}</strong>
          <div class="preview-message">${message}</div>
        </div>
      `;
    }
  }

  async onObjectTypeChange(objectType) {
    const statusEl = document.getElementById('ruleConditionStatus');
    const addBtn = document.getElementById('addRuleConditionBtn');
    const container = document.getElementById('ruleConditions');

    if (!objectType) {
      this.currentProperties = [];
      addBtn.disabled = true;
      statusEl.textContent = '';
      return;
    }

    statusEl.textContent = 'Loading properties...';
    statusEl.className = 'status-text';
    addBtn.disabled = true;

    try {
      const properties = await AdminShared.fetchProperties(objectType, this.propertiesCache);
      this.currentProperties = properties;
      addBtn.disabled = false;
      statusEl.textContent = `${properties.length} properties loaded`;
      statusEl.className = 'status-text success';
      container.innerHTML = '';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'status-text error';
      addBtn.disabled = true;
    }
  }

  async loadPropertiesAndConditions(objectType, conditions) {
    const statusEl = document.getElementById('ruleConditionStatus');
    const addBtn = document.getElementById('addRuleConditionBtn');

    statusEl.textContent = 'Loading properties...';
    statusEl.className = 'status-text';

    try {
      const properties = await AdminShared.fetchProperties(objectType, this.propertiesCache);
      this.currentProperties = properties;
      addBtn.disabled = false;
      statusEl.textContent = '';

      conditions.forEach(c => AdminShared.addCondition('ruleConditions', c, properties));
    } catch (err) {
      statusEl.textContent = 'Error loading properties';
      statusEl.className = 'status-text error';
      conditions.forEach(c => AdminShared.addCondition('ruleConditions', c, []));
    }
  }

  async saveRule() {
    const name = document.getElementById('ruleName').value.trim();
    const title = document.getElementById('ruleTitle').value.trim();
    const message = document.getElementById('ruleMessage').innerHTML.trim();
    const type = document.getElementById('ruleType').value;
    const priority = parseInt(document.getElementById('rulePriority').value) || 10;
    const objectTypeValue = document.getElementById('ruleObjectType').value;
    let embedUrl = document.getElementById('ruleEmbedUrl').value.trim();

    if (!name) {
      alert('Please enter a banner name');
      return;
    }

    if (!objectTypeValue) {
      alert('Please select an object type');
      return;
    }

    // Validate embed URL for embed type
    if (type === 'embed') {
      if (!embedUrl) {
        alert('Please enter an embed URL');
        return;
      }
      // Ensure URL has https:// prefix
      if (!embedUrl.startsWith('https://') && !embedUrl.startsWith('http://')) {
        embedUrl = 'https://' + embedUrl;
      }
      const convertedUrl = AdminShared.convertToEmbedUrl(embedUrl);
      if (!convertedUrl) {
        alert('Please enter a valid embed URL (Google Slides, YouTube, Loom, Vimeo, OneDrive, or SharePoint)');
        return;
      }
    }

    const objectTypeReverseMap = { contacts: 'contact', companies: 'company', deals: 'deal', tickets: 'ticket' };
    const objectTypes = [objectTypeReverseMap[objectTypeValue] || objectTypeValue];
    const conditions = AdminShared.getConditions('ruleConditions');
    const logic = AdminShared.getLogic('ruleLogicToggle');
    const displayOnAll = document.getElementById('ruleDisplayOnAll').checked;
    const tabVisibilityInput = document.getElementById('ruleTabVisibility').value.trim();
    const tabVisibility = tabVisibilityInput ? String(tabVisibilityInput) : 'all';

    // Get related play
    const playSelectEl = document.getElementById('ruleRelatedPlay');
    const relatedPlayId = playSelectEl ? AdminShared.getPlaySelectValue(playSelectEl) : '';

    // Build banner data object (camelCase for local use)
    const bannerData = {
      name,
      title: title || name,
      message,
      type,
      priority,
      objectTypes,
      objectType: objectTypeValue,
      conditions,
      logic,
      displayOnAll,
      tabVisibility,
      relatedPlayId: relatedPlayId || null,
      enabled: true
    };

    // Add embed URL for embed type
    if (type === 'embed') {
      bannerData.url = embedUrl;
      bannerData.embedUrl = AdminShared.convertToEmbedUrl(embedUrl);
    }

    try {
      // In web context, save directly to Supabase
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        // Supabase uses snake_case column names - map from camelCase
        const supabaseData = {
          name,
          title: title || name,
          message,
          type,
          priority,
          object_types: objectTypes,
          object_type: objectTypeValue,
          conditions,
          logic,
          display_on_all: displayOnAll,
          tab_visibility: tabVisibility,
          related_play_id: relatedPlayId || null,
          enabled: true
        };

        // Add embed URL for embed type
        if (type === 'embed') {
          supabaseData.url = embedUrl;
          supabaseData.embed_url = AdminShared.convertToEmbedUrl(embedUrl);
        }

        if (this.editingRuleId) {
          // Update existing banner
          const { data, error } = await RevGuideDB.updateBanner(this.editingRuleId, supabaseData);
          if (error) throw error;

          // Map response back to camelCase and update local array
          const mappedData = this.mapBannerFromSupabase(data);
          const index = this.rules.findIndex(r => r.id === this.editingRuleId);
          if (index !== -1) {
            this.rules[index] = mappedData;
          }
        } else {
          // Create new banner
          const { data, error } = await RevGuideDB.createBanner(supabaseData);
          if (error) throw error;

          // Map response back to camelCase and add to local array
          const mappedData = this.mapBannerFromSupabase(data);
          this.rules.push(mappedData);
        }

        // Clear storage cache so next load gets fresh data
        AdminShared.clearStorageCache();
      } else {
        // Extension context - use local storage
        const rule = {
          id: this.editingRuleId || 'rule_' + Date.now(),
          name,
          title: title || name,
          message,
          type,
          priority,
          objectTypes,
          objectType: objectTypeValue,
          conditions,
          logic,
          displayOnAll,
          tabVisibility,
          relatedPlayId,
          enabled: true,
          createdAt: Date.now()
        };

        if (type === 'embed') {
          rule.url = embedUrl;
          rule.embedUrl = AdminShared.convertToEmbedUrl(embedUrl);
        }

        if (this.editingRuleId) {
          const index = this.rules.findIndex(r => r.id === this.editingRuleId);
          if (index !== -1) {
            rule.createdAt = this.rules[index].createdAt;
            rule.enabled = this.rules[index].enabled;
            rule.updatedAt = Date.now();
            this.rules[index] = rule;
          }
        } else {
          this.rules.push(rule);
        }

        await AdminShared.saveStorageData({ rules: this.rules });
      }

      AdminShared.notifyContentScript();
      AdminShared.showToast('Banner saved successfully', 'success');
      this.closeRuleEditor();
    } catch (error) {
      console.error('Failed to save banner:', error);
      AdminShared.showToast(`Failed to save banner: ${error.message}`, 'error');
    }
  }

  // Map Supabase snake_case response to camelCase for local use
  mapBannerFromSupabase(data) {
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      title: data.title,
      message: data.message,
      type: data.type,
      priority: data.priority,
      objectTypes: data.object_types,
      objectType: data.object_type,
      conditions: data.conditions,
      logic: data.logic,
      displayOnAll: data.display_on_all,
      tabVisibility: data.tab_visibility,
      relatedPlayId: data.related_play_id,
      enabled: data.enabled,
      url: data.url,
      embedUrl: data.embed_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  editRule(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) this.openRuleEditor(rule);
  }

  async toggleRule(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      const newEnabled = rule.enabled === false ? true : false;

      try {
        if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
          const { error } = await RevGuideDB.updateBanner(ruleId, { enabled: newEnabled });
          if (error) throw error;
          rule.enabled = newEnabled;
          AdminShared.clearStorageCache();
        } else {
          rule.enabled = newEnabled;
          await AdminShared.saveStorageData({ rules: this.rules });
        }

        this.renderRules();
        AdminShared.notifyContentScript();
      } catch (error) {
        console.error('Failed to toggle banner:', error);
        AdminShared.showToast(`Failed to update banner: ${error.message}`, 'error');
      }
    }
  }

  async deleteRule(ruleId) {
    if (confirm('Are you sure you want to delete this banner?')) {
      try {
        if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
          const { error } = await RevGuideDB.deleteBanner(ruleId);
          if (error) throw error;
          AdminShared.clearStorageCache();
        } else {
          await AdminShared.saveStorageData({ rules: this.rules });
        }

        this.rules = this.rules.filter(r => r.id !== ruleId);
        this.renderRules();
        AdminShared.notifyContentScript();
        AdminShared.showToast('Banner deleted', 'success');
      } catch (error) {
        console.error('Failed to delete banner:', error);
        AdminShared.showToast(`Failed to delete banner: ${error.message}`, 'error');
      }
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new BannersPage();
});
