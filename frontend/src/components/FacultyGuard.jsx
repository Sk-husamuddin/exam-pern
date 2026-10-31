import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { LoadingScreen } from './ui.jsx';

/**
 * Guards faculty routes.
 * - While the Supabase session is loading: renders LoadingScreen.
 * - No session: redirects to / (replace).
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setAuthorized(!!session);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  if (loading) return <LoadingScreen />;
  if (!authorized) return <Navigate to="/" replace />;
  return <Outlet />;
}
