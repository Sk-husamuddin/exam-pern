import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase.js';

import FacultyLogin from './pages/FacultyLogin.jsx';
import FacultyDashboard from './pages/FacultyDashboard.jsx';
import QuestionsEditor from './pages/QuestionsEditor.jsx';
import StudentsManager from './pages/StudentsManager.jsx';
import LiveMonitor from './pages/LiveMonitor.jsx';
import StudentLogin from './pages/StudentLogin.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import ExamScreen from './pages/ExamScreen.jsx';

function FacultyOnly({ children }) {
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
  return children;
}

function StudentOnly({ children }) {
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
  return children;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Faculty routes */}
        <Route path="/faculty/login" element={<FacultyLogin />} />
        <Route path="/faculty/*" element={
          <FacultyOnly>
            <Routes>
              <Route index element={<Navigate to="/faculty/dashboard" replace />} />
              <Route path="dashboard" element={<FacultyDashboard />} />
              <Route path="questions/:examId" element={<QuestionsEditor />} />
              <Route path="students" element={<StudentsManager />} />
              <Route path="monitor/:examId" element={<LiveMonitor />} />
            </Routes>
          </FacultyOnly>
        } />

        {/* Student routes */}
        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/*" element={
          <StudentOnly>
            <Routes>
              <Route index element={<Navigate to="/student/dashboard" replace />} />
              <Route path="dashboard" element={<StudentDashboard />} />
              <Route path="exam" element={<ExamScreen />} />
            </Routes>
          </StudentOnly>
        } />

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/faculty/login" replace />} />
      </Routes>
    </Router>
  );
}
