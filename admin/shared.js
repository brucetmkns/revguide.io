/**
 * RevGuide - Shared Admin Utilities
 * Common functionality for all admin pages
 */

/**
 * Detect if running in Chrome extension context or web context
 */
const isExtensionContext = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

/**
 * Current user info (populated by checkAuth)
 */
let currentUser = null;
let currentOrganization = null;

/**
 * Session cache keys
 */
const SESSION_CACHE_KEY = 'revguide_user_cache';
const SESSION_AUTH_KEY = 'revguide_auth_validated';
const SESSION_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Load user data from session cache (synchronous for immediate use)
 */
function loadUserFromCache() {
  try {
    const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (cached) {
      const { user, organization, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < SESSION_CACHE_TTL) {
        currentUser = user;
        currentOrganization = organization;
        return true;
      }
    }
  } catch (e) {
    console.warn('Failed to load user cache:', e);
  }
  return false;
}

/**
 * Save user data to session cache
 */
function saveUserToCache() {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
      user: currentUser,
      organization: currentOrganization,
      timestamp: Date.now()
    }));
    // Mark that auth has been validated this session
    sessionStorage.setItem(SESSION_AUTH_KEY, Date.now().toString());
  } catch (e) {
    console.warn('Failed to save user cache:', e);
  }
}

/**
 * Check if auth was already validated this browser session
 */
function isAuthValidatedThisSession() {
  try {
    const validated = sessionStorage.getItem(SESSION_AUTH_KEY);
    if (validated) {
      const timestamp = parseInt(validated, 10);
      // Valid for 10 minutes
      return Date.now() - timestamp < SESSION_CACHE_TTL;
    }
  } catch (e) {}
  return false;
}

/**
 * Clear user cache (call on logout or when data changes)
 */
function clearUserCache() {
  try {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
    sessionStorage.removeItem(SESSION_AUTH_KEY);
  } catch (e) {
    // Ignore
  }
}

/**
 * Check if user is authenticated
 * Uses aggressive caching to avoid repeated API calls within session
 * @returns {Promise<boolean>}
 */
async function checkAuth() {
  // In extension context, skip auth for now
  if (isExtensionContext) {
    return true;
  }

  // FAST PATH: If we have cached user data and auth was validated this session,
  // trust it completely without any API calls
  if (loadUserFromCache() && isAuthValidatedThisSession()) {
    console.log('[Auth] Using cached auth (no API calls)');
    // Update sidebar immediately with cached data
    renderSidebar();
    return true;
  }

  // SLOW PATH: Need to validate with Supabase
  if (typeof RevGuideAuth !== 'undefined') {
    try {
      console.log('[Auth] Validating with Supabase...');
      const { data: { session } } = await RevGuideAuth.getSession();
      if (!session) {
        clearUserCache();
        window.location.href = '/login';
        return false;
      }

      // If we have cached user data but session just validated, reuse cache
      if (currentUser && currentOrganization) {
        console.log('[Auth] Session valid, using existing user cache');
        saveUserToCache(); // Update timestamp
        return true;
      }

      // No cache - fetch from database
      console.log('[Auth] Fetching user profile from database...');
      try {
        const { data: profile, error } = await RevGuideDB.getUserProfile();
        if (profile) {
          currentUser = profile;
          currentOrganization = profile.organizations;
          saveUserToCache();
        } else if (error) {
          console.warn('Failed to load user profile:', error);
          const { data: { user } } = await RevGuideAuth.getUser();
          if (user) {
            currentUser = { email: user.email, auth_user_id: user.id };
            saveUserToCache();
          }
        }
      } catch (profileError) {
        console.warn('Error loading user profile:', profileError);
        const { data: { user } } = await RevGuideAuth.getUser();
        if (user) {
          currentUser = { email: user.email, auth_user_id: user.id };
          saveUserToCache();
        }
      }

      return true;
    } catch (e) {
      console.error('Auth check failed:', e);
      clearUserCache();
      window.location.href = '/login';
      return false;
    }
  }

  return true;
}

/**
 * Sign out the current user
 */
async function signOut() {
  if (typeof RevGuideAuth !== 'undefined') {
    clearUserCache();
    currentUser = null;
    currentOrganization = null;
    await RevGuideAuth.signOut();
    window.location.href = '/login';
  }
}

/**
 * Refresh the user cache (call after updating user/org data)
 */
function refreshUserCache() {
  saveUserToCache();
}

