# RevGuide Environment Configuration

This folder contains environment configuration for switching between production and staging.

## Environments

| Environment | Web App | Supabase | Worker |
|-------------|---------|----------|--------|
| Production | app.revguide.io | qbdhvhrowmfnacyikkbf | revguide-api |
| Staging | staging.revguide.io | [staging-project] | revguide-api-staging |

## Auto-Detection

The environment is automatically detected based on:

1. **Web App**: Hostname (`staging.revguide.io` = staging, else production)
2. **Localhost**: Defaults to staging for local development
3. **Extension Override**: Check `__revguide_env_override` in chrome.storage

## Usage

### In JavaScript files

```javascript
// Access current environment
const supabaseUrl = RevGuideConfig.ENV.supabase.url;
const appUrl = RevGuideConfig.ENV.app.url;

// Check environment
if (RevGuideConfig.isStaging) {
  console.log('Running in staging mode');
}
```

### Loading order

1. Load `config/environments.js` first (defines all environments)
2. Load `config/current.js` second (auto-detects and sets RevGuideConfig)

## Switching Environments (Extension)

### Hidden Dev Toggle

Press `Ctrl+Shift+Alt+D` five times within 3 seconds to toggle between staging and production. This is intentionally hidden from end users.

### Programmatic Switch

```javascript
// Switch to staging
await RevGuideConfig.setOverride('staging');

// Switch back to auto-detect (production)
await RevGuideConfig.setOverride(null);

// Toggle between staging/production
await RevGuideConfig.toggleEnvironment();
```

After switching, reload the extension for changes to take effect.

## Build Commands

```bash
npm run build          # Production build
npm run build:staging  # Staging build (for testing)
npm run build:dev      # Development build (unminified)
```

## Setup Staging

Before staging works, you must:

1. Create a Supabase staging project
2. Update `config/environments.js` with staging Supabase URL and anon key
3. Run migrations on staging Supabase
4. Deploy edge functions to staging
5. Add staging.revguide.io domain in Vercel
6. Deploy staging Cloudflare worker
