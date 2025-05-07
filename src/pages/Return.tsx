import { useState, useEffect } from "react";
import { Navigate, Link } from 'react-router-dom';
import { supabase } from "../lib/supabase";

export const SUPABASE_FN_BASE = 'https://fuigxuyatlhtscrwyrja.functions.supabase.co';

const Return = () => {
    const [status, setStatus] = useState(null);    
  
    useEffect(() => {
      const urlParams  = new URLSearchParams(window.location.search);
      const sessionId  = urlParams.get('session_id');
    
      const fetchStatus = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;
    
        const res = await fetch(
          `${SUPABASE_FN_BASE}/session-status?session_id=${sessionId}`,
          {
            headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
          }
        );
    
        const data = await res.json();
        setStatus(data.status);
      };
    
      fetchStatus();
    }, []);
  
    if (status === 'open') {
      return (
        <Navigate to="/checkout" />
      )
    }
  
    if (status === 'complete') {
        return (
            <div className="flex flex-row items-center justify-center">
                <div className="container bg-white p-8 rounded-lg shadow-md text-center">
                    <h1 className="text-3xl font-semibold text-deep-navy mb-4">Thank You for Subscribing!</h1>
                    <p className="text-gray-700 mb-6">Your subscription is now active. You can manage your subscription in your profile.</p>
                    <Link to="/library" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                        Go to the Library
                    </Link>
                </div>
            </div>
        );
    }
  
    return null;
  }

  export default Return;