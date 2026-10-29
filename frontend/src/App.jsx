import { useState, useEffect } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { supabase } from './lib/supabase.js';

import FacultyLogin from './pages/FacultyLogin.jsx';
import FacultyDashboard from './pages/FacultyDashboard.jsx';
import QuestionsEditor from './pages/QuestionsEditor.jsx';
import StudentsManager from './pages/StudentsManager.jsx';
import LiveMonitor from './pages/LiveMonitor.jsx';
import StudentLogin from './pages/StudentLogin.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import ExamScreen from './pages/ExamScreen.jsx';

function FacultyLayout({ children }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setReady(true);
        setOk(!!data.session);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!ready) return null;
  if (!ok) return <Navigate to="/faculty/login" replace />;
  return <>{children}</>;
}

function StudentLayout({ children }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const token = localStorage.getItem('exam_student_token');
      if (mounted) {
        setReady(true);
        setOk(!!token);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!ready) return null;
  if (!ok) return <Navigate to="/student/login" replace />;
  return <>{children}</>;
}

const facultyRoutes = [
  { index: true, element: <Navigate to="/faculty/dashboard" replace /> },
  { path: 'dashboard', element: <FacultyDashboard /> },
  { path: 'questions/:examId', element: <QuestionsEditor /> },
  { path: 'students', element: <StudentsManager /> },
  { path: 'monitor/:examId', element: <LiveMonitor /> },
];

const studentRoutes = [
  { index: true, element: <Navigate to="/student/dashboard" replace /> },
  { path: 'dashboard', element: <StudentDashboard /> },
  { path: 'exam', element: <ExamScreen /> },
];

const router = createBrowserRouter(
  [
    {
      path: '/faculty/login',
      element: <FacultyLogin />,
    },
    {
      path: '/faculty',
      element: <FacultyLayout><Outlet /></FacultyLayout>,
      children: facultyRoutes,
    },
    {
      path: '/student/login',
      element: <StudentLogin />,
    },
    {
      path: '/student',
      element: <StudentLayout><Outlet /></StudentLayout>,
      children: studentRoutes,
    },
    {
      path: '/',
      element: <Navigate to="/faculty/login" replace />,
    },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
);

export default function App() {
  return <RouterProvider router={router} />;
}
