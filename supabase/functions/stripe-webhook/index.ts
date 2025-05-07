// supabase/functions/stripe-webhook/index.ts
import Stripe from 'https://esm.sh/stripe?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7?target=deno&no-check';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16'
});
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
Deno.serve(async (req)=>{
  /* ─── CORS pre-flight (Stripe actually skips this, but good practice) */ if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: cors
    }); // 200
  }
  try {
    /* ─── Verify Stripe signature */ const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('Missing stripe-signature header', {
        status: 400,
        headers: cors
      });
    }
    const rawBody = await req.text();
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET'));
    /* ─── Handle events */ switch(event.type){
      /* 1. first Checkout success (subscription or one-time) */ case 'checkout.session.completed':
        {
          const s = event.data.object;
          const customerId = s.customer;
          const subscriptionId = s.subscription;
          const supabaseUid = s.metadata?.supabase_uid ?? (await stripe.customers.retrieve(customerId)).metadata?.supabase_uid;
          if (supabaseUid) {
            await supabase.from('subscriptions').upsert({
              user_id: supabaseUid,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              status: subscriptionId ? 'active' : 'paid',
              current_period_end: subscriptionId ? new Date((s.expires_at ?? 0) * 1000).toISOString() : null
            });
          }
          break;
        }
      /* 2. renewals, cancels, pauses, etc. */ case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        {
          const sub = event.data.object;
          await supabase.from('subscriptions').update({
            status: sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          }).eq('stripe_subscription_id', sub.id);
          break;
        }
    }
    return new Response(JSON.stringify({
      received: true
    }), {
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 400,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  }
});
