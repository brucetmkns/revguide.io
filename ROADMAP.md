# Product Roadmap

This document outlines the product roadmap for RevGuide, from current Chrome extension to full SaaS platform.

---

## Current State: v2.4.0 (Shareable Invite Links)

A fully functional SaaS web application with Chrome extension, featuring direct HubSpot OAuth integration, Google and Microsoft SSO for passwordless authentication, **shareable invite links for team onboarding**, team management with role-based access control, user settings management, proper database security, reliable data persistence, and a dedicated Partner Account system for agencies/freelancers managing multiple client portals.

### Shareable Invite Links (v2.4.0)
- **Create Invite Links**: Admins/Partners can create reusable links from Settings > Team Members
- **Configurable Limits**: Links have max signup limit (default: 10) and 7-day expiry
- **Public Join Page**: `/join/:code` page for self-service signups
- **Auto-join as Viewer**: New users automatically join the organization with Viewer role
- **Link Management**: Copy, view usage stats, and revoke links from settings

### SSO Authentication (v2.3.0)
- **Google SSO**: One-click sign-in with Google accounts
- **Microsoft SSO**: Sign-in with work/school or personal Microsoft accounts
- **Extension Sidebar SSO**: Direct SSO buttons in the Chrome extension sidebar
- **Auto-invite acceptance**: OAuth users with pending invitations are automatically added to teams
- **Streamlined onboarding**: Install extension → Click SSO → Ready to use

### Partner Account System (v2.8.0+)
- **Partner Account Type**: New `account_type` column (`standard` or `partner`) with dedicated `partner` role
- **Partner Dashboard**: Dedicated `/partner` page for managing clients, libraries, and access requests
- **Agency Organization**: Partners have their own `home_organization_id` separate from client portals
- **Multiple Signup Paths**: Invited by client, convert existing account, or new partner signup
- **Auto-connect**: Existing partners automatically added when invited to new client orgs
- **Database Migrations**: `021_partner_accounts.sql` and `023_rename_consultant_to_partner.sql`
- **Terminology Rename** (v2.2.0): All "Consultant" terminology renamed to "Partner" throughout codebase
- **Partner Join Notification** (v2.2.0): Email sent to admins when partner accepts invitation

### Role-Based Access Control (v2.5.3)
- **Complete role hierarchy**: Owner > Admin > Editor > Viewer > Partner (external)
- **Viewer role**: Can view all content, cannot edit/create/delete
- **Editor role**: Can create/edit/delete content, cannot manage team
- **Admin/Owner roles**: Full access including team management
- **RLS policies**: Database-level enforcement of role permissions
- **View-only UI**: Viewers see read-only interface with edit controls hidden

### Team Invitation System (v2.5.2)
- **Email invitations**: Invite team members with role selection (viewer/editor/admin)
- **Streamlined signup**: Invited users skip email confirmation, pre-filled forms
- **Invitation acceptance**: Token-based secure invitation flow
- **Worker API**: Cloudflare Worker handles invite emails and signup

### Data Persistence Fix (v2.2.1)
- **Fixed critical data persistence bug** - Wiki, banners, and plays now properly save to Supabase
- **Snake_case/camelCase mapping** - Proper conversion between frontend (camelCase) and database (snake_case)
- **Direct database operations** - Save functions now write directly to Supabase instead of just cache
- **Database schema updates** - Added missing columns to plays, banners, and wiki_entries tables

### Security Hardening (v2.1.2)
- **Fixed Row Level Security (RLS) policies** - Re-enabled RLS with proper SECURITY DEFINER helper function
- **Proper data isolation** - Users can only access their own organization's data
- **No circular dependencies** - `get_user_organization_id()` function breaks RLS policy loops

### User Settings (v2.1.1)
- **Account Settings card** in Settings page with:
  - Editable user name (stored in `users` table)
  - Read-only email display (from Supabase auth)
  - Editable company/organization name (stored in `organizations` table)
- **HubSpot connection loading state** with spinner animation
- **Fixed OAuth org naming** to not use portal domains like "app.hubspot.com"

### Direct HubSpot OAuth (v2.1.0)
- **Replaced Nango** with direct HubSpot OAuth via Supabase edge functions
- **Secure token storage** with pgcrypto encryption in database
- **Automatic token refresh** before expiry
- **Field import** now works in web app via OAuth proxy

### Rebrand to RevGuide (v1.9.7)
- **Product renamed** from "HubSpot Helper" to "RevGuide"
- **New API endpoint**: `https://revguide-api.revguide.workers.dev`
- **Updated branding** across all UI, documentation, and code

### HubSpot Import Enhancements (v1.9.5)
- **Tree-structured import**: Properties grouped by HubSpot property groups with collapsible nodes
- **Group-level selection**: Select/deselect all fields in a property group at once
- **Search across groups**: Filter by field name, label, or property group name
- **Nested dropdown values**: Import dropdown options as child wiki entries under their property
- **Parent-child relationships**: Child entries linked via `parentId` for true hierarchy
- **Wiki tree nesting**: Entries with children display as expandable nodes in navigation

### Related Play for Banners (v1.9.4)
- **Link plays to banners**: Associate any play with a banner via searchable dropdown
- **"Open Play" button**: Appears on banners with a linked play
- **Smart play loading**: Plays appear in sidepanel even if they don't match current record's rules
- **Seamless UX**: Clicking "Open Play" opens the sidepanel, navigates to the play, and highlights it

### Wiki Tooltip Caching (v1.9.3)
- **Pre-built term map cache**: Term map built when wiki entries are saved, not on every page load
- **Session storage layer**: Cache stored in sessionStorage for instant subsequent page loads
- **Adaptive scan timing**: Immediate first pass, smart follow-up only when HubSpot is loading
- **Improved performance**: Significantly faster tooltip initialization with 1000+ wiki entries

### Tab Visibility & Embed Banner Fix (v1.9.2)
- **Tab visibility for banners**: Show banners on specific tabs (1, 2, 3, etc.) or all tabs
- **Fixed embed banners**: Now render as collapsible media cards with iframe embedding
- **Flexible tab input**: Number field instead of dropdown for any tab position

### Admin Edit Links & Tooltip Redesign (v1.9.1)
- **"Edit in Admin Panel" links** on banners, plays, and wiki tooltips
- **Deep linking** to specific assets via `?edit=<assetId>` URL parameter
- **Toggle setting** to show/hide admin links for end users
- **Wiki tooltip redesign** - Friendly rounded design with category-colored icons, split footer (Edit/Learn more)

