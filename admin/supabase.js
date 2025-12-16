/**
 * RevGuide - Supabase Client
 * Handles authentication and database operations
 */

// Supabase configuration
const SUPABASE_URL = 'https://qbdhvhrowmfnacyikkbf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RC5R8c5f-uoyMkoABXCRPg_n3HjyXXS';

// Expose for nango.js to use
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

// Import Supabase client from local bundle (required for Chrome extension CSP)
const supabaseScript = document.createElement('script');
supabaseScript.src = chrome.runtime.getURL('admin/lib/supabase.min.js');
document.head.appendChild(supabaseScript);

// Wait for Supabase to load
let supabaseClient = null;

supabaseScript.onload = () => {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: 'revguide-auth'
    }
  });

  // Dispatch event when ready
  window.dispatchEvent(new CustomEvent('supabase-ready'));
};

/**
 * RevGuide Authentication API
 */
const RevGuideAuth = {
  /**
   * Wait for Supabase client to be ready
   */
  async waitForClient() {
    if (supabaseClient) return supabaseClient;

    return new Promise((resolve) => {
      window.addEventListener('supabase-ready', () => {
        resolve(supabaseClient);
      }, { once: true });
    });
  },

  /**
   * Get current session
   */
  async getSession() {
    const client = await this.waitForClient();
    return client.auth.getSession();
  },

  /**
   * Get current user
   */
  async getUser() {
    const client = await this.waitForClient();
    return client.auth.getUser();
  },

  /**
   * Sign in with magic link
   */
  async signInWithMagicLink(email) {
    const client = await this.waitForClient();
    const redirectUrl = window.location.origin + window.location.pathname;

    return client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
  },

  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle() {
    const client = await this.waitForClient();
    const redirectUrl = window.location.origin + window.location.pathname;

    return client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });
  },

  /**
   * Sign out
   */
  async signOut() {
    const client = await this.waitForClient();
    return client.auth.signOut();
  },

  /**
   * Listen for auth state changes
   */
  async onAuthStateChange(callback) {
    const client = await this.waitForClient();
    return client.auth.onAuthStateChange(callback);
  }
};

/**
 * RevGuide Database API
 */
