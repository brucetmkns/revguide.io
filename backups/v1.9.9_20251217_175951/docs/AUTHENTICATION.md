# Authentication & User Management

This document outlines the authentication architecture for RevGuide, covering both user authentication (Supabase) and CRM authentication (HubSpot API).

## Table of Contents

1. [Current Implementation](#current-implementation)
2. [User Authentication (Supabase)](#user-authentication-supabase)
3. [Extension Authentication Bridge](#extension-authentication-bridge)
4. [CRM Authentication (HubSpot)](#crm-authentication-hubspot)
5. [Email Configuration](#email-configuration)
6. [Recommended Future Architecture](#recommended-future-architecture)
7. [Multi-CRM Support](#multi-crm-support)

---

## Current Implementation

RevGuide uses a **dual authentication** approach:

1. **User Authentication**: Supabase Auth (Email/Password) for web app access
2. **CRM Authentication**: HubSpot OAuth via Nango for CRM data access

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Web App User   │────▶│   Supabase Auth  │────▶│   app.revguide.io│
│ (Email/Password) │     │   (JWT tokens)   │     │   (Dashboard)    │
└──────────────────┘     └──────────────────┘     └──────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Chrome Extension│────▶│  Nango OAuth     │────▶│   HubSpot API    │
│  (User's browser)│     │  (Token mgmt)    │     │   (CRM Data)     │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

---

## User Authentication (Supabase)

### Overview

The web app at [app.revguide.io](https://app.revguide.io) uses **Supabase Auth** for user authentication.

### Supported Methods

| Method | Status | Description |
|--------|--------|-------------|
| Email + Password | **Active** | Traditional credentials with email confirmation |
| Password Reset | **Active** | Email-based password reset for existing users |
| Magic Link | Deprecated | Replaced due to Outlook SafeLinks issues |
| Google OAuth | Disabled | Not configured in Supabase |

### Implementation

**Files:**
- `/admin/supabase.js` - Supabase client, auth methods (signUp, signIn, resetPassword, etc.)
- `/admin/pages/login.html` - Login page with password field
- `/admin/pages/login.js` - Login logic, forgot password handler
- `/admin/pages/signup.html` - Signup with name, company, email, password
- `/admin/pages/reset-password.html` - Password reset page
- `/admin/shared.js` - Auth state checking, auto-profile creation

**Configuration:**
```javascript
// admin/supabase.js
const SUPABASE_URL = 'https://[project-id].supabase.co';
const SUPABASE_ANON_KEY = '[anon-key]';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

**Signup Flow:**
1. User visits `/signup`
2. Enters name, company name, email, password
3. Clicks "Get started free"
4. Data stored in Supabase user metadata
5. Confirmation email sent via Resend SMTP
6. User clicks confirmation link → Returns to `/signup`
7. Profile + organization created via `create_user_with_organization()` RPC
8. Redirected to `/home`

**Login Flow:**
1. User visits `/login`
2. Enters email and password
3. Clicks "Sign in"
4. If no profile exists, auto-created from user metadata
5. Redirected to `/home`

**Password Reset Flow:**
1. User clicks "Forgot password?" on login page
2. Enters email, reset link sent
3. Clicks link → Opens `/reset-password`
4. Enters new password
5. Redirected to `/home`

**Context Detection:**
```javascript
// Detect if running as extension or web app
const isExtensionContext = typeof chrome !== 'undefined' && chrome.storage;

if (isExtensionContext) {
  // Use chrome.storage for data
} else {
  // Use Supabase for auth and data
}
```

---

## Extension Authentication Bridge

The Chrome extension authenticates with the web app using Chrome's external messaging API. This allows the extension to access organization-specific content stored in Supabase.

### Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Chrome Extension │────▶│  app.revguide.io │────▶│    Supabase      │
│   (Sidepanel)    │     │    (Web App)     │     │  (Org Content)   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
        │                         │
        │  chrome.runtime.        │
        │  sendMessage()          │
        │◀────────────────────────│
        │  (Auth token)           │
```

### Authentication Flow

```
1. User opens extension sidepanel
   └── Shows "Sign In Required" with login button

2. User clicks "Sign In"
   └── Opens: app.revguide.io/login?request_path=/extension/logged-in&eid={extensionId}

3. User logs in (or already logged in)
   └── Redirects to: /extension/logged-in?eid={extensionId}

4. Callback page sends message to extension:
   └── chrome.runtime.sendMessage(extensionId, { type: 'AUTH_STATE_CHANGED', payload })

5. Extension background.js receives via onMessageExternal
   └── Stores auth token in chrome.storage.local

6. Extension fetches organization content from Supabase
   └── Uses stored access token for API authentication
```

### Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | `externally_connectable` config for app.revguide.io |
| `background/background.js` | `onMessageExternal` listener, Supabase REST API |
| `admin/pages/extension-logged-in.html/js` | Callback page that sends auth to extension |
| `admin/pages/login.js` | Handles `request_path` redirect parameter |
| `sidepanel/sidepanel.js` | Auth state UI, login/logout handling |

### Manifest Configuration

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

### Auth State Storage

```javascript
// Stored in chrome.storage.local
{
  authState: {
    isAuthenticated: true,
    accessToken: "eyJ...",      // Supabase JWT
    refreshToken: "...",
    expiresAt: 1702000000,      // Unix timestamp
    user: {
      id: "user-uuid",
      email: "user@example.com"
    },
    profile: {
      id: "profile-uuid",
      name: "User Name",
      organizationId: "org-uuid",
      role: "admin"
    }
  }
}
```

### Background Script API

The background script exposes these message actions:

| Action | Purpose | Response |
|--------|---------|----------|
| `getAuthState` | Get current auth state | `{ isAuthenticated, user, profile, ... }` |
| `isAuthValid` | Check if token is valid (not expired) | `boolean` |
| `logout` | Clear auth state | `{ success: true }` |
| `getContent` | Get content (cloud if authenticated, else local) | `{ source, content }` |
| `refreshCloudContent` | Force refresh from Supabase | `{ success, content }` |

### UI States

| State | Sidepanel Plays Tab | Settings Tab | Admin Panel Button |
|-------|---------------------|--------------|-------------------|
| **Logged Out** | "Sign In Required" | HubSpot API token field visible | Opens local admin |
| **Logged In** | Organization content | Email + Sign Out button | Opens app.revguide.io |

### Security Considerations

1. **Origin Validation**: Background script validates `sender.origin` against allowlist
2. **Token Storage**: Stored in `chrome.storage.local` (extension-only access)
3. **HTTPS Only**: `externally_connectable` only allows HTTPS origins (except localhost)
4. **Token Expiry**: Client checks `expiresAt` before making API calls

### Logout Flow

```
1. User clicks "Sign Out" in sidepanel
   └── Calls background.js with action: 'logout'

2. Background clears authState from storage
   └── chrome.storage.local.remove('authState')

3. Background notifies all contexts
   └── chrome.runtime.sendMessage({ action: 'authStateChanged', isAuthenticated: false })

4. Sidepanel updates UI
   └── Shows "Sign In Required" state
```

---

## CRM Authentication (HubSpot)

### How It Works

RevGuide uses **HubSpot Private App Tokens** for CRM API access:

```
┌──────────────────┐     ┌──────────────┐     ┌──────────────┐
│  Chrome Extension│────▶│  Browser     │────▶│  HubSpot     │
│  (Admin Panel)   │     │  Storage     │     │    API       │
└──────────────────┘     └──────────────┘     └──────────────┘
```

**Setup Flow:**
1. User creates a Private App in HubSpot Settings → Integrations → Private Apps
2. User configures required scopes (see below)
3. User copies the access token
4. User pastes token into RevGuide Settings tab
5. Token stored in `chrome.storage.local`

**Required Scopes:**

| Scope | Purpose |
|-------|---------|
| `crm.objects.contacts.read` | Read contact data for rule evaluation |
| `crm.objects.companies.read` | Read company data for rule evaluation |
| `crm.objects.deals.read` | Read deal data for rule evaluation |
| `crm.objects.tickets.read` | Read ticket data for rule evaluation |
| `crm.schemas.*.read` | Read property definitions for dropdowns |
| `crm.objects.*.write` | (Optional) Enable editable fields |

### Limitations of Current CRM Auth Approach

| Issue | Impact |
|-------|--------|
| **High setup friction** | Users must manually create app, configure scopes, copy token |
| **Token in browser** | If browser compromised, token exposed |
| **Not user-scoped** | Token has portal-wide access, not tied to user permissions |
| **Manual rotation** | Tokens expire; users must manually replace |
| **No audit trail** | Cannot track which user performed actions |
| **Single CRM** | Only supports HubSpot |

---

## Email Configuration

### Overview

RevGuide uses **Resend** as the SMTP provider for transactional emails, configured through Supabase.

### Setup

1. **Resend Account**: Sign up at [resend.com](https://resend.com)
2. **Domain Verification**: Verify `revguide.io` domain in Resend dashboard
3. **API Key**: Create API key in Resend
4. **Supabase SMTP**: Configure custom SMTP in Supabase → Project Settings → Authentication

### SMTP Configuration

| Setting | Value |
|---------|-------|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API key |
| Sender Email | `hello@revguide.io` |
| Sender Name | `RevGuide` |

### Email Templates

All templates are configured in **Supabase → Authentication → Email Templates**.

#### Design System

| Element | Value |
|---------|-------|
| Primary Color | `#b2ef63` (lime green) |
| Background | `#f8fafc` (light gray) |
| Header Background | `#111827` (dark charcoal) |
| Text Color | `#1e293b` (dark gray) |
| Font | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |
| Border Radius | `12px` |

#### Template Types

1. **Magic Link** - Subject: "Sign in to RevGuide"
2. **Confirm Signup** - Subject: "Welcome to RevGuide — Confirm your email"
3. **Invite User** - Subject: "You've been invited to join RevGuide"
4. **Reset Password** - Subject: "Reset your RevGuide password"

#### Template Structure

```html
<!-- All templates follow this structure -->
<body style="background-color: #f8fafc; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px;">

    <!-- Header: Dark background with white text -->
    <div style="background: #111827; padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #ffffff;">RevGuide</h1>
    </div>

    <!-- Body: Content area -->
    <div style="padding: 32px;">
      <h2>Title</h2>
      <p>Message content...</p>
      <a href="{{ .ConfirmationURL }}" style="background: #b2ef63; color: #111827; padding: 14px 28px; border-radius: 8px;">
        Button Text
      </a>
    </div>

    <!-- Footer: Light background -->
    <div style="background: #f8fafc; padding: 20px; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
      <p>RevGuide — Contextual guidance for your revenue team</p>
    </div>
  </div>
</body>
```

---

## Recommended Future Architecture

### OAuth SSO with Hosted Admin Panel

The recommended approach uses **OAuth 2.0** with a **hosted admin panel** and **backend API**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Hosted Admin Panel                            │
│                    (with Microsoft Clarity)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Banners  │  │  Plays   │  │   Wiki   │  │ Settings │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Connect Your CRM:  [HubSpot] [Salesforce] [Pipedrive]   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API / Nango                           │
│  • Handles OAuth flow for each CRM                              │
│  • Stores & refreshes tokens securely                           │
│  • Rate limiting & retries                                      │
│  • User session management                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
      ┌──────────┐      ┌──────────┐      ┌──────────┐
      │ HubSpot  │      │Salesforce│      │Pipedrive │
      │   API    │      │   API    │      │   API    │
      └──────────┘      └──────────┘      └──────────┘
```

### OAuth Flow

```
1. User clicks "Login with HubSpot" in admin panel
                    │
                    ▼
2. Redirected to HubSpot OAuth consent screen
   (User sees requested permissions)
                    │
                    ▼
3. User approves → HubSpot redirects back with auth code
                    │
                    ▼
4. Backend exchanges code for access_token + refresh_token
                    │
                    ▼
5. Tokens stored securely in database (never in browser)
                    │
                    ▼
6. Extension calls backend API → Backend calls CRM API
```

### Benefits

| Benefit | Description |
|---------|-------------|
| **Lower friction** | One-click "Login with HubSpot" |
| **More secure** | Tokens never stored in browser |
| **User-scoped** | Actions tied to logged-in user's permissions |
| **Auto-refresh** | Backend handles token rotation |
| **Audit trail** | Log who did what, when |
| **Revocable** | Users can disconnect from HubSpot's Connected Apps |
| **Multi-CRM** | Same architecture supports multiple CRMs |
| **Analytics** | Can add Microsoft Clarity to hosted panel |

---

## Unified API Platforms

Rather than building OAuth flows for each CRM individually, use a **Unified API Platform** that handles authentication for multiple CRMs through a single integration.

### Platform Comparison

| Platform | CRMs | OAuth | Pricing | Self-Host | Best For |
|----------|------|-------|---------|-----------|----------|
| **[Nango](https://nango.dev/)** | 500+ | ✅ | Free tier | ✅ Open source | Cost-conscious, full control |
| **[Merge](https://www.merge.dev/)** | 20+ CRMs | ✅ | Custom | ❌ | Enterprise, unified data models |
| **[Apideck](https://www.apideck.com/)** | 50+ | ✅ | $299/mo | ❌ | Quick setup, managed service |
| **[Vessel](https://www.vessel.dev/)** | 8+ CRMs | ✅ | Custom | ❌ | GTM tools focus |
| **[Paragon](https://www.useparagon.com/)** | 130+ | ✅ | Custom | ✅ Optional | Enterprise, workflow automation |
| **[Unified.to](https://unified.to/)** | Multiple | ✅ | Free tier | ❌ | Simple integrations |

### Recommended: Nango

**Why Nango is the best fit for RevGuide:**

1. **Open Source** - Self-host for free, or use cloud
2. **Free OAuth Tier** - Auth/credential management is free forever
3. **All Target CRMs** - HubSpot, Salesforce, Pipedrive supported
4. **Flexible** - Use unified models OR direct API passthrough
5. **White-label** - Embeddable "Connect to [CRM]" UI
6. **Active Development** - Y Combinator backed, growing community

### Nango Features

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nango Handles                            │
├─────────────────────────────────────────────────────────────────┤
│  ✅ OAuth 2.0 flows (authorization code, refresh)               │
│  ✅ API key authentication                                       │
│  ✅ Token storage & encryption                                   │
│  ✅ Automatic token refresh                                      │
│  ✅ Rate limit management                                        │
│  ✅ Request retries with backoff                                 │
│  ✅ Webhook notifications for credential issues                  │
│  ✅ White-label auth UI                                          │
│  ✅ Connection status monitoring                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Example Integration Code

```javascript
import { Nango } from '@nangohq/node';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY });

// Trigger OAuth flow (frontend)
nango.auth('hubspot', 'user-123');

// Make API calls (backend) - same code works for any CRM
async function getContacts(userId, provider) {
    const response = await nango.proxy({
        connectionId: userId,
        providerConfigKey: provider, // 'hubspot', 'salesforce', 'pipedrive'
        endpoint: '/crm/v3/objects/contacts',
        method: 'GET'
    });
    return response.data;
}

// Check connection status
const connection = await nango.getConnection('hubspot', 'user-123');
console.log(connection.credentials); // { access_token, refresh_token, expires_at }
```

---

## Implementation Options

### Option 1: Nango Cloud (Recommended for MVP)

**Effort:** Low | **Cost:** Free tier available | **Time:** 1-2 weeks

```
Admin Panel (hosted) → Nango Cloud → CRM APIs
```

**Pros:**
- Fastest to implement
- No infrastructure to manage
- Free for OAuth/auth features

**Cons:**
- Data passes through Nango servers
- Paid plans for advanced features

### Option 2: Nango Self-Hosted

**Effort:** Medium | **Cost:** Infrastructure only | **Time:** 2-4 weeks

```
Admin Panel → Your Backend + Nango (self-hosted) → CRM APIs
```

**Pros:**
- Full data control
- No per-API-call costs
- Complete customization

**Cons:**
- Need to manage infrastructure
- More complex deployment

### Option 3: Custom OAuth Implementation

**Effort:** High | **Cost:** Infrastructure | **Time:** 4-8 weeks

```
Admin Panel → Your Backend (custom OAuth) → CRM APIs
```

**Pros:**
- Complete control
- No third-party dependencies

**Cons:**
- Must implement OAuth for each CRM separately
- Handle token refresh, rate limits, errors yourself
- Significant ongoing maintenance

---

## Multi-CRM Support

### Data Model Considerations

Each CRM has different terminology and data structures:

| Concept | HubSpot | Salesforce | Pipedrive |
|---------|---------|------------|-----------|
| Company | Company | Account | Organization |
| Person | Contact | Contact/Lead | Person |
| Opportunity | Deal | Opportunity | Deal |
| Support Case | Ticket | Case | - |
| Custom Fields | Properties | Custom Fields | Custom Fields |

### Abstraction Strategy

**Option A: CRM-Specific Adapters**

Create an adapter layer that normalizes data:

```javascript
// Unified interface
interface CRMAdapter {
    getRecord(type: string, id: string): Promise<Record>;
    getProperties(type: string): Promise<Property[]>;
    updateRecord(type: string, id: string, data: object): Promise<void>;
}

// CRM-specific implementations
class HubSpotAdapter implements CRMAdapter { ... }
class SalesforceAdapter implements CRMAdapter { ... }
class PipedriveAdapter implements CRMAdapter { ... }
```

**Option B: Use Nango's Unified Models**

Nango provides pre-built sync scripts that normalize data:

```javascript
// Same code works for any CRM
const contacts = await nango.listRecords({
    connectionId: 'user-123',
    providerConfigKey: 'hubspot', // or 'salesforce', 'pipedrive'
    model: 'Contact'
});
```

### Rule Engine Compatibility

RevGuide's rule engine will need updates to support multiple CRMs:

```javascript
// Current: HubSpot-specific
{
    "property": "lifecyclestage",
    "operator": "equals",
    "value": "customer"
}

// Future: CRM-agnostic with mapping
{
    "field": "lifecycle_stage",  // Unified field name
    "operator": "equals",
    "value": "customer",
    "mappings": {
        "hubspot": "lifecyclestage",
        "salesforce": "StageName",
        "pipedrive": "stage_id"
    }
}
```

---

## Security Comparison

| Aspect | Current (Private App) | OAuth with Nango |
|--------|----------------------|------------------|
| Token Location | Browser (`chrome.storage`) | Server-side (Nango/database) |
| Token Exposure | Visible if browser compromised | Never exposed to client |
| Permissions | Portal-wide (all data) | User-scoped (user's permissions) |
| Token Refresh | Manual (user must replace) | Automatic |
| Revocation | Manual in HubSpot | User disconnects in app |
| Audit Trail | None | Full logging possible |
| Compliance | Basic | SOC2 capable |

### Security Best Practices

1. **Never store tokens in browser** - Use server-side storage
2. **Use OAuth over API keys** - User-scoped, revocable
3. **Implement token refresh** - Handle expiration gracefully
4. **Log all API calls** - Audit trail for compliance
5. **Encrypt at rest** - Encrypt stored credentials
6. **Use HTTPS only** - All communication encrypted
7. **Implement rate limiting** - Prevent abuse

---

## Migration Path

### Phase 1: Host Admin Panel + Add Analytics

**Goal:** Move admin panel to web hosting, add Microsoft Clarity

1. Deploy admin panel to hosting (Vercel, Netlify, etc.)
2. Update extension to open hosted URL
3. Add Microsoft Clarity tracking code
4. Keep existing Private App token flow (for now)

### Phase 2: Add Nango for OAuth

**Goal:** Replace manual token entry with OAuth

1. Sign up for Nango Cloud
2. Configure HubSpot integration in Nango
3. Add "Connect with HubSpot" button to admin
4. Update API calls to go through Nango
5. Remove manual token input

### Phase 3: Add User Management

**Goal:** Associate settings with user accounts

1. Add user authentication (email/password or HubSpot SSO)
2. Store user settings in database (not browser)
3. Sync settings across devices
4. Add user roles/permissions (admin, viewer)

### Phase 4: Multi-CRM Support

**Goal:** Support Salesforce and Pipedrive

1. Configure Salesforce/Pipedrive in Nango
2. Add CRM selector to onboarding
3. Create CRM adapter layer
4. Update rule engine for CRM-agnostic fields
5. Test thoroughly with each CRM

---

## Resources

### Documentation
- [Nango Docs](https://docs.nango.dev/)
- [Nango GitHub](https://github.com/NangoHQ/nango)
- [HubSpot OAuth Docs](https://developers.hubspot.com/docs/api/working-with-oauth)
- [Salesforce OAuth Docs](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_flows.htm)
- [Pipedrive OAuth Docs](https://pipedrive.readme.io/docs/marketplace-oauth-authorization)

### Unified API Platforms
- [Nango](https://nango.dev/) - Recommended
- [Merge](https://www.merge.dev/)
- [Apideck](https://www.apideck.com/)
- [Vessel](https://www.vessel.dev/)
- [Paragon](https://www.useparagon.com/)
- [Unified.to](https://unified.to/)

### Related RevGuide Documentation
- [README.md](../README.md) - Getting started
- [ROADMAP.md](../ROADMAP.md) - Future plans
- [PRIVACY.md](../PRIVACY.md) - Privacy policy

---

## Summary

| Approach | Complexity | Security | Multi-CRM | Recommended For |
|----------|------------|----------|-----------|-----------------|
| Current (Private App) | Low | Basic | ❌ | Development/testing |
| Nango Cloud | Low | High | ✅ | MVP / Early product |
| Nango Self-Hosted | Medium | High | ✅ | Scale / Data control |
| Custom OAuth | High | High | ✅ | Enterprise / Custom needs |

**Recommended path:** Start with **Nango Cloud** for the MVP. It provides secure OAuth, multi-CRM support, and minimal implementation effort. Migrate to self-hosted later if needed for data control or cost optimization.
