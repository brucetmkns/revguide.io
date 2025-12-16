/**
 * RevGuide - Nango Client
 * Handles HubSpot OAuth via Nango Connect UI
 *
 * Uses Nango's hosted Connect UI popup for OAuth flow.
 * See: https://nango.dev/docs/guides/api-authorization/authorize-in-your-app-default-ui
 */

// Integration ID must match what you configured in Nango Dashboard > Integrations
const HUBSPOT_INTEGRATION_ID = 'hubspot';

// Supabase edge function URL for Nango operations
const NANGO_EDGE_FUNCTION_URL = window.SUPABASE_URL
  ? `${window.SUPABASE_URL}/functions/v1/nango-callback`
  : '/api/nango'; // Fallback for local dev

// Nango Connect UI base URL
const NANGO_CONNECT_URL = 'https://connect.nango.dev';

/**
 * RevGuide Nango API
 */
const RevGuideNango = {
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          endUser,
          allowedIntegrations: [HUBSPOT_INTEGRATION_ID]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get session token');
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('[RevGuide] Failed to get session token:', error);
      throw error;
    }
  },

  /**
   * Connect HubSpot account via OAuth using Nango Connect UI popup
   * @param {string} connectionId - Unique identifier for this connection (usually org_id or user_id)
   * @param {Object} endUser - End user info for session token
   * @returns {Promise<Object>} Connection result with portal info
   */
  async connectHubSpot(connectionId, endUser = {}) {
    try {
      // Get session token from backend
      const sessionToken = await this.getSessionToken({
        id: endUser.id || connectionId,
        email: endUser.email || '',
        displayName: endUser.displayName || ''
      });

      console.log('[RevGuide] Got session token, opening Connect UI...');

      // Open Nango Connect UI popup
      const result = await this.openConnectUI(sessionToken, connectionId);

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
   * Open Nango Connect UI in a popup window
   * @param {string} sessionToken - Connect session token
   * @param {string} connectionId - Connection ID
   * @returns {Promise<Object>} Connection result
   */
  openConnectUI(sessionToken, connectionId) {
    return new Promise((resolve, reject) => {
      // Build Connect UI URL
      const connectUrl = new URL(NANGO_CONNECT_URL);
      connectUrl.searchParams.set('session_token', sessionToken);

      // Open popup
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        connectUrl.toString(),
        'nango-connect',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
      );

      if (!popup) {
        reject(new Error('Popup blocked. Please allow popups for this site.'));
        return;
      }

      // Listen for messages from popup
      const messageHandler = (event) => {
        // Verify origin
        if (!event.origin.includes('nango.dev')) return;

        const { type, data } = event.data || {};

        if (type === 'authorization_success' || type === 'success') {
          window.removeEventListener('message', messageHandler);
          popup.close();
          resolve({
            connectionId: data?.connectionId || connectionId,
            providerConfigKey: HUBSPOT_INTEGRATION_ID
          });
        } else if (type === 'authorization_error' || type === 'error') {
          window.removeEventListener('message', messageHandler);
          popup.close();
          reject(new Error(data?.error || 'Authorization failed'));
        }
      };

      window.addEventListener('message', messageHandler);

      // Check if popup was closed manually
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          reject(new Error('Authorization cancelled'));
        }
      }, 500);
    });
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
