// src/components/UserProfile.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns'; // For formatting the date (install: npm install date-fns)

interface UserProfileData {
  firstname: string | null;
  lastname: string | null;
  favoritegenres: string | null;
}

interface SubscriptionData {
  id: string; // Or number, depending on your ID type
  status: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null; // Add stripe customer id
  stripe_subscription_id: string | null; // Add stripe subscription id
}

export const SUPABASE_FN_BASE = 'https://fuigxuyatlhtscrwyrja.functions.supabase.co';

const UserProfile: React.FC = () => {
    const { user, subscription, setSubscription } = useAuth(); // Get the subscription from context.
    const [profileData, setProfileData] = useState<UserProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editedProfileData, setEditedProfileData] = useState<UserProfileData | null>(null);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  

  
  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);

      if (user) {
        try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            // Profile doesn't exist, create a default one
            const initialProfile: UserProfileData = {
            firstname: null,
            lastname: null,
            favoritegenres: null,
            };
            setProfileData(initialProfile);
            setEditedProfileData({ ...initialProfile });
            //setIsEditing(true);  // Go directly into edit mode
            return;
        }

        setProfileData(data as UserProfileData);
        setEditedProfileData({ ...data } as UserProfileData);
        } catch (err: any) {
        setError(err.message || 'Failed to load profile.');
        console.error(err);
        } finally {
        setLoading(false);
        }
    } else {
        setLoading(false);
        setError('User not logged in.');
    }
    };

    fetchProfile();
}, [user]);







  const updateProfile = async (profile: UserProfileData) => {
    if (user) {
      try {
        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            ...profile,
          });

        if (error) {
          throw error;
        }
        setProfileData(profile);
        setIsEditing(false);
      } catch (err: any) {
        setError(err.message || 'Failed to update profile.');
        console.error(err);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedProfileData((prevData) => ({
      ...prevData,
      [name]: value,
    } as UserProfileData));
  };

  const handleSave = async () => {
    if (editedProfileData) {
      await updateProfile(editedProfileData);
    }
  };

  const handleCancel = () => {
    if (profileData) {
      setEditedProfileData({ ...profileData });
    }
    setIsEditing(false);
    setError(null);
  };

  const handleOpenCancelModal = () => {
    setIsCancelModalOpen(true);
  };

  const handleCloseCancelModal = () => {
    setIsCancelModalOpen(false);
  };

  const handleConfirmCancelSubscription = async () => {
    // Add Stripe cancellation logic here
    // You'll need to use your Stripe API key and subscription ID to cancel the subscription

    setIsCancelModalOpen(false); // Close the modal
    console.log('user', user);
    console.log('subscription', subscription);  

    if (user && subscription) {
      // This is placeholder logic to update your Supabase data
      // Replace with your actual Stripe cancellation API call

      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('session', session);
        const jwt = session?.access_token;          // undefined if not signed in
        const response = await fetch(`${SUPABASE_FN_BASE}/cancel-subscription`, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            ...(jwt && { Authorization: `Bearer ${jwt}` })
            },
            body: JSON.stringify({
                subscription_id: subscription.stripe_subscription_id,
                customer_id: subscription.stripe_customer_id,
            }),
        });
        if (!response.ok) {
            const errorData = await response.json(); // Parse error details from the response
            throw new Error(errorData.message || 'Failed to cancel subscription');
        }
        
        /*
        const { data: { session } } = await supabase.auth.getSession()
        console.log('session', session )
         if (!session) {
             console.error("no current session to get access token from",)
             return
         }
 
        const { error} = await supabase.functions.invoke('cancel-subscription', {
           headers: {
             Authorization: `Bearer ${session.access_token}`,
           },
           body: {
             subscription_id: subscription.stripe_subscription_id,
             customer_id: subscription.stripe_customer_id,
           }
         })
 

        if (error) {
            throw error;
        }*/

        // Update subscription status
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Error updating subscription status:', updateError);
          setError(updateError.message || 'Failed to cancel subscription.');
          return;
        }

        // Optionally, refresh the subscription data after cancellation
        setSubscription((prevSubscription: SubscriptionData | null) => {
            if (!prevSubscription) return null;
          
            return {
              ...prevSubscription,
              status: 'canceled',
            };
          });

        console.log("Canceled subscription successfully")

      } catch (err: any) {
        setError(err.message || 'Failed to cancel subscription.');
        console.error(err);
      }
    } else {
      setError('User or subscription data not found.');
    }

  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return format(date, 'MMMM dd, yyyy');
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading profile...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-center py-4">Error: {error}</div>;
  }

  if (!profileData || !user) {
    return <div className="text-center py-4">No profile data available.</div>;
  }

  return (
    <div className="container mx-auto mt-8 p-6 bg-white shadow-md rounded-md max-w-lg">
      <h2 className="text-2xl font-semibold mb-4">Your Profile</h2>

      <div className="mb-4">
        <strong className="block font-medium text-gray-700">Email:</strong>
        <span>{user.email}</span>
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="firstname" className="block text-gray-700 text-sm font-bold mb-2">
              First Name
            </label>
            <input
              type="text"
              id="firstname"
              name="firstname"
              value={editedProfileData?.firstname || ''}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          <div>
            <label htmlFor="lastname" className="block text-gray-700 text-sm font-bold mb-2">
              Last Name
            </label>
            <input
              type="text"
              id="lastname"
              name="lastname"
              value={editedProfileData?.lastname || ''}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          <div>
            <label htmlFor="favoritegenres" className="block text-gray-700 text-sm font-bold mb-2">
              Favorite Genres
            </label>
            <input
              type="text"
              id="favoritegenres"
              name="favoritegenres"
              value={editedProfileData?.favoritegenres || ''}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded ml-2 focus:outline-none focus:shadow-outline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <strong className="block font-medium text-gray-700">First Name:</strong>
            <span>{profileData.firstname || 'Not set'}</span>
          </div>
          <div>
            <strong className="block font-medium text-gray-700">Last Name:</strong>
            <span>{profileData.lastname || 'Not set'}</span>
          </div>
          <div>
            <strong className="block font-medium text-gray-700">Favorite Genres:</strong>
            <span>{profileData.favoritegenres || 'Not set'}</span>
          </div>

          {/* Subscription Information */}
          <div>
            <strong className="block font-medium text-gray-700">Subscription Status:</strong>
            <span>{subscription?.status || 'Not subscribed'}</span>
          </div>
          <div>
            <strong className="block font-medium text-gray-700">Subscription Ends:</strong>
            <span>{formatDate(subscription?.current_period_end ?? null)}</span>
          </div>
          <div className="flex items-center space-x-4">
            {subscription?.status !== 'canceled' && (
                <button
                onClick={handleOpenCancelModal}
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                >
                Cancel Subscription
                </button>
            )}

            <button
                onClick={() => setIsEditing(true)}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
                Edit Profile
            </button>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {isCancelModalOpen && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">​</span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                      Cancel Subscription
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to cancel your subscription? This action cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={handleConfirmCancelSubscription}
                >
                  Confirm Cancel
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                  onClick={handleCloseCancelModal}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;