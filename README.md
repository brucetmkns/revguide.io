# RevGuide

A Chrome extension that displays contextual banners, plays, wiki tooltips, and embedded media on HubSpot CRM record pages based on configurable rules.

## Features

### Banners
- Display contextual banners (info, success, warning, error, embed) on HubSpot records
- **Rich text messages** with bold, italic, underline, bullet lists, and links
- **Embed type** for media content (Google Slides, YouTube, Loom, Vimeo, OneDrive, SharePoint)
- **Related Play**: Link a play to any banner; clicking "Open Play" opens the sidepanel directly to that play
- **Tabbed editor interface**: Content, Rules, and Usage tabs
- Configure conditions based on any HubSpot property
- **"Display on all records"** option to show on all records of an object type
- **Tab visibility**: Show banners on specific tabs (1, 2, 3, etc.) or all tabs
- Support for AND/OR logic between conditions
- Priority-based display ordering
- Filter by object type (Contacts, Companies, Deals, Tickets)

### Plays
- Create plays for competitors, objections, tips, processes, and best practices
- **Tabbed editor interface**: Content, Rules, and Usage tabs (matching wiki layout)
- **Chrome Side Panel**: Plays open in Chrome's native sidebar, persisting across HubSpot pages
- **Tabbed navigation**: Plays tab + Settings tab with icon-based UI
- **Dual entry points**:
  - Click the **floating action button (FAB)** on HubSpot pages → Opens to Plays tab
  - Click the **extension icon** in toolbar → Opens to Settings tab (works on any page)
- **Non-HubSpot page support**: Extension icon opens sidepanel with "Not a HubSpot Page" message and quick access buttons to Admin Panel and Settings
- **Smart play loading**: Plays linked to banners appear even if they don't match current record's rules
- **Object type filtering**: Plays display only on matching record types (contact, company, deal, ticket)
- **Live updates**: Sidepanel content updates automatically when navigating between records
- **Media sections**: Embed Loom, YouTube, Vimeo, or Google Drive videos directly in plays
- **Drag-to-reorder**: Reorder sections by dragging; insert new sections between existing ones
- Expandable sections with formatted content
- Link to full external documentation (Google Docs, Notion, etc.)
- **"Display on all records"** option to show on all records of an object type
- Conditional display based on record properties

### Wiki / Field Glossary
- **Contextual tooltips** that appear when clicking wiki icons next to property labels in HubSpot
- **Redesigned tooltip** with friendly rounded design, category-colored icon, and split footer
- **Category icons**: Unique icons for each category (general, sales, marketing, product, process, field)
- **Flexible entry types**: Entries with triggers show tooltips; entries without triggers are glossary-only
- **Separate title and trigger**: Display name can differ from the text that triggers the tooltip
- Import HubSpot fields directly with object type and property group metadata
- **Tree-structured import**: Properties grouped by HubSpot property groups with group-level selection
- **Nested dropdown values**: Import dropdown/enumeration options as child wiki entries under their property
- **Hierarchical organization**: Object > Property Group > Entry > Child Entries
- Rich text definitions with formatting, lists, and links
- Filter and search wiki entries by object type, category, or title
- Two-pane layout with navigation tree and detail card
- **Automatic timestamps**: `createdAt` and `updatedAt` tracked automatically on all entries
- **Content Libraries** (coming soon): Download starter packs to quickly populate your wiki

### Admin Panel
- **Homepage with onboarding guide** to help new users get started
- Progress tracking across 5 setup steps (Install, API, Wiki, Banners, Plays)
- Quick stats dashboard showing content counts
- Full-page admin interface for managing banners, plays, and wiki entries
- **Rich text editor** with formatting toolbar for banner messages and wiki definitions
- Searchable property dropdowns with HubSpot API integration
- Live preview while editing
- Import HubSpot fields to wiki with one click
- Import/Export functionality for backup and sharing
- **Unsaved changes protection**: Confirmation dialog when navigating away with unsaved edits
- **Admin Edit Links**: Click "Edit" on any banner, play, or wiki tooltip to jump directly to its editor

### Sidepanel Settings
- **Quick settings access** without opening full admin panel
- Enable/disable extension master toggle
- Display toggles: Banners, Plays, Wiki Tooltips
- **Show Admin Edit Links** toggle to hide edit links for end users
- HubSpot API token configuration
- Export/Import data for backup and restore
- "Open Admin Panel" button for full configuration

