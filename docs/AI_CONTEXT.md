# RevGuide - AI Context Reference

Quick reference for AI assistants working on this codebase. For detailed documentation, see linked files.

---

## Project Overview

**RevGuide** is a Chrome extension + SaaS web app that displays contextual guidance (banners, plays/battle cards, wiki tooltips) on HubSpot CRM pages based on property-based rules.

- **Extension**: Chrome Manifest V3
- **Web App**: app.revguide.io (admin panel)
- **Backend**: Supabase (database + edge functions)
- **Email**: Cloudflare Workers (invitations)

> **Important:** Supered is a COMPETITOR. Documentation may reference "Supered-style" patterns (implementation techniques we studied), but all URLs, branding, and external links must use RevGuide domains (`revguide.io`, `app.revguide.io`, `help.revguide.io`). Never use `supered.io`.

---

## Directory Structure

```
plugin/
├── manifest.json          # Extension manifest (v3)
├── package.json           # Build dependencies
│
├── admin/                 # Admin panel (web + extension popup)
│   ├── admin.js           # Main admin controller
│   ├── shared.js          # Shared utilities
│   ├── supabase.js        # Database client (RevGuideAuth, RevGuideDB)
│   ├── hubspot.js         # HubSpot OAuth client
│   └── pages/             # Multi-page admin UI
│       ├── home.js        # Dashboard
│       ├── banners.js     # Banner CRUD
│       ├── plays.js       # Battle cards CRUD
│       ├── wiki.js        # Wiki glossary CRUD
│       ├── libraries.js   # Content library browser
│       ├── settings.js    # Settings & team management
│       ├── partner.js     # Managed Accounts page (v2.8.0+)
│       ├── partner-home.js # Partner Home page (v2.8.2+)
│       ├── content.js     # Content library + tags CRUD (v2.15.0+)
│       └── login.js       # Web authentication
│
├── background/
│   └── background.js      # Service worker (API proxy, message routing)
│
├── content/               # Content scripts (injected into HubSpot)
│   ├── content.js         # Main orchestrator
│   ├── content.css        # Injection styles
│   └── modules/
│       ├── banners.js     # Banner rendering
│       ├── wiki.js        # Wiki tooltips
│       ├── sidepanel.js   # FAB button & sidepanel
│       ├── presentations.js # Media embeds (Google Slides, etc.)
│       ├── index-tags.js  # Index page tags (table & board views)
│       └── erp-icon.js    # ERP system link icons
│
├── sidepanel/
│   └── sidepanel.js       # Chrome side panel UI
│
├── lib/                   # Shared libraries
│   ├── rules-engine.js    # Condition evaluation (RevGuideRulesEngine)
│   ├── content-recommendations.js # Content matching engine (ContentRecommendationEngine)
│   ├── storage.js         # Chrome storage wrapper (StorageManager)
│   ├── wiki-cache.js      # Wiki term caching (RevGuideWikiCache)
│   └── icons.js           # SVG icon definitions
│
├── styles/                # Shared CSS
│   ├── base.css
│   ├── components.css
│   └── icons.css
│
├── supabase/
│   ├── functions/         # Edge functions
│   │   └── hubspot-oauth/ # OAuth token exchange
│   └── migrations/        # Database schema
│
├── api/
│   └── invite-worker.js   # Cloudflare Worker for email invitations + billing API
│
├── website/               # Marketing site (revguide.io)
│
├── scripts/
│   └── build.js           # Minification build script
│
├── tests/                 # Test files
│
└── docs/                  # Documentation
```

---

## Key Global Objects

| Object | File | Purpose |
|--------|------|---------|
| `RevGuideAuth` | admin/supabase.js | Supabase auth wrapper |
| `RevGuideDB` | admin/supabase.js | Database operations |
| `RevGuideHubSpot` | admin/hubspot.js | HubSpot OAuth |
| `RevGuideRulesEngine` | lib/rules-engine.js | Condition evaluation |
| `RevGuideContentRecommendations` | lib/content-recommendations.js | Content recommendation matching |
| `RevGuideWikiCache` | lib/wiki-cache.js | Wiki term caching |
| `StorageManager` | lib/storage.js | Chrome storage wrapper |
| `AdminPanel` | admin/admin.js | Admin UI controller |
| `AdminShared` | admin/shared.js | Shared admin utilities |

---

## Data Flow

