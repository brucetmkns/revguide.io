# Changelog

All notable changes to RevGuide will be documented in this file.

## [2.2.1] - 2025-12-16 - Data Persistence Fix

### Fixed
- **Data Persistence - Critical Fix**
  - Wiki entries, banners, and plays now properly save to Supabase database
  - Data persists correctly when navigating between pages
  - Previously, save operations were updating local cache but not persisting to database

- **Supabase Column Name Mapping**
  - Added snake_case/camelCase mapping between frontend and database
  - Frontend uses camelCase (e.g., `objectType`, `displayOnAll`)
  - Supabase uses snake_case (e.g., `object_type`, `display_on_all`)
  - Mapping functions in `shared.js` and each page class

### Added
- **Database Migration 006**
  - Added missing columns to `plays` table: `object_type`, `display_on_all`
  - Added missing columns to `banners` table: `object_type`, `object_types`, `display_on_all`, `tab_visibility`, `related_play_id`, `embed_url`
  - Added missing columns to `wiki_entries` table: `object_type`, `property_group`, `match_type`, `frequency`, `include_aliases`, `priority`, `page_type`, `url_patterns`

### Technical
- `banners.js`: Direct Supabase save via `RevGuideDB.createBanner()`/`updateBanner()`/`deleteBanner()`
- `plays.js`: Direct Supabase save via `RevGuideDB.createPlay()`/`updatePlay()`/`deletePlay()`
- `wiki.js`: Direct Supabase save via `RevGuideDB.createWikiEntry()`/`updateWikiEntry()`/`deleteWikiEntry()`
- `shared.js`: Added `mapBannerFromSupabase()`, `mapPlayFromSupabase()`, `mapWikiFromSupabase()` for loading data
- `shared.js`: Added `clearStorageCache()` to invalidate cache after saves
- New migration: `supabase/migrations/006_add_missing_columns.sql`

---

## [2.2.0] - 2025-12-16 - Beta Release

### Added
- **CI/CD Pipeline**
  - GitHub Actions workflow for continuous integration (`.github/workflows/ci.yml`)
  - Automated validation: manifest.json structure, required files check
  - ESLint integration for code quality
  - Extension package build automation
  - Automatic deployment to Supabase edge functions and Cloudflare Worker on main branch

- **Release Automation**
  - GitHub Actions workflow for releases (`.github/workflows/release.yml`)
  - Triggered by version tags (v*)
  - Automatic GitHub release creation with changelog extraction
  - Extension ZIP artifact attached to releases

- **Test Suite**
  - Test framework setup with Chrome API mocks (`tests/setup.js`)
  - Condition engine tests - 16 tests (`tests/conditions.test.js`)
  - Storage tests - 7 tests (`tests/storage.test.js`)
  - Test runner script (`tests/run-tests.js`)

- **Documentation**
  - `docs/DEPLOYMENT.md` - Comprehensive deployment guide for Supabase, Vercel, Cloudflare
  - `docs/ERROR_MONITORING.md` - Sentry setup guide for web, extension, edge functions
  - `docs/PRIVACY_POLICY.md` - Complete privacy policy for Chrome Web Store
  - `docs/CHROME_WEB_STORE.md` - Store submission guide with listing content
  - `docs/BETA_PROGRAM.md` - Beta tester onboarding and feedback guide
  - `docs/ARCHITECTURE.md` - Information architecture explaining codebase structure
  - `.env.example` - Environment variable template with all required variables

- **Team Management Improvements**
  - Database-backed invitations (replaces local array)
  - Pending invitations table in Settings
  - Resend invitation functionality
  - Proper invitation expiry tracking

- **User Feedback**
  - "Send Feedback" link in admin sidebar
  - Links to GitHub Issues for bug reports and feature requests

### Changed
- **Team Management** now uses Supabase database for invitations instead of local storage
- Updated version to 2.2.0 for beta release milestone

