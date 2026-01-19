# Claude Code Instructions

Project-specific instructions for Claude Code sessions.

## Important: Project Identity

**This project is RevGuide** - a Chrome extension + SaaS for HubSpot.

- **Our domains**: `revguide.io`, `app.revguide.io`, `help.revguide.io`
- **Supered is a COMPETITOR** - never use `supered.io` or any Supered branding
- When the docs reference "Supered-style" patterns, this describes implementation techniques we studied - it does NOT mean we are Supered
- All external links, help URLs, and branding must use RevGuide domains

## Key Documentation

- `docs/AI_CONTEXT.md` - Project overview, architecture, key objects
- `docs/LEARNINGS.md` - Lessons learned, patterns, debugging tips
- `CHANGELOG.md` - Version history and changes

## Deployment

- **DO NOT** run `npx vercel` or `vercel` CLI commands for deployments
- Just `git push` - Vercel auto-deploys via GitHub webhook
- The free plan has a 100/day limit on API (CLI) deployments, but unlimited git-push deployments

## Versioning

Use semantic versioning (`MAJOR.MINOR.PATCH`) with **conservative increments**:

**PATCH (0.0.X)** - Default for most changes:
- Bug fixes
- Small UI tweaks
- Copy/text changes
- Performance improvements
- Refactoring without behavior changes

**MINOR (0.X.0)** - Only when adding significant functionality:
- New user-facing features
- New settings/options
- New integrations or API endpoints
- Significant UI additions (new pages, panels, components)

**MAJOR (X.0.0)** - Reserved for breaking changes:
- Breaking API changes
- Major architectural rewrites
- Changes requiring user migration/action
- Incompatible data format changes

**Guidelines:**
- When in doubt, use PATCH
- Multiple small fixes in one release = still PATCH
- A new feature + bug fixes = MINOR (the highest wins)
- **Minimize top-level version jumps** - prefer 2.1.0 over 3.0.0 unless truly breaking
- Batch multiple features into a single MINOR bump when releasing to Chrome Web Store
- Update `manifest.json` version and add entry to `CHANGELOG.md`

## Chrome Web Store Releases

**Packaging:**
```bash
# Build and create versioned zip
npm run build
./scripts/package-extension.sh
```

**Zip Naming Convention:**
- Format: `revguide-extension-v{VERSION}.zip`
- Example: `revguide-extension-v2.0.0.zip`
- Store versioned zips in project root for traceability
- The `dist/` folder contains the unversioned `revguide-extension.zip` (gitignored)

**Release Checklist:**
1. Ensure all changes are committed
2. Update `manifest.json` version
3. Add changelog entry for the version
4. Run `npm run build` to process Tailwind
5. Run `./scripts/package-extension.sh` to create versioned zip
6. Upload to Chrome Web Store Developer Dashboard
7. Commit the versioned zip for historical reference

**Version History (Chrome Web Store uploads):**
- v1.9.9 - 2025-12-15
- v2.0.0 - 2025-01-19 (submitted, pending review)

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

### Client-Side IDs vs Database UUIDs
- Client-side creates temporary IDs like `wiki_${Date.now()}` for local array management
- Supabase uses UUID for `id` and `parent_id` columns
- Never pass client-side IDs to database - exclude `id` field on insert, let Supabase generate
- Validate UUID format before update/delete: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- If entry ID is not a valid UUID, treat as new entry (call create, not update)

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

### Tailwind CSS (Preferred for New Work)

**Use Tailwind utilities for all new UI work.** The project uses Tailwind CSS v3 with custom theme tokens matching the existing design system.

**Include in HTML pages:**
```html
<link rel="stylesheet" href="/styles/base.css">
<link rel="stylesheet" href="/styles/icons.css">
<link rel="stylesheet" href="/styles/tailwind-output.css">
```

**Key files:**
- `tailwind.config.js` - Theme config with RevGuide colors/spacing
- `styles/tailwind.css` - Entry file with custom component classes
- `styles/tailwind-output.css` - Generated output (gitignored)

**Custom colors available:**
- `bg-primary`, `text-primary`, `border-primary` (lime green)
- `bg-surface`, `bg-bg`, `bg-bg-subtle`, `bg-bg-muted`
- `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `text-text-muted`
- `border-border`, `border-border-strong`, `border-border-subtle`
- `bg-success`, `bg-danger`, `bg-warning`, `bg-info` (with `-bg` variants)

**Custom component classes (in `styles/tailwind.css`):**
- `.input` - Styled form input
- `.btn-outline` - Outline button
- `.card-tw`, `.card-tw-header`, `.card-tw-body` - Card components
- `.badge-tw`, `.badge-tw-primary/success/warning/danger` - Badges
- `.alert`, `.alert-info/success/warning/danger` - Alert boxes

**Build command:** `npm run build` (processes Tailwind automatically)

**Migration approach:** Keep existing component classes (`.btn`, `.card`, etc.) working alongside Tailwind. Migrate pages incrementally as they're touched.

## Common Gotchas

1. **RLS + Joins**: PostgREST queries with joins can fail - use SECURITY DEFINER functions
2. **Chrome storage**: Always disconnect MutationObserver before DOM changes to avoid loops
3. **HubSpot DOM**: Target innermost text containers, not structural elements like `<th>`
4. **Cache invalidation**: After fixing data transformations, clear cached data
5. **UUID validation**: Client-side `wiki_*` IDs must never reach Supabase UUID columns - validate and exclude
