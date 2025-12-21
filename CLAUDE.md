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