```
HubSpot Page Load
    ↓
content.js detects page type + CRM context (portal ID, CRM type)
    ↓
background.js matches portal ID to organization (v2.1.0+)
    ↓
background.js fetches data from Supabase for matched org
    ↓
content.js extracts page properties from DOM
    ↓
RulesEngine evaluates conditions
    ↓
Modules render matching content:
├── banners.js → Banners
├── wiki.js → Tooltips
├── sidepanel.js → FAB button
└── presentations.js → Media embeds
```

---

## Terminology Mapping

The codebase uses mixed terminology due to evolution:

| UI Label | Code Variable | Database Table | Notes |
|----------|---------------|----------------|-------|
| Plays | `battleCards` | `plays` | Sales/battle cards |
| Banners | `rules`, `banners` | `banners` | Conditional banners |
| Wiki | `wikiEntries` | `wiki_entries` | Field glossary |
| Media Embeds | `presentations` | (via banners) | Part of banner system |
| Content | `recommendedContent` | `recommended_content` | Recommended content assets |
| Tags | `contentTags` | `content_tags` | Content categorization tags |
| Tag Rules | `tagRules` | `tag_rules` | Rules that output tags |

---

## Authentication

**Dual context:**
- **Web app** (app.revguide.io): Supabase JWT auth
- **Extension**: Chrome storage + message passing to background.js

**Account Types (v2.8.0+):**
- `standard` - Regular users (owner, admin, editor, viewer roles)
- `partner` - Agency/freelancer accounts with dedicated Partner Dashboard

**Roles:** Owner > Admin > Editor > Viewer > Partner (external access to client orgs)

**HubSpot OAuth:** Direct integration via `admin/hubspot.js`

See: [AUTHENTICATION.md](AUTHENTICATION.md)

---

## Multi-Portal & Partner Accounts (v2.7.0+, v2.8.0+, v2.1.0+)

**For agencies/partners managing multiple HubSpot portals:**

- Users can belong to multiple organizations via `organization_members` table
- `active_organization_id` tracks which portal is currently active
- Portal selector dropdown appears in sidebar when user has 2+ portals
- **Import/Export** (v2.7.2+): JSON export from one portal, import to another with Replace All or Merge mode

**Org-Aware URLs (v2.1.0+):**
- Admin URLs support org UUID prefix: `/[org-uuid]/banners`, `/[org-uuid]/wiki`, etc.
- Enables deep linking to specific organization's content
- Backward compatible - `/banners` still works (uses active org)
- Sidebar nav links automatically include org UUID when available
- Portal selector redirects to org-prefixed URL for current page
- URL functions: `getOrgIdFromUrl()`, `getCurrentPagePath()`, `buildOrgAwareUrl()`

**Extension Auto-Match (v2.1.0+):**
- Extension extracts HubSpot portal ID from URL (`/contacts/12345678/...`)
- Queries Supabase to find org with matching `hubspot_portal_id`
- Silently loads that organization's content (no prompt needed)
- Falls back to user's default org if no match found
- CRM-agnostic design: supports future Salesforce, Attio, etc. via `crmType` parameter
- Key function: `getOrgByCrmPortalId(portalId, crmType, accessToken)` in background.js

**Partner Account System (v2.8.0+, v2.8.2+, v2.13.0+):**
- `account_type` column: `'standard'` or `'partner'`
- `home_organization_id` tracks partner's agency org
- Partner Home (`/partner/home`) - 3-step onboarding for partners (v2.8.2+)
- Managed Accounts (`/partner/accounts`) - dedicated UI for client management
- Sidebar dropdown: Partner → Home, Managed Accounts
- Partners have `partner` role in client orgs
- Admins can invite partners or convert their account to partner
- **Portal Creation (v2.13.0+):** Partners can create client portals before customer signup
  - "Add Client Portal" creates org with partner as manager
  - "Invite Owner" sends ownership claim email to customer
  - Customer becomes owner while partner retains management access
  - Partners can connect HubSpot for client orgs via `active_organization_id`

**Key tables:**
- `organization_members` - Many-to-many user↔org with per-org roles
- `partner_libraries` - Reusable content packages
- `library_installations` - Track installed libraries per org