### Editable HubSpot Fields in Plays (v1.9.0)
- **Fields section type** in plays alongside Text and Media
- **Property selector** with searchable dropdown in admin panel
- **Smart field rendering** based on HubSpot property types:
  - Dropdowns for enumeration/select properties
  - Date pickers for date fields
  - Checkboxes for boolean fields
  - Number inputs for numeric fields
  - Text inputs for string fields
- **Current values pre-populated** from HubSpot API
- **Required field validation** with visual indicators
- **"Save to HubSpot" button** updates record via CRM API
- **Auto-refresh** page after successful save
- **User-friendly error messages** for permission/scope issues

### Multi-Page Admin Panel (v1.7.0+)
- **Standalone pages** for each section (Home, Banners, Plays, Wiki, Settings)
- **Shared utilities** via `AdminShared` global (sidebar, storage, conditions, rich text, confirmation dialogs)
- **Design system** with CSS variables, Manrope font, and component library
- **Unsaved changes protection** with confirmation dialog (Save/Discard/Cancel)

### Homepage & Onboarding
- 5-step progress tracking (Install, API, Wiki, Banners, Plays)
- "Share with Team" button to copy installation instructions
- Quick stats dashboard showing content counts
- Content Libraries promo (coming soon)

### Banners (v1.8.2 - includes former Media)
- **Tabbed editor interface**: Content, Rules, Usage tabs
- Property-based conditions with **rich text messages**
- **Embed banner type** for media content (Google Slides, YouTube, Loom, Vimeo, OneDrive, SharePoint)
- AND/OR logic, priority ordering
- **"Display on all records"** option

### Plays (Battle Cards) - Enhanced in v1.8.0
- **Tabbed editor interface**: Content, Rules, Usage tabs (matching wiki layout)
- **Chrome Side Panel** (native sidebar, persists across pages)
- **Media sections**: Embed Loom, YouTube, Vimeo, Google Drive videos directly in plays
- **Drag-to-reorder sections**: Grab handle + insert buttons between sections
- Expandable sections with external links
- Object type filtering and conditional display

### Wiki / Field Glossary (v1.7.1)
- **Two-pane layout**: Navigation tree (left) + Detail card (right)
- **Tabbed card interface**: Content, Rules, Usage tabs
- **Flexible entry structure** (v1.7.1):
  - `title`: Display name shown in UI
  - `trigger`: Optional text to match for tooltips
  - Entries without triggers are glossary-only (no tooltips)
- Hierarchical organization: Object > Property Group > Entry > Values
- Import fields directly from HubSpot with metadata
- Define cards for individual property values
- Toggle switches for enabling/disabling entries
- Contextual tooltips on HubSpot property labels

### Technical
- **Modular content scripts** (banners, wiki, sidepanel, presentations modules)
- HubSpot API integration for property fetching
- Import/Export for backup
- **Modern UI** with Manrope font, #b2ef63 accent, and SVG icons

**Limitation:** Data stored locally per browser, no team sharing.

---

## Beta Release - Ready for Testers! ✅

**Status:** Ready for public beta (December 2024)

The extension is feature-complete and prepared for beta testers with full infrastructure in place.

### Core Features (Complete)
- [x] Banners with conditions and rich text
- [x] Plays with text, media, and editable field sections
- [x] Wiki tooltips with HubSpot field import
- [x] Chrome Side Panel for plays
- [x] Multi-page admin panel with onboarding
- [x] Admin edit links for quick content updates
- [x] Import/Export for backup and sharing
- [x] Direct HubSpot OAuth integration (no API tokens needed)
- [x] Team management with database-backed invitations
- [x] Row Level Security for data isolation

### Infrastructure (Complete)
- [x] CI/CD pipeline via GitHub Actions
- [x] Automated testing (23 tests for conditions, storage)
- [x] Error monitoring documentation (Sentry)
- [x] Environment variables documented
- [x] Deployment guide (Supabase, Vercel, Cloudflare)
- [x] Privacy policy for Chrome Web Store
- [x] Chrome Web Store submission guide
- [x] Beta tester documentation

### Beta Testing Focus Areas
- [ ] Onboarding flow clarity
- [ ] Performance on large record counts
- [ ] Wiki tooltip reliability across HubSpot pages
- [ ] Editable fields save functionality
- [ ] Cross-browser compatibility (Chrome/Edge)

### Documentation
| Document | Purpose |
|----------|---------|
| `docs/DEPLOYMENT.md` | Production deployment steps |
| `docs/ERROR_MONITORING.md` | Sentry setup guide |
| `docs/PRIVACY_POLICY.md` | Chrome Web Store privacy policy |
| `docs/CHROME_WEB_STORE.md` | Store submission guide |
| `docs/BETA_PROGRAM.md` | Beta tester onboarding |
| `docs/ARCHITECTURE.md` | Codebase information architecture |

### Known Limitations (Documented for Beta Users)
1. **Chrome/Edge only** - No Firefox support yet
2. **HubSpot OAuth required** - For property access and field editing
3. **Desktop only** - Mobile/tablet not optimized

---

## Privacy & Security

### Data Handling

| Data Type | Storage Location | Shared Externally? |
|-----------|------------------|-------------------|
| Extension settings | Chrome local storage | No |
| Plays, Banners, Wiki | Chrome local storage | No |
| HubSpot API token | Chrome local storage | No (only sent to HubSpot) |
| Record properties | In-memory only | No |

**Key Points:**
- All configuration data stays in the user's browser
- No data is sent to third-party servers
- HubSpot API calls go directly to `api.hubapi.com`
- No analytics or telemetry collected by the extension

### HubSpot API Permissions

The extension uses HubSpot Private App tokens which require specific scopes:

#### Read Scopes (Required for core functionality)
| Scope | Purpose |
|-------|---------|
| `crm.objects.contacts.read` | Read contact properties for rules/conditions |
| `crm.objects.companies.read` | Read company properties for rules/conditions |
| `crm.objects.deals.read` | Read deal properties for rules/conditions |
| `crm.objects.tickets.read` | Read ticket properties for rules/conditions |
| `crm.schemas.contacts.read` | Fetch contact property definitions |
| `crm.schemas.companies.read` | Fetch company property definitions |
| `crm.schemas.deals.read` | Fetch deal property definitions |

#### Write Scopes (Required for Editable Fields feature)
| Scope | Purpose |
|-------|---------|
| `crm.objects.contacts.write` | Update contact fields from sidebar |
| `crm.objects.companies.write` | Update company fields from sidebar |
| `crm.objects.deals.write` | Update deal fields from sidebar |
| `crm.objects.tickets.write` | Update ticket fields from sidebar |

