import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Eye, EyeOff, FileSpreadsheet, Fullscreen, LockKeyhole, MonitorCheck, Play, ShieldCheck, Users, Wifi } from 'lucide-react';
import { Button, FAQ, FormField, Icon, Logo, StatusBadge, featureItems } from '../components/ui.jsx';
import { supabase, AUTH_BASE, API_BASE } from '../lib/supabase.js';

// Usage: render <LandingPage /> at route "/".
export function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // If confirmation email redirect landed on "/" with #access_token or ?code, send to faculty login
    if (window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('error'))) {
      navigate('/faculty/login' + window.location.hash, { replace: true });
    } else if (window.location.search && (window.location.search.includes('code=') || window.location.search.includes('error='))) {
      navigate('/faculty/login' + window.location.search, { replace: true });
    }
  }, [navigate]);

  return <div className="landing"><header className="landing-nav"><Logo /><nav className="desktop-nav"><a href="#features">Features</a><a href="#how-it-works">How it works</a></nav><div className="nav-actions"><a className="nav-login" href="/faculty/login">Faculty login</a><Button href="/student/login" variant="secondary">Student login</Button></div></header><main><section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" />Built for academic integrity</div><h1>Run secure online exams, <em>with live monitoring</em></h1><p>Smart Exam Platform gives colleges a calm, dependable way to create, deliver, and monitor assessments from anywhere.</p><div className="hero-actions"><Button href="/student/login" icon={ArrowRight}>I&apos;m a Student</Button><Button href="/faculty/login" variant="outline">I&apos;m Faculty</Button></div><div className="hero-proof"><div className="proof-avatars"><span>AK</span><span>MR</span><span>+</span></div><span>Trusted by faculty teams who value fair exams</span></div></div><div className="hero-visual"><div className="hero-glow" /><MonitorPreview /></div></section><section className="section section-muted" id="features"><div className="section-heading"><span className="eyebrow">Confidence by design</span><h2>Everything you need to run a fair exam</h2><p>Simple tools for the moments that matter before, during, and after an assessment.</p></div><div className="feature-grid">{featureItems.map(({ icon: I, title, text }) => <article className="feature-card" key={title}><div className="feature-icon"><I size={21} /></div><h3>{title}</h3><p>{text}</p></article>)}</div></section><section className="section how-section" id="how-it-works"><div className="section-heading"><span className="eyebrow">A clear workflow</span><h2>From setup to submitted in three steps</h2></div><div className="steps"><Step n="01" title="Create exam" text="Build your paper, set rules, and choose your monitoring settings." /><Step n="02" title="Share 6-character code" text="Students sign in with their roll number and the secure exam code." /><Step n="03" title="Monitor live" text="Watch progress, resolve issues, and keep the room moving." /></div></section><section className="section faq-section"><div className="section-heading"><span className="eyebrow">Questions, answered</span><h2>Designed for confidence</h2></div><div className="faq-list"><FAQ question="Can students take exams on mobile?" answer="Yes. The student experience is responsive and optimized for modern phones, tablets, and laptops." /><FAQ question="What happens if a student leaves fullscreen?" answer="The session records the event and can automatically lock the attempt based on your exam policy." /><FAQ question="Can I bring existing question banks?" answer="Yes. Faculty can import DOCX and Excel files, then review questions before publishing." /></div></section></main><footer className="footer"><Logo /><span>© 2025 Smart Exam Platform</span><div><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="/faculty/login">Faculty access</a></div></footer></div> }

function MonitorPreview() { return <div className="monitor-card"><div className="monitor-head"><div><span className="preview-kicker">Live exam monitor</span><h3>Midterm · Data Structures</h3></div><StatusBadge status="live" /></div><div className="monitor-stats"><div><strong>48</strong><span>Students</span></div><div><strong>42</strong><span>In progress</span></div><div><strong>01:18:42</strong><span>Time left</span></div></div><div className="progress-line"><span style={{ width: '76%' }} /></div><div className="student-list"><div><span className="student-avatar">AS</span><span><b>Aarav Shah</b><small>Question 28 of 40</small></span><StatusBadge status="online" /></div><div><span className="student-avatar">NP</span><span><b>Nina Patel</b><small>Question 31 of 40</small></span><StatusBadge status="online" /></div><div><span className="student-avatar warning">RK</span><span><b>Rahul Kumar</b><small>Fullscreen warning</small></span><StatusBadge status="locked" /></div></div><div className="monitor-foot"><span><Wifi size={15} />All systems operational</span><a href="#">Open monitor <ArrowRight size={14} /></a></div></div> }
function Step({ n, title, text }) { return <div className="step"><span className="step-num">{n}</span><div><h3>{title}</h3><p>{text}</p></div></div> }

