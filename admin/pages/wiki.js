/**
 * HubSpot Helper - Wiki Page
 * Two-Pane Layout with Navigation Tree and Card View
 */

class WikiPage {
  constructor() {
    this.wikiEntries = [];
    this.propertiesCache = {};
    this.propertyGroupsCache = {};
    this.selectedEntryId = null;
    this.editingPropertyValues = [];
    this.importFieldsData = [];
    this.currentImportObjectType = '';
    this.activeTab = 'content';
    this.isCreatingNew = false;
    this.hasUnsavedChanges = false;
    this.init();
  }

  async init() {
    // Render sidebar
    AdminShared.renderSidebar('wiki');

    // Load data
    const data = await AdminShared.loadStorageData();
    this.wikiEntries = data.wikiEntries || [];

    // Migrate old entries (term -> title/trigger)
    await this.migrateEntries();

    // Set initial selection
    if (this.wikiEntries.length > 0) {
      this.selectedEntryId = this.wikiEntries[0].id;
    }

    // Bind events
    this.bindEvents();

    // Check for action param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add') {
      this.createNewEntry();
    } else if (urlParams.get('action') === 'import') {
      this.openImportFieldsModal();
    } else if (urlParams.get('edit')) {
      // Select and edit specific entry by ID
      const entryId = urlParams.get('edit');
      const entry = this.wikiEntries.find(e => e.id === entryId);
      if (entry) {
        this.selectedEntryId = entryId;
      } else {
        AdminShared.showToast('Wiki entry not found', 'error');
      }
    }