### Technical
- New files: `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- New files: `tests/setup.js`, `tests/conditions.test.js`, `tests/storage.test.js`, `tests/run-tests.js`
- New files: `docs/DEPLOYMENT.md`, `docs/ERROR_MONITORING.md`, `docs/PRIVACY_POLICY.md`, `docs/CHROME_WEB_STORE.md`, `docs/BETA_PROGRAM.md`, `docs/ARCHITECTURE.md`
- Updated: `admin/pages/settings.js` - Database-backed team management
- Updated: `admin/shared.js` - Added feedback link to sidebar
- Updated: `admin/shared.css` - Feedback link styling

---

## [2.1.2] - 2025-12-16

### Security
- **Fixed Row Level Security (RLS) Policies**
  - Re-enabled RLS on `users` and `organizations` tables (was temporarily disabled for debugging)
  - Created `get_user_organization_id()` SECURITY DEFINER function to break circular dependencies
  - All RLS policies now use the helper function instead of subqueries
  - Proper security isolation restored - users can only access their own organization's data

### Technical
- New migration: `supabase/migrations/003_fix_rls_policies.sql`
- Fixed policies for: users, organizations, hubspot_connections, invitations tables
- Service role retains full access for edge functions

---

## [2.1.1] - 2025-12-16

### Added
- **User Settings Section**
  - New "Account Settings" card in Settings page
  - Editable "Your Name" field - updates user profile in database
  - Email address display (read-only, from Supabase auth)
  - Editable "Company Name" field - updates organization name
  - Save button updates both user and organization in one action
  - Sidebar footer updates immediately to reflect name changes

- **HubSpot Connection Loading Spinner**
  - Loading state with spinner while checking HubSpot connection status
  - Shows "Checking connection status..." message during API call
  - Smoother UX instead of showing disconnected state briefly

### Changed
- **HubSpot OAuth Organization Naming**
  - Fixed OAuth flow to not use "app.hubspot.com" as organization name
  - Now defaults to "My Organization" when HubSpot company name is unavailable
  - Only uses HubSpot's company name if it's a real company name (not portal domain)

### Fixed
- **Database Query Optimization**
  - Changed `getUserProfile()` from joined query to separate queries
  - Avoids 500 errors caused by Supabase PostgREST join issues with RLS
  - More resilient to database/RLS configuration issues

- **Auth Fallback for Email**
  - `checkAuth()` now falls back to Supabase auth user if profile query fails
  - Ensures email displays even when users table has issues

### Technical
- New `updateUserProfile()` function in `supabase.js` for updating user name
- Updated `loadAccountSettings()` to populate name field from profile
- Updated `saveAccountSettings()` to handle both user and org updates
- HubSpot OAuth edge function checks for portal domains before using as org name

---

## [2.1.0] - 2025-12-16

### Added
- **Direct HubSpot OAuth Integration**
  - Replaced Nango OAuth middleware with direct HubSpot OAuth via Supabase edge functions
  - New `/hubspot-oauth` edge function with endpoints: `/authorize`, `/callback`, `/connection`, `/disconnect`, `/proxy`
  - Secure token storage with pgcrypto encryption in database
  - Automatic token refresh before expiry (tokens valid for 30 minutes)
  - CSRF protection via state parameter stored in `oauth_states` table

- **HubSpot Field Import in Web App**
  - Field import now works in web context (previously extension-only)
  - Fetches properties via OAuth proxy endpoint
  - Loading spinner animation while fetching fields from HubSpot

- **Account Settings Card**
  - New card in Settings page for managing account details
  - Email display (read-only) and company name field

### Changed
- **Settings Page**
  - Updated to use `RevGuideHubSpot` client instead of `RevGuideNango`
  - Simplified OAuth callback handling (checks URL params instead of polling)
  - HubSpot connection status fetched via new `/connection` endpoint

- **Shared Utilities**
  - `fetchProperties()` now uses HubSpot OAuth proxy in web context
  - Falls back to chrome.runtime messaging in extension context

### Technical
- New files:
  - `supabase/functions/hubspot-oauth/index.ts` - Edge function for OAuth
  - `supabase/functions/hubspot-oauth/config.toml` - Disables JWT verification
  - `supabase/migrations/002_direct_hubspot_oauth.sql` - Token columns and oauth_states table
  - `admin/hubspot.js` - Frontend HubSpot client (replaces nango.js)
- Updated files:
  - `admin/shared.js` - fetchProperties uses OAuth proxy
  - `admin/pages/settings.js` - Uses RevGuideHubSpot
  - `admin/pages/settings.html` - Loads hubspot.js, account settings card
  - `admin/pages/wiki.html` - Loads hubspot.js for field import
  - `admin/pages/wiki.js` - Loading spinner for field import
  - `admin/pages/wiki.css` - Loading indicator styles

### Removed
- Nango dependency (NANGO_SECRET_KEY no longer required)
- Complex webhook-based OAuth completion flow

---

## [2.0.0] - 2025-12-15

### Added
- **SaaS Web Application**
  - Admin panel now hosted at [app.revguide.io](https://app.revguide.io)
  - Works alongside Chrome extension (same codebase)
  - Context detection: automatically uses Supabase auth in web, chrome.storage in extension

- **Supabase Authentication**
  - Magic Link (passwordless email sign-in)
  - Google OAuth sign-in
  - Session management with automatic refresh
  - Protected routes redirect to login when unauthenticated

- **Resend Email Integration**
  - Custom SMTP configured for `@revguide.io` sender domain
  - Branded email templates matching RevGuide design system
  - Templates: Magic Link, Confirm Signup, Invite User, Reset Password

- **Vercel Deployment**
  - GitHub integration for automatic deployments
  - Custom domain `app.revguide.io`
  - Clean URL rewrites (`/login`, `/home`, `/wiki`, etc.)

### Changed
- **Admin Panel URLs**
  - Web app uses clean URLs: `/login`, `/signup`, `/home`, `/wiki`, `/banners`, `/plays`, `/libraries`, `/settings`
  - Extension continues to use `.html` file paths
  - All CSS/JS paths updated to absolute URLs for Vercel compatibility

- **Auth Flow**
  - Login/signup pages detect web vs extension context
  - Web: Uses Supabase `signInWithOtp()` for magic links
  - Extension: Bypasses auth (uses local chrome.storage)

### Technical
- New files: `/admin/supabase.js`, `/admin/pages/login.html`, `/admin/pages/signup.html`
- New file: `/vercel.json` for URL rewrites and headers
- Updated: `/admin/shared.js` with `isExtensionContext` detection and auth redirects
- Updated: All HTML files with absolute paths for CSS/JS resources

---

## [1.9.9] - 2025-12-15

### Changed
- **Complete Wiki Scanner Rewrite (Supered-Style TreeWalker)**
  - Replaced 7 separate CSS selector methods with single-pass TreeWalker
  - ~45% less code (~875 lines vs ~1600 lines)
  - Faster and more consistent text matching across all HubSpot pages
  - Fixed false positives: "Company" no longer matches "Company Domain Name"

- **Smart Plural Matching**
  - Triggers now automatically match singular/plural variants
  - "Company" trigger matches "Companies (0)" text and vice versa
  - "Contact" trigger matches "Contacts (3)" text
  - Handles common English plural rules: -s, -es, -ies

- **HubSpot Custom Element Support**
  - Added `I18N-STRING` to accepted label tags
  - Association card titles now properly detected and matched

- **Section-Based Deduplication**
  - Wiki icons now show first instance of each term PER SECTION, not every instance
  - Sections: left-sidebar, middle-pane, right-sidebar, header, modal, dropdown, filter-panel, nav, table, main
  - Reduces visual clutter while maintaining coverage

- **Exact Match Only**
  - Changed from `includes()` to exact `===` matching
  - Prevents shorter terms from matching longer text (e.g., "Deal" won't match "Deal Stage")
  - Still handles trailing colons and parenthetical counts like "(3)"

### Added
- **Text Normalization**
  - Strips zero-width characters (`\u200B-\u200D`, `\uFEFF`) before matching
  - More reliable matching when HubSpot injects invisible chars

- **Sorted Term List**
  - Terms sorted by length (longest first)
  - Ensures most specific match wins when multiple terms could apply

### Technical
- New `scanForMatches()` - single TreeWalker scan returning all matches
- New `getSectionForElement()` - determines which page section an element is in
- New `buildSortedTermList()` - creates length-sorted term array with caching
- Simplified `isLikelyLabelContext()` - fewer checks needed with exact matching
- Backup of old wiki.js saved to `backups/` directory

---

## [1.9.8] - 2025-12-15

### Added
- **Wiki Tooltips on Secondary Navigation Menu Items**
  - Tooltips now appear on HubSpot's secondary nav items (Contacts, Companies, Deals, Tickets, etc.)
  - MutationObserver detects when lazy-loaded nav items appear on hover/expand
  - Observer attached to `document.body` to catch nav menu rendering outside main nav container

### Changed
- **Improved Icon Positioning (Supered-Style)**
  - Updated wiki icon wrapper to use `padding-left` + absolute positioning
  - Icons now scale with font size using `em` units
  - More consistent positioning across various HubSpot UI elements
  - New `.hshelper-wiki-icon-container` class for absolute positioning

### Technical
- Added `applyMethodSecondaryNav()` - dedicated method for secondary nav items
- Added `setupNavObserver()` - watches for lazy-loaded nav menu items
- Method 3 now explicitly skips `[data-menu-item-level="secondary"]` elements to avoid duplicates
- Updated `addIconToElement()` and `wrapTextNodeWithIcon()` to use new icon container structure
- Updated `isAlreadyProcessed()` to include `.hshelper-wiki-icon-container` checks
- Updated `remove()` to properly unwrap icon containers during cleanup

---

## [1.9.7] - 2025-12-14

### Changed
- **Rebranded from "HubSpot Helper" to "RevGuide"**
  - Updated extension name in manifest.json
  - Updated all UI text, page titles, and branding across admin panel, sidepanel, and content scripts
  - Updated console log prefixes from `[HubSpot Helper]` to `[RevGuide]`
  - Updated export filenames to `revguide-backup-*.json` and `revguide-export-*.json`
  - Renamed Cloudflare Worker from `hubspot-helper-api` to `revguide-api`
  - Deployed new worker to `https://revguide-api.revguide.workers.dev`
  - Updated all documentation (README, CHANGELOG, ROADMAP, INSTALL, PRIVACY, LEARNINGS)
  - Updated website landing page references