// Usage: render <FacultyAuth /> at route "/faculty/login".
export function FacultyAuth() {
  const navigate = useNavigate();
  const [signup, setSignup] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [banner, setBanner] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef(null);

  const emailRedirectTo = window.location.origin + '/faculty/login';

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

    // 4. If already logged in, redirect to dashboard
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        navigate('/faculty/dashboard', { replace: true });
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [navigate]);

  const clearBanner = () => setBanner(null);

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
    console.warn(`[FacultyAuth:${label}]`, {
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
    if (resendCooldown > 0 || resending) return;
    clearBanner();
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } });
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

  useEffect(() => () => { if (resendTimerRef.current) clearInterval(resendTimerRef.current); }, []);

  async function handleSignup(e) {
    e.preventDefault();
    if (loading) return;
    clearBanner();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      devWarn('signup', { error, data });
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

  async function handleLogin(e) {
    e.preventDefault();
    if (loading) return;
    clearBanner();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      devWarn('signin', { error, data });
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
      if (data.session) {
        window.location.href = '/faculty/dashboard';
      } else {
        setBanner({ kind: 'err', text: 'Sign in failed. Please try again.' });
      }
    } catch (err) {
      setBanner({ kind: 'err', text: err.message || 'Sign in failed' });
    } finally {
      setLoading(false);
    }
  }

  return <div className="auth-page"><section className="auth-brand"><Logo /><div className="auth-brand-copy"><div className="eyebrow light"><span className="eyebrow-dot" />For faculty teams</div><h1>Make every assessment count.</h1><p>One secure workspace for creating thoughtful exams and keeping every student on a level playing field.</p><div className="auth-quote"><ShieldCheck size={18} /><span>“The clearest view we&apos;ve had of an exam room.”<small>— Prof. Maya Chen, Northbridge College</small></span></div></div><div className="auth-brand-footer">Secure by default <span>•</span> Designed for colleges</div></section><section className="auth-form-area"><div className="auth-form-wrap"><a href="/" className="back-link">← Back to home</a><div className="form-heading"><span className="eyebrow">Faculty access</span><h2>{signup ? 'Create your faculty account' : 'Welcome back'}</h2><p>{signup ? 'Set up your secure workspace in a few steps.' : 'Sign in to manage your exams and students.'}</p></div><div className="auth-tabs"><button className={!signup ? 'selected' : ''} onClick={() => { setSignup(false); clearBanner(); }}>Sign in</button><button className={signup ? 'selected' : ''} onClick={() => { setSignup(true); clearBanner(); }}>Create account</button></div>{banner && (
    <div className={`alert ${banner.kind}`} role="alert" aria-live="polite">
      {banner.kind === 'ok' && <Check size={16} />}
      {banner.text}
      {banner.action && (
        <button type="button" className="resend-btn" onClick={banner.action} disabled={resendCooldown > 0 || resending}>
          {banner.actionLabel || 'Resend confirmation email'}
        </button>
      )}
      {resendCooldown > 0 && <span className="cooldown">{resendCooldown}s</span>}
    </div>
  )}<form onSubmit={(e) => { e.preventDefault(); if (loading) return; (signup ? handleSignup : handleLogin)(e); }}><FormField label="Work email" id="faculty-email"><input id="faculty-email" type="email" placeholder="you@college.edu" required value={email} onChange={(e) => { setEmail(e.target.value); clearBanner(); }} /></FormField><FormField label="Password" id="faculty-password" hint={!signup && 'At least 8 characters'}><div className="input-action"><input id="faculty-password" type={show ? 'text' : 'password'} placeholder="Enter your password" required value={password} onChange={(e) => { setPassword(e.target.value); clearBanner(); }} /><button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></FormField><Button type="submit" className="full-btn" loading={loading}>{signup ? 'Create faculty account' : 'Sign in to workspace'}</Button></form><p className="form-note">By continuing, you agree to our <a href="#">terms</a> and <a href="#">privacy policy</a>.</p></div></section></div> }

