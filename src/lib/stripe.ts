import { loadStripe } from '@stripe/stripe-js';
import { supabase } from './supabase';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export async function createSubscription() {
  // 1) Grab the current user session + JWT
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession()

  if (sessionError || !session) {
    throw new Error('Not authenticated')
  }
  const jwt = session.access_token

  // 2) Call your Edge Function with both apikey + JWT headers
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-subscription`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${jwt}`
      },
      // If your function needs extra data, include it here:
      // body: JSON.stringify({ priceId: 'price_xxx' })
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to create subscription: ${body}`)
  }

  // 3) Extract the Stripe session ID
  const { sessionId } = await res.json()
  if (!sessionId) {
    throw new Error('Missing sessionId in response')
  }

  // 4) Redirect to Stripe Checkout
  const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!)
  if (!stripe) {
    throw new Error('Stripe.js failed to load')
  }

  const { error } = await stripe.redirectToCheckout({ sessionId })
  if (error) throw error
}