const RevGuideDB = {
  // Cached organization ID to avoid repeated queries
  _cachedOrgId: null,
  _cachedOrgIdTimestamp: 0,
  _ORG_CACHE_TTL: 10 * 60 * 1000, // 10 minutes

  /**
   * Get cached organization ID (fast path)
   */
  getCachedOrgId() {
    if (this._cachedOrgId && (Date.now() - this._cachedOrgIdTimestamp < this._ORG_CACHE_TTL)) {
      return this._cachedOrgId;
    }
    // Also check sessionStorage for cross-page persistence
    try {
      const cached = sessionStorage.getItem('revguide_org_id');
      if (cached) {
        const { orgId, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < this._ORG_CACHE_TTL) {
          this._cachedOrgId = orgId;
          this._cachedOrgIdTimestamp = timestamp;
          return orgId;
        }
      }
    } catch (e) {}
    return null;
  },

  /**
   * Set cached organization ID
   */
  setCachedOrgId(orgId) {
    this._cachedOrgId = orgId;
    this._cachedOrgIdTimestamp = Date.now();
    try {
      sessionStorage.setItem('revguide_org_id', JSON.stringify({
        orgId,
        timestamp: Date.now()
      }));
    } catch (e) {}
  },

  /**
   * Clear cached organization ID
   */
  clearCachedOrgId() {
    this._cachedOrgId = null;
    this._cachedOrgIdTimestamp = 0;
    try {
      sessionStorage.removeItem('revguide_org_id');
    } catch (e) {}
  },

  /**
   * Get user profile with organization
   */
  async getUserProfile() {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) return { data: null, error: new Error('Not authenticated') };

    // First get the user record
    const { data: userProfile, error: userError } = await client
      .from('users')
      .select('*')
      .eq('auth_user_id', user.id)
      .single();

    if (userError || !userProfile) {
      console.error('Failed to get user profile:', userError);
      return { data: null, error: userError };
    }

    // Cache org ID for fast access
    if (userProfile.organization_id) {
      this.setCachedOrgId(userProfile.organization_id);

      const { data: org, error: orgError } = await client
        .from('organizations')
        .select('*')
        .eq('id', userProfile.organization_id)
        .single();

      if (org) {
        userProfile.organizations = org;
      } else if (orgError) {
        console.warn('Failed to get organization:', orgError);
      }
    }

    return { data: userProfile, error: null };
  },

  /**
   * Get organization ID for current user (uses cache)
   */
  async getOrganizationId() {
    // Fast path: return cached org ID
    const cached = this.getCachedOrgId();
    if (cached) return cached;

    // Slow path: fetch from profile
    const { data: profile } = await this.getUserProfile();
    return profile?.organization_id;
  },

  /**
   * Update current user's profile
   */
  async updateUserProfile(updates) {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) return { error: new Error('Not authenticated') };

    return client
      .from('users')
      .update(updates)
      .eq('auth_user_id', user.id)
      .select()
      .single();
  },

  // ============================================
  // Wiki Entries
  // ============================================

  async getWikiEntries() {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { data: [], error: new Error('No organization') };

    return client
      .from('wiki_entries')
      .select('*')
      .eq('organization_id', orgId)
      .order('title');
  },

  async createWikiEntry(entry) {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { error: new Error('No organization') };

    return client
      .from('wiki_entries')
      .insert({ ...entry, organization_id: orgId })
      .select()
      .single();
  },

  async updateWikiEntry(id, updates) {
    const client = await RevGuideAuth.waitForClient();
    return client
      .from('wiki_entries')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
  },

  async deleteWikiEntry(id) {
    const client = await RevGuideAuth.waitForClient();
    return client
      .from('wiki_entries')
      .delete()
      .eq('id', id);
  },

  // ============================================
  // Banners
  // ============================================

  async getBanners() {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { data: [], error: new Error('No organization') };

    return client
      .from('banners')
      .select('*')
      .eq('organization_id', orgId)
      .order('priority', { ascending: false });
  },

  async createBanner(banner) {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { error: new Error('No organization') };

    return client
      .from('banners')
      .insert({ ...banner, organization_id: orgId })
      .select()
      .single();
  },

  async updateBanner(id, updates) {
    const client = await RevGuideAuth.waitForClient();
    return client
      .from('banners')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
  },

  async deleteBanner(id) {
    const client = await RevGuideAuth.waitForClient();
    return client
      .from('banners')
      .delete()
      .eq('id', id);
  },

  // ============================================
  // Plays
  // ============================================

  async getPlays() {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { data: [], error: new Error('No organization') };

    return client
      .from('plays')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');
  },

  async createPlay(play) {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { error: new Error('No organization') };

    return client
      .from('plays')
      .insert({ ...play, organization_id: orgId })
      .select()
      .single();
  },

  async updatePlay(id, updates) {
    const client = await RevGuideAuth.waitForClient();
    return client
      .from('plays')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
  },

  async deletePlay(id) {
    const client = await RevGuideAuth.waitForClient();
    return client
      .from('plays')
      .delete()
      .eq('id', id);
  },

  // ============================================
  // Team Members
  // ============================================

  async getTeamMembers() {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { data: [], error: new Error('No organization') };

    return client
      .from('users')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at');
  },

  async getInvitations() {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { data: [], error: new Error('No organization') };

    return client
      .from('invitations')
      .select('*')
      .eq('organization_id', orgId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
  },

  async createInvitation(email, role = 'editor') {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { error: new Error('No organization') };

    return client
      .from('invitations')
      .insert({
        organization_id: orgId,
        email,
        role
      })
      .select()
      .single();
  },

  // ============================================
  // Organization
  // ============================================

  async updateOrganization(updates) {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { error: new Error('No organization') };

    return client
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select()
      .single();
  },

  /**
   * Get organization by HubSpot portal ID
   */
  async getOrganizationByPortalId(portalId) {
    const client = await RevGuideAuth.waitForClient();

    const { data, error } = await client
      .from('organizations')
      .select('*')
      .eq('hubspot_portal_id', portalId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching organization by portal ID:', error);
    }

    return data;
  },

  /**
   * Create a new organization
   */
  async createOrganization(orgData) {
    const client = await RevGuideAuth.waitForClient();

    return client
      .from('organizations')
      .insert(orgData)
      .select()
      .single();
  },

  /**
   * Create a new user with a new organization (for onboarding)
   * @param {string} name - User's display name
   * @param {string} companyName - Company/organization name
   * @returns {Promise<{data: {user, organization}, error}>}
   */
  async createUserWithOrganization(name, companyName) {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return { data: null, error: new Error('Not authenticated') };
    }

    // Check if user already has a profile
    const { data: existingUser } = await client
      .from('users')
      .select('id, organization_id')
      .eq('auth_user_id', user.id)
      .single();

    if (existingUser?.organization_id) {
      return { data: null, error: new Error('User already has an organization') };
    }

    // Generate slug from company name
    const slug = companyName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `org-${Date.now()}`;

    // Create organization first
    const { data: org, error: orgError } = await client
      .from('organizations')
      .insert({
        name: companyName,
        slug: slug
      })
      .select()
      .single();

    if (orgError) {
      console.error('Failed to create organization:', orgError);
      return { data: null, error: orgError };
    }

    // Create or update user profile linked to organization
    let userProfile;
    let userError;

    if (existingUser) {
      // Update existing user
      const result = await client
        .from('users')
        .update({
          name: name,
          organization_id: org.id,
          role: 'admin'
        })
        .eq('auth_user_id', user.id)
        .select()
        .single();
      userProfile = result.data;
      userError = result.error;
    } else {
      // Create new user
      const result = await client
        .from('users')
        .insert({
          auth_user_id: user.id,
          email: user.email,
          name: name,
          organization_id: org.id,
          role: 'admin'
        })
        .select()
        .single();
      userProfile = result.data;
      userError = result.error;
    }

    if (userError) {
      console.error('Failed to create/update user profile:', userError);
      // Clean up org if user creation failed
      await client.from('organizations').delete().eq('id', org.id);
      return { data: null, error: userError };
    }

    // Cache the org ID for fast access
    this.setCachedOrgId(org.id);

    return { data: { user: userProfile, organization: org }, error: null };
  },

  /**
   * Link a user to an organization
   */
  async linkUserToOrganization(authUserId, organizationId, role = 'member') {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) return { error: new Error('Not authenticated') };

    // Check if user record exists
    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (existingUser) {
      // Update existing user
      return client
        .from('users')
        .update({ organization_id: organizationId, role })
        .eq('auth_user_id', user.id)
        .select()
        .single();
    } else {
      // Create new user record
      return client
        .from('users')
        .insert({
          auth_user_id: user.id,
          email: user.email,
          organization_id: organizationId,
          role
        })
        .select()
        .single();
    }
  },

  /**
   * Get current organization with HubSpot connection details
   */
  async getOrganizationWithConnection() {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { data: null, error: new Error('No organization') };

    return client
      .from('organizations')
      .select('*, hubspot_connections(*)')
      .eq('id', orgId)
      .single();
  },

  // ============================================
  // HubSpot Connections
  // ============================================

  /**
   * Create a HubSpot connection record
   */
  async createHubSpotConnection(connectionData) {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    return client
      .from('hubspot_connections')
      .insert({
        ...connectionData,
        connected_by: user?.id,
        is_active: true
      })
      .select()
      .single();
  },

  /**
   * Get active HubSpot connections for current organization
   */
  async getHubSpotConnections() {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { data: [], error: new Error('No organization') };

    return client
      .from('hubspot_connections')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('connected_at', { ascending: false });
  },

  /**
   * Get the primary (active) HubSpot connection
   */
  async getPrimaryHubSpotConnection() {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { data: null, error: new Error('No organization') };

    return client
      .from('hubspot_connections')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('connected_at', { ascending: false })
      .limit(1)
      .single();
  },

  /**
   * Disconnect a HubSpot connection (mark as inactive)
   */
  async disconnectHubSpot(connectionId) {
    const client = await RevGuideAuth.waitForClient();

    return client
      .from('hubspot_connections')
      .update({ is_active: false })
      .eq('id', connectionId)
      .select()
      .single();
  },

  /**
   * Check if organization has an active HubSpot connection
   */
  async hasHubSpotConnection() {
    const { data } = await this.getPrimaryHubSpotConnection();
    return !!data;
  },

  // ============================================
  // Realtime Subscriptions
  // ============================================

  async subscribeToChanges(table, callback) {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return null;

    return client
      .channel(`${table}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: `organization_id=eq.${orgId}`
        },
        callback
      )
      .subscribe();
  }
};

// Export for use in other scripts
window.RevGuideAuth = RevGuideAuth;
window.RevGuideDB = RevGuideDB;
