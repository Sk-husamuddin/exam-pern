import { useState } from 'react';
import { LandingPage, FacultyAuth, StudentAuth, StatusPage } from './pages/PlatformScreens.jsx';
import { LoadingScreen } from './components/ui.jsx';

export default function App() {
  const [screen] = useState(() => window.location.pathname);
  if (screen === '/') return <LandingPage />;
  if (screen === '/faculty/login') return <FacultyAuth />;
  if (screen === '/student/login') return <StudentAuth />;
  if (screen === '/session-expired') return <StatusPage type="expired" />;
  if (screen === '/loading') return <LoadingScreen />;
  return <StatusPage />;
}
