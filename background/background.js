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

  // Clear auth state and all cached content so nothing shows when logged out
  await chrome.storage.local.remove([
    'authState',
    'cloudContent',
    'cloudContentLastFetch',
    'rules',
    'battleCards',
    'wikiEntries'
  ]);

  // Also clear any org-specific content caches
  const allKeys = await chrome.storage.local.get(null);
  const orgCacheKeys = Object.keys(allKeys).filter(k =>
    k.startsWith('cloudContent_') || k.startsWith('cloudContentLastFetch_')
  );
  if (orgCacheKeys.length > 0) {
    await chrome.storage.local.remove(orgCacheKeys);
  }

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

// ============ HUBSPOT OAUTH PROXY ============

// Cache for OAuth connections (avoid repeated lookups)
const oauthConnectionCache = new Map();
const OAUTH_CONNECTION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get OAuth connection for an organization
 * @param {string} orgId - Organization ID
 * @returns {Object|null} Connection info or null if not connected
 */
async function getOAuthConnection(orgId) {
  if (!orgId) {
    return null;
  }

  // Check cache first
  const cached = oauthConnectionCache.get(orgId);
  if (cached && (Date.now() - cached.timestamp < OAUTH_CONNECTION_CACHE_TTL_MS)) {
    return cached.connection;
  }

  const authState = await getAuthState();
  if (!authState.isAuthenticated || !authState.accessToken) {
    return null;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/hubspot-oauth/connection-by-org`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ organizationId: orgId })
      }
    );

    if (!response.ok) {
      console.log('[RevGuide BG] OAuth connection lookup failed:', response.status);
      return null;
    }

    const data = await response.json();

    // Cache the result
    oauthConnectionCache.set(orgId, {
      connection: data.isConnected ? data : null,
      timestamp: Date.now()
    });

    return data.isConnected ? data : null;
  } catch (error) {
    console.error('[RevGuide BG] OAuth connection error:', error);
    return null;
  }
}

/**
 * Make a HubSpot API request via the OAuth proxy
 * @param {string} connectionId - OAuth connection ID
 * @param {string} endpoint - HubSpot API endpoint (e.g., '/crm/v3/objects/contacts/123')
 * @param {string} method - HTTP method (GET, POST, PATCH, DELETE)
 * @param {Object} body - Request body for POST/PATCH
 * @returns {Object} API response data
 */
async function hubspotProxyRequest(connectionId, endpoint, method = 'GET', body = null) {
  const authState = await getAuthState();
  if (!authState.isAuthenticated || !authState.accessToken) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/hubspot-oauth/proxy`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authState.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        connectionId,
        endpoint,
        method,
        body
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OAuth proxy error: ${response.status} - ${errText}`);
  }

  return await response.json();
}

/**
 * Get HubSpot API token - prefers OAuth, falls back to Private App token
 * @param {string} orgId - Organization ID (optional, for OAuth lookup)
 * @returns {Object} { type: 'oauth'|'private', connectionId?, apiToken? }
 */
async function getHubSpotAuth(orgId) {
  // Try OAuth first if we have an org ID
  if (orgId) {
    const oauthConnection = await getOAuthConnection(orgId);
    if (oauthConnection?.connectionId) {
      return {
        type: 'oauth',
        connectionId: oauthConnection.connectionId,
        scopes: oauthConnection.scopes || []
      };
    }
  }

  // Fall back to Private App token
  const { settings } = await chrome.storage.local.get({ settings: {} });
  if (settings.hubspotApiToken) {
    return {
      type: 'private',
      apiToken: settings.hubspotApiToken
    };
  }

  return null;
}

// Cache for user OAuth connections
const userOAuthConnectionCache = new Map();
const USER_OAUTH_CONNECTION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get user's personal HubSpot connection for an organization
 * @param {string} orgId - Organization ID
 * @returns {Object|null} User connection info or null if not connected
 */
async function getUserOAuthConnection(orgId) {
  console.log('[RevGuide BG] getUserOAuthConnection called with orgId:', orgId);
  if (!orgId) {
    console.log('[RevGuide BG] No orgId provided');
    return null;
  }

  // Check cache first
  const cached = userOAuthConnectionCache.get(orgId);
  if (cached && (Date.now() - cached.timestamp < USER_OAUTH_CONNECTION_CACHE_TTL_MS)) {
    console.log('[RevGuide BG] Returning cached user connection:', cached.connection);
    return cached.connection;
  }
  console.log('[RevGuide BG] No valid cache, fetching from API');

  const authState = await getAuthState();
  if (!authState.isAuthenticated || !authState.accessToken) {
    return null;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/hubspot-oauth/user-connection`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ organizationId: orgId })
      }
    );

    if (!response.ok) {
      console.log('[RevGuide BG] User OAuth connection lookup failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[RevGuide BG] User connection API response:', data);

    // Cache the result
    userOAuthConnectionCache.set(orgId, {
      connection: data.isConnected ? data : null,
      timestamp: Date.now()
    });

    console.log('[RevGuide BG] Returning connection:', data.isConnected ? data : null);
    return data.isConnected ? data : null;
  } catch (error) {
    console.error('[RevGuide BG] User OAuth connection error:', error);
    return null;
  }
}

