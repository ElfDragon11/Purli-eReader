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

// Helper function to validate subscription status
const isValidSubscriptionStatus = (status: any): status is Subscription['status'] => {
  return status && ['active', 'inactive', 'past_due', 'canceled'].includes(status);
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, subscription: authSubscriptionData } = useAuth(); // Renamed to avoid conflict
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {

        // MODIFICATION: Always set an active subscription for testing
    setSubscription({
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Active for 30 days
    });
    setLoading(false);
    return;
/*
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    // If authSubscriptionData from AuthContext is available and seems valid, consider using it.
    // This logic assumes AuthContext might provide an initial or cached subscription state.
    if (authSubscriptionData && authSubscriptionData.status) {
      if (isValidSubscriptionStatus(authSubscriptionData.status)) {
        setSubscription({
          status: authSubscriptionData.status,
          currentPeriodEnd: authSubscriptionData.current_period_end ? new Date(authSubscriptionData.current_period_end) : null,
        });
      } else {
        console.warn(`Invalid subscription status from AuthContext: ${authSubscriptionData.status}`);
        // Set to null or proceed to fetch from DB if AuthContext's version is invalid/stale
        setSubscription(null); 
      }
      setLoading(false);
      // If AuthContext provides a subscription, we might return here if it's considered authoritative.
      // However, to ensure this context fetches and listens for its own updates,
      // we'll proceed to fetch/listen unless specifically told AuthContext's data is sufficient.
      // For now, let's assume if authSubscriptionData exists, it's an initial state, and we still fetch/listen.
      // To use it and stop: return; 
    }

    // Fetch initial subscription data from the 'subscriptions' table
    setLoading(true); // Ensure loading is true before fetch
    setError(null);

    const fetchSubscriptionData = async () => {
      try {
        const { data, error: dbError } = await supabase
          .from('subscriptions')
          .select('status, current_period_end') // Select only necessary fields
          .eq('user_id', user.id)
          .maybeSingle();

        if (dbError) {
          console.error('Error fetching subscription from DB:', dbError);
          throw dbError;
        }

        if (data) {
          if (isValidSubscriptionStatus(data.status)) {
            setSubscription({
              status: data.status,
              currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
            });
          } else {
            console.warn(`Invalid subscription status from DB: ${data.status}`);
            setSubscription(null);
          }
        } else {
          setSubscription(null); // No subscription found for the user
        }
      } catch (errCatch) {
        setError('Failed to load subscription status.');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscriptionData();

    // Subscribe to realtime subscription updates
    const channel = supabase
      .channel('subscription_updates') 
      .on<SubscriptionPayload['new']>( // Specify payload type for 'postgres_changes'
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newSubData = payload.new;
          if (newSubData && isValidSubscriptionStatus(newSubData.status)) {
            setSubscription({
              status: newSubData.status,
              currentPeriodEnd: newSubData.current_period_end
                ? new Date(newSubData.current_period_end)
                : null,
            });
          } else if (newSubData) {
            console.warn(`Invalid subscription status from realtime update: ${newSubData.status}`);
            // Optionally, set subscription to null or handle differently
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime subscription channel error:', err);
          setError('Realtime subscription update failed.');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };*/
  }, [user, authSubscriptionData]); // Added authSubscriptionData to dependency array

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