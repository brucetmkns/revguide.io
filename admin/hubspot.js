/**
 * RevGuide - HubSpot Client
 * Direct OAuth flow with Supabase backend (replaces Nango)
 */

// Supabase edge function URL for HubSpot operations
const HUBSPOT_EDGE_FUNCTION_URL = window.SUPABASE_URL
  ? `${window.SUPABASE_URL}/functions/v1/hubspot-oauth`
  : '/api/hubspot';

/**
 * RevGuide HubSpot API
 */
const RevGuideHubSpot = {
  /**
   * Start HubSpot OAuth flow
   * Redirects user to HubSpot authorization page
   * @param {string} returnUrl - URL to return to after OAuth (default: current page)
   * @param {string} organizationId - Optional organization ID to link connection to
   */
  async connect(returnUrl = window.location.href, organizationId = null) {
    try {
      // Get auth token if available
      const headers = {
        'Content-Type': 'application/json'
      };

      // Add authorization if user is logged in
      if (typeof RevGuideAuth !== 'undefined') {
        const { data: { session } } = await RevGuideAuth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const response = await fetch(`${HUBSPOT_EDGE_FUNCTION_URL}/authorize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          returnUrl,
          organizationId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start OAuth flow');
      }

      const { authUrl } = await response.json();

      console.log('[RevGuide] Redirecting to HubSpot OAuth...');

      // Redirect to HubSpot authorization page
      window.location.href = authUrl;

    } catch (error) {
      console.error('[RevGuide] Failed to start HubSpot OAuth:', error);
      throw error;
    }
  },

  /**
   * Check if returning from OAuth flow
   * Call this on page load to detect if user just completed OAuth
   * @returns {Object} { isReturning: boolean, success: boolean, error: string|null, portal: string|null }
   */
  checkOAuthReturn() {
    const params = new URLSearchParams(window.location.search);

    const connected = params.get('connected');
    const error = params.get('error');
    const portal = params.get('portal');

    if (!connected && !error) {
      return { isReturning: false, success: false, error: null, portal: null };
    }

    return {
      isReturning: true,
      success: connected === 'true',
      error: error || null,
      portal: portal || null
    };
  },

  /**
   * Clear OAuth return parameters from URL
   * Call after handling the OAuth return
   */
  clearOAuthParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete('connected');
    url.searchParams.delete('error');
    url.searchParams.delete('portal');
    window.history.replaceState({}, '', url.pathname + url.search);
  },

  /**
   * Get connection status for current user
   * @returns {Promise<Object>} Connection details or { isConnected: false }
   */
  async getConnection() {
    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      // Add authorization
      if (typeof RevGuideAuth !== 'undefined') {
        const { data: { session } } = await RevGuideAuth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const response = await fetch(`${HUBSPOT_EDGE_FUNCTION_URL}/connection`, {
        headers
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[RevGuide] Get connection error:', error);
        return { isConnected: false, error: error.error };
      }

      return await response.json();

    } catch (error) {
      console.error('[RevGuide] Failed to get connection:', error);
      return { isConnected: false, error: error.message };
    }
  },

  /**
   * Check if HubSpot is connected
   * @returns {Promise<boolean>}
   */
  async isConnected() {
    const connection = await this.getConnection();
    return connection.isConnected === true;
  },

  /**
   * Disconnect HubSpot account
   * @param {string} connectionId - The connection ID to disconnect
   * @returns {Promise<Object>} { success: boolean, error?: string }
   */
  async disconnect(connectionId) {
    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      // Add authorization
      if (typeof RevGuideAuth !== 'undefined') {
        const { data: { session } } = await RevGuideAuth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const response = await fetch(`${HUBSPOT_EDGE_FUNCTION_URL}/disconnect`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ connectionId })
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Disconnect failed' };
      }

      return await response.json();

    } catch (error) {
      console.error('[RevGuide] Disconnect failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Make a proxied API call to HubSpot
   * @param {string} connectionId - The connection ID
   * @param {string} endpoint - HubSpot API endpoint (e.g., '/crm/v3/objects/contacts')
   * @param {Object} options - Fetch options (method, body)
   * @returns {Promise<Object>} API response
   */
  async proxy(connectionId, endpoint, options = {}) {
    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      // Add authorization
      if (typeof RevGuideAuth !== 'undefined') {
        const { data: { session } } = await RevGuideAuth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const response = await fetch(`${HUBSPOT_EDGE_FUNCTION_URL}/proxy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          connectionId,
          endpoint,
          method: options.method || 'GET',
          body: options.body
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `API call failed: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error('[RevGuide] Proxy request failed:', error);
      throw error;
    }
  },

  /**
   * Fetch HubSpot properties for an object type
   * @param {string} connectionId - The connection ID
   * @param {string} objectType - Object type (contacts, companies, deals)
   * @returns {Promise<Array>} Array of property definitions
   */
  async getProperties(connectionId, objectType) {
    const data = await this.proxy(connectionId, `/crm/v3/properties/${objectType}`);
    return data.results || [];
  },

  /**
   * Fetch HubSpot contacts
   * @param {string} connectionId - The connection ID
   * @param {Object} options - Query options (limit, properties, etc.)
   * @returns {Promise<Object>} Contacts response
   */
  async getContacts(connectionId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.properties) params.set('properties', options.properties.join(','));

    const endpoint = `/crm/v3/objects/contacts${params.toString() ? '?' + params.toString() : ''}`;
    return await this.proxy(connectionId, endpoint);
  },

  /**
   * Fetch HubSpot companies
   * @param {string} connectionId - The connection ID
   * @param {Object} options - Query options (limit, properties, etc.)
   * @returns {Promise<Object>} Companies response
   */
  async getCompanies(connectionId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.properties) params.set('properties', options.properties.join(','));

    const endpoint = `/crm/v3/objects/companies${params.toString() ? '?' + params.toString() : ''}`;
    return await this.proxy(connectionId, endpoint);
  },

  /**
   * Fetch HubSpot deals
   * @param {string} connectionId - The connection ID
   * @param {Object} options - Query options (limit, properties, etc.)
   * @returns {Promise<Object>} Deals response
   */
  async getDeals(connectionId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.properties) params.set('properties', options.properties.join(','));

    const endpoint = `/crm/v3/objects/deals${params.toString() ? '?' + params.toString() : ''}`;
    return await this.proxy(connectionId, endpoint);
  },

  // ============================================
  // HubSpot Lists API
  // ============================================

  /**
   * Fetch all HubSpot lists
   * @param {string} connectionId - The connection ID
   * @returns {Promise<Array>} Array of lists with id, name, objectType, etc.
   */
  async getLists(connectionId) {
    const allLists = [];
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      const data = await this.proxy(connectionId, `/crm/v3/lists?count=250&offset=${offset}`);

      if (data.lists && data.lists.length > 0) {
        allLists.push(...data.lists.map(list => ({
          listId: list.listId,
          name: list.name,
          objectType: list.objectTypeId || 'CONTACT',
          listType: list.processingType, // STATIC, DYNAMIC
          size: list.size || 0
        })));
      }

      hasMore = data.hasMore === true;
      offset = data.offset || (offset + 250);

      // Safety limit
      if (allLists.length > 5000) {
        console.warn('[RevGuide] Reached list limit of 5000');
        break;
      }
    }

    return allLists;
  },

  /**
   * Get HubSpot object type ID from object type name
   * @param {string} objectType - 'CONTACT', 'COMPANY', 'DEAL', 'TICKET'
   * @returns {string} Object type ID (e.g., '0-1')
   */
  getObjectTypeId(objectType) {
    const typeMap = {
      'CONTACT': '0-1',
      'COMPANY': '0-2',
      'DEAL': '0-3',
      'TICKET': '0-5'
    };
    return typeMap[objectType?.toUpperCase()] || '0-1';
  },

  /**
   * Get lists that a record belongs to
   * @param {string} connectionId - The connection ID
   * @param {string} objectType - 'CONTACT', 'COMPANY', 'DEAL'
   * @param {string} recordId - The HubSpot record ID
   * @returns {Promise<Array>} Array of list IDs the record belongs to
   */
  async getRecordListMemberships(connectionId, objectType, recordId) {
    try {
      const objectTypeId = this.getObjectTypeId(objectType);
      const data = await this.proxy(
        connectionId,
        `/crm/v3/lists/records/${objectTypeId}/${recordId}/memberships`
      );

      // Returns array of list IDs
      return data.listIds || [];
    } catch (error) {
      console.error('[RevGuide] Failed to get list memberships:', error);
      return [];
    }
  }
};

// Export for use in other scripts
window.RevGuideHubSpot = RevGuideHubSpot;
