/**
 * RevGuide - Invite API Worker
 *
 * Cloudflare Worker that handles sending invitation emails via Resend.
 * Deploy to Cloudflare Workers and set the RESEND_API_KEY environment variable.
 *
 * Deployment:
 * 1. Install Wrangler: npm install -g wrangler
 * 2. Login: wrangler login
 * 3. Create worker: wrangler init revguide-api
 * 4. Copy this file to src/index.js
 * 5. Set secret: wrangler secret put RESEND_API_KEY
 * 6. Deploy: wrangler deploy
 */

// ===========================================
// CONFIGURATION
// ===========================================

const CONFIG = {
  fromEmail: 'RevGuide <notifications@email.revguide.io>',
  appUrl: 'https://app.revguide.io',
  chromeStoreUrl: 'https://chrome.google.com/webstore', // Update when published
  allowedOrigins: [
    'chrome-extension://*',
    'https://app.revguide.io',
    'https://supered.io',
  ]
};

// ===========================================
// EMAIL TEMPLATES
// ===========================================

function buildInvitationEmailHtml(role, token, orgName) {
  const roleLabels = {
    admin: 'an Admin',
    editor: 'an Editor',
    viewer: 'a Viewer'
  };
  const roleDescriptions = {
    admin: 'As an Admin, you can manage content, create banners, plays, wiki entries, and invite other team members.',
    editor: 'As an Editor, you can create and edit banners, plays, and wiki entries.',
    viewer: 'As a Viewer, you can view all contextual guidance features within HubSpot.'
  };
  const roleText = roleLabels[role] || 'a team member';
  const roleDescription = roleDescriptions[role] || '';

  const inviteLink = `${CONFIG.appUrl}/invite?token=${encodeURIComponent(token)}`;
  const orgDisplay = orgName ? ` at <strong>${orgName}</strong>` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #111827; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited to RevGuide!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      You've been invited to join${orgDisplay} as ${roleText}.
    </p>

    <p style="margin-bottom: 25px;">
      RevGuide provides contextual guidance, wiki tooltips, and plays directly within HubSpot to help your team work smarter.
    </p>

    <div style="text-align: center; margin-bottom: 25px;">
      <a href="${inviteLink}" style="display: inline-block; background: #b2ef63; color: #111827; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Accept Invitation
      </a>
    </div>

    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        <strong>Your Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}<br>
        ${roleDescription}
      </p>
    </div>

    <h2 style="font-size: 16px; color: #111827; margin-bottom: 15px;">After accepting:</h2>

    <ol style="padding-left: 20px; margin-bottom: 25px; font-size: 14px;">
      <li style="margin-bottom: 8px;">
        <strong>Install the Chrome Extension</strong><br>
        <a href="${CONFIG.chromeStoreUrl}" style="color: #0091ae;">Download from Chrome Web Store</a>
      </li>
      <li style="margin-bottom: 8px;">
        <strong>Sign in to the extension</strong><br>
        Click "Sign In" in the extension sidebar
      </li>
      <li style="margin-bottom: 8px;">
        <strong>Browse HubSpot</strong><br>
        See contextual banners, plays, and wiki tooltips on record pages
      </li>
    </ol>

    <p style="font-size: 13px; color: #9ca3af; margin-bottom: 0;">
      This invitation expires in 7 days. Questions? Reply to this email.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    RevGuide - Contextual guidance for your revenue team
  </div>
</body>
</html>`;
}

function buildInvitationEmailText(role, token, orgName) {
  const roleLabels = {
    admin: 'an Admin',
    editor: 'an Editor',
    viewer: 'a Viewer'
  };
  const roleDescriptions = {
    admin: 'As an Admin, you can manage content, create banners, plays, wiki entries, and invite other team members.',
    editor: 'As an Editor, you can create and edit banners, plays, and wiki entries.',
    viewer: 'As a Viewer, you can view all contextual guidance features within HubSpot.'
  };
  const roleText = roleLabels[role] || 'a team member';
  const roleDescription = roleDescriptions[role] || '';

  const inviteLink = `${CONFIG.appUrl}/invite?token=${encodeURIComponent(token)}`;
  const orgDisplay = orgName ? ` at ${orgName}` : '';

  return `You're Invited to RevGuide!

You've been invited to join${orgDisplay} as ${roleText}.

RevGuide provides contextual guidance, wiki tooltips, and plays directly within HubSpot to help your team work smarter.

Accept your invitation here:
${inviteLink}

Your Role: ${role.charAt(0).toUpperCase() + role.slice(1)}
${roleDescription}

After accepting:

1. Install the Chrome Extension
   Download from Chrome Web Store: ${CONFIG.chromeStoreUrl}

2. Sign in to the extension
   Click "Sign In" in the extension sidebar

3. Browse HubSpot
   See contextual banners, plays, and wiki tooltips on record pages

This invitation expires in 7 days. Questions? Reply to this email.

---
RevGuide - Contextual guidance for your revenue team`;
}

// ===========================================
// CORS HANDLING
// ===========================================

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';

  // Allow Chrome extensions and specified domains
  const isAllowed = origin.startsWith('chrome-extension://') ||
                    CONFIG.allowedOrigins.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ===========================================
// REQUEST HANDLER
// ===========================================

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);

    // Route: POST /api/invite
    if (url.pathname === '/api/invite' || url.pathname === '/invite') {
      return handleInvite(request, env, corsHeaders);
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({ status: 'ok', service: 'revguide-api' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

async function handleInvite(request, env, corsHeaders) {
  try {
    // Parse request body
    const body = await request.json();
    const { email, role, token, orgName } = body;

    // Validate input
    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Accept valid roles
    const validRoles = ['viewer', 'editor', 'admin'];
    if (!role || !validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Role must be "viewer", "editor", or "admin"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Invitation token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check for API key
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: CONFIG.fromEmail,
        to: [email],
        subject: orgName ? `You're invited to join ${orgName} on RevGuide` : "You're invited to RevGuide",
        html: buildInvitationEmailHtml(role, token, orgName),
        text: buildInvitationEmailText(role, token, orgName)
      })
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json().catch(() => ({}));
      console.error('Resend error:', errorData);
      return new Response(JSON.stringify({
        error: errorData.message || 'Failed to send email'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const result = await resendResponse.json();

    return new Response(JSON.stringify({
      success: true,
      message: 'Invitation sent',
      id: result.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Invite error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