/**
 * Renders the sidebar navigation
 * @param {string} activePage - The currently active page identifier
 */
function renderSidebar(activePage) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Update only the text content of pre-rendered elements (no innerHTML replacement)
  // This prevents the distracting flash on page navigation
  if (!isExtensionContext && currentUser) {
    const avatarEl = document.getElementById('sidebarUserAvatar');
    const nameEl = document.getElementById('sidebarUserName');
    const orgEl = document.getElementById('sidebarUserOrg');

    if (avatarEl) {
      avatarEl.textContent = (currentUser.name || currentUser.email || '?')[0].toUpperCase();
    }
    if (nameEl) {
      nameEl.textContent = currentUser.name || currentUser.email?.split('@')[0] || 'User';
    }
    if (orgEl) {
      orgEl.textContent = currentOrganization?.name || '';
    }
  }

  // For extension context, update URLs to use .html extension
  if (isExtensionContext) {
    sidebar.querySelectorAll('.nav-item').forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/')) {
        link.setAttribute('href', href.slice(1) + '.html');
      }
    });
  }
}

/**
 * Load data from Chrome storage or Supabase (web context)
 * @returns {Promise<Object>} The stored data
 */
async function loadStorageData() {
  const defaults = {
    rules: [],
    battleCards: [],
    presentations: [],
    wikiEntries: [],
    invitedUsers: [],
    settings: {
      enabled: true,
      showBanners: true,
      showBattleCards: true,
      showPresentations: true,
      showWiki: true,
      showAdminLinks: true,
      bannerPosition: 'top'
    }
  };

  // In web context, load from Supabase
  if (!isExtensionContext && typeof RevGuideDB !== 'undefined') {
    try {
      const [wikiResult, bannersResult, playsResult] = await Promise.all([
        RevGuideDB.getWikiEntries(),
        RevGuideDB.getBanners(),
        RevGuideDB.getPlays()
      ]);

      return {
        wikiEntries: wikiResult.data || [],
        rules: bannersResult.data || [],
        battleCards: playsResult.data || [],
        presentations: [],
        invitedUsers: [],
        settings: defaults.settings
      };
    } catch (e) {
      console.error('Failed to load from Supabase:', e);
      return defaults;
    }
  }

  // In extension context, use Chrome storage
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, (data) => {
      resolve(data);
    });
  });
}

/**
 * Save data to Chrome storage or Supabase (web context)
 * @param {Object} data - The data to save
 * @returns {Promise<void>}
 */
async function saveStorageData(data) {
  // In web context, save to Supabase
  if (!isExtensionContext && typeof RevGuideDB !== 'undefined') {
    try {
      // Save wiki entries
      if (data.wikiEntries !== undefined) {
        // Note: For now, we handle individual creates/updates in page JS
        // This function will be enhanced for bulk operations later
        console.log('Wiki entries will be synced individually');
      }
      // Save banners (rules)
      if (data.rules !== undefined) {
        console.log('Banners will be synced individually');
      }
      // Save plays (battleCards)
      if (data.battleCards !== undefined) {
        console.log('Plays will be synced individually');
      }
      return;
    } catch (e) {
      console.error('Failed to save to Supabase:', e);
      throw e;
    }
  }

  // In extension context, use Chrome storage
  // If wikiEntries are being saved, also build and cache the term map
  if (data.wikiEntries) {
    const cacheData = buildWikiTermMapCache(data.wikiEntries);
    data.wikiTermMapCache = cacheData.termMap;
    data.wikiEntriesById = cacheData.entriesById;
    data.wikiCacheVersion = Date.now();
  }

  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

/**
 * Get installed libraries tracking data
 * @returns {Promise<Object>}
 */
async function getInstalledLibraries() {
  // In web context, installed libraries could be stored in Supabase (future)
  // For now, use localStorage as fallback
  if (!isExtensionContext) {
    const stored = localStorage.getItem('revguide-installed-libraries');
    return stored ? JSON.parse(stored) : {};
  }

  return new Promise((resolve) => {
    chrome.storage.local.get('installedLibraries', (result) => {
      resolve(result.installedLibraries || {});
    });
  });
}

/**
 * Save installed libraries tracking data
 * @param {Object} libraries
 * @returns {Promise<void>}
 */
async function saveInstalledLibraries(libraries) {
  // In web context, use localStorage as fallback
  if (!isExtensionContext) {
    localStorage.setItem('revguide-installed-libraries', JSON.stringify(libraries));
    return;
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({ installedLibraries: libraries }, resolve);
  });
}

