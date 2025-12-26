/**
 * RevGuide Environment Configuration
 *
 * Defines all environment-specific URLs and settings.
 * IMPORTANT: Update staging values after creating the Supabase staging project.
 */

/**
 * Default branding constants (used when no partner branding is configured)
 */
const REVGUIDE_DEFAULT_BRANDING = {
  displayName: 'RevGuide',
  tagline: 'HubSpot Companion',
  logoUrl: null,  // Uses built-in logo
  logoIconUrl: null,  // Uses built-in icon
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
  tooltipAttribution: 'revguide'  // 'agency', 'revguide', or 'none'
};

const REVGUIDE_ENVIRONMENTS = {
  production: {
    name: 'production',
    supabase: {
      url: 'https://qbdhvhrowmfnacyikkbf.supabase.co',
      anonKey: 'sb_publishable_RC5R8c5f-uoyMkoABXCRPg_n3HjyXXS'
    },
    app: {
      url: 'https://app.revguide.io',
      domain: 'app.revguide.io'
    },
    api: {
      url: 'https://revguide-api.revguide.workers.dev'
    },
    email: {
      from: 'RevGuide <notifications@email.revguide.io>'
    },
    branding: REVGUIDE_DEFAULT_BRANDING
  },
  staging: {
    name: 'staging',
    supabase: {
      // TODO: Update these after creating Supabase staging project
      url: 'https://STAGING_PROJECT_REF.supabase.co',
      anonKey: 'STAGING_ANON_KEY'
    },
    app: {
      url: 'https://staging.revguide.io',
      domain: 'staging.revguide.io'
    },
    api: {
      url: 'https://revguide-api-staging.revguide.workers.dev'
    },
    email: {
      from: 'RevGuide Staging <staging@email.revguide.io>'
    },
    branding: REVGUIDE_DEFAULT_BRANDING
  }
};

// Export for different contexts
if (typeof window !== 'undefined') {
  window.REVGUIDE_ENVIRONMENTS = REVGUIDE_ENVIRONMENTS;
  window.REVGUIDE_DEFAULT_BRANDING = REVGUIDE_DEFAULT_BRANDING;
}
if (typeof self !== 'undefined') {
  self.REVGUIDE_ENVIRONMENTS = REVGUIDE_ENVIRONMENTS;
  self.REVGUIDE_DEFAULT_BRANDING = REVGUIDE_DEFAULT_BRANDING;
}