---

## [1.9.6] - 2025-12-14

### Changed
- **Sidepanel Now Opens on Non-HubSpot Pages**
  - Clicking the extension icon on non-HubSpot pages now opens the sidepanel instead of doing nothing
  - Opens to Plays tab by default, showing friendly "Not a HubSpot Page" message
  - "Open Admin Panel" button to access full configuration
  - "Settings" button to switch to the Settings tab
  - Provides clear feedback that the extension is working

### Technical
- Removed `chrome.sidePanel.setOptions({ enabled: false })` for non-HubSpot tabs
- Extension icon click handler now always opens sidepanel to Plays tab regardless of page URL
- Added `not-hubspot-actions` button container in sidepanel HTML
- Added click handlers for new action buttons in sidepanel.js

---

## [1.9.5] - 2025-12-12

### Added
- **HubSpot Import Tree View with Property Groups**
  - Import modal now displays properties grouped by HubSpot property groups
  - Collapsible tree structure matching the wiki navigation pattern
  - Group checkboxes to select/deselect all fields in a group at once
  - Search now filters across field names, labels, AND property group names
  - "Dropdown" badge identifies enumeration/picklist fields
  - Shows available/total count per group (e.g., "5/8")

- **Import Dropdown Values as Nested Wiki Entries**
  - New checkbox option: "Import dropdown values as nested entries"
  - When enabled, each dropdown option becomes a child wiki entry under the property
  - Child entries linked via `parentId` for true parent-child relationship
  - Children appear nested under their parent in the wiki navigation tree
  - Each child entry includes value, label, and parent field reference in definition