/**
 * Build a pre-computed term map cache from wiki entries
 * This cache is stored in Chrome storage and loaded directly by content scripts,
 * eliminating the need to rebuild the map on every page load.
 *
 * @param {Array} wikiEntries - Array of wiki entry objects
 * @returns {Object} - { termMap: Object, entriesById: Object }
 */
function buildWikiTermMapCache(wikiEntries) {
  const termMap = {};  // lowercase trigger -> entry ID
  const entriesById = {};  // entry ID -> entry object (for enabled entries only)

  const enabledEntries = (wikiEntries || []).filter(e => e.enabled !== false);

  for (const entry of enabledEntries) {
    // Store entry by ID for quick lookup
    entriesById[entry.id] = entry;

    // Skip entries without a trigger (glossary-only entries)
    const primaryTrigger = entry.trigger || entry.term;
    if (!primaryTrigger) continue;

    // Build trigger list: primary trigger + aliases
    const triggers = [primaryTrigger, ...(entry.aliases || [])];

    for (const trigger of triggers) {
      if (trigger && trigger.trim()) {
        const key = trigger.toLowerCase().trim();
        // Store entry ID (not full entry) to keep cache lightweight
        termMap[key] = entry.id;
      }
    }
  }

  return { termMap, entriesById };
}

/**
 * Generate a unique ID
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'success' | 'error' | 'info'
 */
function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    z-index: 10000;
    animation: slideIn 0.3s ease;
    background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Operator definitions for conditions
 */
const OPERATORS = [
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

/**
 * Type labels and colors
 */
const TYPE_LABELS = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  embed: 'Embed'
};

const TYPE_COLORS = {
  info: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  embed: '#8b5cf6'
};

/**
 * Card type icons
 */
const CARD_TYPE_ICONS = {
  competitor: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>',
  objection: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  tip: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  process: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>'
};

const CARD_TYPE_LABELS = {
  competitor: 'Competitor',
  objection: 'Objection',
  tip: 'Tip',
  process: 'Process'
};

/**
 * Wiki category icons and labels
 */
const WIKI_CATEGORY_ICONS = {
  general: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  sales: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  marketing: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
  product: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  process: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/></svg>',
  field: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>'
};

const WIKI_CATEGORY_LABELS = {
  general: 'General',
  sales: 'Sales',
  marketing: 'Marketing',
  product: 'Product',
  process: 'Process',
  field: 'HubSpot Field'
};

/**
 * Escape HTML entities
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Notify content script of data changes
 */
function notifyContentScript() {
  // Only works in extension context
  if (isExtensionContext) {
    chrome.runtime.sendMessage({ action: 'refreshUI' });
  }
  // In web context, Supabase realtime handles sync
}

/**
 * Fetch properties for an object type via background script
 * @param {string} objectType
 * @param {Object} propertiesCache - Cache object to store results
 * @returns {Promise<Array>}
 */
async function fetchProperties(objectType, propertiesCache = {}) {
  if (propertiesCache[objectType]) {
    return propertiesCache[objectType];
  }

  // In web context, use HubSpot OAuth proxy
  if (!isExtensionContext) {
    // Check if RevGuideHubSpot is available
    if (typeof RevGuideHubSpot === 'undefined') {
      console.error('RevGuideHubSpot not loaded');
      return [];
    }

    try {
      // Get connection to get connectionId
      const connection = await RevGuideHubSpot.getConnection();
      if (!connection || !connection.isConnected) {
        console.log('HubSpot not connected - cannot fetch properties');
        return [];
      }

      // Fetch properties via proxy
      const properties = await RevGuideHubSpot.getProperties(connection.connectionId, objectType);
      propertiesCache[objectType] = properties;
      return properties;
    } catch (error) {
      console.error('Failed to fetch properties via HubSpot OAuth:', error);
      return [];
    }
  }

  // In extension context, use background script
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'fetchObjectProperties', objectType },
      (response) => {
        if (response?.success) {
          propertiesCache[objectType] = response.data;
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Failed to fetch properties'));
        }
      }
    );
  });
}

/**
 * Initialize a searchable select dropdown
 * @param {HTMLElement} selectEl - The .searchable-select element
 * @param {Array} properties - Array of property objects
 */
