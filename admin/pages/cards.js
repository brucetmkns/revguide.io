/**
 * RevGuide - Cards Page
 * Unified content management for definitions, alerts, battlecards, and assets
 */

// Card type configuration
const CARD_TYPE_CONFIG = {
  definition: {
    label: 'Definition',
    icon: 'icon-book',
    contentLabel: 'Definition',
    defaultDisplayModes: ['tooltip'],
    color: '#7c3aed' // Purple
  },
  alert: {
    label: 'Alert',
    icon: 'icon-clipboard-list',
    contentLabel: 'Message',
    defaultDisplayModes: ['banner'],
    color: '#0ea5e9' // Blue
  },
  battlecard: {
    label: 'Battlecard',
    icon: 'icon-layers',
    contentLabel: 'Overview',
    defaultDisplayModes: ['sidepanel'],
    color: '#f59e0b' // Amber
  },
  asset: {
    label: 'Asset',
    icon: 'icon-link',
    contentLabel: 'Description',
    defaultDisplayModes: ['sidepanel'],
    color: '#10b981' // Green
  }
};

const BANNER_TYPE_CONFIG = {
  info: { label: 'Info', color: '#00a4bd' },
  success: { label: 'Success', color: '#00bda5' },
  warning: { label: 'Warning', color: '#f5c26b' },
  error: { label: 'Error', color: '#f2545b' },
  embed: { label: 'Embed', color: '#6366f1' }
};

const BATTLECARD_TYPE_CONFIG = {
  competitor: { label: 'Competitor', icon: 'icon-users' },
  objection: { label: 'Objection Handler', icon: 'icon-message-square' },
  tip: { label: 'Tip', icon: 'icon-lightbulb' },
  process: { label: 'Process Guide', icon: 'icon-list' }
};

class CardsPage {
  constructor() {
    this.cards = [];
    this.propertiesCache = {};
    this.currentProperties = [];
    this.editingCardId = null;
    this.editingCardType = null;
    this.originalData = null;
    this.activeTab = 'content';
    this.isViewOnly = false;
    this.contentEditor = null;
    this.sections = [];
    this.assets = [];
    this.nextSteps = [];
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

    // Check migration status and load data
    await this.checkMigrationAndLoadData();

    // Handle URL params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add' && !this.isViewOnly) {
      this.openCardEditor();
    } else if (urlParams.get('edit') && !this.isViewOnly) {
      const cardId = urlParams.get('edit');
      const card = this.cards.find(c => c.id === cardId);
      if (card) {
        this.openCardEditor(card);
      } else {
        AdminShared.showToast('Card not found', 'error');
        this.renderCards();
      }
    } else {
      this.renderCards();
    }

