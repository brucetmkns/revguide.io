/**
 * RevGuide - Cards Page
 * Unified content management with tree navigation
 * Similar to wiki.js but for the unified cards system
 */

// Card type configuration
const CARD_TYPE_CONFIG = {
  definition: {
    label: 'Definition',
    icon: 'icon-book',
    contentLabel: 'Definition',
    defaultDisplayModes: ['tooltip'],
    color: '#7c3aed'
  },
  alert: {
    label: 'Alert',
    icon: 'icon-clipboard-list',
    contentLabel: 'Message',
    defaultDisplayModes: ['banner'],
    color: '#0ea5e9'
  },
  battlecard: {
    label: 'Battlecard',
    icon: 'icon-layers',
    contentLabel: 'Overview',
    defaultDisplayModes: ['sidepanel'],
    color: '#f59e0b'
  },
  asset: {
    label: 'Asset',
    icon: 'icon-link',
    contentLabel: 'Description',
    defaultDisplayModes: ['sidepanel'],
    color: '#10b981'
  }
};

const OBJECT_TYPE_LABELS = {
  contacts: 'Contacts',
  companies: 'Companies',
  deals: 'Deals',
  tickets: 'Tickets',
  custom: 'Custom Objects'
};

class CardsPage {
  constructor() {
    this.cards = [];
    this.filteredCards = [];
    this.selectedCardId = null;
    this.isEditing = false;
    this.hasUnsavedChanges = false;
    this.isViewOnly = false;
    this.propertiesCache = {};
    this.currentProperties = [];
    this.sections = [];
    this.assets = [];
    this.nextSteps = [];
    this.expandedGroups = new Set();
    this.contentEditor = null;
    this.init();
  }

  async init() {
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    this.isViewOnly = !AdminShared.canEditContent();
    AdminShared.renderSidebar('cards');

    if (this.isViewOnly) {
      this.setupViewOnlyMode();
    }

    await this.loadCards();
    this.bindEvents();
    this.renderTree();
    this.updateStats();

    // Check URL for card to select
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    if (editId) {
      const card = this.cards.find(c => c.id === editId);
      if (card) {
        this.selectCard(card.id);
      }
    }
  }

  setupViewOnlyMode() {
    const addCardBtn = document.getElementById('addCardBtn');
    if (addCardBtn) addCardBtn.style.display = 'none';

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

  async loadCards() {
    if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
      const { data, error } = await RevGuideDB.getCards();
      if (error) {
        console.error('Failed to load cards:', error);
        AdminShared.showToast('Failed to load cards', 'error');
        this.cards = [];
      } else {
        this.cards = (data || []).map(AdminShared.mapCardFromSupabase);
      }
    } else {
      // Extension context - convert legacy data
      const data = await AdminShared.loadStorageData();
      this.cards = [];
      if (data.wikiEntries?.length > 0) {
        this.cards.push(...data.wikiEntries.map(AdminShared.wikiToCard));
      }
      if (data.rules?.length > 0) {
        this.cards.push(...data.rules.map(AdminShared.bannerToCard));
      }
      if (data.battleCards?.length > 0) {
        this.cards.push(...data.battleCards.map(AdminShared.playToCard));
      }
    }

    this.applyFilters();
  }

  bindEvents() {
    // Add card button
    document.getElementById('addCardBtn')?.addEventListener('click', () => this.showAddCardModal());

    // Add card modal
    document.getElementById('closeAddCardModal')?.addEventListener('click', () => this.hideAddCardModal());
    document.querySelectorAll('#addCardModal .card-type-option').forEach(btn => {
      btn.addEventListener('click', () => this.createNewCard(btn.dataset.type));
    });

    // Close modal on backdrop click
    document.getElementById('addCardModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'addCardModal') this.hideAddCardModal();
    });

    // Search and filters
    document.getElementById('cardsSearch')?.addEventListener('input', () => this.applyFilters());
    document.getElementById('cardsSearchClear')?.addEventListener('click', () => this.clearSearch());
    document.getElementById('cardsObjectFilter')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('cardsTypeFilter')?.addEventListener('change', () => this.applyFilters());

    // Refresh
    document.getElementById('refreshCardsBtn')?.addEventListener('click', () => this.refreshData());

    // Expand/collapse all
    document.getElementById('cardsExpandAllBtn')?.addEventListener('click', () => this.expandAll());
    document.getElementById('cardsCollapseAllBtn')?.addEventListener('click', () => this.collapseAll());

