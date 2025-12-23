/**
 * RevGuide - Background Service Worker
 * Handles messaging between sidepanel and content scripts
 */

importScripts('../lib/wiki-cache.js');

console.log('[RevGuide] Service worker starting...');

// ============ AUTH STATE MANAGEMENT ============

/**
 * Listen for external messages from the web app (app.revguide.io)
 * This handles the auth bridge between web app and extension
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[RevGuide BG] External message received:', message.type, 'from:', sender.origin);
  console.log('[RevGuide BG] Full message:', JSON.stringify(message).substring(0, 200));

  // Validate sender origin (includes staging for testing)
  const allowedOrigins = [
    'https://app.revguide.io',
    'https://staging.revguide.io',
    'http://localhost:5173',
    'http://localhost:3000'
  ];
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

  if (message.type === 'CLOSE_AUTH_TAB') {
    // Close the auth callback tab
    console.log('[RevGuide BG] Closing auth tab');
    if (sender.tab?.id) {
      chrome.tabs.remove(sender.tab.id).then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        console.error('[RevGuide BG] Failed to close tab:', err);
        sendResponse({ success: false, error: err.message });
      });
    } else {
      sendResponse({ success: false, error: 'No tab ID' });
    }
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
const CLOUD_CONTENT_TTL_MS = 1 * 60 * 1000; // 1 minute cache for faster updates

// ============ CRM PORTAL MATCHING ============

/**
 * Match a CRM portal ID to a RevGuide organization
 * Currently supports HubSpot, designed to be CRM-agnostic for future expansion
 * @param {string} portalId - The CRM portal/workspace ID
 * @param {string} crmType - The CRM type ('hubspot', future: 'salesforce', 'attio')
 * @param {string} accessToken - The user's Supabase access token
 * @returns {Object|null} - The matched organization { id, name } or null
 */