### Design
- Modern UI with **Manrope font** and **#b2ef63 accent color**
- SVG icons throughout (no emojis)
- Content script banners styled to match HubSpot's native design system

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `plugin` folder
5. The extension icon will appear in your Chrome toolbar

## Configuration

### HubSpot API Token
To enable property dropdowns and full deal data fetching:

1. Go to HubSpot Settings → Integrations → Private Apps
2. Create a new private app with these scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.companies.read`
   - `crm.objects.deals.read`
   - `crm.objects.tickets.read`
   - `crm.schemas.contacts.read`
   - `crm.schemas.companies.read`
   - `crm.schemas.deals.read`
   - `crm.schemas.tickets.read`
3. Copy the access token
4. Click the extension icon → Settings tab → paste the token

## Usage

### Creating a Banner
1. Click the extension icon → Admin Panel (gear icon)
2. Go to **Banners** and click "Add Banner"
3. **Content tab** - Fill in:
   - **Banner Name**: Internal identifier
   - **Banner Title**: Displayed in the banner header
   - **Banner Type**: Info (blue), Success (green), Warning (orange), Error (red), or Embed (media)
   - **Related Play**: (Optional) Select a play to link; an "Open Play" button will appear on the banner
   - **Message**: Banner content (supports rich text: bold, italic, lists, links) - hidden for Embed type
   - **Embed URL**: For Embed type, paste a Google Slides, YouTube, Loom, Vimeo, OneDrive, or SharePoint URL
4. **Rules tab** - Configure display conditions:
   - **Object Type**: Which record types to show on
   - **Display on all records**: Check to show on all records of the selected object type
   - **Show on Tab Position**: Enter tab number (1, 2, 3, etc.) or leave empty for all tabs
   - **Conditions**: Property-based rules with AND/OR logic (disabled if "Display on all records" is checked)
5. Click "Save Banner"

**Tip:** The Related Play feature is useful when you want to show a banner with a quick message, but also provide access to more detailed information in a play. The play doesn't need to match the same rules as the banner - clicking "Open Play" will always show the linked play.

### Creating a Play
1. Go to Admin Panel → Plays
2. Click "Add Play"
3. **Content tab** - Fill in:
   - **Name**: Display name
   - **Type**: Competitor, Objection Handler, Tip, or Process Guide
   - **Subtitle**: Brief description
   - **Link**: URL to full documentation (optional)
   - **Sections**: Content sections with titles and bullet points
     - Toggle between **Text** (bullet content) or **Media** (embed URL)
     - Drag sections to reorder; click "+" between sections to insert
4. **Rules tab** - Configure display conditions:
   - **Object Type**: Which record types to show on (optional)
   - **Display on all records**: Check to show on all records of the selected object type
   - **Conditions**: When to display (disabled if "Display on all records" is checked)
5. Click "Save Play"

### Creating Wiki Entries
1. Go to Admin Panel → Wiki
2. Click "Add Entry" or "Import Fields" to import from HubSpot
3. For manual entries, fill in:
   - **Title**: Display name shown in navigation and tooltip header
   - **Trigger Text**: (Optional) Text to match on HubSpot pages to show tooltip
   - **Aliases**: Additional trigger terms (comma-separated)
   - **Category**: General, Sales, Marketing, Product, Process, or HubSpot Field
   - **Object Type**: Associate with a HubSpot object (optional)
   - **Property Group**: Group within the object (optional)
   - **Definition**: Rich text explanation shown in tooltip
   - **Property Values**: Define cards for individual values (e.g., pipeline stages)
4. Click "Save Entry"

**Note:** Entries without a trigger are "glossary-only" and won't show tooltips on HubSpot pages. Use this for general knowledge base entries that don't need to appear as tooltips.

### Importing HubSpot Fields
1. Go to Admin Panel → Wiki → "Import Fields"
2. Select an Object Type (Contacts, Companies, Deals, Tickets)
3. Fields are displayed in a tree grouped by HubSpot property groups
4. Use group checkboxes to select entire groups, or check individual fields
5. Optionally check "Import dropdown values as nested entries" to create child entries for each dropdown option
6. Click "Import Selected"
7. Fields are imported with their label, object type, and property group
8. Dropdown values (if enabled) appear as nested entries under their parent property

### Condition Operators
| Operator | Description |
|----------|-------------|
| Equals | Exact match (case-insensitive) |
| Does not equal | Not an exact match |
| Contains | Text includes value |
| Does not contain | Text excludes value |
| Starts with | Text begins with value |
| Ends with | Text ends with value |
| Greater than | Numeric comparison |
| Less than | Numeric comparison |
| Is empty | Field has no value |
| Is not empty | Field has a value |

## File Structure

```
plugin/
├── manifest.json              # Chrome extension manifest (v3)
│
├── background/
│   └── background.js          # Service worker - API calls, messaging, sample data init
│
├── content/                   # Content scripts injected into HubSpot pages
│   ├── content.js             # Main orchestrator - page detection, data loading, coordination
│   ├── content.css            # Styles for banners, plays, media (HubSpot-native styling)
│   └── modules/               # Feature modules (v1.6.0+)
│       ├── banners.js         # Banner rendering and rule-based alerts
│       ├── wiki.js            # Wiki tooltips and term highlighting
│       ├── sidepanel.js       # FAB button and side panel trigger
│       └── presentations.js   # Embedded presentation/media cards
│
├── sidepanel/                 # Chrome Side Panel for plays
│   ├── sidepanel.html         # Side panel UI with tabs (Plays/Settings)
│   ├── sidepanel.js           # Side panel logic - plays display, settings
│   └── sidepanel.css          # Side panel styles
│
├── admin/                     # Full admin panel (multi-page architecture)
│   ├── shared.js              # Shared utilities - sidebar, storage, conditions, rich text
│   ├── shared.css             # Shared admin styles (imports design system)
│   │
│   ├── pages/                 # Individual admin pages (ACTIVE - v1.7.0+)
│   │   ├── index.html         # Redirects to home.html
│   │   ├── home.html/js/css   # Dashboard - onboarding, stats, quick actions
│   │   ├── banners.html/js/css # Banners - create/edit/manage banners (includes embeds)
│   │   ├── plays.html/js/css  # Plays - battle cards, objection handlers
│   │   ├── wiki.html/js/css   # Wiki - two-pane layout with tree navigation
│   │   └── settings.html/js   # Settings - API token, display toggles, import/export
│   │
│   ├── admin.html             # LEGACY: Single-page admin (deprecated)
│   ├── admin.js               # LEGACY: Single-page logic (deprecated)
│   └── admin.css              # LEGACY: Single-page styles (deprecated)
│
├── styles/                    # Shared design system
│   ├── base.css               # CSS variables, reset, typography (Manrope font)
│   ├── components.css         # Reusable UI components (buttons, forms, tables)
│   └── icons.css              # SVG icon definitions (inline data URIs)
│
├── lib/                       # Shared JavaScript libraries
│   ├── rules-engine.js        # Condition evaluation engine
│   ├── storage.js             # Chrome storage helpers
│   └── icons.js               # Icon utility functions
│
├── icons/                     # Extension icons (16, 48, 128px PNG + SVG)
│
├── api/                       # Cloudflare Worker for backend services
│   ├── invite-worker.js       # Invitation email API (Resend integration)
│   ├── wrangler.toml          # Cloudflare Worker configuration
│   └── README.md              # API setup and deployment guide
│
├── website/                   # Landing page (revguide.io)
│   ├── index.html             # Main landing page
│   ├── styles.css             # Landing page styles
│   └── script.js              # Landing page scripts
│
├── docs/                      # Development documentation
│   ├── AI_CHAT_DEV.md         # AI chat feature specification
│   └── MULTI_PORTAL_DEV.md    # Multi-portal/team feature specification
│
├── backups/                   # Version backups (not in production)
│
└── Documentation
    ├── README.md              # This file
    ├── CHANGELOG.md           # Version history
    ├── ROADMAP.md             # Product roadmap
    ├── INSTALL.md             # Installation guide
    ├── PRIVACY.md             # Privacy policy
    ├── LEARNINGS.md           # Development lessons learned and patterns
    └── HUBSPOT_DOM_STRUCTURE.md  # HubSpot DOM reference for developers
