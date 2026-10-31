import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, AUTH_BASE } from '../lib/supabase.js';

export default function StudentLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [examCode, setExamCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Step 1: student login (roll number + password)
      const res = await fetch(`${AUTH_BASE}/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Invalid roll number or password');

      sessionStorage.setItem('exam_student_jwt', json.studentJwt);
      sessionStorage.setItem('exam_student_user', JSON.stringify(json.user));

      // Step 2: immediately join exam by code (reuses PHP logic of login.php)
      const joinRes = await fetch(`${API_BASE}/student/enter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${json.studentJwt}`,
        },
        body: JSON.stringify({ exam_code: examCode }),
      });
      const joinJson = await joinRes.json();
      if (joinJson.error) {
        setError(joinJson.error);
        return;
      }
      // Store the session token returned by /enter (stored in exam_sessions.token)
      sessionStorage.setItem('exam_student_code', examCode.trim().toUpperCase());
      sessionStorage.setItem('exam_student_token', joinJson.session_token);
      sessionStorage.setItem('exam_student_title', joinJson.title || '');
      navigate('/student/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={style.card}>
      <h2 style={{ marginTop: 0 }}>Student Login</h2>
      {error && <div style={style.alert}>{error}</div>}
      <form onSubmit={handleLogin} style={style.form}>
        <label style={style.label}>Username / Roll number</label>
        <input
          style={style.input}
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
        <label style={style.label}>Password</label>
        <input
          style={style.input}
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label style={style.label}>Exam code</label>
        <input
          style={style.input}
          name="exam_code"
          value={examCode}
          onChange={(e) => setExamCode(e.target.value)}
          required
        />
        <button type="submit" style={style.btnPrimary} disabled={loading}>
          {loading ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  );
}

const style = {
  card: {
    maxWidth: 380,
    margin: '8vh auto',
    padding: 24,
    border: '1px solid #27272A',
    borderRadius: 0,
    background: '#121212',
    color: '#FFFFFF',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  alert: {
    color: '#FFFFFF',
    background: '#141414',
    border: '1px solid #27272A',
    borderLeft: '3px solid #FF1818',
    padding: 10,
    borderRadius: 0,
    marginBottom: 12,
    fontSize: 14,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 13, fontWeight: 700, color: '#E4E4E7' },
  input: { padding: 10, border: '1px solid #27272A', borderRadius: 0, fontSize: 14, background: '#18181B', color: '#FFFFFF', outline: 'none' },
  btnPrimary: { background: '#FF1818', color: '#FFFFFF', border: '1px solid #FF1818', padding: '10px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700 },
};
