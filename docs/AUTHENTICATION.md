# Authentication & User Management Strategy

This document outlines the authentication architecture options for RevGuide, comparing the current implementation with recommended approaches for a production SaaS product.

## Table of Contents

1. [Current Implementation](#current-implementation)
2. [Recommended Architecture](#recommended-architecture)
3. [Unified API Platforms](#unified-api-platforms)
4. [Implementation Options](#implementation-options)
5. [Multi-CRM Support](#multi-crm-support)
6. [Security Comparison](#security-comparison)
7. [Migration Path](#migration-path)

---

## Current Implementation

### How It Works Today

RevGuide currently uses **HubSpot Private App Tokens** for API authentication:

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

### Limitations of Current Approach

| Issue | Impact |
|-------|--------|
| **High setup friction** | Users must manually create app, configure scopes, copy token |
| **Token in browser** | If browser compromised, token exposed |
| **Not user-scoped** | Token has portal-wide access, not tied to user permissions |
| **Manual rotation** | Tokens expire; users must manually replace |
| **No audit trail** | Cannot track which user performed actions |
| **Single CRM** | Only supports HubSpot |

---

## Recommended Architecture

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