```

## Architecture

### Overview

The extension follows a multi-layer architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                          │
├─────────────────────────────────────────────────────────────────┤
│  Background Service Worker (background.js)                       │
│  - HubSpot API proxy                                            │
│  - Message routing                                               │
│  - Sample data initialization                                    │
├─────────────────────────────────────────────────────────────────┤
│  Content Scripts (Injected into HubSpot)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ content.js - Main Orchestrator                          │    │
│  │   ├── modules/banners.js      - Rule-based alerts       │    │
│  │   ├── modules/wiki.js         - Tooltip system          │    │
│  │   ├── modules/sidepanel.js    - FAB & panel trigger     │    │
│  │   └── modules/presentations.js - Embedded media         │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  UI Components                                                   │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │     Side Panel       │  │    Admin Panel       │             │
│  │  (Plays + Settings)  │  │  (Multi-Page App)    │             │
│  └──────────────────────┘  └──────────────────────┘             │
├─────────────────────────────────────────────────────────────────┤
│  Shared Resources                                                │
│  - styles/ (Design System)                                       │
│  - lib/ (Rules Engine, Storage)                                  │
│  - admin/shared.js (Admin utilities)                             │
└─────────────────────────────────────────────────────────────────┘
```

### Admin Panel Architecture (v1.7.0+)

