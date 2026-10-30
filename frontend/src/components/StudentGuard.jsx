import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { LoadingScreen } from './ui.jsx';

/**
 * Guards student routes.
 * - While checking storage: renders LoadingScreen.
 * - No student token in localStorage: redirects to /student/login (replace).
 * - Token present: renders children.
 */
export default function StudentGuard({ children }) {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('exam_student_token');
    setAuthorized(!!token);
    setLoading(false);
  }, []);

  if (loading) return <LoadingScreen />;
  if (!authorized) return <Navigate to="/student/login" replace />;
  return <>{children}</>;
}