**Note:** Write scopes are only needed if using the Editable Fields feature in Plays. Users who only need read-only functionality (Banners, Wiki tooltips, read-only Plays) do not need write permissions.

### Security Considerations

#### Token Security
- API tokens are stored in Chrome's `chrome.storage.local`
- Tokens are NOT synced across devices (not in `chrome.storage.sync`)
- Tokens are only accessible to the extension itself
- **Risk:** If someone gains access to the browser, they could extract the token

#### Scope of Access
- Write access to CRM objects is powerful
- A compromised token could modify or delete records
- **Mitigation:** Users should use tokens with minimum required scopes

#### Team Deployment Recommendations
1. **Principle of Least Privilege:** Only grant scopes needed for actual use
2. **Token Rotation:** Periodically rotate Private App tokens
3. **Audit Logging:** HubSpot logs all API modifications - review periodically
4. **User Education:** Train users not to share tokens or install on shared computers

### Chrome Extension Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Store extension settings and content locally |
| `activeTab` | Access current tab for HubSpot page detection |
| `sidePanel` | Display the Chrome side panel |
| `tabs` | Detect tab changes, refresh page after save |
| `scripting` | Execute page refresh after saving fields |

#### Host Permissions
- `https://*.hubspot.com/*` - Inject content scripts on HubSpot pages
- `https://api.hubapi.com/*` - Make API calls to HubSpot

### Future Security Enhancements (Planned)

- [ ] OAuth flow instead of Private App tokens (more secure, user-scoped)
- [ ] Token encryption at rest
- [ ] Session timeout for sensitive operations
- [ ] Audit log viewer in admin panel
- [ ] Per-user permissions when SaaS version launches
- [ ] **User enumeration prevention** - Password reset always shows "If your email exists, you'll receive a reset link" regardless of whether account exists (prevents attackers from discovering valid accounts)

### Server-Side Rule Evaluation (Privacy Enhancement)

**Goal:** Move rule evaluation from the Chrome extension to a Supabase Edge Function, so the extension never directly accesses HubSpot CRM record data.

**Current State:** The Chrome extension fetches HubSpot record properties via `api.hubapi.com` and evaluates rules locally in the browser. This is accurate and we don't store CRM data, but the extension *does* access it.

**Proposed State:** The extension sends `{ portalId, objectType, recordId }` to an edge function, which fetches properties server-side, evaluates rules, and returns only the IDs of matching banners/plays. The extension never sees CRM data.

**Privacy Benefit:** Enables the claim "Chrome Extension does not access HubSpot CRM data" (matching competitor positioning like Supered).

**Effort Estimate:** 8-12 hours

**Implementation Details:** See `docs/TECHNICAL_DEBT.md`

**Status:** Deferred - Current privacy policy is accurate ("we access but don't store")

---

## Phase 1: Content Libraries

**Goal:** Enable users to quickly populate their wiki with pre-built starter packs.

### 1.1 Starter Packs

Pre-configured wiki content packs that users can download and import:

| Pack | Description | Entries |
|------|-------------|---------|
| HubSpot Basics | Core HubSpot terminology and concepts | ~50 |
| Sales Pipeline | Standard sales stages and deal properties | ~30 |
| Contact Properties | Common contact fields and lifecycle stages | ~40 |
| Marketing Terms | Marketing-specific terminology | ~25 |
| Service & Tickets | Support terminology and ticket stages | ~20 |

### 1.2 Features

#### Content Library Browser
- [x] In-app library browser in Admin Panel
- [x] Preview pack contents before downloading
- [x] One-click import of entire packs
- [x] Selective import (choose specific entries)
- [x] Version tracking for pack updates

#### Pack Management
- [x] Merge with existing wiki entries (skip duplicates)
- [x] Option to overwrite or keep existing definitions
- [x] Track which entries came from packs
- [x] Notification when pack updates are available

#### Community Packs (Future)
- [ ] User-submitted content packs
- [ ] Rating and review system
- [ ] Industry-specific packs (Real Estate, SaaS, etc.)
- [ ] Company-specific packs (share within organization)

### 1.3 Technical Implementation

```
content-library/
├── packs/
│   ├── hubspot-basics.json
│   ├── sales-pipeline.json
│   ├── contact-properties.json
│   ├── marketing-terms.json
│   └── service-tickets.json
├── manifest.json (pack index)
└── README.md
```

**Pack Format:**
```json
{
  "id": "sales-pipeline",
  "name": "Sales Pipeline Starter Pack",
  "version": "1.0.0",
  "description": "Standard sales stages, deal properties, and pipeline terminology",
  "author": "RevGuide",
  "entries": [
    {
      "term": "Deal Stage",
      "category": "field",
      "objectType": "deals",
      "propertyGroup": "Deal Information",
      "definition": "<p>The current stage of a deal in your sales pipeline...</p>",
      "propertyValues": [
        { "value": "appointmentscheduled", "label": "Appointment Scheduled", "definition": "..." },
        { "value": "qualifiedtobuy", "label": "Qualified to Buy", "definition": "..." }
      ]
    }
  ]
}
```

---

## Phase 2: SaaS MVP

**Goal:** Enable team collaboration with shared content libraries.

### 2.1 Backend Infrastructure

| Component | Technology | Status |
|-----------|------------|--------|
| Database | Supabase (Postgres) | **Complete** |
| Authentication | Supabase Auth (Magic Link + Google OAuth) | **Complete** |
| Email | Resend SMTP with custom domain | **Complete** |
| Web Dashboard | Static HTML on Vercel | **Complete** |
| Domain | app.revguide.io | **Complete** |
| HubSpot OAuth | Supabase Edge Functions | **Complete** |
| Payments | Stripe | Planned |

### 2.1.1 Completed: Web App Deployment (December 2025)

