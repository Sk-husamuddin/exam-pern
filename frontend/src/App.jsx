import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage, FacultyAuth, StudentAuth, StatusPage } from './pages/PlatformScreens.jsx';
import { LoadingScreen } from './components/ui.jsx';
import FacultyDashboard from './pages/FacultyDashboard.jsx';
import StudentsManager from './pages/StudentsManager.jsx';
import QuestionsEditor from './pages/QuestionsEditor.jsx';
import LiveMonitor from './pages/LiveMonitor.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import ExamScreen from './pages/ExamScreen.jsx';
import FacultyGuard from './components/FacultyGuard.jsx';
import StudentGuard from './components/StudentGuard.jsx';
import NotFound from './components/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/faculty/login" element={<FacultyAuth />} />
      <Route path="/student/login" element={<StudentAuth />} />
      <Route path="/session-expired" element={<StatusPage type="expired" />} />
      <Route path="/loading" element={<LoadingScreen />} />

      {/* Faculty area — redirects and guarded routes */}
      <Route path="/faculty" element={<Navigate to="/faculty/dashboard" replace />} />
      <Route element={<FacultyGuard />}>
        <Route path="/faculty/dashboard" element={<FacultyDashboard />} />
        <Route path="/faculty/students" element={<StudentsManager />} />
        <Route path="/faculty/questions/:examId" element={<QuestionsEditor />} />
        <Route path="/faculty/monitor/:examId" element={<LiveMonitor />} />
      </Route>

      {/* Student area — redirects and guarded routes */}
      <Route path="/student" element={<Navigate to="/student/dashboard" replace />} />
      <Route element={<StudentGuard />}>
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="/student/exam" element={<ExamScreen />} />
      </Route>

      {/* Catch-all: only truly unknown URLs */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
