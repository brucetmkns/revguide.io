# Chrome Web Store Submission Guide

This guide covers preparing RevGuide for Chrome Web Store submission.

## Pre-Submission Checklist

### Code Review
- [ ] Remove all `console.log` statements (or set to production level)
- [ ] Remove hardcoded test data
- [ ] Verify manifest.json is complete and valid
- [ ] Check all permissions are necessary and documented
- [ ] Remove unused permissions

### Assets Required
- [ ] 128x128 icon (PNG)
- [ ] 440x280 small promo tile (PNG/JPG)
- [ ] 1280x800 large promo tile (optional but recommended)
- [ ] 1280x800 marquee tile (optional)
- [ ] 1-5 screenshots (1280x800 or 640x400)
- [ ] YouTube video (optional)

### Documentation
- [ ] Privacy policy URL (must be publicly accessible)
- [ ] Detailed description (up to 16,000 chars)
- [ ] Short description (up to 132 chars)

## Store Listing Content

### Extension Name
```
RevGuide - HubSpot Sales Enablement
```

### Short Description (132 chars)
```
Display contextual banners, plays, and wiki tooltips on HubSpot CRM records. Help your team with the right info at the right time.
```

### Detailed Description
```
RevGuide brings contextual guidance directly into HubSpot CRM. Help your sales team with the right information at the right time.

KEY FEATURES:

📢 Contextual Banners
Display important messages on CRM records based on field values. Alert reps about key information, next steps, or compliance requirements.

📚 Plays & Battle Cards
Create structured playbooks that appear in a persistent sidebar. Include text, media embeds (Loom, YouTube), and even editable HubSpot fields.

📖 Wiki Tooltips
Define terms and field meanings that appear as tooltips when hovering over property labels. Import directly from HubSpot with one click.

🎯 Smart Conditions
Show content based on deal stage, amount, industry, or any HubSpot property. Use AND/OR logic for complex rules.

👥 Team Collaboration
Share your configuration across your entire team. Everyone sees the same contextual guidance.

🔒 Secure & Private
- Connects via HubSpot OAuth (no API tokens needed)
- Your CRM data stays in HubSpot
- Content stored securely in our cloud

PERFECT FOR:
• Sales teams needing consistent messaging
• Revenue operations standardizing processes
• Onboarding new sales reps
• Maintaining compliance and quality

GET STARTED:
1. Install the extension
2. Sign up at app.revguide.io
3. Connect your HubSpot account
4. Create your first banner or play
5. See it appear instantly in HubSpot!

Works with all HubSpot plans including Free CRM.

Questions? Visit app.revguide.io or email support@revguide.io
```

### Category
```
Productivity
```

### Language
```
English
```

## Screenshots

Prepare 3-5 screenshots showing:

1. **Banner on HubSpot record** - Show a contextual banner with a message
2. **Plays sidebar** - Show the side panel with a play open
3. **Wiki tooltip** - Show a tooltip on a field label
4. **Admin panel** - Show the clean admin interface
5. **Condition builder** - Show the rule configuration

### Screenshot Tips
- Use real (or realistic demo) data
- Highlight the extension UI with annotations if helpful
- Show value proposition clearly
- 1280x800 or 640x400 recommended

## Privacy Policy

Host the privacy policy at a public URL:
- `https://revguide.io/privacy` (recommended)
- Or `https://app.revguide.io/privacy`

Ensure it covers:
- What data is collected
- How data is used
- Chrome extension permissions explanation
- HubSpot OAuth integration details
- Contact information

See `docs/PRIVACY_POLICY.md` for the full policy.

## Permissions Justification

When submitting, you'll need to justify each permission:

| Permission | Justification |
|------------|---------------|
| `storage` | Required to store user's banners, plays, wiki entries, and settings locally for offline access and performance. |
| `activeTab` | Required to detect when user is viewing a HubSpot record page and inject contextual content. |
| `sidePanel` | Required to display the plays sidebar in Chrome's side panel for persistent access across pages. |
| `tabs` | Required to detect tab changes and navigation within HubSpot to update displayed content accordingly. |
| `scripting` | Required to refresh HubSpot page after user saves field changes via the plays sidebar. |

### Host Permissions

| Host | Justification |
|------|---------------|
| `*.hubspot.com` | Required to inject contextual banners, tooltips, and sidebar into HubSpot CRM pages. |
| `api.hubapi.com` | Required to fetch HubSpot property definitions for field import and to save field updates. |

## Build Extension Package

```bash
# Create a clean build directory
mkdir -p dist/extension

# Copy required files (exclude dev files)
rsync -av --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='docs' \
  --exclude='supabase' \
  --exclude='api' \
  --exclude='backups' \
  --exclude='*.md' \
  --exclude='.env*' \
  --exclude='.github' \
  --exclude='tests' \
  . dist/extension/

# Create ZIP
cd dist
zip -r revguide-extension.zip extension/

echo "Package ready: dist/revguide-extension.zip"
```

## Submission Process

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

2. Pay one-time $5 developer fee (if first time)

3. Click "New Item"

4. Upload the ZIP file

5. Fill in store listing:
   - Title
   - Description
   - Category
   - Screenshots
   - Privacy policy URL

6. Set visibility:
   - **Private** - Only you can see (for testing)
   - **Unlisted** - Anyone with link (for beta)
   - **Public** - Everyone (for launch)

7. Submit for review

## Review Timeline

- Initial review: 1-3 business days typically
- May take longer if permissions need justification
- You'll receive email with approval or feedback

## Beta Distribution Options

### Option 1: Unlisted on Web Store
- Submit as "Unlisted"
- Share direct link with beta testers
- Still goes through Google review

### Option 2: Developer Mode
- Share ZIP file directly
- Users load via `chrome://extensions`
- No review, but not auto-updating
- Good for internal testing

### Option 3: Google Groups
- Create a Google Group for beta testers
- Set extension visibility to that group
- Members can install from store

## Post-Submission

After approval:
1. Announce to beta testers
2. Monitor reviews and ratings
3. Set up crash reporting (Sentry)
4. Prepare for feedback collection

## Updates

To publish updates:
1. Increment version in `manifest.json`
2. Create new ZIP package
3. Upload to developer dashboard
4. Submit for review

Updates usually review faster than initial submission.

## Common Rejection Reasons

1. **Excessive permissions** - Only request what you need
2. **Missing privacy policy** - Must be accessible and complete
3. **Misleading description** - Be accurate about features
4. **Broken functionality** - Test thoroughly before submission
5. **Trademark issues** - Don't claim affiliation with HubSpot

## Support

For Chrome Web Store issues:
- [Developer Support](https://support.google.com/chrome_webstore/contact/developer_support)
- [Policy FAQ](https://developer.chrome.com/docs/webstore/program_policies/)
