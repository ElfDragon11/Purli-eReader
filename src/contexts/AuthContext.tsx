/*import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface SubscriptionData { // Define this interface!
  id: string;
  status: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}


interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  subscription: SubscriptionData | null; // Add subscription state
  setSubscription: React.Dispatch<React.SetStateAction<SubscriptionData | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null); // Initialize subscription state

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => authSubscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data?.user?.id) {
            // Call the function to update subscription status
            const {error: rpcError} = await supabase.rpc('check_and_update_subscription_status', { user_id: data.user.id });
            if (rpcError) {
                console.error("Error updating subscription status:", rpcError);
                // Handle the error appropriately (e.g., set subscription to null, display a message)
            }
            // Fetch the subscription data *immediately* after login
            const { data: subscriptionData, error: subscriptionError } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', data.user.id)
                .single(); // Assuming one subscription per user

            if (subscriptionError) {
                console.error("Error fetching subscription data after login:", subscriptionError);
                // Handle the error appropriately (e.g., set subscription to null, display a message)
            } else {
                setSubscription(subscriptionData as SubscriptionData); // Update subscription state
            }
        }
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, loading, subscription, setSubscription, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};*/



import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface SubscriptionData { // Define this interface!
  id: string;
  status: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}


interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  subscription: SubscriptionData | null; // Add subscription state
  setSubscription: React.Dispatch<React.SetStateAction<SubscriptionData | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null); // Initialize subscription state

    // Set Subscript and handle getting user.
    const fetchSubscription = async (userId: string | undefined) => {
        if (!userId) {
            setSubscription(null)
            return;
        }
          // Fetch the subscription data *immediately* after login
          try {
              const { data: subscriptionData, error: subscriptionError } = await supabase
                  .from('subscriptions')
                  .select('*')
                  .eq('user_id', userId)
                  .single(); // Assuming one subscription per user

              if (subscriptionError) {
                  console.error("Error fetching subscription data during fetching", subscriptionError);
                  setSubscription(null);
              } else {
                  setSubscription(subscriptionData as SubscriptionData); // Update subscription state
              }
          } catch (e){
              console.error("Error during fetching: ", e);
              setSubscription(null)
          }
    }

  useEffect(() => {
      // Check active sessions and sets the user
      const getSession = async () => {
          try {
              const { data: { session } } = await supabase.auth.getSession()
              setUser(session?.user ?? null);
              setLoading(false);
              fetchSubscription(session?.user?.id)
          }
          catch (e){
              console.error("Errored in getSession", e)
          }
          finally {
              setLoading(false);
          }
      }

      getSession();
  }, []);

    useEffect(() => {
        // Listen for changes on auth state
        supabase.auth.onAuthStateChange(async (event, session) => {
            setUser(session?.user ?? null);
            //setSubscription(null)
            fetchSubscription(session?.user?.id);
        });
      }, []);

    const signIn = async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

        if (data?.user?.id) {
            // Call the function to update subscription status
            const {error: rpcError} = await supabase.rpc('check_and_update_subscription_status', { user_id: data.user.id });
            if (rpcError) {
                console.error("Error updating subscription status:", rpcError);
                // Handle the error appropriately (e.g., set subscription to null, display a message)
            }
            fetchSubscription(data?.user?.id)
        }
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null)
    setSubscription(null)
  };

  return (
    <AuthContext.Provider value={{ user, loading, subscription, setSubscription, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};