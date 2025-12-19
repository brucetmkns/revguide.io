# Claude Code Instructions

Project-specific instructions for Claude Code sessions.

## Key Documentation

- `docs/AI_CONTEXT.md` - Project overview, architecture, key objects
- `docs/LEARNINGS.md` - Lessons learned, patterns, debugging tips
- `CHANGELOG.md` - Version history and changes

## Content Architecture (v2.0)

RevGuide uses a **unified Cards system** for all content types:

### Card Types
- **definition** - Tooltip with term definition (replaces Wiki)
- **alert** - Banner notification on records (replaces Banners/Rules)
- **battlecard** - Reference guide in side panel (replaces Plays)
- **asset** - Shareable content link (new)

### Display Modes
Cards can appear in multiple places simultaneously:
- **tooltip** - Inline icon with popup definition
- **banner** - Alert bar at top of record page
- **sidepanel** - FAB button opens side panel with card details

### Key Files
- `/admin/pages/cards.js` - CardsPage admin UI
- `/content/modules/cards.js` - CardsModule display orchestrator
- `/supabase/migrations/022_unified_cards_table.sql` - Database schema
- `/supabase/migrations/023_migrate_to_cards.sql` - Migration functions

### Legacy Compatibility
The system auto-migrates legacy data (wiki_entries, banners, plays) to unified cards.
Extension context converts legacy Chrome storage format on-the-fly via `AdminShared.wikiToCard()`, etc.

## Deployment

- **DO NOT** run `npx vercel` or `vercel` CLI commands for deployments
- Just `git push` - Vercel auto-deploys via GitHub webhook
- The free plan has a 100/day limit on API (CLI) deployments, but unlimited git-push deployments

## Code Patterns

### Dual Context (Web vs Extension)
The admin panel runs in two contexts. Always check:
```javascript
if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
  // Web context: Use Supabase directly
} else {
  // Extension context: Use Chrome storage
}
```

### Field Name Mapping
- JavaScript: camelCase (`objectType`, `displayOnAll`)
- Supabase/PostgreSQL: snake_case (`object_type`, `display_on_all`)
- Always map when saving to/loading from database

### SVG Attributes
Use `element.setAttribute()` for SVG attributes, not `.style`:
```javascript
// Correct for SVG
element.setAttribute('stroke-dashoffset', value);
// Wrong - doesn't work for SVG attributes
element.style.strokeDashoffset = value;
```

## Style Guide

- No emojis in code or UI unless explicitly requested
- Use project icons from `styles/icons.css` (e.g., `icon-book`, `icon-link`)
- Follow existing CSS variables from `styles/base.css`
- Font: Manrope (via Google Fonts)
- Primary color: `#b2ef63` (lime green)

## Common Gotchas

1. **RLS + Joins**: PostgREST queries with joins can fail - use SECURITY DEFINER functions
2. **Chrome storage**: Always disconnect MutationObserver before DOM changes to avoid loops
3. **HubSpot DOM**: Target innermost text containers, not structural elements like `<th>`
4. **Cache invalidation**: After fixing data transformations, clear cached data