/**
 * Make a HubSpot API request via the user's OAuth proxy
 * Updates will be attributed to the specific user in HubSpot history
 * @param {string} connectionId - User's OAuth connection ID
 * @param {string} endpoint - HubSpot API endpoint
 * @param {string} method - HTTP method
 * @param {Object} body - Request body
 * @returns {Object} API response data
 */
async function userHubspotProxyRequest(connectionId, endpoint, method = 'GET', body = null) {
  const authState = await getAuthState();
  if (!authState.isAuthenticated || !authState.accessToken) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/hubspot-oauth/user-proxy`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authState.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        connectionId,
        endpoint,
        method,
        body
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`User OAuth proxy error: ${response.status} - ${errText}`);
  }

  return await response.json();
}

/**
 * Get HubSpot auth for write operations - prefers user token for personal attribution
 * @param {string} orgId - Organization ID
 * @param {boolean} isWriteOperation - If true, prefer user token for attribution
 * @returns {Object} { type: 'user-oauth'|'oauth'|'private', connectionId?, apiToken? }
 */
async function getHubSpotAuthForWrite(orgId) {
  console.log('[RevGuide BG] getHubSpotAuthForWrite called with orgId:', orgId);

  // For write operations, prefer user token for personal attribution
  if (orgId) {
    const userConnection = await getUserOAuthConnection(orgId);
    console.log('[RevGuide BG] User connection result:', userConnection);
    if (userConnection?.connectionId) {
      console.log('[RevGuide BG] Using user OAuth for write (attributed to:', userConnection.hubspotEmail, ')');
      return {
        type: 'user-oauth',
        connectionId: userConnection.connectionId,
        hubspotEmail: userConnection.hubspotEmail
      };
    }
  }

  // Fall back to org-level OAuth
  console.log('[RevGuide BG] Falling back to org-level auth');
  return await getHubSpotAuth(orgId);
}

/**
 * Clear OAuth connection cache (e.g., when connection changes)
 */
function clearOAuthConnectionCache(orgId = null) {
  if (orgId) {
    oauthConnectionCache.delete(orgId);
    userOAuthConnectionCache.delete(orgId);
  } else {
    oauthConnectionCache.clear();
    userOAuthConnectionCache.clear();
  }
}

/**
 * Check if user has an active HubSpot connection for this org
 * @param {string} orgId - Organization ID
 * @returns {Object} { connected: boolean, email?: string }
 */
async function checkUserHubSpotConnection(orgId) {
  const connection = await getUserOAuthConnection(orgId);
  if (connection?.isConnected) {
    return {
      connected: true,
      email: connection.hubspotEmail || 'Connected'
    };
  }
  return { connected: false };
}

/**
 * Get OAuth authorization URL for user-level HubSpot connection
 * @param {string} orgId - Organization ID
 * @param {string} userId - User ID
 * @returns {Object} { authUrl: string } or { authUrl: null }
 */
async function getUserHubSpotAuthUrl(orgId, userId) {
  const authState = await getAuthState();
  if (!authState.isAuthenticated || !authState.accessToken) {
    return { authUrl: null };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/hubspot-oauth/user-authorize`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          organizationId: orgId,
          userId: userId,
          returnUrl: 'https://app.revguide.io/settings?hubspot=connected'
        })
      }
    );

    if (!response.ok) {
      console.error('[RevGuide BG] Failed to get user auth URL:', response.status);
      return { authUrl: null };
    }

    const data = await response.json();
    return { authUrl: data.authUrl };
  } catch (error) {
    console.error('[RevGuide BG] Error getting user auth URL:', error);
    return { authUrl: null };
  }
}