    if (!this.isViewOnly) {
      this.bindEvents();
    }
  }

  async checkMigrationAndLoadData() {
    // Migration disabled - start fresh with unified cards
    // Legacy data remains in wiki_entries, banners, plays tables but won't be auto-migrated

    // Load cards data
    await this.loadCards();
  }

  async loadCards() {
    if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
      // Load from Supabase
      const { data, error } = await RevGuideDB.getCards();
      if (error) {
        console.error('Failed to load cards:', error);
        AdminShared.showToast('Failed to load cards', 'error');
        this.cards = [];
      } else {
        this.cards = (data || []).map(AdminShared.mapCardFromSupabase);
      }
    } else {
      // Load from storage (extension context) - convert legacy data
      const data = await AdminShared.loadStorageData();
      this.cards = [];

      // Convert legacy wiki entries
      if (data.wikiEntries?.length > 0) {
        this.cards.push(...data.wikiEntries.map(AdminShared.wikiToCard));
      }
      // Convert legacy banners
      if (data.rules?.length > 0) {
        this.cards.push(...data.rules.map(AdminShared.bannerToCard));
      }
      // Convert legacy plays
      if (data.battleCards?.length > 0) {
        this.cards.push(...data.battleCards.map(AdminShared.playToCard));
      }
    }

    this.updateStats();
  }

  showMigrationBanner(status) {
    const banner = document.getElementById('migrationBanner');
    if (banner) {
      banner.style.display = 'block';
      document.getElementById('runMigrationBtn').addEventListener('click', () => this.runMigration());
      document.getElementById('dismissMigrationBtn').addEventListener('click', () => {
        banner.style.display = 'none';
      });
    }
  }

  async runMigration() {
    const btn = document.getElementById('runMigrationBtn');
    btn.disabled = true;
    btn.textContent = 'Migrating...';

    try {
      const { data, error } = await RevGuideDB.migrateToCards();
      if (error) throw error;

      AdminShared.showToast(`Migrated ${data.total} items to cards`, 'success');
      document.getElementById('migrationBanner').style.display = 'none';

      // Reload cards
      await this.loadCards();
      this.renderCards();
    } catch (e) {
      console.error('Migration failed:', e);
      AdminShared.showToast('Migration failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Migrate Now';
    }
  }

  setupViewOnlyMode() {
    const addCardBtn = document.getElementById('addCardBtn');
    const createCardEmptyBtn = document.getElementById('createCardEmptyBtn');
    if (addCardBtn) addCardBtn.style.display = 'none';
    if (createCardEmptyBtn) createCardEmptyBtn.style.display = 'none';

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
    // Add card buttons
    document.getElementById('addCardBtn').addEventListener('click', () => this.openCardEditor());
    document.getElementById('createCardEmptyBtn').addEventListener('click', () => this.openCardEditor());

    // Search and filters
    document.getElementById('cardsSearch').addEventListener('input', () => this.renderCards());
    document.getElementById('cardsSearchClear').addEventListener('click', () => this.clearSearch());
    document.getElementById('cardsTypeFilter').addEventListener('change', () => this.updateFilterState());
    document.getElementById('cardsDisplayFilter').addEventListener('change', () => this.updateFilterState());
    document.getElementById('cardsObjectFilter').addEventListener('change', () => this.updateFilterState());
    document.getElementById('cardsFiltersClear').addEventListener('click', () => this.clearAllFilters());

    // Refresh
    document.getElementById('refreshCardsBtn').addEventListener('click', () => this.refreshData());

    // Editor navigation
    document.getElementById('backToCards').addEventListener('click', (e) => {
      e.preventDefault();
      this.handleBackNavigation();
    });
    document.getElementById('cancelCardBtn').addEventListener('click', () => this.handleBackNavigation());
    document.getElementById('saveCardBtn').addEventListener('click', () => this.saveCard());

    // Card type selector
    document.querySelectorAll('.card-type-option').forEach(btn => {
      btn.addEventListener('click', () => this.selectCardType(btn.dataset.type));
    });

    // Tab clicks
    document.getElementById('cardCardTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.card-tab');
      if (tab && !tab.disabled) {
        this.switchTab(tab.dataset.tab);
      }
    });

    // Display on all checkbox
    document.getElementById('cardDisplayOnAll').addEventListener('change', (e) => {
      AdminShared.toggleConditionsWrapper('cardConditionsWrapper', e.target.checked);
    });

    // Add condition
    document.getElementById('addCardConditionBtn').addEventListener('click', () => {
      AdminShared.addCondition('cardConditions', null, this.currentProperties);
    });

    // Logic toggle
    AdminShared.initLogicToggle('cardLogicToggle');

    // Banner type change (show/hide embed URL)
    document.getElementById('cardBannerType').addEventListener('change', (e) => {
      const embedGroup = document.getElementById('cardEmbedUrlGroup');
      embedGroup.style.display = e.target.value === 'embed' ? 'block' : 'none';
    });

    // Section and asset buttons
    document.getElementById('addSectionBtn')?.addEventListener('click', () => this.addSection());
    document.getElementById('addAssetBtn')?.addEventListener('click', () => this.addAsset());
    document.getElementById('addNextStepBtn')?.addEventListener('click', () => this.addNextStep());

    // Initialize content editor
    this.initContentEditor();
  }

  async initContentEditor() {
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

    // Use simple rich text toolbar instead of Tiptap for now
    AdminShared.initRichTextEditor('#cardContentToolbar', 'cardContent', () => {
      // Content changed callback
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    document.querySelectorAll('.card-tab').forEach(tab => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });

    document.querySelectorAll('.card-tab-panel').forEach(panel => {
      panel.hidden = panel.id !== `card-tab-${tabName}`;
    });
  }

  selectCardType(type) {
    this.editingCardType = type;

    // Update type selector UI
    document.querySelectorAll('.card-type-option').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === type);
    });

    // Show/hide type-specific fields
    const config = CARD_TYPE_CONFIG[type];
    document.getElementById('definitionFields').style.display = type === 'definition' ? 'block' : 'none';
    document.getElementById('alertFields').style.display = type === 'alert' ? 'block' : 'none';
    document.getElementById('battlecardFields').style.display = type === 'battlecard' ? 'block' : 'none';
    document.getElementById('assetFields').style.display = type === 'asset' ? 'block' : 'none';
    document.getElementById('cardSectionsGroup').style.display = type === 'battlecard' ? 'block' : 'none';

    // Show/hide type-specific rules
    document.getElementById('definitionRulesSection').style.display = type === 'definition' ? 'block' : 'none';
    document.getElementById('alertRulesSection').style.display = type === 'alert' ? 'block' : 'none';

    // Update content label
    document.getElementById('cardContentLabel').textContent = config.contentLabel;

    // Set default display modes
    document.getElementById('displayModeTooltip').checked = config.defaultDisplayModes.includes('tooltip');
    document.getElementById('displayModeBanner').checked = config.defaultDisplayModes.includes('banner');
    document.getElementById('displayModeSidepanel').checked = config.defaultDisplayModes.includes('sidepanel');
  }

  clearSearch() {
    const searchInput = document.getElementById('cardsSearch');
    searchInput.value = '';
    searchInput.focus();
    this.renderCards();
  }

  clearAllFilters() {
    document.getElementById('cardsTypeFilter').value = 'all';
    document.getElementById('cardsDisplayFilter').value = 'all';
    document.getElementById('cardsObjectFilter').value = 'all';
    this.updateFilterState();
  }

  updateFilterState() {
    const typeFilter = document.getElementById('cardsTypeFilter');
    const displayFilter = document.getElementById('cardsDisplayFilter');
    const objectFilter = document.getElementById('cardsObjectFilter');
    const clearBtn = document.getElementById('cardsFiltersClear');

    const hasActiveFilter = typeFilter.value !== 'all' || displayFilter.value !== 'all' || objectFilter.value !== 'all';
    clearBtn.classList.toggle('visible', hasActiveFilter);

    this.renderCards();
  }

  updateStats() {
    const total = this.cards.length;
    const enabled = this.cards.filter(c => c.enabled !== false).length;
    const definitions = this.cards.filter(c => c.cardType === 'definition').length;
    const alerts = this.cards.filter(c => c.cardType === 'alert').length;
    const battlecards = this.cards.filter(c => c.cardType === 'battlecard').length;
    const assets = this.cards.filter(c => c.cardType === 'asset').length;

    document.getElementById('cardsTotalCount').textContent = total;
    document.getElementById('cardsEnabledCount').textContent = enabled;
    document.getElementById('cardsDefinitionCount').textContent = definitions;
    document.getElementById('cardsAlertCount').textContent = alerts;
    document.getElementById('cardsBattlecardCount').textContent = battlecards;
    document.getElementById('cardsAssetCount').textContent = assets;
  }

  async refreshData() {
    const btn = document.getElementById('refreshCardsBtn');
    const icon = btn.querySelector('.icon');

    icon.classList.add('spinning');
    btn.disabled = true;

    try {
      AdminShared.clearStorageCache();
      await this.loadCards();
      this.renderCards();
      AdminShared.showToast('Cards refreshed', 'success');
    } catch (e) {
      console.error('Failed to refresh:', e);
      AdminShared.showToast('Failed to refresh', 'error');
    } finally {
      icon.classList.remove('spinning');
      btn.disabled = false;
    }
  }

  renderCards() {
    const search = document.getElementById('cardsSearch').value.toLowerCase();
    const typeFilter = document.getElementById('cardsTypeFilter').value;
    const displayFilter = document.getElementById('cardsDisplayFilter').value;
    const objectFilter = document.getElementById('cardsObjectFilter').value;
    const cardList = document.getElementById('cardsCardList');
    const emptyState = document.getElementById('cardsEmptyState');

    let filtered = this.cards.filter(card => {
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

      // Type filter
      if (typeFilter !== 'all' && card.cardType !== typeFilter) return false;

      // Display mode filter
      if (displayFilter !== 'all') {
        if (!card.displayModes?.includes(displayFilter)) return false;
      }

      // Object type filter
      if (objectFilter !== 'all') {
        if (!card.objectTypes?.includes(objectFilter)) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      cardList.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    cardList.style.display = 'flex';
    emptyState.style.display = 'none';

    cardList.innerHTML = filtered.map(card => this.renderCardItem(card)).join('');

    // Bind events
    this.bindCardListEvents(cardList);
  }

  renderCardItem(card) {
    const config = CARD_TYPE_CONFIG[card.cardType] || CARD_TYPE_CONFIG.definition;
    const description = this.getCardDescription(card);
    const objectTypes = card.objectTypes?.length > 0 ? card.objectTypes.join(', ') : 'All';
    const conditionText = card.displayOnAll ? 'All records' : `${card.conditions?.length || 0} conditions`;

    const actionsHtml = this.isViewOnly ? `
      <span class="status-badge ${card.enabled !== false ? 'active' : 'inactive'}">${card.enabled !== false ? 'Active' : 'Inactive'}</span>
    ` : `
      <span class="status-badge ${card.enabled !== false ? 'active' : 'inactive'}">${card.enabled !== false ? 'Active' : 'Inactive'}</span>
      <div class="compact-card-dropdown">
        <button class="compact-card-menu-btn" data-id="${card.id}" title="Actions">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="12" cy="5" r="1"/>
            <circle cx="12" cy="19" r="1"/>
          </svg>
        </button>
        <div class="compact-card-dropdown-menu">
          <button class="compact-card-dropdown-item edit-card-btn" data-id="${card.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          <button class="compact-card-dropdown-item toggle-card-btn" data-id="${card.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${card.enabled !== false ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>' : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'}
            </svg>
            ${card.enabled !== false ? 'Disable' : 'Enable'}
          </button>
          <button class="compact-card-dropdown-item danger delete-card-btn" data-id="${card.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete
          </button>
        </div>
      </div>
    `;

    return `
      <div class="compact-card" data-id="${card.id}">
        <div class="compact-card-icon card-type-${card.cardType}">
          <span class="icon ${config.icon}"></span>
        </div>
        <div class="compact-card-content">
          <div class="compact-card-header">
            <span class="compact-card-title">${AdminShared.escapeHtml(card.name)}</span>
            <span class="compact-card-type card-type-${card.cardType}">${config.label}</span>
          </div>
          <div class="compact-card-description">${AdminShared.escapeHtml(description)}</div>
        </div>
        <div class="compact-card-meta">
          <span class="compact-card-meta-item">${objectTypes}</span>
          <span class="compact-card-meta-item">${conditionText}</span>
        </div>
        <div class="compact-card-actions">
          ${actionsHtml}
        </div>
      </div>
    `;
  }

  getCardDescription(card) {
    switch (card.cardType) {
      case 'definition':
        return card.triggerText ? `Trigger: "${card.triggerText}"` : AdminShared.stripHtml(card.content || '').substring(0, 60) || 'No definition';
      case 'alert':
        return card.title || AdminShared.stripHtml(card.content || '').substring(0, 60) || 'No message';
      case 'battlecard':
        return card.subtitle || `${card.sections?.length || 0} sections`;
      case 'asset':
        return card.link || 'No link';
      default:
        return AdminShared.stripHtml(card.content || '').substring(0, 60) || 'No description';
    }
  }

  bindCardListEvents(cardList) {
    // Card click
    cardList.querySelectorAll('.compact-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.compact-card-dropdown') || e.target.closest('.compact-card-actions')) {
          return;
        }
        const cardId = card.dataset.id;
        if (this.isViewOnly) {
          this.viewCardDetails(cardId);
        } else {
          this.editCard(cardId);
        }
      });
    });

    // Dropdown toggle
    cardList.querySelectorAll('.compact-card-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.closest('.compact-card-dropdown');
        cardList.querySelectorAll('.compact-card-dropdown.open').forEach(d => {
          if (d !== dropdown) d.classList.remove('open');
        });
        dropdown.classList.toggle('open');
      });
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.compact-card-dropdown')) {
        cardList.querySelectorAll('.compact-card-dropdown.open').forEach(d => {
          d.classList.remove('open');
        });
      }
    });

    // Dropdown actions
    cardList.querySelectorAll('.edit-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editCard(btn.dataset.id);
      });
    });

    cardList.querySelectorAll('.delete-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteCard(btn.dataset.id);
      });
    });

    cardList.querySelectorAll('.toggle-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCard(btn.dataset.id);
      });
    });
  }

  openCardEditor(card = null) {
    this.editingCardId = card?.id || null;
    this.editingCardType = card?.cardType || null;
    this.sections = card?.sections ? [...card.sections] : [];
    this.assets = card?.assets ? [...card.assets] : [];
    this.nextSteps = card?.nextSteps ? [...card.nextSteps] : [];

    // Show editor section
    document.getElementById('cardsSection').classList.remove('active');
    document.getElementById('cardEditorSection').classList.add('active');

    // Update title
    document.getElementById('cardEditorTitle').textContent = card ? 'Edit Card' : 'Add Card';

    // Show/hide type selector
    const typeSelector = document.getElementById('cardTypeSelector');
    typeSelector.style.display = card ? 'none' : 'block';

    if (card) {
      // Populate form with card data
      this.populateForm(card);
    } else {
      // Reset form
      this.resetForm();
    }

    // Store original data for change detection
    this.originalData = this.getCurrentFormData();

    // Switch to content tab
    this.switchTab('content');
  }

  populateForm(card) {
    // Select card type
    this.selectCardType(card.cardType);

    // Common fields
    document.getElementById('cardName').value = card.name || '';
    document.getElementById('cardPriority').value = card.priority ?? 50;
    document.getElementById('cardContent').innerHTML = card.content || '';
    document.getElementById('cardEnabled').checked = card.enabled !== false;

    // Display modes
    document.getElementById('displayModeTooltip').checked = card.displayModes?.includes('tooltip') || false;
    document.getElementById('displayModeBanner').checked = card.displayModes?.includes('banner') || false;
    document.getElementById('displayModeSidepanel').checked = card.displayModes?.includes('sidepanel') || false;

    // Object types
    document.getElementById('objectTypeContacts').checked = card.objectTypes?.includes('contacts') || false;
    document.getElementById('objectTypeCompanies').checked = card.objectTypes?.includes('companies') || false;
    document.getElementById('objectTypeDeals').checked = card.objectTypes?.includes('deals') || false;
    document.getElementById('objectTypeTickets').checked = card.objectTypes?.includes('tickets') || false;

    // Rules
    document.getElementById('cardDisplayOnAll').checked = card.displayOnAll || false;
    AdminShared.toggleConditionsWrapper('cardConditionsWrapper', card.displayOnAll || false);
    AdminShared.setLogic('cardLogicToggle', card.logic || 'AND');

    // Load conditions
    const conditionsEl = document.getElementById('cardConditions');
    conditionsEl.innerHTML = '';
    if (card.conditions?.length > 0) {
      card.conditions.forEach(condition => {
        AdminShared.addCondition('cardConditions', condition, this.currentProperties);
      });
    }

    // Type-specific fields
    switch (card.cardType) {
      case 'definition':
        document.getElementById('cardTriggerText').value = card.triggerText || '';
        document.getElementById('cardCategory').value = card.category || 'general';
        document.getElementById('cardAliases').value = card.aliases?.join(', ') || '';
        document.getElementById('cardMatchType').value = card.matchType || 'exact';
        document.getElementById('cardFrequency').value = card.frequency || 'first';
        break;

      case 'alert':
        document.getElementById('cardTitle').value = card.title || '';
        document.getElementById('cardBannerType').value = card.bannerType || 'info';
        document.getElementById('cardEmbedUrl').value = card.embedUrl || '';
        document.getElementById('cardTabVisibility').value = card.tabVisibility === 'all' ? '' : card.tabVisibility || '';
        document.getElementById('cardEmbedUrlGroup').style.display = card.bannerType === 'embed' ? 'block' : 'none';
        break;

      case 'battlecard':
        document.getElementById('cardSubtitle').value = card.subtitle || '';
        document.getElementById('cardBattlecardType').value = card.battlecardType || 'tip';
        document.getElementById('cardLink').value = card.link || '';
        this.renderSections();
        break;

      case 'asset':
        document.getElementById('cardAssetUrl').value = card.link || '';
        // Asset type would need to be stored/retrieved
        break;
    }

    // Render assets and next steps
    this.renderAssets();
    this.renderNextSteps();
  }

  resetForm() {
    // Clear all form fields
    document.getElementById('cardName').value = '';
    document.getElementById('cardPriority').value = 50;
    document.getElementById('cardContent').innerHTML = '';
    document.getElementById('cardEnabled').checked = true;

    // Reset display modes
    document.getElementById('displayModeTooltip').checked = false;
    document.getElementById('displayModeBanner').checked = false;
    document.getElementById('displayModeSidepanel').checked = false;

    // Reset object types
    document.getElementById('objectTypeContacts').checked = false;
    document.getElementById('objectTypeCompanies').checked = false;
    document.getElementById('objectTypeDeals').checked = false;
    document.getElementById('objectTypeTickets').checked = false;

    // Reset rules
    document.getElementById('cardDisplayOnAll').checked = false;
    AdminShared.toggleConditionsWrapper('cardConditionsWrapper', false);
    AdminShared.setLogic('cardLogicToggle', 'AND');
    document.getElementById('cardConditions').innerHTML = '';

    // Reset type-specific fields
    document.getElementById('cardTriggerText').value = '';
    document.getElementById('cardCategory').value = 'general';
    document.getElementById('cardAliases').value = '';
    document.getElementById('cardMatchType').value = 'exact';
    document.getElementById('cardFrequency').value = 'first';
    document.getElementById('cardTitle').value = '';
    document.getElementById('cardBannerType').value = 'info';
    document.getElementById('cardEmbedUrl').value = '';
    document.getElementById('cardTabVisibility').value = '';
    document.getElementById('cardSubtitle').value = '';
    document.getElementById('cardBattlecardType').value = 'tip';
    document.getElementById('cardLink').value = '';
    document.getElementById('cardAssetUrl').value = '';

    // Clear type selection
    document.querySelectorAll('.card-type-option').forEach(btn => {
      btn.classList.remove('selected');
    });
    this.editingCardType = null;

    // Hide all type-specific sections
    document.getElementById('definitionFields').style.display = 'none';
    document.getElementById('alertFields').style.display = 'none';
    document.getElementById('battlecardFields').style.display = 'none';
    document.getElementById('assetFields').style.display = 'none';
    document.getElementById('cardSectionsGroup').style.display = 'none';
    document.getElementById('definitionRulesSection').style.display = 'none';
    document.getElementById('alertRulesSection').style.display = 'none';

    // Clear sections, assets, next steps
    this.sections = [];
    this.assets = [];
    this.nextSteps = [];
    this.renderSections();
    this.renderAssets();
    this.renderNextSteps();
  }

  getCurrentFormData() {
    return JSON.stringify({
      cardType: this.editingCardType,
      name: document.getElementById('cardName').value,
      priority: document.getElementById('cardPriority').value,
      content: document.getElementById('cardContent').innerHTML,
      enabled: document.getElementById('cardEnabled').checked
    });
  }

  hasUnsavedChanges() {
    if (!this.originalData) return false;
    return this.getCurrentFormData() !== this.originalData;
  }

  async handleBackNavigation() {
    if (this.hasUnsavedChanges()) {
      const result = await AdminShared.showConfirmDialog({
        title: 'Unsaved Changes',
        message: "You have unsaved changes. What would you like to do?",
        primaryLabel: 'Save',
        secondaryLabel: 'Discard',
        showCancel: true
      });

      if (result === 'primary') {
        await this.saveCard();
        return;
      } else if (result === 'cancel') {
        return;
      }
    }

    this.closeEditor();
  }

  closeEditor() {
    document.getElementById('cardEditorSection').classList.remove('active');
    document.getElementById('cardsSection').classList.add('active');
    this.editingCardId = null;
    this.editingCardType = null;
    this.originalData = null;

    // Clear URL params
    window.history.replaceState({}, '', window.location.pathname);
  }

  editCard(cardId) {
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      this.openCardEditor(card);
    }
  }

  viewCardDetails(cardId) {
    const card = this.cards.find(c => c.id === cardId);
    if (!card) return;

    // Simple view modal for now
    const config = CARD_TYPE_CONFIG[card.cardType];
    AdminShared.showConfirmDialog({
      title: card.name,
      message: `Type: ${config.label}\n\n${AdminShared.stripHtml(card.content || 'No content')}`,
      primaryLabel: 'Close',
      showCancel: false
    });
  }

  async deleteCard(cardId) {
    const card = this.cards.find(c => c.id === cardId);
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
        const { error } = await RevGuideDB.deleteCard(cardId);
        if (error) throw error;
      }

      this.cards = this.cards.filter(c => c.id !== cardId);
      this.renderCards();
      this.updateStats();
      AdminShared.showToast('Card deleted', 'success');
      AdminShared.notifyContentScript();
    } catch (e) {
      console.error('Failed to delete card:', e);
      AdminShared.showToast('Failed to delete card', 'error');
    }
  }

  async toggleCard(cardId) {
    const card = this.cards.find(c => c.id === cardId);
    if (!card) return;

    const newEnabled = card.enabled === false;

    try {
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        const { error } = await RevGuideDB.updateCard(cardId, { enabled: newEnabled });
        if (error) throw error;
      }

      card.enabled = newEnabled;
      this.renderCards();
      this.updateStats();
      AdminShared.showToast(`Card ${newEnabled ? 'enabled' : 'disabled'}`, 'success');
      AdminShared.notifyContentScript();
    } catch (e) {
      console.error('Failed to toggle card:', e);
      AdminShared.showToast('Failed to update card', 'error');
    }
  }

  async saveCard() {
    // Validate
    if (!this.editingCardType) {
      AdminShared.showToast('Please select a card type', 'error');
      return;
    }

    const name = document.getElementById('cardName').value.trim();
    if (!name) {
      AdminShared.showToast('Name is required', 'error');
      return;
    }

    // Build card data
    const cardData = {
      cardType: this.editingCardType,
      name: name,
      priority: parseInt(document.getElementById('cardPriority').value) || 50,
      content: document.getElementById('cardContent').innerHTML || '',
      enabled: document.getElementById('cardEnabled').checked,
      displayModes: this.getSelectedDisplayModes(),
      objectTypes: this.getSelectedObjectTypes(),
      displayOnAll: document.getElementById('cardDisplayOnAll').checked,
      conditions: AdminShared.getConditions('cardConditions'),
      logic: AdminShared.getLogic('cardLogicToggle')
    };

    // Type-specific fields
    switch (this.editingCardType) {
      case 'definition':
        const triggerText = document.getElementById('cardTriggerText').value.trim();
        if (!triggerText) {
          AdminShared.showToast('Trigger text is required for definitions', 'error');
          return;
        }
        cardData.triggerText = triggerText;
        cardData.category = document.getElementById('cardCategory').value;
        cardData.aliases = document.getElementById('cardAliases').value.split(',').map(s => s.trim()).filter(Boolean);
        cardData.matchType = document.getElementById('cardMatchType').value;
        cardData.frequency = document.getElementById('cardFrequency').value;
        break;

      case 'alert':
        cardData.title = document.getElementById('cardTitle').value.trim();
        cardData.bannerType = document.getElementById('cardBannerType').value;
        if (cardData.bannerType === 'embed') {
          const embedUrl = document.getElementById('cardEmbedUrl').value.trim();
          if (!embedUrl) {
            AdminShared.showToast('Embed URL is required for embed type', 'error');
            return;
          }
          cardData.embedUrl = AdminShared.convertToEmbedUrl(embedUrl);
          cardData.originalUrl = embedUrl;
        }
        const tabVis = document.getElementById('cardTabVisibility').value;
        cardData.tabVisibility = tabVis || 'all';
        break;

      case 'battlecard':
        cardData.subtitle = document.getElementById('cardSubtitle').value.trim();
        cardData.battlecardType = document.getElementById('cardBattlecardType').value;
        cardData.link = document.getElementById('cardLink').value.trim();
        cardData.sections = this.sections;
        break;

      case 'asset':
        const assetUrl = document.getElementById('cardAssetUrl').value.trim();
        if (!assetUrl) {
          AdminShared.showToast('Asset URL is required', 'error');
          return;
        }
        cardData.link = assetUrl;
        break;
    }

    // Add assets and next steps
    cardData.assets = this.assets;
    cardData.nextSteps = this.nextSteps;

    try {
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        const supabaseData = AdminShared.mapCardToSupabase(cardData);

        if (this.editingCardId) {
          const { data, error } = await RevGuideDB.updateCard(this.editingCardId, supabaseData);
          if (error) throw error;

          const index = this.cards.findIndex(c => c.id === this.editingCardId);
          if (index !== -1) {
            this.cards[index] = AdminShared.mapCardFromSupabase(data);
          }
        } else {
          const { data, error } = await RevGuideDB.createCard(supabaseData);
          if (error) throw error;

          this.cards.push(AdminShared.mapCardFromSupabase(data));
        }
      } else {
        // Extension context - handle local storage
        if (this.editingCardId) {
          const index = this.cards.findIndex(c => c.id === this.editingCardId);
          if (index !== -1) {
            this.cards[index] = { ...cardData, id: this.editingCardId };
          }
        } else {
          cardData.id = AdminShared.generateId('card');
          this.cards.push(cardData);
        }
        // Save to storage (would need to convert back to legacy format)
      }

      AdminShared.clearStorageCache();
      this.renderCards();
      this.updateStats();
      this.closeEditor();
      AdminShared.showToast(this.editingCardId ? 'Card updated' : 'Card created', 'success');
      AdminShared.notifyContentScript();
    } catch (e) {
      console.error('Failed to save card:', e);
      AdminShared.showToast('Failed to save card: ' + e.message, 'error');
    }
  }

  getSelectedDisplayModes() {
    const modes = [];
    if (document.getElementById('displayModeTooltip').checked) modes.push('tooltip');
    if (document.getElementById('displayModeBanner').checked) modes.push('banner');
    if (document.getElementById('displayModeSidepanel').checked) modes.push('sidepanel');
    return modes;
  }

  getSelectedObjectTypes() {
    const types = [];
    if (document.getElementById('objectTypeContacts').checked) types.push('contacts');
    if (document.getElementById('objectTypeCompanies').checked) types.push('companies');
    if (document.getElementById('objectTypeDeals').checked) types.push('deals');
    if (document.getElementById('objectTypeTickets').checked) types.push('tickets');
    return types;
  }

  // Section management (for battlecards)
  addSection() {
    this.sections.push({
      type: 'text',
      title: '',
      content: ''
    });
    this.renderSections();
  }

  renderSections() {
    const container = document.getElementById('cardSections');
    if (!container) return;

    container.innerHTML = this.sections.map((section, index) => `
      <div class="section-row" data-index="${index}">
        <div class="section-header-row">
          <button type="button" class="drag-handle" title="Drag to reorder">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="16" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="8" y1="18" x2="16" y2="18"/>
            </svg>
          </button>
          <select class="section-type-select" data-index="${index}">
            <option value="text" ${section.type === 'text' ? 'selected' : ''}>Text</option>
            <option value="media" ${section.type === 'media' ? 'selected' : ''}>Media</option>
          </select>
          <input type="text" class="section-title-input" placeholder="Section title" value="${AdminShared.escapeHtml(section.title || '')}" data-index="${index}">
          <button type="button" class="remove-section-btn" data-index="${index}" title="Remove section">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="section-body">
          ${section.type === 'text' ? `
            <textarea class="section-content-input" placeholder="Section content" data-index="${index}">${AdminShared.escapeHtml(section.content || '')}</textarea>
          ` : `
            <input type="url" class="section-media-input" placeholder="Media URL (YouTube, Loom, etc.)" value="${AdminShared.escapeHtml(section.mediaUrl || '')}" data-index="${index}">
          `}
        </div>
      </div>
    `).join('');

    // Bind section events
    container.querySelectorAll('.section-type-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.sections[index].type = e.target.value;
        this.renderSections();
      });
    });

    container.querySelectorAll('.section-title-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.sections[index].title = e.target.value;
      });
    });

    container.querySelectorAll('.section-content-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.sections[index].content = e.target.value;
      });
    });

    container.querySelectorAll('.section-media-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.sections[index].mediaUrl = e.target.value;
      });
    });

    container.querySelectorAll('.remove-section-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.closest('.remove-section-btn').dataset.index);
        this.sections.splice(index, 1);
        this.renderSections();
      });
    });
  }

  // Asset management
  addAsset() {
    this.assets.push({
      url: '',
      title: '',
      type: 'link'
    });
    this.renderAssets();
  }

  renderAssets() {
    const container = document.getElementById('cardAssetsList');
    if (!container) return;

    container.innerHTML = this.assets.map((asset, index) => `
      <div class="asset-row" data-index="${index}">
        <input type="text" class="asset-title-input" placeholder="Asset title" value="${AdminShared.escapeHtml(asset.title || '')}" data-index="${index}">
        <input type="url" class="asset-url-input" placeholder="URL" value="${AdminShared.escapeHtml(asset.url || '')}" data-index="${index}">
        <select class="asset-type-select" data-index="${index}">
          <option value="link" ${asset.type === 'link' ? 'selected' : ''}>Link</option>
          <option value="document" ${asset.type === 'document' ? 'selected' : ''}>Document</option>
          <option value="video" ${asset.type === 'video' ? 'selected' : ''}>Video</option>
          <option value="case-study" ${asset.type === 'case-study' ? 'selected' : ''}>Case Study</option>
        </select>
        <button type="button" class="remove-asset-btn" data-index="${index}" title="Remove asset">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Bind events
    container.querySelectorAll('.asset-title-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.assets[index].title = e.target.value;
      });
    });

    container.querySelectorAll('.asset-url-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.assets[index].url = e.target.value;
      });
    });

    container.querySelectorAll('.asset-type-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.assets[index].type = e.target.value;
      });
    });

    container.querySelectorAll('.remove-asset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.closest('.remove-asset-btn').dataset.index);
        this.assets.splice(index, 1);
        this.renderAssets();
      });
    });
  }

  // Next steps management
  addNextStep() {
    this.nextSteps.push({
      text: '',
      link: ''
    });
    this.renderNextSteps();
  }

  renderNextSteps() {
    const container = document.getElementById('cardNextStepsList');
    if (!container) return;

    container.innerHTML = this.nextSteps.map((step, index) => `
      <div class="next-step-row" data-index="${index}">
        <input type="text" class="next-step-text-input" placeholder="Next step description" value="${AdminShared.escapeHtml(step.text || '')}" data-index="${index}">
        <input type="url" class="next-step-link-input" placeholder="Link (optional)" value="${AdminShared.escapeHtml(step.link || '')}" data-index="${index}">
        <button type="button" class="remove-next-step-btn" data-index="${index}" title="Remove step">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Bind events
    container.querySelectorAll('.next-step-text-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.nextSteps[index].text = e.target.value;
      });
    });

    container.querySelectorAll('.next-step-link-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.nextSteps[index].link = e.target.value;
      });
    });

    container.querySelectorAll('.remove-next-step-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.closest('.remove-next-step-btn').dataset.index);
        this.nextSteps.splice(index, 1);
        this.renderNextSteps();
      });
    });
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  new CardsPage();
});
