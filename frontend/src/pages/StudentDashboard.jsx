import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Clock, LogOut, AlertCircle, ShieldAlert, Maximize2, CheckCircle2 } from 'lucide-react';
import { API_BASE } from '../lib/supabase.js';
import Loading from '../components/Loading.jsx';

export default function StudentDashboard() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const POLL_MS = 3000;

  const studentUser = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('exam_student_user') || '{}');
    } catch (_) {
      return {};
    }
  })();
  const studentName = studentUser.name || studentUser.username || 'Student';
  const examCode = sessionStorage.getItem('exam_student_code') || '';

  async function authHeaders() {
    const token = sessionStorage.getItem('exam_student_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function poll() {
    try {
      const res = await fetch(`${API_BASE}/student/dashboard-state`, {
        headers: await authHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem('exam_student_token');
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
    const token = sessionStorage.getItem('exam_student_token');
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

  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // Only count down if student has entered/started the exam!
    // Until then, keep the display paused at full duration (e.g. 60:00).
    if (
      !state ||
      state.status !== 'live' ||
      state.seconds_left == null ||
      state.seconds_left <= 0 ||
      !state.entered
    )
      return;
    const tick = setInterval(() => {
      setState((prev) => {
        if (!prev || prev.seconds_left == null || prev.seconds_left <= 0) return prev;
        return { ...prev, seconds_left: Math.max(0, prev.seconds_left - 1) };
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [state?.status, state?.entered]);

  const fmt = (sec) => {
    if (sec == null) return '-';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const btnOn = state && state.status === 'live' && !state.locked;

  async function handleStartExam() {
    if (!btnOn || starting) return;
    setStarting(true);
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch((err) => {
          console.warn('Fullscreen request failed:', err);
        });
      }
    } catch (_) {}

    try {
      const code = sessionStorage.getItem('exam_student_code') || examCode;
      const res = await fetch(`${API_BASE}/student/enter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await authHeaders()),
        },
        body: JSON.stringify({ exam_code: code, start_exam: true }),
      });
      const data = await res.json();
      if (data.session_token) {
        sessionStorage.setItem('exam_student_token', data.session_token);
      }
    } catch (err) {
      console.warn('Start exam request warning:', err);
    }
    navigate('/student/exam');
  }

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
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

          {/* Navigation Bar */}
          <nav style={style.nav}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <b>Exam Portal</b>
              <span style={style.navDivider}>|</span>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Student Dashboard</span>
            </div>
            <span style={style.spacer}></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={style.userPill}>{studentName}</span>
              <button
                onClick={() => {
                  try {
                    sendLeaveSignal();
                  } catch (_) {}
                  localStorage.removeItem('exam_student_token');
                  localStorage.removeItem('exam_student_jwt');
                  localStorage.removeItem('exam_student_user');
                  localStorage.removeItem('exam_student_code');
                  sessionStorage.removeItem('exam_student_token');
                  sessionStorage.removeItem('exam_student_jwt');
                  sessionStorage.removeItem('exam_student_user');
                  sessionStorage.removeItem('exam_student_code');
                  sessionStorage.removeItem('exam_student_title');
                  navigate('/', { replace: true });
                }}
                style={style.btnDanger}
                title="Log out from student session"
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          </nav>

          {/* Main Assessment Card */}
          <div style={style.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <span style={style.eyebrow}>ASSESSMENT PORTAL</span>
                <h2 style={{ margin: '4px 0 6px', fontSize: 24, color: '#FFFFFF', fontWeight: 800 }}>
                  {state?.title || sessionStorage.getItem('exam_student_title') || 'Assigned Exam'}
                </h2>
                <div style={{ fontSize: 13, color: '#A1A1AA' }}>
                  Student: <b style={{ color: '#FFFFFF' }}>{studentName}</b>
                  {studentUser.username && studentUser.username !== studentName && (
                    <span> ({studentUser.username})</span>
                  )}
                </div>
              </div>
              {examCode && (
                <div style={style.codeBox}>
                  <small style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', color: '#A1A1AA', fontWeight: 700, letterSpacing: '0.05em' }}>Exam Code</small>
                  <span style={style.codeText}>{examCode}</span>
                </div>
              )}
            </div>

            {state && (
              <>
                <div style={style.stats}>
                  <div style={style.stat}>
                    <small style={style.statLabel}>Exam Status</small>
                    <b style={style.badge(state.status)}>
                      {state.status === 'live' ? 'Live Now' : state.status === 'draft' ? 'Waiting to Start' : (state.status || '-')}
                    </b>
                  </div>
                  <div style={style.stat}>
                    <small style={style.statLabel}>Time Remaining</small>
                    <b id="timeLeft" style={{ fontSize: 18, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={16} color="#FF1818" />
                      {fmt(state.seconds_left)}
                    </b>
                  </div>
                  <div style={style.stat}>
                    <small style={style.statLabel}>Recorded Violations</small>
                    <b style={{ fontSize: 18, color: state.violations > 0 ? '#dc2626' : '#16a34a' }}>
                      {state.violations != null ? state.violations : 0} / {state.max != null ? state.max : 3}
                    </b>
                  </div>
                </div>

                {/* State Guidance Message */}
                <div style={style.statusNoticeBox(btnOn, state.status, state.locked)}>
                  {btnOn ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle2 size={18} color="#15803d" />
                      <span style={{ fontWeight: 600, color: '#15803d' }}>
                        The exam is live! Click the red &quot;Start Exam&quot; button below to enter fullscreen and begin answering.
                      </span>
                    </div>
                  ) : state.status === 'ended' ? (
                    <span style={{ color: '#A1A1AA' }}>This exam has officially ended. Thank you for your submission.</span>
                  ) : state.locked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ShieldAlert size={18} color="#FF1818" />
                      <span style={{ color: '#FF1818', fontWeight: 600 }}>
                        Your exam session is locked due to violations ({state.violations}/{state.max || 3}). Please contact your faculty invigilator to unlock it.
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Clock size={18} color="#FDB813" />
                      <span style={{ color: '#FDB813' }}>
                        Waiting for faculty to start the exam. Please remain on this screen; the red <b>Start Exam</b> button will activate automatically.
                      </span>
                    </div>
                  )}
                </div>

                {/* The Red Start Exam Button */}
                <div style={{ marginTop: 24, marginBottom: 8 }}>
                  {btnOn ? (
                    <button
                      onClick={handleStartExam}
                      style={style.btnStartExamRed}
                      title="Enter fullscreen and begin exam"
                    >
                      <Play size={20} fill="#ffffff" color="#ffffff" />
                      <span>Start Exam</span>
                      <Maximize2 size={16} style={{ marginLeft: 6, opacity: 0.8 }} />
                    </button>
                  ) : (
                    <button
                      disabled
                      style={style.btnDisabled}
                    >
                      {state.locked
                        ? 'Locked — Contact Faculty'
                        : state.status === 'ended'
                        ? 'Exam Ended'
                        : 'Waiting for faculty to start the exam…'}
                    </button>
                  )}
                </div>
              </>
            )}
            {!state && <p style={{ color: '#A1A1AA' }}>Loading exam details…</p>}
          </div>

          {/* Exam Security Instructions Card */}
          <div style={style.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <ShieldAlert size={18} color="#FF1818" />
              <h3 style={{ margin: 0, fontSize: 16, color: '#FFFFFF', fontWeight: 800 }}>Exam Rules & Security Guidelines</h3>
            </div>
            <ul style={style.rules}>
              <li>
                Clicking <b style={{ color: '#FFFFFF' }}>&quot;Start Exam&quot;</b> will immediately switch your screen into <b style={{ color: '#FFFFFF' }}>fullscreen mode</b> and load your assigned questions.
              </li>
              <li>
                <b style={{ color: '#FFFFFF' }}>Do not leave fullscreen or switch tabs:</b> Exiting fullscreen, minimizing the window, or switching browser tabs is recorded as a security violation.
              </li>
              <li>
                <b style={{ color: '#FFFFFF' }}>Automatic Lockout:</b> Reaching <b style={{ color: '#FFFFFF' }}>{state && state.max != null ? state.max : 3}</b> violations will lock your test and require faculty intervention.
              </li>
              <li>
                Keyboard shortcuts (copy, cut, paste, devtools, print screen) and right-click context menus are strictly disabled during the exam.
              </li>
              <li>
                If you accidentally lose internet connection, do not close your browser. It will reconnect and preserve your timer automatically.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

const style = {
  page: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    maxWidth: 960,
    margin: '0 auto',
    padding: '24px 16px',
    color: '#FFFFFF',
    backgroundColor: '#0A0A0A',
    minHeight: '100vh',
  },
  nav: {
    background: '#121212',
    color: '#FFFFFF',
    padding: '14px 20px',
    borderRadius: 0,
    border: '1px solid #27272A',
    display: 'flex',
    alignItems: 'center',
    marginBottom: 24,
    boxShadow: 'none',
  },
  navDivider: { color: '#71717A', fontSize: 14 },
  userPill: {
    background: '#18181B',
    color: '#FFFFFF',
    padding: '5px 12px',
    borderRadius: 0,
    border: '1px solid #27272A',
    fontSize: 12,
    fontWeight: 600,
  },
  btnDanger: {
    background: 'transparent',
    color: '#FF1818',
    border: '1px solid #FF1818',
    padding: '6px 12px',
    borderRadius: 0,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
  spacer: { flex: 1 },
  card: {
    background: '#121212',
    borderRadius: 0,
    padding: 24,
    border: '1px solid #27272A',
    boxShadow: 'none',
    marginBottom: 20,
    color: '#FFFFFF',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.12em',
    color: '#FF1818',
    textTransform: 'uppercase',
  },
  codeBox: {
    background: '#18181B',
    border: '1px solid #27272A',
    borderRadius: 0,
    padding: '8px 14px',
    textAlign: 'center',
  },
  codeText: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: '0.15em',
    color: '#FF1818',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 14,
    margin: '18px 0',
  },
  stat: {
    background: '#18181B',
    borderRadius: 0,
    padding: 14,
    border: '1px solid #27272A',
  },
  statLabel: {
    display: 'block',
    color: '#A1A1AA',
    marginBottom: 6,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  badge: (s) => ({
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: s === 'draft' ? '#000000' : '#FFFFFF',
    background: s === 'live' ? '#FF1818' : s === 'ended' ? '#27272A' : '#FDB813',
  }),
  statusNoticeBox: (btnOn, status, locked) => ({
    padding: 14,
    borderRadius: 0,
    fontSize: 13,
    lineHeight: 1.5,
    background: '#18181B',
    border: `1px solid ${btnOn ? '#FF1818' : locked ? '#FF1818' : '#27272A'}`,
    color: '#FFFFFF',
    marginTop: 10,
  }),
  btnStartExamRed: {
    background: '#dc2626',
    color: '#ffffff',
    border: '1px solid #dc2626',
    padding: '14px 34px',
    borderRadius: 0,
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: '0.03em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    boxShadow: 'none',
    transition: 'background-color 0.15s ease',
  },
  btnDisabled: {
    background: '#27272A',
    color: '#71717A',
    border: '1px solid #3F3F46',
    padding: '12px 24px',
    borderRadius: 0,
    cursor: 'not-allowed',
    fontSize: 14,
    fontWeight: 600,
  },
  rules: {
    margin: 0,
    paddingLeft: 20,
    lineHeight: 1.8,
    fontSize: 13,
    color: '#A1A1AA',
  },
  alert: {
    color: '#FFFFFF',
    background: '#141414',
    border: '1px solid #27272A',
    borderLeft: '3px solid #FF1818',
    padding: 12,
    borderRadius: 0,
    marginBottom: 16,
    fontSize: 14,
  },
};
