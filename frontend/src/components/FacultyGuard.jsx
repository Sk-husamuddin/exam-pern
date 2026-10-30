import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { LoadingScreen } from './ui.jsx';

/**
 * Guards faculty routes.
 * - While the Supabase session is loading: renders LoadingScreen.
 * - No session: redirects to /faculty/login (replace).
 * - Session present: renders the matched child route (via <Outlet />).
 */
export default function FacultyGuard() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setAuthorized(!!data?.session);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <LoadingScreen />;
  if (!authorized) return <Navigate to="/faculty/login" replace />;
  return <Outlet />;
}
