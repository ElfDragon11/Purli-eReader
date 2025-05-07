// supabase/functions/create-checkout-session/index.ts
import Stripe from 'https://esm.sh/stripe?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16'
});
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};
Deno.serve(async (req)=>{
  /* ----- CORS pre-flight ---------------------------------- */ if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: cors
    }); // 200
  }
  try {
    /* ----- Auth guard -------------------------------------- */ const jwt = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!jwt) {
      return new Response('Unauthorized', {
        status: 401,
        headers: cors
      });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response('Unauthorized', {
        status: 401,
        headers: cors
      });
    }
    const supabaseUid = user.id;
    /* ----- Parse body -------------------------------------- */ /*const { priceId } = await req.json();     // expect { "priceId": "price_xxx" }
    if (!priceId) {
      return new Response(
        JSON.stringify({ error: 'priceId required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }*/ /* ----- Get / create Stripe Customer -------------------- */ const { data: subscriptions } = await supabase.from('subscriptions').select('stripe_customer_id').eq('id', supabaseUid).single();
    let customerId = subscriptions?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_uid: supabaseUid
        }
      });
      customerId = customer.id;
      await supabase.from('subscriptions').update({
        stripe_customer_id: customerId
      }).eq('id', supabaseUid);
    }
    /* ----- Create Checkout Session ------------------------- */ const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Purli Monthly Subscription',
              description: 'Access to all Purli features including unlimited book uploads and advanced filtering'
            },
            unit_amount: 500,
            recurring: {
              interval: 'month'
            }
          },
          quantity: 1
        }
      ],
      return_url: `${req.headers.get('Origin')}/return?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        supabase_uid: supabaseUid
      }
    });
    /* ----- Respond with client secret ---------------------- */ return new Response(JSON.stringify({
      clientSecret: session.client_secret
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
      status: 500,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  }
});
