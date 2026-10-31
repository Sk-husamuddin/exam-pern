import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { useNavigate } from 'react-router-dom';
import { LoadingButtonContent } from '../components/Loading.jsx';

export default function FacultyLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef(null);
  const navigate = useNavigate();

  const emailRedirectTo = window.location.origin + '/faculty/login';

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        navigate('/faculty/dashboard', { replace: true });
      }
    });
  }, [navigate]);

  useEffect(() => () => { if (resendTimerRef.current) clearInterval(resendTimerRef.current); }, []);

  const clearMessages = () => { setError(''); setInfo(null); };

  const mapAuthError = (err) => {
    const code = String(err.code || '');
    const status = String(err.status || '');
    const message = String(err.message || '');
    const haystack = (code + ' ' + status + ' ' + message).toLowerCase();
    if (code === 'over_email_send_rate_limit' || status === '429' || haystack.includes('rate limit')) {
      return 'Too many emails sent. Wait a few minutes and try again.';
    }
    if (
      message.includes('Email address not authorized') ||
      haystack.includes('smtp') ||
      haystack.includes('not authorized') ||
      haystack.includes('email sending')
    ) {
      return 'Email sending is restricted for this project. Ask the admin to configure SMTP or disable email confirmation.';
    }
    if (code === 'weak_password' || haystack.includes('weak password')) {
      return 'Password is too weak. ' + (message ? message + ' ' : 'Use a longer or stronger password.');
    }
    if (haystack.includes('invalid email') || haystack.includes('email is invalid')) {
      return 'Please enter a valid email address.';
    }
    return message || 'Signup failed. Please try again.';
  };

  const devWarn = (label, { error, data }) => {
    if (!import.meta.env.DEV) return;
    const identities = data?.user?.identities;
    console.warn(`[FacultyLogin:${label}]`, {
      error: error ? { code: error.code, status: error.status, message: error.message } : null,
      data: {
        hasUser: !!data?.user,
        hasSession: !!data?.session,
        identitiesLength: Array.isArray(identities) ? identities.length : null,
      },
    });
  };

  async function handleResend(e) {
    if (e) e.preventDefault();
    if (resendCooldown > 0) return;
    clearMessages();
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } });
      if (error) {
        setError(mapAuthError(error));
        return;
      }
      setInfo({ kind: 'ok', text: 'Confirmation email sent. Check your inbox.', action: handleResend, actionLabel: 'Resend confirmation email' });
      setResendCooldown(60);
      resendTimerRef.current = setInterval(() => {
        setResendCooldown((c) => {
          if (c <= 1) {
            if (resendTimerRef.current) clearInterval(resendTimerRef.current);
            resendTimerRef.current = null;
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      setError(mapAuthError(err));
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        navigate('/faculty/dashboard', { replace: true });
      }
    });
  }, [navigate]);

  async function handleSignup(e) {
    e.preventDefault();
    if (loading) return;
    clearMessages();
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      devWarn('signup', { error: err, data });
      if (err) {
        setError(mapAuthError(err));
        setLoading(false);
        return;
      }
      const user = data.user;
      const session = data.session;
      const identities = Array.isArray(user?.identities) ? user.identities : [];
      if (user && session) {
        setInfo({ kind: 'ok', text: 'Account created' });
        navigate('/faculty/dashboard');
        return;
      }
      if (user && identities.length > 0) {
        setInfo({ kind: 'ok', text: 'Check your email to confirm your account.', action: handleResend, actionLabel: 'Resend confirmation email' });
        return;
      }
      setInfo({ kind: 'amber', text: 'This email is already registered. Sign in instead.' });
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (loading) return;
    clearMessages();
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      devWarn('signin', { error: err, data });
      if (err) {
        const msg = String(err.message || '');
        if (msg.includes('Email not confirmed')) {
          setInfo({ kind: 'amber', text: 'Email not confirmed. Check your inbox or request a new confirmation email.', action: handleResend, actionLabel: 'Resend confirmation email' });
          setLoading(false);
          return;
        }
        if (msg.includes('Invalid login credentials')) {
          setError('Invalid login credentials. Please check your email and password.');
          setLoading(false);
          return;
        }
        setError(msg || 'Sign in failed. Please try again.');
        setLoading(false);
        return;
      }
      if (data.session) {
        navigate('/faculty/dashboard');
      } else {
        setError('Sign in failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={style.card}>
      <h2>Faculty Login</h2>
      {error && <div style={style.alert}>{error}</div>}
      {info && (
        <div style={{ ...style.alert, ...(info.kind === 'ok' ? style.alertOk : style.alertAmber) }}>
          {info.text}
          {info.action && (
            <button type="button" onClick={info.action} disabled={resendCooldown > 0} style={style.resendBtn}>
              {info.actionLabel}
            </button>
          )}
          {resendCooldown > 0 && <span style={style.cooldown}>{resendCooldown}s</span>}
        </div>
      )}
      <form onSubmit={handleLogin} style={style.form}>
        <label style={style.label}>Email</label>
        <input
          style={style.input}
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); clearMessages(); }}
          required
        />
        <label style={style.label}>Password</label>
        <input
          style={style.input}
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); clearMessages(); }}
          required
        />
        <button type="submit" style={{ ...style.btn, ...style.btnPrimary }} disabled={loading}>
          <LoadingButtonContent loading={loading} loadingLabel="Signing in…">
            Sign in
          </LoadingButtonContent>
        </button>
      </form>
      <p style={style.muted}>Don't have an account?</p>
      <button onClick={handleSignup} style={{ ...style.btn, ...style.btnOutline }} disabled={loading || resendCooldown > 0}>
        <LoadingButtonContent loading={loading} loadingLabel="Creating…">
          Create faculty account
        </LoadingButtonContent>
      </button>
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
  h2: { marginTop: 0, fontSize: 20, color: '#FFFFFF', fontWeight: 800 },
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
  alertOk: { color: '#FFFFFF', background: '#141414', border: '1px solid #27272A', borderLeft: '3px solid #10B981', padding: 10, borderRadius: 0, marginBottom: 12, fontSize: 14 },
  alertAmber: { color: '#FFFFFF', background: '#141414', border: '1px solid #27272A', borderLeft: '3px solid #FDB813', padding: 10, borderRadius: 0, marginBottom: 12, fontSize: 14 },
  resendBtn: { background: '#FFFFFF', border: '1px solid #FFFFFF', color: '#000000', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, marginLeft: 10, padding: '3px 8px' },
  cooldown: { fontSize: 12, opacity: 0.8, marginLeft: 10, color: '#A1A1AA' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 13, fontWeight: 700, color: '#E4E4E7' },
  input: { padding: 10, border: '1px solid #27272A', borderRadius: 0, fontSize: 14, background: '#18181B', color: '#FFFFFF', outline: 'none' },
  btn: { padding: 10, border: 'none', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  btnPrimary: { background: '#FF1818', color: '#FFFFFF', border: '1px solid #FF1818' },
  btnOutline: { background: '#FFFFFF', color: '#000000', border: '1px solid #FFFFFF', marginTop: 8 },
  muted: { fontSize: 13, color: '#A1A1AA', marginTop: 8 },
};