- **Nested Entry Display in Wiki Tree**
  - Wiki entries with children now render as expandable nodes
  - Click toggle arrow to expand/collapse children
  - Click entry name to select and edit (separate from toggle)
  - Child count badge shown on parent entries
  - Full selection styling (green highlight) for parent entries

### Removed
- **Property Values Section from Wiki Editor**
  - Removed the manual "Property Values" editing section from Content tab
  - Values are already shown in the Definition section
  - Dropdown values should now be imported as nested wiki entries instead
  - Removed Property Values count from Usage tab stats

### Technical
- `loadFieldsForImport()` now groups properties by `groupName` and renders tree HTML
- Added `toggleGroupFields()` and `updateGroupCheckboxState()` for group selection
- `filterFieldsList()` updated to show groups when group name matches search
- `renderNavTree()` separates parent entries from child entries via `parentId`
- `selectEntry()` updated to find entry ID from parent `.wiki-node-entry` element
- New CSS for `.wiki-node-entry`, `.fields-tree`, `.fields-tree-node` styling
- Import options moved to modal footer for better visibility

---

## [1.9.4] - 2025-12-12

### Added
- **Related Play for Banners**
  - New "Related Play" dropdown in Banner editor (Content tab)
  - Link any play to a banner for quick access from HubSpot pages
  - Searchable dropdown with play names and subtitles
  - "Open Play" button appears on banners that have a linked play
  - Clicking "Open Play" opens the sidepanel and navigates directly to that play

- **Smart Play Loading in Sidepanel**
  - Plays linked to banners are shown even if they don't match the current record's rules
  - "Related Play from Banner" header indicates plays opened via banner link
  - Play card automatically expands and highlights with animation
  - Solves the UX issue where banner and play might have different targeting rules

### Technical
- Added `relatedPlayId` field to banner/rule data structure
- New `initPlaySelect()`, `setPlaySelectValue()`, `getPlaySelectValue()` functions in `admin/shared.js`
- Added `.play-select*` CSS classes in `admin/pages/banners.css`
- `openPlayInSidepanel()` method in `content/modules/banners.js` fetches play data directly from storage
- Background script handles `openSidePanelToPlay` action with play data passthrough
- Sidepanel `focusOnPlay()` dynamically adds play card if not in current matching cards
- Added `.hshelper-banner-play-btn` styling in `content/content.css`
- Added `.related-play-header` and highlight animation in `sidepanel/sidepanel.css`

---

## [1.9.3] - 2025-12-12

### Performance
- **Wiki Tooltip Caching Optimization**
  - Pre-built term map cache: Term map is now built when wiki entries are saved, not on every page load
  - Session storage layer: Cache stored in sessionStorage for instant subsequent page loads within a session
  - Adaptive scan timing: Index pages now use immediate first pass instead of 500ms delay, with follow-up passes only when HubSpot is still loading content
  - Reduced unnecessary passes: Second/third passes only run if loading indicators detected or content count increases

### Technical
- Added `buildWikiTermMapCache()` function to `admin/shared.js`, `lib/storage.js`, `popup/popup.js`, `admin/admin.js`, and `background/background.js`
- New storage keys: `wikiTermMapCache`, `wikiEntriesById`, `wikiCacheVersion`
- `content/content.js` now loads pre-built cache and stores in sessionStorage
- `content/modules/wiki.js` uses pre-built cache with fallback to building from entries
- Added `invalidateTermMapCache()` method for cache invalidation on storage changes
- `applyForIndex()` now uses immediate first pass with smart follow-up timing

### Developer Notes
- See `LEARNINGS.md` for detailed documentation on the caching architecture
- Backward compatible: Falls back to building term map from entries if cache unavailable

---

## [1.9.2] - 2025-12-12

### Added
- **Tab Visibility for Banners**
  - New "Show on Tab Position" field in Banner Rules tab
  - Enter a tab number (1, 2, 3, etc.) to show banner only on that tab
  - Leave empty to show on all tabs (default behavior)
  - Content script detects active tab via HubSpot's DOM structure

### Fixed
- **Media Embed Banners**
  - Fixed embed-type banners showing only title in transparent pane
  - Embed banners now render as collapsible media cards (like presentations)
  - Full iframe embedding with fallback UI for load errors
  - Collapsible header with toggle button and "Open Media" link