**Key functions (RevGuideDB):**
- `getUserOrganizations()` - Get all portals user can access
- `switchOrganization(orgId)` - Switch active portal
- `isConsultant()` - Check partner privileges (legacy name, checks partner role)
- `isPartner()` - Check if user is a partner (v2.8.0+)
- `getPartnerClients()` - Get client portals for partner (v2.8.0+)
- `getPartnerStats()` - Get dashboard stats for partner (v2.8.0+)
- `convertToPartner(agencyName)` - Convert admin to partner (v2.8.0+)
- `createClientOrganization(orgName)` - Create portal for client (v2.13.0+)
- `inviteOrgOwner(orgId, email)` - Send ownership invitation (v2.13.0+)
- `orgHasOwner(orgId)` - Check if org has an owner (v2.13.0+)

**Partner Signup Paths:**
1. **Invited by client**: Accept invitation → `/signup?token=xxx&role=partner` → Creates partner account + joins client org → Redirects to `/partner/home`
2. **Convert existing**: Settings → "Become a Partner" → Creates agency org, updates account_type
3. **New signup**: Settings → "Sign Up with a New Account" → Signs out → `/signup?new_partner=true` → Fresh partner account → Redirects to `/partner/home`

**Role helpers (AdminShared) - v2.7.3+:**
- `getEffectiveRole()` - Returns org-specific role from `organization_members`, falls back to `currentUser.role`
- `isAdmin()`, `isMember()`, `canEditContent()` - All use `getEffectiveRole()` for per-org permissions

**Import/Export (AdminShared):**
- `saveStorageData(data, {importMode})` - Bulk insert with 'replace' or 'merge' mode
- `sanitizeImportData(data)` - XSS protection via DOMPurify

See: [MULTI_PORTAL_DEV.md](MULTI_PORTAL_DEV.md)

---

## Build System

```bash
npm install              # Install dependencies
npm run build            # Production build (minified → dist/)
npm run build:dev        # Development build (unminified)
npm run package          # Build + create revguide-extension.zip
```

Build script: `scripts/build.js`
- Minifies JS (Terser) and CSS (CleanCSS)
- Excludes: docs, tests, backups, website, supabase, api

---

## Database (Supabase)

**Key tables:**
- `organizations` - Multi-tenant orgs (includes `stripe_customer_id`)
- `users` - Team members (role-based, with `active_organization_id` for portal switching)
- `organization_members` - Many-to-many user↔org with per-org roles (v2.7.0+)
- `banners` - Banner rules
- `plays` - Battle cards
- `wiki_entries` - Wiki glossary
- `hubspot_connections` - OAuth tokens (encrypted)
- `partner_libraries` - Reusable content packages (v2.7.0+)
- `library_installations` - Track installed libraries per org (v2.7.0+)
- `content_tags` - Tag definitions for content categorization (v2.15.0+)
- `tag_rules` - Rules that output tags when conditions match (v2.15.0+)
- `recommended_content` - Content assets with tags and conditions (v2.15.0+)

**Billing tables (v2.11.0+):**
- `plan_limits` - Plan tier configuration (limits, pricing per plan_type)
- `subscriptions` - Per-org subscription tracking (stripe_subscription_id, plan_type, status, seat_count)
- `usage_counts` - Cached content counts for limit checks
- `billing_events` - Webhook event audit log

**Billing RPC functions:**
- `get_subscription_with_limits(org_id)` - Full subscription + usage + limits info
- `can_create_content(org_id, content_type)` - Boolean limit check
- `upsert_subscription(...)` - Create/update subscription from webhook
- `start_grace_period(org_id)` / `clear_grace_period(org_id)` - Grace period management

**RLS:** Row-level security enforced for all tables.

See: [SUPERADMIN_BACKEND.md](SUPERADMIN_BACKEND.md)

---

## HubSpot DOM Targeting

**Critical patterns:**
- URL: Always `/contacts/PORTAL_ID/record/OBJECT_TYPE_ID/RECORD_ID`
- Object types: `0-1`=Contact, `0-2`=Company, `0-3`=Deal, `0-5`=Ticket
- Scroll container: `querySelector('[class*="ScrollContainer"]')`
- Table headers: Target `[data-test-id*="truncated-object-label"]`, NOT `<th>`

See: [HUBSPOT_DOM.md](HUBSPOT_DOM.md)

---

## Common Tasks

### Add a new admin page
1. Create `admin/pages/newpage.html`, `.js`, `.css`
2. Add route in `admin/admin.js`
3. Add nav item in admin HTML

### Add a new banner type
1. Update `lib/rules-engine.js` with new operators
2. Update `content/modules/banners.js` for rendering
3. Update `admin/pages/banners.js` for UI

