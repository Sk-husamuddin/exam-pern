import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { LoadingScreen } from './ui.jsx';

/**
 * Guards student routes.
 * - While checking storage: renders LoadingScreen.
 * - No student token in localStorage: redirects to /student/login (replace).
 * - Token present: renders the matched child route (via <Outlet />).
 */
export default function StudentGuard() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem('exam_student_token');
    setAuthorized(!!token);
    setLoading(false);
  }, []);

  if (loading) return <LoadingScreen />;
  if (!authorized) return <Navigate to="/student/login" replace />;
  return <Outlet />;
}