### Technical
- Added `createEmbedBanner()` method to `content/modules/banners.js`
- Added `detectCurrentTab()` method to `content/content.js` with multiple detection strategies
- Tab visibility filtering applied in `render()` before passing rules to banners module
- Changed tab visibility input from dropdown to number field for flexibility

---

## [1.9.1] - 2025-12-12

### Added
- **Admin Edit Links on All Content Types**
  - "Edit in Admin Panel" links now appear on banners, plays, and wiki tooltips
  - Clicking the link opens the admin panel directly to edit that specific asset
  - Links only visible when `showAdminLinks` setting is enabled (default: on)

- **New Setting: Show Admin Edit Links**
  - Added toggle in Settings → Display Options
  - Controls visibility of edit links on banners, plays, and wiki tooltips
  - Allows teams to hide admin links for end users who shouldn't edit content

- **Deep Linking to Admin Editor**
  - Admin pages now support `?edit=<assetId>` URL parameter
  - Banners, Plays, and Wiki pages open directly to the specified asset's editor
  - Shows error toast if asset not found

### Changed
- **Wiki Tooltip Redesign (Variation G)**
  - New friendly, rounded design with 14px border-radius
  - Category-colored icon box (32x32px) with unique icons per category:
    - General: question mark
    - Sales: dollar sign
    - Marketing: star
    - Product: layers
    - Process: pulse/activity
    - Field: grid/table
  - Split footer layout: subtle "Edit" link on left, prominent "Learn more" on right
  - Improved animation with scale + fade effect
  - Cleaner typography and spacing (300px width)

### Technical
- Updated `content/modules/banners.js` with admin edit link in banner titles
- Updated `sidepanel/sidepanel.js` with edit links in play cards
- Updated `content/modules/wiki.js` with new tooltip HTML structure and category icons
- Rewrote wiki tooltip CSS in `content/content.css` (~200 lines)
- Added CSS styling for edit links in `sidepanel/sidepanel.css`
- Updated all admin pages (`banners.js`, `plays.js`, `wiki.js`) to handle `edit` query parameter

---

## [1.8.2] - 2025-12-11

### Changed
- **Banner Rules renamed to Banners**
  - "Banner Rules" section renamed to "Banners" throughout the application
  - Sidebar navigation updated: "Banner Rules" → "Banners"
  - All button text updated: "Add Rule" → "Add Banner", "Save Rule" → "Save Banner"
  - Toast messages and confirmation dialogs now reference "banner" instead of "rule"

- **Media consolidated into Banners**
  - Media section removed from sidebar navigation
  - New "Embed" banner type added for media content
  - Embed type supports Google Slides, YouTube, Loom, Vimeo, OneDrive, and SharePoint URLs
  - Embed URL field with automatic conversion to embed format
  - When "Embed" type is selected, message field is hidden and embed URL field is shown
  - Media preview shows live iframe embed in editor

- **Banners Editor Tabbed Interface**
  - New tabbed layout matching Plays and Wiki: Content, Rules, Usage tabs
  - Content tab: Banner name, title, type, message/embed URL, preview
  - Rules tab: Object type, display on all records, conditions builder
  - Usage tab: Coming soon placeholder for analytics

- **Home Page Updates**
  - Removed Media stat card from dashboard
  - Updated onboarding progress from 6 steps to 5 steps
  - Step numbering updated (Invite Team is now Step 5)

- **Content Script Updates**
  - "Open in Library" button renamed to "Open Media" for embed banners

### Removed
- `admin/pages/media.html` - Consolidated into Banners
- `admin/pages/media.css` - Consolidated into Banners
- `admin/pages/media.js` - Consolidated into Banners
- `admin/pages/rules.html` - Renamed to banners.html
- `admin/pages/rules.css` - Renamed to banners.css
- `admin/pages/rules.js` - Renamed to banners.js

---

## [1.8.1] - 2025-12-11

### Fixed
- **Wiki Tooltip Display Issues**
  - Fixed tooltips not showing for migrated wiki entries
  - Methods 4 and 5 in wiki.js were referencing `entry.term` instead of `entry.trigger`
  - Updated all references to use fallback pattern: `entry.trigger || entry.term`

- **Tooltip Click Behavior**
  - Fixed temperamental tooltip behavior (opening briefly then closing, requiring multiple clicks)
  - Added proper toggle state tracking with `currentTooltipEntryId`
  - Fixed outside-click handler to recognize clicks on wiki icons (was only checking `.hshelper-wiki-term`)
  - Clicking same icon now properly toggles tooltip off
  - Increased click listener delay from 100ms to 150ms for reliability

### Added
- **Developer Documentation**
  - New `LEARNINGS.md` file documenting lessons learned, code patterns, and debugging tips
  - Updated `HUBSPOT_DOM_STRUCTURE.md` with property label selectors, lazy loading patterns, and data attribute reference table

---

## [1.8.0] - 2025-12-11

