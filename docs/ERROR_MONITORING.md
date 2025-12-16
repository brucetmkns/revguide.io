# Error Monitoring Setup (Sentry)

This guide covers setting up Sentry for error monitoring in RevGuide.

## Overview

RevGuide uses Sentry to track errors across:
- **Web App** (app.revguide.io) - JavaScript errors in the admin panel
- **Chrome Extension** - Content script and background script errors
- **Edge Functions** - Supabase function errors

## Step 1: Create Sentry Project

1. Go to [sentry.io](https://sentry.io) and create an account
2. Create a new project:
   - Platform: **Browser JavaScript**
   - Project name: `revguide-web`
3. Copy your DSN (looks like `https://xxx@xxx.ingest.sentry.io/xxx`)

## Step 2: Web App Integration

### 2.1 Add Sentry Script

Add to the `<head>` of each HTML page in `/admin/pages/`:

```html
<script
  src="https://js.sentry-cdn.com/YOUR_PUBLIC_KEY.min.js"
  crossorigin="anonymous"
></script>
<script>
  Sentry.onLoad(function() {
    Sentry.init({
      dsn: "YOUR_DSN_HERE",
      environment: window.location.hostname === 'app.revguide.io' ? 'production' : 'development',
      release: "revguide@2.1.2",
      integrations: [
        Sentry.browserTracingIntegration(),
      ],
      tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
  });
</script>
```

### 2.2 Add User Context

In `admin/shared.js`, after authentication:

```javascript
// After successful auth
if (window.Sentry && user) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    organization: currentOrganization?.name
  });
}
```

### 2.3 Error Boundaries

Wrap critical operations:

```javascript
try {
  await riskyOperation();
} catch (error) {
  if (window.Sentry) {
    Sentry.captureException(error, {
      tags: { feature: 'hubspot-oauth' },
      extra: { userId: user?.id }
    });
  }
  throw error;
}
```

## Step 3: Chrome Extension Integration

Chrome extensions have restrictions on external scripts. Use the SDK bundle approach:

### 3.1 Download Sentry SDK

```bash
# Download the browser SDK
curl -o lib/sentry.min.js https://browser.sentry-cdn.com/7.x.x/bundle.min.js
```

### 3.2 Add to manifest.json

```json
{
  "content_scripts": [
    {
      "js": ["lib/sentry.min.js", "content/content.js"],
      ...
    }
  ],
  "background": {
    "service_worker": "background/background.js",
    "type": "module"
  }
}
```

### 3.3 Initialize in Background Script

```javascript
// background/background.js
importScripts('lib/sentry.min.js');

Sentry.init({
  dsn: "YOUR_DSN_HERE",
  environment: 'extension',
  release: chrome.runtime.getManifest().version,
});
```

## Step 4: Supabase Edge Functions

### 4.1 Install Sentry SDK

In your edge function:

```typescript
import * as Sentry from 'https://deno.land/x/sentry/mod.ts';

Sentry.init({
  dsn: Deno.env.get('SENTRY_DSN'),
  environment: 'production',
  release: '2.1.2',
});
```

### 4.2 Set Secret

```bash
supabase secrets set SENTRY_DSN=your-dsn-here
```

### 4.3 Wrap Handlers

```typescript
serve(async (req) => {
  try {
    // ... handler logic
  } catch (error) {
    Sentry.captureException(error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500
    });
  }
});
```

## Step 5: Cloudflare Worker

### 5.1 Use Toucan SDK

```javascript
import Toucan from 'toucan-js';

export default {
  async fetch(request, env, ctx) {
    const sentry = new Toucan({
      dsn: env.SENTRY_DSN,
      ctx,
      request,
      environment: 'production',
    });

    try {
      // ... handler logic
    } catch (error) {
      sentry.captureException(error);
      throw error;
    }
  }
};
```

### 5.2 Set Secret

```bash
wrangler secret put SENTRY_DSN
```

## Alert Configuration

### Recommended Alerts

1. **High Error Rate**
   - Trigger: >10 errors in 5 minutes
   - Notify: Slack/Email immediately

2. **New Issue**
   - Trigger: First occurrence of a new error type
   - Notify: Slack/Email

3. **Regression**
   - Trigger: Previously resolved issue recurs
   - Notify: Slack/Email

### Setup in Sentry

1. Go to Alerts > Create Alert Rule
2. Configure conditions and actions
3. Connect Slack/Email integration

## Source Maps (Optional)

For better stack traces in production:

### Web App

```bash
# Install Sentry CLI
npm install -g @sentry/cli

# Upload source maps after build
sentry-cli releases new revguide@2.1.2
sentry-cli releases files revguide@2.1.2 upload-sourcemaps ./admin --url-prefix '~/admin'
sentry-cli releases finalize revguide@2.1.2
```

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `SENTRY_DSN` | Web app, Extension | Public DSN for error reporting |
| `SENTRY_DSN` | Edge functions, Worker | Same DSN (can use separate project) |

## Privacy Considerations

- Sentry collects error data including stack traces and user context
- Review your privacy policy to disclose error monitoring
- Consider what user data you attach to errors
- Use `beforeSend` hook to scrub sensitive data:

```javascript
Sentry.init({
  beforeSend(event) {
    // Remove sensitive data
    if (event.user) {
      delete event.user.email;
    }
    return event;
  }
});
```

## Verification

After setup, verify by triggering a test error:

```javascript
// In browser console on app.revguide.io
Sentry.captureException(new Error('Test error from RevGuide'));
```

Check Sentry dashboard for the test error within 1-2 minutes.