// Usage: render <StudentAuth /> at route "/student/login".
export function StudentAuth() {
  const [show, setShow] = useState(false);
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const clearError = () => setError('');

  async function handleLogin(e) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${AUTH_BASE}/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      let json;
      try { json = await res.json(); } catch (_) { json = {}; }
      if (!res.ok) throw new Error(json.error || `Login failed (${res.status})`);
      if (!json.ok) throw new Error(json.error || 'Invalid roll number or password');

      const enterRes = await fetch(`${API_BASE}/student/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${json.studentJwt}` },
        body: JSON.stringify({ exam_code: code }),
      });
      let enterJson;
      try { enterJson = await enterRes.json(); } catch (_) { enterJson = {}; }
      if (!enterRes.ok) throw new Error(enterJson.error || 'Invalid exam code, or the exam has ended');
      if (enterJson.error) throw new Error(enterJson.error);

      // Store for StudentDashboard & ExamScreen; cleared on logout/exam end
      sessionStorage.setItem('exam_student_jwt', json.studentJwt);
      sessionStorage.setItem('exam_student_user', JSON.stringify(json.user));
      sessionStorage.setItem('exam_student_token', enterJson.session_token);
      sessionStorage.setItem('exam_student_code', code.trim().toUpperCase());
      sessionStorage.setItem('exam_student_title', enterJson.title || '');

      navigate('/student/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return <div className="student-page"><header className="simple-header"><Logo /><a href="/faculty/login">Faculty login <ArrowRight size={15} /></a></header><main className="student-main"><div className="student-copy"><div className="eyebrow"><span className="eyebrow-dot" />Student portal</div><h1>Ready when you are.</h1><p>Enter your details and exam code to join your assessment securely.</p><div className="student-illustration"><div className="student-shield"><ShieldCheck size={38} /></div><div className="orbit orbit-1" /><div className="orbit orbit-2" /><span className="float-card card-a"><Fullscreen size={15} />Fullscreen ready</span><span className="float-card card-b"><LockKeyhole size={15} />Session protected</span></div></div><div className="student-form-card"><div className="form-heading"><span className="eyebrow">Secure sign in</span><h2>Join your exam</h2><p>Use the credentials provided by your college.</p></div><form onSubmit={handleLogin}><FormField label="Roll number" id="roll-number"><input id="roll-number" placeholder="e.g. CS2024018" required value={username} onChange={(e) => { setUsername(e.target.value); clearError(); }} /></FormField><FormField label="Password" id="student-password"><div className="input-action"><input id="student-password" type={show ? 'text' : 'password'} placeholder="Enter your password" required value={password} onChange={(e) => { setPassword(e.target.value); clearError(); }} /><button type="button" onClick={() => setShow(!show)} aria-label="Toggle password visibility">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></FormField><FormField label="6-character exam code" id="exam-code" hint="Your faculty shared this code before the exam."><input className="exam-code" id="exam-code" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase())} placeholder="A1B2C3" maxLength={6} required /></FormField><Button type="submit" className="full-btn" icon={ArrowRight} loading={loading}>Enter exam</Button>{error && <div className="alert err" role="alert">{error}</div>}
</form><div className="checklist"><strong><ShieldCheck size={16} />Before you begin</strong><p><Check size={14} />Use Chrome or Edge</p><p><Check size={14} />Stay in fullscreen and don&apos;t switch tabs</p><p><Check size={14} />Violations may lock your exam</p></div></div></main></div> }

// Usage: render <StatusPage type="404" /> for missing routes or type="expired" for a timed-out session.
export function StatusPage({ type = '404' }) { const expired = type === 'expired'; return <div className="status-page"><Logo /><div className="status-panel"><div className="status-mark">{expired ? <LockKeyhole size={28} /> : <span>404</span>}</div><span className="eyebrow">{expired ? 'Session security' : 'Page not found'}</span><h1>{expired ? 'Session expired' : 'This page took a wrong turn.'}</h1><p>{expired ? 'For your security, your session ended. Sign in again to continue where you left off.' : 'The page you are looking for doesn’t exist or may have moved.'}</p><Button href={expired ? '/student/login' : '/'}>{expired ? 'Sign in again' : 'Return home'}</Button>{expired && <a className="text-link" href="/">Return to Smart Exam Platform</a>}</div><small className="status-foot">Need help? Contact your college exam coordinator.</small></div> }
