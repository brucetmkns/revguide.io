/**
 * RevGuide - Content Script (Main Orchestrator)
 *
 * This is the main entry point for the RevGuide Chrome extension.
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
  const log = (...args) => DEBUG && console.log('[RevGuide]', ...args);

  // ============ RULES ENGINE ============
  const RulesEngine = globalThis.RevGuideRulesEngine;
  if (!RulesEngine) {
    console.error('[RevGuide] RulesEngine not loaded. Ensure lib/rules-engine.js is included.');
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

      // Load data from storage for ALL HubSpot pages
      await this.loadData();
      log('Loaded rules:', this.rules.length, 'cards:', this.battleCards.length, 'wiki:', this.wikiEntries.length);
      if (this.wikiEntries.length > 0) {
        log('First wiki entry:', JSON.stringify(this.wikiEntries[0]).substring(0, 300));
      }

      // Initialize feature modules
      this.initModules();

      // Always set up wiki highlighting on any HubSpot page
      if (this.wikiModule && this.settings.showWiki !== false && this.wikiEntries?.length > 0) {
        log('Setting up wiki highlighting for page type:', isRecord ? 'record' : isIndex ? 'index' : 'other');

        // Wait for some content to load
        if (isRecord) {
          await this.waitForPageLoad();
        } else if (isIndex) {
          await this.waitForIndexPageLoad();
        } else {
          await this.waitForGenericPageLoad();
        }

        // Apply wiki highlighting with multi-pass for dynamic content
        this.wikiModule.applyForIndex();
        this.wikiModule.setupObserver();

        // Also add scroll listener for pages with virtual scrolling
        if (isIndex) {
          this.wikiModule.setupScrollListener();
        }
      }

      // Initialize index page tags if on an index page
      if (isIndex && this.indexTagsModule) {
        log('Initializing index page tags');
        this.indexTagsModule.init();
      }

      // Exit early if not a record page (wiki and index tags already handled above)
      if (!isRecord) {
        log('Not a record page, wiki highlighting and index tags applied, done');
        return;
      }

      // Record page - full functionality (page load already waited above)
      log('Page loaded, extracting data...');
      this.extractPageData();

      // Fetch additional properties from API for all object types
      if (this.context.objectType && this.context.recordId) {
        log(`Fetching ${this.context.objectType} from API...`);
        await this.fetchRecordFromAPI();
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
      if (typeof IndexTagsModule !== 'undefined') {
        this.indexTagsModule = new IndexTagsModule(this);
      }

      log('Modules initialized:', {
        banners: !!this.bannersModule,
        wiki: !!this.wikiModule,
        sidePanel: !!this.sidePanelModule,
        presentations: !!this.presentationsModule,
        indexTags: !!this.indexTagsModule
      });
    }

    // ============ DATA LOADING ============

    /**
     * Load configuration data - tries cloud first (via background script), falls back to local
     * Also loads pre-built wiki term map cache for faster tooltip initialization
     * Supports CRM portal matching for automatic org detection
     */
    async loadData() {
      // Detect CRM context early to enable portal matching
      const url = window.location.href;
      let portalId = null;
      let crmType = null;

      // HubSpot portal detection
      if (url.includes('hubspot.com')) {
        crmType = 'hubspot';
        const portalMatch = url.match(/\/contacts\/(\d+)\//);
        if (portalMatch) {
          portalId = portalMatch[1];
        }
      }

      // Future: Add detection for other CRMs here
      // if (url.includes('salesforce.com')) { ... }

      log('Detected CRM context:', { crmType, portalId });

      // Get content via background script (handles cloud vs local with portal matching)
      const contentResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'getContent',
          portalId: portalId,
          crmType: crmType
        }, (response) => {
          if (chrome.runtime.lastError) {
            log('Error getting content:', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });

      // Log portal matching result
      if (contentResult?.matchedOrg) {
        log('Content loaded for matched org:', contentResult.matchedOrg.name);
      } else if (contentResult?.usingFallback) {
        log('No org matched portal, using default org');
      }

      // Get settings and wiki cache from local storage
      const localData = await new Promise((resolve) => {
        chrome.storage.local.get({
          presentations: [],
          wikiTermMapCache: null,
          wikiEntriesById: null,
          wikiCacheVersion: 0,
          settings: {
            enabled: true,
            showBanners: true,
            showBattleCards: true,
            showPresentations: true,
            showWiki: true,
            bannerPosition: 'top',
            theme: 'light'
          }
        }, resolve);
      });

      // Use content from background script if available
      if (contentResult && contentResult.content) {
        log('Content loaded from:', contentResult.source);
        const content = contentResult.content;
        this.rules = content.rules || [];
        this.battleCards = content.battleCards || [];
        this.wikiEntries = content.wikiEntries || [];
      } else {
        // Fall back to local storage directly
        log('Content loaded from: local storage fallback');
        const fallbackData = await new Promise((resolve) => {
          chrome.storage.local.get({
            rules: [],
            battleCards: [],
            wikiEntries: []
          }, resolve);
        });
        this.rules = fallbackData.rules;
        this.battleCards = fallbackData.battleCards;
        this.wikiEntries = fallbackData.wikiEntries;
      }

      // Always use local data for presentations and settings
      this.presentations = localData.presentations;
      this.settings = localData.settings;

      // Get auth state to determine if user can edit content
      const authState = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getAuthState' }, (response) => {
          if (chrome.runtime.lastError) {
            log('Error getting auth state:', chrome.runtime.lastError.message);
            resolve({ isAuthenticated: false });
          } else {
            resolve(response || { isAuthenticated: false });
          }
        });
      });

      // Determine if user can edit content (owner, admin, or editor roles)
      const role = authState.profile?.role;
      const canEditContent = role === 'owner' || role === 'admin' || role === 'editor';
      this.settings.canEditContent = canEditContent;
      this.settings.isAuthenticated = authState.isAuthenticated;

      // Store pre-built wiki cache for faster tooltip loading
      this.wikiTermMapCache = localData.wikiTermMapCache;
      this.wikiEntriesById = localData.wikiEntriesById;
      this.wikiCacheVersion = localData.wikiCacheVersion;

      // Also store in sessionStorage for instant subsequent page loads
      if (localData.wikiTermMapCache && localData.wikiEntriesById) {
        try {
          sessionStorage.setItem('hshelper_wikiTermMapCache', JSON.stringify(localData.wikiTermMapCache));
          sessionStorage.setItem('hshelper_wikiEntriesById', JSON.stringify(localData.wikiEntriesById));
          sessionStorage.setItem('hshelper_wikiCacheVersion', String(localData.wikiCacheVersion));
        } catch (e) {
          // SessionStorage may be unavailable or full - not critical
          log('Could not save to sessionStorage:', e.message);
        }
      }
    }

    /**
     * Try to load wiki cache from sessionStorage first (instant, synchronous)
     * Falls back to chrome.storage if not available
     * @returns {boolean} True if session cache was loaded
     */
    tryLoadWikiCacheFromSession() {
      try {
        const cachedVersion = sessionStorage.getItem('hshelper_wikiCacheVersion');
        if (cachedVersion && this.wikiCacheVersion && cachedVersion === String(this.wikiCacheVersion)) {
          // Session cache matches storage version - use it
          const termMapJson = sessionStorage.getItem('hshelper_wikiTermMapCache');
          const entriesByIdJson = sessionStorage.getItem('hshelper_wikiEntriesById');

          if (termMapJson && entriesByIdJson) {
            this.wikiTermMapCache = JSON.parse(termMapJson);
            this.wikiEntriesById = JSON.parse(entriesByIdJson);
            log('Loaded wiki cache from sessionStorage (instant)');
            return true;
          }
        }
      } catch (e) {
        // SessionStorage not available - continue with normal flow
      }
      return false;
    }

    /**
     * Fetch record properties from HubSpot API via background script
     * Works for all object types: contacts, companies, deals, tickets
     */
    async fetchRecordFromAPI() {
      log(`Fetching ${this.context.objectType} from API, recordId:`, this.context.recordId);
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: 'fetchRecordProperties',
            objectType: this.context.objectType,
            recordId: this.context.recordId
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
              log('API properties merged, total properties:', Object.keys(this.properties).length);
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
     * Check if current URL is a HubSpot page where we want wiki-only highlighting
     * This includes: Import pages, Reports, Lists, Workflows, Settings, etc.
     * @returns {boolean}
     */
    isWikiOnlyPage() {
      const url = window.location.href;
      // Match various HubSpot pages where wiki highlighting is useful
      const wikiOnlyPatterns = [
        /\/data-integration-home\//,    // Import pages
        /\/new-import\//,               // Import wizard
        /\/reports\//,                  // Reports
        /\/reports-dashboard\//,        // Report dashboards
        /\/lists\//,                    // Lists
        /\/workflows\//,                // Workflows
        /\/settings\//,                 // Settings pages
        /\/property-settings\//,        // Property settings
        /\/forms\//,                    // Forms
        /\/email\//,                    // Email/Marketing
        /\/sequences\//,                // Sequences
        /\/templates\//,                // Templates
        /\/analytics\//,                // Analytics
        /\/prospecting\//,              // Prospecting workspace
      ];
      return wikiOnlyPatterns.some(pattern => pattern.test(url));
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

    /**
     * Wait for generic HubSpot page to have meaningful content loaded
     * Used for Import pages, Reports, and other wiki-only pages
     */
    async waitForGenericPageLoad() {
      return new Promise((resolve) => {
        const quickCheck = () => {
          // Look for common HubSpot UI elements that indicate page is loaded
          return document.querySelector('[data-test-id]') ||
                 document.querySelector('[data-selenium-test]') ||
                 document.querySelector('main') ||
                 document.querySelector('[class*="Page"]') ||
                 document.querySelector('[class*="Container"]') ||
                 document.querySelector('[role="main"]') ||
                 // Import page specific
                 document.querySelector('[class*="Import"]') ||
                 document.querySelector('[class*="SelectableButton"]') ||
                 document.querySelector('[class*="Card"]');
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
     * Includes CRM type detection for future multi-CRM support
     */
    detectContext() {
      const url = window.location.href;
      const context = {
        objectType: null,
        recordId: null,
        portalId: null,
        crmType: null,
        pipeline: null,
        stage: null
      };

      // HubSpot detection
      if (url.includes('hubspot.com')) {
        context.crmType = 'hubspot';

        // Extract portal ID: /contacts/{portalId}/...
        const portalMatch = url.match(/\/contacts\/(\d+)\//);
        if (portalMatch) {
          context.portalId = portalMatch[1];
        }
      }

      // Future: Salesforce detection
      // if (url.includes('salesforce.com') || url.includes('force.com')) {
      //   context.crmType = 'salesforce';
      //   // Extract org ID from URL
      // }

      // Future: Attio detection
      // if (url.includes('attio.com')) {
      //   context.crmType = 'attio';
      //   // Extract workspace ID from URL
      // }

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

    /**
     * Detect which tab is currently active in the middle pane
     * Returns tab number (1-based) or 'all' if unable to determine
     * @returns {string} Tab number as string ('1', '2', '3', etc.) or 'all'
     */
    detectCurrentTab() {
      // Method 1 (PREFERRED): Use HubSpot's data-test-id which contains the tab number
      // Format: data-test-id="tab-0-content", data-test-id="tab-1-content", etc. (0-indexed)
      const tabContents = document.querySelectorAll('[data-test-id^="tab-"][data-test-id$="-content"]');
      for (const tab of tabContents) {
        if (tab.offsetHeight > 0 && tab.offsetWidth > 0) {
          // Extract tab number from data-test-id (e.g., "tab-0-content" -> 0)
          const match = tab.getAttribute('data-test-id').match(/tab-(\d+)-content/);
          if (match) {
            const tabNumber = parseInt(match[1], 10) + 1; // Convert 0-indexed to 1-indexed
            log('Detected current tab via data-test-id:', tabNumber);
            return String(tabNumber);
          }
        }
      }

      // Method 2: Look for active tab button with aria-selected
      const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
      if (activeTab) {
        // Try to get tab index from the tab's own data-test-id if available
        const tabTestId = activeTab.getAttribute('data-test-id');
        if (tabTestId) {
          const match = tabTestId.match(/tab-(\d+)/);
          if (match) {
            const tabNumber = parseInt(match[1], 10) + 1;
            log('Detected current tab via tab data-test-id:', tabNumber);
            return String(tabNumber);
          }
        }

        // Fall back to counting position in tablist
        const tabList = activeTab.closest('[role="tablist"]');
        if (tabList) {
          // Only count visible tabs (filter out hidden "More" dropdowns or collapsed tabs)
          const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'))
            .filter(tab => tab.offsetWidth > 0 && tab.offsetHeight > 0);
          const index = tabs.indexOf(activeTab);
          if (index >= 0) {
            log('Detected current tab via aria-selected position:', index + 1, 'of', tabs.length, 'visible tabs');
            return String(index + 1);
          }
        }
      }

      // Method 3: Check for tab buttons with active class
      const tabButtons = document.querySelectorAll('[class*="Tab"][class*="active"], [class*="tab"][class*="selected"]');
      if (tabButtons.length > 0) {
        const tabContainer = tabButtons[0].closest('[class*="TabList"], [class*="tabs"]');
        if (tabContainer) {
          const allTabs = Array.from(tabContainer.querySelectorAll('[class*="Tab"]:not([class*="TabList"])'));
          const activeIndex = allTabs.findIndex(t => t.classList.contains('active') || t.classList.contains('selected'));
          if (activeIndex >= 0) {
            log('Detected current tab via active class:', activeIndex + 1);
            return String(activeIndex + 1);
          }
        }
      }

      log('Could not detect current tab, defaulting to all');
      return 'all';
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

      // Filter rules by tab visibility
      const currentTab = this.detectCurrentTab();
      const tabFilteredRules = matchingRules.filter(rule => {
        // If no tabVisibility set or set to 'all', show on all tabs
        if (!rule.tabVisibility || rule.tabVisibility === 'all') {
          return true;
        }
        // Otherwise, only show if current tab matches
        return rule.tabVisibility === currentTab;
      });
      log('Tab filtering: currentTab=', currentTab, 'rules after filter:', tabFilteredRules.length);

      // Get matching battle cards/plays
      const matchingCards = this.getMatchingBattleCards();

      // Get matching presentations
      const matchingPresentations = this.presentationsModule?.getMatching() || [];

      log('Matching rules:', matchingRules.length, '(tab filtered:', tabFilteredRules.length, '), cards:', matchingCards.length, 'presentations:', matchingPresentations.length);

      // Render banners via module (using tab-filtered rules)
      if (this.bannersModule && this.settings.showBanners && tabFilteredRules.length > 0) {
        this.bannersModule.render(tabFilteredRules);
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
        cards: cards,
        properties: this.properties,
        context: this.context
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
      // URL change detection (SPA navigation)
      let lastUrl = window.location.href;

      const handleUrlChange = () => {
        if (window.location.href !== lastUrl) {
          log('URL changed from', lastUrl, 'to', window.location.href);
          lastUrl = window.location.href;
          this.cleanup(true);
          setTimeout(() => this.init(), 1000);
        }
      };

      // Method 1: MutationObserver (catches most SPA navigations)
      const urlObserver = new MutationObserver(handleUrlChange);
      urlObserver.observe(document.body, { childList: true, subtree: true });

      // Method 2: Polling (catches object type dropdown changes that don't trigger mutations)
      setInterval(handleUrlChange, 500);

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

            // If wiki entries changed, invalidate the wiki module's term map cache
            // so it picks up the new pre-built cache on next apply()
            if (changes.wikiEntries && this.wikiModule) {
              this.wikiModule.invalidateTermMapCache();
            }

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
          sendResponse({
            cards: matchingCards,
            properties: this.properties,
            context: this.context
          });
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
      if (this.indexTagsModule) this.indexTagsModule.cleanup();

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
  if (RulesEngine) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => new HubSpotHelper());
    } else {
      new HubSpotHelper();
    }
  }
})();
