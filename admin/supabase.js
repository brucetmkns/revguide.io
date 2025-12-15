/**
 * RevGuide - Supabase Client
 * Handles authentication and database operations
 */

// Supabase configuration
const SUPABASE_URL = 'https://qbdhvhrowmfnacyikkbf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RC5R8c5f-uoyMkoABXCRPg_n3HjyXXS';

// Import Supabase client from CDN
const supabaseScript = document.createElement('script');
supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
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
  /**
   * Get user profile with organization
   */
  async getUserProfile() {
    const client = await RevGuideAuth.waitForClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) return { data: null, error: new Error('Not authenticated') };

    return client
      .from('users')
      .select('*, organizations(*)')
      .eq('auth_user_id', user.id)
      .single();
  },

  /**
   * Get organization ID for current user
   */
  async getOrganizationId() {
    const { data: profile } = await this.getUserProfile();
    return profile?.organization_id;
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
