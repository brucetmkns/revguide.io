/**
 * RevGuide - Plays Page
 */

class PlaysPage {
  constructor() {
    this.battleCards = [];
    this.propertiesCache = {};
    this.currentProperties = [];
    this.editingPlayId = null;
    this.activeTab = 'content';
    this.originalData = null; // For tracking unsaved changes
    this.fieldSectionProperties = []; // Properties available for field sections
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
    AdminShared.renderSidebar('plays');

    // Setup view-only UI if member
    if (this.isViewOnly) {
      this.setupViewOnlyMode();
    }

    // Load data
    const data = await AdminShared.loadStorageData();
    this.battleCards = data.battleCards || [];

    // Check for action param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add' && !this.isViewOnly) {
      this.openPlayEditor();
    } else if (urlParams.get('edit') && !this.isViewOnly) {
      // Open editor for specific play by ID
      const playId = urlParams.get('edit');
      const play = this.battleCards.find(p => p.id === playId);
      if (play) {
        this.openPlayEditor(play);
      } else {
        AdminShared.showToast('Play not found', 'error');
        this.renderPlays();
      }
    } else {
      this.renderPlays();
    }

    // Bind events (only for admins)
    if (!this.isViewOnly) {
      this.bindEvents();
    }
  }

  setupViewOnlyMode() {
    // Hide add buttons
    const addPlayBtn = document.getElementById('addPlayBtn');
    const createPlayEmptyBtn = document.getElementById('createPlayEmptyBtn');
    if (addPlayBtn) addPlayBtn.style.display = 'none';
    if (createPlayEmptyBtn) createPlayEmptyBtn.style.display = 'none';

    // Update page title/description for viewers
    const sectionDesc = document.querySelector('.section-description');
    if (sectionDesc) {
      sectionDesc.textContent = 'View plays and battle cards configured by your team admins.';
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
    // Add play buttons
    document.getElementById('addPlayBtn').addEventListener('click', () => this.openPlayEditor());
    document.getElementById('createPlayEmptyBtn').addEventListener('click', () => this.openPlayEditor());

    // Search and filter
    document.getElementById('playsSearch').addEventListener('input', () => this.renderPlays());
    document.getElementById('playsSearchClear').addEventListener('click', () => this.clearSearch());
    document.getElementById('playsFilter').addEventListener('change', () => this.renderPlays());
    document.getElementById('playsObjectFilter').addEventListener('change', () => this.renderPlays());

    // Refresh button
    document.getElementById('refreshPlaysBtn').addEventListener('click', () => this.refreshData());

    // Editor navigation
    document.getElementById('backToPlays').addEventListener('click', (e) => {
      e.preventDefault();
      this.handleBackNavigation();
    });
    document.getElementById('cancelPlayBtn').addEventListener('click', () => this.handleBackNavigation());
    document.getElementById('savePlayBtn').addEventListener('click', () => this.savePlay());

    // Tab clicks
    document.getElementById('playCardTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.play-tab');
      if (tab && !tab.disabled) {
        this.switchTab(tab.dataset.tab);
      }
    });

    // Object type change
    document.getElementById('playObjectType').addEventListener('change', (e) => this.onObjectTypeChange(e.target.value));

    // Add condition
    document.getElementById('addPlayConditionBtn').addEventListener('click', () => {
      AdminShared.addCondition('playConditions', null, this.currentProperties);
    });

    // Logic toggle
    AdminShared.initLogicToggle('playLogicToggle');

    // Display on all checkbox
    document.getElementById('playDisplayOnAll').addEventListener('change', (e) => {
      AdminShared.toggleConditionsWrapper('playConditionsWrapper', e.target.checked);
    });

    // Add section
    document.getElementById('addSectionBtn').addEventListener('click', () => this.addSection());
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.play-tab').forEach(tab => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });

    // Update tab panels
    document.querySelectorAll('.play-tab-panel').forEach(panel => {
      panel.hidden = panel.id !== `play-tab-${tabName}`;
    });
  }

  clearSearch() {
    const searchInput = document.getElementById('playsSearch');
    searchInput.value = '';
    searchInput.focus();
    this.renderPlays();
  }

  async refreshData() {
    const btn = document.getElementById('refreshPlaysBtn');
    const icon = btn.querySelector('.icon');

    // Add spinning animation
    icon.classList.add('spinning');
    btn.disabled = true;

    try {
      // Clear cache and reload
      AdminShared.clearStorageCache();
      const data = await AdminShared.loadStorageData(true);
      this.battleCards = data.battleCards || [];
      this.renderPlays();
      AdminShared.showToast('Plays refreshed', 'success');
    } catch (e) {
      console.error('Failed to refresh:', e);
      AdminShared.showToast('Failed to refresh', 'error');
    } finally {
      icon.classList.remove('spinning');
      btn.disabled = false;
    }
  }

  renderPlays() {
    const search = document.getElementById('playsSearch').value.toLowerCase();
    const filter = document.getElementById('playsFilter').value;
    const objectFilter = document.getElementById('playsObjectFilter').value;
    const cardList = document.getElementById('playsCardList');
    const emptyState = document.getElementById('playsEmptyState');

    let filtered = this.battleCards.filter(card => {
      if (search && !card.name.toLowerCase().includes(search) && !card.subtitle?.toLowerCase().includes(search)) {
        return false;
      }
      if (filter !== 'all' && card.cardType !== filter) {
        return false;
      }
      // Object filter - show if no objectType set (applies to all) or matches the filter
      if (objectFilter !== 'all') {
        if (card.objectType && card.objectType !== objectFilter) {
          return false;
        }
        // If card has no objectType, it applies to all objects, so include it
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

    cardList.innerHTML = filtered.map(card => {
      const typeLabel = AdminShared.CARD_TYPE_LABELS[card.cardType] || card.cardType;
      const sectionCount = card.sections?.length || 0;
      const conditionCount = card.conditions?.length || 0;
      const conditionText = card.displayOnAll ? 'All records' : `${conditionCount} condition${conditionCount !== 1 ? 's' : ''}`;
      const description = card.subtitle || 'No description';

      // Icon based on type
      const iconMap = {
        competitor: 'icon-swords',
        objection: 'icon-shield',
        tip: 'icon-lightbulb',
        process: 'icon-clipboard-list'
      };
      const iconClass = iconMap[card.cardType] || 'icon-layers';

      // Build dropdown menu for editors, nothing extra for viewers
      const actionsHtml = this.isViewOnly ? `` : `
        <div class="compact-card-dropdown">
          <button class="compact-card-menu-btn" data-id="${card.id}" title="Actions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="1"/>
              <circle cx="12" cy="5" r="1"/>
              <circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
          <div class="compact-card-dropdown-menu">
            <button class="compact-card-dropdown-item edit-play-btn" data-id="${card.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
            <button class="compact-card-dropdown-item danger delete-play-btn" data-id="${card.id}">
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
          <div class="compact-card-icon ${card.cardType}">
            <span class="icon ${iconClass}"></span>
          </div>
          <div class="compact-card-content">
            <div class="compact-card-header">
              <span class="compact-card-title">${AdminShared.escapeHtml(card.name)}</span>
              <span class="compact-card-type ${card.cardType}">${typeLabel}</span>
            </div>
            <div class="compact-card-description">${AdminShared.escapeHtml(description)}</div>
          </div>
          <div class="compact-card-meta">
            <span class="compact-card-meta-item">${sectionCount} section${sectionCount !== 1 ? 's' : ''}</span>
            <span class="compact-card-meta-item">${conditionText}</span>
          </div>
          <div class="compact-card-actions">
            ${actionsHtml}
          </div>
        </div>
      `;
    }).join('');

    // Bind card click events - clicking card opens editor/viewer
    cardList.querySelectorAll('.compact-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger if clicking on dropdown or actions
        if (e.target.closest('.compact-card-dropdown') || e.target.closest('.compact-card-actions')) {
          return;
        }
        const playId = card.dataset.id;
        if (this.isViewOnly) {
          this.viewPlayDetails(playId);
        } else {
          this.editPlay(playId);
        }
      });
    });

    // Bind dropdown menu toggle
    cardList.querySelectorAll('.compact-card-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.closest('.compact-card-dropdown');
        // Close all other dropdowns
        cardList.querySelectorAll('.compact-card-dropdown.open').forEach(d => {
          if (d !== dropdown) d.classList.remove('open');
        });
        dropdown.classList.toggle('open');
      });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.compact-card-dropdown')) {
        cardList.querySelectorAll('.compact-card-dropdown.open').forEach(d => {
          d.classList.remove('open');
        });
      }
    });

    // Bind dropdown action events
    cardList.querySelectorAll('.edit-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editPlay(btn.dataset.id);
      });
    });

    cardList.querySelectorAll('.delete-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePlay(btn.dataset.id);
      });
    });
  }

  viewPlayDetails(playId) {
    const play = this.battleCards.find(c => c.id === playId);
    if (!play) return;

    const icon = AdminShared.CARD_TYPE_ICONS[play.cardType] || '';
    const typeLabel = AdminShared.CARD_TYPE_LABELS[play.cardType] || play.cardType;
    const conditionsCount = play.conditions?.length || 0;
    const sectionsCount = play.sections?.length || 0;

    // Build sections HTML with new design
    const sectionsHtml = (play.sections || []).map(section => {
      if (section.type === 'media') {
        return `
          <div class="view-details-section">
            <div class="view-details-section-label">${AdminShared.escapeHtml(section.title || 'Media')}</div>
            <div class="view-details-media-box">
              <div class="view-details-media-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
              <div class="view-details-media-info">
                <span class="view-details-media-title">${AdminShared.escapeHtml(section.title || 'Media')}</span>
                <a href="${AdminShared.escapeHtml(section.mediaUrl || '#')}" target="_blank" class="view-details-media-link">${AdminShared.escapeHtml(section.mediaUrl || '-')}</a>
              </div>
            </div>
          </div>
        `;
      } else if (section.type === 'fields') {
        const fieldTags = (section.fields || []).map(f =>
          `<span class="view-details-field-tag">${AdminShared.escapeHtml(f.label || f.property)}</span>`
        ).join('');
        return `
          <div class="view-details-section">
            <div class="view-details-section-label">${AdminShared.escapeHtml(section.title || 'Fields')}</div>
            <div class="view-details-fields-list">
              ${fieldTags || '<span class="view-details-field-tag">No fields</span>'}
            </div>
          </div>
        `;
      } else {
        return `
          <div class="view-details-section">
            <div class="view-details-section-label">${AdminShared.escapeHtml(section.title || 'Content')}</div>
            <div class="view-details-content-box">${AdminShared.escapeHtml(section.content || '-')}</div>
          </div>
        `;
      }
    }).join('');

    // Create modal with new design
    const modal = document.createElement('div');
    modal.className = 'view-details-modal';
    modal.innerHTML = `
      <div class="view-details-overlay"></div>
      <div class="view-details-content">
        <div class="view-details-type-header ${play.cardType}">
          <div class="view-details-type-header-content">
            ${icon}
            <span class="view-details-type-label">${typeLabel}</span>
          </div>
          <button class="view-details-close-btn" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="view-details-body">
          <h2 class="view-details-title">${AdminShared.escapeHtml(play.name)}</h2>
          ${play.subtitle ? `<p class="view-details-subtitle">${AdminShared.escapeHtml(play.subtitle)}</p>` : '<p class="view-details-subtitle"></p>'}

          ${play.link ? `
            <a href="${AdminShared.escapeHtml(play.link)}" target="_blank" class="view-details-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              ${AdminShared.escapeHtml(play.link)}
            </a>
          ` : ''}

          ${sectionsHtml}

          <div class="view-details-meta-row">
            <div class="view-details-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
              ${play.objectType || 'Any'}
            </div>
            <div class="view-details-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              ${conditionsCount} condition${conditionsCount !== 1 ? 's' : ''}
            </div>
            ${sectionsCount > 0 ? `
              <div class="view-details-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${sectionsCount} section${sectionsCount !== 1 ? 's' : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => modal.remove();
    modal.querySelector('.view-details-close-btn').addEventListener('click', closeModal);
    modal.querySelector('.view-details-overlay').addEventListener('click', closeModal);
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    });
  }

  openPlayEditor(play = null) {
    this.editingPlayId = play?.id || null;
    document.getElementById('playEditorTitle').textContent = play ? 'Edit Play' : 'Add Play';

    // Reset to Content tab
    this.switchTab('content');

    // Reset form
    document.getElementById('playName').value = play?.name || '';
    document.getElementById('playType').value = play?.cardType || 'competitor';
    document.getElementById('playSubtitle').value = play?.subtitle || '';
    document.getElementById('playLink').value = play?.link || '';
    document.getElementById('playObjectType').value = play?.objectType || '';

    this.currentProperties = [];
    document.getElementById('playConditions').innerHTML = '';
    document.getElementById('addPlayConditionBtn').disabled = !play?.objectType;
    document.getElementById('playConditionStatus').textContent = '';

    // Display on all
    const displayOnAll = play?.displayOnAll || false;
    document.getElementById('playDisplayOnAll').checked = displayOnAll;
    AdminShared.toggleConditionsWrapper('playConditionsWrapper', displayOnAll);

    // Sections
    const sectionsContainer = document.getElementById('playSections');
    sectionsContainer.innerHTML = '';
    if (play?.sections?.length) {
      play.sections.forEach(s => this.addSection(s));
    }

    // Load properties and conditions
    if (play?.objectType && play?.conditions?.length) {
      this.loadPropertiesAndConditions(play.objectType, play.conditions);
    } else if (play?.objectType) {
      this.onObjectTypeChange(play.objectType);
    }

    // Set logic
    AdminShared.setLogic('playLogicToggle', play?.logic || 'AND');

    // Store original data for change detection
    // Use setTimeout to allow conditions to be populated
    setTimeout(() => {
      this.originalData = this.getCurrentFormData();
    }, 100);

    // Show editor
    document.getElementById('playsSection').classList.remove('active');
    document.getElementById('playEditorSection').classList.add('active');
  }

  getCurrentFormData() {
    return JSON.stringify({
      name: document.getElementById('playName').value,
      cardType: document.getElementById('playType').value,
      subtitle: document.getElementById('playSubtitle').value,
      link: document.getElementById('playLink').value,
      objectType: document.getElementById('playObjectType').value,
      displayOnAll: document.getElementById('playDisplayOnAll').checked,
      logic: AdminShared.getLogic('playLogicToggle'),
      conditions: AdminShared.getConditions('playConditions'),
      sections: this.getSections()
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
        message: "You haven't saved this play. Are you sure you want to go back?",
        primaryLabel: 'Save',
        secondaryLabel: 'Discard',
        showCancel: true
      });

      if (result === 'primary') {
        await this.savePlay();
      } else if (result === 'secondary') {
        this.closePlayEditor();
      }
      // 'cancel' - do nothing, stay on page
    } else {
      this.closePlayEditor();
    }
  }

  closePlayEditor() {
    this.editingPlayId = null;
    this.originalData = null;
    document.getElementById('playEditorSection').classList.remove('active');
    document.getElementById('playsSection').classList.add('active');
    this.renderPlays();

    // Clear URL params
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  async onObjectTypeChange(objectType) {
    const statusEl = document.getElementById('playConditionStatus');
    const addBtn = document.getElementById('addPlayConditionBtn');
    const container = document.getElementById('playConditions');

    if (!objectType) {
      this.currentProperties = [];
      this.fieldSectionProperties = [];
      addBtn.disabled = true;
      statusEl.textContent = '';
      this.refreshFieldSections();
      return;
    }

    statusEl.textContent = 'Loading properties...';
    statusEl.className = 'status-text';
    addBtn.disabled = true;

    try {
      const properties = await AdminShared.fetchProperties(objectType, this.propertiesCache);
      this.currentProperties = properties;
      this.fieldSectionProperties = properties;
      addBtn.disabled = false;
      statusEl.textContent = `${properties.length} properties loaded`;
      statusEl.className = 'status-text success';
      container.innerHTML = '';
      // Refresh any existing fields sections to show property dropdowns
      this.refreshFieldSections();
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'status-text error';
      addBtn.disabled = true;
    }
  }

  async loadPropertiesAndConditions(objectType, conditions) {
    const statusEl = document.getElementById('playConditionStatus');
    const addBtn = document.getElementById('addPlayConditionBtn');

    statusEl.textContent = 'Loading properties...';
    statusEl.className = 'status-text';

    try {
      const properties = await AdminShared.fetchProperties(objectType, this.propertiesCache);
      this.currentProperties = properties;
      this.fieldSectionProperties = properties;
      addBtn.disabled = false;
      statusEl.textContent = '';

      conditions.forEach(c => AdminShared.addCondition('playConditions', c, properties));

      // Refresh any existing fields sections to show property dropdowns
      this.refreshFieldSections();
    } catch (err) {
      statusEl.textContent = 'Error loading properties';
      statusEl.className = 'status-text error';
      conditions.forEach(c => AdminShared.addCondition('playConditions', c, []));
    }
  }

  addSection(section = null, insertAfterElement = null) {
    const container = document.getElementById('playSections');
    const sectionType = section?.type || 'text';

    // Create section wrapper (includes section + insert button after it)
    const wrapper = document.createElement('div');
    wrapper.className = 'section-wrapper';

    const div = document.createElement('div');
    div.className = 'section-row';
    div.draggable = true;
    div.dataset.type = sectionType;

    const textContentHtml = `
      <textarea class="section-content" rows="4" placeholder="Section content (use - for bullet points)">${AdminShared.escapeHtml(section?.content || '')}</textarea>
    `;

    const mediaContentHtml = `
      <div class="section-media-field">
        <input type="url" class="section-media-url" placeholder="Paste embed URL (Loom, YouTube, Vimeo, etc.)" value="${AdminShared.escapeHtml(section?.mediaUrl || '')}">
        <span class="form-hint">Supported: Loom, YouTube, Vimeo, and other embed links</span>
      </div>
    `;

    const fieldsContentHtml = this.renderFieldsSectionBody(section?.fields || []);

    div.innerHTML = `
      <div class="section-header-row">
        <button type="button" class="btn-icon drag-handle" title="Drag to reorder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="16" y2="6"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="8" y1="18" x2="16" y2="18"/>
          </svg>
        </button>
        <div class="section-type-toggle">
          <button type="button" class="section-type-btn ${sectionType === 'text' ? 'active' : ''}" data-type="text" title="Text content">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="15" y2="12"/>
              <line x1="3" y1="18" x2="18" y2="18"/>
            </svg>
          </button>
          <button type="button" class="section-type-btn ${sectionType === 'media' ? 'active' : ''}" data-type="media" title="Media embed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <button type="button" class="section-type-btn ${sectionType === 'fields' ? 'active' : ''}" data-type="fields" title="Editable HubSpot fields">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/>
            </svg>
          </button>
        </div>
        <input type="text" class="section-title" placeholder="${this.getSectionPlaceholder(sectionType)}" value="${AdminShared.escapeHtml(section?.title || '')}">
        <button type="button" class="btn-icon btn-icon-danger remove-section-btn" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="section-body">
        ${sectionType === 'media' ? mediaContentHtml : sectionType === 'fields' ? fieldsContentHtml : textContentHtml}
      </div>
    `;

    // Type toggle handler
    div.querySelectorAll('.section-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newType = btn.dataset.type;
        if (newType === div.dataset.type) return;

        div.dataset.type = newType;
        div.querySelectorAll('.section-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const titleInput = div.querySelector('.section-title');
        titleInput.placeholder = this.getSectionPlaceholder(newType);

        const bodyContainer = div.querySelector('.section-body');
        if (newType === 'media') {
          bodyContainer.innerHTML = `
            <div class="section-media-field">
              <input type="url" class="section-media-url" placeholder="Paste embed URL (Loom, YouTube, Vimeo, etc.)" value="">
              <span class="form-hint">Supported: Loom, YouTube, Vimeo, and other embed links</span>
            </div>
          `;
        } else if (newType === 'fields') {
          bodyContainer.innerHTML = this.renderFieldsSectionBody([]);
          this.initFieldsSectionEvents(bodyContainer);
        } else {
          bodyContainer.innerHTML = `
            <textarea class="section-content" rows="4" placeholder="Section content (use - for bullet points)"></textarea>
          `;
        }
      });
    });

    // Initialize fields section events if it's a fields type
    if (sectionType === 'fields') {
      this.initFieldsSectionEvents(div.querySelector('.section-body'));
    }

    // Insert button after this section
    const insertBtn = document.createElement('button');
    insertBtn.className = 'section-insert-btn';
    insertBtn.title = 'Insert section here';
    insertBtn.type = 'button';
    insertBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    `;
    insertBtn.addEventListener('click', () => this.addSection(null, wrapper));

    // Remove button handler
    const removeBtn = div.querySelector('.remove-section-btn');
    removeBtn.addEventListener('click', () => {
      wrapper.remove();
      this.updateInsertButtons();
    });

    // Drag events
    div.addEventListener('dragstart', (e) => this.onDragStart(e, wrapper));
    div.addEventListener('dragend', (e) => this.onDragEnd(e));
    div.addEventListener('dragover', (e) => this.onDragOver(e, wrapper));
    div.addEventListener('drop', (e) => this.onDrop(e, wrapper));

    wrapper.appendChild(div);
    wrapper.appendChild(insertBtn);

    // Insert at position or append
    if (insertAfterElement) {
      insertAfterElement.after(wrapper);
    } else {
      container.appendChild(wrapper);
    }

    this.updateInsertButtons();
  }

  updateInsertButtons() {
    // Show/hide insert buttons - hide on last item if it's the only visual break needed
    const container = document.getElementById('playSections');
    const wrappers = container.querySelectorAll('.section-wrapper');
    wrappers.forEach((wrapper, index) => {
      const insertBtn = wrapper.querySelector('.section-insert-btn');
      if (insertBtn) {
        // Always show insert buttons between sections
        insertBtn.style.display = '';
      }
    });
  }

  getSectionPlaceholder(type) {
    switch (type) {
      case 'media': return 'Video Title (e.g., Product Demo)';
      case 'fields': return 'Section Title (e.g., Update Deal Info)';
      default: return 'Section Title (e.g., Key Points)';
    }
  }

  renderFieldsSectionBody(fields = []) {
    const objectType = document.getElementById('playObjectType').value;
    const hasObjectType = !!objectType;

    return `
      <div class="section-fields-builder">
        ${!hasObjectType ? `
          <div class="fields-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>Select an Object Type in the Rules tab to enable field selection</span>
          </div>
        ` : `
          <div class="fields-list">
            ${fields.map((f, idx) => this.renderFieldRow(f, idx)).join('')}
          </div>
          <button type="button" class="btn btn-secondary btn-sm add-field-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Field
          </button>
          <span class="form-hint">Select HubSpot properties that users can edit in the sidebar</span>
        `}
      </div>
    `;
  }

  renderFieldRow(field = {}, index = 0) {
    const properties = this.fieldSectionProperties;
    const selectedProp = field?.property ? properties.find(p => p.name === field.property) : null;
    const selectedLabel = selectedProp?.label || field?.label || 'Select property...';

    // Get property metadata - either from selected prop or from saved field data
    const propType = selectedProp?.type || field?.type || '';
    const propFieldType = selectedProp?.fieldType || field?.fieldType || '';
    const propOptions = selectedProp?.options || field?.options || [];

    // Safely encode options as base64 to avoid HTML attribute escaping issues
    const encodeOptions = (opts) => {
      try {
        return btoa(encodeURIComponent(JSON.stringify(opts || [])));
      } catch (e) {
        return '';
      }
    };

    return `
      <div class="field-row" data-index="${index}">
        <div class="searchable-select field-property-select">
          <button type="button" class="searchable-select-trigger"
            data-value="${field?.property || ''}"
            data-label="${AdminShared.escapeHtml(selectedLabel)}"
            data-type="${propType}"
            data-field-type="${propFieldType}"
            data-options-encoded="${encodeOptions(propOptions)}">
            <span class="select-label">${AdminShared.escapeHtml(selectedLabel)}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div class="searchable-select-dropdown">
            <div class="searchable-select-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" placeholder="Search properties..." class="searchable-select-input">
            </div>
            <div class="searchable-select-options">
              ${properties.map(p => `
                <div class="searchable-select-option ${field?.property === p.name ? 'selected' : ''}"
                  data-value="${p.name}"
                  data-label="${AdminShared.escapeHtml(p.label)}"
                  data-type="${p.type}"
                  data-field-type="${p.fieldType || ''}"
                  data-options-encoded="${encodeOptions(p.options)}">
                  <span class="option-label">${AdminShared.escapeHtml(p.label)}</span>
                  <span class="option-name">${p.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <label class="field-required-label">
          <input type="checkbox" class="field-required-checkbox" ${field?.required ? 'checked' : ''}>
          <span>Required</span>
        </label>
        <button type="button" class="btn-icon btn-icon-danger remove-field-btn" title="Remove field">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;
  }

  initFieldsSectionEvents(bodyContainer) {
    // Add field button
    const addBtn = bodyContainer.querySelector('.add-field-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.addFieldRow(bodyContainer));
    }

    // Initialize existing field rows
    bodyContainer.querySelectorAll('.field-row').forEach(row => {
      this.initFieldRowEvents(row);
    });
  }

  addFieldRow(bodyContainer) {
    const fieldsList = bodyContainer.querySelector('.fields-list');
    const index = fieldsList.querySelectorAll('.field-row').length;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.renderFieldRow({}, index);
    const newRow = tempDiv.firstElementChild;

    fieldsList.appendChild(newRow);
    this.initFieldRowEvents(newRow);
  }

  initFieldRowEvents(row) {
    // Initialize searchable select
    const selectEl = row.querySelector('.searchable-select');
    if (selectEl) {
      this.initFieldPropertySelect(selectEl);
    }

    // Remove button
    const removeBtn = row.querySelector('.remove-field-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => row.remove());
    }
  }

  initFieldPropertySelect(selectEl) {
    const trigger = selectEl.querySelector('.searchable-select-trigger');
    const dropdown = selectEl.querySelector('.searchable-select-dropdown');
    const searchInput = selectEl.querySelector('.searchable-select-input');
    const optionsContainer = selectEl.querySelector('.searchable-select-options');
    const labelSpan = trigger.querySelector('.select-label');

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = selectEl.classList.contains('open');

      // Close all other dropdowns
      document.querySelectorAll('.searchable-select.open').forEach(el => {
        el.classList.remove('open');
      });

      if (!isOpen) {
        selectEl.classList.add('open');
        searchInput.value = '';
        AdminShared.filterSearchableOptions(optionsContainer, '');
        searchInput.focus();
      }
    });

    // Search filter
    searchInput.addEventListener('input', () => {
      AdminShared.filterSearchableOptions(optionsContainer, searchInput.value);
    });

    // Option selection
    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.searchable-select-option');
      if (option) {
        const value = option.dataset.value;
        const label = option.dataset.label;

        // Copy all metadata to trigger
        trigger.dataset.value = value;
        trigger.dataset.label = label;
        trigger.dataset.type = option.dataset.type || '';
        trigger.dataset.fieldType = option.dataset.fieldType || '';
        trigger.dataset.optionsEncoded = option.dataset.optionsEncoded || '';
        labelSpan.textContent = label;

        // Update selected state
        optionsContainer.querySelectorAll('.searchable-select-option').forEach(opt => {
          opt.classList.toggle('selected', opt.dataset.value === value);
        });

        selectEl.classList.remove('open');
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!selectEl.contains(e.target)) {
        selectEl.classList.remove('open');
      }
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        selectEl.classList.remove('open');
      }
    });
  }

  async loadFieldSectionProperties() {
    const objectType = document.getElementById('playObjectType').value;
    if (!objectType) {
      this.fieldSectionProperties = [];
      return;
    }

    try {
      const properties = await AdminShared.fetchProperties(objectType, this.propertiesCache);
      this.fieldSectionProperties = properties;
    } catch (err) {
      console.error('Failed to load properties for fields section:', err);
      this.fieldSectionProperties = [];
    }
  }

  refreshFieldSections() {
    // Re-render all fields sections with updated properties
    const container = document.getElementById('playSections');
    const fieldSections = container.querySelectorAll('.section-row[data-type="fields"]');
    fieldSections.forEach(sectionRow => {
      const bodyContainer = sectionRow.querySelector('.section-body');
      const currentFields = this.getFieldsFromSection(sectionRow);
      bodyContainer.innerHTML = this.renderFieldsSectionBody(currentFields);
      this.initFieldsSectionEvents(bodyContainer);
    });
  }

  getFieldsFromSection(sectionRow) {
    const fields = [];
    sectionRow.querySelectorAll('.field-row').forEach(row => {
      const trigger = row.querySelector('.searchable-select-trigger');
      const property = trigger?.dataset.value;
      const required = row.querySelector('.field-required-checkbox')?.checked || false;

      if (property) {
        // Decode options from base64 encoded string
        let options = [];
        try {
          const encoded = trigger.dataset.optionsEncoded;
          if (encoded) {
            options = JSON.parse(decodeURIComponent(atob(encoded)));
          }
        } catch (e) {
          console.error('Failed to decode options:', e);
          options = [];
        }

        fields.push({
          property,
          required,
          label: trigger.dataset.label || property,
          type: trigger.dataset.type || '',
          fieldType: trigger.dataset.fieldType || '',
          options: options
        });
      }
    });
    return fields;
  }

  onDragStart(e, wrapper) {
    this.draggedItem = wrapper;
    wrapper.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  onDragEnd(e) {
    if (this.draggedItem) {
      this.draggedItem.classList.remove('dragging');
      this.draggedItem = null;
    }
    document.querySelectorAll('.section-wrapper.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  }

  onDragOver(e, wrapper) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (wrapper !== this.draggedItem) {
      document.querySelectorAll('.section-wrapper.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
      wrapper.classList.add('drag-over');
    }
  }

  onDrop(e, wrapper) {
    e.preventDefault();
    if (this.draggedItem && wrapper !== this.draggedItem) {
      const container = document.getElementById('playSections');
      const wrappers = [...container.querySelectorAll('.section-wrapper')];
      const draggedIndex = wrappers.indexOf(this.draggedItem);
      const targetIndex = wrappers.indexOf(wrapper);

      if (draggedIndex < targetIndex) {
        wrapper.after(this.draggedItem);
      } else {
        wrapper.before(this.draggedItem);
      }
    }
    wrapper.classList.remove('drag-over');
  }

  getSections() {
    const container = document.getElementById('playSections');
    const sections = [];

    container.querySelectorAll('.section-wrapper .section-row').forEach(item => {
      const type = item.dataset.type || 'text';
      const title = item.querySelector('.section-title').value.trim();

      if (type === 'media') {
        const mediaUrl = item.querySelector('.section-media-url')?.value.trim() || '';
        if (title || mediaUrl) {
          sections.push({ type, title, mediaUrl });
        }
      } else if (type === 'fields') {
        const fields = this.getFieldsFromSection(item);
        if (title || fields.length > 0) {
          sections.push({ type, title, fields });
        }
      } else {
        const content = item.querySelector('.section-content')?.value.trim() || '';
        if (title || content) {
          sections.push({ type, title, content });
        }
      }
    });

    return sections;
  }

  async savePlay() {
    const name = document.getElementById('playName').value.trim();
    const cardType = document.getElementById('playType').value;
    const subtitle = document.getElementById('playSubtitle').value.trim();
    let link = document.getElementById('playLink').value.trim();
    const objectType = document.getElementById('playObjectType').value;

    if (!name) {
      alert('Please enter a card name');
      return;
    }

    // Ensure link has https:// prefix if provided
    if (link && !link.startsWith('https://') && !link.startsWith('http://')) {
      link = 'https://' + link;
    }

    const conditions = AdminShared.getConditions('playConditions');
    const sections = this.getSections();
    const logic = AdminShared.getLogic('playLogicToggle');
    const displayOnAll = document.getElementById('playDisplayOnAll').checked;

    // Build play data object (camelCase for local use)
    const playData = {
      name,
      cardType,
      subtitle,
      link,
      objectType,
      conditions,
      logic,
      displayOnAll,
      sections
    };

    try {
      // In web context, save directly to Supabase
      if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
        // Supabase uses snake_case column names
        const supabaseData = {
          name,
          card_type: cardType,
          subtitle,
          link,
          object_type: objectType || null,
          conditions,
          logic,
          display_on_all: displayOnAll,
          sections
        };

        if (this.editingPlayId) {
          // Update existing play
          const { data, error } = await RevGuideDB.updatePlay(this.editingPlayId, supabaseData);
          if (error) throw error;

          // Map response back to camelCase and update local array
          const mappedData = this.mapPlayFromSupabase(data);
          const index = this.battleCards.findIndex(c => c.id === this.editingPlayId);
          if (index !== -1) {
            this.battleCards[index] = mappedData;
          }
        } else {
          // Create new play
          const { data, error } = await RevGuideDB.createPlay(supabaseData);
          if (error) throw error;

          // Map response back to camelCase and add to local array
          const mappedData = this.mapPlayFromSupabase(data);
          this.battleCards.push(mappedData);
        }

        // Clear storage cache so next load gets fresh data
        AdminShared.clearStorageCache();
      } else {
        // Extension context - use local storage
        const card = {
          id: this.editingPlayId || 'card_' + Date.now(),
          ...playData,
          createdAt: Date.now()
        };

        if (this.editingPlayId) {
          const index = this.battleCards.findIndex(c => c.id === this.editingPlayId);
          if (index !== -1) {
            card.createdAt = this.battleCards[index].createdAt;
            card.updatedAt = Date.now();
            this.battleCards[index] = card;
          }
        } else {
          this.battleCards.push(card);
        }

        await AdminShared.saveStorageData({ battleCards: this.battleCards });
      }

      AdminShared.notifyContentScript();
      AdminShared.showToast('Play saved successfully', 'success');
      this.closePlayEditor();
    } catch (error) {
      console.error('Failed to save play:', error);
      AdminShared.showToast(`Failed to save play: ${error.message}`, 'error');
    }
  }

  // Map Supabase snake_case response to camelCase for local use
  mapPlayFromSupabase(data) {
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      cardType: data.card_type,
      subtitle: data.subtitle,
      link: data.link,
      objectType: data.object_type,
      conditions: data.conditions,
      logic: data.logic,
      displayOnAll: data.display_on_all,
      sections: data.sections,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  editPlay(playId) {
    const play = this.battleCards.find(c => c.id === playId);
    if (play) this.openPlayEditor(play);
  }

  async deletePlay(playId) {
    if (confirm('Are you sure you want to delete this play?')) {
      try {
        if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
          const { error } = await RevGuideDB.deletePlay(playId);
          if (error) throw error;
          AdminShared.clearStorageCache();
        } else {
          await AdminShared.saveStorageData({ battleCards: this.battleCards });
        }

        this.battleCards = this.battleCards.filter(c => c.id !== playId);
        this.renderPlays();
        AdminShared.notifyContentScript();
        AdminShared.showToast('Play deleted', 'success');
      } catch (error) {
        console.error('Failed to delete play:', error);
        AdminShared.showToast(`Failed to delete play: ${error.message}`, 'error');
      }
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PlaysPage();
});
