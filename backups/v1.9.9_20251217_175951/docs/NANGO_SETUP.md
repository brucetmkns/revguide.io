# Nango HubSpot OAuth Setup Guide

This document describes how to set up Nango for HubSpot OAuth integration with RevGuide.

## Overview

RevGuide uses Nango to handle HubSpot OAuth, providing:
- One-click "Connect with HubSpot" authentication
- Secure server-side token storage
- Automatic token refresh
- Organization auto-creation from HubSpot portal

## Prerequisites

- Nango Cloud account (https://nango.dev)
- Supabase project (already configured)
- HubSpot developer account

## Important: HubSpot Developer Platform 2025

> **Note**: HubSpot has migrated to a new Developer Platform in 2025. All new apps should be created using the **Projects framework (v2025.2 or later)**. Legacy apps will need to be migrated.

### Key Dates
- **Sept 22, 2025**: 25-install limit enforced for non-marketplace apps
- **June 1, 2026**: Projects v2025.1 deprecated
- **Oct 31, 2026**: Legacy CRM cards must be migrated

### Token Handling Changes
- Post-migration apps receive **one refresh token per portal** (hubId), not per user
- New installations create a **service account user** tied to your app
- RevGuide already handles this correctly by storing connections per organization (= portal)

For more details, see:
- [HubSpot Developer Platform 2025](https://developers.hubspot.com/changelog/introducing-the-hubspot-developer-platform-2025)
- [Migrate existing public app](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/migrate-an-app/migrate-an-existing-public-app)

---

## Step 1: Create HubSpot Developer Project App

### 1.1 Create a Developer Account (if needed)

1. Go to https://developers.hubspot.com/
2. Sign up or log in with your HubSpot account
3. Create a developer account if you don't have one

### 1.2 Create a New Project App (Recommended - v2025.2)

**Option A: Using HubSpot CLI (Recommended)**

```bash
# Install HubSpot CLI
npm install -g @hubspot/cli

# Initialize and authenticate
hs init

# Create a new project
hs project create --name "RevGuide" --template "getting-started-project"

# Navigate to project
cd revguide
```

Your `hsproject.json` should have:
```json
{
  "name": "RevGuide",
  "platformVersion": "2025.2"
}
```

**Option B: Using HubSpot Developer Portal**

1. Go to https://app.hubspot.com/developer/
2. Click **Create app** > **Create a public app**
3. Choose **Projects** as the app type
4. Select platform version **2025.2** or later

### 1.3 Configure OAuth Settings

In your HubSpot app settings, configure Auth:

1. **Redirect URL**:
   ```
   https://api.nango.dev/oauth/callback
   ```

2. **Required Scopes**:
   ```
   crm.objects.contacts.read
   crm.objects.companies.read
   crm.objects.deals.read
   crm.objects.tickets.read
   crm.schemas.contacts.read
   crm.schemas.companies.read
   crm.schemas.deals.read
   crm.schemas.tickets.read
   ```

3. **Optional Scopes** (for editable fields):
   ```
   crm.objects.contacts.write
   crm.objects.companies.write
   crm.objects.deals.write
   crm.objects.tickets.write
   ```

4. **Optional Scopes** (for custom objects - Enterprise only):
   ```
   crm.objects.custom.read
   crm.schemas.custom.read
   ```

5. Copy your **Client ID** and **Client Secret**

### 1.4 API Versioning

HubSpot now uses date-based API versioning. RevGuide uses version `2025-02` for stable compatibility. This is configured in the edge function proxy.

---

## Step 2: Configure Nango Integration

1. Log into Nango Dashboard (https://app.nango.dev)
2. Go to **Integrations** > **Configure New Integration**
3. Select **HubSpot** from the list
4. Configure:
   - **Integration Unique Key**: `hubspot` (must match code)
   - **Client ID**: (from your HubSpot OAuth app)
   - **Client Secret**: (from your HubSpot OAuth app)
5. Save the integration

> **Note**: OAuth scopes are configured in your **HubSpot OAuth app**, not in Nango. Nango passes through whatever scopes your HubSpot app requests.

---

## Step 3: Get Nango Secret Key

In the Nango Dashboard, go to **Environment Settings** (in the left nav bar):

1. Toggle between **Production** and **Development** environments
2. Copy the **Secret Key** for your environment

> **Note**: Nango has deprecated public keys. RevGuide uses **session tokens** generated server-side via the secret key. This is more secure as no keys are exposed in the frontend.

---

## Step 4: Configure RevGuide

### Add Supabase Environment Variables

In Supabase Dashboard > Project Settings > Edge Functions > Secrets, add:

```
NANGO_SECRET_KEY=your-nango-secret-key
```

That's it! No frontend configuration needed - the edge function generates session tokens on demand using the secret key.

---

## Step 5: Run Database Migration

Run the SQL migration in Supabase SQL Editor:

1. Go to Supabase Dashboard > SQL Editor
2. Open `/supabase/migrations/001_add_hubspot_connection.sql`
3. Copy and paste the entire file
4. Click "Run"

This creates:
- `organizations` table with `hubspot_portal_id` column
- `hubspot_connections` table for connection records
- `oauth_completions` table for tracking OAuth flow
- RLS policies for security

---

## Step 6: Deploy Edge Function

Deploy the Nango callback edge function:

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy the function
supabase functions deploy nango-callback
```

---

## Step 7: Configure Nango Webhook (Optional)

For automatic organization creation on OAuth completion:

1. In Nango Dashboard, go to **Webhooks**
2. Add a new webhook:
   - **URL**: `https://your-project.supabase.co/functions/v1/nango-callback/webhook`
   - **Events**: `auth.success`
3. Copy the webhook secret
4. Add to Supabase environment:
   ```
   NANGO_WEBHOOK_SECRET=your-webhook-secret
   ```

---

## API Routes

The Nango edge function provides these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session` | POST | Generate a session token for frontend OAuth |
| `/webhook` | POST | Receives Nango webhook on OAuth success |
| `/connection` | GET | Get connection details by connectionId |
| `/disconnect` | POST | Disconnect a HubSpot connection |
| `/proxy` | POST | Proxy requests to HubSpot API (with versioning) |

### API Versioning in Proxy

All proxied requests include the `X-HubSpot-API-Version` header set to `2025-02`. This ensures consistent API behavior across HubSpot's date-versioned endpoints.

---

## Testing the Integration

1. Go to `https://app.revguide.io/login`
2. Click "Continue with HubSpot"
3. Authorize the HubSpot app
4. Verify:
   - Organization is created with portal name
   - User is linked to organization
   - HubSpot connection shows as "Connected" in Settings

---

## Troubleshooting

### "Failed to connect HubSpot"
- Check Nango public key is correct
- Verify HubSpot app scopes match Nango config
- Ensure HubSpot app is using Projects framework (v2025.2+)

### "No organization" error
- Run the database migration
- Check RLS policies are applied

### OAuth popup doesn't open
- Check browser popup blocker
- Verify Nango SDK is loaded

### Token refresh fails
- Verify Nango secret key is set in Supabase
- Check HubSpot app is still authorized
- For migrated apps: ensure you're storing one token per hubId (portal)

### "Scope not available" error
- Some scopes require Enterprise HubSpot accounts (e.g., custom objects)
- Verify your HubSpot portal has the required features enabled

### API returns 404 or unexpected results
- Check API version header is being sent
- Verify the endpoint path is correct for the API version
- Review HubSpot's [API changelog](https://developers.hubspot.com/changelog) for breaking changes

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     User Browser                              │
├──────────────────────────────────────────────────────────────┤
│  RevGuide Web App (app.revguide.io)                         │
│  ├── login.js: Click "Connect with HubSpot"                 │
│  ├── nango.js: Trigger OAuth popup via Nango SDK            │
│  └── supabase.js: Save connection to database               │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     Nango Cloud                               │
├──────────────────────────────────────────────────────────────┤
│  1. Opens HubSpot OAuth consent screen                       │
│  2. Receives authorization code                              │
│  3. Exchanges for access + refresh tokens                    │
│  4. Stores tokens securely (one per hubId)                   │
│  5. Sends webhook to your edge function                      │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                 Supabase Edge Function                        │
├──────────────────────────────────────────────────────────────┤
│  /nango-callback/webhook                                     │
│  1. Receives connection details from Nango                   │
│  2. Fetches HubSpot portal info via Nango proxy              │
│  3. Creates/finds organization by portal_id (hubId)          │
│  4. Stores connection in hubspot_connections table           │
│                                                              │
│  /nango-callback/proxy                                       │
│  - Adds X-HubSpot-API-Version: 2025-02 header                │
│  - Proxies requests through Nango to HubSpot                 │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     Supabase Database                         │
├──────────────────────────────────────────────────────────────┤
│  organizations: { id, name, hubspot_portal_id, ... }         │
│  users: { id, email, organization_id, ... }                  │
│  hubspot_connections: { id, portal_id, nango_connection_id } │
└──────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

1. **Token Storage**: Tokens are stored by Nango, not in your database
2. **RLS Policies**: Users can only access their organization's data
3. **Service Role**: Edge functions use service role for org creation
4. **Connection ID**: Acts as a bearer token for API proxy requests
5. **One Token Per Portal**: Follows HubSpot 2025 platform requirements

---

## HubSpot Platform Migration Checklist

If migrating from a legacy HubSpot app:

- [ ] Create new Projects app with `platformVersion: "2025.2"`
- [ ] Update OAuth scopes to match new requirements
- [ ] Verify `crm.objects.custom.read` scope if using custom objects
- [ ] Test token refresh works (one token per hubId)
- [ ] Update any v1/v3 timeline events to v4 within 7 days of migration
- [ ] Plan for CRM card migration if applicable (deadline: Oct 31, 2026)

---

## References

- [HubSpot Developer Platform 2025](https://developers.hubspot.com/changelog/introducing-the-hubspot-developer-platform-2025)
- [Migrate existing public app](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/migrate-an-app/migrate-an-existing-public-app)
- [HubSpot Projects v2025.1 Deprecation](https://developers.hubspot.com/changelog/upcoming-deprecation-hubspot-projects-v2025-1-june-1-2026)
- [New Marketplace Distribution Limits](https://developers.hubspot.com/changelog/new-marketplace-distribution-app-install-limits)
- [Nango HubSpot Integration](https://nango.dev/docs/integrations/all/hubspot)
- [Nango OAuth Documentation](https://nango.dev/blog/why-is-oauth-still-hard)

---

## Next Steps

After setup:
1. Test the OAuth flow end-to-end
2. Verify HubSpot API calls work via the proxy
3. Configure the Chrome extension to sync from web app (future)
4. Monitor HubSpot developer changelog for platform updates