The admin panel uses a **multi-page architecture** where each section is a standalone HTML page:

```
admin/pages/
├── index.html      → Redirects to home.html
├── home.html       → Dashboard with onboarding & stats
├── banners.html    → Banners management (includes embed type for media)
├── plays.html      → Battle cards & plays management
├── wiki.html       → Wiki with two-pane tree/card layout
└── settings.html   → API config, display toggles, import/export
```

**Shared Resources:**
- `admin/shared.js` - Common utilities exposed via `AdminShared` global:
  - `renderSidebar(activePage)` - Consistent navigation
  - `loadStorageData()` / `saveStorageData()` - Chrome storage access
  - `showToast()` - Notifications
  - `fetchProperties()` - HubSpot API integration
  - `addCondition()` / `getConditions()` - Condition builder
  - `initRichTextEditor()` - WYSIWYG editor setup
  - Constants: `OPERATORS`, `TYPE_LABELS`, `WIKI_CATEGORY_LABELS`, etc.

- `admin/shared.css` - Imports the design system (`styles/base.css`, `styles/components.css`, `styles/icons.css`)

**Navigation:**
Each page includes the shared sidebar which links to all other pages. The sidebar is rendered dynamically via `AdminShared.renderSidebar('pagename')`.

### Content Script Modules (v1.6.0+)

The content script uses a modular architecture where each feature is isolated:

```
content.js (Main Orchestrator)
    ├── modules/banners.js      - BannersModule class
    ├── modules/wiki.js         - WikiModule class
    ├── modules/sidepanel.js    - SidePanelModule class
    └── modules/presentations.js - PresentationsModule class
```

**Benefits:**
- **Isolation**: Changes to one feature don't break others
- **Maintainability**: Each module is self-contained with clear responsibilities
- **Testing**: Modules can be tested independently

**Data Flow:**
1. `content.js` detects page type (record vs index)
2. Loads configuration from Chrome storage
3. Initializes feature modules with reference to orchestrator
4. Extracts properties from HubSpot DOM
5. Delegates rendering to appropriate modules
6. Sets up watchers for SPA navigation and DOM changes

**Module Interface:**
Each module receives a reference to the main `HubSpotHelper` instance, giving access to:
- `helper.settings` - User settings
- `helper.properties` - Extracted page properties
- `helper.rulesEngine` - Condition evaluation
- `helper.wikiEntries` - Wiki terms
- `helper.escapeHtml()` - Security utility
- `helper.findInjectTarget()` - DOM injection target

### Data Storage

All data is stored in Chrome's `chrome.storage.local`:

