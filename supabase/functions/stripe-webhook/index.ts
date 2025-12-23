// Stripe Webhook Handler - Supabase Edge Function
// Handles subscription lifecycle events from Stripe

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

// Initialize Stripe
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

// Plan type mapping from Stripe price metadata
const PLAN_TYPE_MAP: Record<string, string> = {
  'starter': 'starter',
  'pro': 'pro',
  'business': 'business',
  'partner_starter': 'partner_starter',
  'partner_pro': 'partner_pro',
  'partner_enterprise': 'partner_enterprise',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response(
      JSON.stringify({ error: 'Missing stripe-signature header' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Get raw body for signature verification
    const body = await req.text()

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        STRIPE_WEBHOOK_SECRET
      )
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message)
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Log the event for audit trail
    await logBillingEvent(supabase, event)

    // Process the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.created':
        await handleSubscriptionCreated(supabase, event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription)
        break

      case 'invoice.paid':
        await handleInvoicePaid(supabase, event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(supabase, event.data.object as Stripe.Invoice)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Log billing event for audit trail
 */
async function logBillingEvent(supabase: any, event: Stripe.Event) {
  const orgId = await getOrgIdFromEvent(supabase, event)

  await supabase
    .from('billing_events')
    .insert({
      organization_id: orgId,
      stripe_event_id: event.id,
      event_type: event.type,
      event_data: event.data.object,
    })
    .single()
}

/**
 * Extract organization ID from Stripe event metadata
 */
async function getOrgIdFromEvent(supabase: any, event: Stripe.Event): Promise<string | null> {
  const obj = event.data.object as any

  // Check metadata first
  if (obj.metadata?.organization_id) {
    return obj.metadata.organization_id
  }

  // Try to find by customer ID
  const customerId = obj.customer || obj.id
  if (customerId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single()

    if (org) return org.id
  }

  return null
}

/**
 * Handle checkout.session.completed
 * Creates subscription record after successful checkout
 */
async function handleCheckoutCompleted(supabase: any, session: Stripe.Checkout.Session) {
  console.log('Checkout completed:', session.id)

  const orgId = session.metadata?.organization_id
  if (!orgId) {
    console.error('No organization_id in checkout session metadata')
    return
  }

  // Update organization with Stripe customer ID
  await supabase
    .from('organizations')
    .update({ stripe_customer_id: session.customer as string })
    .eq('id', orgId)

  // The subscription.created event will handle the subscription record
  console.log('Organization updated with Stripe customer:', session.customer)
}

/**
 * Handle customer.subscription.created
 */
async function handleSubscriptionCreated(supabase: any, subscription: Stripe.Subscription) {
  console.log('Subscription created:', subscription.id)

  const customerId = subscription.customer as string

  // Find organization by Stripe customer ID
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!org) {
    console.error('No organization found for customer:', customerId)
    return
  }

  // Get plan type from price metadata
  const priceId = subscription.items.data[0]?.price.id
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
  const planType = (price.metadata?.plan_type as string) || 'starter'

  // In per-seat model, seat count is the subscription quantity
  // For partner plans, this may be 1 (flat fee)
  const seatCount = subscription.items.data[0]?.quantity || 1

  // Create subscription record
  const { error } = await supabase.rpc('upsert_subscription', {
    p_org_id: org.id,
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: subscription.id,
    p_stripe_price_id: priceId,
    p_plan_type: PLAN_TYPE_MAP[planType] || planType,
    p_billing_interval: subscription.items.data[0]?.price.recurring?.interval || 'month',
    p_status: mapStripeStatus(subscription.status),
    p_seat_count: seatCount,
    p_current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    p_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  })

  if (error) {
    console.error('Failed to create subscription record:', error)
  } else {
    console.log('Subscription record created for org:', org.id)
  }
}

/**
 * Handle customer.subscription.updated
 */
async function handleSubscriptionUpdated(supabase: any, subscription: Stripe.Subscription) {
  console.log('Subscription updated:', subscription.id)

  const customerId = subscription.customer as string

  // Find organization by Stripe customer ID
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!org) {
    console.error('No organization found for customer:', customerId)
    return
  }

  // Get plan type from price metadata
  const priceId = subscription.items.data[0]?.price.id
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
  const planType = (price.metadata?.plan_type as string) || 'starter'

  // In per-seat model, seat count is the subscription quantity
  // For partner plans, this may be 1 (flat fee)
  const seatCount = subscription.items.data[0]?.quantity || 1

  // Update subscription record
  const { error } = await supabase.rpc('upsert_subscription', {
    p_org_id: org.id,
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: subscription.id,
    p_stripe_price_id: priceId,
    p_plan_type: PLAN_TYPE_MAP[planType] || planType,
    p_billing_interval: subscription.items.data[0]?.price.recurring?.interval || 'month',
    p_status: mapStripeStatus(subscription.status),
    p_seat_count: seatCount,
    p_current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    p_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  })

  if (error) {
    console.error('Failed to update subscription record:', error)
  } else {
    console.log('Subscription record updated for org:', org.id)
  }
}

/**
 * Handle customer.subscription.deleted
 */
async function handleSubscriptionDeleted(supabase: any, subscription: Stripe.Subscription) {
  console.log('Subscription deleted:', subscription.id)

  // Update subscription status to canceled
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id)

  if (error) {
    console.error('Failed to mark subscription as canceled:', error)
  } else {
    console.log('Subscription marked as canceled')
  }
}

/**
 * Handle invoice.paid
 * Clears any grace period and confirms successful payment
 */
async function handleInvoicePaid(supabase: any, invoice: Stripe.Invoice) {
  console.log('Invoice paid:', invoice.id)

  if (!invoice.subscription) {
    console.log('No subscription on invoice, skipping')
    return
  }

  // Find subscription by Stripe subscription ID
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('organization_id')
    .eq('stripe_subscription_id', invoice.subscription)
    .single()

  if (!sub) {
    console.log('No subscription record found for:', invoice.subscription)
    return
  }

  // Clear any grace period
  const { error } = await supabase.rpc('clear_grace_period', {
    p_org_id: sub.organization_id,
  })

  if (error) {
    console.error('Failed to clear grace period:', error)
  } else {
    console.log('Grace period cleared for org:', sub.organization_id)
  }
}

/**
 * Handle invoice.payment_failed
 * Starts grace period countdown
 */
async function handleInvoicePaymentFailed(supabase: any, invoice: Stripe.Invoice) {
  console.log('Invoice payment failed:', invoice.id)

  if (!invoice.subscription) {
    console.log('No subscription on invoice, skipping')
    return
  }

  // Find subscription by Stripe subscription ID
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('organization_id')
    .eq('stripe_subscription_id', invoice.subscription)
    .single()

  if (!sub) {
    console.log('No subscription record found for:', invoice.subscription)
    return
  }

  // Start grace period
  const { error } = await supabase.rpc('start_grace_period', {
    p_org_id: sub.organization_id,
  })

  if (error) {
    console.error('Failed to start grace period:', error)
  } else {
    console.log('Grace period started for org:', sub.organization_id)
    // TODO: Send warning email to org admins
  }
}

/**
 * Map Stripe subscription status to our status values
 */
function mapStripeStatus(stripeStatus: string): string {
  const statusMap: Record<string, string> = {
    'active': 'active',
    'past_due': 'past_due',
    'canceled': 'canceled',
    'unpaid': 'grace_period',
    'incomplete': 'active',
    'incomplete_expired': 'canceled',
    'trialing': 'active', // We use freemium, not trials
    'paused': 'paused',
  }
  return statusMap[stripeStatus] || 'active'
}
