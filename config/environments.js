/**
 * RevGuide Environment Configuration
 *
 * Defines all environment-specific URLs and settings.
 * IMPORTANT: Update staging values after creating the Supabase staging project.
 */

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
    }
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
    }
  }
};

// Export for different contexts
if (typeof window !== 'undefined') {
  window.REVGUIDE_ENVIRONMENTS = REVGUIDE_ENVIRONMENTS;
}
if (typeof self !== 'undefined') {
  self.REVGUIDE_ENVIRONMENTS = REVGUIDE_ENVIRONMENTS;
}
