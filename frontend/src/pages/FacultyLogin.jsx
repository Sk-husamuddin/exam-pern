import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { useNavigate } from 'react-router-dom';
import { LoadingButtonContent } from '../components/Loading.jsx';

export default function FacultyLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        navigate('/faculty/dashboard', { replace: true });
      }
    });
  }, [navigate]);

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
      });
      if (err) throw err;
      if (data.user && !data.session) {
        // Email confirmation enabled — user must confirm before signing in
        setError('Account created. Please check your email to confirm, then sign in.');
        return;
      }
      if (data.session) {
        navigate('/faculty/dashboard');
      } else {
        setError('Account created. Please sign in.');
      }
    } catch (err) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) throw err;
      if (data.session) {
        navigate('/faculty/dashboard');
      } else {
        setError('Sign in failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={style.card}>
      <h2>Faculty Login</h2>
      {error && <div style={style.alert}>{error}</div>}
      <form onSubmit={handleLogin} style={style.form}>
        <label style={style.label}>Email</label>
        <input
          style={style.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label style={style.label}>Password</label>
        <input
          style={style.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" style={{ ...style.btn, ...style.btnPrimary }} disabled={loading}>
          <LoadingButtonContent loading={loading} loadingLabel="Signing in…">
            Sign in
          </LoadingButtonContent>
        </button>
      </form>
      <p style={style.muted}>Don't have an account?</p>
      <button onClick={handleSignup} style={{ ...style.btn, ...style.btnOutline }} disabled={loading}>
        <LoadingButtonContent loading={loading} loadingLabel="Creating…">
          Create faculty account
        </LoadingButtonContent>
      </button>
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
  h2: { marginTop: 0, fontSize: 20 },
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
  btn: { padding: 9, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  btnPrimary: { background: '#2b5cff', color: '#fff' },
  btnOutline: { background: '#f3f4f6', color: '#111', marginTop: 8 },
  muted: { fontSize: 13, color: '#6b7280', marginTop: 8 },
};
