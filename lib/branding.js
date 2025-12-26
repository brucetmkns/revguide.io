/**
 * RevGuide Branding Manager
 *
 * Handles resolution and application of partner white-label branding.
 * Branding cascade: Partner branding -> Client orgs inherit partner's branding
 *
 * Usage:
 *   // In admin panel
 *   const branding = await RevGuideBranding.getCurrentBranding();
 *   RevGuideBranding.applyBranding(branding);
 */

const RevGuideBranding = {
  // Cache for branding to avoid repeated fetches
  _cachedBranding: null,
  _cachedBrandingTimestamp: 0,
  _BRANDING_CACHE_TTL: 5 * 60 * 1000, // 5 minutes

  /**
   * Get default RevGuide branding (fallback when no partner branding)
   * @returns {Object} Default branding configuration
   */
  getDefaultBranding() {
    // Use environment config if available, otherwise hardcoded defaults
    if (typeof REVGUIDE_DEFAULT_BRANDING !== 'undefined') {
      return { ...REVGUIDE_DEFAULT_BRANDING, isDefault: true };
    }

    return {
      displayName: 'RevGuide',
      tagline: 'HubSpot Companion',
      logoUrl: null,
      logoIconUrl: null,
      faviconUrl: '/favicon.ico',
      primaryColor: '#b2ef63',
      primaryHoverColor: '#9ed654',
      accentColor: '#4a5568',
      fontFamily: 'Manrope',
      fontUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap',
      helpUrl: 'https://help.revguide.io',
      supportEmail: 'support@revguide.io',
      websiteUrl: 'https://revguide.io',
      privacyUrl: 'https://revguide.io/privacy',
      termsUrl: 'https://revguide.io/terms',
      tooltipAttribution: 'revguide',
      isDefault: true
    };
  },

  /**
   * Get cached branding (fast path)
   * @returns {Object|null} Cached branding or null
   */
  getCachedBranding() {
    if (this._cachedBranding && (Date.now() - this._cachedBrandingTimestamp < this._BRANDING_CACHE_TTL)) {
      return this._cachedBranding;
    }

    // Also check sessionStorage for cross-page persistence
    try {
      const cached = sessionStorage.getItem('revguide_branding');
      if (cached) {
        const { branding, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < this._BRANDING_CACHE_TTL) {
          this._cachedBranding = branding;
          this._cachedBrandingTimestamp = timestamp;
          return branding;
        }
      }
    } catch (e) {
      // Ignore storage errors
    }

    return null;
  },

  /**
   * Set cached branding
   * @param {Object} branding - Branding configuration to cache
   */
  setCachedBranding(branding) {
    this._cachedBranding = branding;
    this._cachedBrandingTimestamp = Date.now();

    try {
      sessionStorage.setItem('revguide_branding', JSON.stringify({
        branding,
        timestamp: Date.now()
      }));
    } catch (e) {
      // Ignore storage errors
    }
  },

  /**
   * Clear cached branding (call on org switch or branding update)
   */
  clearCachedBranding() {
    this._cachedBranding = null;
    this._cachedBrandingTimestamp = 0;

    try {
      sessionStorage.removeItem('revguide_branding');
    } catch (e) {
      // Ignore storage errors
    }
  },

  /**
   * Fetch branding for current user/organization from database
   * Uses the get_current_user_branding RPC function
   * @returns {Promise<Object>} Branding configuration
   */
  async fetchCurrentBranding() {
    // Require RevGuideDB (from supabase.js)
    if (typeof RevGuideDB === 'undefined') {
      console.warn('[RevGuide Branding] RevGuideDB not available, using defaults');
      return this.getDefaultBranding();
    }

    try {
      const client = await RevGuideAuth.waitForClient();
      const { data, error } = await client.rpc('get_current_user_branding');

      if (error) {
        console.error('[RevGuide Branding] Error fetching branding:', error);
        return this.getDefaultBranding();
      }

      // RPC returns array, get first row
      const dbBranding = data && data.length > 0 ? data[0] : null;

      if (!dbBranding) {
        return this.getDefaultBranding();
      }

      // Transform database fields to camelCase
      return this.transformDbBranding(dbBranding);
    } catch (e) {
      console.error('[RevGuide Branding] Exception fetching branding:', e);
      return this.getDefaultBranding();
    }
  },

  /**
   * Transform database branding (snake_case) to JS branding (camelCase)
   * @param {Object} dbBranding - Database branding record
   * @returns {Object} Transformed branding configuration
   */
  transformDbBranding(dbBranding) {
    const defaults = this.getDefaultBranding();

    return {
      brandingId: dbBranding.branding_id,
      displayName: dbBranding.display_name || defaults.displayName,
      tagline: dbBranding.tagline || defaults.tagline,
      logoUrl: dbBranding.logo_url || defaults.logoUrl,
      logoIconUrl: dbBranding.logo_icon_url || defaults.logoIconUrl,
      faviconUrl: dbBranding.favicon_url || defaults.faviconUrl,
      primaryColor: dbBranding.primary_color || defaults.primaryColor,
      primaryHoverColor: dbBranding.primary_hover_color || this.darkenColor(dbBranding.primary_color || defaults.primaryColor, 10),
      accentColor: dbBranding.accent_color || defaults.accentColor,
      fontFamily: dbBranding.font_family || defaults.fontFamily,
      fontUrl: dbBranding.font_url || defaults.fontUrl,
      helpUrl: dbBranding.help_url || defaults.helpUrl,
      supportEmail: dbBranding.support_email || defaults.supportEmail,
      websiteUrl: dbBranding.website_url || defaults.websiteUrl,
      privacyUrl: dbBranding.privacy_url || defaults.privacyUrl,
      termsUrl: dbBranding.terms_url || defaults.termsUrl,
      emailFromName: dbBranding.email_from_name,
      emailFromAddress: dbBranding.email_from_address,
      emailReplyTo: dbBranding.email_reply_to,
      emailDomainVerified: dbBranding.email_domain_verified || false,
      tooltipAttribution: dbBranding.tooltip_attribution || defaults.tooltipAttribution,
      customDomain: dbBranding.custom_domain,
      customDomainVerified: dbBranding.custom_domain_verified || false,
      isPartnerBranding: dbBranding.is_partner_branding || false,
      isDefault: false
    };
  },

  /**
   * Get current branding (uses cache, fetches if needed)
   * @param {boolean} forceRefresh - Force fetch from database
   * @returns {Promise<Object>} Branding configuration
   */
  async getCurrentBranding(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = this.getCachedBranding();
      if (cached) return cached;
    }

    const branding = await this.fetchCurrentBranding();
    this.setCachedBranding(branding);
    return branding;
  },

  /**
   * Apply branding to the current page
   * Updates CSS variables, logos, text, and favicon
   * @param {Object} branding - Branding configuration to apply
   */
  applyBranding(branding) {
    if (!branding) return;

    const root = document.documentElement;

    // Apply colors
    if (branding.primaryColor) {
      root.style.setProperty('--color-primary', branding.primaryColor);
      root.style.setProperty('--color-primary-rgb', this.hexToRgb(branding.primaryColor));
      root.style.setProperty('--color-primary-hover', branding.primaryHoverColor || this.darkenColor(branding.primaryColor, 10));
    }

    if (branding.accentColor) {
      root.style.setProperty('--color-accent', branding.accentColor);
    }

    // Apply font
    if (branding.fontUrl && branding.fontFamily !== 'Manrope') {
      this.loadGoogleFont(branding.fontUrl, branding.fontFamily);
    }

    if (branding.fontFamily) {
      root.style.setProperty('--font-family-sans', `'${branding.fontFamily}', sans-serif`);
    }

    // Apply display name to elements with data-brand-name attribute
    if (branding.displayName) {
      document.querySelectorAll('[data-brand-name]').forEach(el => {
        el.textContent = branding.displayName;
      });
    }

    // Apply logo
    if (branding.logoUrl) {
      document.querySelectorAll('[data-brand-logo]').forEach(el => {
        if (el.tagName === 'IMG') {
          el.src = branding.logoUrl;
          el.alt = branding.displayName || 'Logo';
        } else {
          el.style.backgroundImage = `url(${branding.logoUrl})`;
        }
      });
    }

    // Apply icon
    if (branding.logoIconUrl) {
      document.querySelectorAll('[data-brand-icon]').forEach(el => {
        if (el.tagName === 'IMG') {
          el.src = branding.logoIconUrl;
          el.alt = branding.displayName || 'Icon';
        } else {
          el.style.backgroundImage = `url(${branding.logoIconUrl})`;
        }
      });
    }

    // Apply favicon
    if (branding.faviconUrl) {
      let faviconLink = document.querySelector('link[rel="icon"]');
      if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
      }
      faviconLink.href = branding.faviconUrl;
    }

    // Store branding on window for other scripts to access
    window.currentBranding = branding;

    // Dispatch event for other components to react
    window.dispatchEvent(new CustomEvent('branding-applied', {
      detail: { branding }
    }));
  },

  /**
   * Load a Google Font dynamically
   * @param {string} url - Google Fonts URL
   * @param {string} fontFamily - Font family name
   */
  loadGoogleFont(url, fontFamily) {
    // Check if already loaded
    const existingLink = document.querySelector(`link[href*="${encodeURIComponent(fontFamily)}"]`);
    if (existingLink) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  },

  /**
   * Convert hex color to RGB values
   * @param {string} hex - Hex color (e.g., '#b2ef63')
   * @returns {string} RGB values as comma-separated string (e.g., '178, 239, 99')
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '178, 239, 99'; // Default to primary color RGB

    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  },

  /**
   * Darken a hex color by a percentage
   * @param {string} hex - Hex color
   * @param {number} percent - Percentage to darken (0-100)
   * @returns {string} Darkened hex color
   */
  darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  },

  /**
   * Lighten a hex color by a percentage
   * @param {string} hex - Hex color
   * @param {number} percent - Percentage to lighten (0-100)
   * @returns {string} Lightened hex color
   */
  lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  },

  /**
   * Check if a color has good contrast with white text
   * @param {string} hex - Hex color
   * @returns {boolean} True if color has good contrast with white
   */
  hasGoodContrastWithWhite(hex) {
    const rgb = this.hexToRgb(hex).split(',').map(n => parseInt(n.trim()));
    // Calculate relative luminance
    const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    // Dark colors (low luminance) have good contrast with white
    return luminance < 0.5;
  },

  /**
   * Get tooltip attribution text based on branding configuration
   * @param {Object} branding - Branding configuration
   * @returns {string|null} Attribution text or null if hidden
   */
  getTooltipAttribution(branding) {
    if (!branding || branding.tooltipAttribution === 'none') {
      return null;
    }

    if (branding.tooltipAttribution === 'agency' && branding.displayName) {
      return `Powered by ${branding.displayName}`;
    }

    return 'Powered by RevGuide';
  },

  /**
   * Check if current user can manage branding (is partner with owner/admin role)
   * @returns {Promise<boolean>}
   */
  async canManageBranding() {
    if (typeof RevGuideDB === 'undefined') return false;

    try {
      const isPartner = await RevGuideDB.isPartner();
      if (!isPartner) return false;

      // Check if user is owner or admin of their home org
      const { data: homeOrg } = await RevGuideDB.getPartnerHomeOrg();
      if (!homeOrg) return false;

      const { data: profile } = await RevGuideDB.getUserProfile();
      if (!profile) return false;

      // Check role in home org via organization_members
      const client = await RevGuideAuth.waitForClient();
      const { data: membership } = await client
        .from('organization_members')
        .select('role')
        .eq('user_id', profile.id)
        .eq('organization_id', homeOrg.organization_id)
        .single();

      return membership && ['owner', 'admin'].includes(membership.role);
    } catch (e) {
      console.error('[RevGuide Branding] Error checking branding permissions:', e);
      return false;
    }
  },

  /**
   * Save partner branding
   * @param {Object} brandingData - Branding configuration to save
   * @returns {Promise<{success: boolean, brandingId: string|null, error: Error|null}>}
   */
  async saveBranding(brandingData) {
    if (typeof RevGuideAuth === 'undefined') {
      return { success: false, brandingId: null, error: new Error('RevGuideAuth not available') };
    }

    try {
      const client = await RevGuideAuth.waitForClient();
      const { data, error } = await client.rpc('upsert_partner_branding', {
        p_display_name: brandingData.displayName,
        p_tagline: brandingData.tagline || null,
        p_logo_url: brandingData.logoUrl || null,
        p_logo_icon_url: brandingData.logoIconUrl || null,
        p_favicon_url: brandingData.faviconUrl || null,
        p_primary_color: brandingData.primaryColor || '#b2ef63',
        p_primary_hover_color: brandingData.primaryHoverColor || null,
        p_accent_color: brandingData.accentColor || null,
        p_font_family: brandingData.fontFamily || null,
        p_font_url: brandingData.fontUrl || null,
        p_help_url: brandingData.helpUrl || null,
        p_support_email: brandingData.supportEmail || null,
        p_website_url: brandingData.websiteUrl || null,
        p_privacy_url: brandingData.privacyUrl || null,
        p_terms_url: brandingData.termsUrl || null,
        p_email_from_name: brandingData.emailFromName || null,
        p_email_from_address: brandingData.emailFromAddress || null,
        p_email_reply_to: brandingData.emailReplyTo || null,
        p_tooltip_attribution: brandingData.tooltipAttribution || 'revguide'
      });

      if (error) {
        console.error('[RevGuide Branding] Error saving branding:', error);
        return { success: false, brandingId: null, error };
      }

      const result = data && data.length > 0 ? data[0] : null;
      if (result && result.success) {
        // Clear cache so new branding takes effect
        this.clearCachedBranding();
        return { success: true, brandingId: result.branding_id, error: null };
      } else {
        return { success: false, brandingId: null, error: new Error(result?.error_message || 'Failed to save branding') };
      }
    } catch (e) {
      console.error('[RevGuide Branding] Exception saving branding:', e);
      return { success: false, brandingId: null, error: e };
    }
  },

  /**
   * Upload a branding asset (logo, icon, favicon) to Supabase Storage
   * @param {File} file - File to upload
   * @param {string} type - Asset type ('logo', 'icon', 'favicon')
   * @returns {Promise<{success: boolean, url: string|null, error: Error|null}>}
   */
  async uploadAsset(file, type) {
    if (typeof RevGuideAuth === 'undefined' || typeof RevGuideDB === 'undefined') {
      return { success: false, url: null, error: new Error('RevGuideAuth/RevGuideDB not available') };
    }

    try {
      // Get partner's home org ID for storage path
      const { data: homeOrg } = await RevGuideDB.getPartnerHomeOrg();
      if (!homeOrg) {
        return { success: false, url: null, error: new Error('No partner home organization') };
      }

      const orgId = homeOrg.organization_id;
      const fileExt = file.name.split('.').pop().toLowerCase();
      const fileName = `${type}.${fileExt}`;
      const filePath = `${orgId}/${fileName}`;

      const client = await RevGuideAuth.waitForClient();

      // Upload file
      const { data, error } = await client.storage
        .from('partner-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        console.error('[RevGuide Branding] Error uploading asset:', error);
        return { success: false, url: null, error };
      }

      // Get public URL
      const { data: urlData } = client.storage
        .from('partner-assets')
        .getPublicUrl(filePath);

      return { success: true, url: urlData.publicUrl, error: null };
    } catch (e) {
      console.error('[RevGuide Branding] Exception uploading asset:', e);
      return { success: false, url: null, error: e };
    }
  },

  /**
   * Validate a branding configuration
   * @param {Object} branding - Branding to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateBranding(branding) {
    const errors = [];

    // Required fields
    if (!branding.displayName || branding.displayName.trim().length === 0) {
      errors.push('Display name is required');
    }

    if (branding.displayName && branding.displayName.length > 50) {
      errors.push('Display name must be 50 characters or less');
    }

    // Validate color format
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (branding.primaryColor && !hexColorRegex.test(branding.primaryColor)) {
      errors.push('Primary color must be a valid hex color (e.g., #b2ef63)');
    }

    // Validate URLs
    const urlFields = ['logoUrl', 'logoIconUrl', 'faviconUrl', 'helpUrl', 'websiteUrl', 'privacyUrl', 'termsUrl'];
    urlFields.forEach(field => {
      if (branding[field]) {
        try {
          new URL(branding[field]);
        } catch (e) {
          errors.push(`${field} must be a valid URL`);
        }
      }
    });

    // Validate email
    if (branding.supportEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(branding.supportEmail)) {
        errors.push('Support email must be a valid email address');
      }
    }

    // Validate tooltip attribution
    if (branding.tooltipAttribution && !['agency', 'revguide', 'none'].includes(branding.tooltipAttribution)) {
      errors.push('Tooltip attribution must be "agency", "revguide", or "none"');
    }

    // Warn about color contrast
    if (branding.primaryColor && !this.hasGoodContrastWithWhite(branding.primaryColor)) {
      // This is a warning, not an error
      console.warn('[RevGuide Branding] Primary color may have poor contrast with white text');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};

// Export for different contexts
if (typeof window !== 'undefined') {
  window.RevGuideBranding = RevGuideBranding;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RevGuideBranding;
}
