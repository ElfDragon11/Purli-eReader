import { useEffect, useState } from "react";
import {loadStripe} from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout
} from '@stripe/react-stripe-js';
import { supabase } from "../lib/supabase";
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';


const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
const SUPABASE_FN_BASE = import.meta.env.VITE_SUPABASE_FUNCTION_URL;


const Checkout = () => {

    const { user, loading : authLoading } = useAuth();
    const navigate = useNavigate()
    const [checkingSub, setCheckingSub] = useState(true);
    const [showCheckout, setShowCheckout] = useState(false);



const fetchClientSecret = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token;          // undefined if not signed in

    const res = await fetch(`${SUPABASE_FN_BASE}/create-checkout-session`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        ...(jwt && { Authorization: `Bearer ${jwt}` })
        },
        //body: JSON.stringify({ priceId: 'price_1234' })
    });

    const { clientSecret, error } = await res.json();
    if (error) throw new Error(error);
    return clientSecret;
    };

    useEffect(() => {
        if (authLoading) return;
        if (!authLoading && !user) {
          navigate('/auth');
        }
        //console.log('here');
        (async () => {
            const { data, error } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('user_id', user!.id)
              .maybeSingle();
              
            if (error) {
              console.error('Error fetching subscription:', error);
            } else if (data) {
              navigate('/library');
            }else {
                setShowCheckout(true);
            }
            setCheckingSub(false);
          })(); 
      }, [user, authLoading]);


    if (authLoading || checkingSub) {
        return (
            <div className="flex justify-center py-12 text-gray-500">
                Loading Subscription Checkout…
            </div>
        );
    }   
    if (!showCheckout) {
        // We navigated away or something unexpected happened.
        return null;
    }

    const options = {fetchClientSecret};
    return (
        <div id="checkout">
            <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={options}
            >
            <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
        </div>
    )

    

}

export default Checkout;