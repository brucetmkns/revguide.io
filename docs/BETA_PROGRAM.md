# RevGuide Beta Program

Welcome to the RevGuide beta program! This document covers everything you need to know as a beta tester.

## What is RevGuide?

RevGuide is a Chrome extension and web app that brings contextual guidance directly into HubSpot CRM. It helps sales teams with:
- **Contextual Banners** - Display messages based on record properties
- **Plays & Battle Cards** - Structured playbooks in a sidebar
- **Wiki Tooltips** - Definitions for HubSpot fields and terms

## Beta Program Overview

### What We're Testing
- Core functionality across different HubSpot setups
- Performance with real-world data volumes
- User experience and onboarding flow
- Edge cases and browser compatibility

### Your Role as a Beta Tester
- Use RevGuide in your daily HubSpot workflow
- Report bugs and issues you encounter
- Share feedback on features and usability
- Suggest improvements

## Getting Started

### 1. Install the Extension

**Option A: From ZIP (Developer Mode)**
1. Download the extension ZIP from the link provided
2. Unzip to a folder on your computer
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top-right)
5. Click "Load unpacked"
6. Select the unzipped folder

**Option B: From Chrome Web Store (when available)**
1. Click the Chrome Web Store link provided
2. Click "Add to Chrome"
3. Confirm installation

### 2. Create Your Account
1. Click the RevGuide icon in your Chrome toolbar
2. Click "Open Admin Panel"
3. Sign up at app.revguide.io with your email
4. Connect your HubSpot account via OAuth

### 3. Create Your First Content
1. Go to **Banners** → Add a test banner
2. Go to **Wiki** → Import some HubSpot fields
3. Go to **Plays** → Create a simple play

### 4. Test in HubSpot
1. Navigate to a HubSpot record (deal, contact, company)
2. Look for your banner at the top
3. Hover over field labels to see wiki tooltips
4. Click the RevGuide FAB to open the plays sidebar

## How to Report Issues

### GitHub Issues (Preferred)
Report bugs at: **[github.com/your-repo/revguide/issues](https://github.com/your-repo/revguide/issues)**

When reporting, include:
- **What happened** - Describe the issue
- **What you expected** - What should have happened
- **Steps to reproduce** - How can we recreate it
- **Screenshots** - Visual evidence if applicable
- **Browser/OS** - Chrome version, Windows/Mac
- **Console errors** - Right-click → Inspect → Console tab

### Email
For sensitive issues or questions: **beta@revguide.io**

### Feedback Form
Quick feedback: **[forms.gle/your-feedback-form](https://forms.gle/your-feedback-form)**

## Known Issues

Please see the [Known Issues](#known-issues-1) section below before reporting.

### Current Known Issues

1. **Wiki tooltips may not appear on first page load**
   - Workaround: Refresh the page
   - Status: Investigating

2. **Sidebar may flash briefly on page navigation**
   - Workaround: None needed, cosmetic only
   - Status: Low priority

3. **Import may timeout with very large field sets (500+)**
   - Workaround: Import in smaller batches
   - Status: Planned fix

4. **Chrome Side Panel may not open on first click**
   - Workaround: Click the icon twice
   - Status: Chrome API limitation

## Feature Requests

We'd love to hear your ideas! Submit feature requests via:
- GitHub Issues with the `enhancement` label
- Email to feedback@revguide.io
- The feedback form

## Beta Program Terms

### Data & Privacy
- Your beta usage data may be analyzed to improve the product
- We collect error reports to fix bugs
- Your HubSpot CRM data is not stored by us
- See our full [Privacy Policy](./PRIVACY_POLICY.md)

### No Warranty
- Beta software may contain bugs
- Features may change before final release
- Service availability is not guaranteed
- Back up important configurations using Export

### Confidentiality
- Please don't share beta access publicly
- Screenshots for bug reports are fine
- Don't share your account credentials

### Feedback Rights
- We may use your feedback to improve RevGuide
- You're not obligated to provide feedback
- All suggestions become RevGuide property

## Support

- **Email**: support@revguide.io
- **Response time**: 1-2 business days
- **Office hours**: Monday-Friday, 9am-5pm EST

## Thank You!

Your participation helps us build a better product. We genuinely appreciate your time and feedback.

Questions? Reach out to us anytime at beta@revguide.io

---

# Known Issues

This section tracks known issues in the current beta release.

## Critical
*None currently*

## High Priority

### HubSpot OAuth Token Refresh
- **Issue**: Token may fail to refresh in rare cases
- **Symptoms**: "Failed to fetch properties" error
- **Workaround**: Disconnect and reconnect HubSpot in Settings
- **Status**: Monitoring

## Medium Priority

### Wiki Tooltip Timing
- **Issue**: Tooltips may not appear immediately on HubSpot cards that lazy-load
- **Symptoms**: No tooltip icon on some field labels
- **Workaround**: Wait for page to fully load, or refresh
- **Status**: Under investigation

### Plays Sidebar Memory
- **Issue**: Sidebar may use more memory with many plays open
- **Symptoms**: Chrome may slow down after extended use
- **Workaround**: Reload extension periodically
- **Status**: Planned optimization

## Low Priority

### UI Polish
- Some transitions are not smooth
- Dark mode not supported yet
- Mobile/tablet layout not optimized (desktop only)

## Fixed in Recent Updates

### v1.9.9
- ~~Wiki entries not matching case-insensitively~~
- ~~Banner preview not showing rich text~~

---

*Last updated: December 2024*
