/**
 * RevGuide - Wiki Page
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
    this.isSelectMode = false;
    this.selectedEntryIds = new Set();
    this.isViewOnly = false; // View-only mode for members
    this.definitionEditor = null; // Tiptap editor instance
    this.shouldScrollToEntry = false; // Flag to scroll to entry after render
    this.init();
  }

  async init() {
    // Check authentication (redirects to login if not authenticated)
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    // Check if user can edit content (admins, owners, editors can; viewers cannot)
    this.isViewOnly = !AdminShared.canEditContent();

    // Render sidebar
    AdminShared.renderSidebar('wiki');

    // Setup view-only UI if member
    if (this.isViewOnly) {
      this.setupViewOnlyMode();
    }

    // Load data
    const data = await AdminShared.loadStorageData();
    this.wikiEntries = data.wikiEntries || [];

    // Migrate old entries (term -> title/trigger)
    await this.migrateEntries();

    // Set initial selection
    if (this.wikiEntries.length > 0) {
      this.selectedEntryId = this.wikiEntries[0].id;
    }

    // Bind events (skip editing events for view-only)
    this.bindEvents();

    // Check for action param (only if not view-only)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add' && !this.isViewOnly) {
      this.createNewEntry();
    } else if (urlParams.get('action') === 'import' && !this.isViewOnly) {
      this.openImportFieldsModal();
    } else if (urlParams.get('edit')) {
      // Select and view specific entry by ID (view-only will just view)
      const entryId = urlParams.get('edit');
      const entry = this.wikiEntries.find(e => e.id === entryId);
      if (entry) {
        this.selectedEntryId = entryId;
        this.shouldScrollToEntry = true; // Scroll to entry in nav tree
      } else {
        AdminShared.showToast('Wiki entry not found', 'error');
      }
    }

    // Initial render
    this.render();
  }

  setupViewOnlyMode() {
    // Hide add/import buttons
    const addWikiBtn = document.getElementById('addWikiBtn');
    const importFieldsBtn = document.getElementById('importFieldsBtn');
    if (addWikiBtn) addWikiBtn.style.display = 'none';
    if (importFieldsBtn) importFieldsBtn.style.display = 'none';

    // Hide select mode button
    const selectModeBtn = document.getElementById('wikiSelectModeBtn');
    if (selectModeBtn) selectModeBtn.style.display = 'none';

    // Update page description for viewers
    const sectionDesc = document.querySelector('.section-description');
    if (sectionDesc) {
      sectionDesc.textContent = 'View wiki entries and field definitions configured by your team admins.';
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

    // Hide card action buttons (duplicate, delete, save)
    const duplicateBtn = document.getElementById('duplicateEntryBtn');
    const deleteBtn = document.getElementById('deleteEntryBtn');
    const saveWikiBtn = document.getElementById('saveWikiBtn');
    const cancelWikiBtn = document.getElementById('cancelWikiBtn');
    const saveEntryBtnTop = document.getElementById('saveEntryBtnTop');
    if (duplicateBtn) duplicateBtn.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (saveWikiBtn) saveWikiBtn.style.display = 'none';
    if (cancelWikiBtn) cancelWikiBtn.style.display = 'none';
    if (saveEntryBtnTop) saveEntryBtnTop.style.display = 'none';

    // Hide status toggle
    const statusToggle = document.getElementById('wikiStatusToggle');
    if (statusToggle) statusToggle.style.display = 'none';

    // Make form inputs read-only
    this.makeFormReadOnly();
  }

  makeFormReadOnly() {
    // This will be called after form is rendered to make inputs read-only
    const formInputs = ['wikiTitle', 'wikiTrigger', 'wikiAliases', 'wikiCategory',
      'wikiObjectType', 'wikiPropertyGroup', 'wikiDefinition', 'wikiLink',
      'wikiMatchType', 'wikiFrequency', 'wikiIncludeAliases', 'wikiPriority',
      'wikiPageType', 'wikiUrlPatterns'];

    formInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.readOnly = true;
          el.style.backgroundColor = 'var(--color-bg-subtle)';
        } else if (el.tagName === 'SELECT') {
          el.disabled = true;
          el.style.backgroundColor = 'var(--color-bg-subtle)';
        } else if (el.contentEditable === 'true') {
          el.contentEditable = 'false';
          el.style.backgroundColor = 'var(--color-bg-subtle)';
        }
      }
    });

    // Hide toolbar buttons for rich text
    const toolbar = document.getElementById('wikiDefinitionToolbar');
    if (toolbar) toolbar.style.display = 'none';
  }

  bindEvents() {
    // Add wiki button
    document.getElementById('addWikiBtn').addEventListener('click', () => this.createNewEntry());
    document.getElementById('importFieldsBtn').addEventListener('click', () => this.openImportFieldsModal());

    // Search and filters
    document.getElementById('wikiSearch').addEventListener('input', () => this.renderNavTree());
    document.getElementById('wikiSearchClear').addEventListener('click', () => this.clearSearch());
    document.getElementById('wikiFilter').addEventListener('change', () => this.renderNavTree());
    document.getElementById('wikiObjectFilter').addEventListener('change', () => this.renderNavTree());

    // Expand/Collapse
    document.getElementById('wikiExpandAllBtn').addEventListener('click', () => this.expandAllNodes());
    document.getElementById('wikiCollapseAllBtn').addEventListener('click', () => this.collapseAllNodes());

    // Refresh button
    document.getElementById('refreshWikiBtn').addEventListener('click', () => this.refreshData());

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
    document.getElementById('saveEntryBtnTop').addEventListener('click', () => this.saveWikiEntry());
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

    // Initialize Tiptap editor
    this.initDefinitionEditor();

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

    // Multi-select mode
    document.getElementById('wikiSelectModeBtn').addEventListener('click', () => this.toggleSelectMode());
    document.getElementById('wikiSelectAll').addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
    document.getElementById('wikiDeleteSelectedBtn').addEventListener('click', () => this.deleteSelectedEntries());
    document.getElementById('wikiCancelSelectBtn').addEventListener('click', () => this.exitSelectMode());
  }

  async initDefinitionEditor() {
    // Wait for TiptapEditor to be available (loaded as module)
    const waitForTiptap = () => {
      return new Promise((resolve) => {
        if (window.TiptapEditor) {
          resolve();
        } else {
          const check = setInterval(() => {
            if (window.TiptapEditor) {
              clearInterval(check);
              resolve();
            }
          }, 50);
        }
      });
    };

    await waitForTiptap();

    this.definitionEditor = await TiptapEditor.create('#wikiDefinitionEditor', {
      placeholder: 'Enter the definition or explanation...',
      minimal: false, // Full toolbar with headings, tables, etc.
      onChange: () => {
        this.markUnsavedChanges();
        this.updatePreview();
      }
    });
  }

  // ============ RENDERING ============

  async refreshData() {
    const btn = document.getElementById('refreshWikiBtn');
    const icon = btn.querySelector('.icon');

    // Add spinning animation
    icon.classList.add('spinning');
    btn.disabled = true;

    try {
      // Clear cache and reload
      AdminShared.clearStorageCache();
      const data = await AdminShared.loadStorageData(true);
      this.wikiEntries = data.wikiEntries || [];
      this.render();
      AdminShared.showToast('Wiki refreshed', 'success');
    } catch (e) {
      console.error('Failed to refresh:', e);
      AdminShared.showToast('Failed to refresh', 'error');
    } finally {
      icon.classList.remove('spinning');
      btn.disabled = false;
    }
  }

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

    // Separate parent entries from child entries
    const parentEntries = filtered.filter(e => !e.parentId);
    const childEntriesMap = new Map();
    filtered.filter(e => e.parentId).forEach(child => {
      if (!childEntriesMap.has(child.parentId)) {
        childEntriesMap.set(child.parentId, []);
      }
      childEntriesMap.get(child.parentId).push(child);
    });

    // Group parent entries by object type, then by property group
    const groups = {};
    parentEntries.forEach(entry => {
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

      // Get all entry IDs under this object type for group selection
      const objectEntryIds = Object.values(groups[objectType]).flat().map(e => e.id);
      const objectAllChecked = objectEntryIds.length > 0 && objectEntryIds.every(id => this.selectedEntryIds.has(id));
      const objectSomeChecked = objectEntryIds.some(id => this.selectedEntryIds.has(id));

      html += `
        <li class="wiki-node wiki-node-object" data-object="${objectType}">
          <div class="wiki-node-header">
            ${this.isSelectMode ? `<input type="checkbox" class="wiki-group-checkbox" data-object="${objectType}" ${objectAllChecked ? 'checked' : ''} ${objectSomeChecked && !objectAllChecked ? 'data-indeterminate="true"' : ''}>` : ''}
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

        // Get all entry IDs under this group for group selection
        const groupEntryIds = entriesInGroup.map(e => e.id);
        const groupAllChecked = groupEntryIds.length > 0 && groupEntryIds.every(id => this.selectedEntryIds.has(id));
        const groupSomeChecked = groupEntryIds.some(id => this.selectedEntryIds.has(id));
        const groupKey = `${objectType}:${this.slugify(groupName)}`;

        html += `
          <li class="wiki-node wiki-node-group" data-group="${this.slugify(groupName)}" data-object="${objectType}">
            <div class="wiki-node-header">
              ${this.isSelectMode ? `<input type="checkbox" class="wiki-group-checkbox" data-group-key="${groupKey}" ${groupAllChecked ? 'checked' : ''} ${groupSomeChecked && !groupAllChecked ? 'data-indeterminate="true"' : ''}>` : ''}
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
          const isChecked = this.selectedEntryIds.has(entry.id);
          const statusClass = entry.enabled !== false ? 'status-dot--enabled' : 'status-dot--disabled';
          const hasTrigger = entry.trigger && entry.trigger.trim();
          const children = childEntriesMap.get(entry.id) || [];
          const hasChildren = children.length > 0;

          if (hasChildren) {
            // Entry with children - render as expandable node
            html += `
              <li class="wiki-node wiki-node-entry" data-id="${entry.id}">
                <div class="wiki-node-header wiki-node-term ${isSelected ? 'is-selected' : ''} ${!hasTrigger ? 'no-trigger' : ''}">
                  ${this.isSelectMode ? `<input type="checkbox" class="wiki-entry-checkbox" data-id="${entry.id}" ${isChecked ? 'checked' : ''}>` : ''}
                  <button class="wiki-node-toggle" aria-expanded="true">
                    <span class="icon icon-chevron-right"></span>
                  </button>
                  <span class="status-dot ${statusClass}"></span>
                  <span class="wiki-term-text">${AdminShared.escapeHtml(entry.title)}</span>
                  <span class="wiki-node-count">${children.length}</span>
                  ${!hasTrigger ? '<span class="wiki-term-badge">No tooltip</span>' : ''}
                </div>
                <ul class="wiki-node-children">
            `;

            // Render children
            children.forEach(child => {
              const childIsSelected = child.id === this.selectedEntryId;
              const childIsChecked = this.selectedEntryIds.has(child.id);
              const childStatusClass = child.enabled !== false ? 'status-dot--enabled' : 'status-dot--disabled';
              const childHasTrigger = child.trigger && child.trigger.trim();

              html += `
                <li class="wiki-node-term wiki-node-child ${childIsSelected ? 'is-selected' : ''} ${!childHasTrigger ? 'no-trigger' : ''}" data-id="${child.id}">
                  ${this.isSelectMode ? `<input type="checkbox" class="wiki-entry-checkbox" data-id="${child.id}" ${childIsChecked ? 'checked' : ''}>` : ''}
                  <span class="status-dot ${childStatusClass}"></span>
                  <span class="wiki-term-text">${AdminShared.escapeHtml(child.title)}</span>
                  ${!childHasTrigger ? '<span class="wiki-term-badge">No tooltip</span>' : ''}
                </li>
              `;
            });

            html += `
                </ul>
              </li>
            `;
          } else {
            // Entry without children - render as simple term
            html += `
              <li class="wiki-node-term ${isSelected ? 'is-selected' : ''} ${!hasTrigger ? 'no-trigger' : ''}" data-id="${entry.id}">
                ${this.isSelectMode ? `<input type="checkbox" class="wiki-entry-checkbox" data-id="${entry.id}" ${isChecked ? 'checked' : ''}>` : ''}
                <span class="status-dot ${statusClass}"></span>
                <span class="wiki-term-text">${AdminShared.escapeHtml(entry.title)}</span>
                ${!hasTrigger ? '<span class="wiki-term-badge">No tooltip</span>' : ''}
              </li>
            `;
          }
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

    // Scroll to selected entry if navigating via URL
    if (this.shouldScrollToEntry && this.selectedEntryId) {
      this.scrollToSelectedEntry();
      this.shouldScrollToEntry = false;
    }
  }

  scrollToSelectedEntry() {
    const navTree = document.getElementById('wikiNavTree');
    // Find the selected element by data-id
    const selectedEl = navTree.querySelector(`[data-id="${this.selectedEntryId}"].is-selected`) ||
                       navTree.querySelector(`.wiki-node-entry[data-id="${this.selectedEntryId}"] .is-selected`);

    if (!selectedEl) return;

    // Expand all ancestor nodes so the element is visible
    let parent = selectedEl.closest('.wiki-node');
    while (parent) {
      parent.classList.remove('is-collapsed');
      const toggle = parent.querySelector(':scope > .wiki-node-header .wiki-node-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
      }
      parent = parent.parentElement?.closest('.wiki-node');
    }

    // Scroll the element into view with smooth behavior
    setTimeout(() => {
      selectedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
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

    // Click on node header to expand/collapse (only for object and group nodes, not entry nodes)
    navTree.querySelectorAll('.wiki-node-object > .wiki-node-header, .wiki-node-group > .wiki-node-header').forEach(header => {
      header.addEventListener('click', () => {
        const toggle = header.querySelector('.wiki-node-toggle');
        if (toggle) {
          toggle.click();
        }
      });
    });

    // Click on term to select
    navTree.querySelectorAll('.wiki-node-term').forEach(term => {
      term.addEventListener('click', async (e) => {
        // If clicking on toggle button, don't select (let toggle handle it)
        if (e.target.closest('.wiki-node-toggle')) {
          return;
        }

        // If clicking on checkbox in select mode, handle separately
        if (e.target.classList.contains('wiki-entry-checkbox')) {
          return;
        }

        // Get the entry ID - either from the term itself or from parent .wiki-node-entry
        const entryId = term.dataset.id || term.closest('.wiki-node-entry')?.dataset.id;
        if (!entryId) return;

        // If in select mode, toggle checkbox instead of selecting
        if (this.isSelectMode) {
          const checkbox = term.querySelector('.wiki-entry-checkbox');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            this.handleEntryCheckboxChange(entryId, checkbox.checked);
          }
          return;
        }

        if (this.hasUnsavedChanges) {
          const result = await AdminShared.showConfirmDialog({
            title: 'Unsaved Changes',
            message: "You haven't saved this wiki entry. Are you sure you want to switch?",
            primaryLabel: 'Save',
            secondaryLabel: 'Discard',
            showCancel: true
          });

          if (result === 'primary') {
            await this.saveWikiEntry();
          } else if (result === 'cancel') {
            return;
          }
          // 'secondary' = discard and continue
        }
        this.hasUnsavedChanges = false;
        this.selectEntry(entryId);
      });
    });

    // Checkbox change events in select mode
    navTree.querySelectorAll('.wiki-entry-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.handleEntryCheckboxChange(checkbox.dataset.id, checkbox.checked);
      });
    });

    // Group checkbox change events in select mode
    navTree.querySelectorAll('.wiki-group-checkbox').forEach(checkbox => {
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.handleGroupCheckboxChange(checkbox, checkbox.checked);
      });
      // Set indeterminate state
      if (checkbox.dataset.indeterminate === 'true') {
        checkbox.indeterminate = true;
      }
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

    // Apply view-only mode if member
    if (this.isViewOnly) {
      this.makeFormReadOnly();
    }
  }

  populateFormFields(entry) {
    // Content tab fields
    document.getElementById('wikiTitle').value = entry?.title || '';
    document.getElementById('wikiTrigger').value = entry?.trigger || '';
    document.getElementById('wikiAliases').value = entry?.aliases?.join(', ') || '';
    if (this.definitionEditor) {
      this.definitionEditor.setContent(entry?.definition || '');
    }
    document.getElementById('wikiLink').value = entry?.link || '';

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
    const aliasesCountEl = document.getElementById('wikiAliasesCount');

    createdEl.textContent = entry.createdAt
      ? new Date(entry.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '-';

    updatedEl.textContent = entry.updatedAt
      ? new Date(entry.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'Never';

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
    const definition = (this.definitionEditor ? this.definitionEditor.getHTML() : '') || '<p>Your definition will appear here</p>';
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
    this.updateSaveButtonIcon();

    // Update nav tree selection
    document.querySelectorAll('.wiki-node-term').forEach(node => {
      // Get entry ID from node itself or parent .wiki-node-entry
      const nodeEntryId = node.dataset.id || node.closest('.wiki-node-entry')?.dataset.id;
      node.classList.toggle('is-selected', nodeEntryId === entryId);
    });

    // Re-render card
    this.renderCard();

    // Switch to content tab
    this.switchTab('content');
  }

  async createNewEntry() {
    // Check limit before creating a new wiki entry
    const canCreate = await AdminShared.checkContentLimit('wiki');
    if (!canCreate) return;

    if (this.hasUnsavedChanges) {
      const result = await AdminShared.showConfirmDialog({
        title: 'Unsaved Changes',
        message: "You haven't saved this wiki entry. Are you sure you want to create a new one?",
        primaryLabel: 'Save',
        secondaryLabel: 'Discard',
        showCancel: true
      });

      if (result === 'primary') {
        await this.saveWikiEntry();
      } else if (result === 'cancel') {
        return;
      }
      // 'secondary' = discard and continue
    }

    this.selectedEntryId = null;
    this.isCreatingNew = true;
    this.hasUnsavedChanges = true; // New entries are unsaved
    this.updateSaveButtonIcon();

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

  clearSearch() {
    const searchInput = document.getElementById('wikiSearch');
    searchInput.value = '';
    searchInput.focus();
    this.renderNavTree();
  }

  // ============ EDITING ============

  markUnsavedChanges() {
    this.hasUnsavedChanges = true;
    this.updateSaveButtonIcon();
  }

  updateSaveButtonIcon() {
    const icon = document.getElementById('saveEntryBtnTopIcon');
    if (!icon) return;

    if (this.hasUnsavedChanges) {
      icon.className = 'icon icon-save icon--sm';
    } else {
      icon.className = 'icon icon-check icon--sm';
    }
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
        await this.saveWikiEntry();
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

  async saveWikiEntry() {
    // Gather data from Content tab
    const title = document.getElementById('wikiTitle').value.trim();
    const trigger = document.getElementById('wikiTrigger').value.trim();
    const aliasesStr = document.getElementById('wikiAliases').value.trim();
    const definition = this.definitionEditor ? this.definitionEditor.getHTML().trim() : '';
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
      if (this.definitionEditor) {
        this.definitionEditor.focus();
      }
      return;
    }

    // Check for duplicate trigger words
    if (trigger) {
      const duplicateTrigger = this.findDuplicateTrigger(trigger, this.selectedEntryId);
      if (duplicateTrigger) {
        const proceed = await this.showDuplicateTriggerWarning(trigger, duplicateTrigger);
        if (!proceed) {
          this.switchTab('content');
          document.getElementById('wikiTrigger').focus();
          return;
        }
      }
    }

    // Check for duplicate aliases
    const aliases = aliasesStr ? aliasesStr.split(',').map(a => a.trim()).filter(a => a) : [];
    if (aliases.length > 0) {
      const duplicateAlias = this.findDuplicateAlias(aliases, this.selectedEntryId);
      if (duplicateAlias) {
        const proceed = await this.showDuplicateAliasWarning(duplicateAlias.alias, duplicateAlias.entry);
        if (!proceed) {
          this.switchTab('content');
          document.getElementById('wikiAliases').focus();
          return;
        }
      }
    }

    // Process data (aliases already parsed above for duplicate check)
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

    try {
      // In web context, save directly to Supabase
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        // Map to Supabase snake_case column names
        const supabaseData = {
          title: entry.title,
          trigger: entry.trigger,
          aliases: entry.aliases,
          category: entry.category,
          object_type: entry.objectType,
          property_group: entry.propertyGroup,
          definition: entry.definition,
          link: entry.link,
          match_type: entry.matchType,
          frequency: entry.frequency,
          include_aliases: entry.includeAliases,
          priority: entry.priority,
          page_type: entry.pageType,
          url_patterns: entry.urlPatterns,
          enabled: entry.enabled
        };

        if (isNew) {
          // Create new entry
          const { data, error } = await RevGuideDB.createWikiEntry(supabaseData);
          if (error) throw error;

          // Map response back to camelCase and use the server-generated entry
          const mappedData = this.mapWikiFromSupabase(data);
          this.wikiEntries.push(mappedData);
          this.selectedEntryId = mappedData.id;
          this.isCreatingNew = false;
        } else {
          // Update existing entry
          const { data, error } = await RevGuideDB.updateWikiEntry(this.selectedEntryId, supabaseData);
          if (error) throw error;

          // Map response back to camelCase and update local array
          const mappedData = this.mapWikiFromSupabase(data);
          const index = this.wikiEntries.findIndex(e => e.id === this.selectedEntryId);
          if (index !== -1) {
            this.wikiEntries[index] = mappedData;
          }
        }

        // Clear storage cache so next load gets fresh data
        AdminShared.clearStorageCache();
      } else {
        // Extension context - use local storage
        if (isNew) {
          this.wikiEntries.push(entry);
          this.selectedEntryId = entry.id;
          this.isCreatingNew = false;
        }

        await AdminShared.saveStorageData({ wikiEntries: this.wikiEntries });
      }

      AdminShared.notifyContentScript();

      this.hasUnsavedChanges = false;
      this.updateSaveButtonIcon();

      // Re-render
      this.render();

      AdminShared.showToast('Wiki entry saved', 'success');
    } catch (error) {
      console.error('Failed to save wiki entry:', error);
      AdminShared.showToast(`Failed to save: ${error.message}`, 'error');
    }

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

    const entryIdToDelete = this.selectedEntryId;

    try {
      // In web context, delete from Supabase
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        const { error } = await RevGuideDB.deleteWikiEntry(entryIdToDelete);
        if (error) throw error;
        AdminShared.clearStorageCache();
      } else {
        await AdminShared.saveStorageData({ wikiEntries: this.wikiEntries });
      }

      // Remove entry from local array
      this.wikiEntries = this.wikiEntries.filter(e => e.id !== entryIdToDelete);

      // Select first remaining entry or clear selection
      if (this.wikiEntries.length > 0) {
        this.selectedEntryId = this.wikiEntries[0].id;
      } else {
        this.selectedEntryId = null;
      }

      this.hasUnsavedChanges = false;

      AdminShared.notifyContentScript();

      // Re-render
      this.render();

      AdminShared.showToast('Wiki entry deleted', 'success');
    } catch (error) {
      console.error('Failed to delete wiki entry:', error);
      AdminShared.showToast(`Failed to delete: ${error.message}`, 'error');
    }
  }

  // ============ MULTI-SELECT MODE ============

  toggleSelectMode() {
    this.isSelectMode = !this.isSelectMode;
    if (this.isSelectMode) {
      this.enterSelectMode();
    } else {
      this.exitSelectMode();
    }
  }

  enterSelectMode() {
    this.isSelectMode = true;
    this.selectedEntryIds.clear();

    // Show bulk actions bar
    document.getElementById('wikiBulkActions').style.display = 'flex';
    document.getElementById('wikiSelectModeBtn').classList.add('active');

    // Toggle icon to checked state
    const icon = document.getElementById('wikiSelectModeIcon');
    icon.classList.remove('icon-square');
    icon.classList.add('icon-check-square');

    // Update UI
    this.updateSelectionCount();
    this.renderNavTree();
  }

  exitSelectMode() {
    this.isSelectMode = false;
    this.selectedEntryIds.clear();

    // Hide bulk actions bar
    document.getElementById('wikiBulkActions').style.display = 'none';
    document.getElementById('wikiSelectModeBtn').classList.remove('active');
    document.getElementById('wikiSelectAll').checked = false;

    // Toggle icon back to unchecked state
    const icon = document.getElementById('wikiSelectModeIcon');
    icon.classList.remove('icon-check-square');
    icon.classList.add('icon-square');

    // Re-render without checkboxes
    this.renderNavTree();
  }

  handleEntryCheckboxChange(entryId, isChecked) {
    if (isChecked) {
      this.selectedEntryIds.add(entryId);
    } else {
      this.selectedEntryIds.delete(entryId);
    }
    this.updateSelectionCount();
    this.updateSelectAllState();
    this.updateGroupCheckboxStates();
  }

  handleGroupCheckboxChange(checkbox, isChecked) {
    // Get all entry IDs under this group/object type
    const entryIds = this.getEntryIdsForGroupCheckbox(checkbox);

    entryIds.forEach(id => {
      if (isChecked) {
        this.selectedEntryIds.add(id);
      } else {
        this.selectedEntryIds.delete(id);
      }
    });

    this.updateSelectionCount();
    this.updateSelectAllState();
    // Re-render to update all checkbox states
    this.renderNavTree();
  }

  getEntryIdsForGroupCheckbox(checkbox) {
    const objectType = checkbox.dataset.object;
    const groupKey = checkbox.dataset.groupKey;

    // Get current visible entries
    const visibleEntryIds = new Set(this.getVisibleEntryIds());

    if (groupKey) {
      // This is a property group checkbox
      const [objType, groupSlug] = groupKey.split(':');
      const groupNode = checkbox.closest('.wiki-node-group');
      const entryCheckboxes = groupNode.querySelectorAll('.wiki-entry-checkbox');
      return Array.from(entryCheckboxes)
        .map(cb => cb.dataset.id)
        .filter(id => visibleEntryIds.has(id));
    } else if (objectType) {
      // This is an object type checkbox
      const objectNode = checkbox.closest('.wiki-node-object');
      const entryCheckboxes = objectNode.querySelectorAll('.wiki-entry-checkbox');
      return Array.from(entryCheckboxes)
        .map(cb => cb.dataset.id)
        .filter(id => visibleEntryIds.has(id));
    }

    return [];
  }

  updateGroupCheckboxStates() {
    // Update all group checkboxes based on their children's state
    document.querySelectorAll('.wiki-group-checkbox').forEach(checkbox => {
      const entryIds = this.getEntryIdsForGroupCheckbox(checkbox);
      const allChecked = entryIds.length > 0 && entryIds.every(id => this.selectedEntryIds.has(id));
      const someChecked = entryIds.some(id => this.selectedEntryIds.has(id));

      checkbox.checked = allChecked;
      checkbox.indeterminate = someChecked && !allChecked;
    });
  }

  toggleSelectAll(checked) {
    // Get all visible (filtered) entry IDs
    const visibleEntryIds = this.getVisibleEntryIds();

    if (checked) {
      visibleEntryIds.forEach(id => this.selectedEntryIds.add(id));
    } else {
      visibleEntryIds.forEach(id => this.selectedEntryIds.delete(id));
    }

    // Update checkboxes in the tree
    document.querySelectorAll('.wiki-entry-checkbox').forEach(cb => {
      cb.checked = checked;
    });

    this.updateSelectionCount();
  }

  getVisibleEntryIds() {
    const search = document.getElementById('wikiSearch').value.toLowerCase().trim();
    const categoryFilter = document.getElementById('wikiFilter').value;
    const objectFilter = document.getElementById('wikiObjectFilter').value;

    return this.wikiEntries.filter(entry => {
      // Search filter
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
    }).map(e => e.id);
  }

  updateSelectionCount() {
    const count = this.selectedEntryIds.size;
    document.getElementById('wikiSelectedCount').textContent = `${count} selected`;
    document.getElementById('wikiDeleteSelectedBtn').disabled = count === 0;
  }

  updateSelectAllState() {
    const visibleEntryIds = this.getVisibleEntryIds();
    const allSelected = visibleEntryIds.length > 0 && visibleEntryIds.every(id => this.selectedEntryIds.has(id));
    const someSelected = visibleEntryIds.some(id => this.selectedEntryIds.has(id));

    const selectAllCheckbox = document.getElementById('wikiSelectAll');
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = someSelected && !allSelected;
  }

  async deleteSelectedEntries() {
    const count = this.selectedEntryIds.size;
    if (count === 0) return;

    const result = await AdminShared.showConfirmDialog({
      title: 'Delete Selected Entries',
      message: `Are you sure you want to delete ${count} wiki ${count === 1 ? 'entry' : 'entries'}? This action cannot be undone.`,
      primaryLabel: 'Delete',
      secondaryLabel: 'Cancel',
      showCancel: false
    });

    if (result !== 'primary') {
      return;
    }

    // Delete from Supabase in web context
    if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
      for (const entryId of this.selectedEntryIds) {
        try {
          const { error } = await RevGuideDB.deleteWikiEntry(entryId);
          if (error) console.error(`Failed to delete wiki entry ${entryId}:`, error);
        } catch (e) {
          console.error(`Failed to delete wiki entry ${entryId}:`, e);
        }
      }
      AdminShared.clearStorageCache();
    } else {
      // Extension context - save filtered array
      this.wikiEntries = this.wikiEntries.filter(e => !this.selectedEntryIds.has(e.id));
      await AdminShared.saveStorageData({ wikiEntries: this.wikiEntries });
    }

    // Remove selected entries from local array
    this.wikiEntries = this.wikiEntries.filter(e => !this.selectedEntryIds.has(e.id));

    // Clear selection if current entry was deleted
    if (this.selectedEntryIds.has(this.selectedEntryId)) {
      this.selectedEntryId = this.wikiEntries.length > 0 ? this.wikiEntries[0].id : null;
    }

    AdminShared.notifyContentScript();

    // Exit select mode
    this.exitSelectMode();

    // Re-render
    this.render();

    AdminShared.showToast(`${count} wiki ${count === 1 ? 'entry' : 'entries'} deleted`, 'success');
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
    document.getElementById('importDropdownValues').checked = false;
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
    const importOptions = document.getElementById('fieldsImportOptions');
    this.currentImportObjectType = objectType;

    if (!objectType) {
      fieldsList.style.display = 'none';
      importOptions.style.display = 'none';
      statusEl.textContent = '';
      return;
    }

    statusEl.innerHTML = `
      <div class="loading-indicator">
        <svg class="loading-spinner" viewBox="0 0 24 24" width="20" height="20">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4" stroke-dashoffset="10">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
          </circle>
        </svg>
        <span>Loading fields from HubSpot...</span>
      </div>
    `;
    statusEl.className = 'status-text loading';
    fieldsList.style.display = 'none';
    importOptions.style.display = 'none';

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

      // Group properties by property group
      const groupedProperties = {};
      for (const prop of properties) {
        const groupName = prop.groupName
          ? prop.groupName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          : 'Other';
        if (!groupedProperties[groupName]) {
          groupedProperties[groupName] = [];
        }
        groupedProperties[groupName].push(prop);
      }

      // Sort groups alphabetically, but put "Other" last
      const sortedGroups = Object.keys(groupedProperties).sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
      });

      // Build tree HTML
      let treeHtml = '';
      for (const groupName of sortedGroups) {
        const groupProps = groupedProperties[groupName];
        const groupId = `import-group-${groupName.toLowerCase().replace(/\s+/g, '-')}`;

        // Count non-imported fields in this group
        const availableCount = groupProps.filter(prop => {
          const existingEntry = existingByText.get(prop.label.toLowerCase()) || existingByText.get(prop.name.toLowerCase());
          return !existingEntry || !existingEntry.objectType || !existingEntry.propertyGroup;
        }).length;

        treeHtml += `
          <div class="fields-tree-node" data-group="${AdminShared.escapeHtml(groupName)}">
            <div class="fields-tree-header" data-group-id="${groupId}">
              <button type="button" class="fields-tree-toggle" aria-expanded="true">
                <span class="icon icon-chevron-right"></span>
              </button>
              <label class="checkbox-label fields-tree-label">
                <input type="checkbox" class="fields-group-checkbox" data-group="${AdminShared.escapeHtml(groupName)}">
                <span class="fields-tree-name">${AdminShared.escapeHtml(groupName)}</span>
                <span class="fields-tree-count">${availableCount}/${groupProps.length}</span>
              </label>
            </div>
            <div class="fields-tree-children" id="${groupId}">
        `;

        for (const prop of groupProps) {
          const existingEntry = existingByText.get(prop.label.toLowerCase()) || existingByText.get(prop.name.toLowerCase());
          const isImported = !!existingEntry;
          const needsUpdate = existingEntry && (!existingEntry.objectType || !existingEntry.propertyGroup);
          const hasOptions = prop.options && prop.options.length > 0;

          let badgeHtml = '';
          let itemClass = '';
          if (isImported && needsUpdate) {
            badgeHtml = '<span class="field-badge field-badge-update">Update available</span>';
            itemClass = 'needs-update';
          } else if (isImported) {
            badgeHtml = '<span class="field-badge">Already added</span>';
            itemClass = 'already-imported';
          }
          if (hasOptions) {
            badgeHtml += '<span class="field-badge field-badge-dropdown">Dropdown</span>';
          }

          treeHtml += `
            <label class="field-item ${itemClass}" data-name="${prop.name}" data-label="${AdminShared.escapeHtml(prop.label)}" data-existing-id="${existingEntry?.id || ''}" data-group="${AdminShared.escapeHtml(groupName)}" data-has-options="${hasOptions}">
              <input type="checkbox" class="field-checkbox" value="${prop.name}" ${isImported && !needsUpdate ? 'disabled' : ''}>
              <div class="field-info">
                <span class="field-label">${AdminShared.escapeHtml(prop.label)}</span>
                <span class="field-name">${prop.name}</span>
              </div>
              ${badgeHtml}
            </label>
          `;
        }

        treeHtml += `
            </div>
          </div>
        `;
      }

      fieldsListItems.innerHTML = treeHtml;

      fieldsList.style.display = 'block';
      importOptions.style.display = 'block';
      statusEl.textContent = `${properties.length} fields found in ${sortedGroups.length} groups`;
      statusEl.className = 'status-text success';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);

      // Add event listeners for field checkboxes
      fieldsListItems.querySelectorAll('.field-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          this.updateImportButtonState();
          this.updateGroupCheckboxState(cb.closest('.field-item').dataset.group);
        });
      });

      // Add event listeners for group checkboxes
      fieldsListItems.querySelectorAll('.fields-group-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => this.toggleGroupFields(e.target));
      });

      // Add event listeners for tree toggles
      fieldsListItems.querySelectorAll('.fields-tree-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const node = btn.closest('.fields-tree-node');
          const children = node.querySelector('.fields-tree-children');
          const isExpanded = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', !isExpanded);
          children.style.display = isExpanded ? 'none' : 'block';
        });
      });

    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'status-text error';
    }
  }

  toggleGroupFields(groupCheckbox) {
    const groupName = groupCheckbox.dataset.group;
    const checked = groupCheckbox.checked;
    const items = document.querySelectorAll(`#fieldsListItems .field-item[data-group="${groupName}"]`);

    items.forEach(item => {
      const cb = item.querySelector('.field-checkbox');
      if (!cb.disabled) {
        cb.checked = checked;
      }
    });

    this.updateImportButtonState();
  }

  updateGroupCheckboxState(groupName) {
    const items = document.querySelectorAll(`#fieldsListItems .field-item[data-group="${groupName}"]`);
    const groupCb = document.querySelector(`.fields-group-checkbox[data-group="${groupName}"]`);
    if (!groupCb) return;

    const enabledItems = Array.from(items).filter(item => !item.querySelector('.field-checkbox').disabled);
    const checkedItems = enabledItems.filter(item => item.querySelector('.field-checkbox').checked);

    if (checkedItems.length === 0) {
      groupCb.checked = false;
      groupCb.indeterminate = false;
    } else if (checkedItems.length === enabledItems.length) {
      groupCb.checked = true;
      groupCb.indeterminate = false;
    } else {
      groupCb.checked = false;
      groupCb.indeterminate = true;
    }
  }

  toggleAllFields(checked) {
    document.querySelectorAll('#fieldsListItems .field-checkbox:not(:disabled)').forEach(cb => {
      cb.checked = checked;
    });
    // Update all group checkboxes
    document.querySelectorAll('#fieldsListItems .fields-group-checkbox').forEach(gcb => {
      this.updateGroupCheckboxState(gcb.dataset.group);
    });
    this.updateImportButtonState();
  }

  filterFieldsList(query) {
    const normalizedQuery = query.toLowerCase().trim();

    // Filter individual field items and track which groups have matches
    document.querySelectorAll('#fieldsListItems .field-item').forEach(item => {
      const label = item.dataset.label.toLowerCase();
      const name = item.dataset.name.toLowerCase();
      const group = (item.dataset.group || '').toLowerCase();
      const matches = !normalizedQuery || label.includes(normalizedQuery) || name.includes(normalizedQuery) || group.includes(normalizedQuery);
      item.style.display = matches ? 'flex' : 'none';
    });

    // Show/hide group nodes - show if group name matches OR has visible children
    document.querySelectorAll('#fieldsListItems .fields-tree-node').forEach(node => {
      const groupName = (node.dataset.group || '').toLowerCase();
      const groupNameMatches = normalizedQuery && groupName.includes(normalizedQuery);

      // If group name matches, show all children
      if (groupNameMatches) {
        node.style.display = 'block';
        node.querySelectorAll('.field-item').forEach(item => {
          item.style.display = 'flex';
        });
      } else {
        // Otherwise, check if any children are visible
        const visibleChildren = node.querySelectorAll('.field-item[style*="flex"], .field-item:not([style*="display"])');
        const hasVisibleChildren = Array.from(visibleChildren).some(child => {
          const display = window.getComputedStyle(child).display;
          return display !== 'none';
        });
        node.style.display = hasVisibleChildren ? 'block' : 'none';
      }
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
    const importDropdownValues = document.getElementById('importDropdownValues').checked;

    if (checkedItems.length === 0) {
      alert('Please select at least one field to import');
      return;
    }

    let newCount = 0;
    let updateCount = 0;
    let childCount = 0;
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

      let parentId = existingId || null;

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
          parentId = existingId;
        }
      } else {
        const newId = 'wiki_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        if (!firstNewId) firstNewId = newId;
        parentId = newId;

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

      // Import dropdown values as nested wiki entries if option is checked
      if (importDropdownValues && prop.options && prop.options.length > 0 && parentId) {
        for (const opt of prop.options) {
          // Check if this dropdown value already exists as a child entry
          const existingChild = this.wikiEntries.find(e =>
            e.parentId === parentId &&
            (e.title?.toLowerCase() === opt.label.toLowerCase() ||
             e.aliases?.some(a => a.toLowerCase() === opt.value.toLowerCase()))
          );

          if (!existingChild) {
            const childId = 'wiki_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

            // Build definition for the dropdown value
            let childDefinition = `<p><strong>${AdminShared.escapeHtml(opt.label)}</strong></p>`;
            childDefinition += `<p>Value: <code>${opt.value}</code></p>`;
            if (opt.description) {
              childDefinition += `<p>${AdminShared.escapeHtml(opt.description)}</p>`;
            }
            childDefinition += `<p>Parent field: ${AdminShared.escapeHtml(prop.label)}</p>`;

            this.wikiEntries.push({
              id: childId,
              parentId: parentId,  // Link to parent property
              title: opt.label,
              trigger: opt.label,
              aliases: [opt.value],  // API value as alias
              category: 'field',
              objectType: objectType || null,
              definition: childDefinition,
              link: '',
              enabled: true,
              createdAt: Date.now()
            });
            childCount++;
          }
        }
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
    const parts = [];
    if (newCount > 0) parts.push(`${newCount} field(s)`);
    if (updateCount > 0) parts.push(`updated ${updateCount} existing`);
    if (childCount > 0) parts.push(`${childCount} dropdown value(s)`);

    if (parts.length > 0) {
      message = `Imported ${parts.join(', ')}`;
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

  /**
   * Find an existing entry with a matching trigger word (case-insensitive)
   * Also checks aliases for conflicts
   * @param {string} trigger - The trigger word to check
   * @param {string|null} excludeId - Entry ID to exclude (for editing existing entries)
   * @returns {Object|null} The conflicting entry, or null if no conflict
   */
  findDuplicateTrigger(trigger, excludeId = null) {
    if (!trigger) return null;

    const triggerLower = trigger.toLowerCase();

    for (const entry of this.wikiEntries) {
      // Skip the entry being edited
      if (excludeId && entry.id === excludeId) continue;

      // Skip disabled entries (they won't cause tooltip conflicts)
      if (entry.enabled === false) continue;

      // Check if this entry's trigger matches
      if (entry.trigger && entry.trigger.toLowerCase() === triggerLower) {
        return entry;
      }

      // Check if any of this entry's aliases match
      if (entry.aliases && entry.aliases.length > 0) {
        const matchingAlias = entry.aliases.find(a => a.toLowerCase() === triggerLower);
        if (matchingAlias) {
          return entry;
        }
      }
    }

    return null;
  }

  /**
   * Show a warning dialog when a duplicate trigger is found
   * @param {string} trigger - The duplicate trigger word
   * @param {Object} existingEntry - The entry that already uses this trigger
   * @returns {Promise<boolean>} True if user wants to proceed anyway
   */
  async showDuplicateTriggerWarning(trigger, existingEntry) {
    const result = await AdminShared.showConfirmDialog({
      title: 'Duplicate Trigger Word',
      message: `The trigger word "${trigger}" is already used by "${existingEntry.title}". Having duplicate triggers can cause unpredictable tooltip behavior.\n\nDo you want to save anyway?`,
      primaryLabel: 'Save Anyway',
      secondaryLabel: 'Cancel',
      showCancel: false
    });

    return result === 'primary';
  }

  /**
   * Find an existing entry where one of the provided aliases conflicts
   * with another entry's trigger or aliases
   * @param {string[]} aliases - The aliases to check
   * @param {string|null} excludeId - Entry ID to exclude (for editing existing entries)
   * @returns {Object|null} Object with { alias, entry } or null if no conflict
   */
  findDuplicateAlias(aliases, excludeId = null) {
    if (!aliases || aliases.length === 0) return null;

    for (const alias of aliases) {
      const aliasLower = alias.toLowerCase();

      for (const entry of this.wikiEntries) {
        // Skip the entry being edited
        if (excludeId && entry.id === excludeId) continue;

        // Skip disabled entries
        if (entry.enabled === false) continue;

        // Check if this entry's trigger matches the alias
        if (entry.trigger && entry.trigger.toLowerCase() === aliasLower) {
          return { alias, entry };
        }

        // Check if any of this entry's aliases match
        if (entry.aliases && entry.aliases.length > 0) {
          const matchingAlias = entry.aliases.find(a => a.toLowerCase() === aliasLower);
          if (matchingAlias) {
            return { alias, entry };
          }
        }
      }
    }

    return null;
  }

  /**
   * Show a warning dialog when a duplicate alias is found
   * @param {string} alias - The duplicate alias
   * @param {Object} existingEntry - The entry that already uses this alias/trigger
   * @returns {Promise<boolean>} True if user wants to proceed anyway
   */
  async showDuplicateAliasWarning(alias, existingEntry) {
    const result = await AdminShared.showConfirmDialog({
      title: 'Duplicate Alias',
      message: `The alias "${alias}" conflicts with "${existingEntry.title}". Having duplicate triggers/aliases can cause unpredictable tooltip behavior.\n\nDo you want to save anyway?`,
      primaryLabel: 'Save Anyway',
      secondaryLabel: 'Cancel',
      showCancel: false
    });

    return result === 'primary';
  }

  // Map Supabase snake_case response to camelCase for local use
  mapWikiFromSupabase(data) {
    if (!data) return null;
    return {
      id: data.id,
      title: data.title,
      trigger: data.trigger,
      aliases: data.aliases,
      category: data.category,
      objectType: data.object_type,
      propertyGroup: data.property_group,
      definition: data.definition,
      link: data.link,
      matchType: data.match_type,
      frequency: data.frequency,
      includeAliases: data.include_aliases,
      priority: data.priority,
      pageType: data.page_type,
      urlPatterns: data.url_patterns,
      enabled: data.enabled,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

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
