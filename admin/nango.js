/**
 * RevGuide - Nango Client
 * Handles HubSpot OAuth via Nango using redirect flow
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
   * Start HubSpot OAuth flow via redirect
   * Redirects user to Nango Connect UI, which will redirect back after OAuth
   * @param {string} returnUrl - URL to return to after OAuth completes
   * @param {Object} endUser - End user info for session token
   */
  async startHubSpotOAuth(returnUrl, endUser = {}) {
    try {
      // Generate a unique end user ID
      const endUserId = endUser.id || 'user_' + Date.now();

      // Get session token from backend
      const sessionToken = await this.getSessionToken({
        id: endUserId,
        email: endUser.email || '',
        displayName: endUser.displayName || ''
      });

      // Store return URL and end user ID in session storage
      sessionStorage.setItem('nango_return_url', returnUrl);
      sessionStorage.setItem('nango_end_user_id', endUserId);

      // Build Connect UI URL
      const connectUrl = new URL(NANGO_CONNECT_URL);
      connectUrl.searchParams.set('session_token', sessionToken);

      console.log('[RevGuide] Redirecting to Nango Connect UI...');

      // Redirect to Nango Connect UI (full page redirect, not popup)
      window.location.href = connectUrl.toString();
    } catch (error) {
      console.error('[RevGuide] Failed to start HubSpot OAuth:', error);
      throw error;
    }
  },

  /**
   * Check if returning from OAuth flow
   * Call this on page load to detect if user just completed OAuth
   * @returns {boolean} True if returning from OAuth
   */
  isReturningFromOAuth() {
    return sessionStorage.getItem('nango_return_url') !== null;
  },

  /**
   * Complete the OAuth flow after returning from Nango
   * @returns {Promise<Object>} Connection details or null if not returning from OAuth
   */
  async completeOAuthFlow() {
    const returnUrl = sessionStorage.getItem('nango_return_url');
    const endUserId = sessionStorage.getItem('nango_end_user_id');

    if (!returnUrl) {
      return null;
    }

    // Clear session storage
    sessionStorage.removeItem('nango_return_url');
    sessionStorage.removeItem('nango_end_user_id');

    try {
      // Check if connection was established
      const connection = await this.getConnectionDetails(endUserId || 'any');

      if (connection && connection.isConnected) {
        console.log('[RevGuide] OAuth completed successfully:', connection);
        return connection;
      } else {
        console.log('[RevGuide] OAuth may have been cancelled');
        return null;
      }
    } catch (error) {
      console.error('[RevGuide] Error completing OAuth flow:', error);
      return null;
    }
  },

  /**
   * Get connection details from backend
   * @param {string} connectionId - The connection ID or end_user ID
   * @returns {Promise<Object>} Connection details including portal info
   */
  async getConnectionDetails(connectionId) {
    try {
      const response = await fetch(`${NANGO_EDGE_FUNCTION_URL}/connection?connectionId=${connectionId}`);

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
   * Check if HubSpot is connected
   * @returns {Promise<Object|null>} Connection info if connected, null otherwise
   */
  async checkConnection() {
    try {
      // Use 'any' to get the most recent connection
      const details = await this.getConnectionDetails('any');
      if (details?.isConnected) {
        return details;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Disconnect HubSpot account
   * @param {string} connectionId - The connection ID to disconnect
   * @returns {Promise<Object>}
   */
  async disconnect(connectionId) {
    try {
      const response = await fetch(`${NANGO_EDGE_FUNCTION_URL}/disconnect`, {
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
      const response = await fetch(`${NANGO_EDGE_FUNCTION_URL}/proxy`, {
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
  }
};

// Export for use in other scripts
window.RevGuideNango = RevGuideNango;
