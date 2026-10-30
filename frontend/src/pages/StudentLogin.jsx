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

      localStorage.setItem('exam_student_jwt', json.studentJwt);
      localStorage.setItem('exam_student_user', JSON.stringify(json.user));

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
      localStorage.setItem('exam_student_code', examCode.trim().toUpperCase());
      localStorage.setItem('exam_student_token', joinJson.session_token);
      if (joinJson.status === 'live') {
        navigate('/student/exam');
      } else {
        navigate('/student/dashboard');
      }
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
          placeholder="e.g. A1B2C3"
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
    maxWidth: 360,
    margin: '8vh auto',
    padding: 24,
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    background: '#fff',
    fontFamily: 'system-ui, sans-serif',
  },
  alert: {
    color: '#b91c1c',
    background: '#fef2f2',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 14,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 14, fontWeight: 600 },
  input: { padding: 9, border: '1px solid #c6ccd8', borderRadius: 6, fontSize: 14 },
  btnPrimary: { background: '#2b5cff', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
};
