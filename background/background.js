/**
 * RevGuide - Background Service Worker
 * Handles messaging between sidepanel and content scripts
 */

console.log('[RevGuide] Service worker starting...');

// ============ AUTH STATE MANAGEMENT ============

/**
 * Listen for external messages from the web app (app.revguide.io)
 * This handles the auth bridge between web app and extension
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[RevGuide BG] External message received:', message.type, 'from:', sender.origin);
  console.log('[RevGuide BG] Full message:', JSON.stringify(message).substring(0, 200));

  // Validate sender origin
  const allowedOrigins = ['https://app.revguide.io', 'http://localhost:5173', 'http://localhost:3000'];
  if (!allowedOrigins.some(origin => sender.origin?.startsWith(origin.replace('*', '')))) {
    console.warn('[RevGuide BG] Message from unauthorized origin:', sender.origin);
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return true;
  }

  if (message.type === 'AUTH_STATE_CHANGED') {
    console.log('[RevGuide BG] Processing AUTH_STATE_CHANGED');
    handleAuthStateChange(message.payload).then(() => {
      console.log('[RevGuide BG] Auth state saved, sending response');
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'AUTH_LOGOUT') {
    handleLogout().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'PING') {
    // Health check from web app
    console.log('[RevGuide BG] PING received, responding with extension ID');
    sendResponse({ success: true, extensionId: chrome.runtime.id });
    return true;
  }

  sendResponse({ success: false, error: 'Unknown message type' });
  return true;
});

/**
 * Handle auth state change from web app
 */
async function handleAuthStateChange(payload) {
  console.log('[RevGuide] Auth state changed, user:', payload.user?.email);

  // Store auth data
  await chrome.storage.local.set({
    authState: {
      isAuthenticated: true,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: payload.expiresAt,
      user: payload.user,
      profile: payload.profile,
      lastUpdated: Date.now()
    }
  });

  // Notify all extension contexts (sidepanel, content scripts)
  chrome.runtime.sendMessage({ action: 'authStateChanged', isAuthenticated: true });

  // Trigger content refresh to load cloud content
  notifyContentScriptsAuthChanged(true);
}

/**
 * Handle logout from web app
 */
async function handleLogout() {
  console.log('[RevGuide] User logged out');

  await chrome.storage.local.remove('authState');

  // Notify all extension contexts
  chrome.runtime.sendMessage({ action: 'authStateChanged', isAuthenticated: false });
  notifyContentScriptsAuthChanged(false);
}

/**
 * Notify content scripts that auth state changed
 */
function notifyContentScriptsAuthChanged(isAuthenticated) {
  chrome.tabs.query({ url: '*://*.hubspot.com/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'authStateChanged',
        isAuthenticated
      }).catch(() => {});
    });
  });
}

/**
 * Get current auth state
 */
async function getAuthState() {
  const { authState } = await chrome.storage.local.get('authState');
  return authState || { isAuthenticated: false };
}

/**
 * Check if auth token is still valid (not expired)
 */
async function isAuthValid() {
  const authState = await getAuthState();
  if (!authState.isAuthenticated || !authState.expiresAt) {
    return false;
  }
  // Add 5 minute buffer before expiry
  return (authState.expiresAt * 1000) > (Date.now() + 5 * 60 * 1000);
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken() {
  const authState = await getAuthState();
  if (!authState.refreshToken) {
    console.log('[RevGuide] No refresh token available');
    return false;
  }

  console.log('[RevGuide] Refreshing access token...');

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: authState.refreshToken
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[RevGuide] Token refresh failed:', response.status, error);
      // Clear auth state on refresh failure - user needs to re-login
      await chrome.storage.local.remove('authState');
      notifyContentScriptsAuthChanged(false);
      return false;
    }

    const data = await response.json();
    console.log('[RevGuide] Token refreshed successfully');

    // Update stored auth state with new tokens
    await chrome.storage.local.set({
      authState: {
        ...authState,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
        lastUpdated: Date.now()
      }
    });

    return true;
  } catch (error) {
    console.error('[RevGuide] Token refresh error:', error);
    return false;
  }
}

/**
 * Ensure we have a valid access token, refreshing if needed
 */
async function ensureValidToken() {
  if (await isAuthValid()) {
    return true;
  }

  console.log('[RevGuide] Token expired or invalid, attempting refresh...');
  return await refreshAccessToken();
}

// ============ SUPABASE API ============

const SUPABASE_URL = 'https://qbdhvhrowmfnacyikkbf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RC5R8c5f-uoyMkoABXCRPg_n3HjyXXS';

