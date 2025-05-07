import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { createSubscription } from '../lib/stripe';

interface Props {
  children: React.ReactNode;
}

const SubscriptionRequired: React.FC<Props> = ({ children }) => {
  const { user, loading : authLoading } = useAuth();
  const { subscription, loading: subLoading } = useSubscription();
  const [ loadingPage, setLoadingPage ] = useState(false);
  const navigate = useNavigate()

  if (!user) {
    return <Navigate to="/auth" />;
  }

  if (subLoading||authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!subscription || subscription.status !== 'active') {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Subscription Required
        </h2>
        <p className="text-gray-600 mb-6">
          To access this feature, you need an active subscription. Our subscription includes:
        </p>
        <ul className="text-left max-w-md mx-auto mb-8 space-y-2">
          <li className="flex items-center">
            <svg className="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            Unlimited book uploads
          </li>
          <li className="flex items-center">
            <svg className="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            Advanced content filtering
          </li>
          <li className="flex items-center">
            <svg className="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            Sync across devices
          </li>
        </ul>
        <button
          onClick={() => {
            navigate('/checkout');
            setLoadingPage(true);
            createSubscription()
          }}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {!loadingPage ? ('Subscribe Now - $5/month') : 'Loading...'}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

export default SubscriptionRequired;