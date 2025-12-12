/**
 * HubSpot Helper - Banners Page
 */

class BannersPage {
  constructor() {
    this.rules = [];
    this.propertiesCache = {};
    this.currentProperties = [];
    this.editingRuleId = null;
    this.originalData = null; // For tracking unsaved changes
    this.activeTab = 'content';
    this.init();
  }

  async init() {
    // Render sidebar
    AdminShared.renderSidebar('banners');

    // Load data
    const data = await AdminShared.loadStorageData();
    this.rules = data.rules || [];

    // Check for action param (e.g., from home page)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add') {
      this.openRuleEditor();
    } else if (urlParams.get('edit')) {
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

    // Bind events
    this.bindEvents();
  }

  bindEvents() {
    // Add rule buttons
    document.getElementById('addRuleBtn').addEventListener('click', () => this.openRuleEditor());
    document.getElementById('createRuleEmptyBtn').addEventListener('click', () => this.openRuleEditor());

    // Search and filter
    document.getElementById('rulesSearch').addEventListener('input', () => this.renderRules());
    document.getElementById('rulesFilter').addEventListener('change', () => this.renderRules());

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
          <td>
            <label class="toggle-small">
              <input type="checkbox" class="toggle-rule" data-id="${rule.id}" ${rule.enabled !== false ? 'checked' : ''}>
              <span class="toggle-slider-small"></span>
            </label>
          </td>
          <td>
            <div class="action-buttons">
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
            </div>
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
      embedUrl: document.getElementById('ruleEmbedUrl').value
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
      enabled: true,
      createdAt: Date.now()
    };

    // Add embed URL and converted URL for embed type
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
    AdminShared.notifyContentScript();
    AdminShared.showToast('Banner saved successfully', 'success');
    this.closeRuleEditor();
  }

  editRule(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) this.openRuleEditor(rule);
  }

  async toggleRule(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = rule.enabled === false ? true : false;
      await AdminShared.saveStorageData({ rules: this.rules });
      this.renderRules();
      AdminShared.notifyContentScript();
    }
  }

  async deleteRule(ruleId) {
    if (confirm('Are you sure you want to delete this banner?')) {
      this.rules = this.rules.filter(r => r.id !== ruleId);
      await AdminShared.saveStorageData({ rules: this.rules });
      this.renderRules();
      AdminShared.notifyContentScript();
      AdminShared.showToast('Banner deleted', 'success');
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new BannersPage();
});
