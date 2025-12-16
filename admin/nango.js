/**
 * RevGuide - Nango Client
 * Handles HubSpot OAuth via Nango using session tokens
 *
 * Nango deprecated public keys - now requires session tokens generated server-side.
 * See: https://nango.dev/docs/reference/sdks/frontend
 */

// Integration ID must match what you configured in Nango Dashboard > Integrations
const HUBSPOT_INTEGRATION_ID = 'hubspot';

// Supabase edge function URL for Nango operations
const NANGO_EDGE_FUNCTION_URL = window.SUPABASE_URL
  ? `${window.SUPABASE_URL}/functions/v1/nango-callback`
  : '/api/nango'; // Fallback for local dev

// Load Nango SDK from CDN
const nangoScript = document.createElement('script');
nangoScript.src = 'https://unpkg.com/@nangohq/frontend@latest/dist/index.global.js';
document.head.appendChild(nangoScript);

// Nango SDK ready flag
let nangoSDKReady = false;

nangoScript.onload = () => {
  nangoSDKReady = true;
  window.dispatchEvent(new CustomEvent('nango-ready'));
};

/**
 * RevGuide Nango API
 */
const RevGuideNango = {
  /**
   * Wait for Nango SDK to be ready
   */
  async waitForSDK() {
    if (nangoSDKReady) return;

    return new Promise((resolve) => {
      window.addEventListener('nango-ready', () => {
        resolve();
      }, { once: true });
    });
  },

  /**
   * Get a session token from the backend
   * @param {Object} endUser - End user info (id, email, displayName)
   * @returns {Promise<string>} Session token
   */
  async getSessionToken(endUser) {
    try {
      const response = await fetch(`${NANGO_EDGE_FUNCTION_URL}/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.SUPABASE_ANON_KEY || ''}`
        },
        body: JSON.stringify({
          endUser,
          allowedIntegrations: [HUBSPOT_INTEGRATION_ID]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get session token');
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('[RevGuide] Failed to get session token:', error);
      throw error;
    }
  },

  /**
   * Connect HubSpot account via OAuth
   * @param {string} connectionId - Unique identifier for this connection (usually org_id or user_id)
   * @param {Object} endUser - End user info for session token
   * @returns {Promise<Object>} Connection result with portal info
   */
  async connectHubSpot(connectionId, endUser = {}) {
    await this.waitForSDK();

    try {
      // Get session token from backend
      const sessionToken = await this.getSessionToken({
        id: endUser.id || connectionId,
        email: endUser.email || '',
        displayName: endUser.displayName || ''
      });

      // Initialize Nango with session token
      const nango = new Nango({ connectSessionToken: sessionToken });

      // Trigger OAuth flow
      const result = await nango.auth(HUBSPOT_INTEGRATION_ID, connectionId);

      // Result contains: providerConfigKey, connectionId
      console.log('[RevGuide] HubSpot connected:', result);

      // Fetch connection details to get portal info
      const connectionDetails = await this.getConnectionDetails(connectionId);

      return {
        success: true,
        connectionId: result.connectionId,
        ...connectionDetails
      };
    } catch (error) {
      console.error('[RevGuide] HubSpot connection failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to connect HubSpot'
      };
    }
  },

  /**
   * Get connection details from backend
   * @param {string} connectionId - The connection ID
   * @returns {Promise<Object>} Connection details including portal info
   */
  async getConnectionDetails(connectionId) {
    try {
      // Call our edge function to get connection details
      const response = await fetch(`/api/nango/connection?connectionId=${connectionId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch connection details');
      }

      return await response.json();
    } catch (error) {
      console.error('[RevGuide] Failed to get connection details:', error);
      return null;
    }
  },

  /**
   * Check if HubSpot is connected for this connection ID
   * @param {string} connectionId - The connection ID to check
   * @returns {Promise<boolean>}
   */
  async isConnected(connectionId) {
    try {
      const details = await this.getConnectionDetails(connectionId);
      return details?.isConnected === true;
    } catch {
      return false;
    }
  },

  /**
   * Disconnect HubSpot account
   * @param {string} connectionId - The connection ID to disconnect
   * @returns {Promise<Object>}
   */
  async disconnect(connectionId) {
    try {
      const response = await fetch('/api/nango/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId })
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      return { success: true };
    } catch (error) {
      console.error('[RevGuide] Disconnect failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Make a proxied API call to HubSpot via Nango
   * @param {string} connectionId - The connection ID
   * @param {string} endpoint - HubSpot API endpoint (e.g., '/crm/v3/objects/contacts')
   * @param {Object} options - Fetch options (method, body, etc.)
   * @returns {Promise<Object>}
   */
  async proxyRequest(connectionId, endpoint, options = {}) {
    try {
      const response = await fetch('/api/nango/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          endpoint,
          method: options.method || 'GET',
          body: options.body
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Proxy request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('[RevGuide] Proxy request failed:', error);
      throw error;
    }
  },

  /**
   * Get HubSpot portal info from connected account
   * @param {string} connectionId - The connection ID
   * @returns {Promise<Object>} Portal info (id, domain, name)
   */
  async getPortalInfo(connectionId) {
    try {
      // HubSpot account info endpoint
      const response = await this.proxyRequest(connectionId, '/account-info/v3/details');
      return {
        portalId: response.portalId?.toString(),
        portalDomain: response.uiDomain,
        portalName: response.companyName || response.uiDomain,
        timeZone: response.timeZone
      };
    } catch (error) {
      console.error('[RevGuide] Failed to get portal info:', error);
      return null;
    }
  },

  /**
   * Fetch HubSpot properties for an object type
   * @param {string} connectionId - The connection ID
   * @param {string} objectType - Object type (contacts, companies, deals, tickets)
   * @returns {Promise<Array>}
   */
  async getProperties(connectionId, objectType) {
    const response = await this.proxyRequest(
      connectionId,
      `/crm/v3/properties/${objectType}`
    );
    return response.results || [];
  },

  /**
   * Fetch a HubSpot record
   * @param {string} connectionId - The connection ID
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @param {Array<string>} properties - Properties to fetch
   * @returns {Promise<Object>}
   */
  async getRecord(connectionId, objectType, recordId, properties = []) {
    const queryParams = properties.length > 0
      ? `?properties=${properties.join(',')}`
      : '';

    return this.proxyRequest(
      connectionId,
      `/crm/v3/objects/${objectType}/${recordId}${queryParams}`
    );
  },

  /**
   * Update a HubSpot record
   * @param {string} connectionId - The connection ID
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @param {Object} properties - Properties to update
   * @returns {Promise<Object>}
   */
  async updateRecord(connectionId, objectType, recordId, properties) {
    return this.proxyRequest(
      connectionId,
      `/crm/v3/objects/${objectType}/${recordId}`,
      {
        method: 'PATCH',
        body: { properties }
      }
    );
  }
};

// Export for use in other scripts
window.RevGuideNango = RevGuideNango;