### Add wiki support to new HubSpot area
1. Add selectors in `content/modules/wiki.js`
2. Test with MutationObserver for lazy-loaded content
3. See [HUBSPOT_DOM.md](HUBSPOT_DOM.md) for selector patterns

---

## Plays Features (v2.11.4+)

### Variable Interpolation
Use `{{propertyName}}` syntax in play section titles and content to display HubSpot record data:

```
Section title: "Next steps for {{dealname}}"
Section content: "Deal value: {{amount}} | Close: {{closedate}}"
```

**Auto-formatting:**
- ISO dates → "Dec 31, 2025"
- Unix timestamps → "Dec 31, 2025"
- Currency fields (amount, price, revenue) → "$30,000"

**Implementation:** `sidepanel/sidepanel.js` - `interpolateVariables()`, `formatVariableValue()`

### Opening Plays from Banners
Banners with linked plays show "Open Play" button. Clicking opens the play in sidepanel with full record context.

**Context passed:** `recordId`, `objectType`, `properties` (for editable fields + variables)

**Files:** `content/modules/banners.js`, `content/modules/index-tags.js`, `background/background.js`

### Keyboard Shortcuts
- **Cmd/Ctrl+Enter**: Save HubSpot field values in editable field sections

---

## ERP Icon Feature (v2.12.0+)

Displays a clickable icon next to HubSpot record names when those records exist in an external ERP system (e.g., Q360, NetSuite, SAP).

### Configuration (Settings → External System Link)

- **Master toggle**: Enable/disable feature globally
- **System name**: Display name (e.g., "Q360")
- **Icon upload**: Custom PNG/SVG (stored as data URI, 100KB max)
- **Per-object mappings**: Configure for Companies, Deals, Contacts, Tickets
  - **Primary field**: HubSpot property containing ERP ID (e.g., `q360_company_id`)
  - **Primary URL template**: Link template with `{{value}}` or `{{fieldname}}` placeholder
  - **Fallback field** (optional): Secondary field if primary is empty (e.g., `q360_site_id`)
  - **Fallback URL template**: Separate URL for fallback

### Data Storage

```javascript
// organizations.erp_config (JSONB)
{
  enabled: true,
  erp_name: "Q360",
  icon: "data:image/png;base64,...",
  field_mappings: {
    "company": {
      field: "q360_company_id",
      url_template: "https://erp.example.com/company/{{value}}",
      fallback_field: "q360_site_id",
      fallback_url_template: "https://erp.example.com/site/{{value}}"
    },
    "deal": { field: "q360_opportunity_id", url_template: "..." },
    "contact": { field: "q360_contact_id", url_template: "..." }
  }
}
```

### Key Files

| File | Purpose |
|------|---------|
| `content/modules/erp-icon.js` | Icon rendering on record pages |
| `admin/pages/settings.js` | Configuration UI logic |
| `admin/pages/settings.html` | Configuration UI markup |
| `supabase/migrations/033_add_erp_config.sql` | Database column |
| `supabase/migrations/034_partner_erp_config_update.sql` | Partner update RPC |

### Partner Access

Partners can configure ERP settings for managed organizations via RPC function `update_org_erp_config()` which bypasses RLS with proper authorization checks.

---

## Known Issues / Tech Debt

1. **Terminology inconsistency** - "plays" vs "battleCards" vs "presentations"
2. **CSS @import warnings** - Build shows warnings for CSS imports (non-blocking)

See: [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md)

---

## Quick Links

| Topic | File |
|-------|------|
| Installation | [INSTALL.md](INSTALL.md) |
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Authentication | [AUTHENTICATION.md](AUTHENTICATION.md) |
| HubSpot DOM | [HUBSPOT_DOM.md](HUBSPOT_DOM.md) |
| Deployment | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Performance | [PERFORMANCE_OPTIMIZATION.md](PERFORMANCE_OPTIMIZATION.md) |
| Lessons Learned | [LEARNINGS.md](LEARNINGS.md) |
| Tech Debt | [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) |
| Roadmap | [../ROADMAP.md](../ROADMAP.md) |
| Changelog | [../CHANGELOG.md](../CHANGELOG.md) |

---

## Billing Integration (v2.11.0+)

**Architecture:**
- Stripe Checkout for subscription upgrades (hosted checkout page)
- Stripe Customer Portal for billing management
- Supabase Edge Function for webhook handling
- Cloudflare Worker for API endpoints

