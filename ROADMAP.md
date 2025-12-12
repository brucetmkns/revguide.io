# Product Roadmap

This document outlines the product roadmap for HubSpot Helper, from current Chrome extension to full SaaS platform.

---

## Current State: v1.9.3 (Chrome Extension) - MVP BETA READY

A fully functional Chrome extension with local storage, ready for beta testers.

### Wiki Tooltip Caching (v1.9.3) - NEW
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

## MVP Beta Release Checklist

Ready for beta testers! The extension is feature-complete for the initial release.

### Core Features (Complete)
- [x] Banners with conditions and rich text
- [x] Plays with text, media, and editable field sections
- [x] Wiki tooltips with HubSpot field import
- [x] Chrome Side Panel for plays
- [x] Multi-page admin panel with onboarding
- [x] Admin edit links for quick content updates
- [x] Import/Export for backup and sharing
- [x] HubSpot API integration

### Beta Testing Focus Areas
- [ ] Onboarding flow clarity
- [ ] Performance on large record counts
- [ ] Wiki tooltip reliability across HubSpot pages
- [ ] Editable fields save functionality
- [ ] Cross-browser compatibility (Chrome/Edge)

### Known Limitations (Document for Beta Users)
1. **Local storage only** - Data doesn't sync between browsers/devices
2. **Manual sharing** - Use Export/Import to share configurations
3. **API token required** - For property dropdowns and field editing
4. **Chrome/Edge only** - No Firefox support yet

### Pre-Launch Tasks
- [ ] Create beta tester installation guide
- [ ] Set up feedback collection (GitHub Issues or form)
- [ ] Prepare sample content packs for testing
- [ ] Document common HubSpot API scope requirements

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
- [ ] In-app library browser in Admin Panel
- [ ] Preview pack contents before downloading
- [ ] One-click import of entire packs
- [ ] Selective import (choose specific entries)
- [ ] Version tracking for pack updates

#### Pack Management
- [ ] Merge with existing wiki entries (skip duplicates)
- [ ] Option to overwrite or keep existing definitions
- [ ] Track which entries came from packs
- [ ] Notification when pack updates are available

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
  "author": "HubSpot Helper",
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
| Database | Supabase (Postgres) | Planned |
| Authentication | Supabase Auth | Planned |
| API | Supabase Edge Functions | Planned |
| Web Dashboard | Next.js on Vercel | Planned |
| Payments | Stripe | Planned |

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
- [ ] Sign up with email or Google OAuth
- [ ] Organization auto-created on first sign-up
- [ ] Onboarding wizard for HubSpot API token setup
- [ ] Extension login flow (redirect to web, store token)

#### Team Management
- [ ] Invite team members by email
- [ ] Role-based permissions:
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

## Phase 3: Multi-Portal for Consultants

**Goal:** Enable HubSpot consultants/agencies to manage multiple client portals with shared template libraries.

### 3.1 Enhanced Data Model

```
accounts (new)
├── id (uuid)
├── name
├── type (direct | consultant)
└── created_at

organizations (updated)
├── account_id (fk) ← NEW
├── hubspot_portal_id ← NEW
└── ... existing fields

library_templates (new)
├── id (uuid)
├── account_id (fk)
├── type (rule | card | presentation)
├── name
├── content (jsonb)
└── created_at

organization_content (new)
├── id (uuid)
├── organization_id (fk)
├── template_id (fk, nullable)
├── type
├── content (jsonb)
├── overrides (jsonb)
└── is_linked (boolean)
```

### 3.2 Features

#### Account Types
- [ ] **Direct accounts**: Single organization (Phase 2 behavior)
- [ ] **Consultant accounts**: Multiple organizations under one account

#### Multi-Organization Management
- [ ] Switch between client organizations in dashboard
- [ ] Organization selector in extension (auto-detect by portal ID)
- [ ] Per-organization HubSpot API tokens
- [ ] Aggregate analytics across organizations

#### Template Library
- [ ] Create templates at account level
- [ ] Push templates to selected organizations
- [ ] Template linking: changes propagate automatically
- [ ] Per-org overrides without breaking link
- [ ] Unlink to make independent copy

#### Portal Auto-Detection
- [ ] Extract HubSpot portal ID from URL
- [ ] Match portal ID to organization
- [ ] Load correct org's content automatically
- [ ] Handle unlinked portals gracefully

#### Consultant Dashboard
- [ ] Client overview with content counts
- [ ] Bulk operations across organizations
- [ ] Template usage analytics
- [ ] White-label option (custom branding)

### 3.3 Pricing

| Plan | Price | Includes |
|------|-------|----------|
| Team | $29/mo | 1 organization, unlimited users |
| Consultant | $99/mo | 5 organizations, template library |
| Agency | $249/mo | 20 organizations, white-label, priority support |
| Enterprise | Custom | Unlimited orgs, SSO, dedicated support |

---

## Phase 4: Advanced Features (Future)

### AI-Driven Field Suggestions (Conversational CRM Updates)

**Goal:** Enable users to chat with the sidepanel and have AI identify which HubSpot fields should be updated based on their conversation.

#### User Flow
1. User interacts with the sidepanel (chat/conversation)
2. AI analyzes the conversation context and current record state
3. AI identifies relevant fields that should be updated (e.g., "Based on our conversation, it sounds like we should update these 4 fields:")
4. User reviews suggested field updates with pre-filled values
5. User clicks "Yes, update these" to save all changes to HubSpot

#### Features
- [ ] Chat interface in sidepanel
- [ ] AI context analysis (conversation + current record properties)
- [ ] Smart field detection from conversation (e.g., "they mentioned closing next week" → closedate)
- [ ] Confidence scoring for suggestions
- [ ] Batch field update confirmation UI
- [ ] Learning from user corrections to improve suggestions

#### Technical Requirements
- [ ] LLM integration (Claude/OpenAI API)
- [ ] Conversation history storage
- [ ] Field mapping intelligence
- [ ] Property type awareness (dates, numbers, picklists)
- [ ] Privacy controls for conversation data

#### Example Interaction
```
User: "Had a great call with Acme Corp. They're interested in the Enterprise plan,
       budget is around $50k, and they want to close by end of Q1."

AI: "Great call! Based on our conversation, I can update these fields:
     • Amount: $50,000
     • Deal Stage: Qualified to Buy
     • Close Date: March 31, 2025
     • Notes: Great call - interested in Enterprise plan

     Would you like me to save these to HubSpot?"

User: [Clicks "Yes, Update"]
```

---

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

### Integrations
- [ ] Slack notifications on banner display
- [ ] Webhook support for custom integrations
- [ ] Zapier/Make integration
- [ ] HubSpot custom cards (CRM card API)
- [ ] Salesforce support (Phase 4?)

### Enterprise Features
- [ ] SSO (SAML, OKTA)
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
| Phase 3.3 | Consultant dashboard | 1 week |
| **Phase 3 Total** | **Consultant Features** | **3-4 weeks** |

---

## Completed Features

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
- [ ] 10 consultant accounts
- [ ] 50+ organizations under consultant accounts
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