    // Tabs
    document.getElementById('cardDetailTabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.wiki-tab');
      if (tab && !tab.disabled) {
        this.switchTab(tab.dataset.tab);
      }
    });

    // Save buttons
    document.getElementById('saveCardBtn')?.addEventListener('click', () => this.saveCard());
    document.getElementById('saveCardBtnTop')?.addEventListener('click', () => this.saveCard());
    document.getElementById('cancelCardBtn')?.addEventListener('click', () => this.cancelEdit());

    // Delete and duplicate
    document.getElementById('deleteCardBtn')?.addEventListener('click', () => this.deleteCurrentCard());
    document.getElementById('duplicateCardBtn')?.addEventListener('click', () => this.duplicateCurrentCard());

    // Status toggle
    document.getElementById('cardStatusToggle')?.addEventListener('click', () => this.toggleCurrentCardStatus());

    // Display on all checkbox
    document.getElementById('cardDisplayOnAll')?.addEventListener('change', (e) => {
      AdminShared.toggleConditionsWrapper('cardConditionsWrapper', e.target.checked);
      this.markAsChanged();
    });

    // Add condition
    document.getElementById('addCardConditionBtn')?.addEventListener('click', () => {
      AdminShared.addCondition('cardConditions', null, this.currentProperties);
      this.markAsChanged();
    });

    // Logic toggle
    AdminShared.initLogicToggle('cardLogicToggle');

    // Banner type change
    document.getElementById('cardBannerType')?.addEventListener('change', (e) => {
      const embedGroup = document.getElementById('cardEmbedUrlGroup');
      if (embedGroup) embedGroup.style.display = e.target.value === 'embed' ? 'block' : 'none';
      this.markAsChanged();
    });

    // Object type change (load property groups)
    document.getElementById('cardObjectType')?.addEventListener('change', (e) => {
      this.loadPropertyGroups(e.target.value);
      this.markAsChanged();
    });

    // Section and asset buttons
    document.getElementById('addSectionBtn')?.addEventListener('click', () => this.addSection());
    document.getElementById('addAssetBtn')?.addEventListener('click', () => this.addAsset());
    document.getElementById('addNextStepBtn')?.addEventListener('click', () => this.addNextStep());

    // Form change tracking
    this.bindFormChangeTracking();

    // Init content editor
    this.initContentEditor();
  }

  bindFormChangeTracking() {
    const form = document.getElementById('cardDetailContent');
    if (!form) return;

    form.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('change', () => this.markAsChanged());
      el.addEventListener('input', () => this.markAsChanged());
    });
  }

  async initContentEditor() {
    // Wait for TipTap if using it, otherwise use simple rich text
    const editorContainer = document.getElementById('cardContentEditor');
    if (!editorContainer) return;

    // Create a contenteditable div as fallback
    editorContainer.innerHTML = `
      <div class="rich-text-editor">
        <div class="rich-text-toolbar" id="cardContentToolbar">
          <button type="button" data-command="bold" title="Bold">
            <span class="icon icon-bold icon--sm"></span>
          </button>
          <button type="button" data-command="italic" title="Italic">
            <span class="icon icon-italic icon--sm"></span>
          </button>
          <button type="button" data-command="underline" title="Underline">
            <span class="icon icon-underline icon--sm"></span>
          </button>
          <span class="toolbar-divider"></span>
          <button type="button" data-command="insertUnorderedList" title="Bullet List">
            <span class="icon icon-list icon--sm"></span>
          </button>
          <button type="button" data-command="insertOrderedList" title="Numbered List">
            <span class="icon icon-list-ordered icon--sm"></span>
          </button>
          <span class="toolbar-divider"></span>
          <button type="button" data-command="createLink" title="Insert Link">
            <span class="icon icon-link icon--sm"></span>
          </button>
        </div>
        <div id="cardContent" class="rich-text-content" contenteditable="true"></div>
      </div>
    `;

    AdminShared.initRichTextEditor('#cardContentToolbar', 'cardContent', () => {
      this.markAsChanged();
    });
  }

  markAsChanged() {
    if (this.selectedCardId || this.isEditing) {
      this.hasUnsavedChanges = true;
      const footer = document.getElementById('cardDetailFooter');
      if (footer) footer.style.display = 'flex';
    }
  }

  // ===================
  // Tree Navigation
  // ===================

  applyFilters() {
    const search = document.getElementById('cardsSearch')?.value.toLowerCase() || '';
    const objectFilter = document.getElementById('cardsObjectFilter')?.value || 'all';
    const typeFilter = document.getElementById('cardsTypeFilter')?.value || 'all';

    this.filteredCards = this.cards.filter(card => {
      // Search filter
      if (search) {
        const searchableText = [
          card.name,
          card.title,
          card.triggerText,
          card.content
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchableText.includes(search)) return false;
      }

      // Object type filter
      if (objectFilter !== 'all') {
        const cardObjects = card.objectTypes || [];
        if (cardObjects.length === 0 && objectFilter !== 'all') return false;
        if (cardObjects.length > 0 && !cardObjects.includes(objectFilter)) return false;
      }

      // Card type filter
      if (typeFilter !== 'all' && card.cardType !== typeFilter) return false;

      return true;
    });

    this.renderTree();
    this.updateStats();
  }

  clearSearch() {
    const searchInput = document.getElementById('cardsSearch');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    this.applyFilters();
  }

  buildTreeData() {
    // Group cards by: objectType > propertyGroup > cards
    const tree = {};

    // Add "All Objects" group for cards without specific object type
    tree['_all'] = {
      label: 'All Objects',
      groups: { '_ungrouped': { label: 'General', cards: [] } }
    };

    // Standard object types
    ['contacts', 'companies', 'deals', 'tickets'].forEach(objType => {
      tree[objType] = {
        label: OBJECT_TYPE_LABELS[objType] || objType,
        groups: {}
      };
    });

    // Sort and group cards
    this.filteredCards.forEach(card => {
      const objectTypes = card.objectTypes || [];

      if (objectTypes.length === 0) {
        // Card applies to all objects
        const group = card.propertyGroup || '_ungrouped';
        if (!tree['_all'].groups[group]) {
          tree['_all'].groups[group] = { label: group === '_ungrouped' ? 'General' : group, cards: [] };
        }
        tree['_all'].groups[group].cards.push(card);
      } else {
        // Card applies to specific object types
        objectTypes.forEach(objType => {
          if (!tree[objType]) {
            tree[objType] = { label: OBJECT_TYPE_LABELS[objType] || objType, groups: {} };
          }
          const group = card.propertyGroup || '_ungrouped';
          if (!tree[objType].groups[group]) {
            tree[objType].groups[group] = { label: group === '_ungrouped' ? 'General' : group, cards: [] };
          }
          tree[objType].groups[group].cards.push(card);
        });
      }
    });

    return tree;
  }

  renderTree() {
    const container = document.getElementById('cardsNavTree');
    const emptyState = document.getElementById('cardsNavEmpty');
    if (!container) return;

    if (this.filteredCards.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const tree = this.buildTreeData();
    let html = '';

    // Render tree using wiki-node structure for proper styling
    Object.entries(tree).forEach(([objType, objData]) => {
      const groups = Object.entries(objData.groups);
      if (groups.length === 0) return;

      // Check if any group has cards
      const totalCards = groups.reduce((sum, [, g]) => sum + g.cards.length, 0);
      if (totalCards === 0) return;

      const objKey = `obj-${objType}`;
      const isObjExpanded = this.expandedGroups.has(objKey);

      html += `
        <li class="wiki-node wiki-node-object ${isObjExpanded ? '' : 'is-collapsed'}" data-object="${objType}">
          <div class="wiki-node-header">
            <button class="wiki-node-toggle" aria-expanded="${isObjExpanded}" data-key="${objKey}">
              <span class="icon icon-chevron-right"></span>
            </button>
            <span class="wiki-node-label">${objData.label}</span>
            <span class="wiki-node-count">${totalCards}</span>
          </div>
          <ul class="wiki-node-children">
      `;

      groups.forEach(([groupKey, groupData]) => {
        if (groupData.cards.length === 0) return;

        const grpKey = `grp-${objType}-${groupKey}`;
        const isGrpExpanded = this.expandedGroups.has(grpKey);

        html += `
          <li class="wiki-node wiki-node-group ${isGrpExpanded ? '' : 'is-collapsed'}" data-group="${groupKey}">
            <div class="wiki-node-header">
              <button class="wiki-node-toggle" aria-expanded="${isGrpExpanded}" data-key="${grpKey}">
                <span class="icon icon-chevron-right"></span>
              </button>
              <span class="wiki-node-label">${AdminShared.escapeHtml(groupData.label)}</span>
              <span class="wiki-node-count">${groupData.cards.length}</span>
            </div>
            <ul class="wiki-node-children">
        `;

        // Sort cards by name
        groupData.cards.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        groupData.cards.forEach(card => {
          const config = CARD_TYPE_CONFIG[card.cardType] || CARD_TYPE_CONFIG.definition;
          const isSelected = this.selectedCardId === card.id;
          const isDisabled = card.enabled === false;
          const statusClass = isDisabled ? 'status-disabled' : 'status-active';

          html += `
            <li class="wiki-node-term ${isSelected ? 'is-selected' : ''}" data-id="${card.id}">
              <span class="card-type-icon card-type-${card.cardType}">
                <span class="icon ${config.icon} icon--sm"></span>
              </span>
              <span class="status-dot ${statusClass}"></span>
              <span class="wiki-term-text">${AdminShared.escapeHtml(card.name || card.triggerText || 'Untitled')}</span>
              ${isDisabled ? '<span class="wiki-term-badge">Disabled</span>' : ''}
            </li>
          `;
        });

        html += '</ul></li>';
      });

      html += '</ul></li>';
    });

    container.innerHTML = html;

    // Bind tree events - toggle expand/collapse
    container.querySelectorAll('.wiki-node-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleTreeNode(btn.dataset.key);
      });
    });

    // Click on node header to expand/collapse (for object and group nodes)
    container.querySelectorAll('.wiki-node-object > .wiki-node-header, .wiki-node-group > .wiki-node-header').forEach(header => {
      header.addEventListener('click', () => {
        const toggle = header.querySelector('.wiki-node-toggle');
        if (toggle) {
          toggle.click();
        }
      });
    });

    // Click on term to select
    container.querySelectorAll('.wiki-node-term').forEach(term => {
      term.addEventListener('click', () => {
        const cardId = term.dataset.id;
        if (cardId) {
          this.selectCard(cardId);
        }
      });
    });
  }

  toggleTreeNode(key) {
    if (this.expandedGroups.has(key)) {
      this.expandedGroups.delete(key);
    } else {
      this.expandedGroups.add(key);
    }
    this.renderTree();
  }

  expandAll() {
    // Add all possible keys to expanded set
    const tree = this.buildTreeData();
    Object.keys(tree).forEach(objType => {
      this.expandedGroups.add(`obj-${objType}`);
      Object.keys(tree[objType].groups).forEach(grpKey => {
        this.expandedGroups.add(`grp-${objType}-${grpKey}`);
      });
    });
    this.renderTree();
  }

  collapseAll() {
    this.expandedGroups.clear();
    this.renderTree();
  }

  updateStats() {
    const total = this.cards.length;
    const enabled = this.cards.filter(c => c.enabled !== false).length;
    const definitions = this.cards.filter(c => c.cardType === 'definition').length;

    const totalEl = document.getElementById('cardsTotalCount');
    const enabledEl = document.getElementById('cardsEnabledCount');
    const defEl = document.getElementById('cardsDefinitionCount');

    if (totalEl) totalEl.textContent = total;
    if (enabledEl) enabledEl.textContent = enabled;
    if (defEl) defEl.textContent = definitions;
  }

  // ===================
  // Card Selection & Detail
  // ===================

  async selectCard(cardId) {
    // Check for unsaved changes
    if (this.hasUnsavedChanges) {
      const result = await AdminShared.showConfirmDialog({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        primaryLabel: 'Save',
        secondaryLabel: 'Discard',
        showCancel: true
      });

      if (result === 'primary') {
        await this.saveCard();
      } else if (result === 'cancel') {
        return;
      }
    }

    this.selectedCardId = cardId;
    this.hasUnsavedChanges = false;
    this.isEditing = true;

    const card = this.cards.find(c => c.id === cardId);
    if (!card) {
      this.showEmptyState();
      return;
    }

    // Expand tree to show selected card
    this.expandToCard(card);

    // Show detail pane
    this.showCardDetail(card);
    this.renderTree();
  }

  expandToCard(card) {
    const objectTypes = card.objectTypes || [];
    const group = card.propertyGroup || '_ungrouped';

    if (objectTypes.length === 0) {
      this.expandedGroups.add('obj-_all');
      this.expandedGroups.add(`grp-_all-${group}`);
    } else {
      objectTypes.forEach(objType => {
        this.expandedGroups.add(`obj-${objType}`);
        this.expandedGroups.add(`grp-${objType}-${group}`);
      });
    }
  }

  showEmptyState() {
    document.getElementById('cardDetailEmpty').style.display = 'flex';
    document.getElementById('cardDetailContent').style.display = 'none';
    document.getElementById('cardDetailActions').style.display = 'none';
    document.getElementById('cardStatusToggle').style.display = 'none';
    document.getElementById('cardDetailFooter').style.display = 'none';
    document.getElementById('cardRulesEmpty').style.display = 'flex';
    document.getElementById('cardRulesContent').style.display = 'none';
    document.getElementById('cardAssetsEmpty').style.display = 'flex';
    document.getElementById('cardAssetsContent').style.display = 'none';
    document.getElementById('cardUsageEmpty').style.display = 'flex';
    document.getElementById('cardUsageContent').style.display = 'none';

    document.getElementById('cardDetailTitle').textContent = 'Select a Card';
    document.getElementById('cardDetailMeta').innerHTML = '';
  }

  showCardDetail(card) {
    const config = CARD_TYPE_CONFIG[card.cardType] || CARD_TYPE_CONFIG.definition;

    // Update header
    document.getElementById('cardDetailTitle').textContent = card.name || 'Untitled';
    document.getElementById('cardDetailMeta').innerHTML = `
      <span class="wiki-card-type card-type-${card.cardType}">${config.label}</span>
      ${card.category ? `<span class="wiki-card-category">${card.category}</span>` : ''}
    `;

    // Show actions and status toggle
    if (!this.isViewOnly) {
      document.getElementById('cardDetailActions').style.display = 'flex';
      const statusToggle = document.getElementById('cardStatusToggle');
      statusToggle.style.display = 'flex';
      statusToggle.classList.toggle('active', card.enabled !== false);
      statusToggle.querySelector('.status-toggle-label').textContent = card.enabled !== false ? 'Enabled' : 'Disabled';
    }

    // Show content area
    document.getElementById('cardDetailEmpty').style.display = 'none';
    document.getElementById('cardDetailContent').style.display = 'block';

    // Update type indicator
    const typeIndicator = document.getElementById('cardTypeIndicator');
    if (typeIndicator) {
      typeIndicator.innerHTML = `
        <span class="type-icon card-type-${card.cardType}"><span class="icon ${config.icon}"></span></span>
        <span class="type-name">${config.label}</span>
      `;
    }

    // Populate form
    this.populateForm(card);

    // Show rules content
    document.getElementById('cardRulesEmpty').style.display = 'none';
    document.getElementById('cardRulesContent').style.display = 'block';

    // Show assets content
    document.getElementById('cardAssetsEmpty').style.display = 'none';
    document.getElementById('cardAssetsContent').style.display = 'block';

    // Show usage content
    document.getElementById('cardUsageEmpty').style.display = 'none';
    document.getElementById('cardUsageContent').style.display = 'block';

    // Update usage tab
    document.getElementById('cardCreatedAt').textContent = card.createdAt ? new Date(card.createdAt).toLocaleDateString() : '-';
    document.getElementById('cardUpdatedAt').textContent = card.updatedAt ? new Date(card.updatedAt).toLocaleDateString() : '-';

    // Hide footer initially (shown when changes made)
    document.getElementById('cardDetailFooter').style.display = 'none';

    // Switch to content tab
    this.switchTab('content');
  }

  populateForm(card) {
    const config = CARD_TYPE_CONFIG[card.cardType] || CARD_TYPE_CONFIG.definition;

    // Common fields
    document.getElementById('cardName').value = card.name || '';
    document.getElementById('cardContent').innerHTML = card.content || '';
    document.getElementById('cardContentLabel').textContent = config.contentLabel;

    // Show/hide type-specific fields
    document.getElementById('definitionFields').style.display = card.cardType === 'definition' ? 'block' : 'none';
    document.getElementById('alertFields').style.display = card.cardType === 'alert' ? 'block' : 'none';
    document.getElementById('battlecardFields').style.display = card.cardType === 'battlecard' ? 'block' : 'none';
    document.getElementById('assetFields').style.display = card.cardType === 'asset' ? 'block' : 'none';
    document.getElementById('cardSectionsGroup').style.display = card.cardType === 'battlecard' ? 'block' : 'none';
    document.getElementById('cardLinkGroup').style.display = card.cardType === 'definition' ? 'block' : 'none';
    document.getElementById('definitionRulesSection').style.display = card.cardType === 'definition' ? 'block' : 'none';

    // Type-specific fields
    if (card.cardType === 'definition') {
      document.getElementById('cardTriggerText').value = card.triggerText || '';
      document.getElementById('cardCategory').value = card.category || 'general';
      document.getElementById('cardAliases').value = (card.aliases || []).join(', ');
      document.getElementById('cardMatchType').value = card.matchType || 'exact';
      document.getElementById('cardFrequency').value = card.frequency || 'first';
      document.getElementById('cardIncludeAliases').checked = card.includeAliases !== false;
      document.getElementById('cardPriority').value = card.priority ?? 50;
      document.getElementById('cardDefinitionLink').value = card.link || '';
    } else if (card.cardType === 'alert') {
      document.getElementById('cardTitle').value = card.title || '';
      document.getElementById('cardBannerType').value = card.bannerType || 'info';
      document.getElementById('cardEmbedUrl').value = card.embedUrl || card.originalUrl || '';
      document.getElementById('cardEmbedUrlGroup').style.display = card.bannerType === 'embed' ? 'block' : 'none';
    } else if (card.cardType === 'battlecard') {
      document.getElementById('cardSubtitle').value = card.subtitle || '';
      document.getElementById('cardBattlecardType').value = card.battlecardType || 'tip';
      document.getElementById('cardLink').value = card.link || '';
      this.sections = card.sections ? [...card.sections] : [];
      this.renderSections();
    } else if (card.cardType === 'asset') {
      document.getElementById('cardAssetUrl').value = card.link || '';
    }

    // Rules tab
    document.getElementById('cardObjectType').value = (card.objectTypes || [])[0] || '';
    this.loadPropertyGroups((card.objectTypes || [])[0] || '');
    document.getElementById('cardPropertyGroup').value = card.propertyGroup || '';

    // Display modes
    document.getElementById('displayModeTooltip').checked = (card.displayModes || []).includes('tooltip');
    document.getElementById('displayModeBanner').checked = (card.displayModes || []).includes('banner');
    document.getElementById('displayModeSidepanel').checked = (card.displayModes || []).includes('sidepanel');

    // Conditions
    document.getElementById('cardDisplayOnAll').checked = card.displayOnAll || false;
    AdminShared.toggleConditionsWrapper('cardConditionsWrapper', card.displayOnAll || false);
    AdminShared.setLogic('cardLogicToggle', card.logic || 'AND');

    const conditionsEl = document.getElementById('cardConditions');
    if (conditionsEl) {
      conditionsEl.innerHTML = '';
      if (card.conditions?.length > 0) {
        card.conditions.forEach(condition => {
          AdminShared.addCondition('cardConditions', condition, this.currentProperties);
        });
      }
    }

    // Assets
    this.assets = card.assets ? [...card.assets] : [];
    this.nextSteps = card.nextSteps ? [...card.nextSteps] : [];
    this.renderAssets();
    this.renderNextSteps();
  }

  async loadPropertyGroups(objectType) {
    const select = document.getElementById('cardPropertyGroup');
    if (!select) return;

    select.innerHTML = '<option value="">Select a property group...</option>';

    if (!objectType) return;

    try {
      const properties = await this.fetchPropertiesForObject(objectType);
      const groups = [...new Set(properties.map(p => p.groupName).filter(Boolean))];

      groups.sort().forEach(group => {
        const option = document.createElement('option');
        option.value = group;
        option.textContent = group;
        select.appendChild(option);
      });
    } catch (e) {
      console.error('Failed to load property groups:', e);
    }
  }

  async fetchPropertiesForObject(objectType) {
    if (this.propertiesCache[objectType]) {
      return this.propertiesCache[objectType];
    }

    try {
      // Try to get from HubSpot API
      if (typeof RevGuideHubSpot !== 'undefined') {
        const properties = await RevGuideHubSpot.getPropertiesForObject(objectType);
        this.propertiesCache[objectType] = properties;
        return properties;
      }
    } catch (e) {
      console.error('Failed to fetch properties:', e);
    }

    return [];
  }

  switchTab(tabName) {
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

  // ===================
  // Add/Create Card
  // ===================

  showAddCardModal() {
    document.getElementById('addCardModal').style.display = 'flex';
  }

  hideAddCardModal() {
    document.getElementById('addCardModal').style.display = 'none';
  }

  async createNewCard(cardType) {
    this.hideAddCardModal();

    // Check for unsaved changes
    if (this.hasUnsavedChanges) {
      const result = await AdminShared.showConfirmDialog({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        primaryLabel: 'Save',
        secondaryLabel: 'Discard',
        showCancel: true
      });

      if (result === 'primary') {
        await this.saveCard();
      } else if (result === 'cancel') {
        return;
      }
    }

    const config = CARD_TYPE_CONFIG[cardType];

    // Create new card with defaults
    const newCard = {
      id: null, // Will be assigned on save
      cardType: cardType,
      name: '',
      content: '',
      enabled: true,
      displayModes: config.defaultDisplayModes,
      objectTypes: [],
      conditions: [],
      logic: 'AND',
      displayOnAll: false
    };

    // Add type-specific defaults
    if (cardType === 'definition') {
      newCard.triggerText = '';
      newCard.category = 'general';
      newCard.aliases = [];
      newCard.matchType = 'exact';
      newCard.frequency = 'first';
      newCard.priority = 50;
    } else if (cardType === 'battlecard') {
      newCard.sections = [];
      newCard.battlecardType = 'tip';
    }

    this.selectedCardId = null;
    this.isEditing = true;
    this.hasUnsavedChanges = true;

    // Show in detail pane
    this.showCardDetail(newCard);

    // Store the card type for save
    this._newCardType = cardType;

    // Show footer
    document.getElementById('cardDetailFooter').style.display = 'flex';

    // Update header
    document.getElementById('cardDetailTitle').textContent = `New ${config.label}`;

    // Hide actions (can't delete unsaved card)
    document.getElementById('cardDetailActions').style.display = 'none';
    document.getElementById('cardStatusToggle').style.display = 'none';
  }

  // ===================
  // Save/Delete/Toggle
  // ===================

  async saveCard() {
    const name = document.getElementById('cardName').value.trim();
    if (!name) {
      AdminShared.showToast('Name is required', 'error');
      return;
    }

    const cardType = this.selectedCardId
      ? this.cards.find(c => c.id === this.selectedCardId)?.cardType
      : this._newCardType;

    if (!cardType) {
      AdminShared.showToast('Card type is required', 'error');
      return;
    }

    // Build card data
    const cardData = {
      cardType: cardType,
      name: name,
      content: document.getElementById('cardContent')?.innerHTML || '',
      enabled: this.selectedCardId
        ? this.cards.find(c => c.id === this.selectedCardId)?.enabled !== false
        : true,
      displayModes: this.getSelectedDisplayModes(),
      objectTypes: this.getSelectedObjectTypes(),
      propertyGroup: document.getElementById('cardPropertyGroup')?.value || null,
      displayOnAll: document.getElementById('cardDisplayOnAll')?.checked || false,
      conditions: AdminShared.getConditions('cardConditions'),
      logic: AdminShared.getLogic('cardLogicToggle')
    };

    // Type-specific fields
    if (cardType === 'definition') {
      const triggerText = document.getElementById('cardTriggerText')?.value.trim();
      if (!triggerText) {
        AdminShared.showToast('Trigger text is required for definitions', 'error');
        return;
      }
      cardData.triggerText = triggerText;
      cardData.category = document.getElementById('cardCategory')?.value || 'general';
      cardData.aliases = (document.getElementById('cardAliases')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
      cardData.matchType = document.getElementById('cardMatchType')?.value || 'exact';
      cardData.frequency = document.getElementById('cardFrequency')?.value || 'first';
      cardData.includeAliases = document.getElementById('cardIncludeAliases')?.checked !== false;
      cardData.priority = parseInt(document.getElementById('cardPriority')?.value) || 50;
      cardData.link = document.getElementById('cardDefinitionLink')?.value || null;
    } else if (cardType === 'alert') {
      cardData.title = document.getElementById('cardTitle')?.value.trim() || null;
      cardData.bannerType = document.getElementById('cardBannerType')?.value || 'info';
      if (cardData.bannerType === 'embed') {
        const embedUrl = document.getElementById('cardEmbedUrl')?.value.trim();
        if (!embedUrl) {
          AdminShared.showToast('Embed URL is required', 'error');
          return;
        }
        cardData.embedUrl = AdminShared.convertToEmbedUrl(embedUrl);
        cardData.originalUrl = embedUrl;
      }
    } else if (cardType === 'battlecard') {
      cardData.subtitle = document.getElementById('cardSubtitle')?.value.trim() || null;
      cardData.battlecardType = document.getElementById('cardBattlecardType')?.value || 'tip';
      cardData.link = document.getElementById('cardLink')?.value.trim() || null;
      cardData.sections = this.sections;
    } else if (cardType === 'asset') {
      const assetUrl = document.getElementById('cardAssetUrl')?.value.trim();
      if (!assetUrl) {
        AdminShared.showToast('Asset URL is required', 'error');
        return;
      }
      cardData.link = assetUrl;
    }

    // Add assets and next steps
    cardData.assets = this.assets;
    cardData.nextSteps = this.nextSteps;

    try {
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        const supabaseData = AdminShared.mapCardToSupabase(cardData);

        if (this.selectedCardId) {
          const { data, error } = await RevGuideDB.updateCard(this.selectedCardId, supabaseData);
          if (error) throw error;

          const index = this.cards.findIndex(c => c.id === this.selectedCardId);
          if (index !== -1) {
            this.cards[index] = AdminShared.mapCardFromSupabase(data);
          }
        } else {
          const { data, error } = await RevGuideDB.createCard(supabaseData);
          if (error) throw error;

          const newCard = AdminShared.mapCardFromSupabase(data);
          this.cards.push(newCard);
          this.selectedCardId = newCard.id;
        }
      } else {
        // Extension context
        if (this.selectedCardId) {
          const index = this.cards.findIndex(c => c.id === this.selectedCardId);
          if (index !== -1) {
            this.cards[index] = { ...cardData, id: this.selectedCardId };
          }
        } else {
          cardData.id = AdminShared.generateId('card');
          this.cards.push(cardData);
          this.selectedCardId = cardData.id;
        }
      }

      AdminShared.clearStorageCache();
      this.hasUnsavedChanges = false;
      this._newCardType = null;

      this.applyFilters();

      // Re-select the saved card
      if (this.selectedCardId) {
        const card = this.cards.find(c => c.id === this.selectedCardId);
        if (card) {
          this.expandToCard(card);
          this.showCardDetail(card);
        }
      }

      AdminShared.showToast('Card saved', 'success');
      AdminShared.notifyContentScript();
    } catch (e) {
      console.error('Failed to save card:', e);
      AdminShared.showToast('Failed to save card: ' + e.message, 'error');
    }
  }

  getSelectedDisplayModes() {
    const modes = [];
    if (document.getElementById('displayModeTooltip')?.checked) modes.push('tooltip');
    if (document.getElementById('displayModeBanner')?.checked) modes.push('banner');
    if (document.getElementById('displayModeSidepanel')?.checked) modes.push('sidepanel');
    return modes;
  }

  getSelectedObjectTypes() {
    const objectType = document.getElementById('cardObjectType')?.value;
    return objectType ? [objectType] : [];
  }

  async deleteCurrentCard() {
    if (!this.selectedCardId) return;

    const card = this.cards.find(c => c.id === this.selectedCardId);
    if (!card) return;

    const result = await AdminShared.showConfirmDialog({
      title: 'Delete Card',
      message: `Are you sure you want to delete "${card.name}"? This action cannot be undone.`,
      primaryLabel: 'Delete',
      primaryClass: 'danger',
      showCancel: true
    });

    if (result !== 'primary') return;

    try {
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        const { error } = await RevGuideDB.deleteCard(this.selectedCardId);
        if (error) throw error;
      }

      this.cards = this.cards.filter(c => c.id !== this.selectedCardId);
      this.selectedCardId = null;
      this.hasUnsavedChanges = false;

      this.applyFilters();
      this.showEmptyState();

      AdminShared.showToast('Card deleted', 'success');
      AdminShared.notifyContentScript();
    } catch (e) {
      console.error('Failed to delete card:', e);
      AdminShared.showToast('Failed to delete card', 'error');
    }
  }

  async duplicateCurrentCard() {
    if (!this.selectedCardId) return;

    const card = this.cards.find(c => c.id === this.selectedCardId);
    if (!card) return;

    // Create a copy
    const copy = { ...card };
    delete copy.id;
    copy.name = `${card.name} (Copy)`;
    if (copy.triggerText) {
      copy.triggerText = `${copy.triggerText}_copy`;
    }

    try {
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        const supabaseData = AdminShared.mapCardToSupabase(copy);
        const { data, error } = await RevGuideDB.createCard(supabaseData);
        if (error) throw error;

        const newCard = AdminShared.mapCardFromSupabase(data);
        this.cards.push(newCard);
        this.selectedCardId = newCard.id;
      } else {
        copy.id = AdminShared.generateId('card');
        this.cards.push(copy);
        this.selectedCardId = copy.id;
      }

      this.applyFilters();
      this.selectCard(this.selectedCardId);

      AdminShared.showToast('Card duplicated', 'success');
    } catch (e) {
      console.error('Failed to duplicate card:', e);
      AdminShared.showToast('Failed to duplicate card', 'error');
    }
  }

  async toggleCurrentCardStatus() {
    if (!this.selectedCardId) return;

    const card = this.cards.find(c => c.id === this.selectedCardId);
    if (!card) return;

    const newEnabled = card.enabled === false;

    try {
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        const { error } = await RevGuideDB.updateCard(this.selectedCardId, { enabled: newEnabled });
        if (error) throw error;
      }

      card.enabled = newEnabled;

      // Update status toggle UI
      const statusToggle = document.getElementById('cardStatusToggle');
      statusToggle.classList.toggle('active', newEnabled);
      statusToggle.querySelector('.status-toggle-label').textContent = newEnabled ? 'Enabled' : 'Disabled';

      this.renderTree();
      this.updateStats();

      AdminShared.showToast(`Card ${newEnabled ? 'enabled' : 'disabled'}`, 'success');
      AdminShared.notifyContentScript();
    } catch (e) {
      console.error('Failed to toggle card status:', e);
      AdminShared.showToast('Failed to update card', 'error');
    }
  }

  cancelEdit() {
    if (this.hasUnsavedChanges) {
      AdminShared.showConfirmDialog({
        title: 'Discard Changes?',
        message: 'You have unsaved changes that will be lost.',
        primaryLabel: 'Discard',
        primaryClass: 'danger',
        showCancel: true
      }).then(result => {
        if (result === 'primary') {
          this.hasUnsavedChanges = false;
          if (this.selectedCardId) {
            const card = this.cards.find(c => c.id === this.selectedCardId);
            if (card) {
              this.showCardDetail(card);
            }
          } else {
            this.showEmptyState();
          }
        }
      });
    } else {
      if (this.selectedCardId) {
        const card = this.cards.find(c => c.id === this.selectedCardId);
        if (card) {
          this.showCardDetail(card);
        }
      } else {
        this.showEmptyState();
      }
    }
  }

  async refreshData() {
    const btn = document.getElementById('refreshCardsBtn');
    const icon = btn?.querySelector('.icon');

    if (icon) icon.classList.add('spinning');
    if (btn) btn.disabled = true;

    try {
      AdminShared.clearStorageCache();
      await this.loadCards();
      this.renderTree();
      this.updateStats();

      if (this.selectedCardId) {
        const card = this.cards.find(c => c.id === this.selectedCardId);
        if (card) {
          this.showCardDetail(card);
        } else {
          this.showEmptyState();
        }
      }

      AdminShared.showToast('Cards refreshed', 'success');
    } catch (e) {
      console.error('Failed to refresh:', e);
      AdminShared.showToast('Failed to refresh', 'error');
    } finally {
      if (icon) icon.classList.remove('spinning');
      if (btn) btn.disabled = false;
    }
  }

  // ===================
  // Sections (battlecards)
  // ===================

  addSection() {
    this.sections.push({ type: 'text', title: '', content: '' });
    this.renderSections();
    this.markAsChanged();
  }

  renderSections() {
    const container = document.getElementById('cardSections');
    if (!container) return;

    container.innerHTML = this.sections.map((section, index) => `
      <div class="section-row" data-index="${index}">
        <div class="section-header-row">
          <select class="section-type-select" data-index="${index}">
            <option value="text" ${section.type === 'text' ? 'selected' : ''}>Text</option>
            <option value="media" ${section.type === 'media' ? 'selected' : ''}>Media</option>
          </select>
          <input type="text" class="section-title-input" placeholder="Section title" value="${AdminShared.escapeHtml(section.title || '')}" data-index="${index}">
          <button type="button" class="remove-section-btn btn btn-icon btn-sm" data-index="${index}" title="Remove section">
            <span class="icon icon-x icon--sm"></span>
          </button>
        </div>
        <div class="section-body">
          ${section.type === 'text' ? `
            <textarea class="section-content-input" placeholder="Section content" data-index="${index}">${AdminShared.escapeHtml(section.content || '')}</textarea>
          ` : `
            <input type="url" class="section-media-input" placeholder="Media URL" value="${AdminShared.escapeHtml(section.mediaUrl || '')}" data-index="${index}">
          `}
        </div>
      </div>
    `).join('');

    // Bind events
    container.querySelectorAll('.section-type-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.sections[index].type = e.target.value;
        this.renderSections();
        this.markAsChanged();
      });
    });

    container.querySelectorAll('.section-title-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.sections[index].title = e.target.value;
        this.markAsChanged();
      });
    });

    container.querySelectorAll('.section-content-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.sections[index].content = e.target.value;
        this.markAsChanged();
      });
    });

    container.querySelectorAll('.section-media-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.sections[index].mediaUrl = e.target.value;
        this.markAsChanged();
      });
    });

    container.querySelectorAll('.remove-section-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.closest('.remove-section-btn').dataset.index);
        this.sections.splice(index, 1);
        this.renderSections();
        this.markAsChanged();
      });
    });
  }

  // ===================
  // Assets
  // ===================

  addAsset() {
    this.assets.push({ url: '', title: '', type: 'link' });
    this.renderAssets();
    this.markAsChanged();
  }

  renderAssets() {
    const container = document.getElementById('cardAssetsList');
    if (!container) return;

    container.innerHTML = this.assets.map((asset, index) => `
      <div class="asset-row" data-index="${index}">
        <input type="text" class="asset-title-input" placeholder="Title" value="${AdminShared.escapeHtml(asset.title || '')}" data-index="${index}">
        <input type="url" class="asset-url-input" placeholder="URL" value="${AdminShared.escapeHtml(asset.url || '')}" data-index="${index}">
        <select class="asset-type-select" data-index="${index}">
          <option value="link" ${asset.type === 'link' ? 'selected' : ''}>Link</option>
          <option value="document" ${asset.type === 'document' ? 'selected' : ''}>Doc</option>
          <option value="video" ${asset.type === 'video' ? 'selected' : ''}>Video</option>
        </select>
        <button type="button" class="remove-asset-btn btn btn-icon btn-sm" data-index="${index}">
          <span class="icon icon-x icon--sm"></span>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.asset-title-input').forEach(input => {
      input.addEventListener('input', (e) => {
        this.assets[parseInt(e.target.dataset.index)].title = e.target.value;
        this.markAsChanged();
      });
    });

    container.querySelectorAll('.asset-url-input').forEach(input => {
      input.addEventListener('input', (e) => {
        this.assets[parseInt(e.target.dataset.index)].url = e.target.value;
        this.markAsChanged();
      });
    });

    container.querySelectorAll('.asset-type-select').forEach(select => {
      select.addEventListener('change', (e) => {
        this.assets[parseInt(e.target.dataset.index)].type = e.target.value;
        this.markAsChanged();
      });
    });

    container.querySelectorAll('.remove-asset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.assets.splice(parseInt(e.target.closest('.remove-asset-btn').dataset.index), 1);
        this.renderAssets();
        this.markAsChanged();
      });
    });
  }

  // ===================
  // Next Steps
  // ===================

  addNextStep() {
    this.nextSteps.push({ text: '', link: '' });
    this.renderNextSteps();
    this.markAsChanged();
  }

  renderNextSteps() {
    const container = document.getElementById('cardNextStepsList');
    if (!container) return;

    container.innerHTML = this.nextSteps.map((step, index) => `
      <div class="next-step-row" data-index="${index}">
        <input type="text" class="next-step-text-input" placeholder="Step description" value="${AdminShared.escapeHtml(step.text || '')}" data-index="${index}">
        <input type="url" class="next-step-link-input" placeholder="Link (optional)" value="${AdminShared.escapeHtml(step.link || '')}" data-index="${index}">
        <button type="button" class="remove-next-step-btn btn btn-icon btn-sm" data-index="${index}">
          <span class="icon icon-x icon--sm"></span>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.next-step-text-input').forEach(input => {
      input.addEventListener('input', (e) => {
        this.nextSteps[parseInt(e.target.dataset.index)].text = e.target.value;
        this.markAsChanged();
      });
    });

    container.querySelectorAll('.next-step-link-input').forEach(input => {
      input.addEventListener('input', (e) => {
        this.nextSteps[parseInt(e.target.dataset.index)].link = e.target.value;
        this.markAsChanged();
      });
    });

    container.querySelectorAll('.remove-next-step-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.nextSteps.splice(parseInt(e.target.closest('.remove-next-step-btn').dataset.index), 1);
        this.renderNextSteps();
        this.markAsChanged();
      });
    });
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  new CardsPage();
});