function initSearchableSelect(selectEl, properties) {
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
      filterSearchableOptions(optionsContainer, '');
      searchInput.focus();
    }
  });

  // Search filter
  searchInput.addEventListener('input', () => {
    filterSearchableOptions(optionsContainer, searchInput.value);
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

/**
 * Filter searchable select options
 * @param {HTMLElement} container
 * @param {string} query
 */
function filterSearchableOptions(container, query) {
  const normalizedQuery = query.toLowerCase().trim();
  container.querySelectorAll('.searchable-select-option').forEach(option => {
    const label = option.dataset.label.toLowerCase();
    const value = option.dataset.value.toLowerCase();
    const matches = !normalizedQuery || label.includes(normalizedQuery) || value.includes(normalizedQuery);
    option.style.display = matches ? 'flex' : 'none';
  });
}

/**
 * Initialize a play select dropdown
 * @param {HTMLElement} selectEl - The .play-select element
 * @param {Array} plays - Array of play objects from battleCards storage
 * @param {Function} onChange - Callback when selection changes
 */
function initPlaySelect(selectEl, plays, onChange = null) {
  const trigger = selectEl.querySelector('.play-select-trigger');
  const dropdown = selectEl.querySelector('.play-select-dropdown');
  const searchInput = selectEl.querySelector('.play-select-input');
  const optionsContainer = selectEl.querySelector('.play-select-options');
  const labelSpan = trigger.querySelector('.select-label');

  // Build options HTML
  const optionsHtml = `
    <div class="play-select-option" data-value="" data-label="None">
      <span class="option-label">None</span>
      <span class="option-subtitle">No related play</span>
    </div>
    ${plays.map(p => `
      <div class="play-select-option" data-value="${p.id}" data-label="${escapeHtml(p.name)}">
        <span class="option-label">${escapeHtml(p.name)}</span>
        <span class="option-subtitle">${escapeHtml(p.subtitle || CARD_TYPE_LABELS[p.cardType] || p.cardType || '')}</span>
      </div>
    `).join('')}
  `;
  optionsContainer.innerHTML = optionsHtml;

  // Toggle dropdown
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = selectEl.classList.contains('open');

    // Close all other dropdowns
    document.querySelectorAll('.play-select.open, .searchable-select.open').forEach(el => {
      el.classList.remove('open');
    });

    if (!isOpen) {
      selectEl.classList.add('open');
      searchInput.value = '';
      filterPlayOptions(optionsContainer, '');
      searchInput.focus();
    }
  });

  // Search filter
  searchInput.addEventListener('input', () => {
    filterPlayOptions(optionsContainer, searchInput.value);
  });

  // Option selection
  optionsContainer.addEventListener('click', (e) => {
    const option = e.target.closest('.play-select-option');
    if (option) {
      const value = option.dataset.value;
      const label = option.dataset.label;

      trigger.dataset.value = value;
      labelSpan.textContent = label || 'None';

      // Update selected state
      optionsContainer.querySelectorAll('.play-select-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });

      selectEl.classList.remove('open');

      if (onChange) onChange(value);
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

/**
 * Filter play select options
 * @param {HTMLElement} container
 * @param {string} query
 */
function filterPlayOptions(container, query) {
  const normalizedQuery = query.toLowerCase().trim();
  container.querySelectorAll('.play-select-option').forEach(option => {
    const label = (option.dataset.label || '').toLowerCase();
    const subtitle = option.querySelector('.option-subtitle')?.textContent?.toLowerCase() || '';
    const matches = !normalizedQuery || label.includes(normalizedQuery) || subtitle.includes(normalizedQuery);
    option.style.display = matches ? 'flex' : 'none';
  });
}

/**
 * Set the selected play in a play select dropdown
 * @param {HTMLElement} selectEl - The .play-select element
 * @param {string} playId - The play ID to select (or empty string for none)
 * @param {Array} plays - Array of play objects
 */
function setPlaySelectValue(selectEl, playId, plays) {
  const trigger = selectEl.querySelector('.play-select-trigger');
  const labelSpan = trigger.querySelector('.select-label');
  const optionsContainer = selectEl.querySelector('.play-select-options');

  trigger.dataset.value = playId || '';

  if (playId) {
    const play = plays.find(p => p.id === playId);
    labelSpan.textContent = play ? play.name : 'Unknown Play';
  } else {
    labelSpan.textContent = 'None';
  }

  // Update selected state
  optionsContainer.querySelectorAll('.play-select-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.value === (playId || ''));
  });
}

/**
 * Get the selected play ID from a play select dropdown
 * @param {HTMLElement} selectEl - The .play-select element
 * @returns {string} The selected play ID or empty string
 */
function getPlaySelectValue(selectEl) {
  const trigger = selectEl.querySelector('.play-select-trigger');
  return trigger.dataset.value || '';
}

/**
 * Add a condition row to the conditions builder
 * @param {string} containerId - ID of the conditions container
 * @param {Object|null} condition - Existing condition data or null for new
 * @param {Array} properties - Array of property objects
 */
function addCondition(containerId, condition = null, properties = []) {
  const container = document.getElementById(containerId);
  const div = document.createElement('div');
  div.className = 'condition-row';

  const selectedProp = condition?.property ? properties.find(p => p.name === condition.property) : null;
  const selectedLabel = selectedProp ? selectedProp.label : 'Select property...';

  div.innerHTML = `
    <div class="searchable-select" data-properties='${JSON.stringify(properties.map(p => ({name: p.name, label: p.label, type: p.type})))}'>
      <button type="button" class="searchable-select-trigger" data-value="${condition?.property || ''}">
        <span class="select-label">${escapeHtml(selectedLabel)}</span>
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
            <div class="searchable-select-option ${condition?.property === p.name ? 'selected' : ''}" data-value="${p.name}" data-label="${escapeHtml(p.label)}">
              <span class="option-label">${escapeHtml(p.label)}</span>
              <span class="option-name">${p.name}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    <select class="condition-operator">
      ${OPERATORS.map(op => `
        <option value="${op.value}" ${condition?.operator === op.value ? 'selected' : ''}>${op.label}</option>
      `).join('')}
    </select>
    <input type="text" class="condition-value" placeholder="Value" value="${escapeHtml(condition?.value || '')}">
    <button class="btn-icon btn-icon-danger remove-condition-btn" title="Remove">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;

  // Set up searchable select
  initSearchableSelect(div.querySelector('.searchable-select'), properties);

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

/**
 * Get conditions from a conditions container
 * @param {string} containerId
 * @returns {Array}
 */
function getConditions(containerId) {
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

/**
 * Get logic value from a toggle
 * @param {string} toggleId
 * @returns {string}
 */
function getLogic(toggleId) {
  const toggle = document.getElementById(toggleId);
  const activeBtn = toggle.querySelector('.logic-btn.active');
  return activeBtn ? activeBtn.dataset.value : 'AND';
}

/**
 * Set logic value on a toggle
 * @param {string} toggleId
 * @param {string} value
 */
function setLogic(toggleId, value) {
  const toggle = document.getElementById(toggleId);
  toggle.querySelectorAll('.logic-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

/**
 * Initialize logic toggle buttons
 * @param {string} toggleId
 */
function initLogicToggle(toggleId) {
  document.getElementById(toggleId).addEventListener('click', (e) => {
    const btn = e.target.closest('.logic-btn');
    if (btn) {
      document.querySelectorAll(`#${toggleId} .logic-btn`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  });
}

/**
 * Toggle conditions wrapper visibility
 * @param {string} wrapperId
 * @param {boolean} disabled
 */
function toggleConditionsWrapper(wrapperId, disabled) {
  const wrapper = document.getElementById(wrapperId);
  if (wrapper) {
    if (disabled) {
      wrapper.classList.add('conditions-wrapper-disabled');
    } else {
      wrapper.classList.remove('conditions-wrapper-disabled');
    }
  }
}

/**
 * Initialize rich text editor toolbar
 * @param {string} toolbarSelector - CSS selector for toolbar
 * @param {string} editorId - ID of the contenteditable element
 * @param {Function} onInput - Callback for input changes
 */
function initRichTextEditor(toolbarSelector, editorId, onInput) {
  const toolbar = document.querySelector(toolbarSelector);
  if (!toolbar) return;

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.toolbar-btn');
    if (!btn) return;

    e.preventDefault();
    const command = btn.dataset.command;

    // Focus the editor
    document.getElementById(editorId).focus();

    if (command === 'createLink') {
      const url = prompt('Enter URL:', 'https://');
      if (url) {
        document.execCommand(command, false, url);
      }
    } else {
      document.execCommand(command, false, null);
    }

    if (onInput) onInput();
  });
}

/**
 * Convert URL to embed format
 * @param {string} url
 * @returns {string|null}
 */
function convertToEmbedUrl(url) {
  if (!url) return null;

  // Google Slides
  const googleSlidesMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (googleSlidesMatch) {
    return `https://docs.google.com/presentation/d/${googleSlidesMatch[1]}/embed?start=false&loop=false&delayms=3000`;
  }

  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }

  // Loom
  const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (loomMatch) {
    return `https://www.loom.com/embed/${loomMatch[1]}`;
  }

  // Vimeo
  const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  // OneDrive
  if (url.includes('onedrive.live.com') || url.includes('1drv.ms')) {
    if (url.includes('/embed')) return url;
    const residMatch = url.match(/resid=([^&]+)/);
    const authkeyMatch = url.match(/authkey=([^&]+)/);
    if (residMatch) {
      let embedUrl = `https://onedrive.live.com/embed?resid=${residMatch[1]}`;
      if (authkeyMatch) embedUrl += `&authkey=${authkeyMatch[1]}`;
      embedUrl += '&em=2';
      return embedUrl;
    }
    if (url.includes('1drv.ms')) return url;
  }

  // SharePoint
  if (url.includes('.sharepoint.com')) {
    if (url.includes('/embed') || url.includes('action=embedview')) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}action=embedview`;
  }

  // Office Online
  if (url.includes('office.com') || url.includes('officeapps.live.com')) {
    return url;
  }

  // Already embed or https
  if (url.includes('/embed') || url.includes('action=embedview')) return url;
  if (url.startsWith('https://')) return url;

  return null;
}

/**
 * Show a confirmation dialog
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Dialog message
 * @param {string} options.primaryLabel - Primary button label (default: 'Save')
 * @param {string} options.secondaryLabel - Secondary button label (default: 'Discard')
 * @param {string} options.cancelLabel - Cancel button label (default: 'Cancel')
 * @param {boolean} options.showCancel - Whether to show cancel button (default: true)
 * @returns {Promise<'primary'|'secondary'|'cancel'>}
 */
function showConfirmDialog({ title, message, primaryLabel = 'Save', secondaryLabel = 'Discard', cancelLabel = 'Cancel', showCancel = true }) {
  return new Promise((resolve) => {
    // Remove existing dialog
    const existingDialog = document.querySelector('.confirm-dialog-overlay');
    if (existingDialog) existingDialog.remove();

    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';

    overlay.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-dialog-header">
          <h3>${escapeHtml(title)}</h3>
        </div>
        <div class="confirm-dialog-body">
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="confirm-dialog-footer">
          <button class="btn btn-secondary confirm-dialog-secondary">${escapeHtml(secondaryLabel)}</button>
          <div class="confirm-dialog-actions">
            ${showCancel ? `<button class="btn btn-secondary confirm-dialog-cancel">${escapeHtml(cancelLabel)}</button>` : ''}
            <button class="btn btn-primary confirm-dialog-primary">${escapeHtml(primaryLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector('.confirm-dialog-primary').addEventListener('click', () => cleanup('primary'));
    overlay.querySelector('.confirm-dialog-secondary').addEventListener('click', () => cleanup('secondary'));
    if (showCancel) {
      overlay.querySelector('.confirm-dialog-cancel').addEventListener('click', () => cleanup('cancel'));
    }

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup('cancel');
    });

    // Close on Escape key
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleKeydown);
        cleanup('cancel');
      }
    };
    document.addEventListener('keydown', handleKeydown);

    document.body.appendChild(overlay);

    // Focus primary button
    overlay.querySelector('.confirm-dialog-primary').focus();
  });
}

// Export for use in page scripts
window.AdminShared = {
  // Context detection
  isExtensionContext,
  // Auth
  checkAuth,
  signOut,
  refreshUserCache,
  get currentUser() { return currentUser; },
  get currentOrganization() { return currentOrganization; },
  // UI
  renderSidebar,
  loadStorageData,
  saveStorageData,
  getInstalledLibraries,
  saveInstalledLibraries,
  buildWikiTermMapCache,
  generateId,
  showToast,
  showConfirmDialog,
  escapeHtml,
  notifyContentScript,
  fetchProperties,
  initSearchableSelect,
  filterSearchableOptions,
  initPlaySelect,
  filterPlayOptions,
  setPlaySelectValue,
  getPlaySelectValue,
  addCondition,
  getConditions,
  getLogic,
  setLogic,
  initLogicToggle,
  toggleConditionsWrapper,
  initRichTextEditor,
  convertToEmbedUrl,
  // Constants
  OPERATORS,
  TYPE_LABELS,
  TYPE_COLORS,
  CARD_TYPE_ICONS,
  CARD_TYPE_LABELS,
  WIKI_CATEGORY_ICONS,
  WIKI_CATEGORY_LABELS
};
