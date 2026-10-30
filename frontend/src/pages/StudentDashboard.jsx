import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../lib/supabase.js';
import Loading from '../components/Loading.jsx';

export default function StudentDashboard() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const POLL_MS = 3000;

  async function authHeaders() {
    const token = localStorage.getItem('exam_student_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function poll() {
    try {
      const res = await fetch(`${API_BASE}/student/dashboard-state`, {
        headers: await authHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('exam_student_token');
        window.location.href = '/student/login';
        return;
      }
      const json = await res.json();
      setState(json || {});
      setError(null);
    } catch (err) {
      setError('Connection problem. Retrying automatically…');
    } finally {
      setLoading(false);
    }
  }

  async function retry() {
    await poll();
  }

  function sendLeaveSignal() {
    const token = localStorage.getItem('exam_student_token');
    if (!token) return;
    try {
      const url = `${API_BASE}/student/leave`;
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ token })], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
      } else {
        fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch (_) {}
  }

  useEffect(() => {
    sendLeaveSignal();
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (
      !state ||
      state.status !== 'live' ||
      state.seconds_left == null ||
      state.seconds_left <= 0
    )
      return;
    const tick = setInterval(() => {
      setState((prev) => {
        if (!prev || prev.seconds_left == null || prev.seconds_left <= 0) return prev;
        return { ...prev, seconds_left: Math.max(0, prev.seconds_left - 1) };
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [state?.status]);

  const fmt = (sec) => {
    if (sec == null) return '-';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const btnText = () => {
    if (!state) return 'Loading…';
    if (state.locked) return 'Locked - contact faculty';
    if (state.status === 'live') return 'Enter exam';
    if (state.status === 'ended') return 'Exam ended';
    return 'Waiting for faculty to start the exam…';
  };

  const btnOn = state && state.status === 'live' && !state.locked;

  return (
    <div style={style.page}>
      {loading && <Loading />}
      {!loading && (
        <>
        {error && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              ...style.alert,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <button
              onClick={retry}
              style={{
                background: 'transparent',
                border: '1px solid currentColor',
                color: 'currentColor',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
              }}
            >
              Retry
            </button>
          </div>
        )}
        <nav style={style.nav}>
          <b>Exam Portal</b>
          <span style={style.spacer}></span>
          <span>Student Dashboard</span>
          <button
            onClick={() => {
              sendLeaveSignal();
              localStorage.removeItem('exam_student_token');
              localStorage.removeItem('exam_student_jwt');
              localStorage.removeItem('exam_student_user');
              localStorage.removeItem('exam_student_code');
              sessionStorage.removeItem('exam_student_token');
              sessionStorage.removeItem('exam_student_jwt');
              sessionStorage.removeItem('exam_student_user');
              sessionStorage.removeItem('exam_student_code');
              sessionStorage.removeItem('exam_student_title');
              window.location.href = '/student/login';
            }}
            style={style.btnDanger}
          >
            Logout
          </button>
        </nav>

        <div style={style.card}>
          <h2 style={{ marginTop: 0 }}>Welcome, Student</h2>
          {state && (
            <>
              <p style={style.muted}>
                One question from this exam&rsquo;s faculty-created question list is assigned when you enter.
              </p>
              <div style={style.stats}>
                <div style={style.stat}>
                  <small>Status</small>
                  <b style={style.badge(state.status)}>{state.status || '-'}</b>
                </div>
                <div style={style.stat}>
                  <small>Time left</small>
                  <b id="timeLeft">{fmt(state.seconds_left)}</b>
                </div>
                <div style={style.stat}>
                  <small>Violations</small>
                  <b>{state.violations != null ? state.violations : 0}/{state.max != null ? state.max : '-'}</b>
                </div>
              </div>
              <p id="note" className="muted" style={style.muted}>
                {btnOn
                  ? 'The exam is live. Click "Enter exam" to open your question.'
                  : state.status === 'ended'
                  ? 'This exam has ended.'
                  : state.locked
                  ? 'Your exam is locked.'
                  : 'One question from this exam&rsquo;s faculty-created question list is assigned when you enter.'}
              </p>
              {btnOn ? (
                <Link to="/student/exam" style={style.btnLink(true)}>
                  {btnText()}
                </Link>
              ) : (
                <span style={style.btnLink(false)}>{btnText()}</span>
              )}
            </>
          )}
          {!state && <p>Loading…</p>}
        </div>

        <div style={style.card}>
          <h3 style={{ marginTop: 0 }}>Instructions</h3>
          <ul style={style.rules}>
            <li>Stay on this page until the faculty starts the exam. The button turns active when it starts.</li>
            <li>When you enter fullscreen, one question from this exam&rsquo;s faculty-created question list is assigned to you. If you re-enter, you keep the same question.</li>
            <li>The exam opens in <b>fullscreen</b>. Your question is shown only while you are in fullscreen.</li>
            <li>Do <b>not</b> switch tabs, open other windows, or leave fullscreen. Each time is recorded as a violation.</li>
            <li>After <b>{state && state.max != null ? state.max : '?'}</b> violations your exam is locked and you must contact the faculty.</li>
            <li>Copy, paste, right-click and developer shortcuts are disabled.</li>
            <li>Logging in from another browser logs you out of the first one.</li>
          </ul>
        </div>

        {error && <div style={style.alert}>{error}</div>}
        </>
      )}
    </div>
  );
}

const style = {
  page: { fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 16 },
  nav: {
    background: '#1d2433', color: '#fff', padding: '12px 24px', display: 'flex',
    gap: 18, alignItems: 'center', marginBottom: 24,
  },
  btnDanger: { background: '#d33', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' },
  spacer: { flex: 1 },
  card: {
    background: '#fff', borderRadius: 10, padding: 22, boxShadow: '0 2px 10px rgba(0,0,0,.08)', marginBottom: 18,
  },
  muted: { color: '#6b7280', fontSize: 14 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '14px 0' },
  stat: { background: '#eef1f7', borderRadius: 8, padding: 12 },
  statSmall: { display: 'block', color: '#6b7280', marginBottom: 4, fontSize: 12 },
  badge: (s) => ({
    padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#fff',
    background: s === 'live' ? '#1a8f4a' : s === 'ended' ? '#d33' : '#b7791f',
  }),
  btnLink: (on) => ({
    display: 'inline-block',
    background: on ? '#2b5cff' : '#cbd5e1',
    color: '#fff',
    border: 'none',
    padding: '9px 16px',
    borderRadius: 6,
    cursor: on ? 'pointer' : 'not-allowed',
    textDecoration: 'none',
    fontSize: 14,
    opacity: on ? 1 : 0.5,
  }),
  rules: { margin: 0, paddingLeft: 20, lineHeight: 1.8 },
  alert: {
    color: '#b91c1c',
    background: '#fef2f2',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 14,
  },
};
