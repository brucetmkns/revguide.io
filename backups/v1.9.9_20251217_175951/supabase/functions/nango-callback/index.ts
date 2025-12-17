// Follow Deno edge function conventions
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const NANGO_SECRET_KEY = Deno.env.get('NANGO_SECRET_KEY')!

// HubSpot API version (2025 platform requirement)
// See: https://developers.hubspot.com/changelog/introducing-the-hubspot-developer-platform-2025
const HUBSPOT_API_VERSION = '2025-02'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()

  try {
    // Route to appropriate handler
    switch (path) {
      case 'session':
        return await handleCreateSession(req)
      case 'webhook':
        return await handleNangoWebhook(req)
      case 'connection':
        return await handleGetConnection(req)
      case 'disconnect':
        return await handleDisconnect(req)
      case 'proxy':
        return await handleProxy(req)
      default:
        return new Response(
          JSON.stringify({ error: 'Not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Create a Nango Connect session token
 * Required for frontend SDK since public keys are deprecated
 */
async function handleCreateSession(req: Request): Promise<Response> {
  const body = await req.json()
  const { endUser, allowedIntegrations } = body

  if (!endUser?.id) {
    return new Response(
      JSON.stringify({ error: 'endUser.id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Call Nango API to create connect session
    const response = await fetch('https://api.nango.dev/connect/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        end_user: {
          id: endUser.id,
          ...(endUser.email && { email: endUser.email }),
          ...(endUser.displayName && { display_name: endUser.displayName })
        },
        allowed_integrations: allowedIntegrations || ['hubspot']
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Nango session creation failed:', response.status, errorText)
      console.error('NANGO_SECRET_KEY exists:', !!NANGO_SECRET_KEY, 'length:', NANGO_SECRET_KEY?.length)
      return new Response(
        JSON.stringify({ error: 'Failed to create session', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()

    return new Response(
      JSON.stringify({ token: data.data.token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Session creation error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create session' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Handle Nango webhook after successful OAuth
 * Called by Nango when a user completes OAuth flow
 */
async function handleNangoWebhook(req: Request): Promise<Response> {
  const body = await req.json()
  console.log('[Nango Webhook] Received:', JSON.stringify(body))

  const {
    type,
    connectionId,
    providerConfigKey,
    provider,
    environment
  } = body

  // Only handle new connection events
  if (type !== 'auth' || !connectionId) {
    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get connection details from Nango
  const connectionDetails = await fetchNangoConnection(connectionId)
  if (!connectionDetails) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch connection details' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get HubSpot portal info
  const portalInfo = await fetchHubSpotPortalInfo(connectionId)
  if (!portalInfo) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch portal info' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Create Supabase client with service role
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Check if organization exists for this portal
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('hubspot_portal_id', portalInfo.portalId)
    .single()

  let result: {
    organizationId: string
    organizationName: string
    isNewOrg: boolean
    existingOrgFound: boolean
  }

  if (existingOrg) {
    // Organization exists - user will be prompted to join or create new
    result = {
      organizationId: existingOrg.id,
      organizationName: existingOrg.name,
      isNewOrg: false,
      existingOrgFound: true
    }
  } else {
    // Create new organization
    const { data: newOrg, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: portalInfo.portalName || portalInfo.portalDomain || 'My Organization',
        hubspot_portal_id: portalInfo.portalId,
        hubspot_portal_domain: portalInfo.portalDomain,
        nango_connection_id: connectionId
      })
      .select()
      .single()

    if (orgError) {
      console.error('Failed to create organization:', orgError)
      return new Response(
        JSON.stringify({ error: 'Failed to create organization' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create hubspot_connection record
    await supabase
      .from('hubspot_connections')
      .insert({
        organization_id: newOrg.id,
        portal_id: portalInfo.portalId,
        portal_domain: portalInfo.portalDomain,
        portal_name: portalInfo.portalName,
        nango_connection_id: connectionId,
        is_active: true
      })

    result = {
      organizationId: newOrg.id,
      organizationName: newOrg.name,
      isNewOrg: true,
      existingOrgFound: false
    }
  }

  // Store result in a temporary table for the frontend to fetch
  await supabase
    .from('oauth_completions')
    .upsert({
      connection_id: connectionId,
      portal_id: portalInfo.portalId,
      portal_name: portalInfo.portalName,
      organization_id: result.organizationId,
      organization_name: result.organizationName,
      is_new_org: result.isNewOrg,
      existing_org_found: result.existingOrgFound,
      created_at: new Date().toISOString()
    }, { onConflict: 'connection_id' })

  return new Response(
    JSON.stringify({ success: true, ...result }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Get connection details for a connection ID or end_user ID
 */
async function handleGetConnection(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const connectionId = url.searchParams.get('connectionId')

  if (!connectionId) {
    return new Response(
      JSON.stringify({ error: 'connectionId required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // First try direct connection lookup
  let connection = await fetchNangoConnection(connectionId)
  let actualConnectionId = connectionId

  // If not found, try to find by end_user ID
  if (!connection) {
    console.log('Connection not found directly, searching by end_user ID:', connectionId)
    const foundConnection = await findConnectionByEndUser(connectionId)
    if (foundConnection) {
      actualConnectionId = foundConnection.connection_id
      connection = foundConnection
    }
  }

  if (!connection) {
    return new Response(
      JSON.stringify({ isConnected: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get portal info using the actual Nango connection ID
  const portalInfo = await fetchHubSpotPortalInfo(actualConnectionId)

  return new Response(
    JSON.stringify({
      isConnected: true,
      connectionId: actualConnectionId,
      nangoConnectionId: actualConnectionId,
      ...portalInfo
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Disconnect a HubSpot connection
 */
async function handleDisconnect(req: Request): Promise<Response> {
  const { connectionId } = await req.json()

  if (!connectionId) {
    return new Response(
      JSON.stringify({ error: 'connectionId required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Delete connection from Nango
  const response = await fetch(
    `https://api.nango.dev/connection/${connectionId}?provider_config_key=hubspot`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${NANGO_SECRET_KEY}`
      }
    }
  )

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to disconnect' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Update database
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  await supabase
    .from('hubspot_connections')
    .update({ is_active: false })
    .eq('nango_connection_id', connectionId)

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Proxy requests to HubSpot via Nango
 */
async function handleProxy(req: Request): Promise<Response> {
  const { connectionId, endpoint, method = 'GET', body } = await req.json()

  if (!connectionId || !endpoint) {
    return new Response(
      JSON.stringify({ error: 'connectionId and endpoint required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Resolve the actual Nango connection ID
  let actualConnectionId = connectionId

  // First check if it's a valid Nango connection ID
  const directConnection = await fetchNangoConnection(connectionId)
  if (!directConnection) {
    // Try to find by end_user ID
    console.log('Proxy: Connection not found directly, searching by end_user ID:', connectionId)
    const foundConnection = await findConnectionByEndUser(connectionId)
    if (foundConnection) {
      actualConnectionId = foundConnection.connection_id
      console.log('Proxy: Found connection:', actualConnectionId)
    } else {
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // Make request through Nango proxy with HubSpot API versioning
  const nangoResponse = await fetch(
    `https://api.nango.dev/proxy${endpoint}`,
    {
      method,
      headers: {
        'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
        'Connection-Id': actualConnectionId,
        'Provider-Config-Key': 'hubspot',
        'Content-Type': 'application/json',
        // HubSpot 2025 platform requires date-based API versioning
        'X-HubSpot-API-Version': HUBSPOT_API_VERSION
      },
      body: body ? JSON.stringify(body) : undefined
    }
  )

  const data = await nangoResponse.json()

  return new Response(
    JSON.stringify(data),
    {
      status: nangoResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

/**
 * Fetch connection details from Nango API
 */
async function fetchNangoConnection(connectionId: string): Promise<any> {
  try {
    const response = await fetch(
      `https://api.nango.dev/connection/${connectionId}?provider_config_key=hubspot`,
      {
        headers: {
          'Authorization': `Bearer ${NANGO_SECRET_KEY}`
        }
      }
    )

    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to fetch Nango connection:', error)
    return null
  }
}

/**
 * List all HubSpot connections and find one by end_user ID
 */
async function findConnectionByEndUser(endUserId: string): Promise<any> {
  try {
    const response = await fetch(
      `https://api.nango.dev/connections`,
      {
        headers: {
          'Authorization': `Bearer ${NANGO_SECRET_KEY}`
        }
      }
    )

    if (!response.ok) {
      console.error('Failed to list connections:', response.status, await response.text())
      return null
    }

    const data = await response.json()
    console.log('Nango connections response:', JSON.stringify(data).substring(0, 500))

    // Handle both array response and object with connections property
    const allConnections = Array.isArray(data) ? data : (data.connections || [])
    console.log('Total connections count:', allConnections.length)

    // Filter to HubSpot connections only
    const connections = allConnections.filter((c: any) =>
      c.provider_config_key === 'hubspot' || c.provider === 'hubspot'
    )
    console.log('HubSpot connections count:', connections.length)

    // Find connection matching the end_user ID
    const match = connections.find((c: any) => c.end_user?.id === endUserId)

    if (match) {
      console.log('Found match by end_user ID:', match.connection_id)
      return match
    }

    // If no match by end_user, return the most recent connection
    if (connections.length > 0) {
      console.log('Returning most recent connection:', connections[0].connection_id)
      return connections[0]
    }

    console.log('No connections found')
    return null
  } catch (error) {
    console.error('Failed to find connection by end user:', error)
    return null
  }
}

/**
 * Fetch HubSpot portal info via Nango proxy
 */
async function fetchHubSpotPortalInfo(connectionId: string): Promise<{
  portalId: string
  portalDomain: string
  portalName: string
} | null> {
  try {
    const response = await fetch(
      'https://api.nango.dev/proxy/account-info/v3/details',
      {
        headers: {
          'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
          'Connection-Id': connectionId,
          'Provider-Config-Key': 'hubspot',
          'X-HubSpot-API-Version': HUBSPOT_API_VERSION
        }
      }
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return {
      portalId: data.portalId?.toString(),
      portalDomain: data.uiDomain,
      portalName: data.companyName || data.uiDomain
    }
  } catch (error) {
    console.error('Failed to fetch portal info:', error)
    return null
  }
}
