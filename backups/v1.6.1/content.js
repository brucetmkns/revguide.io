/**
 * HubSpot Helper - Content Script (Main Orchestrator)
 *
 * This is the main entry point for the HubSpot Helper Chrome extension.
 * It coordinates all feature modules and handles page detection, data loading,
 * and SPA navigation for HubSpot CRM pages.
 *
 * ARCHITECTURE:
 * -------------
 * The extension uses a modular architecture with feature-specific modules:
 *
 *   content.js (this file)
 *     ├── modules/banners.js     - Banner rendering and rule-based alerts
 *     ├── modules/wiki.js        - Wiki tooltips and term highlighting
 *     ├── modules/sidepanel.js   - FAB button and side panel for battle cards
 *     └── modules/presentations.js - Embedded presentation/media cards
 *
 * CORE COMPONENTS:
 * ----------------
 * - RulesEngine: Evaluates conditions to determine which banners/cards to show
 * - HubSpotHelper: Main class that orchestrates all features
 *
 * PAGE TYPES SUPPORTED:
 * ---------------------
 * - Record pages: /record/{objectTypeId}/{recordId} - Full features
 * - Index pages: /objects/{objectTypeId}/... - Wiki highlighting only
 *
 * DATA FLOW:
 * ----------
 * 1. Page load detected
 * 2. loadData() fetches rules, cards, wiki entries from chrome.storage
 * 3. extractPageData() scrapes properties from HubSpot DOM
 * 4. render() evaluates rules and delegates to modules
 * 5. watchForChanges() monitors for SPA navigation and DOM updates
 */

