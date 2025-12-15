/**
 * RevGuide - Admin Panel
 * Full-featured UI for managing rules, plays, wiki, and media
 */

class AdminPanel {
  constructor() {
    this.rules = [];
    this.battleCards = [];
    this.presentations = [];
    this.wikiEntries = [];
    this.settings = {};
    this.editingRuleId = null;
    this.editingCardId = null;
    this.editingPresentationId = null;
    this.editingWikiId = null;
    this.editingPropertyValues = [];
    this.propertiesCache = {};
    this.propertyGroupsCache = {};
    this.currentRuleProperties = [];
    this.currentCardProperties = [];
    this.currentPresentationProperties = [];
    this.importFieldsData = [];

    // Wiki two-pane layout state
    this.selectedWikiEntryId = null;
    this.wikiActiveTab = 'content';
    this.isCreatingNewWiki = false;
    this.hasUnsavedWikiChanges = false;

    this.operators = [
      { value: 'equals', label: 'Equals' },
      { value: 'not_equals', label: 'Does not equal' },
      { value: 'contains', label: 'Contains' },
      { value: 'not_contains', label: 'Does not contain' },
      { value: 'starts_with', label: 'Starts with' },
      { value: 'ends_with', label: 'Ends with' },
      { value: 'greater_than', label: 'Greater than' },
      { value: 'less_than', label: 'Less than' },
      { value: 'is_empty', label: 'Is empty' },
      { value: 'is_not_empty', label: 'Is not empty' }
    ];

    this.typeLabels = {
      info: 'Info',
      success: 'Success',
      warning: 'Warning',
      error: 'Error'
    };

    this.typeColors = {
      info: '#3b82f6',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444'
    };

    this.cardTypeIcons = {
      competitor: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>',
      objection: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      tip: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
      process: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>'
    };

    this.cardTypeLabels = {
      competitor: 'Competitor',
      objection: 'Objection',
      tip: 'Tip',
      process: 'Process'
    };

    this.wikiCategoryIcons = {
      general: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
      sales: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      marketing: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
      product: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
      process: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/></svg>',
      field: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>'
    };

    this.wikiCategoryLabels = {
      general: 'General',
      sales: 'Sales',
      marketing: 'Marketing',
      product: 'Product',
      process: 'Process',
      field: 'HubSpot Field'
    };

    this.init();
  }

  async init() {
    await this.loadData();
    this.bindEvents();
    this.renderRules();
    this.renderCards();
    this.renderPresentations();

    // Initialize wiki with first entry selected if available
    if (this.wikiEntries.length > 0) {
      this.selectedWikiEntryId = this.wikiEntries[0].id;
    }
    this.renderWiki();

    this.updateSettingsUI();
    this.updateHomeStats();
    this.updateOnboardingProgress();
  }

  async loadData() {
    return new Promise((resolve) => {
      chrome.storage.local.get({
        rules: [],
        battleCards: [],
        presentations: [],
        wikiEntries: [],
        settings: {
          enabled: true,
          showBanners: true,
          showBattleCards: true,
          showPresentations: true,
          showWiki: true,
          bannerPosition: 'top'
        }
      }, (data) => {
        this.rules = data.rules;
        this.battleCards = data.battleCards;
        this.presentations = data.presentations;
        this.wikiEntries = data.wikiEntries;
        this.settings = data.settings;
        resolve();
      });
    });
  }

  bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchSection(item.dataset.section);
      });
    });

    // Home page onboarding buttons
    document.getElementById('stepInstallBtn').addEventListener('click', () => {
      // Copy install instructions or show share dialog
      const extensionUrl = chrome.runtime.getURL('');
      const shareText = `Install RevGuide to get contextual guidance on HubSpot records:\n\n1. Download the extension files\n2. Go to chrome://extensions/\n3. Enable "Developer mode"\n4. Click "Load unpacked" and select the folder`;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText).then(() => {
          alert('Install instructions copied to clipboard! Share with your team.');
        }).catch(() => {
          prompt('Copy these instructions to share with your team:', shareText);
        });
      } else {
        prompt('Copy these instructions to share with your team:', shareText);
      }
    });
    document.getElementById('stepApiBtn').addEventListener('click', () => this.switchSection('settings'));
    document.getElementById('stepWikiImportBtn').addEventListener('click', () => {
      this.switchSection('wiki');
      this.openImportFieldsModal();
    });
    document.getElementById('stepWikiAddBtn').addEventListener('click', () => {
      this.switchSection('wiki');
      this.openWikiEditor();
    });
    document.getElementById('stepRulesBtn').addEventListener('click', () => {
      this.switchSection('rules');
      this.openRuleEditor();
    });
    document.getElementById('stepCardsBtn').addEventListener('click', () => {
      this.switchSection('cards');
      this.openCardEditor();
    });

    // Add buttons
    document.getElementById('addRuleBtn').addEventListener('click', () => this.openRuleEditor());
    document.getElementById('addCardBtn').addEventListener('click', () => this.openCardEditor());
    document.getElementById('createRuleEmptyBtn').addEventListener('click', () => this.openRuleEditor());
    document.getElementById('createCardEmptyBtn').addEventListener('click', () => this.openCardEditor());

    // Search and filters
    document.getElementById('rulesSearch').addEventListener('input', () => this.renderRules());
    document.getElementById('rulesFilter').addEventListener('change', () => this.renderRules());
    document.getElementById('cardsSearch').addEventListener('input', () => this.renderCards());
    document.getElementById('cardsFilter').addEventListener('change', () => this.renderCards());

    // Rule editor
    document.getElementById('backToRules').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeRuleEditor();
    });
    document.getElementById('cancelRuleBtn').addEventListener('click', () => this.closeRuleEditor());
    document.getElementById('saveRuleBtn').addEventListener('click', () => this.saveRule());
    document.getElementById('ruleObjectType').addEventListener('change', (e) => this.onRuleObjectTypeChange(e.target.value));
    document.getElementById('addRuleConditionBtn').addEventListener('click', () => this.addCondition('ruleConditions', null, this.currentRuleProperties));

    // Rule logic toggle
    document.getElementById('ruleLogicToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.logic-btn');
      if (btn) {
        document.querySelectorAll('#ruleLogicToggle .logic-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });

    // Rule preview updates
    document.getElementById('ruleTitle').addEventListener('input', () => this.updateRulePreview());
    document.getElementById('ruleMessage').addEventListener('input', () => this.updateRulePreview());
    document.getElementById('ruleType').addEventListener('change', () => this.updateRulePreview());

    // Rich text editor toolbar
    this.initRichTextEditor();

    // Display on all records checkboxes
    document.getElementById('ruleDisplayOnAll').addEventListener('change', (e) => {
      this.toggleConditionsWrapper('ruleConditionsWrapper', e.target.checked);
    });
    document.getElementById('cardDisplayOnAll').addEventListener('change', (e) => {
      this.toggleConditionsWrapper('cardConditionsWrapper', e.target.checked);
    });
    document.getElementById('presentationDisplayOnAll').addEventListener('change', (e) => {
      this.toggleConditionsWrapper('presentationConditionsWrapper', e.target.checked);
    });

    // Card editor
    document.getElementById('backToCards').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeCardEditor();
    });
    document.getElementById('cancelCardBtn').addEventListener('click', () => this.closeCardEditor());
    document.getElementById('saveCardBtn').addEventListener('click', () => this.saveCard());
    document.getElementById('cardObjectType').addEventListener('change', (e) => this.onCardObjectTypeChange(e.target.value));
    document.getElementById('addCardConditionBtn').addEventListener('click', () => this.addCondition('cardConditions', null, this.currentCardProperties));
    document.getElementById('addSectionBtn').addEventListener('click', () => this.addSection());

    // Card logic toggle
    document.getElementById('cardLogicToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.logic-btn');
      if (btn) {
        document.querySelectorAll('#cardLogicToggle .logic-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });

    // Presentation buttons
    document.getElementById('addPresentationBtn').addEventListener('click', () => this.openPresentationEditor());
    document.getElementById('createPresentationEmptyBtn').addEventListener('click', () => this.openPresentationEditor());
    document.getElementById('presentationsSearch').addEventListener('input', () => this.renderPresentations());

    // Presentation editor
    document.getElementById('backToPresentations').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePresentationEditor();
    });
    document.getElementById('cancelPresentationBtn').addEventListener('click', () => this.closePresentationEditor());
    document.getElementById('savePresentationBtn').addEventListener('click', () => this.savePresentation());
    document.getElementById('presentationObjectType').addEventListener('change', (e) => this.onPresentationObjectTypeChange(e.target.value));
    document.getElementById('addPresentationConditionBtn').addEventListener('click', () => this.addCondition('presentationConditions', null, this.currentPresentationProperties));
    document.getElementById('presentationUrl').addEventListener('input', () => this.updatePresentationPreview());

    // Presentation logic toggle
    document.getElementById('presentationLogicToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.logic-btn');
      if (btn) {
        document.querySelectorAll('#presentationLogicToggle .logic-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });

    // Wiki - Two-pane layout
    document.getElementById('addWikiBtn').addEventListener('click', () => this.createNewWikiEntry());
    document.getElementById('importFieldsBtnAdmin').addEventListener('click', () => this.openImportFieldsModal());
    document.getElementById('wikiSearch').addEventListener('input', () => this.renderWikiNavTree());
    document.getElementById('wikiFilter').addEventListener('change', () => this.renderWikiNavTree());
    document.getElementById('wikiObjectFilter').addEventListener('change', () => this.renderWikiNavTree());
    document.getElementById('wikiExpandAllBtn').addEventListener('click', () => this.expandAllWikiNodes());
    document.getElementById('wikiCollapseAllBtn').addEventListener('click', () => this.collapseAllWikiNodes());

    // Wiki Card tabs
    document.getElementById('wikiCardTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.wiki-tab');
      if (tab) {
        this.switchWikiTab(tab.dataset.tab);
      }
    });

    // Wiki Card actions
    document.getElementById('wikiStatusToggle').addEventListener('click', () => this.toggleSelectedWikiStatus());
    document.getElementById('duplicateEntryBtn').addEventListener('click', () => this.duplicateWikiEntry());
    document.getElementById('deleteEntryBtn').addEventListener('click', () => this.deleteSelectedWikiEntry());

    // Wiki Card form
    document.getElementById('cancelWikiBtn').addEventListener('click', () => this.cancelWikiEditing());
    document.getElementById('saveWikiBtn').addEventListener('click', () => this.saveWikiEntry());
    document.getElementById('wikiTerm').addEventListener('input', () => {
      this.hasUnsavedWikiChanges = true;
      this.updateWikiPreview();
    });
    document.getElementById('wikiCategory').addEventListener('change', () => {
      this.hasUnsavedWikiChanges = true;
      this.updateWikiPreview();
    });
    document.getElementById('wikiDefinition').addEventListener('input', () => {
      this.hasUnsavedWikiChanges = true;
      this.updateWikiPreview();
    });
    document.getElementById('addPropertyValueBtn').addEventListener('click', () => this.addPropertyValue());

    // Wiki Object Type change - load property groups
    document.getElementById('wikiObjectType').addEventListener('change', (e) => {
      this.hasUnsavedWikiChanges = true;
      this.loadWikiPropertyGroups(e.target.value);
    });

    // Mark unsaved changes for other form fields
    ['wikiAliases', 'wikiLink', 'wikiPropertyGroup', 'wikiMatchType', 'wikiFrequency',
     'wikiIncludeAliases', 'wikiPriority', 'wikiPageType', 'wikiUrlPatterns'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => { this.hasUnsavedWikiChanges = true; });
        el.addEventListener('input', () => { this.hasUnsavedWikiChanges = true; });
      }
    });

    // Wiki rich text editor
    this.initWikiRichTextEditor();

    // Import fields modal (admin)
    document.getElementById('closeImportFieldsModalAdmin').addEventListener('click', () => this.closeImportFieldsModal());
    document.getElementById('cancelImportFieldsBtnAdmin').addEventListener('click', () => this.closeImportFieldsModal());
    document.getElementById('confirmImportFieldsBtnAdmin').addEventListener('click', () => this.importSelectedFields());
    document.getElementById('importObjectTypeAdmin').addEventListener('change', (e) => this.loadFieldsForImport(e.target.value));
    document.getElementById('selectAllFieldsAdmin').addEventListener('change', (e) => this.toggleAllFields(e.target.checked));
    document.getElementById('fieldsSearchAdmin').addEventListener('input', (e) => this.filterFieldsList(e.target.value));

    // Settings
    document.getElementById('saveApiBtn').addEventListener('click', () => this.saveApiToken());
    document.getElementById('testApiBtn').addEventListener('click', () => this.testApiConnection());
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
    document.getElementById('bannerPosition').addEventListener('change', (e) => {
      this.settings.bannerPosition = e.target.value;
      this.saveSettings();
    });

    // Import/Export
    document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', (e) => this.importData(e));
  }

  switchSection(section) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(sec => {
      sec.classList.remove('active');
    });

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.section === section);
    });

    // Show the right section
    document.getElementById(section + 'Section').classList.add('active');
  }

  // ============ HOME / ONBOARDING ============

  updateHomeStats() {
    document.getElementById('homeWikiCount').textContent = this.wikiEntries.length;
    document.getElementById('homeRulesCount').textContent = this.rules.length;
    document.getElementById('homeCardsCount').textContent = this.battleCards.length;
    document.getElementById('homePresentationsCount').textContent = this.presentations.length;
  }

  updateOnboardingProgress() {
    let completed = 1; // Install step is always completed
    const totalSteps = 5; // Install, API, Wiki, Rules, Cards (Team is coming soon)

    // Install step is always completed (they're viewing the admin panel)
    this.updateStepStatus('stepInstall', 'stepInstallStatus', true);

    // Check API connection
    const hasApi = this.settings.hubspotApiToken && this.settings.hubspotApiToken.trim();
    this.updateStepStatus('stepApi', 'stepApiStatus', hasApi);
    if (hasApi) completed++;

    // Check Wiki entries
    const hasWiki = this.wikiEntries.length > 0;
    this.updateStepStatus('stepWiki', 'stepWikiStatus', hasWiki);
    if (hasWiki) completed++;

    // Check Rules
    const hasRules = this.rules.length > 0;
    this.updateStepStatus('stepRules', 'stepRulesStatus', hasRules);
    if (hasRules) completed++;

    // Check Plays
    const hasCards = this.battleCards.length > 0;
    this.updateStepStatus('stepCards', 'stepCardsStatus', hasCards);
    if (hasCards) completed++;

    // Update progress bar
    const percentage = (completed / totalSteps) * 100;
    document.getElementById('onboardingProgressFill').style.width = percentage + '%';
    document.getElementById('onboardingProgressText').textContent = completed;
  }

  updateStepStatus(stepId, statusId, isCompleted) {
    const step = document.getElementById(stepId);
    const status = document.getElementById(statusId);

    if (isCompleted) {
      step.classList.add('completed');
      status.textContent = 'Completed';
      status.classList.add('completed');
    } else {
      step.classList.remove('completed');
      status.textContent = 'Not started';
      status.classList.remove('completed');
    }
  }

  // ============ RULES ============

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
            <span class="type-badge" style="background: ${this.typeColors[rule.type] || this.typeColors.info}"></span>
          </td>
          <td><strong>${this.escapeHtml(rule.name)}</strong></td>
          <td>${this.escapeHtml(rule.title || '-')}</td>
          <td>${this.typeLabels[rule.type] || rule.type}</td>
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

    // Bind edit buttons
    tbody.querySelectorAll('.edit-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => this.editRule(btn.dataset.id));
    });

    // Bind delete buttons
    tbody.querySelectorAll('.delete-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteRule(btn.dataset.id));
    });

    // Bind toggle checkboxes
    tbody.querySelectorAll('.toggle-rule').forEach(checkbox => {
      checkbox.addEventListener('change', () => this.toggleRule(checkbox.dataset.id));
    });
  }

  openRuleEditor(rule = null) {
    this.editingRuleId = rule?.id || null;
    document.getElementById('ruleEditorTitle').textContent = rule ? 'Edit Rule' : 'Add Rule';

    // Reset form
    document.getElementById('ruleName').value = rule?.name || '';
    document.getElementById('ruleTitle').value = rule?.title || '';
    document.getElementById('ruleMessage').innerHTML = rule?.message || '';
    document.getElementById('ruleType').value = rule?.type || 'info';
    document.getElementById('rulePriority').value = rule?.priority || 10;

    const objectType = rule?.objectTypes?.[0] || rule?.objectType || '';
    const objectTypeMap = { contact: 'contacts', company: 'companies', deal: 'deals', ticket: 'tickets' };
    const mappedType = objectTypeMap[objectType] || objectType;
    document.getElementById('ruleObjectType').value = mappedType;

    this.currentRuleProperties = [];
    document.getElementById('ruleConditions').innerHTML = '';
    document.getElementById('addRuleConditionBtn').disabled = true;
    document.getElementById('ruleConditionStatus').textContent = '';

    // Set display on all checkbox and toggle conditions wrapper
    const displayOnAll = rule?.displayOnAll || false;
    document.getElementById('ruleDisplayOnAll').checked = displayOnAll;
    this.toggleConditionsWrapper('ruleConditionsWrapper', displayOnAll);

    if (mappedType && rule?.conditions?.length) {
      this.loadPropertiesAndConditions('rule', mappedType, rule.conditions);
    } else if (mappedType) {
      this.onRuleObjectTypeChange(mappedType);
    }

    // Set logic toggle
    this.setLogic('ruleLogicToggle', rule?.logic || 'AND');

    this.updateRulePreview();

    // Show editor section
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('ruleEditorSection').classList.add('active');
  }

  closeRuleEditor() {
    this.editingRuleId = null;
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('rulesSection').classList.add('active');
  }

  updateRulePreview() {
    const title = document.getElementById('ruleTitle').value || 'Banner Title';
    const messageEl = document.getElementById('ruleMessage');
    const message = messageEl.innerHTML || 'Your message will appear here';
    const type = document.getElementById('ruleType').value;

    const preview = document.getElementById('rulePreview');
    preview.innerHTML = `
      <div class="preview-banner ${type}">
        <strong>${this.escapeHtml(title)}</strong>
        <div class="preview-message">${message}</div>
      </div>
    `;
  }

  async saveRule() {
    const name = document.getElementById('ruleName').value.trim();
    const title = document.getElementById('ruleTitle').value.trim();
    const message = document.getElementById('ruleMessage').innerHTML.trim();
    const type = document.getElementById('ruleType').value;
    const priority = parseInt(document.getElementById('rulePriority').value) || 10;
    const objectTypeValue = document.getElementById('ruleObjectType').value;

    if (!name) {
      alert('Please enter a rule name');
      return;
    }

    if (!objectTypeValue) {
      alert('Please select an object type');
      return;
    }

    const objectTypeReverseMap = { contacts: 'contact', companies: 'company', deals: 'deal', tickets: 'ticket' };
    const objectTypes = [objectTypeReverseMap[objectTypeValue] || objectTypeValue];
    const conditions = this.getConditions('ruleConditions');
    const logic = this.getLogic('ruleLogicToggle');
    const displayOnAll = document.getElementById('ruleDisplayOnAll').checked;

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
      enabled: true,
      createdAt: Date.now()
    };

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

    await this.saveRules();
    this.renderRules();
    this.closeRuleEditor();
    this.updateHomeStats();
    this.updateOnboardingProgress();
    this.notifyContentScript();
  }

  editRule(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) this.openRuleEditor(rule);
  }

  async toggleRule(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = rule.enabled === false ? true : false;
      await this.saveRules();
      this.renderRules();
      this.notifyContentScript();
    }
  }

  async deleteRule(ruleId) {
    if (confirm('Are you sure you want to delete this rule?')) {
      this.rules = this.rules.filter(r => r.id !== ruleId);
      await this.saveRules();
      this.renderRules();
      this.updateHomeStats();
      this.updateOnboardingProgress();
      this.notifyContentScript();
    }
  }

  async saveRules() {
    return new Promise(resolve => {
      chrome.storage.local.set({ rules: this.rules }, resolve);
    });
  }

  // ============ CARDS ============

  renderCards() {
    const search = document.getElementById('cardsSearch').value.toLowerCase();
    const filter = document.getElementById('cardsFilter').value;
    const grid = document.getElementById('cardsGrid');
    const emptyState = document.getElementById('cardsEmptyState');

    let filtered = this.battleCards.filter(card => {
      if (search && !card.name.toLowerCase().includes(search) && !card.subtitle?.toLowerCase().includes(search)) {
        return false;
      }
      if (filter !== 'all' && card.cardType !== filter) {
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = filtered.map(card => {
      const icon = this.cardTypeIcons[card.cardType] || '📄';
      const typeLabel = this.cardTypeLabels[card.cardType] || card.cardType;
      const sectionCount = card.sections?.length || 0;
      const conditionCount = card.conditions?.length || 0;

      return `
        <div class="card-item" data-id="${card.id}">
          <div class="card-header">
            <span class="card-icon">${icon}</span>
            <span class="card-type-label">${typeLabel}</span>
          </div>
          <h3 class="card-title">${this.escapeHtml(card.name)}</h3>
          <p class="card-subtitle">${this.escapeHtml(card.subtitle || '')}</p>
          <div class="card-meta">
            <span>${sectionCount} section${sectionCount !== 1 ? 's' : ''}</span>
            <span>${conditionCount} condition${conditionCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm edit-card-btn" data-id="${card.id}">Edit</button>
            <button class="btn btn-danger btn-sm delete-card-btn" data-id="${card.id}">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind edit buttons
    grid.querySelectorAll('.edit-card-btn').forEach(btn => {
      btn.addEventListener('click', () => this.editCard(btn.dataset.id));
    });

    // Bind delete buttons
    grid.querySelectorAll('.delete-card-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteCard(btn.dataset.id));
    });
  }

  openCardEditor(card = null) {
    this.editingCardId = card?.id || null;
    document.getElementById('cardEditorTitle').textContent = card ? 'Edit Play' : 'Add Play';

    document.getElementById('cardName').value = card?.name || '';
    document.getElementById('cardType').value = card?.cardType || 'competitor';
    document.getElementById('cardSubtitle').value = card?.subtitle || '';
    document.getElementById('cardLink').value = card?.link || '';
    document.getElementById('cardObjectType').value = card?.objectType || '';

    this.currentCardProperties = [];
    document.getElementById('cardConditions').innerHTML = '';
    document.getElementById('addCardConditionBtn').disabled = !card?.objectType;
    document.getElementById('cardConditionStatus').textContent = '';

    // Set display on all checkbox and toggle conditions wrapper
    const displayOnAll = card?.displayOnAll || false;
    document.getElementById('cardDisplayOnAll').checked = displayOnAll;
    this.toggleConditionsWrapper('cardConditionsWrapper', displayOnAll);

    const sectionsContainer = document.getElementById('cardSections');
    sectionsContainer.innerHTML = '';
    if (card?.sections?.length) {
      card.sections.forEach(s => this.addSection(s));
    }

    if (card?.objectType && card?.conditions?.length) {
      this.loadPropertiesAndConditions('card', card.objectType, card.conditions);
    } else if (card?.objectType) {
      this.onCardObjectTypeChange(card.objectType);
    }

    // Set logic toggle
    this.setLogic('cardLogicToggle', card?.logic || 'AND');

    // Show editor section
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('cardEditorSection').classList.add('active');
  }

  closeCardEditor() {
    this.editingCardId = null;
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('cardsSection').classList.add('active');
  }

  async saveCard() {
    const name = document.getElementById('cardName').value.trim();
    const cardType = document.getElementById('cardType').value;
    const subtitle = document.getElementById('cardSubtitle').value.trim();
    let link = document.getElementById('cardLink').value.trim();
    const objectType = document.getElementById('cardObjectType').value;

    if (!name) {
      alert('Please enter a card name');
      return;
    }

    // Ensure link has https:// prefix if provided
    if (link && !link.startsWith('https://') && !link.startsWith('http://')) {
      link = 'https://' + link;
    }

    const conditions = this.getConditions('cardConditions');
    const sections = this.getSections();
    const logic = this.getLogic('cardLogicToggle');
    const displayOnAll = document.getElementById('cardDisplayOnAll').checked;

    const card = {
      id: this.editingCardId || 'card_' + Date.now(),
      name,
      cardType,
      subtitle,
      link,
      objectType,
      conditions,
      logic,
      displayOnAll,
      sections,
      createdAt: Date.now()
    };

    if (this.editingCardId) {
      const index = this.battleCards.findIndex(c => c.id === this.editingCardId);
      if (index !== -1) {
        card.createdAt = this.battleCards[index].createdAt;
        card.updatedAt = Date.now();
        this.battleCards[index] = card;
      }
    } else {
      this.battleCards.push(card);
    }

    await this.saveBattleCards();
    this.renderCards();
    this.closeCardEditor();
    this.updateHomeStats();
    this.updateOnboardingProgress();
    this.notifyContentScript();
  }

  editCard(cardId) {
    const card = this.battleCards.find(c => c.id === cardId);
    if (card) this.openCardEditor(card);
  }

  async deleteCard(cardId) {
    if (confirm('Are you sure you want to delete this play?')) {
      this.battleCards = this.battleCards.filter(c => c.id !== cardId);
      await this.saveBattleCards();
      this.renderCards();
      this.updateHomeStats();
      this.updateOnboardingProgress();
      this.notifyContentScript();
    }
  }

  async saveBattleCards() {
    return new Promise(resolve => {
      chrome.storage.local.set({ battleCards: this.battleCards }, resolve);
    });
  }

  // ============ PRESENTATIONS ============

  renderPresentations() {
    const search = document.getElementById('presentationsSearch').value.toLowerCase();
    const grid = document.getElementById('presentationsGrid');
    const emptyState = document.getElementById('presentationsEmptyState');

    let filtered = this.presentations.filter(pres => {
      if (search && !pres.name.toLowerCase().includes(search) && !pres.description?.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = filtered.map(pres => {
      const conditionCount = pres.conditions?.length || 0;

      return `
        <div class="card-item presentation-card" data-id="${pres.id}">
          <div class="card-header">
            <span class="card-icon"><span class="icon icon-presentation"></span></span>
            <span class="card-type-label">Media</span>
          </div>
          <h3 class="card-title">${this.escapeHtml(pres.name)}</h3>
          <p class="card-subtitle">${this.escapeHtml(pres.description || '')}</p>
          <div class="card-meta">
            <span>${conditionCount} condition${conditionCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm edit-presentation-btn" data-id="${pres.id}">Edit</button>
            <button class="btn btn-danger btn-sm delete-presentation-btn" data-id="${pres.id}">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind edit buttons
    grid.querySelectorAll('.edit-presentation-btn').forEach(btn => {
      btn.addEventListener('click', () => this.editPresentation(btn.dataset.id));
    });

    // Bind delete buttons
    grid.querySelectorAll('.delete-presentation-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deletePresentation(btn.dataset.id));
    });
  }

  openPresentationEditor(presentation = null) {
    this.editingPresentationId = presentation?.id || null;
    document.getElementById('presentationEditorTitle').textContent = presentation ? 'Edit Media' : 'Add Media';

    document.getElementById('presentationName').value = presentation?.name || '';
    document.getElementById('presentationDescription').value = presentation?.description || '';
    document.getElementById('presentationUrl').value = presentation?.url || '';
    document.getElementById('presentationObjectType').value = presentation?.objectType || '';

    this.currentPresentationProperties = [];
    document.getElementById('presentationConditions').innerHTML = '';
    document.getElementById('addPresentationConditionBtn').disabled = !presentation?.objectType;
    document.getElementById('presentationConditionStatus').textContent = '';

    // Set display on all checkbox and toggle conditions wrapper
    const displayOnAll = presentation?.displayOnAll || false;
    document.getElementById('presentationDisplayOnAll').checked = displayOnAll;
    this.toggleConditionsWrapper('presentationConditionsWrapper', displayOnAll);

    if (presentation?.objectType && presentation?.conditions?.length) {
      this.loadPropertiesAndConditions('presentation', presentation.objectType, presentation.conditions);
    } else if (presentation?.objectType) {
      this.onPresentationObjectTypeChange(presentation.objectType);
    }

    // Set logic toggle
    this.setLogic('presentationLogicToggle', presentation?.logic || 'AND');

    this.updatePresentationPreview();

    // Show editor section
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('presentationEditorSection').classList.add('active');
  }

  closePresentationEditor() {
    this.editingPresentationId = null;
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('presentationsSection').classList.add('active');
  }

  updatePresentationPreview() {
    const url = document.getElementById('presentationUrl').value.trim();
    const preview = document.getElementById('presentationPreview');

    const embedUrl = this.convertToEmbedUrl(url);

    if (embedUrl) {
      preview.innerHTML = `
        <iframe
          src="${embedUrl}"
          frameborder="0"
          allowfullscreen="true"
          mozallowfullscreen="true"
          webkitallowfullscreen="true"
          style="width: 100%; height: 180px; border-radius: 8px;">
        </iframe>
      `;
    } else {
      preview.innerHTML = `
        <div class="preview-placeholder">
          <span class="icon icon-presentation icon--2xl"></span>
          <p>Enter a URL to preview</p>
        </div>
      `;
    }
  }

  convertToEmbedUrl(url) {
    if (!url) return null;

    // Handle Google Slides URLs
    // Format: https://docs.google.com/presentation/d/PRESENTATION_ID/edit
    // Embed:  https://docs.google.com/presentation/d/PRESENTATION_ID/embed
    const googleSlidesMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    if (googleSlidesMatch) {
      return `https://docs.google.com/presentation/d/${googleSlidesMatch[1]}/embed?start=false&loop=false&delayms=3000`;
    }

    // Handle YouTube URLs
    // Formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
    const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }

    // Handle Loom URLs
    // Format: loom.com/share/VIDEO_ID
    const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
    if (loomMatch) {
      return `https://www.loom.com/embed/${loomMatch[1]}`;
    }

    // Handle Vimeo URLs
    // Formats: vimeo.com/VIDEO_ID, player.vimeo.com/video/VIDEO_ID
    const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    // Handle OneDrive/SharePoint URLs
    // Personal OneDrive: https://onedrive.live.com/... or https://1drv.ms/p/...
    // SharePoint: https://company.sharepoint.com/:p:/...
    // SharePoint embed: https://company.sharepoint.com/:p:/g/personal/...?e=...
    if (url.includes('onedrive.live.com') || url.includes('1drv.ms')) {
      // For OneDrive personal, convert to embed format
      if (url.includes('/embed')) {
        return url;
      }
      // Try to extract resid and authkey for embed
      const residMatch = url.match(/resid=([^&]+)/);
      const authkeyMatch = url.match(/authkey=([^&]+)/);
      if (residMatch) {
        let embedUrl = `https://onedrive.live.com/embed?resid=${residMatch[1]}`;
        if (authkeyMatch) {
          embedUrl += `&authkey=${authkeyMatch[1]}`;
        }
        embedUrl += '&em=2';
        return embedUrl;
      }
      // If it's a sharing link, return it with action=embedview
      if (url.includes('1drv.ms')) {
        return url; // Short links work directly in iframes for public files
      }
    }

    // Handle SharePoint URLs
    if (url.includes('.sharepoint.com')) {
      // SharePoint URLs with :p: are PowerPoint files
      // Convert viewing URL to embed by adding action=embedview
      if (url.includes('/embed') || url.includes('action=embedview')) {
        return url;
      }
      // Add embed action parameter
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}action=embedview`;
    }

    // Handle Microsoft Office Online embed URLs
    if (url.includes('office.com') || url.includes('officeapps.live.com')) {
      return url;
    }

    // If already an embed URL, return as-is
    if (url.includes('/embed') || url.includes('action=embedview')) {
      return url;
    }

    // For any other URL, try using it directly (user might paste an embed code URL)
    if (url.startsWith('https://')) {
      return url;
    }

    return null;
  }

  detectMediaType(url) {
    if (!url) return 'unknown';
    if (url.includes('docs.google.com/presentation')) return 'google';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('loom.com')) return 'loom';
    if (url.includes('vimeo.com')) return 'vimeo';
    if (url.includes('onedrive.live.com') || url.includes('1drv.ms')) return 'onedrive';
    if (url.includes('.sharepoint.com')) return 'sharepoint';
    if (url.includes('office.com') || url.includes('officeapps.live.com')) return 'office365';
    return 'other';
  }

  async savePresentation() {
    const name = document.getElementById('presentationName').value.trim();
    const description = document.getElementById('presentationDescription').value.trim();
    let url = document.getElementById('presentationUrl').value.trim();
    const objectType = document.getElementById('presentationObjectType').value;

    if (!name) {
      alert('Please enter a name');
      return;
    }

    if (!url) {
      alert('Please enter a URL');
      return;
    }

    // Ensure URL has https:// prefix
    if (url && !url.startsWith('https://') && !url.startsWith('http://')) {
      url = 'https://' + url;
    }

    const embedUrl = this.convertToEmbedUrl(url);
    if (!embedUrl) {
      alert('Please enter a valid embed URL (Google Slides, YouTube, Loom, Vimeo, OneDrive, or SharePoint)');
      return;
    }

    const conditions = this.getConditions('presentationConditions');
    const logic = this.getLogic('presentationLogicToggle');
    const displayOnAll = document.getElementById('presentationDisplayOnAll').checked;

    const presentation = {
      id: this.editingPresentationId || 'pres_' + Date.now(),
      name,
      description,
      url,
      embedUrl,
      objectType,
      conditions,
      logic,
      displayOnAll,
      createdAt: Date.now()
    };

    if (this.editingPresentationId) {
      const index = this.presentations.findIndex(p => p.id === this.editingPresentationId);
      if (index !== -1) {
        presentation.createdAt = this.presentations[index].createdAt;
        presentation.updatedAt = Date.now();
        this.presentations[index] = presentation;
      }
    } else {
      this.presentations.push(presentation);
    }

    await this.savePresentations();
    this.renderPresentations();
    this.closePresentationEditor();
    this.updateHomeStats();
    this.updateOnboardingProgress();
    this.notifyContentScript();
  }

  editPresentation(presentationId) {
    const presentation = this.presentations.find(p => p.id === presentationId);
    if (presentation) this.openPresentationEditor(presentation);
  }

  async deletePresentation(presentationId) {
    if (confirm('Are you sure you want to delete this media?')) {
      this.presentations = this.presentations.filter(p => p.id !== presentationId);
      await this.savePresentations();
      this.renderPresentations();
      this.updateHomeStats();
      this.notifyContentScript();
    }
  }

  async savePresentations() {
    return new Promise(resolve => {
      chrome.storage.local.set({ presentations: this.presentations }, resolve);
    });
  }

  async onPresentationObjectTypeChange(objectType) {
    const statusEl = document.getElementById('presentationConditionStatus');
    const addBtn = document.getElementById('addPresentationConditionBtn');
    const container = document.getElementById('presentationConditions');

    if (!objectType) {
      this.currentPresentationProperties = [];
      addBtn.disabled = true;
      statusEl.textContent = '';
      return;
    }

    statusEl.textContent = 'Loading properties...';
    statusEl.className = 'status-text';
    addBtn.disabled = true;

    try {
      const properties = await this.fetchProperties(objectType);
      this.currentPresentationProperties = properties;
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

  // ============ CONDITIONS ============

  addCondition(containerId, condition = null, properties = []) {
    const container = document.getElementById(containerId);
    const div = document.createElement('div');
    div.className = 'condition-row';

    const selectedProp = condition?.property ? properties.find(p => p.name === condition.property) : null;
    const selectedLabel = selectedProp ? selectedProp.label : 'Select property...';

    div.innerHTML = `
      <div class="searchable-select" data-properties='${JSON.stringify(properties.map(p => ({name: p.name, label: p.label, type: p.type})))}'>
        <button type="button" class="searchable-select-trigger" data-value="${condition?.property || ''}">
          <span class="select-label">${this.escapeHtml(selectedLabel)}</span>
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
              <div class="searchable-select-option ${condition?.property === p.name ? 'selected' : ''}" data-value="${p.name}" data-label="${this.escapeHtml(p.label)}">
                <span class="option-label">${this.escapeHtml(p.label)}</span>
                <span class="option-name">${p.name}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <select class="condition-operator">
        ${this.operators.map(op => `
          <option value="${op.value}" ${condition?.operator === op.value ? 'selected' : ''}>${op.label}</option>
        `).join('')}
      </select>
      <input type="text" class="condition-value" placeholder="Value" value="${this.escapeHtml(condition?.value || '')}">
      <button class="btn-icon btn-icon-danger remove-condition-btn" title="Remove">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    // Set up searchable select
    this.initSearchableSelect(div.querySelector('.searchable-select'), properties);

    const removeBtn = div.querySelector('.remove-condition-btn');
    removeBtn.addEventListener('click', () => div.remove());

    const operatorSelect = div.querySelector('.condition-operator');
    const valueInput = div.querySelector('.condition-value');

    const updateValueVisibility = () => {
      const op = operatorSelect.value;
      valueInput.style.display = (op === 'is_empty' || op === 'is_not_empty') ? 'none' : 'block';
    };

    operatorSelect.addEventListener('change', updateValueVisibility);
    updateValueVisibility();

    container.appendChild(div);

    // If editing, set value after appending
    if (condition?.value) {
      setTimeout(() => {
        const valInput = div.querySelector('.condition-value');
        if (valInput) valInput.value = condition.value;
      }, 0);
    }
  }

  initSearchableSelect(selectEl, properties) {
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
        this.filterSearchableOptions(optionsContainer, '');
        searchInput.focus();
      }
    });

    // Search filter
    searchInput.addEventListener('input', () => {
      this.filterSearchableOptions(optionsContainer, searchInput.value);
    });

    // Option selection
    optionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.searchable-select-option');
      if (option) {
        const value = option.dataset.value;
        const label = option.dataset.label;

        trigger.dataset.value = value;
        labelSpan.textContent = label;

        // Update selected state
        optionsContainer.querySelectorAll('.searchable-select-option').forEach(opt => {
          opt.classList.toggle('selected', opt.dataset.value === value);
        });

        selectEl.classList.remove('open');

        // Check if property has options for value field
        const selectedProp = properties.find(p => p.name === value);
        const conditionRow = selectEl.closest('.condition-row');
        const valueInput = conditionRow.querySelector('.condition-value');

        if (selectedProp?.options?.length > 0) {
          const newValueInput = document.createElement('select');
          newValueInput.className = 'condition-value';
          newValueInput.innerHTML = `<option value="">Select value...</option>` +
            selectedProp.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
          valueInput.replaceWith(newValueInput);
        } else if (valueInput.tagName === 'SELECT') {
          const newValueInput = document.createElement('input');
          newValueInput.type = 'text';
          newValueInput.className = 'condition-value';
          newValueInput.placeholder = 'Value';
          valueInput.replaceWith(newValueInput);
        }
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

  filterSearchableOptions(container, query) {
    const normalizedQuery = query.toLowerCase().trim();
    container.querySelectorAll('.searchable-select-option').forEach(option => {
      const label = option.dataset.label.toLowerCase();
      const value = option.dataset.value.toLowerCase();
      const matches = !normalizedQuery || label.includes(normalizedQuery) || value.includes(normalizedQuery);
      option.style.display = matches ? 'flex' : 'none';
    });
  }

  getConditions(containerId) {
    const container = document.getElementById(containerId);
    const conditions = [];

    container.querySelectorAll('.condition-row').forEach(item => {
      const trigger = item.querySelector('.searchable-select-trigger');
      const property = trigger ? trigger.dataset.value : '';
      const operator = item.querySelector('.condition-operator').value;
      const valueEl = item.querySelector('.condition-value');
      const value = valueEl?.value?.trim() || '';

      if (property) {
        conditions.push({ property, operator, value });
      }
    });

    return conditions;
  }

  getLogic(toggleId) {
    const toggle = document.getElementById(toggleId);
    const activeBtn = toggle.querySelector('.logic-btn.active');
    return activeBtn ? activeBtn.dataset.value : 'AND';
  }

  setLogic(toggleId, value) {
    const toggle = document.getElementById(toggleId);
    toggle.querySelectorAll('.logic-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }

  // ============ SECTIONS ============

  addSection(section = null) {
    const container = document.getElementById('cardSections');
    const div = document.createElement('div');
    div.className = 'section-row';

    div.innerHTML = `
      <div class="section-header-row">
        <input type="text" class="section-title" placeholder="Section Title (e.g., Key Points)" value="${this.escapeHtml(section?.title || '')}">
        <button class="btn-icon btn-icon-danger remove-section-btn" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <textarea class="section-content" rows="4" placeholder="Section content (use - for bullet points)">${this.escapeHtml(section?.content || '')}</textarea>
    `;

    const removeBtn = div.querySelector('.remove-section-btn');
    removeBtn.addEventListener('click', () => div.remove());

    container.appendChild(div);
  }

  getSections() {
    const container = document.getElementById('cardSections');
    const sections = [];

    container.querySelectorAll('.section-row').forEach(item => {
      const title = item.querySelector('.section-title').value.trim();
      const content = item.querySelector('.section-content').value.trim();

      if (title || content) {
        sections.push({ title, content });
      }
    });

    return sections;
  }

  // ============ PROPERTIES ============

  async fetchProperties(objectType) {
    if (this.propertiesCache[objectType]) {
      return this.propertiesCache[objectType];
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'fetchObjectProperties', objectType },
        (response) => {
          if (response?.success) {
            this.propertiesCache[objectType] = response.data;
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Failed to fetch properties'));
          }
        }
      );
    });
  }

  async onRuleObjectTypeChange(objectType) {
    const statusEl = document.getElementById('ruleConditionStatus');
    const addBtn = document.getElementById('addRuleConditionBtn');
    const container = document.getElementById('ruleConditions');

    if (!objectType) {
      this.currentRuleProperties = [];
      addBtn.disabled = true;
      statusEl.textContent = '';
      return;
    }

    statusEl.textContent = 'Loading properties...';
    statusEl.className = 'status-text';
    addBtn.disabled = true;

    try {
      const properties = await this.fetchProperties(objectType);
      this.currentRuleProperties = properties;
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

  async onCardObjectTypeChange(objectType) {
    const statusEl = document.getElementById('cardConditionStatus');
    const addBtn = document.getElementById('addCardConditionBtn');
    const container = document.getElementById('cardConditions');

    if (!objectType) {
      this.currentCardProperties = [];
      addBtn.disabled = true;
      statusEl.textContent = '';
      return;
    }

    statusEl.textContent = 'Loading properties...';
    statusEl.className = 'status-text';
    addBtn.disabled = true;

    try {
      const properties = await this.fetchProperties(objectType);
      this.currentCardProperties = properties;
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

  async loadPropertiesAndConditions(type, objectType, conditions) {
    const elementMap = {
      rule: { status: 'ruleConditionStatus', btn: 'addRuleConditionBtn', container: 'ruleConditions' },
      card: { status: 'cardConditionStatus', btn: 'addCardConditionBtn', container: 'cardConditions' },
      presentation: { status: 'presentationConditionStatus', btn: 'addPresentationConditionBtn', container: 'presentationConditions' }
    };

    const elements = elementMap[type] || elementMap.card;
    const statusEl = document.getElementById(elements.status);
    const addBtn = document.getElementById(elements.btn);
    const containerId = elements.container;

    statusEl.textContent = 'Loading properties...';
    statusEl.className = 'status-text';

    try {
      const properties = await this.fetchProperties(objectType);

      if (type === 'rule') {
        this.currentRuleProperties = properties;
      } else if (type === 'presentation') {
        this.currentPresentationProperties = properties;
      } else {
        this.currentCardProperties = properties;
      }

      addBtn.disabled = false;
      statusEl.textContent = '';

      conditions.forEach(c => this.addCondition(containerId, c, properties));
    } catch (err) {
      statusEl.textContent = 'Error loading properties';
      statusEl.className = 'status-text error';
      conditions.forEach(c => this.addCondition(containerId, c, []));
    }
  }

  // ============ SETTINGS ============

  updateSettingsUI() {
    document.getElementById('apiToken').value = this.settings.hubspotApiToken || '';
    document.getElementById('showBanners').checked = this.settings.showBanners !== false;
    document.getElementById('showBattleCards').checked = this.settings.showBattleCards !== false;
    document.getElementById('showPresentations').checked = this.settings.showPresentations !== false;
    document.getElementById('bannerPosition').value = this.settings.bannerPosition || 'top';
  }

  async saveSettings() {
    return new Promise(resolve => {
      chrome.storage.local.set({ settings: this.settings }, resolve);
    });
  }

  async saveApiToken() {
    const token = document.getElementById('apiToken').value.trim();
    this.settings.hubspotApiToken = token;
    await this.saveSettings();

    const status = document.getElementById('apiStatus');
    status.textContent = token ? 'Token saved!' : 'Token cleared';
    status.className = 'status-message success';
    setTimeout(() => { status.textContent = ''; }, 3000);

    this.propertiesCache = {};
    this.updateOnboardingProgress();
  }

  async testApiConnection() {
    const token = document.getElementById('apiToken').value.trim();
    const status = document.getElementById('apiStatus');

    if (!token) {
      status.textContent = 'Please enter a token first';
      status.className = 'status-message error';
      return;
    }

    status.textContent = 'Testing connection...';
    status.className = 'status-message';

    try {
      this.settings.hubspotApiToken = token;
      await this.saveSettings();
      await this.fetchProperties('deals');
      status.textContent = 'Connection successful!';
      status.className = 'status-message success';
    } catch (err) {
      status.textContent = 'Connection failed: ' + err.message;
      status.className = 'status-message error';
    }
  }

  // ============ IMPORT/EXPORT ============

  exportData() {
    const data = {
      rules: this.rules,
      battleCards: this.battleCards,
      presentations: this.presentations,
      settings: this.settings,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revguide-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.rules) this.rules = data.rules;
      if (data.battleCards) this.battleCards = data.battleCards;
      if (data.presentations) this.presentations = data.presentations;
      if (data.settings) this.settings = { ...this.settings, ...data.settings };

      await Promise.all([
        this.saveRules(),
        this.saveBattleCards(),
        this.savePresentations(),
        this.saveSettings()
      ]);

      this.renderRules();
      this.renderCards();
      this.renderPresentations();
      this.updateSettingsUI();
      this.updateHomeStats();
      this.updateOnboardingProgress();
      this.notifyContentScript();

      alert('Data imported successfully!');
    } catch (e) {
      alert('Failed to import data. Please check the file format.');
    }

    event.target.value = '';
  }

  // ============ UTILITIES ============

  notifyContentScript() {
    chrome.runtime.sendMessage({ action: 'refreshUI' });
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============ DISPLAY ON ALL ============

  toggleConditionsWrapper(wrapperId, disabled) {
    const wrapper = document.getElementById(wrapperId);
    if (wrapper) {
      if (disabled) {
        wrapper.classList.add('conditions-wrapper-disabled');
      } else {
        wrapper.classList.remove('conditions-wrapper-disabled');
      }
    }
  }

  // ============ RICH TEXT EDITOR ============

  initRichTextEditor() {
    const toolbar = document.querySelector('.rich-text-toolbar');
    if (!toolbar) return;

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;

      e.preventDefault();
      const command = btn.dataset.command;

      if (command === 'createLink') {
        const url = prompt('Enter URL:', 'https://');
        if (url) {
          document.execCommand(command, false, url);
        }
      } else {
        document.execCommand(command, false, null);
      }

      // Update preview after formatting change
      this.updateRulePreview();

      // Update active states
      this.updateToolbarState();
    });

    // Update toolbar state on selection change
    const messageEl = document.getElementById('ruleMessage');
    if (messageEl) {
      messageEl.addEventListener('keyup', () => this.updateToolbarState());
      messageEl.addEventListener('mouseup', () => this.updateToolbarState());
    }
  }

  updateToolbarState() {
    const toolbar = document.querySelector('.rich-text-toolbar');
    if (!toolbar) return;

    const commands = ['bold', 'italic', 'underline'];
    commands.forEach(cmd => {
      const btn = toolbar.querySelector(`[data-command="${cmd}"]`);
      if (btn) {
        if (document.queryCommandState(cmd)) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });
  }

  // ============ WIKI ============

  renderWiki() {
    const search = document.getElementById('wikiSearch').value.toLowerCase();
    const categoryFilter = document.getElementById('wikiFilter').value;
    const objectFilter = document.getElementById('wikiObjectFilter').value;
    const groupByObject = document.getElementById('wikiGroupByObject').checked;
    const tableBody = document.getElementById('wikiTableBody');
    const tableContainer = document.getElementById('wikiTableContainer');
    const emptyState = document.getElementById('wikiEmptyState');

    // Filter entries
    let filtered = this.wikiEntries.filter(entry => {
      // Search filter
      if (search) {
        const searchTerms = [entry.term, ...(entry.aliases || []), entry.propertyGroup || '', entry.definition || ''];
        const matches = searchTerms.some(t => t.toLowerCase().includes(search));
        if (!matches) return false;
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

    // Update stats
    this.updateWikiStats();

    if (filtered.length === 0) {
      tableContainer.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    tableContainer.style.display = 'block';
    emptyState.style.display = 'none';

    // Build table content
    let html = '';

    if (groupByObject) {
      // Group by object type, then by property group
      const grouped = this.groupWikiEntries(filtered);
      html = this.renderGroupedWikiTable(grouped);
    } else {
      // Flat list sorted by term
      filtered.sort((a, b) => a.term.localeCompare(b.term));
      html = this.renderFlatWikiTable(filtered);
    }

    tableBody.innerHTML = html;
    this.bindWikiTableEvents();
  }

  groupWikiEntries(entries) {
    const groups = {
      contacts: { label: 'Contacts', icon: 'user', entries: [], groups: {} },
      companies: { label: 'Companies', icon: 'building', entries: [], groups: {} },
      deals: { label: 'Deals', icon: 'briefcase', entries: [], groups: {} },
      tickets: { label: 'Tickets', icon: 'ticket', entries: [], groups: {} },
      custom: { label: 'Custom Terms', icon: 'book', entries: [], groups: {} }
    };

    entries.forEach(entry => {
      const objectType = entry.objectType || 'custom';
      const group = groups[objectType] || groups.custom;
      const propertyGroup = entry.propertyGroup || 'Ungrouped';

      if (!group.groups[propertyGroup]) {
        group.groups[propertyGroup] = [];
      }
      group.groups[propertyGroup].push(entry);
      group.entries.push(entry);
    });

    return groups;
  }

  renderGroupedWikiTable(groups) {
    let html = '';
    const objectOrder = ['deals', 'contacts', 'companies', 'tickets', 'custom'];

    objectOrder.forEach(objectType => {
      const group = groups[objectType];
      if (group.entries.length === 0) return;

      // Object type header row
      const objectId = `wiki-object-${objectType}`;
      html += `
        <tr class="group-row row-level-0" data-group-id="${objectId}">
          <td>
            <button class="row-toggle expanded" data-toggle="${objectId}">
              <span class="icon icon-chevron-right"></span>
            </button>
          </td>
          <td colspan="6">
            <span class="group-icon"><span class="icon icon-${group.icon}"></span></span>
            <strong>${group.label}</strong>
            <span class="group-count">(${group.entries.length})</span>
          </td>
        </tr>
      `;

      // Sort property groups
      const sortedGroups = Object.keys(group.groups).sort((a, b) => {
        if (a === 'Ungrouped') return 1;
        if (b === 'Ungrouped') return -1;
        return a.localeCompare(b);
      });

      sortedGroups.forEach(propertyGroup => {
        const entries = group.groups[propertyGroup];
        const groupId = `wiki-group-${objectType}-${this.slugify(propertyGroup)}`;

        // Property group header
        html += `
          <tr class="group-row row-level-1 child-row visible" data-parent="${objectId}" data-group-id="${groupId}">
            <td>
              <button class="row-toggle expanded" data-toggle="${groupId}">
                <span class="icon icon-chevron-right"></span>
              </button>
            </td>
            <td colspan="6">
              <span class="icon icon-folder icon--sm" style="margin-right: 6px; opacity: 0.5;"></span>
              ${this.escapeHtml(propertyGroup)}
              <span class="group-count">(${entries.length})</span>
            </td>
          </tr>
        `;

        // Sort entries by term
        entries.sort((a, b) => a.term.localeCompare(b.term));

        // Entry rows
        entries.forEach(entry => {
          html += this.renderWikiEntryRow(entry, groupId, 2);

          // Render property values as child rows if they exist
          if (entry.propertyValues && entry.propertyValues.length > 0) {
            const entryId = `wiki-entry-${entry.id}`;
            entry.propertyValues.forEach((value, valueIndex) => {
              html += this.renderWikiValueRow(value, entryId, entry.id, valueIndex);
            });
          }
        });
      });
    });

    return html;
  }

  renderFlatWikiTable(entries) {
    let html = '';
    entries.forEach(entry => {
      html += this.renderWikiEntryRow(entry, null, 0);
    });
    return html;
  }

  renderWikiEntryRow(entry, parentId, level) {
    const categoryClass = entry.category || 'general';
    const categoryLabel = this.wikiCategoryLabels[categoryClass] || categoryClass;
    const objectType = entry.objectType || '';
    const objectLabel = objectType ? objectType.charAt(0).toUpperCase() + objectType.slice(1) : '-';
    const definitionPreview = this.stripHtml(entry.definition || '').substring(0, 150);
    const hasValues = entry.propertyValues && entry.propertyValues.length > 0;
    const entryId = `wiki-entry-${entry.id}`;
    const groupName = entry.propertyGroup || '-';
    const truncatedGroup = groupName.length > 15 ? groupName.substring(0, 15) + '...' : groupName;

    return `
      <tr class="entry-row row-level-${level} ${parentId ? 'child-row visible' : ''}"
          data-parent="${parentId || ''}"
          data-id="${entry.id}"
          ${hasValues ? `data-group-id="${entryId}"` : ''}>
        <td>
          ${hasValues ? `
            <button class="row-toggle" data-toggle="${entryId}">
              <span class="icon icon-chevron-right"></span>
            </button>
          ` : ''}
        </td>
        <td class="wiki-term-cell" title="${this.escapeHtml(definitionPreview)}">
          <span class="wiki-term-name">${this.escapeHtml(entry.term)}</span>
        </td>
        <td>
          ${objectType ? `<span class="wiki-object-badge ${objectType}">${objectLabel}</span>` : '<span class="wiki-text-muted">-</span>'}
        </td>
        <td title="${this.escapeHtml(groupName)}">
          <span class="wiki-group-badge">${this.escapeHtml(truncatedGroup)}</span>
        </td>
        <td>
          <span class="wiki-category-badge ${categoryClass}">${categoryLabel}</span>
        </td>
        <td>
          <span class="status-indicator ${entry.enabled !== false ? 'enabled' : ''}" title="${entry.enabled !== false ? 'Enabled' : 'Disabled'}"></span>
        </td>
        <td class="wiki-actions-cell">
          <button class="btn btn-icon-sm edit-wiki-btn" data-id="${entry.id}" title="Edit">
            <span class="icon icon-edit icon--sm"></span>
          </button>
          <button class="btn btn-icon-sm btn-danger-icon delete-wiki-btn" data-id="${entry.id}" title="Delete">
            <span class="icon icon-trash icon--sm"></span>
          </button>
        </td>
      </tr>
    `;
  }

  renderWikiValueRow(value, parentId, entryId, valueIndex) {
    const hasCard = value.definition && value.definition.trim();
    return `
      <tr class="value-row row-level-3 child-row" data-parent="${parentId}" data-entry-id="${entryId}" data-value-index="${valueIndex}">
        <td></td>
        <td colspan="4">
          <span class="wiki-value-label">${this.escapeHtml(value.label || value.value)}</span>
          ${value.description ? ` <span class="wiki-value-desc">- ${this.escapeHtml(value.description)}</span>` : ''}
        </td>
        <td>
          <span class="status-indicator ${hasCard ? 'has-card' : ''}" title="${hasCard ? 'Has definition card' : 'No card defined'}"></span>
        </td>
        <td class="wiki-actions-cell">
          <button class="btn btn-icon-sm edit-value-btn" data-entry-id="${entryId}" data-value-index="${valueIndex}" title="Edit Value Card">
            <span class="icon icon-edit icon--sm"></span>
          </button>
        </td>
      </tr>
    `;
  }

  bindWikiTableEvents() {
    const tableBody = document.getElementById('wikiTableBody');

    // Toggle buttons
    tableBody.querySelectorAll('.row-toggle').forEach(btn => {
      btn.addEventListener('click', () => this.toggleWikiGroup(btn));
    });

    // Edit buttons
    tableBody.querySelectorAll('.edit-wiki-btn').forEach(btn => {
      btn.addEventListener('click', () => this.editWikiEntry(btn.dataset.id));
    });

    // Delete buttons
    tableBody.querySelectorAll('.delete-wiki-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteWikiEntry(btn.dataset.id));
    });

    // Status toggles (click on status indicator)
    tableBody.querySelectorAll('.status-indicator').forEach(indicator => {
      indicator.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        const entryId = row.dataset.id;
        if (entryId) this.toggleWikiEntryStatus(entryId);
      });
    });

    // Edit value buttons
    tableBody.querySelectorAll('.edit-value-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const entryId = btn.dataset.entryId;
        const valueIndex = parseInt(btn.dataset.valueIndex, 10);
        this.editPropertyValue(entryId, valueIndex);
      });
    });
  }

  toggleWikiGroup(btn) {
    const groupId = btn.dataset.toggle;
    const isExpanded = btn.classList.contains('expanded');

    btn.classList.toggle('expanded');

    // Find all child rows
    const tableBody = document.getElementById('wikiTableBody');
    const childRows = tableBody.querySelectorAll(`tr[data-parent="${groupId}"]`);

    childRows.forEach(row => {
      if (isExpanded) {
        row.classList.remove('visible');
        // Also collapse any nested groups
        const nestedGroupId = row.dataset.groupId;
        if (nestedGroupId) {
          const nestedToggle = row.querySelector('.row-toggle');
          if (nestedToggle && nestedToggle.classList.contains('expanded')) {
            this.toggleWikiGroup(nestedToggle);
          }
        }
      } else {
        row.classList.add('visible');
      }
    });
  }

  expandAllWikiGroups() {
    const tableBody = document.getElementById('wikiTableBody');
    tableBody.querySelectorAll('.row-toggle').forEach(btn => {
      if (!btn.classList.contains('expanded')) {
        btn.classList.add('expanded');
      }
    });
    tableBody.querySelectorAll('.child-row').forEach(row => {
      row.classList.add('visible');
    });
  }

  collapseAllWikiGroups() {
    const tableBody = document.getElementById('wikiTableBody');
    tableBody.querySelectorAll('.row-toggle').forEach(btn => {
      btn.classList.remove('expanded');
    });
    tableBody.querySelectorAll('.child-row').forEach(row => {
      row.classList.remove('visible');
    });
  }

  async toggleWikiEntryStatus(entryId) {
    const entry = this.wikiEntries.find(e => e.id === entryId);
    if (entry) {
      entry.enabled = entry.enabled === false ? true : false;
      await this.saveWikiEntries();
      this.renderWiki();
      this.notifyContentScript();
    }
  }

  updateWikiStats() {
    const total = this.wikiEntries.length;
    const enabled = this.wikiEntries.filter(e => e.enabled !== false).length;
    const fields = this.wikiEntries.filter(e => e.category === 'field' || e.objectType).length;

    document.getElementById('wikiTotalCount').textContent = total;
    document.getElementById('wikiEnabledCount').textContent = enabled;
    document.getElementById('wikiFieldsCount').textContent = fields;
  }

  slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  openWikiEditor(entry = null) {
    this.editingWikiId = entry?.id || null;
    this.editingPropertyValues = entry?.propertyValues ? [...entry.propertyValues] : [];
    document.getElementById('wikiEditorTitle').textContent = entry ? 'Edit Wiki Entry' : 'Add Wiki Entry';

    document.getElementById('wikiTerm').value = entry?.term || '';
    document.getElementById('wikiAliases').value = entry?.aliases?.join(', ') || '';
    document.getElementById('wikiCategory').value = entry?.category || 'general';
    document.getElementById('wikiObjectType').value = entry?.objectType || '';
    document.getElementById('wikiPropertyGroup').value = entry?.propertyGroup || '';
    document.getElementById('wikiDefinition').innerHTML = entry?.definition || '';
    document.getElementById('wikiLink').value = entry?.link || '';

    // Render property values
    this.renderPropertyValues();

    this.updateWikiPreview();

    // Show editor section
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('wikiEditorSection').classList.add('active');
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
          <input type="text" class="pv-value" value="${this.escapeHtml(value.value || '')}" placeholder="e.g., Option A">
        </div>
        <div class="form-group">
          <label>Label</label>
          <input type="text" class="pv-label" value="${this.escapeHtml(value.label || '')}" placeholder="Display label">
        </div>
        <div class="form-group" style="flex: 2;">
          <label>Description</label>
          <input type="text" class="pv-description" value="${this.escapeHtml(value.description || '')}" placeholder="What this value means">
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
      });
    });

    // Bind input changes
    container.querySelectorAll('.property-value-item').forEach((item, index) => {
      item.querySelector('.pv-value').addEventListener('input', (e) => {
        this.editingPropertyValues[index].value = e.target.value;
      });
      item.querySelector('.pv-label').addEventListener('input', (e) => {
        this.editingPropertyValues[index].label = e.target.value;
      });
      item.querySelector('.pv-description').addEventListener('input', (e) => {
        this.editingPropertyValues[index].description = e.target.value;
      });
    });
  }

  addPropertyValue() {
    if (!this.editingPropertyValues) {
      this.editingPropertyValues = [];
    }
    this.editingPropertyValues.push({ value: '', label: '', description: '' });
    this.renderPropertyValues();
  }

  closeWikiEditor() {
    this.editingWikiId = null;
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('wikiSection').classList.add('active');
  }

  updateWikiPreview() {
    const term = document.getElementById('wikiTerm').value || 'Term';
    const category = document.getElementById('wikiCategory').value || 'general';
    const definition = document.getElementById('wikiDefinition').innerHTML || '<p>Your definition will appear here</p>';
    const categoryLabel = this.wikiCategoryLabels[category] || category;

    const preview = document.getElementById('wikiPreview');
    preview.innerHTML = `
      <div class="wiki-preview-card">
        <div class="wiki-preview-header">
          <span class="wiki-preview-term">${this.escapeHtml(term)}</span>
          <span class="wiki-preview-category">${categoryLabel}</span>
        </div>
        <div class="wiki-preview-content">${definition}</div>
      </div>
    `;
  }

  async saveWikiEntry() {
    const term = document.getElementById('wikiTerm').value.trim();
    const aliasesStr = document.getElementById('wikiAliases').value.trim();
    const category = document.getElementById('wikiCategory').value;
    const objectType = document.getElementById('wikiObjectType').value;
    const propertyGroup = document.getElementById('wikiPropertyGroup').value.trim();
    const definition = document.getElementById('wikiDefinition').innerHTML.trim();
    let link = document.getElementById('wikiLink').value.trim();

    if (!term) {
      alert('Please enter a term or phrase');
      return;
    }

    if (!definition) {
      alert('Please enter a definition');
      return;
    }

    // Parse aliases
    const aliases = aliasesStr ? aliasesStr.split(',').map(a => a.trim()).filter(a => a) : [];

    // Filter out empty property values
    const propertyValues = (this.editingPropertyValues || []).filter(v => v.value || v.label);

    // Ensure link has https:// prefix if provided
    if (link && !link.startsWith('https://') && !link.startsWith('http://')) {
      link = 'https://' + link;
    }

    const entry = {
      id: this.editingWikiId || 'wiki_' + Date.now(),
      term,
      aliases,
      category,
      objectType: objectType || null,
      propertyGroup: propertyGroup || null,
      propertyValues: propertyValues.length > 0 ? propertyValues : null,
      definition,
      link,
      enabled: true,
      createdAt: Date.now()
    };

    if (this.editingWikiId) {
      const index = this.wikiEntries.findIndex(e => e.id === this.editingWikiId);
      if (index !== -1) {
        entry.createdAt = this.wikiEntries[index].createdAt;
        entry.enabled = this.wikiEntries[index].enabled;
        entry.updatedAt = Date.now();
        this.wikiEntries[index] = entry;
      }
    } else {
      this.wikiEntries.push(entry);
    }

    await this.saveWikiEntries();
    this.renderWiki();
    this.closeWikiEditor();
    this.updateHomeStats();
    this.updateOnboardingProgress();
    this.notifyContentScript();
  }

  editWikiEntry(wikiId) {
    const entry = this.wikiEntries.find(e => e.id === wikiId);
    if (entry) this.openWikiEditor(entry);
  }

  editPropertyValue(entryId, valueIndex) {
    const entry = this.wikiEntries.find(e => e.id === entryId);
    if (!entry || !entry.propertyValues || !entry.propertyValues[valueIndex]) return;

    const value = entry.propertyValues[valueIndex];
    const currentDefinition = value.definition || '';

    // Create a simple modal for editing the value card
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'valueEditorModal';
    modal.innerHTML = `
      <div class="modal" style="max-width: 600px;">
        <div class="modal-header">
          <h2>Edit Value Card: ${this.escapeHtml(value.label || value.value)}</h2>
          <button class="modal-close" id="closeValueEditorModal">
            <span class="icon icon-x"></span>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Value</label>
            <input type="text" id="valueEditorValue" value="${this.escapeHtml(value.value || '')}" class="form-control">
          </div>
          <div class="form-group">
            <label>Display Label</label>
            <input type="text" id="valueEditorLabel" value="${this.escapeHtml(value.label || '')}" class="form-control">
          </div>
          <div class="form-group">
            <label>Short Description</label>
            <input type="text" id="valueEditorDescription" value="${this.escapeHtml(value.description || '')}" class="form-control" placeholder="Brief description shown in table">
          </div>
          <div class="form-group">
            <label>Definition Card Content</label>
            <div class="rich-text-toolbar wiki-toolbar-value">
              <button type="button" class="toolbar-btn" data-command="bold" title="Bold"><strong>B</strong></button>
              <button type="button" class="toolbar-btn" data-command="italic" title="Italic"><em>I</em></button>
              <button type="button" class="toolbar-btn" data-command="insertUnorderedList" title="Bullet List">•</button>
              <button type="button" class="toolbar-btn" data-command="insertOrderedList" title="Numbered List">1.</button>
              <button type="button" class="toolbar-btn" data-command="createLink" title="Add Link">🔗</button>
            </div>
            <div id="valueEditorDefinition" class="rich-text-editor" contenteditable="true" style="min-height: 150px;">${currentDefinition}</div>
            <p class="form-hint">Define what this value means. Leave empty if no card should show for this value.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelValueEditorBtn">Cancel</button>
          <button class="btn btn-primary" id="saveValueEditorBtn">Save Value Card</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Bind toolbar commands
    modal.querySelector('.wiki-toolbar-value').addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;
      e.preventDefault();
      const command = btn.dataset.command;
      document.getElementById('valueEditorDefinition').focus();
      if (command === 'createLink') {
        const url = prompt('Enter URL:', 'https://');
        if (url) document.execCommand(command, false, url);
      } else {
        document.execCommand(command, false, null);
      }
    });

    // Close modal
    const closeModal = () => modal.remove();
    modal.querySelector('#closeValueEditorModal').addEventListener('click', closeModal);
    modal.querySelector('#cancelValueEditorBtn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Save value
    modal.querySelector('#saveValueEditorBtn').addEventListener('click', async () => {
      entry.propertyValues[valueIndex] = {
        value: document.getElementById('valueEditorValue').value.trim(),
        label: document.getElementById('valueEditorLabel').value.trim(),
        description: document.getElementById('valueEditorDescription').value.trim(),
        definition: document.getElementById('valueEditorDefinition').innerHTML.trim()
      };
      await this.saveWikiEntries();
      this.renderWiki();
      this.notifyContentScript();
      closeModal();
    });
  }

  async deleteWikiEntry(wikiId) {
    if (confirm('Are you sure you want to delete this wiki entry?')) {
      this.wikiEntries = this.wikiEntries.filter(e => e.id !== wikiId);
      await this.saveWikiEntries();
      this.renderWiki();
      this.updateHomeStats();
      this.updateOnboardingProgress();
      this.notifyContentScript();
    }
  }

  async saveWikiEntries() {
    // Build pre-computed cache for faster tooltip loading
    const cacheData = this.buildWikiTermMapCache(this.wikiEntries);

    return new Promise(resolve => {
      chrome.storage.local.set({
        wikiEntries: this.wikiEntries,
        wikiTermMapCache: cacheData.termMap,
        wikiEntriesById: cacheData.entriesById,
        wikiCacheVersion: Date.now()
      }, resolve);
    });
  }

  /**
   * Build wiki term map cache for faster tooltip loading
   */
  buildWikiTermMapCache(wikiEntries) {
    const termMap = {};
    const entriesById = {};

    const enabledEntries = (wikiEntries || []).filter(e => e.enabled !== false);

    for (const entry of enabledEntries) {
      entriesById[entry.id] = entry;

      const primaryTrigger = entry.trigger || entry.term;
      if (!primaryTrigger) continue;

      const triggers = [primaryTrigger, ...(entry.aliases || [])];

      for (const trigger of triggers) {
        if (trigger && trigger.trim()) {
          termMap[trigger.toLowerCase().trim()] = entry.id;
        }
      }
    }

    return { termMap, entriesById };
  }

  initWikiRichTextEditor() {
    const toolbar = document.querySelector('.wiki-toolbar-admin');
    if (!toolbar) return;

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;

      e.preventDefault();
      const command = btn.dataset.command;

      // Focus the wiki definition field
      document.getElementById('wikiDefinition').focus();

      if (command === 'createLink') {
        const url = prompt('Enter URL:', 'https://');
        if (url) {
          document.execCommand(command, false, url);
        }
      } else {
        document.execCommand(command, false, null);
      }

      this.updateWikiPreview();
    });
  }

  // ============ IMPORT FIELDS MODAL ============

  openImportFieldsModal() {
    document.getElementById('importObjectTypeAdmin').value = '';
    document.getElementById('fieldsLoadingStatusAdmin').textContent = '';
    document.getElementById('fieldsListAdmin').style.display = 'none';
    document.getElementById('fieldsListItemsAdmin').innerHTML = '';
    document.getElementById('selectAllFieldsAdmin').checked = false;
    document.getElementById('fieldsSearchAdmin').value = '';
    document.getElementById('confirmImportFieldsBtnAdmin').disabled = true;
    this.importFieldsData = [];

    document.getElementById('importFieldsModalAdmin').classList.add('open');
  }

  closeImportFieldsModal() {
    document.getElementById('importFieldsModalAdmin').classList.remove('open');
    this.importFieldsData = [];
  }

  async loadFieldsForImport(objectType) {
    const statusEl = document.getElementById('fieldsLoadingStatusAdmin');
    const fieldsList = document.getElementById('fieldsListAdmin');
    const fieldsListItems = document.getElementById('fieldsListItemsAdmin');
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
      const properties = await this.fetchProperties(objectType);
      this.importFieldsData = properties;

      // Build a map of existing entries by term/alias for matching
      const existingByTerm = new Map();
      for (const entry of this.wikiEntries) {
        existingByTerm.set(entry.term.toLowerCase(), entry);
        for (const alias of (entry.aliases || [])) {
          existingByTerm.set(alias.toLowerCase(), entry);
        }
      }

      fieldsListItems.innerHTML = properties.map(prop => {
        // Check if already imported
        const existingEntry = existingByTerm.get(prop.label.toLowerCase()) || existingByTerm.get(prop.name.toLowerCase());
        const isImported = !!existingEntry;
        // Check if the existing entry needs updating (missing objectType or propertyGroup)
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
          <label class="field-item ${itemClass}" data-name="${prop.name}" data-label="${this.escapeHtml(prop.label)}" data-existing-id="${existingEntry?.id || ''}">
            <input type="checkbox" class="field-checkbox" value="${prop.name}" ${isImported && !needsUpdate ? 'disabled' : ''}>
            <div class="field-info">
              <span class="field-label">${this.escapeHtml(prop.label)}</span>
              <span class="field-name">${prop.name}</span>
            </div>
            ${badgeHtml}
          </label>
        `;
      }).join('');

      fieldsList.style.display = 'block';
      const needsUpdateCount = properties.filter(p => {
        const existing = existingByTerm.get(p.label.toLowerCase()) || existingByTerm.get(p.name.toLowerCase());
        return existing && (!existing.objectType || !existing.propertyGroup);
      }).length;

      if (needsUpdateCount > 0) {
        statusEl.textContent = `${properties.length} fields found (${needsUpdateCount} can be updated)`;
      } else {
        statusEl.textContent = `${properties.length} fields found`;
      }
      statusEl.className = 'status-text success';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);

      // Update confirm button state on checkbox changes
      fieldsListItems.querySelectorAll('.field-checkbox').forEach(cb => {
        cb.addEventListener('change', () => this.updateImportButtonState());
      });

    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'status-text error';
    }
  }

  toggleAllFields(checked) {
    document.querySelectorAll('#fieldsListItemsAdmin .field-checkbox:not(:disabled)').forEach(cb => {
      cb.checked = checked;
    });
    this.updateImportButtonState();
  }

  filterFieldsList(query) {
    const normalizedQuery = query.toLowerCase().trim();
    document.querySelectorAll('#fieldsListItemsAdmin .field-item').forEach(item => {
      const label = item.dataset.label.toLowerCase();
      const name = item.dataset.name.toLowerCase();
      const matches = !normalizedQuery || label.includes(normalizedQuery) || name.includes(normalizedQuery);
      item.style.display = matches ? 'flex' : 'none';
    });
  }

  updateImportButtonState() {
    const checkedCount = document.querySelectorAll('#fieldsListItemsAdmin .field-checkbox:checked').length;
    const confirmBtn = document.getElementById('confirmImportFieldsBtnAdmin');
    confirmBtn.disabled = checkedCount === 0;
    confirmBtn.textContent = checkedCount > 0 ? `Import Selected (${checkedCount})` : 'Import Selected';
  }

  async importSelectedFields() {
    const checkedItems = document.querySelectorAll('#fieldsListItemsAdmin .field-item:has(.field-checkbox:checked)');
    const objectType = document.getElementById('importObjectTypeAdmin').value;

    if (checkedItems.length === 0) {
      alert('Please select at least one field to import');
      return;
    }

    let newCount = 0;
    let updateCount = 0;

    for (const item of checkedItems) {
      const propName = item.dataset.name;
      const existingId = item.dataset.existingId;
      const prop = this.importFieldsData.find(p => p.name === propName);

      if (!prop) continue;

      // Build definition from property metadata
      let definition = `<p><strong>${this.escapeHtml(prop.label)}</strong></p>`;
      definition += `<p>HubSpot API name: <code>${prop.name}</code></p>`;
      if (prop.type) {
        definition += `<p>Field type: ${prop.type}${prop.fieldType ? ` (${prop.fieldType})` : ''}</p>`;
      }
      if (prop.options && prop.options.length > 0) {
        definition += `<p>Available options:</p><ul>`;
        prop.options.slice(0, 10).forEach(opt => {
          definition += `<li>${this.escapeHtml(opt.label)} (${opt.value})</li>`;
        });
        if (prop.options.length > 10) {
          definition += `<li>...and ${prop.options.length - 10} more</li>`;
        }
        definition += `</ul>`;
      }

      // Build property values for picklist fields
      let propertyValues = null;
      if (prop.options && prop.options.length > 0) {
        propertyValues = prop.options.map(opt => ({
          value: opt.value,
          label: opt.label,
          description: opt.description || ''
        }));
      }

      // Format group name nicely
      const propertyGroup = prop.groupName
        ? prop.groupName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : null;

      if (existingId) {
        // Update existing entry
        const existingIndex = this.wikiEntries.findIndex(e => e.id === existingId);
        if (existingIndex !== -1) {
          const existing = this.wikiEntries[existingIndex];
          // Only update fields that are missing or need updating
          existing.objectType = objectType || existing.objectType || null;
          existing.propertyGroup = propertyGroup || existing.propertyGroup || null;
          existing.propertyValues = propertyValues || existing.propertyValues || null;
          // Update definition only if it was auto-generated (contains "HubSpot API name")
          if (existing.definition.includes('HubSpot API name:') || !existing.definition.trim()) {
            existing.definition = definition;
          }
          existing.updatedAt = Date.now();
          updateCount++;
        }
      } else {
        // Create new entry
        this.wikiEntries.push({
          id: 'wiki_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          term: prop.label,
          aliases: [prop.name],
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

    await this.saveWikiEntries();
    this.renderWiki();
    this.closeImportFieldsModal();
    this.updateHomeStats();
    this.updateOnboardingProgress();
    this.notifyContentScript();

    let message = '';
    if (newCount > 0 && updateCount > 0) {
      message = `Successfully imported ${newCount} new field(s) and updated ${updateCount} existing entry(ies)!`;
    } else if (newCount > 0) {
      message = `Successfully imported ${newCount} field(s) as wiki entries!`;
    } else if (updateCount > 0) {
      message = `Successfully updated ${updateCount} existing wiki entry(ies) with object and group info!`;
    }
    alert(message);
  }
}

// Initialize
const admin = new AdminPanel();
