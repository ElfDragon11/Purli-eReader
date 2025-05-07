import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import quill from '../assets/quill_black.png';



const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loadingProcess, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp, user, loading } = useAuth();
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!loading && user) {
      navigate('/library');
    }
  }, [user, loading]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const showSignup = params.get('signup') === 'true';
    if (showSignup) {
      setIsLogin(false);
      const cleanUrl = location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, [location]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side email validation
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Password validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    
    if (!isLogin && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!isLogin && !agreedToTerms) {
      setError('You must agree to the terms and privacy policy.');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        await signUp(email, password);
        setEmailSent(true);
        return;
      }


      //calvin@purlibooks.com
    } catch (err) {
      // Handle specific Supabase error codes
      if (err instanceof Error) {
        const errorMessage = err.message;
        if (errorMessage.includes('email_address_invalid')) {
          setError('Please enter a valid email address');
        } else if (errorMessage.includes('invalid_credentials')) {
          setError('Invalid email or password');
        } else if (errorMessage.includes('email_taken')) {
          setError('This email is already registered');
        } else {
          setError('An error occurred. Please try again.');
        }
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
      <div className="flex justify-center mb-4">
        <img src={quill} alt="Purli quill logo" className="h-16 w-auto" />
      </div>
      
      <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">
        {isLogin ? 'Welcome Back' : 'Create Your Account'}
      </h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}
      <div className="transition-all duration-300 ease-in-out">
      {emailSent ? (
        <div className="text-center text-green-700 bg-green-50 border border-green-200 p-4 rounded-md">
          <h3 className="text-lg font-semibold mb-2">Check your email</h3>
          <p>We've sent a confirmation link to <strong>{email}</strong>. Click the link in your inbox to verify your account.</p>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-400 bg-white shadow-sm px-3 py-2 text-base focus:border-deep-navy focus:ring-deep-navy"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-400 bg-white shadow-sm px-3 py-2 text-base focus:border-deep-navy focus:ring-deep-navy"
            required
            minLength={6}
          />
          {!isLogin && (
            <p className="mt-1 text-sm text-gray-500">
              Password must be at least 6 characters long
            </p>
          )}
        </div>
        {!isLogin && (
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-400 bg-white shadow-sm px-3 py-2 text-base focus:border-deep-navy focus:ring-deep-navy"
              required
            />
          </div>
        )}
        {!isLogin && (
          <div className="flex items-start">
          <input
            type="checkbox"
            id="terms"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-1 mr-2"
          />
          <label htmlFor="terms" className="text-sm text-gray-700">
            I agree to the <Link to="/terms" className="text-deep-navy underline">Terms & Privacy Policy</Link>
          </label>
        </div>
        )}

        <button
          type="submit"
          disabled={loadingProcess}
          className="w-full bg-deep-navy text-white py-2 px-4 rounded-md hover:bg-lighter-navy focus:outline-none focus:ring-2 focus:ring-deep-navy focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingProcess ? 'Please wait...' : (isLogin ? 'Sign In' : 'Sign Up')}
        </button>
      </form>
      )}
      </div>
      <div className="mt-6 text-center">
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setConfirmPassword('');
            setError('');
          }}
          className="text-sm text-deep-navy hover:text-lighter-navy"
        >
          {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
        </button>
      </div>
    </div>
  );
};

export default Auth;