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

// Import Supabase client
// In extension context: use local bundle
// In web context: Supabase must be loaded separately (e.g., via build process or separate script)
const supabaseScript = document.createElement('script');
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
  // Chrome extension context - use local bundle (Manifest V3 requirement)
  supabaseScript.src = chrome.runtime.getURL('admin/lib/supabase.min.js');
  document.head.appendChild(supabaseScript);
} else if (typeof window.supabase === 'undefined') {
  // Web context - Supabase should be loaded by the hosting page
  console.warn('RevGuide: Supabase client not found. Please ensure Supabase is loaded before this script.');
}

// Wait for Supabase to load
let supabaseClient = null;

function initSupabaseClient() {
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
}

// Initialize when script loads (extension) or immediately if already available (web)
if (supabaseScript.src) {
  supabaseScript.onload = initSupabaseClient;
} else if (typeof window.supabase !== 'undefined') {
  // Supabase already loaded in web context
  initSupabaseClient();
}

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
   * Sign up with email and password
   * @param {string} email
   * @param {string} password
   * @param {Object} metadata - Optional user metadata (fullName, companyName)
   */
  async signUp(email, password, metadata = {}) {
    const client = await this.waitForClient();
    const redirectUrl = window.location.origin + '/signup';

    return client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: metadata.fullName || '',
          company_name: metadata.companyName || ''
        }
      }
    });
  },

  /**
   * Sign in with email and password
   */
  async signIn(email, password) {
    const client = await this.waitForClient();
    return client.auth.signInWithPassword({
      email,
      password
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
   * Resend confirmation email
   */
  async resendConfirmation(email) {
    const client = await this.waitForClient();
    const redirectUrl = window.location.origin + '/signup';

    return client.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
  },

  /**
   * Send password reset email
   */
  async resetPassword(email) {
    const client = await this.waitForClient();
    const redirectUrl = window.location.origin + '/reset-password';

    return client.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });
  },

  /**
   * Update user password (after reset)
   */
  async updatePassword(newPassword) {
    const client = await this.waitForClient();
    return client.auth.updateUser({ password: newPassword });
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

    // Use active_organization_id if set, otherwise fall back to primary organization_id
    const effectiveOrgId = userProfile.active_organization_id || userProfile.organization_id;

    // Cache org ID for fast access
    if (effectiveOrgId) {
      this.setCachedOrgId(effectiveOrgId);

      const { data: org, error: orgError } = await client
        .from('organizations')
        .select('*')
        .eq('id', effectiveOrgId)
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

    // Get regular team members (users with organization_id set)
    const { data: regularMembers, error: regularError } = await client
      .from('users')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at');

    if (regularError) {
      return { data: [], error: regularError };
    }

    // Get partners from organization_members table
    const { data: partnerMembers, error: partnerError } = await client
      .from('organization_members')
      .select('user_id, role, joined_at, users(id, name, email, auth_user_id, created_at)')
      .eq('organization_id', orgId)
      .in('role', ['consultant', 'partner']);

    if (partnerError) {
      console.warn('[getTeamMembers] Error fetching partners:', partnerError);
      // Still return regular members even if partner query fails
      return { data: regularMembers || [], error: null };
    }

    // Transform partner data to match regular member format
    const transformedPartners = (partnerMembers || []).map(pm => ({
      ...pm.users,
      role: 'partner', // Normalize consultant to partner
      joined_at: pm.joined_at,
      is_partner: true // Flag to identify partners
    }));

    // Filter out duplicates (in case someone is both a regular member and partner)
    const regularIds = new Set((regularMembers || []).map(m => m.id));
    const uniquePartners = transformedPartners.filter(p => !regularIds.has(p.id));

    // Combine and return
    return { data: [...(regularMembers || []), ...uniquePartners], error: null };
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

  async createInvitation(email, role = 'member') {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { error: new Error('No organization') };

    const { data: { user } } = await client.auth.getUser();
    const { data: profile } = await this.getUserProfile();

    return client
      .from('invitations')
      .insert({
        organization_id: orgId,
        email,
        role,
        invited_by: profile?.id || null
      })
      .select()
      .single();
  },

  /**
   * Get invitation by token (for accepting invites)
   * @param {boolean} includingAccepted - If true, also returns already-accepted invitations
   */
  async getInvitationByToken(token, includingAccepted = false) {
    const client = await RevGuideAuth.waitForClient();

    let query = client
      .from('invitations')
      .select('*, organizations(name)')
      .eq('token', token);

    if (!includingAccepted) {
      query = query.is('accepted_at', null);
    }

    return query
      .gt('expires_at', new Date().toISOString())
      .single();
  },

  /**
   * Get pending invitation by email (for auto-joining during signup)
   */
  async getPendingInvitationByEmail(email) {
    const client = await RevGuideAuth.waitForClient();

    return client
      .from('invitations')
      .select('*, organizations(name)')
      .eq('email', email.toLowerCase())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
  },

  /**
   * Accept an invitation - links user to organization
   */
  async acceptInvitation(invitationId, fullName = null) {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return { error: new Error('Must be logged in to accept invitation') };
    }

    // Get the invitation details
    const { data: invitation, error: fetchError } = await client
      .from('invitations')
      .select('*')
      .eq('id', invitationId)
      .is('accepted_at', null)
      .single();

    if (fetchError || !invitation) {
      return { error: new Error('Invitation not found or already accepted') };
    }

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      return { error: new Error('Invitation has expired') };
    }

    // Check if user already exists in the users table
    const { data: existingProfile } = await client
      .from('users')
      .select('*')
      .eq('auth_user_id', user.id)
      .single();

    // Determine the name to use: provided fullName > metadata > email prefix
    const userName = fullName || user.user_metadata?.full_name || user.email.split('@')[0];

    // Check if this is a consultant invitation
    const isConsultantInvitation = invitation.invitation_type === 'consultant' || invitation.role === 'consultant';

    if (isConsultantInvitation) {
      // CONSULTANT INVITATION FLOW
      // Add user to organization_members with consultant role (don't change their primary org)

      let userProfile = existingProfile;

      // If user doesn't have a profile yet, create one (but don't set organization_id)
      if (!existingProfile) {
        const { data, error } = await client
          .from('users')
          .insert({
            auth_user_id: user.id,
            email: user.email,
            name: userName
            // Note: NOT setting organization_id - consultant may not have their own org yet
          })
          .select()
          .single();

        if (error) return { error };
        userProfile = data;
      }

      // Add to organization_members as consultant
      const { error: memberError } = await client
        .from('organization_members')
        .upsert({
          user_id: userProfile.id,
          organization_id: invitation.organization_id,
          role: 'consultant'
        }, {
          onConflict: 'user_id,organization_id'
        });

      if (memberError) {
        console.error('Failed to add consultant to organization_members:', memberError);
        return { error: memberError };
      }

      // Mark invitation as accepted
      await client
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitationId);

      return { data: userProfile, error: null };
    }

    // REGULAR TEAM INVITATION FLOW
    if (existingProfile?.organization_id) {
      // User already belongs to an organization
      return { error: new Error('You already belong to an organization') };
    }

    // Start transaction-like operations
    // 1. Create or update user profile with organization
    let userProfile;
    if (existingProfile) {
      // Update existing profile
      const { data, error } = await client
        .from('users')
        .update({
          organization_id: invitation.organization_id,
          role: invitation.role,
          name: userName,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingProfile.id)
        .select()
        .single();

      if (error) return { error };
      userProfile = data;
    } else {
      // Create new profile
      const { data, error } = await client
        .from('users')
        .insert({
          auth_user_id: user.id,
          email: user.email,
          name: userName,
          organization_id: invitation.organization_id,
          role: invitation.role
        })
        .select()
        .single();

      if (error) return { error };
      userProfile = data;
    }

    // 2. Mark invitation as accepted
    const { error: updateError } = await client
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitationId);

    if (updateError) {
      console.error('Failed to mark invitation as accepted:', updateError);
      // Don't fail the whole operation, user is already linked
    }

    // 3. Cache the organization ID
    this.setCachedOrgId(invitation.organization_id);

    return { data: userProfile, error: null };
  },

  /**
   * Delete an invitation
   */
  async deleteInvitation(invitationId) {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();

    return client
      .from('invitations')
      .delete()
      .eq('id', invitationId)
      .eq('organization_id', orgId);
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

    // Call the PostgreSQL function that handles everything atomically
    const { data, error } = await client.rpc('create_user_with_organization', {
      p_name: name,
      p_company_name: companyName
    });

    if (error) {
      console.error('Failed to create user with organization:', error);
      return { data: null, error };
    }

    // Check for application-level errors from the function
    if (data?.error) {
      return { data: null, error: new Error(data.error) };
    }

    // Cache the org ID for fast access
    if (data?.organization_id) {
      this.setCachedOrgId(data.organization_id);
    }

    return { data, error: null };
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
  },

  // ============================================
  // Multi-Portal Support (Consultant Feature)
  // ============================================

  /**
   * Get all organizations the current user has access to
   * @returns {Promise<{data: Array<{organization_id, organization_name, portal_id, role}>, error}>}
   */
  async getUserOrganizations() {
    const client = await RevGuideAuth.waitForClient();

    const { data, error } = await client.rpc('get_user_organizations');

    if (error) {
      console.error('Failed to get user organizations:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  },

  /**
   * Switch to a different organization/portal
   * @param {string} organizationId - The organization ID to switch to
   * @returns {Promise<{success: boolean, error}>}
   */
  async switchOrganization(organizationId) {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) return { success: false, error: new Error('Not authenticated') };

    // Verify user has access to this organization (function uses auth.uid() internally)
    const { data: hasAccess, error: accessError } = await client.rpc('user_has_org_access', {
      p_org_id: organizationId
    });

    if (accessError) {
      console.error('Error checking org access:', accessError);
      return { success: false, error: accessError };
    }

    if (!hasAccess) {
      return { success: false, error: new Error('No access to this organization') };
    }

    // Update the active organization
    const { error } = await client
      .from('users')
      .update({ active_organization_id: organizationId })
      .eq('auth_user_id', user.id);

    if (error) {
      console.error('Failed to switch organization:', error);
      return { success: false, error };
    }

    // Update cache
    this.setCachedOrgId(organizationId);

    // Dispatch event for other components to react
    window.dispatchEvent(new CustomEvent('organization-changed', {
      detail: { organizationId }
    }));

    return { success: true, error: null };
  },

  /**
   * Check if current user is a consultant (can manage multiple portals)
   * @returns {Promise<boolean>}
   */
  async isConsultant() {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return false;

    const { data } = await client.rpc('user_is_consultant', { p_auth_uid: user.id });
    return data === true;
  },

  /**
   * Get the current user's role in the active organization
   * @returns {Promise<string|null>}
   */
  async getCurrentRole() {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;

    const orgId = await this.getOrganizationId();
    if (!orgId) return null;

    const { data } = await client
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', (await this.getUserProfile()).data?.id)
      .single();

    return data?.role || null;
  },

  /**
   * Add user to an organization (for consultants adding themselves to client portals)
   * @param {string} organizationId - The organization to join
   * @param {string} role - The role to have in that org (default: consultant)
   */
  async joinOrganization(organizationId, role = 'consultant') {
    const client = await RevGuideAuth.waitForClient();
    const { data: profile } = await this.getUserProfile();

    if (!profile) return { error: new Error('Not authenticated') };

    return client
      .from('organization_members')
      .insert({
        user_id: profile.id,
        organization_id: organizationId,
        role
      })
      .select()
      .single();
  },

  /**
   * Leave an organization (remove membership)
   * @param {string} organizationId - The organization to leave
   */
  async leaveOrganization(organizationId) {
    const client = await RevGuideAuth.waitForClient();
    const { data: profile } = await this.getUserProfile();

    if (!profile) return { error: new Error('Not authenticated') };

    // Can't leave your primary organization
    if (profile.organization_id === organizationId) {
      return { error: new Error('Cannot leave your primary organization') };
    }

    return client
      .from('organization_members')
      .delete()
      .eq('user_id', profile.id)
      .eq('organization_id', organizationId);
  },

  // ============================================
  // Consultant Libraries
  // ============================================

  /**
   * Get all libraries owned by the current user
   */
  async getMyLibraries() {
    const client = await RevGuideAuth.waitForClient();
    const { data: profile } = await this.getUserProfile();

    if (!profile) return { data: [], error: new Error('Not authenticated') };

    return client
      .from('consultant_libraries')
      .select('*')
      .eq('owner_id', profile.id)
      .order('updated_at', { ascending: false });
  },

  /**
   * Create a new library
   * @param {Object} library - { name, description, content }
   */
  async createLibrary(library) {
    const client = await RevGuideAuth.waitForClient();
    const { data: profile } = await this.getUserProfile();

    if (!profile) return { error: new Error('Not authenticated') };

    return client
      .from('consultant_libraries')
      .insert({
        owner_id: profile.id,
        name: library.name,
        description: library.description || '',
        content: library.content || { wikiEntries: [], plays: [], banners: [] },
        version: '1.0.0'
      })
      .select()
      .single();
  },

  /**
   * Update a library
   * @param {string} libraryId
   * @param {Object} updates - { name?, description?, content? }
   * @param {boolean} bumpVersion - If true, increment minor version
   */
  async updateLibrary(libraryId, updates, bumpVersion = true) {
    const client = await RevGuideAuth.waitForClient();

    // Get current library to bump version
    if (bumpVersion) {
      const { data: current } = await client
        .from('consultant_libraries')
        .select('version')
        .eq('id', libraryId)
        .single();

      if (current) {
        const [major, minor, patch] = current.version.split('.').map(Number);
        updates.version = `${major}.${minor + 1}.0`;
      }
    }

    updates.updated_at = new Date().toISOString();

    return client
      .from('consultant_libraries')
      .update(updates)
      .eq('id', libraryId)
      .select()
      .single();
  },

  /**
   * Delete a library
   * @param {string} libraryId
   */
  async deleteLibrary(libraryId) {
    const client = await RevGuideAuth.waitForClient();

    return client
      .from('consultant_libraries')
      .delete()
      .eq('id', libraryId);
  },

  /**
   * Get libraries installed in an organization
   * @param {string} organizationId - If not provided, uses active org
   */
  async getInstalledLibraries(organizationId = null) {
    const client = await RevGuideAuth.waitForClient();
    const orgId = organizationId || await this.getOrganizationId();

    if (!orgId) return { data: [], error: new Error('No organization') };

    return client
      .from('library_installations')
      .select('*, consultant_libraries(name, version, description)')
      .eq('organization_id', orgId)
      .order('installed_at', { ascending: false });
  },

  /**
   * Install a library to an organization
   * @param {string} libraryId
   * @param {string} organizationId - If not provided, uses active org
   */
  async installLibrary(libraryId, organizationId = null) {
    const client = await RevGuideAuth.waitForClient();
    const { data: profile } = await this.getUserProfile();
    const orgId = organizationId || await this.getOrganizationId();

    if (!profile) return { error: new Error('Not authenticated') };
    if (!orgId) return { error: new Error('No organization') };

    // Get the library content
    const { data: library, error: libError } = await client
      .from('consultant_libraries')
      .select('*')
      .eq('id', libraryId)
      .single();

    if (libError || !library) {
      return { error: new Error('Library not found') };
    }

    // Install content to the organization
    const content = library.content;
    const results = { wikiEntries: 0, plays: 0, banners: 0 };

    // Install wiki entries
    if (content.wikiEntries?.length > 0) {
      for (const entry of content.wikiEntries) {
        const { id, ...entryData } = entry;
        const { error } = await client
          .from('wiki_entries')
          .insert({ ...entryData, organization_id: orgId });
        if (!error) results.wikiEntries++;
      }
    }

    // Install plays
    if (content.plays?.length > 0) {
      for (const play of content.plays) {
        const { id, ...playData } = play;
        const { error } = await client
          .from('plays')
          .insert({ ...playData, organization_id: orgId });
        if (!error) results.plays++;
      }
    }

    // Install banners
    if (content.banners?.length > 0) {
      for (const banner of content.banners) {
        const { id, ...bannerData } = banner;
        const { error } = await client
          .from('banners')
          .insert({ ...bannerData, organization_id: orgId });
        if (!error) results.banners++;
      }
    }

    // Record the installation
    const { data: installation, error: installError } = await client
      .from('library_installations')
      .upsert({
        library_id: libraryId,
        organization_id: orgId,
        installed_version: library.version,
        installed_by: profile.id,
        items_installed: results
      }, {
        onConflict: 'library_id,organization_id'
      })
      .select()
      .single();

    return {
      data: {
        installation,
        itemsInstalled: results
      },
      error: installError
    };
  },

  /**
   * Check for available updates to installed libraries
   * @param {string} organizationId - If not provided, uses active org
   */
  async checkLibraryUpdates(organizationId = null) {
    const client = await RevGuideAuth.waitForClient();
    const orgId = organizationId || await this.getOrganizationId();

    if (!orgId) return { data: [], error: new Error('No organization') };

    const { data: installations } = await client
      .from('library_installations')
      .select('*, consultant_libraries(id, name, version, updated_at)')
      .eq('organization_id', orgId);

    if (!installations) return { data: [], error: null };

    // Find libraries with newer versions
    const updates = installations
      .filter(inst => inst.consultant_libraries &&
        inst.consultant_libraries.version !== inst.installed_version)
      .map(inst => ({
        libraryId: inst.library_id,
        libraryName: inst.consultant_libraries.name,
        installedVersion: inst.installed_version,
        availableVersion: inst.consultant_libraries.version,
        installedAt: inst.installed_at
      }));

    return { data: updates, error: null };
  },

  // ============================================
  // Consultant Invitations & Access Requests
  // ============================================

  /**
   * Check if a user exists by email and if they're a consultant
   * @param {string} email - Email to check
   * @returns {Promise<{data: {user_id, is_consultant, has_account}, error}>}
   */
  async checkUserByEmail(email) {
    const client = await RevGuideAuth.waitForClient();
    const { data, error } = await client.rpc('get_user_by_email', { p_email: email });
    return { data: data?.[0] || null, error };
  },

  /**
   * Create a consultant invitation (checks for auto-connect first)
   * @param {string} email - Consultant's email
   * @param {string} organizationId - Optional, uses active org if not provided
   * @returns {Promise<{data: {autoConnected: boolean, invitation?}, error}>}
   */
  async createConsultantInvitation(email, organizationId = null) {
    const client = await RevGuideAuth.waitForClient();
    const orgId = organizationId || await this.getOrganizationId();
    if (!orgId) return { error: new Error('No organization') };

    const { data: profile } = await this.getUserProfile();

    // Normalize email to lowercase for consistent matching
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists and is a consultant
    const { data: existingUser } = await this.checkUserByEmail(normalizedEmail);

    if (existingUser && existingUser.is_consultant) {
      // Auto-connect existing consultant
      const { data: success } = await client.rpc('auto_connect_consultant', {
        p_user_id: existingUser.user_id,
        p_organization_id: orgId
      });

      if (success) {
        // Also create an invitation record marked as auto-accepted for audit trail
        await client
          .from('invitations')
          .insert({
            organization_id: orgId,
            email: normalizedEmail,
            role: 'consultant',
            invitation_type: 'consultant',
            invited_by: profile?.id,
            auto_accepted: true,
            accepted_at: new Date().toISOString()
          });

        return {
          data: { autoConnected: true, consultantName: existingUser.user_name },
          error: null
        };
      }
    }

    // Create a new consultant invitation
    const { data: invitation, error } = await client
      .from('invitations')
      .insert({
        organization_id: orgId,
        email: normalizedEmail,
        role: 'consultant',
        invitation_type: 'consultant',
        invited_by: profile?.id
      })
      .select()
      .single();

    return {
      data: { autoConnected: false, invitation },
      error
    };
  },

  /**
   * Get consultant invitations for current organization
   */
  async getConsultantInvitations() {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { data: [], error: new Error('No organization') };

    return client
      .from('invitations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('invitation_type', 'consultant')
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
  },

  /**
   * Create an access request (consultant requesting access to an org)
   * @param {string} organizationId - The org to request access to
   * @param {string} message - Optional message explaining the request
   */
  async createAccessRequest(organizationId, message = '') {
    const client = await RevGuideAuth.waitForClient();
    const { data: profile } = await this.getUserProfile();

    if (!profile) return { error: new Error('Not authenticated') };

    return client
      .from('consultant_access_requests')
      .insert({
        consultant_user_id: profile.id,
        organization_id: organizationId,
        message: message || null
      })
      .select()
      .single();
  },

  /**
   * Get access requests for the current organization (for admins)
   */
  async getAccessRequests() {
    const client = await RevGuideAuth.waitForClient();
    const orgId = await this.getOrganizationId();
    if (!orgId) return { data: [], error: new Error('No organization') };

    const { data, error } = await client.rpc('get_org_access_requests', { p_org_id: orgId });
    return { data: data || [], error };
  },

  /**
   * Approve an access request (adds consultant to org)
   * @param {string} requestId - The request ID to approve
   */
  async approveAccessRequest(requestId) {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) return { success: false, error: new Error('Not authenticated') };

    const { data, error } = await client.rpc('approve_access_request', {
      p_request_id: requestId,
      p_reviewer_auth_uid: user.id
    });

    return { success: data === true, error };
  },

  /**
   * Decline an access request
   * @param {string} requestId - The request ID to decline
   * @param {string} notes - Optional notes explaining why
   */
  async declineAccessRequest(requestId, notes = '') {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) return { success: false, error: new Error('Not authenticated') };

    const { data, error } = await client.rpc('decline_access_request', {
      p_request_id: requestId,
      p_reviewer_auth_uid: user.id,
      p_notes: notes || null
    });

    return { success: data === true, error };
  },

  /**
   * Search organizations for consultant to request access
   * @param {string} query - Search term
   */
  async searchOrganizations(query) {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) return { data: [], error: new Error('Not authenticated') };

    const { data, error } = await client.rpc('search_organizations_for_consultant', {
      p_auth_uid: user.id,
      p_query: query
    });

    return { data: data || [], error };
  },

  /**
   * Get consultant's own access requests (for their dashboard)
   */
  async getMyAccessRequests() {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) return { data: [], error: new Error('Not authenticated') };

    const { data, error } = await client.rpc('get_consultant_access_requests', {
      p_auth_uid: user.id
    });

    return { data: data || [], error };
  },

  /**
   * Cancel a pending access request
   * @param {string} requestId - The request to cancel
   */
  async cancelAccessRequest(requestId) {
    const client = await RevGuideAuth.waitForClient();

    return client
      .from('consultant_access_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .select()
      .single();
  },

  /**
   * Get admin emails for an organization (for sending notifications)
   * @param {string} organizationId - The org to get admins for
   */
  async getOrgAdminEmails(organizationId) {
    const client = await RevGuideAuth.waitForClient();

    const { data, error } = await client.rpc('get_org_admin_emails', {
      p_org_id: organizationId
    });

    return { data: data || [], error };
  },

  // ============================================
  // Partner Account Methods
  // ============================================

  /**
   * Check if current user is a partner (has partner account_type)
   */
  async isPartner() {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return false;

    const { data } = await client.rpc('user_is_partner', { p_auth_uid: user.id });
    return data === true;
  },

  /**
   * Get partner's home organization details
   */
  async getPartnerHomeOrg() {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { data: null, error: new Error('Not authenticated') };

    const { data, error } = await client.rpc('get_partner_home_org', { p_auth_uid: user.id });
    // Returns array with one item or empty
    return { data: data && data.length > 0 ? data[0] : null, error };
  },

  /**
   * Get partner's client organizations (where they have 'partner' role)
   */
  async getPartnerClients() {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { data: [], error: new Error('Not authenticated') };

    const { data, error } = await client.rpc('get_partner_clients', { p_auth_uid: user.id });
    return { data: data || [], error };
  },

  /**
   * Get partner dashboard stats
   */
  async getPartnerStats() {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { data: null, error: new Error('Not authenticated') };

    const { data, error } = await client.rpc('get_partner_stats', { p_auth_uid: user.id });
    return { data: data && data.length > 0 ? data[0] : null, error };
  },

  /**
   * Convert current standard account to partner account
   * @param {string} agencyName - Name for the partner's agency organization
   */
  async convertToPartner(agencyName) {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { success: false, error: new Error('Not authenticated') };

    const { data, error } = await client.rpc('convert_to_partner_account', {
      p_auth_uid: user.id,
      p_agency_name: agencyName
    });

    if (error) return { success: false, error };

    // Result is an array with one row
    const result = data && data.length > 0 ? data[0] : null;
    if (result && result.success) {
      return { success: true, homeOrgId: result.home_org_id, error: null };
    } else {
      return { success: false, error: new Error(result?.error_message || 'Conversion failed') };
    }
  },

  /**
   * Create a partner invitation (for admins inviting partners)
   * Checks if user already exists and is a partner - if so, auto-connects
   * @param {string} email - Email of partner to invite
   * @param {string} organizationId - Optional org ID (defaults to current)
   */
  async createPartnerInvitation(email, organizationId = null) {
    const client = await RevGuideAuth.waitForClient();
    const orgId = organizationId || await this.getOrganizationId();
    if (!orgId) return { error: new Error('No organization') };

    const { data: profile } = await this.getUserProfile();
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists and is a partner
    const { data: existingUser } = await client.rpc('get_user_by_email', {
      p_email: normalizedEmail
    });

    const userRecord = existingUser && existingUser.length > 0 ? existingUser[0] : null;

    if (userRecord && userRecord.is_partner) {
      // Auto-connect existing partner
      const { data: connected, error: connectError } = await client.rpc('auto_connect_partner', {
        p_user_id: userRecord.user_id,
        p_organization_id: orgId
      });

      if (connectError) return { error: connectError };

      if (connected) {
        return {
          data: {
            autoConnected: true,
            partnerName: userRecord.user_name,
            partnerEmail: normalizedEmail
          },
          error: null
        };
      }
    }

    // Create new partner invitation
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const { data: invitation, error } = await client
      .from('invitations')
      .insert({
        organization_id: orgId,
        email: normalizedEmail,
        role: 'partner',
        invitation_type: 'partner',
        invited_by: profile?.id,
        token: token,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (error) return { data: null, error };

    return {
      data: {
        autoConnected: false,
        invitation: invitation
      },
      error: null
    };
  },

  /**
   * Get all organizations the current user has access to (including home org indicator)
   */
  async getAllUserOrganizations() {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { data: [], error: new Error('Not authenticated') };

    const { data, error } = await client.rpc('get_user_organizations', { p_auth_uid: user.id });
    return { data: data || [], error };
  }
};

// Export for use in other scripts
window.RevGuideAuth = RevGuideAuth;
window.RevGuideDB = RevGuideDB;
