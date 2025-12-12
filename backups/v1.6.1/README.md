# HubSpot Helper

A Chrome extension that displays contextual banners, plays, wiki tooltips, and embedded media on HubSpot CRM record pages based on configurable rules.

## Features

### Banner Rules
- Display contextual banners (info, success, warning, error) on HubSpot records
- **Rich text messages** with bold, italic, underline, bullet lists, and links
- Configure conditions based on any HubSpot property
- **"Display on all records"** option to show on all records of an object type
- Support for AND/OR logic between conditions
- Priority-based display ordering
- Filter by object type (Contacts, Companies, Deals, Tickets)

### Plays
- Create plays for competitors, objections, tips, processes, and best practices
- **Chrome Side Panel**: Plays open in Chrome's native sidebar, persisting across HubSpot pages
- **Tabbed navigation**: Plays tab + Settings tab with icon-based UI
- **Dual entry points**:
  - Click the **floating action button (FAB)** on HubSpot pages → Opens to Plays tab
  - Click the **extension icon** in toolbar → Opens to Settings tab
- **Object type filtering**: Plays display only on matching record types (contact, company, deal, ticket)
- **Live updates**: Sidepanel content updates automatically when navigating between records
- Expandable sections with formatted content
- Link to full external documentation (Google Docs, Notion, etc.)
- **"Display on all records"** option to show on all records of an object type
- Conditional display based on record properties

### Wiki / Field Glossary
- **Contextual tooltips** that appear when hovering over property labels in HubSpot
- Import HubSpot fields directly with object type and property group metadata
- **Hierarchical organization**: Object > Property Group > Property > Values
- Define cards for individual property values (e.g., explain what each pipeline stage means)
- Rich text definitions with formatting, lists, and links
- Filter and search wiki entries by object type, category, or term
- Expandable/collapsible table view with toggle switches for enabling/disabling entries
- **Content Libraries** (coming soon): Download starter packs to quickly populate your wiki

### Media
- Embed presentations, videos, and other content directly in HubSpot
- Support for Google Slides, YouTube, Loom, Vimeo, OneDrive, and SharePoint
- Collapsible embed with 16:9 aspect ratio
- "Open in Library" link to access original file
- **"Display on all records"** option to show on all records of an object type
- Conditional display based on record properties

### Admin Panel
- **Homepage with onboarding guide** to help new users get started
- Progress tracking across 6 setup steps (Install, API, Wiki, Rules, Plays, Team)
- Quick stats dashboard showing content counts
- Full-page admin interface for managing rules, plays, wiki entries, and media
- **Rich text editor** with formatting toolbar for banner messages and wiki definitions
- Searchable property dropdowns with HubSpot API integration
- Live preview while editing
- Import HubSpot fields to wiki with one click
- Import/Export functionality for backup and sharing

### Sidepanel Settings
- **Quick settings access** without opening full admin panel
- Enable/disable extension master toggle
- Display toggles: Banners, Plays, Presentations, Wiki Tooltips
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
4. Open the extension popup → Settings → paste the token

## Usage

### Creating a Banner Rule
1. Click the extension icon → Admin Panel (gear icon)
2. Click "Add Rule"
3. Fill in:
   - **Rule Name**: Internal identifier
   - **Banner Title**: Displayed in the banner header
   - **Message**: Banner content (supports rich text: bold, italic, lists, links)
   - **Type**: Info (blue), Success (green), Warning (orange), Error (red)
   - **Object Type**: Which record types to show on
   - **Display on all records**: Check to show on all records of the selected object type
   - **Conditions**: Property-based rules with AND/OR logic (disabled if "Display on all records" is checked)
4. Click "Save Rule"

### Creating a Play
1. Go to Admin Panel → Plays
2. Click "Add Play"
3. Fill in:
   - **Name**: Display name
   - **Type**: Competitor, Objection Handler, Tip, or Process Guide
   - **Subtitle**: Brief description
   - **Link**: URL to full documentation (optional)
   - **Object Type**: Which record types to show on (optional)
   - **Display on all records**: Check to show on all records of the selected object type
   - **Conditions**: When to display (disabled if "Display on all records" is checked)
   - **Sections**: Content sections with titles and bullet points