/**
 * Disconnect user's HubSpot connection
 * @param {string} orgId - Organization ID
 */
async function disconnectUserHubSpot(orgId) {
  const authState = await getAuthState();
  if (!authState.isAuthenticated || !authState.accessToken) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/hubspot-oauth/user-disconnect`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authState.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ organizationId: orgId })
    }
  );

  if (!response.ok) {
    throw new Error('Failed to disconnect');
  }

  // Clear cache so next check gets fresh data
  clearOAuthConnectionCache(orgId);
}

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
 * Call a Supabase RPC function
 * @param {string} functionName - The RPC function name
 * @param {Object} params - Parameters to pass to the function
 */
async function supabaseRpc(functionName, params = {}) {
  const tokenValid = await ensureValidToken();
  if (!tokenValid) {
    throw new Error('Not authenticated - please log in again');
  }

  const authState = await getAuthState();
  if (!authState.isAuthenticated || !authState.accessToken) {
    throw new Error('Not authenticated');
  }

  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${authState.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase RPC error: ${response.status} - ${error}`);
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
    conditionGroups: data.condition_groups,
    groupLogic: data.group_logic,
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
function mapPlayFromSupabase(data, contentAssetIds = []) {
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    cardType: data.card_type,
    subtitle: data.subtitle,
    link: data.link,
    objectType: data.object_type,
    conditions: data.conditions,
    conditionGroups: data.condition_groups,
    groupLogic: data.group_logic,
    logic: data.logic,
    displayOnAll: data.display_on_all,
    sections: data.sections,
    contentAssetIds: contentAssetIds,
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
  console.log('[RevGuide] Fetching cloud content for org:', orgId, '- will fetch branding via RPC');

  try {
    // Fetch all content types in parallel (including org settings for erp_config and branding)
    const [banners, plays, wikiEntries, orgData, tagRules, contentTags, recommendedContent, playContentAssets, branding] = await Promise.all([
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
        select: 'erp_config,partner_branding_id',
        filter: { 'id': `eq.${orgId}` }
      }),
      // Content Recommendations tables
      supabaseFetch('tag_rules', {
        filter: { 'organization_id': `eq.${orgId}`, 'enabled': 'eq.true' },
        order: 'priority.desc'
      }),
      supabaseFetch('content_tags', {
        filter: { 'organization_id': `eq.${orgId}` }
      }),
      supabaseFetch('recommended_content', {
        filter: { 'organization_id': `eq.${orgId}`, 'enabled': 'eq.true' },
        order: 'priority.desc'
      }),
      // Play content assets (for Recommended Content play type)
      supabaseFetch('play_content_assets', {
        order: 'display_order.asc'
      }),
      // Fetch branding using RPC (handles partner cascade)
      // RPC returns array (TABLE), so we take first element
      supabaseRpc('get_organization_branding', { p_org_id: orgId })
        .then(result => {
          console.log('[RevGuide] Branding RPC raw result:', JSON.stringify(result));
          // Result is an array - take first element if exists
          const branding = Array.isArray(result) && result.length > 0 ? result[0] : null;
          console.log('[RevGuide] Branding extracted:', branding ? {
            displayName: branding.display_name,
            attribution: branding.tooltip_attribution,
            primaryColor: branding.primary_color
          } : 'none');
          return branding;
        })
        .catch(err => {
          console.log('[RevGuide] Branding fetch failed:', err.message);
          return null;
        })
    ]);

    console.log('[RevGuide] Cloud content fetched:', {
      banners: banners?.length || 0,
      plays: plays?.length || 0,
      wikiEntries: wikiEntries?.length || 0,
      tagRules: tagRules?.length || 0,
      contentTags: contentTags?.length || 0,
      recommendedContent: recommendedContent?.length || 0
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

    // Build map of play_id -> content_asset_ids for Recommended Content plays
    const playAssetMap = {};
    (playContentAssets || []).forEach(pca => {
      if (!playAssetMap[pca.play_id]) {
        playAssetMap[pca.play_id] = [];
      }
      playAssetMap[pca.play_id].push(pca.content_asset_id);
    });

    // Transform to match local storage format (snake_case to camelCase)
    const content = {
      rules: (banners || []).map(mapBannerFromSupabase),
      battleCards: (plays || []).map(p => mapPlayFromSupabase(p, playAssetMap[p.id] || [])),
      wikiEntries: (wikiEntries || []).map(mapWikiFromSupabase),
      erpConfig: erpConfig,
      // Content Recommendations (keep snake_case for now, transform in sidepanel)
      tagRules: tagRules || [],
      contentTags: contentTags || [],
      recommendedContent: recommendedContent || [],
      // Partner branding (keep snake_case for consistency with DB)
      branding: branding || null
    };

    console.log('[RevGuide] Branding in content:', branding ? {
      displayName: branding.display_name,
      attribution: branding.tooltip_attribution,
      primaryColor: branding.primary_color
    } : 'none');

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
        // No RevGuide account connected to this portal - suppress all content
        console.log('[RevGuide] No match for portal:', portalId, '- suppressing content');
        return {
          source: 'none',
          content: { rules: [], battleCards: [], wikiEntries: [] },
          matchedOrg: null,
          usingFallback: true
        };
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
      console.log('[RevGuide] Using cached content, branding:', cachedContent.branding ? cachedContent.branding.display_name : 'none');
      return {
        source: 'cloud-cached',
        content: cachedContent,
        matchedOrg: matchedOrg ? { id: matchedOrg.id, name: matchedOrg.name } : null,
        usingFallback: portalId && !matchedOrg
      };
    }
    console.log('[RevGuide] Cache stale or forceRefresh, fetching fresh content for org:', orgId);

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

  // Not authenticated - return empty content (don't show cached/sample data)
  return {
    source: 'none',
    content: { rules: [], battleCards: [], wikiEntries: [] },
    matchedOrg: null,
    usingFallback: false
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
    // Initialize default settings only - content comes from cloud after login
    chrome.storage.local.set({
      settings: {
        enabled: true,
        showBanners: true,
        showBattleCards: true,
        showWiki: true,
        bannerPosition: 'top'
      }
    });
    console.log('[RevGuide] Extension installed, default settings initialized');
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
    }).then(result => {
      console.log('[RevGuide BG] getContent response:', {
        source: result?.source,
        hasBranding: !!result?.content?.branding,
        brandingName: result?.content?.branding?.display_name
      });
      sendResponse(result);
    });
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

  if (request.action === 'clearBrandingCache') {
    // Clear all cloud content caches to force branding refresh
    console.log('[RevGuide BG] Clearing all content caches');
    chrome.storage.local.get(null, (items) => {
      const keysToRemove = Object.keys(items).filter(k =>
        k.startsWith('cloudContent') || k.startsWith('cloudContentLastFetch')
      );
      console.log('[RevGuide BG] Removing cache keys:', keysToRemove);
      chrome.storage.local.remove(keysToRemove);
      sendResponse({ success: true, clearedKeys: keysToRemove });
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
    updateHubSpotRecord(request.objectType, request.recordId, request.properties, request.orgId)
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

  // Get list memberships for a record (with caching)
  if (request.action === 'getListMemberships') {
    getListMemberships(request.objectType, request.recordId, request.portalId, request.orgId)
      .then(data => sendResponse({ success: true, listIds: data }))
      .catch(err => sendResponse({ success: false, error: err.message, listIds: [] }));
    return true;
  }

  // Check user's HubSpot connection status
  if (request.action === 'checkUserHubSpotConnection') {
    checkUserHubSpotConnection(request.orgId)
      .then(sendResponse)
      .catch(() => sendResponse({ connected: false }));
    return true;
  }

  // Get OAuth URL for user connection
  if (request.action === 'getUserHubSpotAuthUrl') {
    getUserHubSpotAuthUrl(request.orgId, request.userId)
      .then(sendResponse)
      .catch(() => sendResponse({ authUrl: null }));
    return true;
  }

  // Disconnect user's HubSpot connection
  if (request.action === 'disconnectUserHubSpot') {
    disconnectUserHubSpot(request.orgId)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
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

async function fetchHubSpotPropertiesPaged(apiObjectType, auth) {
  const properties = [];
  let after = null;
  let pageCount = 0;

  while (true) {
    let endpoint = `/crm/v3/properties/${apiObjectType}?limit=100`;
    if (after) {
      endpoint += `&after=${after}`;
    }

    let data;
    if (auth.type === 'oauth') {
      data = await hubspotProxyRequest(auth.connectionId, endpoint);
    } else {
      const response = await fetch(`https://api.hubapi.com${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${auth.apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HubSpot API error: ${response.status} - ${errText}`);
      }

      data = await response.json();
    }

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
async function fetchHubSpotRecord(objectType, recordId, orgId = null) {
  console.log('[RevGuide BG] Fetching record:', objectType, recordId, 'orgId:', orgId);

  const auth = await getHubSpotAuth(orgId);
  if (!auth) {
    throw new Error('HubSpot not connected. Connect via OAuth in settings or add a Private App token.');
  }

  const apiObjectType = getHubSpotApiObjectType(objectType);

  console.log('[RevGuide BG] Using', auth.type, 'auth, fetching properties list...');

  let cachedProperties = await getCachedHubSpotProperties(apiObjectType);
  let propertyNames = cachedProperties ? cachedProperties.map(p => p.name) : [];

  if (propertyNames.length === 0) {
    try {
      const fetchedProperties = await fetchHubSpotProperties(apiObjectType, { orgId, forceRefresh: true });
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
  const endpoint = `/crm/v3/objects/${apiObjectType}/${recordId}?properties=${propertyNames.join(',')}`;
  console.log('[RevGuide BG] Fetching', apiObjectType, 'record with', propertyNames.length, 'properties');

  let data;
  if (auth.type === 'oauth') {
    // Use OAuth proxy
    data = await hubspotProxyRequest(auth.connectionId, endpoint);
  } else {
    // Use Private App token directly
    const response = await fetch(`https://api.hubapi.com${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${auth.apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[RevGuide BG] Response status:', response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.log('[RevGuide BG] Error response:', errText);
      throw new Error(`HubSpot API error: ${response.status} - ${errText}`);
    }

    data = await response.json();
  }

  console.log('[RevGuide BG] Success, got', Object.keys(data.properties || {}).length, 'properties');
  return data;
}

/**
 * Batch fetch multiple HubSpot records at once
 * Used for index page tags to efficiently fetch properties for many records
 * @param {string} objectType - Object type (deal, contact, company, ticket)
 * @param {Array} recordIds - Array of record IDs to fetch
 * @param {string} orgId - Organization ID (optional, for OAuth lookup)
 * @returns {Object} Map of recordId -> properties
 */
async function fetchHubSpotBatchRecords(objectType, recordIds, orgId = null) {
  console.log('[RevGuide BG] Batch fetching', recordIds.length, objectType, 'records, orgId:', orgId);

  if (!recordIds || recordIds.length === 0) {
    return {};
  }

  const auth = await getHubSpotAuth(orgId);
  if (!auth) {
    throw new Error('HubSpot not connected. Connect via OAuth in settings or add a Private App token.');
  }

  const apiObjectType = getHubSpotApiObjectType(objectType);

  // Get property names to fetch
  let cachedProperties = await getCachedHubSpotProperties(apiObjectType);
  let propertyNames = cachedProperties ? cachedProperties.map(p => p.name) : [];

  if (propertyNames.length === 0) {
    try {
      const fetchedProperties = await fetchHubSpotProperties(apiObjectType, { orgId, forceRefresh: true });
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
    const endpoint = `/crm/v3/objects/${apiObjectType}/batch/read`;

    const requestBody = {
      properties: propertyNames,
      idProperty: 'hs_object_id',
      inputs: batch.map(id => ({ id: String(id) }))
    };

    console.log('[RevGuide BG] Batch request for', batch.length, 'records');

    let data;
    try {
      if (auth.type === 'oauth') {
        data = await hubspotProxyRequest(auth.connectionId, endpoint, 'POST', requestBody);
      } else {
        const response = await fetch(`https://api.hubapi.com${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${auth.apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('[RevGuide BG] Batch API error:', response.status, errText);
          continue;
        }

        data = await response.json();
      }

      // Map results by record ID
      if (data.results && Array.isArray(data.results)) {
        data.results.forEach(record => {
          const recordId = record.id;
          results[recordId] = record.properties || {};
        });
      }
    } catch (error) {
      console.error('[RevGuide BG] Batch request error:', error);
      continue;
    }
  }

  console.log('[RevGuide BG] Batch fetch complete, got', Object.keys(results).length, 'records');
  return results;
}

// Fetch properties for a HubSpot object type
// Supports OAuth or Private App token
async function fetchHubSpotProperties(objectType, options = {}) {
  console.log('[RevGuide BG] Fetching properties for:', objectType);

  const { orgId = null, forceRefresh = false } = options;

  const auth = await getHubSpotAuth(orgId);
  if (!auth) {
    throw new Error('HubSpot not connected. Connect via OAuth in settings or add a Private App token.');
  }

  const apiObjectType = getHubSpotApiObjectType(objectType);

  if (!forceRefresh) {
    const cached = await getCachedHubSpotProperties(apiObjectType);
    if (cached) {
      return cached;
    }
  }

  const rawProperties = await fetchHubSpotPropertiesPaged(apiObjectType, auth);
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
// Prefers user-level OAuth for personal attribution in HubSpot history
async function updateHubSpotRecord(objectType, recordId, properties, orgId = null) {
  console.log('[RevGuide BG] Updating record:', objectType, recordId, properties, 'orgId:', orgId);

  // Use getHubSpotAuthForWrite to prefer user token for personal attribution
  const auth = await getHubSpotAuthForWrite(orgId);
  if (!auth) {
    throw new Error('HubSpot not connected. Connect via OAuth in settings or add a Private App token.');
  }

  if (!objectType || !recordId) {
    throw new Error('Missing object type or record ID');
  }

  const apiObjectType = getHubSpotApiObjectType(objectType);
  const endpoint = `/crm/v3/objects/${apiObjectType}/${recordId}`;
  console.log('[RevGuide BG] PATCH request to:', endpoint, 'using', auth.type, 'auth');

  let data;
  if (auth.type === 'user-oauth') {
    // Use user's OAuth proxy - updates attributed to the specific user
    // Try with attribution property first, fall back without it if property doesn't exist
    const propsWithAttribution = { ...properties };
    if (auth.hubspotEmail) {
      propsWithAttribution.revguide_last_modified_by = auth.hubspotEmail;
      console.log('[RevGuide BG] Attempting attribution:', auth.hubspotEmail);
    }

    try {
      data = await userHubspotProxyRequest(auth.connectionId, endpoint, 'PATCH', { properties: propsWithAttribution });
    } catch (err) {
      // If the attribution property doesn't exist, retry without it
      if (err.message && err.message.includes('revguide_last_modified_by') && err.message.includes('PROPERTY_DOESNT_EXIST')) {
        console.log('[RevGuide BG] Attribution property not found, retrying without it');
        data = await userHubspotProxyRequest(auth.connectionId, endpoint, 'PATCH', { properties });
      } else {
        throw err;
      }
    }
  } else if (auth.type === 'oauth') {
    // Use org-level OAuth proxy - updates attributed to "RevGuide" app
    data = await hubspotProxyRequest(auth.connectionId, endpoint, 'PATCH', { properties });
  } else {
    // Use Private App token directly
    const response = await fetch(`https://api.hubapi.com${endpoint}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${auth.apiToken}`,
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

    data = await response.json();
  }

  console.log('[RevGuide BG] Success, updated properties');
  return data;
}

// ============================================
// List Memberships (for list condition evaluation)
// ============================================

const LIST_MEMBERSHIPS_CACHE_KEY = 'listMembershipsCache';
const LIST_MEMBERSHIPS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get HubSpot object type ID from object type name
 * @param {string} objectType - 'contact', 'company', 'deal', 'ticket'
 * @returns {string} Object type ID (e.g., '0-1')
 */
function getHubSpotObjectTypeId(objectType) {
  const typeMap = {
    'contact': '0-1',
    'contacts': '0-1',
    'company': '0-2',
    'companies': '0-2',
    'deal': '0-3',
    'deals': '0-3',
    'ticket': '0-5',
    'tickets': '0-5'
  };
  return typeMap[objectType?.toLowerCase()] || '0-1';
}

/**
 * Get list memberships for a record (with caching)
 * @param {string} objectType - Object type (contact, company, deal)
 * @param {string} recordId - HubSpot record ID
 * @param {string} portalId - Portal ID for cache key
 * @param {string} orgId - Organization ID (optional, for OAuth lookup)
 * @returns {Promise<Array>} Array of list IDs the record belongs to
 */
async function getListMemberships(objectType, recordId, portalId, orgId = null) {
  const cacheKey = `${portalId}_${objectType}_${recordId}`;

  // Check cache first
  const { [LIST_MEMBERSHIPS_CACHE_KEY]: cache } = await chrome.storage.local.get({
    [LIST_MEMBERSHIPS_CACHE_KEY]: {}
  });

  const cached = cache[cacheKey];
  if (cached && cached.timestamp && (Date.now() - cached.timestamp < LIST_MEMBERSHIPS_CACHE_TTL_MS)) {
    console.log('[RevGuide BG] List memberships from cache:', cached.listIds?.length || 0);
    return cached.listIds || [];
  }

  // Get HubSpot auth (OAuth or Private App token)
  const auth = await getHubSpotAuth(orgId);
  if (!auth) {
    console.warn('[RevGuide BG] No HubSpot connection, cannot fetch list memberships');
    return [];
  }

  try {
    const objectTypeId = getHubSpotObjectTypeId(objectType);
    const endpoint = `/crm/v3/lists/records/${objectTypeId}/${recordId}/memberships`;

    console.log('[RevGuide BG] Fetching list memberships:', endpoint, 'using', auth.type, 'auth');

    let data;
    if (auth.type === 'oauth') {
      data = await hubspotProxyRequest(auth.connectionId, endpoint);
    } else {
      const response = await fetch(`https://api.hubapi.com${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${auth.apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn('[RevGuide BG] List memberships API error:', response.status, errText);
        return [];
      }

      data = await response.json();
    }

    const listIds = data.listIds || [];

    console.log('[RevGuide BG] Got list memberships:', listIds.length);

    // Cache the result
    const updatedCache = {
      ...cache,
      [cacheKey]: {
        listIds,
        timestamp: Date.now()
      }
    };

    // Prune old cache entries (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const key in updatedCache) {
      if (updatedCache[key].timestamp && updatedCache[key].timestamp < oneHourAgo) {
        delete updatedCache[key];
      }
    }

    await chrome.storage.local.set({ [LIST_MEMBERSHIPS_CACHE_KEY]: updatedCache });

    return listIds;
  } catch (error) {
    console.error('[RevGuide BG] Error fetching list memberships:', error);
    return [];
  }
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
