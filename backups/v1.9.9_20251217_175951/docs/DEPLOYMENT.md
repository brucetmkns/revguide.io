# RevGuide Deployment Guide

This guide covers deploying RevGuide for production use. RevGuide consists of three main components:

1. **Web App** - Hosted on Vercel at app.revguide.io
2. **Supabase Backend** - Database, auth, and edge functions
3. **Cloudflare Worker** - Email invitation API

## Prerequisites

- [Supabase](https://supabase.com) account (free tier works)
- [Vercel](https://vercel.com) account (free tier works)
- [Cloudflare](https://cloudflare.com) account (free tier works)
- [HubSpot Developer](https://developers.hubspot.com) account
- [Resend](https://resend.com) account with verified domain
- Node.js 18+ installed locally
- Git installed locally

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd plugin

# 2. Copy environment template
cp .env.example .env

# 3. Fill in your environment variables (see sections below)
nano .env

# 4. Deploy all components
./scripts/deploy.sh  # (if available) or follow manual steps below
```

---

## Step 1: Supabase Setup

### 1.1 Create Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Name it "revguide-production" (or your preference)
4. Choose a strong database password
5. Select your preferred region

### 1.2 Get API Keys

1. Go to Project Settings > API
2. Copy these values to your `.env`:
   - `SUPABASE_URL` - Project URL
   - `SUPABASE_ANON_KEY` - anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` - service_role key (keep secret!)

### 1.3 Run Database Migrations

Run these migrations in order via Supabase SQL Editor:

```bash
# Option A: Using Supabase CLI
supabase link --project-ref your-project-ref
supabase db push

# Option B: Manual - run each file in SQL Editor
# 1. supabase/migrations/001_add_hubspot_connection.sql
# 2. supabase/migrations/002_direct_hubspot_oauth.sql
# 3. supabase/migrations/003_fix_rls_policies.sql
```

### 1.4 Configure Authentication

1. Go to Authentication > Providers
2. Enable **Email** (Magic Link):
   - Enable "Confirm email"
   - Set Site URL to `https://app.revguide.io`
   - Add redirect URLs:
     - `https://app.revguide.io/*`
     - `chrome-extension://*` (for extension)

3. Enable **Google OAuth** (optional):
   - Create OAuth credentials in Google Cloud Console
   - Add Client ID and Secret

### 1.5 Configure Email (Resend SMTP)

1. Go to Project Settings > Authentication > SMTP Settings
2. Enable "Custom SMTP"
3. Configure with Resend:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: Your Resend API key
   - Sender email: `noreply@revguide.io` (your verified domain)

### 1.6 Deploy Edge Functions

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Set secrets for the edge function
supabase secrets set HUBSPOT_CLIENT_ID=your-client-id
supabase secrets set HUBSPOT_CLIENT_SECRET=your-client-secret
supabase secrets set TOKEN_ENCRYPTION_KEY=your-32-char-key

# Deploy the HubSpot OAuth function
supabase functions deploy hubspot-oauth
```

**Generate TOKEN_ENCRYPTION_KEY:**
```bash
openssl rand -base64 32
```

---

## Step 2: HubSpot OAuth App Setup

### 2.1 Create OAuth App

1. Go to [developers.hubspot.com](https://developers.hubspot.com)
2. Create or select your developer account
3. Go to Apps > Create app

### 2.2 Configure App Settings

**Basic Info:**
- App name: RevGuide
- Description: Contextual guidance for HubSpot CRM
- Logo: Upload RevGuide logo

**Auth:**
- Redirect URL: `https://your-project-ref.supabase.co/functions/v1/hubspot-oauth/callback`

**Scopes (Required):**
```
oauth
crm.objects.contacts.read
crm.objects.companies.read
crm.objects.deals.read
crm.schemas.contacts.read
crm.schemas.companies.read
crm.schemas.deals.read
```

### 2.3 Get Credentials

1. Copy Client ID and Client Secret
2. Add to your `.env` and Supabase secrets

---

## Step 3: Vercel Deployment

### 3.1 Connect Repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Select the `plugin` folder as root directory

### 3.2 Configure Build Settings

- Framework Preset: Other
- Build Command: (leave empty)
- Output Directory: `.`
- Install Command: (leave empty)

### 3.3 Set Environment Variables

In Vercel Project Settings > Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3.4 Configure Domain

1. Go to Project Settings > Domains
2. Add `app.revguide.io`
3. Configure DNS:
   - Add CNAME record pointing to `cname.vercel-dns.com`

---

## Step 4: Cloudflare Worker (Email API)

### 4.1 Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 4.2 Configure Worker

```bash
cd api

# Set the Resend API key as a secret
wrangler secret put RESEND_API_KEY
# Paste your Resend API key when prompted
```

### 4.3 Update Configuration

Edit `api/invite-worker.js` if needed:
```javascript
const CONFIG = {
  fromEmail: 'RevGuide <team@revguide.io>',  // Your verified domain
  chromeStoreUrl: 'https://chrome.google.com/webstore/detail/revguide/...',
};
```

### 4.4 Deploy

```bash
wrangler deploy
```

Your worker URL will be: `https://revguide-api.revguide.workers.dev`

---

## Step 5: Chrome Extension Configuration

### 5.1 Update Supabase Config

Edit `admin/supabase.js`:
```javascript
const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

Also update `background/background.js` (Supabase REST API):
```javascript
const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

### 5.2 Configure Extension Auth Bridge

The extension uses Chrome's external messaging API to authenticate with the web app.

**Manifest Configuration** (`manifest.json`):
```json
{
  "externally_connectable": {
    "matches": [
      "https://app.revguide.io/*",
      "http://localhost:*/*"
    ]
  }
}
```

**Vercel Routes** (`vercel.json`):
Ensure the extension callback route is configured:
```json
{
  "rewrites": [
    { "source": "/extension/logged-in", "destination": "/admin/pages/extension-logged-in.html" }
  ]
}
```

### 5.3 Build Extension

The extension doesn't require a build step - it's ready to load as-is.

For Chrome Web Store submission, see [CHROME_WEB_STORE.md](./CHROME_WEB_STORE.md).

---

## Verification Checklist

After deployment, verify each component:

### Supabase
- [ ] Database tables created (organizations, users, hubspot_connections, etc.)
- [ ] RLS policies active
- [ ] Edge function deployed and responding
- [ ] Magic link emails sending

### Vercel
- [ ] Web app loads at https://app.revguide.io
- [ ] Login/signup works
- [ ] Redirects configured correctly

### Cloudflare Worker
- [ ] Health check passes: `curl https://revguide-api.revguide.workers.dev/health`
- [ ] Test invitation sends email

### HubSpot OAuth
- [ ] OAuth flow redirects correctly
- [ ] Tokens stored encrypted in database
- [ ] Token refresh works

### Extension
- [ ] Loads in Chrome developer mode
- [ ] Connects to web app via auth bridge
- [ ] Sign In button opens app.revguide.io login
- [ ] After login, extension receives auth token
- [ ] Authenticated extension fetches cloud content
- [ ] Sign Out clears auth state

---

## Environment Variables Reference

| Variable | Where Used | Description |
|----------|-----------|-------------|
| `SUPABASE_URL` | Edge functions, Web app | Supabase project URL |
| `SUPABASE_ANON_KEY` | Web app, Extension | Public API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions | Admin API key (keep secret!) |
| `HUBSPOT_CLIENT_ID` | Edge functions | HubSpot OAuth app ID |
| `HUBSPOT_CLIENT_SECRET` | Edge functions | HubSpot OAuth secret |
| `TOKEN_ENCRYPTION_KEY` | Edge functions | 32+ char key for pgcrypto |
| `RESEND_API_KEY` | Cloudflare Worker | Resend email API key |

---

## Troubleshooting

### Edge Function Errors

```bash
# View logs
supabase functions logs hubspot-oauth

# Test locally
supabase functions serve hubspot-oauth --env-file .env
```

### Database Issues

```sql
-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'users';

-- Verify helper function exists
SELECT proname FROM pg_proc WHERE proname = 'get_user_organization_id';
```

### OAuth Flow Issues

1. Check redirect URI matches exactly in HubSpot app settings
2. Verify all required scopes are selected
3. Check browser console for CORS errors

### Email Not Sending

1. Verify Resend domain is verified
2. Check Cloudflare Worker logs: `wrangler tail`
3. Verify API key is set correctly

---

## Security Notes

1. **Never commit `.env` files** - they contain secrets
2. **Rotate keys periodically** - especially TOKEN_ENCRYPTION_KEY
3. **Use separate keys for dev/prod** - never share across environments
4. **Monitor Supabase usage** - set up alerts for unusual activity
5. **Review RLS policies** - ensure data isolation is working

---

## Next Steps

- Set up [Error Monitoring](./ERROR_MONITORING.md) with Sentry
- Configure [CI/CD Pipeline](./CI_CD.md) with GitHub Actions
- Prepare for [Chrome Web Store](./CHROME_WEB_STORE.md) submission