**Billing API Endpoints** (`api/invite-worker.js`):
- `POST /api/billing/create-checkout-session` - Create Stripe Checkout session
- `POST /api/billing/create-portal-session` - Create Stripe Customer Portal session
- `POST /api/billing/subscription` - Get subscription status via RPC

**Webhook Handler** (`supabase/functions/stripe-webhook/index.ts`):
- Deployed with `--no-verify-jwt` (external webhook calls)
- Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid/payment_failed`
- Uses subscription metadata for organization association (race condition fix)

**Environment Variables:**
- Cloudflare Worker: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*` (price IDs per plan)
- Supabase: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

**Pricing Model:**
| Plan | Monthly | Limits |
|------|---------|--------|
| Starter | $5/seat (free ≤5) | 5 banners, 10 wiki, 3 plays |
| Pro | $10/seat | Unlimited |
| Business | $20/seat | Unlimited |
| Partner Starter | $500 | 5 client portals, 3 libraries |
| Partner Pro | $1,250 | 20 client portals, 10 libraries |
| Partner Enterprise | $2,500 | Unlimited |

---

---

## Content Recommendations (v2.15.0+)

A hybrid content recommendation system that shows contextual content in the sidepanel.

### Dual Matching System

Content can match via **either or both**:

1. **Tag-Based Matching**: Tag rules evaluate conditions and output tags. Content with matching tags is shown.
2. **Direct Conditions**: Each content item can have its own conditions, evaluated directly against record properties.

Content shows if EITHER method matches (OR logic between them).

### Key Files

| File | Purpose |
|------|---------|
| `lib/content-recommendations.js` | ContentRecommendationEngine class |
| `admin/pages/content.html` | Admin page (Assets + Tags tabs) |
| `admin/pages/content.js` | Admin logic for content/tag CRUD |
| `supabase/migrations/038_content_recommendations.sql` | Database schema |

### Data Flow

```
Page Load
    ↓
background.js fetches tag_rules, content_tags, recommended_content
    ↓
content.js stores data, initializes ContentRecommendationEngine
    ↓
Sidepanel sends getMatchingCards message
    ↓
content.js evaluates tag rules + direct conditions
    ↓
Returns matching recommendations to sidepanel
    ↓
Sidepanel renders "Recommended Content" card
```

### ContentRecommendationEngine Methods

- `getActiveTags(tagRules, properties, context)` - Evaluate tag rules, return active tag IDs
- `matchesTags(content, activeTags)` - Check if content has any matching tags
- `matchesDirectConditions(content, properties, context)` - Evaluate content's own conditions
- `getMatchingContent(content, activeTags, properties, context)` - Filter and sort recommendations
- `getRecommendations(data, properties, context)` - Main entry point

---

## HubSpot List Membership Conditions (v2.16.0+)

Enables conditions based on HubSpot list/segment membership (e.g., "Show when contact is member of VIP Customers list").

### How It Works

1. **Sync Lists**: Admin syncs lists from HubSpot via Settings page → "Sync Lists" button
2. **Create Condition**: In play/banner rules, select "Is member of list" operator and pick a list from dropdown
3. **Runtime Evaluation**: On page load, extension fetches record's list memberships and injects as `_list_memberships` virtual property

### Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/040_hubspot_lists.sql` | Database table for synced list metadata |
| `admin/hubspot.js` | `getLists()`, `getRecordListMemberships()` API methods |
| `admin/supabase.js` | `getHubSpotLists()`, `saveHubSpotLists()` CRUD |
| `admin/pages/settings.js` | `syncHubSpotLists()` sync flow |
| `admin/shared.js` | List operators + list selector dropdown UI |
| `background/background.js` | `getListMemberships` handler with 5-min cache |
| `content/content.js` | `fetchListMemberships()` injection |
| `lib/rules-engine.js` | `is_member_of_list`, `is_not_member_of_list` operators |

### HubSpot API Endpoints

- `POST /crm/v3/lists/search` - Fetch all lists (requires `crm.lists.read` scope)
- `GET /crm/v3/lists/records/{objectTypeId}/{recordId}/memberships` - Get record's list memberships

### Object Type IDs

| Type | ID |
|------|-----|
| Contact | `0-1` |
| Company | `0-2` |
| Deal | `0-3` |
| Ticket | `0-5` |

### Caching Strategy

- **List metadata**: Stored in `hubspot_lists` table, refreshed on-demand via Settings
- **Record memberships**: Cached in `chrome.storage.local` with 5-minute TTL

---

*Last updated: December 2025 (v2.16.0)*