```javascript
{
  rules: [],           // Banner rules with conditions
  battleCards: [],     // Plays/battle cards
  presentations: [],   // Embedded media items
  wikiEntries: [],     // Wiki entries (see structure below)
  wikiTermMapCache: {},   // Pre-built trigger → entryId map (performance optimization)
  wikiEntriesById: {},    // entryId → entry lookup table
  wikiCacheVersion: 0,    // Cache version timestamp
  settings: {
    enabled: true,
    showBanners: true,
    showBattleCards: true,
    showPresentations: true,
    showWiki: true,
    showAdminLinks: true,
    bannerPosition: 'top',
    hubspotApiToken: ''
  }
}

// Wiki entry structure (v1.9.5+)
wikiEntry: {
  id: 'wiki_123',
  parentId: null,                      // Optional - links to parent entry for nested values
  title: 'Marketing Qualified Lead',   // Required - display name
  trigger: 'MQL',                      // Optional - text to match for tooltip
  aliases: ['M.Q.L.'],                 // Optional - additional triggers
  category: 'sales',
  objectType: 'contacts',
  propertyGroup: 'Lead Information',
  definition: '<p>Rich text definition...</p>',
  enabled: true,
  createdAt: 1234567890,
  updatedAt: 1234567890                // Auto-updated on save
}

## Development

### Debug Mode
To enable console logging in the content script, edit `content/content.js`:
```javascript
const DEBUG = true;
```

### Key Technical Notes
- See [HUBSPOT_DOM_STRUCTURE.md](HUBSPOT_DOM_STRUCTURE.md) for details on HubSpot's DOM structure
- The extension fetches all deal properties via HubSpot API for accurate condition evaluation
- Property names are normalized to handle differences between API names and page-extracted labels
- Presentations support Google Slides, OneDrive, and SharePoint embed URLs

### Performance Optimizations (v1.9.3+)
The wiki tooltip system is optimized for large numbers of entries (1000+):

1. **Pre-built Term Map Cache**: When wiki entries are saved, a term map (trigger → entryId) is pre-computed and stored. This eliminates the need to build the map on every page load.

2. **Session Storage Layer**: After loading from `chrome.storage.local`, the cache is saved to `sessionStorage` for instant synchronous access on subsequent page loads within the same browser session.

3. **Adaptive Scan Timing**: Index pages use an immediate first pass with smart follow-up timing:
   - Immediate first pass (no delay)
   - Second pass at 800ms only if HubSpot loading indicators are detected
   - Third pass at 2000ms only if content count increased

See [LEARNINGS.md](LEARNINGS.md) for detailed technical documentation on the caching architecture.

### Version History
See [CHANGELOG.md](CHANGELOG.md) for release notes and [ROADMAP.md](ROADMAP.md) for planned features.

### Additional Documentation
- [INSTALL.md](INSTALL.md) - Detailed installation and setup guide
- [PRIVACY.md](PRIVACY.md) - Privacy policy
- [HUBSPOT_DOM_STRUCTURE.md](HUBSPOT_DOM_STRUCTURE.md) - HubSpot DOM reference for developers
- [LEARNINGS.md](LEARNINGS.md) - Development lessons learned, code patterns, and debugging tips
- [api/README.md](api/README.md) - API setup and deployment guide

## Team Invitations API

RevGuide includes a Cloudflare Worker API for sending team invitation emails via [Resend](https://resend.com).

### Architecture

```
┌─────────────────────┐      ┌─────────────────────────────────┐      ┌─────────────┐
│  Chrome Extension   │ ──── │  Cloudflare Worker              │ ──── │   Resend    │
│  (Settings Page)    │ POST │  revguide-api.revguide.workers.dev │      │   Email API │
└─────────────────────┘      └─────────────────────────────────┘      └─────────────┘
```

### API Endpoint

**Production URL:** `https://revguide-api.revguide.workers.dev`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/invite` | POST | Send invitation email to a team member |
| `/health` | GET | Health check endpoint |

### Setup

1. **Get a Resend API Key**
   - Sign up at [resend.com](https://resend.com)
   - Create an API key
   - Verify your sending domain

2. **Configure the Worker**
   ```bash
   cd api
   npx wrangler secret put RESEND_API_KEY
   # Paste your Resend API key when prompted
   ```

3. **Deploy**
   ```bash
   npx wrangler deploy
   ```

See [api/README.md](api/README.md) for detailed setup instructions.

### Email Templates

Invitation emails are sent with:
- HTML and plain text versions
- Role-based messaging (Admin vs User)
- Chrome Web Store installation link
- RevGuide branding

Templates can be customized in `api/invite-worker.js`.

## License

MIT License - see LICENSE file for details.