4. Click "Save Play"

### Adding Media
1. Go to Admin Panel → Media
2. Click "Add Media"
3. Fill in:
   - **Name**: Display name
   - **Description**: Brief description of when to use it
   - **URL**: Google Slides, YouTube, Loom, Vimeo, OneDrive, or SharePoint URL
   - **Object Type**: Which record types to show on (optional)
   - **Display on all records**: Check to show on all records of the selected object type
   - **Conditions**: When to display (disabled if "Display on all records" is checked)
4. Click "Save Media"

**Note:** Content must allow embedding:
- **Google Slides:** Share → "Anyone with the link"
- **YouTube:** Embedding must not be disabled
- **Loom:** Share settings must allow embedding
- **SharePoint/OneDrive:** Share → "People in [org] with the link" or "Anyone"

### Creating Wiki Entries
1. Go to Admin Panel → Wiki
2. Click "Add Entry" or "Import Fields" to import from HubSpot
3. For manual entries, fill in:
   - **Term**: The word or phrase to highlight
   - **Aliases**: Alternative terms (comma-separated)
   - **Category**: General, Sales, Marketing, Product, Process, or HubSpot Field
   - **Object Type**: Associate with a HubSpot object (optional)
   - **Property Group**: Group within the object (optional)
   - **Definition**: Rich text explanation shown in tooltip
   - **Property Values**: Define cards for individual values (e.g., pipeline stages)
4. Click "Save Entry"

### Importing HubSpot Fields
1. Go to Admin Panel → Wiki → "Import Fields"
2. Select an Object Type (Contacts, Companies, Deals, Tickets)
3. Check the fields you want to import
4. Click "Import Selected"
5. Fields are imported with their label, object type, and property group
6. Edit imported fields to add definitions and value explanations

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
├── manifest.json           # Chrome extension manifest (v3)
├── background/
│   └── background.js       # Service worker for API calls
├── content/
│   ├── content.js          # Main orchestrator - page detection, data loading, coordination
│   ├── content.css         # Styles for banners, plays, media (HubSpot-native styling)
│   └── modules/            # Feature modules (v1.6.0+)
│       ├── banners.js      # Banner rendering and rule-based alerts
│       ├── wiki.js         # Wiki tooltips and term highlighting
│       ├── sidepanel.js    # FAB button and side panel for battle cards
│       └── presentations.js # Embedded presentation/media cards
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.js            # Popup logic
│   └── popup.css           # Popup styles
├── admin/
│   ├── admin.html          # Full admin panel
│   ├── admin.js            # Admin panel logic
│   └── admin.css           # Admin panel styles
├── sidepanel/              # Chrome Side Panel for plays
│   ├── sidepanel.html      # Side panel UI
│   ├── sidepanel.js        # Side panel logic
│   └── sidepanel.css       # Side panel styles
├── styles/                 # Shared design system
│   ├── base.css            # CSS variables, reset, typography
│   ├── components.css      # Reusable component styles
│   └── icons.css           # SVG icon definitions
├── icons/                  # Extension icons
├── HUBSPOT_DOM_STRUCTURE.md  # HubSpot DOM reference
├── CHANGELOG.md            # Version history
├── ROADMAP.md              # Product roadmap
├── PRIVACY.md              # Privacy policy
└── INSTALL.md              # Installation guide
```

## Architecture

### Modular Content Script (v1.6.0+)

The content script uses a modular architecture where each feature is isolated in its own module:

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
- **Documentation**: Each module has JSDoc comments explaining its purpose and usage

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

### Version History
See [CHANGELOG.md](CHANGELOG.md) for release notes and [ROADMAP.md](ROADMAP.md) for planned features.

### Additional Documentation
- [INSTALL.md](INSTALL.md) - Detailed installation and setup guide
- [PRIVACY.md](PRIVACY.md) - Privacy policy
- [HUBSPOT_DOM_STRUCTURE.md](HUBSPOT_DOM_STRUCTURE.md) - HubSpot DOM reference for developers

## License

MIT License - see LICENSE file for details.