    // Initial render
    this.render();
  }

  bindEvents() {
    // Add wiki button
    document.getElementById('addWikiBtn').addEventListener('click', () => this.createNewEntry());
    document.getElementById('importFieldsBtn').addEventListener('click', () => this.openImportFieldsModal());

    // Search and filters
    document.getElementById('wikiSearch').addEventListener('input', () => this.renderNavTree());
    document.getElementById('wikiFilter').addEventListener('change', () => this.renderNavTree());
    document.getElementById('wikiObjectFilter').addEventListener('change', () => this.renderNavTree());

    // Expand/Collapse
    document.getElementById('wikiExpandAllBtn').addEventListener('click', () => this.expandAllNodes());
    document.getElementById('wikiCollapseAllBtn').addEventListener('click', () => this.collapseAllNodes());

    // Tab clicks
    document.getElementById('wikiCardTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.wiki-tab');
      if (tab) {
        this.switchTab(tab.dataset.tab);
      }
    });

    // Status toggle
    document.getElementById('wikiStatusToggle').addEventListener('click', () => this.toggleSelectedStatus());

    // Card actions
    document.getElementById('duplicateEntryBtn').addEventListener('click', () => this.duplicateEntry());
    document.getElementById('deleteEntryBtn').addEventListener('click', () => this.deleteEntry());

    // Save/Cancel
    document.getElementById('saveWikiBtn').addEventListener('click', () => this.saveWikiEntry());
    document.getElementById('cancelWikiBtn').addEventListener('click', () => this.cancelEditing());

    // Preview updates
    document.getElementById('wikiTitle').addEventListener('input', () => {
      this.markUnsavedChanges();
      this.updatePreview();
    });
    document.getElementById('wikiTrigger').addEventListener('input', () => {
      this.markUnsavedChanges();
      this.updatePreview();
    });
    document.getElementById('wikiCategory').addEventListener('change', () => {
      this.markUnsavedChanges();
      this.updatePreview();
    });
    document.getElementById('wikiDefinition').addEventListener('input', () => {
      this.markUnsavedChanges();
      this.updatePreview();
    });

    // Other form inputs - mark unsaved changes
    ['wikiAliases', 'wikiLink', 'wikiObjectType', 'wikiPropertyGroup',
     'wikiMatchType', 'wikiFrequency', 'wikiIncludeAliases', 'wikiPriority',
     'wikiPageType', 'wikiUrlPatterns'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => this.markUnsavedChanges());
        el.addEventListener('input', () => this.markUnsavedChanges());
      }
    });

    // Rich text editor
    AdminShared.initRichTextEditor('#wikiDefinitionToolbar', 'wikiDefinition', () => {
      this.markUnsavedChanges();
      this.updatePreview();
    });

    // Property values
    document.getElementById('addPropertyValueBtn').addEventListener('click', () => this.addPropertyValue());

    // Object type change - load property groups
    document.getElementById('wikiObjectType').addEventListener('change', (e) => {
      this.loadPropertyGroups(e.target.value);
    });

    // Import modal
    document.getElementById('closeImportFieldsModal').addEventListener('click', () => this.closeImportFieldsModal());
    document.getElementById('cancelImportFieldsBtn').addEventListener('click', () => this.closeImportFieldsModal());
    document.getElementById('confirmImportFieldsBtn').addEventListener('click', () => this.importSelectedFields());
    document.getElementById('importObjectType').addEventListener('change', (e) => this.loadFieldsForImport(e.target.value));
    document.getElementById('selectAllFields').addEventListener('change', (e) => this.toggleAllFields(e.target.checked));
    document.getElementById('fieldsSearch').addEventListener('input', (e) => this.filterFieldsList(e.target.value));
  }

  // ============ RENDERING ============

  render() {
    this.renderNavTree();
    this.renderCard();
    this.updateStats();
  }

  renderNavTree() {
    const search = document.getElementById('wikiSearch').value.toLowerCase().trim();
    const categoryFilter = document.getElementById('wikiFilter').value;
    const objectFilter = document.getElementById('wikiObjectFilter').value;

    const navTree = document.getElementById('wikiNavTree');
    const navEmpty = document.getElementById('wikiNavEmpty');

    // Filter entries
    let filtered = this.wikiEntries.filter(entry => {
      // Search filter - search in title, trigger, aliases, and plain text definition
      if (search) {
        const titleMatch = (entry.title || '').toLowerCase().includes(search);
        const triggerMatch = (entry.trigger || '').toLowerCase().includes(search);
        const aliasMatch = (entry.aliases || []).some(a => a.toLowerCase().includes(search));
        const defMatch = this.stripHtml(entry.definition || '').toLowerCase().includes(search);
        if (!titleMatch && !triggerMatch && !aliasMatch && !defMatch) {
          return false;
        }
      }

      // Category filter
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) {
        return false;
      }

      // Object filter
      if (objectFilter !== 'all') {
        if (objectFilter === 'custom') {
          if (entry.objectType) return false;
        } else {
          if (entry.objectType !== objectFilter) return false;
        }
      }

      return true;
    });

    if (filtered.length === 0) {
      navTree.innerHTML = '';
      navTree.style.display = 'none';
      navEmpty.style.display = 'flex';
      return;
    }

    navTree.style.display = 'block';
    navEmpty.style.display = 'none';

    // Group entries by object type, then by property group
    const groups = {};
    filtered.forEach(entry => {
      const objectType = entry.objectType || 'custom';
      const propertyGroup = entry.propertyGroup || 'Other';

      if (!groups[objectType]) {
        groups[objectType] = {};
      }
      if (!groups[objectType][propertyGroup]) {
        groups[objectType][propertyGroup] = [];
      }
      groups[objectType][propertyGroup].push(entry);
    });

    // Build tree HTML
    let html = '';
    const objectOrder = ['contacts', 'companies', 'deals', 'tickets', 'custom'];
    const objectLabels = {
      contacts: 'Contacts',
      companies: 'Companies',
      deals: 'Deals',
      tickets: 'Tickets',
      custom: 'Custom Terms'
    };

    objectOrder.forEach(objectType => {
      if (!groups[objectType]) return;

      const objectLabel = objectLabels[objectType] || objectType;
      const propertyGroups = Object.keys(groups[objectType]).sort();
      const totalCount = Object.values(groups[objectType]).reduce((sum, arr) => sum + arr.length, 0);

      html += `
        <li class="wiki-node wiki-node-object" data-object="${objectType}">
          <div class="wiki-node-header">
            <button class="wiki-node-toggle" aria-expanded="true">
              <span class="icon icon-chevron-right"></span>
            </button>
            <span class="wiki-node-label">${objectLabel}</span>
            <span class="wiki-node-count">${totalCount}</span>
          </div>
          <ul class="wiki-node-children">
      `;

      propertyGroups.forEach(groupName => {
        const entriesInGroup = groups[objectType][groupName];

        html += `
          <li class="wiki-node wiki-node-group" data-group="${this.slugify(groupName)}">
            <div class="wiki-node-header">
              <button class="wiki-node-toggle" aria-expanded="true">
                <span class="icon icon-chevron-right"></span>
              </button>
              <span class="wiki-node-label">${AdminShared.escapeHtml(groupName)}</span>
              <span class="wiki-node-count">${entriesInGroup.length}</span>
            </div>
            <ul class="wiki-node-children">
        `;

        entriesInGroup.forEach(entry => {
          const isSelected = entry.id === this.selectedEntryId;
          const statusClass = entry.enabled !== false ? 'status-dot--enabled' : 'status-dot--disabled';
          const hasTrigger = entry.trigger && entry.trigger.trim();

          html += `
            <li class="wiki-node-term ${isSelected ? 'is-selected' : ''} ${!hasTrigger ? 'no-trigger' : ''}" data-id="${entry.id}">
              <span class="status-dot ${statusClass}"></span>
              <span class="wiki-term-text">${AdminShared.escapeHtml(entry.title)}</span>
              ${!hasTrigger ? '<span class="wiki-term-badge">No tooltip</span>' : ''}
            </li>
          `;
        });

        html += `
            </ul>
          </li>
        `;
      });

      html += `
          </ul>
        </li>
      `;
    });

    navTree.innerHTML = html;

    // Bind tree events
    this.bindTreeEvents();
  }

  bindTreeEvents() {
    const navTree = document.getElementById('wikiNavTree');

    // Toggle expand/collapse
    navTree.querySelectorAll('.wiki-node-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const node = btn.closest('.wiki-node');
        const isExpanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', !isExpanded);
        node.classList.toggle('is-collapsed', isExpanded);
      });
    });

    // Click on node header to expand/collapse
    navTree.querySelectorAll('.wiki-node-header').forEach(header => {
      header.addEventListener('click', () => {
        const toggle = header.querySelector('.wiki-node-toggle');
        if (toggle) {
          toggle.click();
        }
      });
    });

    // Click on term to select
    navTree.querySelectorAll('.wiki-node-term').forEach(term => {
      term.addEventListener('click', async () => {
        if (this.hasUnsavedChanges) {
          const result = await AdminShared.showConfirmDialog({
            title: 'Unsaved Changes',
            message: "You haven't saved this wiki entry. Are you sure you want to switch?",
            primaryLabel: 'Save',
            secondaryLabel: 'Discard',
            showCancel: true
          });

          if (result === 'primary') {
            await this.saveEntry();
          } else if (result === 'cancel') {
            return;
          }
          // 'secondary' = discard and continue
        }
        this.hasUnsavedChanges = false;
        this.selectEntry(term.dataset.id);
      });
    });
  }

  renderCard() {
    const entry = this.selectedEntryId
      ? this.wikiEntries.find(e => e.id === this.selectedEntryId)
      : null;

    const titleEl = document.getElementById('wikiCardTitle');
    const metaEl = document.getElementById('wikiCardMeta');
    const statusToggle = document.getElementById('wikiStatusToggle');
    const actionsEl = document.getElementById('wikiCardActions');
    const footerEl = document.getElementById('wikiCardFooter');

    // Empty states
    const contentEmpty = document.getElementById('wikiCardEmpty');
    const contentForm = document.getElementById('wikiCardContent');
    const rulesEmpty = document.getElementById('wikiRulesEmpty');
    const rulesForm = document.getElementById('wikiRulesContent');
    const usageEmpty = document.getElementById('wikiUsageEmpty');
    const usageContent = document.getElementById('wikiUsageContent');

    if (!entry && !this.isCreatingNew) {
      // Show empty state
      titleEl.textContent = 'Select an Entry';
      metaEl.innerHTML = '';
      statusToggle.style.display = 'none';
      actionsEl.style.display = 'none';
      footerEl.style.display = 'none';

      contentEmpty.style.display = 'flex';
      contentForm.style.display = 'none';
      rulesEmpty.style.display = 'flex';
      rulesForm.style.display = 'none';
      usageEmpty.style.display = 'flex';
      usageContent.style.display = 'none';
      return;
    }

    // Show form
    contentEmpty.style.display = 'none';
    contentForm.style.display = 'grid';
    rulesEmpty.style.display = 'none';
    rulesForm.style.display = 'flex';
    usageEmpty.style.display = 'none';
    usageContent.style.display = 'flex';
    footerEl.style.display = 'flex';

    if (this.isCreatingNew) {
      // New entry mode
      titleEl.textContent = 'New Entry';
      metaEl.innerHTML = '';
      statusToggle.style.display = 'none';
      actionsEl.style.display = 'none';

      // Clear form fields
      this.populateFormFields(null);
    } else {
      // Existing entry mode
      titleEl.textContent = entry.title;
      statusToggle.style.display = 'inline-flex';
      actionsEl.style.display = 'flex';

      // Update status toggle
      const isEnabled = entry.enabled !== false;
      statusToggle.className = `status-toggle ${isEnabled ? 'is-enabled' : 'is-disabled'}`;
      statusToggle.querySelector('.status-toggle-label').textContent = isEnabled ? 'Enabled' : 'Disabled';

      // Update meta badges
      const categoryLabel = AdminShared.WIKI_CATEGORY_LABELS[entry.category] || entry.category || 'General';
      const objectLabel = entry.objectType ? entry.objectType.charAt(0).toUpperCase() + entry.objectType.slice(1) : '';

      let metaHtml = `<span class="badge badge-category">${categoryLabel}</span>`;
      if (objectLabel) {
        metaHtml += `<span class="badge badge-object">${objectLabel}</span>`;
      }
      if (entry.propertyGroup) {
        metaHtml += `<span class="badge badge-group">${AdminShared.escapeHtml(entry.propertyGroup)}</span>`;
      }
      metaEl.innerHTML = metaHtml;

      // Populate form fields
      this.populateFormFields(entry);

      // Populate usage tab
      this.populateUsageTab(entry);
    }

    this.hasUnsavedChanges = false;
  }

  populateFormFields(entry) {
    // Content tab fields
    document.getElementById('wikiTitle').value = entry?.title || '';
    document.getElementById('wikiTrigger').value = entry?.trigger || '';
    document.getElementById('wikiAliases').value = entry?.aliases?.join(', ') || '';
    document.getElementById('wikiDefinition').innerHTML = entry?.definition || '';
    document.getElementById('wikiLink').value = entry?.link || '';

    // Property values
    this.editingPropertyValues = entry?.propertyValues ? JSON.parse(JSON.stringify(entry.propertyValues)) : [];
    this.renderPropertyValues();

    // Rules tab fields
    document.getElementById('wikiCategory').value = entry?.category || 'general';
    document.getElementById('wikiObjectType').value = entry?.objectType || '';

    // Load property groups for the selected object type
    this.loadPropertyGroups(entry?.objectType || '', entry?.propertyGroup || '');

    // New rule fields (with defaults)
    document.getElementById('wikiMatchType').value = entry?.matchType || 'exact';
    document.getElementById('wikiFrequency').value = entry?.frequency || 'once';
    document.getElementById('wikiIncludeAliases').checked = entry?.includeAliases !== false;
    document.getElementById('wikiPriority').value = entry?.priority ?? 50;
    document.getElementById('wikiPageType').value = entry?.pageType || 'any';
    document.getElementById('wikiUrlPatterns').value = (entry?.urlPatterns || []).join('\n');

    // Update preview
    this.updatePreview();
  }

  populateUsageTab(entry) {
    // Created/Updated dates
    const createdEl = document.getElementById('wikiCreatedAt');
    const updatedEl = document.getElementById('wikiUpdatedAt');
    const valuesCountEl = document.getElementById('wikiValuesCount');
    const aliasesCountEl = document.getElementById('wikiAliasesCount');

    createdEl.textContent = entry.createdAt
      ? new Date(entry.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '-';

    updatedEl.textContent = entry.updatedAt
      ? new Date(entry.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'Never';

    valuesCountEl.textContent = entry.propertyValues?.length || 0;
    aliasesCountEl.textContent = entry.aliases?.length || 0;
  }

  async loadPropertyGroups(objectType, selectedGroup = '') {
    const selectEl = document.getElementById('wikiPropertyGroup');

    if (!objectType) {
      selectEl.innerHTML = '<option value="">No groups (custom term)</option>';
      return;
    }

    // Check cache first
    if (this.propertyGroupsCache[objectType]) {
      this.renderPropertyGroupOptions(this.propertyGroupsCache[objectType], selectedGroup);
      return;
    }

    selectEl.innerHTML = '<option value="">Loading groups...</option>';

    try {
      const properties = await AdminShared.fetchProperties(objectType, this.propertiesCache);

      // Extract unique groups
      const groups = [...new Set(properties.map(p => p.groupName).filter(Boolean))].sort();
      const formattedGroups = groups.map(g =>
        g.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      );

      this.propertyGroupsCache[objectType] = formattedGroups;
      this.renderPropertyGroupOptions(formattedGroups, selectedGroup);
    } catch (err) {
      selectEl.innerHTML = '<option value="">Failed to load groups</option>';
      console.error('Failed to load property groups:', err);
    }
  }

  renderPropertyGroupOptions(groups, selectedGroup) {
    const selectEl = document.getElementById('wikiPropertyGroup');
    let html = '<option value="">Select a property group...</option>';

    groups.forEach(group => {
      const selected = group === selectedGroup ? 'selected' : '';
      html += `<option value="${AdminShared.escapeHtml(group)}" ${selected}>${AdminShared.escapeHtml(group)}</option>`;
    });

    // Add option to enter custom group
    if (selectedGroup && !groups.includes(selectedGroup)) {
      html += `<option value="${AdminShared.escapeHtml(selectedGroup)}" selected>${AdminShared.escapeHtml(selectedGroup)}</option>`;
    }

    selectEl.innerHTML = html;
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.wiki-tab').forEach(tab => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });

    // Update tab panels
    document.querySelectorAll('.wiki-tab-panel').forEach(panel => {
      panel.hidden = panel.id !== `tab-${tabName}`;
    });
  }

  updatePreview() {
    const title = document.getElementById('wikiTitle').value || 'Title';
    const trigger = document.getElementById('wikiTrigger').value;
    const category = document.getElementById('wikiCategory').value || 'general';
    const definition = document.getElementById('wikiDefinition').innerHTML || '<p>Your definition will appear here</p>';
    const categoryLabel = AdminShared.WIKI_CATEGORY_LABELS[category] || category;

    const preview = document.getElementById('wikiPreview');
    preview.innerHTML = `
      <div class="wiki-preview-card">
        <div class="wiki-preview-header">
          <span class="wiki-preview-term">${AdminShared.escapeHtml(title)}</span>
          <span class="wiki-preview-category">${categoryLabel}</span>
        </div>
        ${trigger ? `<div class="wiki-preview-trigger">Triggers on: <code>${AdminShared.escapeHtml(trigger)}</code></div>` : '<div class="wiki-preview-trigger wiki-preview-no-trigger">No tooltip trigger set</div>'}
        <div class="wiki-preview-content">${definition}</div>
      </div>
    `;
  }

  updateStats() {
    const total = this.wikiEntries.length;
    const enabled = this.wikiEntries.filter(e => e.enabled !== false).length;
    const fields = this.wikiEntries.filter(e => e.category === 'field' || e.objectType).length;

    document.getElementById('wikiTotalCount').textContent = total;
    document.getElementById('wikiEnabledCount').textContent = enabled;
    document.getElementById('wikiFieldsCount').textContent = fields;
  }

  // ============ ENTRY SELECTION & NAVIGATION ============

  selectEntry(entryId) {
    this.selectedEntryId = entryId;
    this.isCreatingNew = false;
    this.hasUnsavedChanges = false;

    // Update nav tree selection
    document.querySelectorAll('.wiki-node-term').forEach(node => {
      node.classList.toggle('is-selected', node.dataset.id === entryId);
    });

    // Re-render card
    this.renderCard();

    // Switch to content tab
    this.switchTab('content');
  }

  async createNewEntry() {
    if (this.hasUnsavedChanges) {
      const result = await AdminShared.showConfirmDialog({
        title: 'Unsaved Changes',
        message: "You haven't saved this wiki entry. Are you sure you want to create a new one?",
        primaryLabel: 'Save',
        secondaryLabel: 'Discard',
        showCancel: true
      });

      if (result === 'primary') {
        await this.saveEntry();
      } else if (result === 'cancel') {
        return;
      }
      // 'secondary' = discard and continue
    }

    this.selectedEntryId = null;
    this.isCreatingNew = true;
    this.hasUnsavedChanges = false;

    // Clear nav selection
    document.querySelectorAll('.wiki-node-term').forEach(node => {
      node.classList.remove('is-selected');
    });

    // Render card in new entry mode
    this.renderCard();

    // Switch to content tab
    this.switchTab('content');

    // Focus term input
    setTimeout(() => {
      document.getElementById('wikiTerm').focus();
    }, 100);
  }

  expandAllNodes() {
    document.querySelectorAll('.wiki-node').forEach(node => {
      node.classList.remove('is-collapsed');
      const toggle = node.querySelector('.wiki-node-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  }

  collapseAllNodes() {
    document.querySelectorAll('.wiki-node-object, .wiki-node-group').forEach(node => {
      node.classList.add('is-collapsed');
      const toggle = node.querySelector('.wiki-node-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ============ EDITING ============

  markUnsavedChanges() {
    this.hasUnsavedChanges = true;
  }

  async cancelEditing() {
    if (this.hasUnsavedChanges) {
      const result = await AdminShared.showConfirmDialog({
        title: 'Unsaved Changes',
        message: "You haven't saved this wiki entry. Are you sure you want to cancel?",
        primaryLabel: 'Save',
        secondaryLabel: 'Discard',
        showCancel: true
      });

      if (result === 'primary') {
        await this.saveEntry();
        return;
      } else if (result === 'cancel') {
        return;
      }
      // 'secondary' = discard and continue
    }

    this.hasUnsavedChanges = false;

    if (this.isCreatingNew) {
      this.isCreatingNew = false;
      // Select first entry if available
      if (this.wikiEntries.length > 0) {
        this.selectEntry(this.wikiEntries[0].id);
      } else {
        this.renderCard();
      }
    } else {
      // Re-render to reset form
      this.renderCard();
    }

    // Clear URL params if present
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  async toggleSelectedStatus() {
    const entry = this.wikiEntries.find(e => e.id === this.selectedEntryId);
    if (!entry) return;

    entry.enabled = entry.enabled === false ? true : false;
    entry.updatedAt = Date.now();

    await AdminShared.saveStorageData({ wikiEntries: this.wikiEntries });
    AdminShared.notifyContentScript();

    // Update UI
    this.render();
  }

  renderPropertyValues() {
    const container = document.getElementById('wikiPropertyValues');
    if (!this.editingPropertyValues || this.editingPropertyValues.length === 0) {
      container.innerHTML = '<p class="form-hint" style="margin: 0;">No property values defined.</p>';
      return;
    }

    container.innerHTML = this.editingPropertyValues.map((value, index) => `
      <div class="property-value-item" data-index="${index}">
        <div class="form-group">
          <label>Value</label>
          <input type="text" class="pv-value" value="${AdminShared.escapeHtml(value.value || '')}" placeholder="e.g., Option A">
        </div>
        <div class="form-group">
          <label>Label</label>
          <input type="text" class="pv-label" value="${AdminShared.escapeHtml(value.label || '')}" placeholder="Display label">
        </div>
        <div class="form-group" style="flex: 2;">
          <label>Description</label>
          <input type="text" class="pv-description" value="${AdminShared.escapeHtml(value.description || '')}" placeholder="What this value means">
        </div>
        <button type="button" class="btn-remove-value" data-index="${index}">
          <span class="icon icon-x icon--sm"></span>
        </button>
      </div>
    `).join('');

    // Bind events
    container.querySelectorAll('.btn-remove-value').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        this.editingPropertyValues.splice(index, 1);
        this.renderPropertyValues();
        this.markUnsavedChanges();
      });
    });

    container.querySelectorAll('.property-value-item').forEach((item, index) => {
      item.querySelector('.pv-value').addEventListener('input', (e) => {
        this.editingPropertyValues[index].value = e.target.value;
        this.markUnsavedChanges();
      });
      item.querySelector('.pv-label').addEventListener('input', (e) => {
        this.editingPropertyValues[index].label = e.target.value;
        this.markUnsavedChanges();
      });
      item.querySelector('.pv-description').addEventListener('input', (e) => {
        this.editingPropertyValues[index].description = e.target.value;
        this.markUnsavedChanges();
      });
    });
  }

  addPropertyValue() {
    if (!this.editingPropertyValues) {
      this.editingPropertyValues = [];
    }
    this.editingPropertyValues.push({ value: '', label: '', description: '' });
    this.renderPropertyValues();
    this.markUnsavedChanges();
  }

  async saveWikiEntry() {
    // Gather data from Content tab
    const title = document.getElementById('wikiTitle').value.trim();
    const trigger = document.getElementById('wikiTrigger').value.trim();
    const aliasesStr = document.getElementById('wikiAliases').value.trim();
    const definition = document.getElementById('wikiDefinition').innerHTML.trim();
    let link = document.getElementById('wikiLink').value.trim();

    // Gather data from Rules tab
    const category = document.getElementById('wikiCategory').value;
    const objectType = document.getElementById('wikiObjectType').value;
    const propertyGroup = document.getElementById('wikiPropertyGroup').value.trim();
    const matchType = document.getElementById('wikiMatchType').value;
    const frequency = document.getElementById('wikiFrequency').value;
    const includeAliases = document.getElementById('wikiIncludeAliases').checked;
    const priority = parseInt(document.getElementById('wikiPriority').value, 10) || 50;
    const pageType = document.getElementById('wikiPageType').value;
    const urlPatternsStr = document.getElementById('wikiUrlPatterns').value.trim();

    // Validation
    if (!title) {
      alert('Please enter a title');
      this.switchTab('content');
      document.getElementById('wikiTitle').focus();
      return;
    }

    if (!definition) {
      alert('Please enter a definition');
      this.switchTab('content');
      document.getElementById('wikiDefinition').focus();
      return;
    }

    // Process data
    const aliases = aliasesStr ? aliasesStr.split(',').map(a => a.trim()).filter(a => a) : [];
    const propertyValues = (this.editingPropertyValues || []).filter(v => v.value || v.label);
    const urlPatterns = urlPatternsStr ? urlPatternsStr.split('\n').map(p => p.trim()).filter(p => p) : [];

    if (link && !link.startsWith('https://') && !link.startsWith('http://')) {
      link = 'https://' + link;
    }

    // Get existing entry or create new
    let entry;
    let isNew = false;

    if (this.isCreatingNew) {
      isNew = true;
      entry = {
        id: 'wiki_' + Date.now(),
        createdAt: Date.now(),
        enabled: true
      };
    } else {
      entry = this.wikiEntries.find(e => e.id === this.selectedEntryId);
      if (!entry) {
        alert('Entry not found');
        return;
      }
    }

    // Update entry fields
    entry.title = title;
    entry.trigger = trigger || null;
    entry.aliases = aliases.length > 0 ? aliases : null;
    entry.category = category;
    entry.objectType = objectType || null;
    entry.propertyGroup = propertyGroup || null;
    entry.propertyValues = propertyValues.length > 0 ? propertyValues : null;
    entry.definition = definition;
    entry.link = link || null;
    entry.updatedAt = Date.now();

    // Remove legacy term field if present
    delete entry.term;

    // New rule fields
    entry.matchType = matchType;
    entry.frequency = frequency;
    entry.includeAliases = includeAliases;
    entry.priority = priority;
    entry.pageType = pageType;
    entry.urlPatterns = urlPatterns.length > 0 ? urlPatterns : null;

    if (isNew) {
      this.wikiEntries.push(entry);
      this.selectedEntryId = entry.id;
      this.isCreatingNew = false;
    }

    // Save
    await AdminShared.saveStorageData({ wikiEntries: this.wikiEntries });
    AdminShared.notifyContentScript();

    this.hasUnsavedChanges = false;

    // Re-render
    this.render();

    AdminShared.showToast('Wiki entry saved', 'success');

    // Clear URL params if present
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  async duplicateEntry() {
    const entry = this.wikiEntries.find(e => e.id === this.selectedEntryId);
    if (!entry) return;

    // Clone entry
    const newEntry = JSON.parse(JSON.stringify(entry));
    newEntry.id = 'wiki_' + Date.now();
    newEntry.title = entry.title + ' (copy)';
    newEntry.createdAt = Date.now();
    newEntry.updatedAt = null;

    // Insert after original
    const index = this.wikiEntries.findIndex(e => e.id === entry.id);
    this.wikiEntries.splice(index + 1, 0, newEntry);

    // Save
    await AdminShared.saveStorageData({ wikiEntries: this.wikiEntries });
    AdminShared.notifyContentScript();

    // Select new entry
    this.selectedEntryId = newEntry.id;
    this.hasUnsavedChanges = false;

    // Re-render
    this.render();

    AdminShared.showToast('Entry duplicated', 'success');
  }

  async deleteEntry() {
    const entry = this.wikiEntries.find(e => e.id === this.selectedEntryId);
    if (!entry) return;

    if (!confirm(`Are you sure you want to delete "${entry.title}"?`)) {
      return;
    }

    // Remove entry
    this.wikiEntries = this.wikiEntries.filter(e => e.id !== this.selectedEntryId);

    // Select first remaining entry or clear selection
    if (this.wikiEntries.length > 0) {
      this.selectedEntryId = this.wikiEntries[0].id;
    } else {
      this.selectedEntryId = null;
    }

    this.hasUnsavedChanges = false;

    // Save
    await AdminShared.saveStorageData({ wikiEntries: this.wikiEntries });
    AdminShared.notifyContentScript();

    // Re-render
    this.render();

    AdminShared.showToast('Wiki entry deleted', 'success');
  }

  // ============ IMPORT FIELDS ============

  openImportFieldsModal() {
    document.getElementById('importObjectType').value = '';
    document.getElementById('fieldsLoadingStatus').textContent = '';
    document.getElementById('fieldsList').style.display = 'none';
    document.getElementById('fieldsListItems').innerHTML = '';
    document.getElementById('selectAllFields').checked = false;
    document.getElementById('fieldsSearch').value = '';
    document.getElementById('confirmImportFieldsBtn').disabled = true;
    this.importFieldsData = [];

    document.getElementById('importFieldsModal').classList.add('open');
  }

  closeImportFieldsModal() {
    document.getElementById('importFieldsModal').classList.remove('open');
    this.importFieldsData = [];
  }

  async loadFieldsForImport(objectType) {
    const statusEl = document.getElementById('fieldsLoadingStatus');
    const fieldsList = document.getElementById('fieldsList');
    const fieldsListItems = document.getElementById('fieldsListItems');
    this.currentImportObjectType = objectType;

    if (!objectType) {
      fieldsList.style.display = 'none';
      statusEl.textContent = '';
      return;
    }

    statusEl.textContent = 'Loading fields...';
    statusEl.className = 'status-text';
    fieldsList.style.display = 'none';

    try {
      const properties = await AdminShared.fetchProperties(objectType, this.propertiesCache);
      this.importFieldsData = properties;

      // Build existing map (check by title, trigger, and aliases)
      const existingByText = new Map();
      for (const entry of this.wikiEntries) {
        if (entry.title) existingByText.set(entry.title.toLowerCase(), entry);
        if (entry.trigger) existingByText.set(entry.trigger.toLowerCase(), entry);
        for (const alias of (entry.aliases || [])) {
          existingByText.set(alias.toLowerCase(), entry);
        }
      }

      fieldsListItems.innerHTML = properties.map(prop => {
        const existingEntry = existingByText.get(prop.label.toLowerCase()) || existingByText.get(prop.name.toLowerCase());
        const isImported = !!existingEntry;
        const needsUpdate = existingEntry && (!existingEntry.objectType || !existingEntry.propertyGroup);

        let badgeHtml = '';
        let itemClass = '';
        if (isImported && needsUpdate) {
          badgeHtml = '<span class="field-badge field-badge-update">Update available</span>';
          itemClass = 'needs-update';
        } else if (isImported) {
          badgeHtml = '<span class="field-badge">Already added</span>';
          itemClass = 'already-imported';
        }

        return `
          <label class="field-item ${itemClass}" data-name="${prop.name}" data-label="${AdminShared.escapeHtml(prop.label)}" data-existing-id="${existingEntry?.id || ''}">
            <input type="checkbox" class="field-checkbox" value="${prop.name}" ${isImported && !needsUpdate ? 'disabled' : ''}>
            <div class="field-info">
              <span class="field-label">${AdminShared.escapeHtml(prop.label)}</span>
              <span class="field-name">${prop.name}</span>
            </div>
            ${badgeHtml}
          </label>
        `;
      }).join('');

      fieldsList.style.display = 'block';
      statusEl.textContent = `${properties.length} fields found`;
      statusEl.className = 'status-text success';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);

      fieldsListItems.querySelectorAll('.field-checkbox').forEach(cb => {
        cb.addEventListener('change', () => this.updateImportButtonState());
      });

    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'status-text error';
    }
  }

  toggleAllFields(checked) {
    document.querySelectorAll('#fieldsListItems .field-checkbox:not(:disabled)').forEach(cb => {
      cb.checked = checked;
    });
    this.updateImportButtonState();
  }

  filterFieldsList(query) {
    const normalizedQuery = query.toLowerCase().trim();
    document.querySelectorAll('#fieldsListItems .field-item').forEach(item => {
      const label = item.dataset.label.toLowerCase();
      const name = item.dataset.name.toLowerCase();
      const matches = !normalizedQuery || label.includes(normalizedQuery) || name.includes(normalizedQuery);
      item.style.display = matches ? 'flex' : 'none';
    });
  }

  updateImportButtonState() {
    const checkedCount = document.querySelectorAll('#fieldsListItems .field-checkbox:checked').length;
    const confirmBtn = document.getElementById('confirmImportFieldsBtn');
    confirmBtn.disabled = checkedCount === 0;
    confirmBtn.textContent = checkedCount > 0 ? `Import Selected (${checkedCount})` : 'Import Selected';
  }

  async importSelectedFields() {
    const checkedItems = document.querySelectorAll('#fieldsListItems .field-item:has(.field-checkbox:checked)');
    const objectType = document.getElementById('importObjectType').value;

    if (checkedItems.length === 0) {
      alert('Please select at least one field to import');
      return;
    }

    let newCount = 0;
    let updateCount = 0;
    let firstNewId = null;

    for (const item of checkedItems) {
      const propName = item.dataset.name;
      const existingId = item.dataset.existingId;
      const prop = this.importFieldsData.find(p => p.name === propName);

      if (!prop) continue;

      // Build definition
      let definition = `<p><strong>${AdminShared.escapeHtml(prop.label)}</strong></p>`;
      definition += `<p>HubSpot API name: <code>${prop.name}</code></p>`;
      if (prop.type) {
        definition += `<p>Field type: ${prop.type}${prop.fieldType ? ` (${prop.fieldType})` : ''}</p>`;
      }
      if (prop.options && prop.options.length > 0) {
        definition += `<p>Available options:</p><ul>`;
        prop.options.slice(0, 10).forEach(opt => {
          definition += `<li>${AdminShared.escapeHtml(opt.label)} (${opt.value})</li>`;
        });
        if (prop.options.length > 10) {
          definition += `<li>...and ${prop.options.length - 10} more</li>`;
        }
        definition += `</ul>`;
      }

      // Build property values
      let propertyValues = null;
      if (prop.options && prop.options.length > 0) {
        propertyValues = prop.options.map(opt => ({
          value: opt.value,
          label: opt.label,
          description: opt.description || ''
        }));
      }

      const propertyGroup = prop.groupName
        ? prop.groupName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : null;

      if (existingId) {
        const existingIndex = this.wikiEntries.findIndex(e => e.id === existingId);
        if (existingIndex !== -1) {
          const existing = this.wikiEntries[existingIndex];
          existing.objectType = objectType || existing.objectType || null;
          existing.propertyGroup = propertyGroup || existing.propertyGroup || null;
          existing.propertyValues = propertyValues || existing.propertyValues || null;
          if (existing.definition.includes('HubSpot API name:') || !existing.definition.trim()) {
            existing.definition = definition;
          }
          existing.updatedAt = Date.now();
          updateCount++;
        }
      } else {
        const newId = 'wiki_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        if (!firstNewId) firstNewId = newId;

        this.wikiEntries.push({
          id: newId,
          title: prop.label,
          trigger: prop.label,  // Use label as trigger for imported fields
          aliases: [prop.name], // API name as alias
          category: 'field',
          objectType: objectType || null,
          propertyGroup,
          propertyValues,
          definition,
          link: '',
          enabled: true,
          createdAt: Date.now()
        });
        newCount++;
      }
    }

    await AdminShared.saveStorageData({ wikiEntries: this.wikiEntries });

    // Select first imported entry
    if (firstNewId) {
      this.selectedEntryId = firstNewId;
    }

    this.render();
    this.closeImportFieldsModal();
    AdminShared.notifyContentScript();

    let message = '';
    if (newCount > 0 && updateCount > 0) {
      message = `Imported ${newCount} new field(s) and updated ${updateCount} existing entry(ies)`;
    } else if (newCount > 0) {
      message = `Imported ${newCount} field(s) as wiki entries`;
    } else if (updateCount > 0) {
      message = `Updated ${updateCount} existing wiki entry(ies)`;
    }
    AdminShared.showToast(message, 'success');
  }

  // ============ MIGRATION ============

  /**
   * Migrate old wiki entries from term-based to title/trigger-based structure
   * Old: { term: "MQL", aliases: [...] }
   * New: { title: "MQL", trigger: "MQL", aliases: [...] }
   */
  async migrateEntries() {
    let needsSave = false;

    for (const entry of this.wikiEntries) {
      // Check if entry has old 'term' field but no 'title'
      if (entry.term && !entry.title) {
        entry.title = entry.term;
        entry.trigger = entry.term;
        delete entry.term;
        needsSave = true;
      }
      // Ensure title exists (fallback)
      if (!entry.title && entry.trigger) {
        entry.title = entry.trigger;
        needsSave = true;
      }
    }

    if (needsSave) {
      await AdminShared.saveStorageData({ wikiEntries: this.wikiEntries });
      console.log('[WikiPage] Migrated wiki entries to title/trigger format');
    }
  }

  // ============ UTILITIES ============

  slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new WikiPage();
});