(function() {
  'use strict';

  // ============ DEBUG CONFIGURATION ============
  // Set to true for verbose logging during development
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log('[HubSpot Helper]', ...args);

  // ============ RULES ENGINE ============
  /**
   * Evaluates conditions and rules to determine which banners/cards to display.
   * Supports various operators for property comparison.
   */
  class RulesEngine {
    constructor() {
      // Helper to parse numbers with currency symbols, commas, etc.
      const parseNumber = (val) => {
        if (val === null || val === undefined) return NaN;
        const cleaned = String(val).replace(/[^0-9.\-]/g, '');
        return parseFloat(cleaned);
      };

      // Available comparison operators
      this.operators = {
        equals: (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
        not_equals: (a, b) => String(a).toLowerCase() !== String(b).toLowerCase(),
        contains: (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
        not_contains: (a, b) => !String(a).toLowerCase().includes(String(b).toLowerCase()),
        starts_with: (a, b) => String(a).toLowerCase().startsWith(String(b).toLowerCase()),
        ends_with: (a, b) => String(a).toLowerCase().endsWith(String(b).toLowerCase()),
        greater_than: (a, b) => parseNumber(a) > parseNumber(b),
        less_than: (a, b) => parseNumber(a) < parseNumber(b),
        greater_equal: (a, b) => parseNumber(a) >= parseNumber(b),
        less_equal: (a, b) => parseNumber(a) <= parseNumber(b),
        is_empty: (a) => !a || String(a).trim() === '',
        is_not_empty: (a) => a && String(a).trim() !== '',
        in_list: (a, b) => {
          const list = String(b).split(',').map(s => s.trim().toLowerCase());
          return list.includes(String(a).toLowerCase());
        },
        not_in_list: (a, b) => {
          const list = String(b).split(',').map(s => s.trim().toLowerCase());
          return !list.includes(String(a).toLowerCase());
        }
      };
    }

    /**
     * Evaluate a single condition against properties
     * @param {Object} condition - Condition with property, operator, value
     * @param {Object} properties - Current page properties
     * @returns {boolean} Whether condition is met
     */
    evaluateCondition(condition, properties) {
      const { property, operator, value } = condition;
      const propertyValue = properties[property];
      const operatorFn = this.operators[operator];
      if (!operatorFn) {
        log('Unknown operator:', operator);
        return false;
      }
      const result = operatorFn(propertyValue, value);
      log(`Condition: ${property} ${operator} "${value}" | Actual: "${propertyValue}" | Result: ${result}`);
      return result;
    }

    /**
     * Evaluate all conditions in a rule
     * @param {Object} rule - Rule with conditions array and logic (AND/OR)
     * @param {Object} properties - Current page properties
     * @returns {boolean} Whether rule matches
     */
    evaluateRule(rule, properties) {
      if (!rule.conditions || rule.conditions.length === 0) return true;
      const logic = rule.logic || 'AND';
      if (logic === 'AND') {
        return rule.conditions.every(c => this.evaluateCondition(c, properties));
      }
      return rule.conditions.some(c => this.evaluateCondition(c, properties));
    }

    /**
     * Evaluate all rules and return matching ones
     * @param {Array} rules - Array of rules to evaluate
     * @param {Object} properties - Current page properties
     * @param {Object} context - Page context (objectType, pipeline, stage)
     * @returns {Array} Matching rules sorted by priority
     */
    evaluateRules(rules, properties, context = {}) {
      const matching = [];
      for (const rule of rules) {
        if (rule.enabled === false) continue;
        if (rule.objectTypes?.length && !rule.objectTypes.includes(context.objectType)) continue;
        if (rule.pipelines?.length && !rule.pipelines.includes(context.pipeline)) continue;
        if (rule.stages?.length && !rule.stages.includes(context.stage)) continue;
        if (rule.displayOnAll || this.evaluateRule(rule, properties)) {
          matching.push(rule);
        }
      }
      return matching.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
  }

  // ============ MAIN ORCHESTRATOR CLASS ============
  /**
   * HubSpotHelper coordinates all features and manages the extension lifecycle.
   * It loads data, detects page types, extracts properties, and delegates
   * rendering to feature modules.
   */
  class HubSpotHelper {
    constructor() {
      // Core components
      this.rulesEngine = new RulesEngine();

      // Page state
      this.currentUrl = window.location.href;
      this.properties = {};
      this.context = {};

      // Data from storage
      this.rules = [];
      this.battleCards = [];
      this.presentations = [];
      this.wikiEntries = [];
      this.settings = {};

      // Feature modules (initialized after page load)
      this.bannersModule = null;
      this.wikiModule = null;
      this.sidePanelModule = null;
      this.presentationsModule = null;

      // Timeout references
      this.propertyUpdateTimeout = null;

      this.init();
    }

    // ============ INITIALIZATION ============

    /**
     * Main initialization flow
     */
    async init() {
      log('Initializing...');

      // Set up message listener for side panel communication
      this.setupMessageListener();

      const isRecord = this.isRecordPage();
      const isIndex = this.isIndexPage();

      // Exit early if not on a supported page
      if (!isRecord && !isIndex) {
        log('Not a record or index page, skipping');
        return;
      }

      // Load data from storage
      await this.loadData();
      log('Loaded rules:', this.rules.length, 'cards:', this.battleCards.length, 'wiki:', this.wikiEntries.length);

      // Initialize feature modules
      this.initModules();

      // Index pages only get wiki highlighting
      if (isIndex) {
        log('Index page detected, applying wiki highlighting only');
        await this.waitForIndexPageLoad();
        this.wikiModule.applyForIndex();
        this.wikiModule.setupScrollListener();
        return;
      }

      // Record page - full functionality
      log('Waiting for page load...');
      await this.waitForPageLoad();
      log('Page loaded, extracting data...');
      this.extractPageData();

      // Fetch additional properties from API if deal
      if (this.context.objectType === 'deal' && this.context.recordId) {
        log('Fetching deal from API...');
        await this.fetchDealFromAPI();
      }

      log('About to call render()...');
      this.render();
      log('render() completed, setting up watchers...');
      this.watchForChanges();
    }

    /**
     * Initialize feature modules with reference to this orchestrator
     */
    initModules() {
      // Check if modules are available (loaded via manifest.json)
      if (typeof BannersModule !== 'undefined') {
        this.bannersModule = new BannersModule(this);
      }
      if (typeof WikiModule !== 'undefined') {
        this.wikiModule = new WikiModule(this);
      }
      if (typeof SidePanelModule !== 'undefined') {
        this.sidePanelModule = new SidePanelModule(this);
      }
      if (typeof PresentationsModule !== 'undefined') {
        this.presentationsModule = new PresentationsModule(this);
      }

      log('Modules initialized:', {
        banners: !!this.bannersModule,
        wiki: !!this.wikiModule,
        sidePanel: !!this.sidePanelModule,
        presentations: !!this.presentationsModule
      });
    }

    // ============ DATA LOADING ============

    /**
     * Load configuration data from Chrome storage
     */
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
            bannerPosition: 'top',
            theme: 'light'
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

    /**
     * Fetch deal properties from HubSpot API via background script
     */
    async fetchDealFromAPI() {
      log('Fetching deal from API, recordId:', this.context.recordId);
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: 'fetchDealProperties',
            portalId: this.context.portalId,
            dealId: this.context.recordId
          },
          (response) => {
            log('API response received:', response);
            if (response?.success && response.data?.properties) {
              const apiProps = response.data.properties;
              for (const [key, value] of Object.entries(apiProps)) {
                if (value !== null && value !== undefined) {
                  this.properties[key] = value;
                }
              }
              log('API properties merged:', apiProps);
            } else if (response?.error) {
              log('API error:', response.error);
            }
            resolve();
          }
        );
      });
    }

    // ============ PAGE DETECTION ============

    /**
     * Check if current URL is a HubSpot record page
     * Record pages: /contacts/{portalId}/record/{objectTypeId}/{recordId}
     * @returns {boolean}
     */
    isRecordPage() {
      const url = window.location.href;
      return /\/record\/\d+-\d+/.test(url);
    }

    /**
     * Check if current URL is a HubSpot index/list page
     * Index pages: /contacts/{portalId}/objects/{objectTypeId}/...
     * @returns {boolean}
     */
    isIndexPage() {
      const url = window.location.href;
      return /\/objects\//.test(url);
    }

    /**
     * Wait for record page DOM elements to load
     */
    async waitForPageLoad() {
      return new Promise((resolve) => {
        const quickCheck = () => {
          return document.querySelector('[data-test-id="middle-pane"]') ||
                 document.querySelector('[data-test-id="record-page"]') ||
                 document.querySelector('[data-selenium-test="highlightedPropertySidebar"]');
        };

        if (quickCheck()) {
          resolve();
          return;
        }

        let attempts = 0;
        const maxAttempts = 30;

        const check = () => {
          if (quickCheck() || ++attempts >= maxAttempts) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    }

    /**
     * Wait for index page DOM elements to load
     */
    async waitForIndexPageLoad() {
      return new Promise((resolve) => {
        const quickCheck = () => {
          return document.querySelector('[data-test-id="table"]') ||
                 document.querySelector('[data-test-id="index-page"]') ||
                 document.querySelector('.private-table') ||
                 document.querySelector('[class*="TableRow"]') ||
                 document.querySelector('table') ||
                 document.querySelector('[data-test-id="crm-object-table"]');
        };

        if (quickCheck()) {
          resolve();
          return;
        }

        let attempts = 0;
        const maxAttempts = 30;

        const check = () => {
          if (quickCheck() || ++attempts >= maxAttempts) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    }

    // ============ PROPERTY EXTRACTION ============

    /**
     * Extract properties from HubSpot DOM
     * Uses multiple methods to handle varying DOM structures
     */
    extractPageData() {
      this.properties = {};
      this.context = this.detectContext();

      // Method 1: Property sidebar with data-selenium-test attributes
      document.querySelectorAll('[data-selenium-test="property-input"]').forEach(el => {
        const label = el.closest('[data-selenium-test]')?.querySelector('label')?.textContent;
        const value = this.extractPropertyValue(el);
        if (label) {
          this.properties[this.normalizePropertyName(label)] = value;
        }
      });

      // Method 2: Property list items (older HubSpot UI)
      document.querySelectorAll('.private-property-list__item, [data-test-id="property-row"]').forEach(el => {
        const label = el.querySelector('.property-label, [data-test-id="property-label"]')?.textContent;
        const valueEl = el.querySelector('.property-value, [data-test-id="property-value"]');
        if (label && valueEl) {
          this.properties[this.normalizePropertyName(label)] = valueEl.textContent?.trim() || '';
        }
      });

      // Method 3: Highlighted properties in sidebar (newer UI)
      document.querySelectorAll('[class*="UIPropertyValue"]').forEach(el => {
        const container = el.closest('[class*="PropertyListItem"]');
        if (container) {
          const label = container.querySelector('[class*="PropertyLabel"]')?.textContent;
          if (label) {
            this.properties[this.normalizePropertyName(label)] = el.textContent?.trim() || '';
          }
        }
      });

      // Method 4: About section properties
      document.querySelectorAll('[data-test-id="about-section"] [data-test-id*="property"]').forEach(el => {
        const labelEl = el.querySelector('[data-test-id="property-label"]');
        const valueEl = el.querySelector('[data-test-id="property-value"]');
        if (labelEl && valueEl) {
          this.properties[this.normalizePropertyName(labelEl.textContent)] = valueEl.textContent?.trim() || '';
        }
      });

      // Method 5: Deal/pipeline stage
      const stageEl = document.querySelector('[data-selenium-test="deal-stage"], [class*="DealStage"], [data-test-id="deal-stage"]');
      if (stageEl) {
        this.properties['dealstage'] = stageEl.textContent?.trim() || '';
        this.context.stage = this.properties['dealstage'];
      }

      // Method 6: Pipeline stage from tracker
      const activeStage = document.querySelector('[class*="StageTracker"] [class*="active"], [class*="pipeline"] [aria-current="true"]');
      if (activeStage && !this.properties['dealstage']) {
        this.properties['dealstage'] = activeStage.textContent?.trim() || '';
        this.context.stage = this.properties['dealstage'];
      }

      // Method 7: Record name from header
      const recordName = document.querySelector('[data-test-id="record-header"] h1, [class*="RecordTitle"]');
      if (recordName) {
        this.properties['record_name'] = recordName.textContent?.trim() || '';
      }

      // Method 8: Generic aria-label extraction
      document.querySelectorAll('[aria-label*="property"]').forEach(el => {
        const ariaLabel = el.getAttribute('aria-label') || '';
        const match = ariaLabel.match(/property[:\s]+([^,]+)/i);
        if (match) {
          const value = el.textContent?.trim() || el.value || '';
          if (value) {
            this.properties[this.normalizePropertyName(match[1])] = value;
          }
        }
      });

      // Method 9: Parse "Label: Value" patterns from page text
      const pageText = document.body.innerText;
      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line.endsWith(': ') || line.endsWith(':')) {
          const label = line.replace(/:$/, '').trim();
          const value = lines[i + 1];
          if (value && !value.endsWith(':') && value !== '​') {
            const normalizedLabel = this.normalizePropertyName(label);
            if (!this.properties[normalizedLabel]) {
              this.properties[normalizedLabel] = value;
            }
          }
        }
      }

      // Method 10: Same line "Label: Value" patterns
      const sameLinePattern = /^([A-Za-z][A-Za-z\s]+):\s*(.+)$/;
      lines.forEach(line => {
        const match = line.match(sameLinePattern);
        if (match) {
          const label = match[1].trim();
          const value = match[2].trim();
          if (label && value) {
            const normalizedLabel = this.normalizePropertyName(label);
            if (!this.properties[normalizedLabel]) {
              this.properties[normalizedLabel] = value;
            }
          }
        }
      });

      this.normalizePropertyAliases();
      log('Extracted properties:', this.properties);
      log('Context:', this.context);
    }

    /**
     * Extract value from a property input element
     */
    extractPropertyValue(el) {
      const input = el.querySelector('input, select, textarea');
      if (input) {
        return input.value || '';
      }
      const display = el.querySelector('[class*="value"], [class*="Value"], [data-test-id*="value"]');
      if (display) {
        return display.textContent?.trim() || '';
      }
      return el.textContent?.trim() || '';
    }

    /**
     * Normalize property name to lowercase with underscores
     */
    normalizePropertyName(name) {
      return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    /**
     * Create property aliases for common variations
     */
    normalizePropertyAliases() {
      const aliasMap = {
        'deal_stage': 'dealstage',
        'lifecycle_stage': 'lifecyclestage',
        'lead_status': 'leadstatus',
        'deal_name': 'dealname',
        'company_name': 'companyname',
        'close_date': 'closedate',
        'create_date': 'createdate',
        'deal_owner': 'dealowner',
        'company_owner': 'companyowner',
        'contact_owner': 'contactowner',
        'phone_number': 'phone',
        'email_address': 'email',
        'annual_revenue': 'annualrevenue',
        'number_of_employees': 'numberofemployees'
      };

      for (const [readable, apiName] of Object.entries(aliasMap)) {
        if (this.properties[readable] && !this.properties[apiName]) {
          this.properties[apiName] = this.properties[readable];
        }
        if (this.properties[apiName] && !this.properties[readable]) {
          this.properties[readable] = this.properties[apiName];
        }
      }
    }

    /**
     * Detect page context from URL
     */
    detectContext() {
      const url = window.location.href;
      const context = {
        objectType: null,
        recordId: null,
        portalId: null,
        pipeline: null,
        stage: null
      };

      // Extract portal ID: /contacts/{portalId}/...
      const portalMatch = url.match(/\/contacts\/(\d+)\//);
      if (portalMatch) {
        context.portalId = portalMatch[1];
      }

      // Extract object type and record ID from record pages
      // Pattern: /record/{objectTypeId}/{recordId}
      const recordMatch = url.match(/\/record\/(\d+-\d+)\/(\d+)/);
      if (recordMatch) {
        const objectTypeId = recordMatch[1];
        context.recordId = recordMatch[2];

        // Map object type IDs to names
        const objectTypeMap = {
          '0-1': 'contact',
          '0-2': 'company',
          '0-3': 'deal',
          '0-5': 'ticket'
        };
        context.objectType = objectTypeMap[objectTypeId] || objectTypeId;
      }

      return context;
    }

    // ============ RENDERING ============

    /**
     * Main render function - coordinates all module rendering
     */
    render() {
      log('render() called - settings.enabled:', this.settings.enabled);
      if (!this.settings.enabled) {
        log('Extension disabled, skipping render');
        return;
      }

      // Clean up existing UI
      this.cleanup();

      // Create main container
      const container = document.createElement('div');
      container.className = 'hshelper-container';
      container.id = 'hshelper-container';
      document.body.appendChild(container);

      // Evaluate rules for banners
      const matchingRules = this.rulesEngine.evaluateRules(
        this.rules,
        this.properties,
        this.context
      );

      // Get matching battle cards/plays
      const matchingCards = this.getMatchingBattleCards();

      // Get matching presentations
      const matchingPresentations = this.presentationsModule?.getMatching() || [];

      log('Matching rules:', matchingRules.length, 'cards:', matchingCards.length, 'presentations:', matchingPresentations.length);

      // Render banners via module
      if (this.bannersModule && this.settings.showBanners && matchingRules.length > 0) {
        this.bannersModule.render(matchingRules);
      }

      // Render presentations via module
      if (this.presentationsModule && this.settings.showPresentations !== false && matchingPresentations.length > 0) {
        this.presentationsModule.render(matchingPresentations);
      }

      // Render FAB via module
      if (this.sidePanelModule && this.settings.showBattleCards && matchingCards.length > 0) {
        this.sidePanelModule.renderFAB(matchingCards.length);
      }

      // Apply wiki highlighting via module
      if (this.wikiModule && this.settings.showWiki !== false && this.wikiEntries.length > 0) {
        // Apply with delays for lazy-loaded content
        setTimeout(() => this.wikiModule.apply(), 500);
        setTimeout(() => this.wikiModule.apply(), 1500);
        setTimeout(() => this.wikiModule.apply(), 3000);
      }

      // Notify sidepanel of updated cards
      this.notifySidePanel(matchingCards);
    }

    /**
     * Send updated cards to the sidepanel if it's open
     */
    notifySidePanel(cards) {
      chrome.runtime.sendMessage({
        action: 'updateSidePanelCards',
        cards: cards
      }).catch(() => {
        // Sidepanel might not be open, ignore error
      });
    }

    /**
     * Get battle cards that match current page context
     */
    getMatchingBattleCards() {
      const currentType = this.context.objectType; // e.g., 'deal', 'contact'
      log('Getting matching cards for objectType:', currentType);

      // Normalize object type to singular form
      const normalizeType = (type) => {
        if (!type) return null;
        const t = type.toLowerCase();
        // Map plural to singular
        const pluralMap = {
          'contacts': 'contact',
          'companies': 'company',
          'deals': 'deal',
          'tickets': 'ticket'
        };
        return pluralMap[t] || t;
      };

      return this.battleCards.filter(card => {
        log(`Checking card "${card.name}": objectType=${card.objectType}, objectTypes=${JSON.stringify(card.objectTypes)}`);

        // Check object type filter (array form)
        if (card.objectTypes?.length) {
          const matches = card.objectTypes.some(t => normalizeType(t) === currentType);
          if (!matches) return false;
        }

        // Check singular objectType field (from admin panel)
        if (card.objectType) {
          if (normalizeType(card.objectType) !== currentType) return false;
        }

        if (card.displayOnAll) return true;
        if (!card.conditions || card.conditions.length === 0) return true;
        return this.rulesEngine.evaluateRule(
          { conditions: card.conditions, logic: card.logic || 'AND' },
          this.properties
        );
      });
    }

    /**
     * Find injection target for inline content (banners, presentations)
     */
    findInjectTarget() {
      // Find visible tab content
      const tabContents = document.querySelectorAll('[data-test-id^="tab-"][data-test-id$="-content"]');
      let visibleTab = null;

      for (const tab of tabContents) {
        if (tab.offsetHeight > 0 && tab.offsetWidth > 0) {
          visibleTab = tab;
          break;
        }
      }

      if (!visibleTab) {
        return document.querySelector('[data-test-id="middle-pane"]') || document.body;
      }

      // Find scroll container within visible tab
      const scrollContainer = visibleTab.querySelector('[class*="ScrollContainer"]');
      const searchRoot = scrollContainer || visibleTab;

      // Find card container with most children
      const cards = searchRoot.querySelectorAll('[data-test-id*="card-wrapper"]');
      let bestContainer = null;
      let maxChildren = 0;

      for (const card of cards) {
        let parent = card.parentElement;
        for (let i = 0; i < 5; i++) {
          if (parent && parent.children.length > maxChildren && searchRoot.contains(parent)) {
            maxChildren = parent.children.length;
            bestContainer = parent;
          }
          parent = parent?.parentElement;
        }
      }

      if (bestContainer && maxChildren > 3) {
        return bestContainer;
      }

      return scrollContainer || visibleTab;
    }

    // ============ CHANGE MONITORING ============

    /**
     * Set up watchers for SPA navigation and DOM changes
     */
    watchForChanges() {
      // URL change observer (SPA navigation)
      let lastUrl = window.location.href;
      const urlObserver = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
          log('URL changed from', lastUrl, 'to', window.location.href);
          lastUrl = window.location.href;
          this.cleanup(true);
          setTimeout(() => this.init(), 1000);
        }
      });
      urlObserver.observe(document.body, { childList: true, subtree: true });

      // Tab click observer
      const middlePane = document.querySelector('[data-test-id="middle-pane"]');
      if (middlePane) {
        middlePane.addEventListener('click', (e) => {
          const target = e.target.closest('[role="tab"], [class*="Tab"], button');
          if (target) {
            setTimeout(() => {
              const banner = document.getElementById('hshelper-banners');
              if (!banner || !banner.offsetParent) {
                this.render();
              }
            }, 300);
          }
        });
      }

      // Association link clicks
      document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a[href*="/record/"]');
        if (link) {
          log('Association link clicked, will re-init after navigation');
        }
      });

      // Browser back/forward
      window.addEventListener('popstate', () => {
        log('Popstate event - browser navigation detected');
        this.cleanup(true);
        setTimeout(() => this.init(), 500);
      });

      // Property change observer
      const propertyObserver = new MutationObserver(() => {
        clearTimeout(this.propertyUpdateTimeout);
        this.propertyUpdateTimeout = setTimeout(() => {
          const oldProps = JSON.stringify(this.properties);
          this.extractPageData();
          if (JSON.stringify(this.properties) !== oldProps) {
            this.render();
          }
        }, 500);
      });

      const sidebar = document.querySelector('[data-selenium-test="highlightedPropertySidebar"]');
      if (sidebar) {
        propertyObserver.observe(sidebar, { childList: true, subtree: true, characterData: true });
      }

      // Wiki observer for lazy-loaded content (record pages only)
      if (this.wikiModule && !this.isIndexPage()) {
        this.wikiModule.setupObserver();
      }

      // Storage change listener
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          if (changes.rules || changes.battleCards || changes.wikiEntries || changes.settings) {
            log('Storage changed, reloading data');
            this.loadData().then(() => this.render());
          }
        }
      });
    }

    /**
     * Set up message listener for side panel communication
     */
    setupMessageListener() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'getMatchingCards') {
          log('Side panel requested cards');
          const matchingCards = this.getMatchingBattleCards();
          log('Sending', matchingCards.length, 'cards to side panel');
          sendResponse({ cards: matchingCards });
        }
        return true;
      });
    }

    // ============ CLEANUP ============

    /**
     * Remove all UI elements
     * @param {boolean} removeWiki - Also remove wiki highlighting
     */
    cleanup(removeWiki = false) {
      // Remove main container
      const existing = document.getElementById('hshelper-container');
      if (existing) existing.remove();

      // Clean up modules
      if (this.bannersModule) this.bannersModule.cleanup();
      if (this.presentationsModule) this.presentationsModule.cleanup();
      if (this.sidePanelModule) this.sidePanelModule.cleanup();

      // Remove Q360 link
      const q360Link = document.querySelector('.hshelper-q360-link');
      if (q360Link) q360Link.remove();

      // Wiki cleanup
      if (removeWiki && this.wikiModule) {
        this.wikiModule.cleanup();
      }
    }

    // ============ UTILITIES ============

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    /**
     * Sanitize rich text HTML, allowing only safe tags
     */
    sanitizeRichText(html) {
      if (!html) return '';

      const temp = document.createElement('div');
      temp.innerHTML = html;

      const allowedTags = {
        'b': [], 'strong': [], 'i': [], 'em': [], 'u': [],
        'a': ['href', 'target', 'rel'],
        'ul': [], 'ol': [], 'li': [],
        'br': [], 'p': [], 'span': []
      };

      const sanitizeNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return document.createTextNode(node.textContent);
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return null;
        }

        const tagName = node.tagName.toLowerCase();

        if (!allowedTags[tagName]) {
          const fragment = document.createDocumentFragment();
          node.childNodes.forEach(child => {
            const sanitized = sanitizeNode(child);
            if (sanitized) fragment.appendChild(sanitized);
          });
          return fragment;
        }

        const newElement = document.createElement(tagName);
        const allowedAttrs = allowedTags[tagName];
        allowedAttrs.forEach(attr => {
          if (node.hasAttribute(attr)) {
            let value = node.getAttribute(attr);
            if (attr === 'href') {
              if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('mailto:')) {
                return;
              }
            }
            newElement.setAttribute(attr, value);
          }
        });

        if (tagName === 'a') {
          newElement.setAttribute('target', '_blank');
          newElement.setAttribute('rel', 'noopener noreferrer');
        }

        node.childNodes.forEach(child => {
          const sanitized = sanitizeNode(child);
          if (sanitized) newElement.appendChild(sanitized);
        });

        return newElement;
      };

      const result = document.createDocumentFragment();
      temp.childNodes.forEach(child => {
        const sanitized = sanitizeNode(child);
        if (sanitized) result.appendChild(sanitized);
      });

      const output = document.createElement('div');
      output.appendChild(result);
      return output.innerHTML;
    }
  }

  // ============ INITIALIZATION ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new HubSpotHelper());
  } else {
    new HubSpotHelper();
  }
})();