async function getOrgByCrmPortalId(portalId, crmType, accessToken) {
  if (!portalId || !accessToken) {
    return null;
  }

  // Map CRM types to their portal ID column in the organizations table
  const columnMap = {
    'hubspot': 'hubspot_portal_id',
    // Future CRM support:
    // 'salesforce': 'salesforce_org_id',
    // 'attio': 'attio_workspace_id',
  };

  const column = columnMap[crmType] || 'hubspot_portal_id';

  try {
    // Query Supabase REST API directly (can't use RevGuideDB in service worker)
    // RLS will automatically filter to orgs the user has access to
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/organizations?${column}=eq.${portalId}&select=id,name`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_ANON_KEY
        }
      }
    );

    if (!response.ok) {
      console.log('[RevGuide] Portal matching query failed:', response.status);
      return null;
    }

    const orgs = await response.json();
    if (orgs.length > 0) {
      console.log('[RevGuide] Matched portal', portalId, 'to org:', orgs[0].name);
      return orgs[0];
    }

    console.log('[RevGuide] No org found for portal:', portalId);
    return null;
  } catch (error) {
    console.error('[RevGuide] Error matching portal ID:', error);
    return null;
  }
}
const HUBSPOT_PROPERTIES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HUBSPOT_PROPERTIES_CACHE_KEY = 'hubspotPropertiesCache';
const HUBSPOT_OBJECT_TYPE_MAP = {
  contact: 'contacts',
  company: 'companies',
  deal: 'deals',
  ticket: 'tickets'
};

function getHubSpotApiObjectType(objectType) {
  return HUBSPOT_OBJECT_TYPE_MAP[objectType] || objectType;
}

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
    enabled: data.enabled !== false, // Default to true if not explicitly false
    showOnIndex: data.show_on_index,
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
    trigger: data.trigger || data.term, // Use trigger if available, fallback to term
    definition: data.definition,
    aliases: data.aliases || [],
    category: data.category || 'general',
    link: data.link || '',
    enabled: data.enabled !== false, // Default to enabled if not specified
    objectTypes: data.object_types,
    objectType: data.object_type,
    propertyGroup: data.property_group,
    matchType: data.match_type || 'exact',
    frequency: data.frequency || 'first',
    includeAliases: data.include_aliases !== false,
    priority: data.priority || 50,
    pageType: data.page_type || 'record',
    urlPatterns: data.url_patterns,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

/**
 * Fetch all content (banners, plays, wiki) for an organization
 * @param {string} [targetOrgId] - Optional org ID to fetch content for. If not provided, uses user's active org.
 */
async function fetchCloudContent(targetOrgId = null) {
  const authState = await getAuthState();
  const orgId = targetOrgId || authState.profile?.organizationId;

  console.log('[RevGuide] fetchCloudContent called - isAuthenticated:', authState.isAuthenticated, 'targetOrgId:', targetOrgId, 'activeOrgId:', authState.profile?.organizationId, 'usingOrgId:', orgId);

  if (!authState.isAuthenticated || !orgId) {
    console.log('[RevGuide] Cannot fetch cloud content: not authenticated or no org');
    return null;
  }
  console.log('[RevGuide] Fetching cloud content for org:', orgId);

  try {
    // Fetch all content types in parallel (including org settings for erp_config)
    const [banners, plays, wikiEntries, orgData] = await Promise.all([
      supabaseFetch('banners', {
        filter: { 'organization_id': `eq.${orgId}` },
        order: 'priority.desc'
      }),
      supabaseFetch('plays', {
        filter: { 'organization_id': `eq.${orgId}` }
      }),
      supabaseFetch('wiki_entries', {
        filter: { 'organization_id': `eq.${orgId}` }
      }),
      supabaseFetch('organizations', {
        select: 'erp_config',
        filter: { 'id': `eq.${orgId}` }
      })
    ]);

    console.log('[RevGuide] Cloud content fetched:', {
      banners: banners?.length || 0,
      plays: plays?.length || 0,
      wikiEntries: wikiEntries?.length || 0
    });

    // Log raw banner data for debugging
    if (banners?.length > 0) {
      console.log('[RevGuide] First raw banner from Supabase:', JSON.stringify(banners[0]).substring(0, 500));
    }

    // Log raw wiki data for debugging
    if (wikiEntries?.length > 0) {
      console.log('[RevGuide] First raw wiki entry from Supabase:', JSON.stringify(wikiEntries[0]).substring(0, 500));
    }

    // Extract ERP config from org data
    const erpConfig = orgData && orgData.length > 0 ? orgData[0].erp_config : null;

    // Transform to match local storage format (snake_case to camelCase)
    const content = {
      rules: (banners || []).map(mapBannerFromSupabase),
      battleCards: (plays || []).map(mapPlayFromSupabase),
      wikiEntries: (wikiEntries || []).map(mapWikiFromSupabase),
      erpConfig: erpConfig
    };

    // Log transformed banner for debugging
    if (content.rules?.length > 0) {
      console.log('[RevGuide] First transformed banner:', JSON.stringify(content.rules[0]).substring(0, 500));
    }

    // Log transformed wiki entry for debugging
    if (content.wikiEntries?.length > 0) {
      console.log('[RevGuide] First transformed wiki entry:', JSON.stringify(content.wikiEntries[0]).substring(0, 500));
    }

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
 * Supports CRM portal matching for automatic org detection
 * @param {Object} options
 * @param {boolean} [options.forceRefresh] - Force refresh from cloud
 * @param {string} [options.portalId] - CRM portal ID to match to an org
 * @param {string} [options.crmType='hubspot'] - CRM type for portal matching
 */
async function getContent(options = {}) {
  const authState = await getAuthState();
  const { forceRefresh = false, portalId = null, crmType = 'hubspot' } = options;

  if (authState.isAuthenticated && authState.profile?.organizationId) {
    let orgId = authState.profile.organizationId;
    let matchedOrg = null;

    // Silent switch: If CRM portal ID provided, find matching org
    if (portalId) {
      matchedOrg = await getOrgByCrmPortalId(portalId, crmType, authState.accessToken);
      if (matchedOrg) {
        orgId = matchedOrg.id; // Use matched org's content
        console.log('[RevGuide] Using matched org:', matchedOrg.name, 'for portal:', portalId);
      } else {
        console.log('[RevGuide] No match for portal:', portalId, '- using default org');
      }
    }

    // Check cache - use org-specific cache key when portal matching
    const cacheKey = matchedOrg ? `cloudContent_${orgId}` : 'cloudContent';
    const cacheTimeKey = matchedOrg ? `cloudContentLastFetch_${orgId}` : 'cloudContentLastFetch';

    const cachedResult = await chrome.storage.local.get({
      [cacheKey]: null,
      [cacheTimeKey]: 0,
      // Also get default cache for fallback
      cloudContent: null,
      cloudContentLastFetch: 0
    });

    const cachedContent = cachedResult[cacheKey] || cachedResult.cloudContent;
    const cacheTime = cachedResult[cacheTimeKey] || cachedResult.cloudContentLastFetch;
    const cacheAge = Date.now() - (cacheTime || 0);

    // Use cache if fresh and not forcing refresh
    if (!forceRefresh && cachedContent && cacheAge < CLOUD_CONTENT_TTL_MS) {
      return {
        source: 'cloud-cached',
        content: cachedContent,
        matchedOrg: matchedOrg ? { id: matchedOrg.id, name: matchedOrg.name } : null,
        usingFallback: portalId && !matchedOrg
      };
    }

    // Fetch fresh content for the org
    const cloudContent = await fetchCloudContent(orgId);
    if (cloudContent) {
      // Cache with org-specific key if portal matching
      if (matchedOrg) {
        await chrome.storage.local.set({
          [cacheKey]: cloudContent,
          [cacheTimeKey]: Date.now()
        });
      }

      return {
        source: 'cloud',
        content: cloudContent,
        matchedOrg: matchedOrg ? { id: matchedOrg.id, name: matchedOrg.name } : null,
        usingFallback: portalId && !matchedOrg
      };
    }

    // Fall back to cached content if fetch failed
    if (cachedContent) {
      return {
        source: 'cloud-cached',
        content: cachedContent,
        matchedOrg: matchedOrg ? { id: matchedOrg.id, name: matchedOrg.name } : null,
        usingFallback: portalId && !matchedOrg
      };
    }
  }

  // Fall back to local content
  const local = await chrome.storage.local.get(['rules', 'battleCards', 'wikiEntries']);
  return {
    source: 'local',
    content: local,
    matchedOrg: null,
    usingFallback: !!portalId
  };
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
  const wikiCacheData = RevGuideWikiCache.buildWikiTermMapCache(sampleWikiEntries);

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
      bannerPosition: 'top'
    }
  });

  console.log('[RevGuide] Sample data initialized with wiki cache');
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
    console.log('[RevGuide BG] getContent request:', JSON.stringify({
      forceRefresh: request.forceRefresh,
      portalId: request.portalId,
      crmType: request.crmType
    }));
    getContent({
      forceRefresh: !!request.forceRefresh,
      portalId: request.portalId || null,
      crmType: request.crmType || 'hubspot'
    }).then(sendResponse);
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
    // Clear cloud content cache so next load gets fresh data
    chrome.storage.local.remove(['cloudContent', 'cloudContentLastFetch']);
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
    // Store record context so editable fields in the play work correctly
    const storageData = {
      sidepanelOpenTab: 'plays',
      sidepanelFocusPlayId: request.playId
    };
    if (request.playData) {
      storageData.sidepanelFocusPlayData = request.playData;
    }
    if (request.recordContext) {
      storageData.sidepanelRecordContext = request.recordContext;
    }
    chrome.storage.local.set(storageData);

    // Open side panel and send message to focus on play
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => {
          console.log('[RevGuide] Side panel opened to play successfully');
          // Give sidepanel time to initialize before sending message
          setTimeout(() => {
            chrome.runtime.sendMessage({
              action: 'focusOnPlay',
              playId: request.playId,
              playData: request.playData || null,
              recordContext: request.recordContext || null
            }).catch(() => {
              // Sidepanel may not be listening yet, data is in storage as fallback
              console.log('[RevGuide] focusOnPlay message failed, relying on storage fallback');
            });
          }, 500);
        })
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

  // Fetch batch record properties from HubSpot API (for index page tags)
  if (request.action === 'fetchBatchRecordProperties') {
    fetchHubSpotBatchRecords(request.objectType, request.recordIds)
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

async function getCachedHubSpotProperties(apiObjectType) {
  const { [HUBSPOT_PROPERTIES_CACHE_KEY]: cache } = await chrome.storage.local.get({
    [HUBSPOT_PROPERTIES_CACHE_KEY]: {}
  });

  const entry = cache[apiObjectType];
  if (!entry || !Array.isArray(entry.properties) || !entry.timestamp) {
    return null;
  }

  if (Date.now() - entry.timestamp > HUBSPOT_PROPERTIES_CACHE_TTL_MS) {
    return null;
  }

  return entry.properties;
}

async function setCachedHubSpotProperties(apiObjectType, properties) {
  const { [HUBSPOT_PROPERTIES_CACHE_KEY]: cache } = await chrome.storage.local.get({
    [HUBSPOT_PROPERTIES_CACHE_KEY]: {}
  });

  const updated = {
    ...cache,
    [apiObjectType]: {
      properties,
      timestamp: Date.now()
    }
  };

  await chrome.storage.local.set({ [HUBSPOT_PROPERTIES_CACHE_KEY]: updated });
}

async function fetchHubSpotPropertiesPaged(apiObjectType, apiToken) {
  const properties = [];
  let after = null;
  let pageCount = 0;

  while (true) {
    const url = new URL(`https://api.hubapi.com/crm/v3/properties/${apiObjectType}`);
    url.searchParams.set('limit', '100');
    if (after) {
      url.searchParams.set('after', after);
    }

    const response = await fetch(url.toString(), {
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
    if (Array.isArray(data.results)) {
      properties.push(...data.results);
    }

    after = data.paging?.next?.after || null;
    pageCount += 1;

    if (!after || pageCount > 50) {
      break;
    }
  }

  return properties;
}

// Fetch any HubSpot record from API (contacts, companies, deals, tickets)
// Requires HubSpot API token configured in extension settings
async function fetchHubSpotRecord(objectType, recordId) {
  console.log('[RevGuide BG] Fetching record:', objectType, recordId);

  const { settings } = await chrome.storage.local.get({ settings: {} });
  const apiToken = settings.hubspotApiToken;

  if (!apiToken) {
    throw new Error('HubSpot API token not configured. Add it in extension settings.');
  }

  const apiObjectType = getHubSpotApiObjectType(objectType);

  console.log('[RevGuide BG] Token found, fetching properties list...');

  let cachedProperties = await getCachedHubSpotProperties(apiObjectType);
  let propertyNames = cachedProperties ? cachedProperties.map(p => p.name) : [];

  if (propertyNames.length === 0) {
    try {
      const fetchedProperties = await fetchHubSpotProperties(apiObjectType, { apiToken, forceRefresh: true });
      propertyNames = fetchedProperties.map(p => p.name);
      console.log('[RevGuide BG] Found', propertyNames.length, apiObjectType, 'properties');
    } catch (e) {
      console.log('[RevGuide BG] Could not fetch property list, using defaults');
      const defaults = {
        contacts: ['firstname', 'lastname', 'email', 'phone', 'lifecyclestage', 'hubspot_owner_id'],
        companies: ['name', 'domain', 'industry', 'annualrevenue', 'numberofemployees', 'hubspot_owner_id'],
        deals: ['dealname', 'amount', 'dealstage', 'hubspot_owner_id', 'pipeline', 'closedate'],
        tickets: ['subject', 'content', 'hs_ticket_priority', 'hs_pipeline_stage', 'hubspot_owner_id']
      };
      propertyNames = defaults[apiObjectType] || [];
    }
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

/**
 * Batch fetch multiple HubSpot records at once
 * Used for index page tags to efficiently fetch properties for many records
 * @param {string} objectType - Object type (deal, contact, company, ticket)
 * @param {Array} recordIds - Array of record IDs to fetch
 * @returns {Object} Map of recordId -> properties
 */
async function fetchHubSpotBatchRecords(objectType, recordIds) {
  console.log('[RevGuide BG] Batch fetching', recordIds.length, objectType, 'records');

  if (!recordIds || recordIds.length === 0) {
    return {};
  }

  const { settings } = await chrome.storage.local.get({ settings: {} });
  const apiToken = settings.hubspotApiToken;

  if (!apiToken) {
    throw new Error('HubSpot API token not configured. Add it in extension settings.');
  }

  const apiObjectType = getHubSpotApiObjectType(objectType);

  // Get property names to fetch
  let cachedProperties = await getCachedHubSpotProperties(apiObjectType);
  let propertyNames = cachedProperties ? cachedProperties.map(p => p.name) : [];

  if (propertyNames.length === 0) {
    try {
      const fetchedProperties = await fetchHubSpotProperties(apiObjectType, { apiToken, forceRefresh: true });
      propertyNames = fetchedProperties.map(p => p.name);
    } catch (e) {
      console.log('[RevGuide BG] Could not fetch property list, using defaults');
      const defaults = {
        contacts: ['firstname', 'lastname', 'email', 'phone', 'lifecyclestage', 'hubspot_owner_id'],
        companies: ['name', 'domain', 'industry', 'annualrevenue', 'numberofemployees', 'hubspot_owner_id'],
        deals: ['dealname', 'amount', 'dealstage', 'hubspot_owner_id', 'pipeline', 'closedate'],
        tickets: ['subject', 'content', 'hs_ticket_priority', 'hs_pipeline_stage', 'hubspot_owner_id']
      };
      propertyNames = defaults[apiObjectType] || [];
    }
  }

  // HubSpot batch read API - max 100 records per request
  const results = {};
  const batchSize = 100;

  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batch = recordIds.slice(i, i + batchSize);
    const url = `https://api.hubapi.com/crm/v3/objects/${apiObjectType}/batch/read`;

    const requestBody = {
      properties: propertyNames,
      idProperty: 'hs_object_id',
      inputs: batch.map(id => ({ id: String(id) }))
    };

    console.log('[RevGuide BG] Batch request for', batch.length, 'records');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[RevGuide BG] Batch API error:', response.status, errText);
      // Continue with next batch instead of throwing
      continue;
    }

    const data = await response.json();

    // Map results by record ID
    if (data.results && Array.isArray(data.results)) {
      data.results.forEach(record => {
        const recordId = record.id;
        results[recordId] = record.properties || {};
      });
    }
  }

  console.log('[RevGuide BG] Batch fetch complete, got', Object.keys(results).length, 'records');
  return results;
}

// Fetch properties for a HubSpot object type
// Requires HubSpot API token configured in extension settings
async function fetchHubSpotProperties(objectType, options = {}) {
  console.log('[RevGuide BG] Fetching properties for:', objectType);

  const { apiToken: providedToken, forceRefresh = false } = options;
  const { settings } = await chrome.storage.local.get({ settings: {} });
  const apiToken = providedToken || settings.hubspotApiToken;

  if (!apiToken) {
    throw new Error('HubSpot API token not configured. Add it in extension settings.');
  }

  const apiObjectType = getHubSpotApiObjectType(objectType);

  if (!forceRefresh) {
    const cached = await getCachedHubSpotProperties(apiObjectType);
    if (cached) {
      return cached;
    }
  }

  const rawProperties = await fetchHubSpotPropertiesPaged(apiObjectType, apiToken);
  const simplified = rawProperties.map(prop => ({
    name: prop.name,
    label: prop.label,
    type: prop.type,
    fieldType: prop.fieldType,
    options: prop.options || [],
    groupName: prop.groupName
  })).sort((a, b) => a.label.localeCompare(b.label));

  if (simplified.length > 0) {
    await setCachedHubSpotProperties(apiObjectType, simplified);
  }

  return simplified;
}

// Update a HubSpot record's properties
// Requires HubSpot API token configured in extension settings
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

  const apiObjectType = getHubSpotApiObjectType(objectType);

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