/**
 * Make authenticated request to Supabase REST API
 */
async function supabaseFetch(table, options = {}) {
  // Ensure we have a valid token before making the request
  const tokenValid = await ensureValidToken();
  if (!tokenValid) {
    throw new Error('Not authenticated - please log in again');
  }

  const authState = await getAuthState();
  if (!authState.isAuthenticated || !authState.accessToken) {
    throw new Error('Not authenticated');
  }

  const { select = '*', filter = {}, order } = options;

  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`;

  // Add filters
  for (const [key, value] of Object.entries(filter)) {
    url += `&${key}=${encodeURIComponent(value)}`;
  }

  // Add ordering
  if (order) {
    url += `&order=${encodeURIComponent(order)}`;
  }

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${authState.accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Map banner from Supabase snake_case to camelCase
 */
function mapBannerFromSupabase(data) {
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    title: data.title,
    message: data.message,
    type: data.type,
    priority: data.priority,
    objectTypes: data.object_types,
    objectType: data.object_type,
    conditions: data.conditions,
    logic: data.logic,
    displayOnAll: data.display_on_all,
    tabVisibility: data.tab_visibility,
    relatedPlayId: data.related_play_id,
    enabled: data.enabled,
    url: data.url,
    embedUrl: data.embed_url,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

/**
 * Map play from Supabase snake_case to camelCase
 */
function mapPlayFromSupabase(data) {
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

/**
 * Map wiki entry from Supabase snake_case to camelCase
 */
function mapWikiFromSupabase(data) {
  if (!data) return null;
  return {
    id: data.id,
    term: data.term,
    definition: data.definition,
    objectTypes: data.object_types,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

/**
 * Fetch all content (banners, plays, wiki) for the user's organization
 */
async function fetchCloudContent() {
  const authState = await getAuthState();
  if (!authState.isAuthenticated || !authState.profile?.organizationId) {
    console.log('[RevGuide] Cannot fetch cloud content: not authenticated or no org');
    return null;
  }

  const orgId = authState.profile.organizationId;
  console.log('[RevGuide] Fetching cloud content for org:', orgId);

  try {
    // Fetch all content types in parallel
    const [banners, plays, wikiEntries] = await Promise.all([
      supabaseFetch('banners', {
        filter: { 'organization_id': `eq.${orgId}` },
        order: 'priority.desc'
      }),
      supabaseFetch('plays', {
        filter: { 'organization_id': `eq.${orgId}` }
      }),
      supabaseFetch('wiki_entries', {
        filter: { 'organization_id': `eq.${orgId}` }
      })
    ]);

    console.log('[RevGuide] Cloud content fetched:', {
      banners: banners?.length || 0,
      plays: plays?.length || 0,
      wikiEntries: wikiEntries?.length || 0
    });

    // Transform to match local storage format (snake_case to camelCase)
    const content = {
      rules: (banners || []).map(mapBannerFromSupabase),
      battleCards: (plays || []).map(mapPlayFromSupabase),
      wikiEntries: (wikiEntries || []).map(mapWikiFromSupabase)
    };

    // Cache in local storage for offline access
    await chrome.storage.local.set({
      cloudContent: content,
      cloudContentLastFetch: Date.now()
    });

    return content;
  } catch (error) {
    console.error('[RevGuide] Error fetching cloud content:', error);
    return null;
  }
}

/**
 * Get content - from cloud if authenticated, otherwise local
 */
async function getContent() {
  const authState = await getAuthState();

  if (authState.isAuthenticated && authState.profile?.organizationId) {
    // Try to fetch from cloud
    const cloudContent = await fetchCloudContent();
    if (cloudContent) {
      return { source: 'cloud', content: cloudContent };
    }

    // Fall back to cached cloud content
    const { cloudContent: cached } = await chrome.storage.local.get('cloudContent');
    if (cached) {
      return { source: 'cloud-cached', content: cached };
    }
  }

  // Fall back to local content
  const local = await chrome.storage.local.get(['rules', 'battleCards', 'wikiEntries']);
  return { source: 'local', content: local };
}

// ============ ORIGINAL CODE ============

// Check if URL is a HubSpot page
function isHubSpotUrl(url) {
  return url && url.includes('hubspot.com');
}

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    initializeSampleData();
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  console.log('[RevGuide] Extension icon clicked, tab:', tab.id, tab.url);

  // Always open to Plays tab - it will show "Not a HubSpot Page" state on non-HubSpot pages
  chrome.storage.local.set({ sidepanelOpenTab: 'plays' });

  // Always open sidepanel - it will show appropriate content based on the page
  chrome.sidePanel.open({ tabId: tab.id })
    .then(() => console.log('[RevGuide] Side panel opened via icon'))
    .catch(err => console.error('[RevGuide] Error opening side panel:', err));
});

// Initialize sample rules and plays
async function initializeSampleData() {
  const sampleRules = [
    {
      id: 'rule_test_always',
      name: 'Test Banner (Always Shows)',
      title: 'RevGuide is Working!',
      message: 'This test banner confirms the extension is running. You can delete this banner in the admin panel.',
      type: 'success',
      enabled: true,
      priority: 100,
      objectTypes: [], // Empty = all object types
      conditions: [], // Empty = always matches
      logic: 'AND',
      createdAt: Date.now()
    },
    {
      id: 'rule_sample_1',
      name: 'Missing Next Steps',
      title: 'Action Required: Add Next Steps',
      message: 'This deal is missing next steps. Adding clear next steps improves close rates by 30%.',
      type: 'warning',
      enabled: true,
      priority: 10,
      objectTypes: ['deal'],
      conditions: [
        { property: 'next_step', operator: 'is_empty', value: '' }
      ],
      logic: 'AND',
      createdAt: Date.now()
    },
    {
      id: 'rule_sample_2',
      name: 'High Value Deal Alert',
      title: 'High Value Opportunity',
      message: 'This is a high-value deal. Consider involving a senior AE or solution engineer.',
      type: 'info',
      enabled: true,
      priority: 20,
      objectTypes: ['deal'],
      conditions: [
        { property: 'amount', operator: 'greater_than', value: '50000' }
      ],
      logic: 'AND',
      createdAt: Date.now()
    },
    {
      id: 'rule_sample_3',
      name: 'Competitor Mentioned',
      title: 'Competitor Play Available',
      message: 'A competitor was mentioned. Check the plays for talking points.',
      type: 'battle-card',
      enabled: true,
      priority: 15,
      conditions: [
        { property: 'competitor', operator: 'is_not_empty', value: '' }
      ],
      logic: 'AND',
      actions: [
        { type: 'card', label: 'View Play' }
      ],
      createdAt: Date.now()
    }
  ];

  const sampleBattleCards = [
    {
      id: 'card_competitor_1',
      name: 'vs. Competitor A',
      subtitle: 'Enterprise CRM competitor',
      cardType: 'competitor',
      conditions: [
        { property: 'competitor', operator: 'contains', value: 'competitor a' }
      ],
      sections: [
        {
          title: 'Their Strengths',
          content: '- Strong brand recognition\n- Large partner ecosystem\n- Extensive customization options'
        },
        {
          title: 'Their Weaknesses',
          content: '- Complex implementation (6-12 months avg)\n- High total cost of ownership\n- Requires dedicated admin'
        },
        {
          title: 'Our Differentiators',
          content: '- Faster time to value (weeks, not months)\n- More intuitive user experience\n- Better pricing transparency\n- Superior customer support'
        },
        {
          title: 'Winning Questions',
          content: '- "What\'s your timeline for seeing ROI?"\n- "Who will manage the system day-to-day?"\n- "What\'s your budget for ongoing customization?"'
        }
      ],
      createdAt: Date.now()
    },
    {
      id: 'card_objection_1',
      name: 'Price Objection Handler',
      subtitle: 'Common objection response',
      cardType: 'objection',
      conditions: [],
      sections: [
        {
          title: 'When They Say',
          content: '"Your solution is too expensive" or "We can\'t afford this right now"'
        },
        {
          title: 'Understand First',
          content: '- "Help me understand - too expensive compared to what?"\n- "What budget range were you working with?"\n- "What would make this investment worthwhile?"'
        },
        {
          title: 'Reframe Value',
          content: '- Focus on ROI, not cost\n- Calculate cost of inaction\n- Break down to per-user/per-month\n- Highlight hidden costs of alternatives'
        },
        {
          title: 'Proof Points',
          content: '- Average customer sees 3x ROI in first year\n- 40% reduction in manual tasks\n- Reference: Acme Corp saved $200k/year'
        }
      ],
      createdAt: Date.now()
    },
    {
      id: 'card_process_1',
      name: 'Demo Best Practices',
      subtitle: 'Run effective demos',
      cardType: 'tip',
      objectType: 'deal',
      conditions: [
        { property: 'dealstage', operator: 'contains', value: 'demo' }
      ],
      sections: [
        {
          title: 'Before the Demo',
          content: '- Review the prospect\'s website and LinkedIn\n- Check previous notes and emails\n- Prepare 3 custom talking points\n- Test your demo environment'
        },
        {
          title: 'During the Demo',
          content: '- Start with discovery (5 min)\n- Show, don\'t tell (keep it interactive)\n- Focus on their use case, not features\n- Leave time for Q&A'
        },
        {
          title: 'After the Demo',
          content: '- Send summary email within 2 hours\n- Include recording link\n- Propose clear next steps\n- Set follow-up reminder'
        }
      ],
      createdAt: Date.now()
    }
  ];

  const sampleWikiEntries = [
    {
      id: 'wiki_mql',
      term: 'MQL',
      aliases: ['Marketing Qualified Lead', 'marketing qualified lead'],
      category: 'marketing',
      definition: '<p><strong>Marketing Qualified Lead (MQL)</strong></p><p>A lead that has been identified as more likely to become a customer compared to other leads, based on marketing engagement.</p><ul><li>Has engaged with marketing content</li><li>Meets basic demographic criteria</li><li>Shows intent signals but hasn\'t been qualified by sales</li></ul>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    },
    {
      id: 'wiki_sql',
      term: 'SQL',
      aliases: ['Sales Qualified Lead', 'sales qualified lead'],
      category: 'sales',
      definition: '<p><strong>Sales Qualified Lead (SQL)</strong></p><p>A lead that has been qualified by the sales team as having genuine potential to become a customer.</p><ul><li>Has budget and authority</li><li>Has a clear need and timeline</li><li>Has been vetted through discovery</li></ul>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    },
    {
      id: 'wiki_acv',
      term: 'ACV',
      aliases: ['Annual Contract Value', 'annual contract value'],
      category: 'sales',
      definition: '<p><strong>Annual Contract Value (ACV)</strong></p><p>The total annual revenue from a customer contract, normalized to a yearly basis.</p><p>Formula: Total Contract Value / Contract Term in Years</p><p>Example: A 3-year, $90,000 deal has an ACV of $30,000.</p>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    },
    {
      id: 'wiki_arr',
      term: 'ARR',
      aliases: ['Annual Recurring Revenue', 'annual recurring revenue'],
      category: 'sales',
      definition: '<p><strong>Annual Recurring Revenue (ARR)</strong></p><p>The value of recurring revenue normalized to a one-year period. This is a key metric for subscription-based businesses.</p><p>ARR = MRR x 12</p>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    },
    {
      id: 'wiki_pipeline',
      term: 'Pipeline',
      aliases: ['Sales Pipeline', 'sales pipeline', 'deal pipeline'],
      category: 'sales',
      definition: '<p><strong>Sales Pipeline</strong></p><p>A visual representation of where prospects are in the sales process. The pipeline shows deals at each stage from initial contact to closed won.</p><p>Key stages typically include:</p><ul><li>Prospecting</li><li>Qualification</li><li>Demo/Proposal</li><li>Negotiation</li><li>Closed Won/Lost</li></ul>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    },
    {
      id: 'wiki_discovery',
      term: 'Discovery',
      aliases: ['Discovery Call', 'discovery call', 'Discovery Meeting'],
      category: 'process',
      definition: '<p><strong>Discovery Call</strong></p><p>An initial sales conversation focused on understanding the prospect\'s needs, challenges, and goals.</p><p>Key elements:</p><ul><li>Understand their current situation</li><li>Identify pain points and challenges</li><li>Determine budget and timeline</li><li>Identify decision makers</li></ul>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    }
  ];

  // Build pre-computed wiki term map cache for faster tooltip loading
  const wikiCacheData = buildWikiTermMapCacheForBackground(sampleWikiEntries);

  await chrome.storage.local.set({
    rules: sampleRules,
    battleCards: sampleBattleCards,
    wikiEntries: sampleWikiEntries,
    wikiTermMapCache: wikiCacheData.termMap,
    wikiEntriesById: wikiCacheData.entriesById,
    wikiCacheVersion: Date.now(),
    settings: {
      enabled: true,
      showBanners: true,
      showBattleCards: true,
      showWiki: true,
      bannerPosition: 'top',
      theme: 'light'
    }
  });

  console.log('[RevGuide] Sample data initialized with wiki cache');
}

/**
 * Build wiki term map cache (background script version)
 * Mirrors the logic in admin/shared.js buildWikiTermMapCache
 * @param {Array} wikiEntries
 * @returns {Object} { termMap, entriesById }
 */
function buildWikiTermMapCacheForBackground(wikiEntries) {
  const termMap = {};
  const entriesById = {};

  const enabledEntries = (wikiEntries || []).filter(e => e.enabled !== false);

  for (const entry of enabledEntries) {
    entriesById[entry.id] = entry;

    // Support both old (term) and new (trigger) field names
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

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Auth state queries
  if (request.action === 'getAuthState') {
    getAuthState().then(sendResponse);
    return true;
  }

  if (request.action === 'isAuthValid') {
    isAuthValid().then(sendResponse);
    return true;
  }

  if (request.action === 'logout') {
    handleLogout().then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === 'getContent') {
    getContent().then(sendResponse);
    return true;
  }

  if (request.action === 'refreshCloudContent') {
    fetchCloudContent().then(content => {
      sendResponse({ success: !!content, content });
    });
    return true;
  }

  if (request.action === 'getProperties') {
    // Forward to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getProperties' })
          .then(sendResponse)
          .catch(() => sendResponse(null));
      } else {
        sendResponse(null);
      }
    });
    return true;
  }

  if (request.action === 'refreshUI') {
    // Tell content script to refresh
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url?.includes('hubspot.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'refresh' }).catch(() => {});
      }
    });
    return false;
  }

  // Forward card updates to sidepanel
  if (request.action === 'updateSidePanelCards') {
    // The sidepanel should receive this directly, but log it for debugging
    console.log('[RevGuide] Card update received, cards:', request.cards?.length);
    return false;
  }

  // Open the side panel (from FAB click)
  if (request.action === 'openSidePanel') {
    console.log('[RevGuide] Received openSidePanel request from tab:', sender.tab?.id);
    // Set flag to open plays tab (FAB click = plays) - do this sync
    chrome.storage.local.set({ sidepanelOpenTab: 'plays' });
    // Open side panel synchronously in response to user gesture
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => console.log('[RevGuide] Side panel opened successfully'))
        .catch(err => console.error('[RevGuide] Error opening side panel:', err));
    }
    return false;
  }

  // Open the side panel to a specific play (from banner's "Open Play" button)
  if (request.action === 'openSidePanelToPlay') {
    console.log('[RevGuide] Received openSidePanelToPlay request, playId:', request.playId);
    // Set flags to open plays tab and scroll to specific play
    // Also store the play data in case it's not in the current matching cards
    const storageData = {
      sidepanelOpenTab: 'plays',
      sidepanelFocusPlayId: request.playId
    };
    if (request.playData) {
      storageData.sidepanelFocusPlayData = request.playData;
    }
    chrome.storage.local.set(storageData);
    // Open side panel
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => console.log('[RevGuide] Side panel opened to play successfully'))
        .catch(err => console.error('[RevGuide] Error opening side panel:', err));
    }
    return false;
  }

  // Fetch Deal properties from HubSpot API (legacy - kept for backwards compatibility)
  if (request.action === 'fetchDealProperties') {
    fetchHubSpotRecord('deal', request.dealId)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  // Fetch record properties from HubSpot API (generic - works for all object types)
  if (request.action === 'fetchRecordProperties') {
    fetchHubSpotRecord(request.objectType, request.recordId)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Fetch properties for an object type
  if (request.action === 'fetchObjectProperties') {
    fetchHubSpotProperties(request.objectType)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Update HubSpot record properties
  if (request.action === 'updateHubSpotProperties') {
    updateHubSpotRecord(request.objectType, request.recordId, request.properties)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Send invitation email via API
  if (request.action === 'sendInviteEmail') {
    sendInviteEmail(request.email, request.role)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Fetch any HubSpot record from API (contacts, companies, deals, tickets)
async function fetchHubSpotRecord(objectType, recordId) {
  console.log('[RevGuide BG] Fetching record:', objectType, recordId);

  const { settings } = await chrome.storage.local.get({ settings: {} });
  const apiToken = settings.hubspotApiToken;

  if (!apiToken) {
    console.log('[RevGuide BG] No API token configured');
    throw new Error('HubSpot API token not configured. Add it in extension settings.');
  }

  // Map singular to plural for API endpoints
  const objectTypeMap = {
    'contact': 'contacts',
    'company': 'companies',
    'deal': 'deals',
    'ticket': 'tickets'
  };
  const apiObjectType = objectTypeMap[objectType] || objectType;

  console.log('[RevGuide BG] Token found, fetching properties list...');

  // First, get all available properties for this object type
  let propertyNames = [];
  try {
    const propsUrl = `https://api.hubapi.com/crm/v3/properties/${apiObjectType}`;
    const propsResponse = await fetch(propsUrl, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (propsResponse.ok) {
      const propsData = await propsResponse.json();
      propertyNames = propsData.results.map(p => p.name);
      console.log('[RevGuide BG] Found', propertyNames.length, apiObjectType, 'properties');
    }
  } catch (e) {
    console.log('[RevGuide BG] Could not fetch property list, using defaults');
    // Default properties by object type
    const defaults = {
      contacts: ['firstname', 'lastname', 'email', 'phone', 'lifecyclestage', 'hubspot_owner_id'],
      companies: ['name', 'domain', 'industry', 'annualrevenue', 'numberofemployees', 'hubspot_owner_id'],
      deals: ['dealname', 'amount', 'dealstage', 'hubspot_owner_id', 'pipeline', 'closedate'],
      tickets: ['subject', 'content', 'hs_ticket_priority', 'hs_pipeline_stage', 'hubspot_owner_id']
    };
    propertyNames = defaults[apiObjectType] || [];
  }

  // Fetch the record with all properties
  const url = `https://api.hubapi.com/crm/v3/objects/${apiObjectType}/${recordId}?properties=${propertyNames.join(',')}`;
  console.log('[RevGuide BG] Fetching', apiObjectType, 'record with', propertyNames.length, 'properties');

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
  });

  console.log('[RevGuide BG] Response status:', response.status);

  if (!response.ok) {
    const errText = await response.text();
    console.log('[RevGuide BG] Error response:', errText);
    throw new Error(`HubSpot API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[RevGuide BG] Success, got', Object.keys(data.properties || {}).length, 'properties');
  return data;
}

// Fetch properties for a HubSpot object type
async function fetchHubSpotProperties(objectType) {
  console.log('[RevGuide BG] Fetching properties for:', objectType);

  const { settings } = await chrome.storage.local.get({ settings: {} });
  const apiToken = settings.hubspotApiToken;

  if (!apiToken) {
    throw new Error('HubSpot API token not configured. Add it in extension settings.');
  }

  const url = `https://api.hubapi.com/crm/v3/properties/${objectType}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HubSpot API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();

  // Return simplified property list: name, label, type, options
  return data.results.map(prop => ({
    name: prop.name,
    label: prop.label,
    type: prop.type,
    fieldType: prop.fieldType,
    options: prop.options || [],
    groupName: prop.groupName
  })).sort((a, b) => a.label.localeCompare(b.label));
}

// Update a HubSpot record's properties
async function updateHubSpotRecord(objectType, recordId, properties) {
  console.log('[RevGuide BG] Updating record:', objectType, recordId, properties);

  const { settings } = await chrome.storage.local.get({ settings: {} });
  const apiToken = settings.hubspotApiToken;

  if (!apiToken) {
    throw new Error('HubSpot API token not configured. Add it in extension settings.');
  }

  if (!objectType || !recordId) {
    throw new Error('Missing object type or record ID');
  }

  // Map singular object type to API endpoint
  const objectTypeMap = {
    'contact': 'contacts',
    'company': 'companies',
    'deal': 'deals',
    'ticket': 'tickets'
  };

  const apiObjectType = objectTypeMap[objectType] || objectType;

  const url = `https://api.hubapi.com/crm/v3/objects/${apiObjectType}/${recordId}`;
  console.log('[RevGuide BG] PATCH request to:', url);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties })
  });

  console.log('[RevGuide BG] Response status:', response.status);

  if (!response.ok) {
    const errText = await response.text();
    console.log('[RevGuide BG] Error response:', errText);
    throw new Error(`HubSpot API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[RevGuide BG] Success, updated properties');
  return data;
}

// Badge update when rules match
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.rules) {
    // Could update badge count here
  }
});

// API endpoint for invite emails
const INVITE_API_URL = 'https://revguide-api.revguide.workers.dev/api/invite';
// TODO: Update this URL after deploying your Cloudflare Worker

// Send invitation email via API
async function sendInviteEmail(email, role) {
  console.log('[RevGuide BG] Sending invite via API to:', email);

  const response = await fetch(INVITE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, role })
  });

  console.log('[RevGuide BG] API response status:', response.status);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.log('[RevGuide BG] API error:', errorData);
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  console.log('[RevGuide BG] Invite sent successfully, id:', data.id);
  return data;
}