### Added
- **Plays Editor Tabbed Interface**
  - Redesigned plays editor with 3 tabs matching wiki layout: Content, Rules, Usage
  - Content tab: Card name, type, subtitle, link, and sections
  - Rules tab: Object type, display conditions, condition builder
  - Usage tab: Coming soon placeholder for analytics

- **Media Sections in Plays**
  - New section type toggle: Text or Media
  - Media sections support embed URLs (Loom, YouTube, Vimeo, Google Drive)
  - Automatic URL conversion to embed format
  - Responsive 16:9 video player in sidepanel

- **Section Reordering & Insertion**
  - Drag-and-drop to reorder sections within plays
  - Drag handle icon on each section
  - "+" insert buttons between sections for precise positioning
  - Visual feedback during drag operations

- **Unsaved Changes Protection**
  - New confirmation dialog when navigating away with unsaved changes
  - Dialog offers Save, Discard, or Cancel options
  - Implemented for Plays, Wiki, and Banner Rules editors
  - Prevents accidental data loss

- **Shared Confirmation Dialog Component**
  - `AdminShared.showConfirmDialog()` utility function
  - Customizable title, message, and button labels
  - Keyboard support (Escape to cancel)
  - Animated overlay with accessible ARIA attributes

### Changed
- **Tab Styling Improvements**
  - Active tabs now use black text (improved readability on grey background)
  - Active tabs have semibold font weight
  - Green underline indicator retained for active state
  - Applied to both Plays and Wiki tab interfaces

### Fixed
- Confirmation dialog header now has explicit white background (was transparent)

---

## [1.7.1] - 2025-12-11

### Changed
- **Wiki Entry Structure Refactored**
  - Separated display title from trigger text for more flexibility
  - `title` (required): Display name shown in navigation tree and tooltip header
  - `trigger` (optional): Text to match on HubSpot pages to show tooltip
  - Entries without a trigger are "glossary-only" (no tooltip on HubSpot pages)
  - Aliases now serve as additional trigger terms

- **Wiki UI Updates**
  - "Term" field renamed to "Title"
  - New "Trigger Text" field for tooltip matching
  - "No tooltip" badge shows on entries without triggers in navigation tree
  - Preview now shows trigger status

### Technical
- Automatic migration of existing entries: `term` → `title` + `trigger`
- Content script skips entries without triggers when building term map
- Backward compatible with legacy `term` field

---

## [1.7.0] - 2025-12-11

### Added
- **Multi-Page Admin Architecture**
  - Admin panel now uses standalone HTML pages instead of single-page app
  - Each section (Home, Rules, Plays, Media, Wiki, Settings) is its own page
  - Faster loading and better maintainability
  - Easier to extend with new sections

- **New Wiki Two-Pane Layout**
  - Left pane: Navigation tree organized by Object > Property Group > Title
  - Right pane: Detail card with tabbed interface
  - Three tabs: Content (definition editor), Rules (conditions), Usage (stats placeholder)
  - Inline editing with unsaved changes tracking
  - Duplicate and delete functionality
  - Status toggle in card header

- **Shared Admin Utilities (AdminShared)**
  - `renderSidebar(activePage)` - Consistent navigation across all pages
  - `loadStorageData()` / `saveStorageData()` - Chrome storage access
  - `showToast()` - Toast notifications
  - `fetchProperties()` - HubSpot API integration
  - `addCondition()` / `getConditions()` - Condition builder
  - `initRichTextEditor()` - WYSIWYG editor setup
  - Constants: `OPERATORS`, `TYPE_LABELS`, `WIKI_CATEGORY_LABELS`, etc.

### Changed
- **Admin panel entry point** changed from `admin/admin.html` to `admin/pages/home.html`
- Sidepanel "Open Admin Panel" button now opens multi-page admin
- Extension popup admin link updated to multi-page admin
- `web_accessible_resources` in manifest now includes `admin/pages/*`

### Deprecated
- Single-page admin (`admin/admin.html`, `admin/admin.js`, `admin/admin.css`) is now deprecated
- These files remain for reference but are no longer used

### Technical
- New file structure under `admin/pages/`:
  - `index.html` → Redirects to `home.html`
  - `home.html/js/css` → Dashboard with onboarding and stats
  - `rules.html/js/css` → Banner rules management
  - `plays.html/js/css` → Battle cards and plays
  - `media.html/js/css` → Embedded presentations and videos
  - `wiki.html/js/css` → Two-pane wiki with tree navigation
  - `settings.html/js` → API config, display toggles, import/export
- `admin/shared.js` and `admin/shared.css` provide common functionality

---

## [1.6.1] - 2025-12-11

### Added
- **Sidepanel Tabbed Navigation**
  - New icon-based tab navigation at top of sidepanel (Plays + Settings tabs)
  - Plays tab: Shows contextual battle cards and tips for current record
  - Settings tab: Quick access to extension settings without opening admin panel

- **Sidepanel Settings Tab**
  - Enable Extension master toggle
  - Display toggles: Show Banners, Show Plays, Show Presentations, Show Wiki Tooltips
  - HubSpot API token input with save functionality
  - "Open Admin Panel" button for full configuration
  - Export/Import buttons for data backup and restore

