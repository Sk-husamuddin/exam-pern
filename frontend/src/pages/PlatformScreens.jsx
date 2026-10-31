import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button, FormField, Logo } from '../components/ui.jsx';
import { supabase, AUTH_BASE, API_BASE } from '../lib/supabase.js';

// Unified Login portal at "/" for both faculty and students.
// If an exam code is provided, student flow is triggered; otherwise faculty flow is executed.
export function UnifiedLogin() {
  const navigate = useNavigate();
  const [signup, setSignup] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [banner, setBanner] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef(null);

  const emailRedirectTo = window.location.origin + '/';
  const isStudent = code.trim().length > 0;

  useEffect(() => {
    // 1. Process URL hash params (e.g. #access_token=...&type=signup or #error_description=...)
    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const errorDesc = hashParams.get('error_description');
      if (errorDesc) {
        setBanner({ kind: 'err', text: decodeURIComponent(errorDesc.replace(/\+/g, ' ')) });
      } else if (hashParams.get('type') === 'signup' || hashParams.get('access_token')) {
        setBanner({ kind: 'ok', text: 'Email confirmed successfully! You can now sign in.' });
      }
    }

    // 2. Process URL search query params
    if (window.location.search) {
      const searchParams = new URLSearchParams(window.location.search);
      const errorDesc = searchParams.get('error_description');
      if (errorDesc) {
        setBanner({ kind: 'err', text: decodeURIComponent(errorDesc.replace(/\+/g, ' ')) });
      }
    }

    // 3. Listen to Supabase auth events (automatic token verification)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        setBanner({ kind: 'ok', text: 'Email confirmed! Redirecting to faculty dashboard…' });
        setTimeout(() => {
          navigate('/faculty/dashboard', { replace: true });
        }, 1200);
      }
    });

    // 4. If already logged in as faculty, redirect
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        navigate('/faculty/dashboard', { replace: true });
      }
    });

    return () => {
      subscription?.unsubscribe();
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, [navigate]);

  const clearBanner = () => setBanner(null);

  const mapAuthError = (err) => {
    const codeStr = String(err.code || '');
    const status = String(err.status || '');
    const message = String(err.message || '');
    const haystack = (codeStr + ' ' + status + ' ' + message).toLowerCase();
    if (codeStr === 'over_email_send_rate_limit' || status === '429' || haystack.includes('rate limit')) {
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
    if (codeStr === 'weak_password' || haystack.includes('weak password')) {
      return 'Password is too weak. ' + (message ? message + ' ' : 'Use a longer or stronger password.');
    }
    if (haystack.includes('invalid email') || haystack.includes('email is invalid')) {
      return 'Please enter a valid email address.';
    }
    return message || 'Action failed. Please try again.';
  };

  async function handleResend(e) {
    if (e) e.preventDefault();
    if (resendCooldown > 0 || resending) return;
    clearBanner();
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: identifier, options: { emailRedirectTo } });
      if (error) {
        setBanner({ kind: 'err', text: mapAuthError(error) });
        return;
      }
      setBanner({ kind: 'ok', text: 'Confirmation email sent. Check your inbox.', action: handleResend, actionLabel: 'Resend confirmation email' });
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
      setBanner({ kind: 'err', text: mapAuthError(err) });
    } finally {
      setResending(false);
    }
  }

  async function handleFacultySignup(e) {
    e.preventDefault();
    if (loading) return;
    clearBanner();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: identifier.trim(),
        password,
        options: { emailRedirectTo },
      });
      if (error) {
        setBanner({ kind: 'err', text: mapAuthError(error) });
        setLoading(false);
        return;
      }
      const user = data.user;
      const session = data.session;
      const identities = Array.isArray(user?.identities) ? user.identities : [];
      if (user && session) {
        setBanner({ kind: 'ok', text: 'Account created' });
        window.location.href = '/faculty/dashboard';
        return;
      }
      if (user && identities.length > 0) {
        setBanner({
          kind: 'ok',
          text: 'Check your email to confirm your account.',
          action: handleResend,
          actionLabel: 'Resend confirmation email',
        });
        return;
      }
      setBanner({ kind: 'amber', text: 'This email is already registered. Sign in instead.' });
      setSignup(false);
    } catch (err) {
      setBanner({ kind: 'err', text: mapAuthError(err) });
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e) {
    e.preventDefault();
    if (loading) return;
    clearBanner();
    setLoading(true);

    try {
      if (isStudent) {
        // --- Student Login Flow (Exam Code was entered) ---
        const loginRes = await fetch(`${AUTH_BASE}/student/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: identifier.trim(), password }),
        });
        let loginJson;
        try { loginJson = await loginRes.json(); } catch (_) { loginJson = {}; }
        if (!loginRes.ok) throw new Error(loginJson.error || `Login failed (${loginRes.status})`);
        if (!loginJson.ok) throw new Error(loginJson.error || 'Invalid roll number or password');

        const enterRes = await fetch(`${API_BASE}/student/enter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginJson.studentJwt}` },
          body: JSON.stringify({ exam_code: code.trim().toUpperCase(), start_exam: false }),
        });
        let enterJson;
        try { enterJson = await enterRes.json(); } catch (_) { enterJson = {}; }
        if (!enterRes.ok) throw new Error(enterJson.error || 'Invalid exam code, or the exam has ended');
        if (enterJson.error) throw new Error(enterJson.error);

        sessionStorage.setItem('exam_student_jwt', loginJson.studentJwt);
        sessionStorage.setItem('exam_student_user', JSON.stringify(loginJson.user));
        sessionStorage.setItem('exam_student_token', enterJson.session_token);
        sessionStorage.setItem('exam_student_code', code.trim().toUpperCase());
        sessionStorage.setItem('exam_student_title', enterJson.title || '');

        navigate('/student/dashboard');
      } else {
        // --- Faculty Login Flow (Exam Code left empty) ---
        const { data, error } = await supabase.auth.signInWithPassword({
          email: identifier.trim(),
          password,
        });
        if (error) {
          const msg = String(error.message || '');
          if (msg.includes('Email not confirmed')) {
            setBanner({
              kind: 'amber',
              text: 'Email not confirmed. Check your inbox or request a new confirmation email.',
              action: handleResend,
              actionLabel: 'Resend confirmation email',
            });
            setLoading(false);
            return;
          }
          if (msg.includes('Invalid login credentials')) {
            setBanner({ kind: 'err', text: 'Invalid login credentials. Please check your email and password.' });
            setLoading(false);
            return;
          }
          setBanner({ kind: 'err', text: msg || 'Sign in failed. Please try again.' });
          setLoading(false);
          return;
        }
        if (data?.session) {
          window.location.href = '/faculty/dashboard';
        } else {
          setBanner({ kind: 'err', text: 'Sign in failed. Please try again.' });
        }
      }
    } catch (err) {
      setBanner({ kind: 'err', text: err.message || 'Login failed' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-brand">
        <Logo />
        <div className="auth-brand-copy">
          <div className="eyebrow light">
            <span className="eyebrow-dot" />
            Smart Exam Platform
          </div>
          <h1>One portal for all assessments.</h1>
          <p>
            Secure, reliable exam workspace. Faculty manage assessments and monitors; students enter with their roll number and exam code.
          </p>
          <div className="auth-quote">
            <ShieldCheck size={18} />
            <span>
              “Built for academic integrity, live monitoring, and effortless exam sessions.”
              <small>— Smart Exam Engineering</small>
            </span>
          </div>
        </div>
        <div className="auth-brand-footer">
          Secure by default <span>•</span> Designed for colleges
        </div>
      </section>

      <section className="auth-form-area">
        <div className="auth-form-wrap">
          <div className="form-heading">
            <span className="eyebrow">
              {signup ? 'Faculty Registration' : isStudent ? 'Student Access' : 'Portal Sign In'}
            </span>
            <h2>{signup ? 'Create faculty account' : 'Welcome to Exam Portal'}</h2>
            <p>
              {signup
                ? 'Register your official college email to create and manage exams.'
                : 'Enter your credentials. If you are taking an exam, enter your 6-character exam code.'}
            </p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={!signup ? 'selected' : ''}
              onClick={() => { setSignup(false); clearBanner(); }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={signup ? 'selected' : ''}
              onClick={() => { setSignup(true); clearBanner(); }}
            >
              Create faculty account
            </button>
          </div>

          {banner && (
            <div className={`alert ${banner.kind}`} role="alert" aria-live="polite">
              {banner.kind === 'ok' && <Check size={16} />}
              {banner.text}
              {banner.action && (
                <button
                  type="button"
                  className="resend-btn"
                  onClick={banner.action}
                  disabled={resendCooldown > 0 || resending}
                >
                  {banner.actionLabel || 'Resend confirmation email'}
                </button>
              )}
              {resendCooldown > 0 && <span className="cooldown">{resendCooldown}s</span>}
            </div>
          )}

          <form onSubmit={signup ? handleFacultySignup : handleSignIn}>
            <FormField
              label={signup ? 'Work email' : 'Email or Roll number'}
              id="unified-identifier"
            >
              <input
                id="unified-identifier"
                type={signup ? 'email' : 'text'}
                placeholder={signup ? 'you@college.edu' : 'e.g. faculty@college.edu or 24761A05AU'}
                required
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); clearBanner(); }}
              />
            </FormField>

            <FormField
              label="Password"
              id="unified-password"
              hint={signup ? 'At least 8 characters' : undefined}
            >
              <div className="input-action">
                <input
                  id="unified-password"
                  type={show ? 'text' : 'password'}
                  placeholder="Enter your password"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearBanner(); }}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>

            {!signup && (
              <FormField
                label="6-character exam code"
                id="unified-exam-code"
                hint="Students: Enter the exam code provided by faculty. Faculty: Leave blank."
              >
                <input
                  id="unified-exam-code"
                  className="exam-code"
                  placeholder="A1B2C3 (Students only)"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase());
                    clearBanner();
                  }}
                />
              </FormField>
            )}

            <Button type="submit" className="full-btn" icon={ArrowRight} loading={loading}>
              {signup
                ? 'Create faculty account'
                : isStudent
                ? 'Enter Exam as Student'
                : 'Sign in as Faculty'}
            </Button>
          </form>

          <p className="form-note">
            By continuing, you agree to our <a href="#">terms</a> and <a href="#">privacy policy</a>.
          </p>
        </div>
      </section>
    </div>
  );
}

// Backward-compatible exports for existing imports
export const LandingPage = UnifiedLogin;
export const FacultyAuth = UnifiedLogin;
export const StudentAuth = UnifiedLogin;

// Usage: render <StatusPage type="404" /> for missing routes or type="expired" for a timed-out session.
export function StatusPage({ type = '404' }) {
  const expired = type === 'expired';
  return (
    <div className="status-page">
      <Logo />
      <div className="status-panel">
        <div className="status-mark">{expired ? <LockKeyhole size={28} /> : <span>404</span>}</div>
        <span className="eyebrow">{expired ? 'Session security' : 'Page not found'}</span>
        <h1>{expired ? 'Session expired' : 'This page took a wrong turn.'}</h1>
        <p>
          {expired
            ? 'For your security, your session ended. Sign in again to continue where you left off.'
            : 'The page you are looking for doesn’t exist or may have moved.'}
        </p>
        <Button href="/">{expired ? 'Sign in again' : 'Return home'}</Button>
        {expired && <a className="text-link" href="/">Return to Smart Exam Platform</a>}
      </div>
      <small className="status-foot">Need help? Contact your college exam coordinator.</small>
    </div>
  );
}
