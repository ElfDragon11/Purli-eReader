import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

interface Subscription {
  status: 'active' | 'inactive' | 'past_due' | 'canceled';
  currentPeriodEnd: Date | null;
}

interface SubscriptionPayload {
  new: {
    status: Subscription['status'];
    current_period_end: string | null; // Assuming this is a date string from the database
  },
}

interface SubscriptionContextType {
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, subscription: userSubscription} = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    //console.log("user Subscription",userSubscription)
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }else if (userSubscription) {
      setSubscription({
        status: userSubscription.status as Subscription['status'],
        currentPeriodEnd: userSubscription.current_period_end ? new Date(userSubscription.current_period_end) : null,
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // Fetch subscription data from Supabase

    const fetchSubscription = async () => {
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setSubscription({
            status: data.status,
            currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
          });
        } else {
          setSubscription(null);
        }
      } catch (err) {
        console.error('Error fetching subscription:', err);
        setError('Failed to load subscription status');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();

    // Subscribe to realtime subscription updates
    const subscription = supabase
      .channel('subscription_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload : SubscriptionPayload ) => {
          if (payload.new) {
            setSubscription({
              status: payload.new.status,
              currentPeriodEnd: payload.new.current_period_end
                ? new Date(payload.new.current_period_end)
                : null,
            });
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  return (
    <SubscriptionContext.Provider value={{ subscription, loading, error }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};