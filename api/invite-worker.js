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
  fromEmail: 'RevGuide <team@supered.io>', // Update with your verified domain
  chromeStoreUrl: 'https://chrome.google.com/webstore', // Update when published
  allowedOrigins: [
    'chrome-extension://*',
    'https://supered.io',
  ]
};

// ===========================================
// EMAIL TEMPLATES
// ===========================================

function buildInvitationEmailHtml(role) {
  const roleText = role === 'admin' ? 'an Admin' : 'a User';
  const roleDescription = role === 'admin'
    ? 'As an Admin, you can manage content, create banners, plays, wiki entries, and invite other team members.'
    : 'As a User, you can use all the contextual guidance features within HubSpot.';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      You've been invited to join <strong>RevGuide</strong> as ${roleText}.
    </p>

    <p style="margin-bottom: 20px;">
      RevGuide is a Chrome extension that provides contextual guidance, wiki tooltips, and plays directly within HubSpot.
    </p>

    <h2 style="font-size: 18px; color: #111827; margin-bottom: 15px;">Getting Started:</h2>

    <ol style="padding-left: 20px; margin-bottom: 25px;">
      <li style="margin-bottom: 10px;">
        <strong>Install the Extension</strong><br>
        <a href="${CONFIG.chromeStoreUrl}" style="color: #667eea;">Download from Chrome Web Store</a>
      </li>
      <li style="margin-bottom: 10px;">
        <strong>Log in with HubSpot</strong><br>
        Open the extension and connect your HubSpot account
      </li>
      <li style="margin-bottom: 10px;">
        <strong>Start Using</strong><br>
        Navigate to any HubSpot record to see contextual banners, plays, and wiki tooltips
      </li>
    </ol>

    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        <strong>Your Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}<br>
        ${roleDescription}
      </p>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 0;">
      Questions? Reply to this email or contact your team administrator.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    Sent via RevGuide
  </div>
</body>
</html>`;
}

function buildInvitationEmailText(role) {
  const roleText = role === 'admin' ? 'an Admin' : 'a User';
  const roleDescription = role === 'admin'
    ? 'As an Admin, you can manage content, create banners, plays, wiki entries, and invite other team members.'
    : 'As a User, you can use all the contextual guidance features within HubSpot.';

  return `You're Invited to RevGuide!

You've been invited to join RevGuide as ${roleText}.

RevGuide is a Chrome extension that provides contextual guidance, wiki tooltips, and plays directly within HubSpot.

Getting Started:

1. Install the Extension
   Download from Chrome Web Store: ${CONFIG.chromeStoreUrl}

2. Log in with HubSpot
   Open the extension and connect your HubSpot account

3. Start Using
   Navigate to any HubSpot record to see contextual banners, plays, and wiki tooltips

Your Role: ${role.charAt(0).toUpperCase() + role.slice(1)}
${roleDescription}

Questions? Reply to this email or contact your team administrator.

---
Sent via RevGuide`;
}

// ===========================================
// CORS HANDLING
// ===========================================

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';

  // Allow Chrome extensions and specified domains
  const isAllowed = origin.startsWith('chrome-extension://') ||
                    CONFIG.allowedOrigins.some(allowed => origin.includes(allowed.replace('*', '')));

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : CONFIG.allowedOrigins[0],
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
    const { email, role } = body;

    // Validate input
    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!role || !['user', 'admin'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Role must be "user" or "admin"' }), {
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
        subject: "You're invited to RevGuide",
        html: buildInvitationEmailHtml(role),
        text: buildInvitationEmailText(role)
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