**Live at:** [app.revguide.io](https://app.revguide.io)

**Authentication Setup:**
- Supabase project configured with Magic Link authentication
- Google OAuth provider enabled
- Custom SMTP via Resend for branded emails from `@revguide.io`
- Email templates customized with RevGuide branding (lime green #b2ef63, Manrope font)

**Email Templates Configured:**
- Magic Link (sign in)
- Confirm Signup (new users)
- Invite User (team invites)
- Reset Password

**Hosting Setup:**
- Vercel deployment via GitHub integration
- Custom domain `app.revguide.io` with DNS (CNAME to Vercel)
- Clean URLs configured via `vercel.json` rewrites:
  - `/login` → `/admin/pages/login.html`
  - `/signup` → `/admin/pages/signup.html`
  - `/home` → `/admin/pages/home.html`
  - `/wiki`, `/banners`, `/plays`, `/libraries`, `/settings`

**Context Detection:**
- Admin panel detects web vs extension context
- Uses Supabase auth in web context
- Uses chrome.storage in extension context
- Seamless experience in both environments

### 2.2 Data Model

```
organizations
├── id (uuid)
├── name
├── created_at
└── subscription_status

users
├── id (uuid)
├── email
├── name
├── organization_id (fk)
├── role (admin | editor | viewer)
└── created_at

rules
├── id (uuid)
├── organization_id (fk)
├── created_by (fk)
├── name, title, message, type
├── conditions (jsonb)
├── logic (AND | OR)
├── enabled
└── created_at, updated_at

battle_cards
├── id (uuid)
├── organization_id (fk)
├── created_by (fk)
├── name, card_type, subtitle
├── link
├── sections (jsonb)
├── conditions (jsonb)
└── created_at, updated_at

presentations
├── id (uuid)
├── organization_id (fk)
├── created_by (fk)
├── name, description
├── url, embed_url
├── conditions (jsonb)
└── created_at, updated_at
```

### 2.3 Features

#### Authentication & Onboarding
- [x] Sign up with email (Magic Link)
- [x] Sign in with Google OAuth
- [x] Sign in with Microsoft/Azure AD OAuth
- [x] SSO buttons in Chrome extension sidebar (direct OAuth flow)
- [x] Auto-accept pending invitations for OAuth users
- [x] Custom branded email templates via Resend SMTP
- [x] Extension login flow (redirect to web, store token)
- [ ] Organization auto-created on first sign-up
- [ ] Onboarding wizard for HubSpot API token setup

#### Team Management
- [x] Invite team members by email
- [x] Role-based permissions:
  - **Owner**: Full access, manage team, billing, transfer ownership
  - **Admin**: Full access, manage team, billing
  - **Editor**: Create/edit/delete content
  - **Viewer**: Use extension, cannot edit
- [ ] Remove team members
- [ ] Transfer ownership

#### Cloud Sync
- [ ] Replace chrome.storage.local with API calls
- [ ] Sync rules, cards, presentations on extension load
- [ ] Real-time updates via Supabase subscriptions
- [ ] Offline fallback with local cache
- [ ] Conflict resolution (server wins)

#### Web Dashboard
- [ ] Same functionality as current admin panel
- [ ] Team management page
- [ ] Activity log (who changed what)
- [ ] Organization settings

#### Billing
- [ ] Stripe integration
- [ ] Single plan: $29/org/month
- [ ] 14-day free trial
- [ ] Billing portal for self-service

### 2.4 Technical Changes to Extension

```
Current Flow:
Extension → chrome.storage.local

New Flow:
Extension → Background.js → Supabase API → Postgres
                ↓
         Local Cache (fallback)
```

**Files to modify:**
- `background.js`: Add auth token management, API calls
- `content.js`: Load from API instead of local storage
- `admin.js`: Redirect to web dashboard (or API calls)
- `sidepanel.js`: Show login state, link to web dashboard

### 2.5 Cost Estimate

| Users | Monthly Cost | Revenue (@ $29/org) | Net |
|-------|--------------|---------------------|-----|
| 0-100 | $21 | - | -$21 |
| 10 orgs | $21 | $290 | +$257 |
| 50 orgs | $46 | $1,450 | +$1,346 |
| 100 orgs | $46 | $2,900 | +$2,738 |

**Break-even: 2 paying organizations**

---

## Partner Account System (v2.8.0+) ✅ IMPLEMENTED

**Goal:** Improve the partner invitation and onboarding flow with a dedicated Partner Account system.

### What Was Implemented

#### Partner Account Type
- [x] New `account_type` column: `'standard'` or `'partner'`
- [x] `home_organization_id` tracks partner's agency organization
- [x] Partners have their own agency org plus `partner` role in client organizations
- [x] Dedicated Partner Dashboard page (`/partner`) for client management

#### Partner Signup Flow
- [x] Detect partner invitation type in signup flow (`role=partner` or `invitation_type=partner`)
- [x] Partner-specific messaging and editable "Agency Name" field
- [x] Partner signup creates: auth user + agency org + user profile + client org membership
- [x] Existing partners auto-connected when invited (skip signup flow)

#### Admin Conversion to Partner
- [x] "Partner Account" section in Settings page for admins
- [x] "Become a Partner" option creates agency org, updates account_type
- [x] "Sign Up with a New Account" signs out and redirects to partner signup

#### New Partner Signup (Without Invitation)
- [x] `/signup?new_partner=true` shows partner-specific UI
- [x] Creates auth user, agency organization, and partner profile
- [x] API supports signup with or without invitation token
- [x] Automatic slug generation for agency organizations

#### Partner Dashboard Features
- [x] Stats overview: Client count, Library count, Pending requests
- [x] My Clients tab: Grid of client portals with "Manage Portal" buttons
- [x] My Libraries tab: View and manage reusable content libraries
- [x] Access Requests tab: Track pending access requests

#### Navigation Updates
- [x] Partner Dashboard replaces legacy Clients page for partners
- [x] Non-partners with multiple orgs retain existing behavior

### Future Enhancements (Not Yet Implemented)

#### Partner Creating Client Portals
- [ ] "Create Client Portal" option in Partner Dashboard
- [ ] Partner enters client org name, creates new organization
- [ ] Partner automatically added with `partner` role
- [ ] Optional: Send invite email to client admin to claim their org

#### Secure Access Requests (v2.8.6) - COMPLETE
- [x] Email-based request flow (enter client admin email)
- [x] System validates admin exists before sending request
- [x] Admin receives notification and can approve/decline
- [x] User enumeration prevention (always shows neutral success message)
- [x] Re-request after decline updates existing row

#### Partner Join Notification (v2.2.0) - COMPLETE
- [x] Email notification sent to org admins when partner accepts invitation
- [x] Fire-and-forget async notification (non-blocking)
- [x] API endpoint `/api/notify-partner-joined` in Cloudflare Worker

---

## Phase 3: Multi-Portal for Partners (Local)

**Goal:** Enable HubSpot partners/agencies to manage multiple client portals with reusable content libraries, all within the Chrome extension (before SaaS).

**Full Implementation Details:** See [docs/MULTI_PORTAL_DEV.md](docs/MULTI_PORTAL_DEV.md)

### 3.1 Core Concept: Partners as Library Authors

Rather than complex linked/synced content, partners create their own libraries using the existing library infrastructure. Libraries can be installed (copied) to any portal on demand.

```
LIBRARIES
├── Pre-built (GitHub) - HubSpot Basics, Sales Pipeline, etc.
└── My Libraries (Partner-created)
    ├── "Agency Standard Playbook"
    └── "SaaS Onboarding Kit"
           ↓
    Install to portal (creates copy)
           ↓
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Portal A   │  │  Portal B   │  │  Portal C   │
│  (copy)     │  │  (copy)     │  │  (empty)    │
└─────────────┘  └─────────────┘  └─────────────┘
```

### 3.2 User Modes

| Mode | Who | Capabilities |
|------|-----|--------------|
| **Partner** (default) | Agency users, freelancers | Portal switcher, My Libraries, create/manage libraries |
| **Single Portal** | End clients, internal teams | One portal only, no switcher, simplified UI |

### 3.3 Implementation Phases

#### Phase 3.1: Portal Detection & Registry
- [ ] Auto-detect portal ID from HubSpot URL
- [ ] Portal registry with name, API token, color identifier
- [ ] Portal selector dropdown in admin panel header
- [ ] Per-portal isolated storage (portalData structure)
- [ ] Migration path for existing users (move to 'default' portal)
- [ ] Content script loads active portal's data

#### Phase 3.2: My Libraries (Partner Library Creation)
- [ ] "My Libraries" section in Libraries page
- [ ] Create library: select items from current portal
- [ ] Edit library: add/remove items, update name/description
- [ ] Library versioning (semver format)
- [ ] Export library to JSON file (backup/sharing)
- [ ] Import library from JSON file
- [ ] Delete library with confirmation

#### Phase 3.3: Install Libraries to Portals
- [ ] Install library to current portal
- [ ] Install to different portal via dropdown
- [ ] Duplicate handling options (skip existing / overwrite)
- [ ] Track installed libraries per portal (version, date)
- [ ] Update detection (compare installed vs library version)
- [ ] Update options: "Add new only" vs "Full sync"
- [ ] Quick setup modal when switching to empty portal

#### Phase 3.4: Single Portal Mode & Polish
- [ ] User mode toggle in Settings
- [ ] Hide portal selector in Single Portal mode
- [ ] Hide My Libraries section in Single Portal mode
- [ ] Storage limit handling (request unlimitedStorage permission)

### 3.4 Data Structure

```javascript
{
  userMode: "partner" | "single_portal",
  activePortalId: "12345678",
  portals: {
    "12345678": { name: "Client A", apiToken: "...", color: "#ff7a59" }
  },
  myLibraries: [
    { id, name, version, content: { wikiEntries, battleCards, rules } }
  ],
  portalData: {
    "12345678": {
      wikiEntries: [...],
      battleCards: [...],
      rules: [...],
      installedLibraries: [{ id, version, installedAt }]
    }
  }
}
```

### 3.5 Key Decisions

- **No live linking** - Libraries are templates; installs create independent copies
- **Updates are explicit** - User chooses when to update, with options for handling conflicts
- **Partner is default** - Single Portal mode is opt-in for simpler use cases
- **Local storage only** - This phase is Chrome extension only (SaaS adds cloud sync later)

---

## Phase 4: AI Chat Assistant

**Goal:** Add an AI-powered Chat tab to the sidepanel for contextual assistance, content recommendations, and conversational field updates.

**Full Implementation Details:** See [docs/AI_CHAT_DEV.md](docs/AI_CHAT_DEV.md)

### 4.1 Core Concept: Hybrid AI + Smart Prompts

The Chat tab provides two types of intelligence:
1. **Smart Prompts** - Automated suggestions based on record analysis (missing fields, matching content)
2. **Conversational AI** - Natural language queries answered by Claude/GPT with knowledge base context

```
┌─────────────────────────────────────────┐
│  Chat                              (3)  │  ← Badge shows suggestions
├─────────────────────────────────────────┤
│  💡 3 suggestions available        ▾    │  ← Collapsible
│  ┌─────────────────────────────────┐    │
│  │ ⚠ Missing: Next Step           │    │
│  │ ⚠ Missing: Close Date          │    │
│  │ 📄 Try: Ultimate Guide to...   │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│                                         │
│  [User bubble] What can I send them?    │
│                                         │
│  [AI bubble] Based on their Casino      │
│  Marketing industry, try the Ultimate   │
│  Guide to Guest Experience...           │
│                                         │
├─────────────────────────────────────────┤
│  [Ask about this record...        ] [➤] │
└─────────────────────────────────────────┘
```

### 4.2 Two-Tier AI System

| Mode | Who Pays | Prompts | Customization |
|------|----------|---------|---------------|
| **RevGuide Credits** | User buys credit packs | Proprietary (hidden) | None |
| **Own API Key** | User's Anthropic/OpenAI bill | Visible/editable | Full |

### 4.3 Features

#### Smart Suggestions (Proactive)
- [ ] Analyze record on Chat tab open
- [ ] Detect missing required fields
- [ ] Recommend content based on industry/stage
- [ ] Identify matching plays from knowledge base
- [ ] Show badge count on Chat tab
- [ ] Collapsible suggestion cards

#### Conversational AI
- [ ] Chat interface with message bubbles
- [ ] Context-aware responses (uses record properties + knowledge base)
- [ ] Content recommendations ("What should I send this client?")
- [ ] Answer questions about the record
- [ ] Natural language field updates

#### Field Updates with Confirmation
- [ ] Parse update intent from conversation
- [ ] Show confirmation modal with field/value list
- [ ] Apply changes via HubSpot API on confirm
- [ ] Auto-refresh page after save

### 4.4 Implementation Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 4.1 | Manifest + AI settings in sidepanel | Planned |
| 4.2 | Background script AI handlers | Planned |
| 4.3 | Chat tab UI + ChatModule class | Planned |
| 4.4 | Smart suggestions system | Planned |
| 4.5 | Field update confirmation flow | Planned |
| 4.6 | Polish (error handling, loading states) | Planned |

### 4.5 Example Interactions

**Content Recommendation:**
```
User: "What info can I send this client?"

AI: "Based on their Casino Marketing industry and Consideration stage,
the Ultimate Guide to Guest Experience would be relevant.
Want me to draft an intro email with the link?"
```

**Field Update:**
```
User: "Update the amount to $75,000"

AI: "I'll update the Amount field to $75,000."

[Confirmation Modal]
Amount → $75,000
[Cancel] [Apply Changes]
```

**Smart Prompt:**
```
Badge: "3 suggestions"
User clicks →

"Acme Corp is missing some key fields:
• Next Step (required for forecasting)
• Close Date (helps with pipeline reports)

Would you like me to suggest values?"
```

### 4.6 Technical Requirements

- [ ] Anthropic API integration (Claude)
- [ ] OpenAI API integration (GPT-4)
- [ ] Bundled proprietary prompts
- [ ] Knowledge base context building
- [ ] Message history management
- [ ] Rate limiting

---

## Phase 5: Advanced Features (Future)

### Analytics & Insights
- [ ] Banner impression tracking
- [ ] Dismissal rate analytics
- [ ] Play open/click tracking
- [ ] Presentation view tracking
- [ ] Export analytics to CSV
- [ ] Dashboard with charts

### Condition Builder Enhancements
- [ ] Date-based conditions (within X days)
- [ ] Relative dates (before/after today)
- [ ] Property value suggestions from HubSpot picklists
- [ ] Nested condition groups (complex AND/OR)
- [ ] Custom formula conditions

### Content Enhancements
- [x] Rich text editor for banner messages *(completed in v1.3.0)*
- [ ] Rich text editor for play sections
- [ ] Card templates marketplace
- [x] Video embeds (Loom, YouTube, Vimeo, Google Drive) *(completed in v1.8.0)*
- [ ] File attachments
- [ ] Version history with rollback

### Admin Panel Improvements
- [ ] **Duplicate trigger word validation** - Warn when saving a wiki entry with a trigger word that already exists
- [ ] Bulk entry management (select multiple, delete, enable/disable)
- [ ] Entry merge tool for consolidating duplicates

### Performance Optimization (Admin Pages)

**Goal:** Improve load times for `/banners`, `/plays`, and `/wiki` pages.

**Full Implementation Details:** See [docs/PERFORMANCE_OPTIMIZATION.md](docs/PERFORMANCE_OPTIMIZATION.md)

| Phase | Description | Effort | Impact |
|-------|-------------|--------|--------|
| 1 | Loading skeletons (perceived performance) | Low | High |
| 2 | Persistent organization ID cache (24hr TTL) | Low | Medium |
| 3 | Pagination (50 items per page) | Medium | High* |
| 4 | Parallel auth + data loading | Medium | Medium |
| 5 | Stale-while-revalidate caching | Medium | High |
| 6 | Database indexing (Supabase) | Low | Variable |

*High impact for organizations with 50+ entries.

**Root Causes Identified:**
- Sequential auth → data loading blocks rendering
- No pagination (full table scans on every load)
- Organization ID lookup requires 2 extra queries
- Short cache TTLs (5-10 min) cause frequent cold loads
- No loading skeleton shows blank screen during load

### UI/UX Enhancements
- [x] Inline sidebar HTML for instant navigation rendering
- [x] **Skeleton loading states for content** - See Performance Optimization above
- [ ] **Collapsible sidebar navigation** - Toggle sidebar to icon-only mode for more content space
- [ ] **Single Page App (SPA) conversion** - Client-side routing for seamless page transitions without full reloads
- [ ] Page transition animations

#### Admin Dashboard Redesign (Draft)
**Status:** Exploration / Not finalized

Design mockups created in `website/admin-redesign.html` (Admin view) and `website/consultant-redesign.html` (Partner/Consultant view). Some elements worth considering:

**Admin Dashboard (`admin-redesign.html`):**
- Collapsible sidebar with localStorage persistence
- Dynamic time-based greeting ("Good morning/afternoon/evening")
- Circular progress ring for onboarding (vs current linear progress bar)
- Recent activity feed with color-coded action types
- Quick actions panel with primary CTA highlighted
- Staggered fade-in animations on page load
- Refined card shadows with hover state reveals

**Partner Dashboard (`consultant-redesign.html`):**
- Portal switcher dropdown with color-coded client portals
- Welcome banner with gradient background and glowing accent
- Client portals grid showing stats per organization
- Access requests panel with inline approve/deny actions
- Partner onboarding timeline (vertical progress line vs checklist)
- "Partner" badge in logo to indicate account type

**Design tokens applied:**
- Primary accent: `#b2ef63`
- Font: Manrope
- Border radius: 12px (cards), 8px (buttons)
- Near-black sidebar: `#0c0c0f`
- Transition easing: `cubic-bezier(0.16, 1, 0.3, 1)`

### Account & Settings
- [x] **User Profile section** - View/edit profile info (name, email display, company name)
- [ ] **Billing management** - View subscription, update payment method, download invoices
- [ ] Account deletion/data export (GDPR compliance)

### Integrations
- [ ] Slack notifications on banner display
- [ ] Webhook support for custom integrations
- [ ] Zapier/Make integration
- [ ] HubSpot custom cards (CRM card API)
- [ ] Salesforce support (Phase 4?)

### Custom Scripts (Extensibility)

**Goal:** Allow power users to extend RevGuide with custom JavaScript for organization-specific integrations.

**Use Case Example:** Alpha wants to overlay a Q360 link next to deal/company/contact names, linking to the corresponding record in their Q360 system.

#### Features
- [ ] "Custom Scripts" section in Settings page
- [ ] Code editor textarea for custom JavaScript
- [ ] Script execution in content script context with access to:
  - `ctx.hubspot` - Current record info (recordType, recordId, recordName, properties)
  - `ctx.overlay()` - Add UI elements near HubSpot elements
  - `ctx.badge()` - Add badges/indicators
- [ ] Enable/disable toggle per script
- [ ] Multiple scripts support (optional)
- [ ] Script validation before save

#### Example Script
```javascript
(function(ctx) {
  const { recordType, recordId, recordName } = ctx.hubspot;

  if (['deal', 'company', 'contact'].includes(recordType)) {
    const q360Url = `https://q360.example.com/${recordType}/${recordId}`;

    ctx.overlay({
      position: 'next-to-title',
      html: `<a href="${q360Url}" target="_blank">View in Q360</a>`
    });
  }
})(RevGuide);
```

#### Implementation Complexity
| Component | Effort | Notes |
|-----------|--------|-------|
| Settings UI (textarea) | Low | Standard settings card pattern |
| Script storage | Low | Add to settings object |
| Context API design | Medium | Define `ctx.hubspot`, `ctx.overlay()`, etc. |
| Safe script execution | Medium | Sandbox considerations |
| Documentation | Low | API reference for script authors |

**Total Estimate:** ~1-2 days of development

### Enterprise Features
- [x] SSO (Google, Microsoft) - *Implemented in v2.3.0*
- [ ] SSO (SAML, OKTA) - *Enterprise single sign-on*
- [ ] Audit logs
- [ ] Custom domains
- [ ] SLA guarantees
- [ ] Dedicated support

---

## Development Timeline

| Phase | Scope | Estimated Effort |
|-------|-------|------------------|
| Phase 1.1 | Content library infrastructure | 1 week |
| Phase 1.2 | Starter pack creation | 1 week |
| Phase 1.3 | Library browser UI | 1 week |
| **Phase 1 Total** | **Content Libraries** | **2-3 weeks** |
| Phase 2.1 | Backend setup (Supabase, auth) | 1 week |
| Phase 2.2 | Web dashboard (Next.js) | 1-2 weeks |
| Phase 2.3 | Extension API integration | 1 week |
| Phase 2.4 | Team management + billing | 1 week |
| **Phase 2 Total** | **SaaS MVP Launch** | **4-5 weeks** |
| Phase 3.1 | Multi-org data model | 1 week |
| Phase 3.2 | Template library | 1-2 weeks |
| Phase 3.3 | Partner dashboard | 1 week |
| **Phase 3 Total** | **Partner Features** | **3-4 weeks** |

---

## Completed Features

### v1.9.5
- [x] **HubSpot Import Tree View with Property Groups**
  - Import modal displays properties grouped by HubSpot property groups
  - Collapsible tree structure matching wiki navigation pattern
  - Group checkboxes to select/deselect all fields at once
  - Search filters across field names, labels, and property group names
  - "Dropdown" badge identifies enumeration/picklist fields
  - Available/total count per group (e.g., "5/8")
- [x] **Import Dropdown Values as Nested Wiki Entries**
  - New checkbox option in import modal footer
  - Each dropdown option becomes a child wiki entry under the property
  - Child entries linked via `parentId` for true parent-child relationship
  - Children appear nested under parent in wiki navigation tree
- [x] **Nested Entry Display in Wiki Tree**
  - Entries with children render as expandable nodes
  - Separate toggle (expand/collapse) from selection (edit entry)
  - Child count badge shown on parent entries
  - Full selection styling (green highlight) for parent entries
- [x] **Removed Property Values Section**
  - Manual Property Values editing removed from Content tab
  - Values shown in Definition section instead
  - Dropdown values should be imported as nested entries

### v1.9.4
- [x] **Related Play for Banners**
  - New "Related Play" dropdown in Banner editor (Content tab)
  - Searchable dropdown showing all plays with names and subtypes
  - "Open Play" button appears on banners with a linked play
  - Smart play loading: Plays appear even if they don't match current record's rules
  - "Related Play from Banner" header for plays opened via banner link
  - Play card auto-expands and highlights with animation
  - Files added/updated: `admin/shared.js`, `admin/pages/banners.html`, `admin/pages/banners.js`, `admin/pages/banners.css`, `content/modules/banners.js`, `content/content.css`, `background/background.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`
  - New data field: `relatedPlayId` on banner/rule objects

### v1.9.3
- [x] **Wiki Tooltip Caching Optimization**
  - Pre-built term map cache: Built when wiki entries are saved, not on every page load
  - Session storage layer: Cache stored in sessionStorage for instant subsequent page loads
  - Adaptive scan timing: Immediate first pass, smart follow-up only when loading detected
  - Files updated: `admin/shared.js`, `lib/storage.js`, `popup/popup.js`, `admin/admin.js`, `background/background.js`, `content/content.js`, `content/modules/wiki.js`
  - New storage keys: `wikiTermMapCache`, `wikiEntriesById`, `wikiCacheVersion`

### v1.9.2
- [x] **Tab Visibility for Banners**
  - New "Show on Tab Position" field in Banner Rules tab
  - Enter tab number (1, 2, 3, etc.) or leave empty for all tabs
  - Content script detects active tab via multiple DOM strategies
- [x] **Fixed Embed Banners**
  - Embed-type banners now render as collapsible media cards
  - Full iframe embedding with fallback UI
  - Collapsible header with toggle button and "Open Media" link

### v1.9.1
- [x] **Admin Edit Links**
  - "Edit in Admin Panel" links on banners, plays, and wiki tooltips
  - Deep linking via `?edit=<assetId>` URL parameter
  - Toggle setting to show/hide for end users
- [x] **Wiki Tooltip Redesign**
  - New "Variation G" design with rounded corners and category-colored icon box
  - Unique icons per category (general, sales, marketing, product, process, field)
  - Split footer with Edit link and Learn more link

### v1.8.2
- [x] **Banner Rules renamed to Banners**
  - Renamed throughout the application for clarity
  - Sidebar navigation, buttons, and messages updated
- [x] **Media consolidated into Banners**
  - Media section removed, functionality moved to Banners
  - New "Embed" banner type for media content
  - Supports Google Slides, YouTube, Loom, Vimeo, OneDrive, SharePoint
- [x] **Banners Editor Tabbed Interface**
  - Content, Rules, Usage tabs matching Plays and Wiki layout
- [x] **Home Page Updates**
  - Removed Media stat card, updated to 5 onboarding steps

### v1.9.0
- [x] **Editable HubSpot Fields in Plays**
  - New "Fields" section type in plays alongside Text and Media
  - Configure editable HubSpot properties per section in admin panel
  - Property selector with searchable dropdown and base64-encoded metadata
  - Mark fields as required with validation
  - Smart field rendering based on HubSpot property types:
    - Select/dropdown for enumeration properties (with all options)
    - Date picker for date fields (auto-converts to/from HubSpot timestamp)
    - Checkbox for boolean fields
    - Number input for numeric fields
    - Textarea for multi-line text
    - Text input for standard strings
  - Current values pre-populated from HubSpot CRM API
  - Case-insensitive property value matching for dropdowns
  - "Save to HubSpot" button with loading/success/error states
  - Auto-refresh HubSpot page after successful save
  - User-friendly error messages for common issues (missing scopes, invalid token, etc.)
- [x] **Generic Record API Fetching**
  - Extended API fetching from Deals-only to all object types
  - Contacts, Companies, Deals, and Tickets now fetch full property values
  - Automatic property list discovery per object type
  - Fallback to default properties if list fetch fails
- [x] **New Chrome Permission**
  - Added `scripting` permission for reliable page refresh after save

### v1.8.1
- [x] **Wiki Tooltip Bug Fixes**
  - Fixed tooltips not showing for migrated entries (`entry.term` → `entry.trigger` references)
  - Fixed temperamental click behavior (opening briefly then closing)
  - Added toggle state tracking for consistent open/close behavior
  - Fixed outside-click handler to recognize wiki icon clicks
- [x] **Developer Documentation**
  - New `LEARNINGS.md` documenting code patterns, gotchas, and debugging tips
  - Updated `HUBSPOT_DOM_STRUCTURE.md` with property label selectors and data attributes

### v1.8.0
- [x] **Plays Editor Tabbed Interface**
  - Redesigned with 3 tabs: Content, Rules, Usage (matching wiki layout)
  - Content tab: Card name, type, subtitle, link, and sections
  - Rules tab: Object type, display conditions, condition builder
  - Usage tab: Coming soon placeholder for analytics
- [x] **Media Sections in Plays**
  - New section type toggle: Text or Media
  - Media sections support embed URLs (Loom, YouTube, Vimeo, Google Drive)
  - Automatic URL conversion to embed format
  - Responsive 16:9 video player in sidepanel
- [x] **Section Reordering & Insertion**
  - Drag-and-drop to reorder sections
  - Drag handle icon on each section
  - "+" insert buttons between sections for precise positioning
  - Visual feedback during drag operations
- [x] **Unsaved Changes Protection**
  - Confirmation dialog when navigating away with unsaved changes
  - Dialog offers Save, Discard, or Cancel options
  - Implemented for Plays, Wiki, and Banner Rules editors
- [x] **Shared Confirmation Dialog Component**
  - `AdminShared.showConfirmDialog()` utility function
  - Customizable title, message, and button labels
  - Keyboard support (Escape to cancel)
- [x] **Tab Styling Improvements**
  - Active tabs now use black text (improved readability)
  - Active tabs have semibold font weight
  - Applied to both Plays and Wiki tab interfaces

### v1.7.1
- [x] **Wiki Entry Structure Refactored**
  - Separated display title from trigger text
  - `title` (required): Display name shown in UI
  - `trigger` (optional): Text to match for tooltips
  - Glossary-only entries (no trigger = no tooltip)
  - Automatic migration of existing entries

### v1.7.0
- [x] **Multi-Page Admin Architecture**
  - Standalone HTML pages for each section (Home, Rules, Plays, Media, Wiki, Settings)
  - `AdminShared` global providing common utilities
  - Design system with CSS variables and component library
- [x] **Wiki Two-Pane Layout**
  - Navigation tree (Object > Property Group > Title)
  - Detail card with tabbed interface (Content, Rules, Usage)
  - Inline editing with unsaved changes tracking
  - Duplicate and delete functionality
- [x] **Sidepanel Tabbed Navigation**
  - Icon-based tabs (Plays + Settings)
  - Dual entry points (toolbar icon vs FAB)
  - Live updates when navigating records
- [x] **Object Type Filtering for Plays**
  - Correct filtering by object type
  - Singular/plural normalization

### v1.6.0
- [x] **Modular Content Script Architecture**
  - Split content.js into feature-specific modules
  - `content/modules/` directory with isolated code
  - Modules: banners.js, wiki.js, sidepanel.js, presentations.js
  - Main content.js as orchestrator

### v1.5.0
- [x] **Install Plugin Onboarding Step**
  - New Step 1 in onboarding with "Share with Team" button
  - Copies installation instructions to clipboard
  - Total onboarding steps now 6: Install, API, Wiki, Rules, Plays, Team
- [x] **Updated Extension Icons**
  - New minimalist target icon with brand colors (#1a2e05 background, #b2ef63 rings)
  - Consistent branding across browser toolbar and sidepanel
- [x] **Wiki Tooltip Reliability**
  - MutationObserver for lazy-loaded cards in left sidebar
  - Multi-pass highlighting for dynamic content
  - Extended CSS selectors for more card types
- [x] **SPA Navigation Support**
  - Tooltips re-apply when navigating between associated records
  - Proper cleanup on URL changes and browser back/forward
- [x] **Media Embed Fixes**
  - Fixed duplicate cards on re-render
  - Fixed collapse/expand behavior
  - Click anywhere on header to toggle
- [x] **Tab Click Performance**
  - Wiki highlights persist during tab switches
  - Only reload on actual navigation events

### v1.4.0
- [x] **Homepage / Onboarding**
  - New home section as the default landing page
  - 5-step onboarding guide: Connect API, Build Wiki, Create Rules, Add Cards, Invite Team
  - Progress bar showing completion status
  - Quick stats showing counts of wiki entries, rules, cards, and presentations
  - Content Libraries promo banner (coming soon feature)
  - Onboarding step status updates automatically as you complete tasks
- [x] **Wiki / Field Glossary** with contextual tooltips
  - Hover over property labels in HubSpot to see definitions
  - Hierarchical table view: Object > Property Group > Property > Values
  - Import fields directly from HubSpot with metadata (object type, property group)
  - Define cards for individual property values (e.g., pipeline stage definitions)
  - Toggle switches for enabling/disabling entries
  - Filter by object type, category, or search term
  - Expand/collapse all groups
  - Edit value cards with rich text definitions
- [x] Wiki only highlights property labels, not arbitrary text in values
- [x] Update existing wiki entries when re-importing from HubSpot

### v1.3.0
- [x] Chrome Side Panel for plays (native sidebar, persists across pages)
- [x] Floating action button (FAB) to open side panel
- [x] Rich text editor for banner messages (bold, italic, underline, lists, links)
- [x] "Display on all records" option for rules, cards, and presentations
- [x] Complete UI rebrand (Manrope font, #b2ef63 accent, SVG icons)
- [x] Branded green buttons (#b2ef63) including in HubSpot pages
- [x] Content script banners styled to match HubSpot's native design
- [x] Custom styled checkboxes with proper alignment
- [x] Banner preview with rich text formatting support

### v1.2.0
- [x] Embedded presentations (Google Slides, PowerPoint)
- [x] "Open in Library" link for presentations
- [x] Fallback UI for failed embeds
- [x] OneDrive/SharePoint URL support

### v1.1.0
- [x] Full admin panel with two-column editor
- [x] Searchable property dropdowns
- [x] AND/OR logic toggle for conditions
- [x] Play link field
- [x] Fetch all deal properties from API
- [x] Property name normalization

### v1.0.0
- [x] Banner rules engine
- [x] Plays with sections
- [x] Chrome extension sidepanel
- [x] HubSpot API integration
- [x] Import/Export functionality

---

## Success Metrics

### Phase 1
- [ ] 100 organizations signed up
- [ ] 20 paying customers
- [ ] <2% monthly churn
- [ ] NPS > 40

### Phase 2
- [ ] 10 partner accounts
- [ ] 50+ organizations under partner accounts
- [ ] Template library adoption > 60%

---

## Open Questions

1. **Pricing validation**: Is $29/mo the right price point?
2. **Free tier**: Should there be a limited free tier for individual users?
3. **HubSpot marketplace**: List on HubSpot App Marketplace?
4. **Mobile**: Any need for mobile-responsive admin?
5. **API access**: Should customers get API access for automation?

---

## Contributing

Have a feature request? Open an issue on GitHub with the `enhancement` label.