- **Dual Entry Points for Sidepanel**
  - **Toolbar icon click** → Opens sidepanel to Settings tab
  - **FAB click on HubSpot page** → Opens sidepanel to Plays tab
  - Removed popup - extension icon now directly opens sidepanel

- **Object Type Filtering for Plays**
  - Plays now correctly filter by object type (contact, company, deal, ticket)
  - Supports both `objectType` (singular) and `objectTypes` (array) fields
  - Intelligent singular/plural normalization (handles 'companies' → 'company', etc.)

- **Live Sidepanel Updates**
  - Sidepanel cards update automatically when navigating between HubSpot records
  - FAB badge count and sidepanel content stay in sync
  - Content script pushes updates to sidepanel via messaging

### Changed
- **Sidepanel behavior on non-HubSpot pages**
  - Shows contextual "Not a HubSpot Page" message with navigation hint
  - Sidepanel remains accessible across all tabs for consistent UX

### Fixed
- Bullet list double spacing in sidepanel card content
- Section title padding in sidepanel (added 12px top margin)
- User gesture requirement for `chrome.sidePanel.open()` from FAB clicks

### Technical
- Removed `default_popup` from manifest to enable `action.onClicked` listener
- Background.js handles both toolbar icon and FAB click with appropriate tab flags
- Sidepanel.js checks `sidepanelOpenTab` storage flag on load to determine initial tab

---

## [1.6.0] - 2025-12-10

### Changed
- **Modular Architecture Refactor**
  - Split content.js into feature-specific modules for better maintainability
  - New `content/modules/` directory with isolated feature code
  - `banners.js` - Banner rendering and rule-based alerts
  - `wiki.js` - Wiki tooltips and term highlighting
  - `sidepanel.js` - FAB button and side panel for battle cards
  - `presentations.js` - Embedded presentation/media cards
  - Main `content.js` now acts as orchestrator coordinating all modules

### Added
- **Developer Documentation**
  - JSDoc comments throughout all module files
  - Clear architecture documentation explaining module interface
  - Updated README with modular architecture section
  - Each module has header explaining its purpose, features, and dependencies

### Technical
- Modules loaded in order via manifest.json (modules first, then content.js)
- Each module exports a class to window (e.g., `window.BannersModule`)
- Orchestrator initializes modules with reference to self for shared utilities
- No functionality changes - pure refactor for maintainability

---

## [1.5.0] - 2025-12-09

### Added
- **Install Plugin Onboarding Step**
  - New Step 1 in onboarding: "Install Plugin" with "Share with Team" button
  - Copies installation instructions to clipboard for easy team sharing
  - Step automatically marked as completed (user is viewing admin panel)
  - Total onboarding steps now 6: Install, API, Wiki, Rules, Plays, Team

