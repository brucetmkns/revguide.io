# Changelog

All notable changes to HubSpot Helper will be documented in this file.

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
  - WYSIWYG editing in admin panel and popup
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
- **Full Admin Panel**: New full-page admin interface accessible from popup
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
  - "View Full Document" button in overlay popup
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
- Chrome extension popup for quick management
- HubSpot API integration for property fetching
- Support for Contacts, Companies, Deals, and Tickets
- Import/Export functionality
- Multiple banner types (info, success, warning, error)
- Multiple play types (competitor, objection, tip, process)