- **Updated Extension Icons**
  - New minimalist target icon design with brand colors
  - Dark background (#1a2e05) with lime green (#b2ef63) concentric rings
  - Updated icons for 16x16, 48x48, and 128x128 sizes
  - Consistent branding across browser toolbar, popup, and sidebar

### Fixed
- **Wiki Tooltip Reliability**
  - Tooltips now consistently appear across all cards in the left sidebar
  - Added MutationObserver for lazy-loaded cards in left sidebar
  - Extended CSS selectors to match more HubSpot card types
  - Added multi-pass highlighting (500ms, 1500ms, 3000ms) for dynamic content
  - Added aggressive scan method for text elements in sidebar

- **SPA Navigation Support**
  - Tooltips now re-apply when navigating between associated records
  - Added URL change detection with proper cleanup
  - Added popstate listener for browser back/forward navigation
  - Wiki highlights properly reset on navigation

- **Media Embed Behavior**
  - Fixed duplicate media cards appearing on re-render
  - Media collapse/expand now works correctly
  - Click anywhere on header to toggle (not just the button)
  - "Open in Library" link excluded from toggle trigger

- **Tab Click Performance**
  - Tooltips no longer reload when clicking tabs in center section
  - Cleanup function now preserves wiki highlights during tab switches
  - Only removes highlights on actual navigation events

---

## [1.4.0] - 2025-12-09

### Added
- **Homepage / Onboarding**
  - New home section as the default landing page
  - 5-step onboarding guide: Connect API, Build Wiki, Create Rules, Add Plays, Invite Team
  - Progress bar showing completion status
  - Quick stats showing counts of wiki entries, rules, plays, and media
  - Content Libraries promo banner (coming soon feature)
  - Onboarding step status updates automatically as you complete tasks

- **Wiki / Field Glossary**
  - Contextual tooltips that appear when hovering over property labels in HubSpot
  - Import HubSpot fields directly with object type and property group metadata
  - Hierarchical table view organized by Object > Property Group > Property > Values
  - Define cards for individual property values (e.g., explain what each pipeline stage means)
  - Rich text definitions with formatting, lists, and links
  - Filter wiki entries by object type, category, or search term
  - Expand/collapse all groups with one click
  - Toggle switches for quickly enabling/disabling entries
  - Edit value cards directly from the table view
  - Stats bar showing total entries, enabled count, and field count

- **Wiki Import Improvements**
  - Re-import fields to update existing entries with new metadata
  - "Update available" badge for entries that can be updated
  - Preserves existing definitions when updating

### Changed
- Wiki tooltips now only target property label elements, not arbitrary text in values
  - Fixes issue where "Pipeline" would highlight inside "Sales Pipeline" value text
- Table layout optimized to fit without horizontal scrolling
- Status indicators changed from dots to toggle switches
- Reduced column widths for more compact display

### Fixed
- Folder expand/collapse clickability in wiki table
- Value index parameter properly passed to value rows

---

## [1.3.0] - 2025-12-09

### Added
- **Chrome Side Panel for Plays**
  - Plays now open in Chrome's native side panel (sidebar)
  - Click the floating action button (FAB) to open the side panel
  - Plays display with expand/collapse functionality
  - Proper empty and loading states
  - Persists while navigating between HubSpot pages

- **Rich Text Editor for Banner Messages**
  - Toolbar with bold, italic, underline, bullet lists, and links
  - WYSIWYG editing in admin panel
  - Safe HTML sanitization for content script rendering
  - Support for bulleted and numbered lists in banners

- **"Display on All Records" Option**
  - New checkbox for Rules, Plays, and Media
  - When enabled, content displays on all records of the selected object type
  - Conditions section is visually disabled (greyed out) when checked
  - Object type selector remains active for filtering

- **UI/UX Improvements**
  - Custom styled checkboxes with accent color
  - Improved checkbox-label vertical alignment
  - Banner preview now displays rich text formatting (lists, links, etc.)

### Changed
- **Complete UI Rebrand**
  - New Manrope font family throughout
  - Accent color updated to #b2ef63 (lime green)
  - Replaced all emojis with SVG icons
  - Plain CSS design system (no frameworks)
  - Consistent spacing, typography, and component styles
  - All buttons use branded green (#b2ef63) including in HubSpot pages

- **Content Script Styling**
  - Banners use HubSpot's native font (Lexend Deca) for seamless integration
  - Banner colors follow HubSpot palette for type indicators
  - Buttons and FAB use branded green accent color
  - Reduced border-radius to 3px for HubSpot consistency

### Fixed
- Bullet points now display correctly in rich text editor
- Banner preview shows rich text formatting (lists, links)
- Checkbox labels properly vertically centered

## [1.2.0] - 2025-12-09

### Added
- **Presentations**: Embed slide decks directly in HubSpot records
  - Support for Google Slides URLs (auto-converts to embed format)
  - Support for PowerPoint via OneDrive and SharePoint
  - Collapsible embed with 16:9 aspect ratio
  - "Open in Library" button to access original file
  - Fallback message with direct link if embed fails to load
  - Condition-based display (same as rules and cards)

- **Presentations Admin**
  - New "Presentations" section in admin sidebar
  - Live preview while editing
  - URL validation with sharing requirements note
  - Searchable property dropdowns for conditions

### Changed
- Removed Google Sheets integration (deprecated in favor of upcoming cloud sync)
- Updated admin panel with fourth navigation item for Presentations

## [1.1.0] - 2025-12-09

### Added
- **Full Admin Panel**: New full-page admin interface accessible from sidepanel
  - Two-column editor layout with live banner preview
  - Sidebar navigation between Rules, Plays, and Settings
  - Table view for rules with inline status toggles
  - Grid view for plays

- **Searchable Property Dropdowns**: Improved condition builder UX
  - Search bar to filter properties by name or label
  - Shows both friendly label and API property name
  - Loads properties dynamically from HubSpot API

- **AND/OR Logic Toggle**: Clear UI for condition logic
  - Toggle buttons for "All conditions (AND)" vs "Any condition (OR)"
  - Visual indication of active logic mode

- **Play Links**: Link field for external documentation
  - Add URLs to Google Docs, Notion, or any external resource
  - "View Full Document" button in play overlay
  - Auto-prefixes `https://` if missing

- **Full Property Fetching**: API now fetches all deal properties
  - No longer limited to hardcoded property list
  - Supports any custom property in conditions

### Fixed
- Property name normalization for `dealstage`, `lifecyclestage`, etc.
  - Human-readable values now used instead of internal IDs
  - Both API names and page-extracted names work in conditions

- Edit/Delete buttons in rules table now work correctly
  - Changed from inline onclick handlers to event listeners

- Modal buttons (Save, Cancel, Close) now functional
  - Replaced modals with full-page editors

### Changed
- Conditions now use custom searchable select instead of native dropdown
- Banner preview updates in real-time while editing
- Improved property extraction from HubSpot pages

## [1.0.0] - 2025-12-01

### Added
- Initial release
- Banner rules with condition-based display
- Plays with expandable sections
- Chrome extension sidepanel for quick management
- HubSpot API integration for property fetching
- Support for Contacts, Companies, Deals, and Tickets
- Import/Export functionality
- Multiple banner types (info, success, warning, error)
- Multiple play types (competitor, objection, tip, process)
