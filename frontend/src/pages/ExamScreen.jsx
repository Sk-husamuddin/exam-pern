import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE } from '../lib/supabase.js';
import Loading from '../components/Loading.jsx';

export default function ExamScreen() {
  const navigate = useNavigate();
  const studentUser = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('exam_student_user') || '{}');
    } catch (_) {
      return {};
    }
  })();
  const studentRollNo = studentUser.username || '';
  const studentName = studentUser.name || studentUser.username || 'Student';

  const [data, setData] = useState(null);
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(true);
  const [armed, setArmed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [deadline, setDeadline] = useState(0);
  const [entering, setEntering] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState('');

  const lastDataRef = useRef(null);
  const armedRef = useRef(false);
  const lastVRef = useRef(0);
  const dataRef = useRef(null);
  const pollTimerRef = useRef(null);
  const armedOnMountRef = useRef(false);

  const POLL_MS = 3000;

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  async function sessionAuthHeaders() {
    const token = sessionStorage.getItem('exam_student_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function jwtAuthHeaders() {
    const token = sessionStorage.getItem('exam_student_jwt');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function getJson(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 403) {
      throw new Error('Session expired or access denied');
    }
    const raw = await res.text();
    let d;
    try {
      d = JSON.parse(raw);
    } catch (_) {
      throw new Error('Server response was not JSON');
    }
    if (res.status === 401 && d.status === 'kicked') {
      return d;
    }
    if (!res.ok || d.error) {
      throw new Error(d.error || `Request failed (${res.status})`);
    }
    return d;
  }

  function fmt(sec) {
    sec = Math.max(0, Number(sec) || 0);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function applyData(d) {
    if (!d || typeof d !== 'object') return;
    lastDataRef.current = d;
    setData((prev) => ({
      ...(prev || {}),
      ...d,
      entered: d.entered != null ? d.entered : (prev?.entered ?? false),
      question: d.question != null ? d.question : prev?.question,
      questions: d.questions != null ? d.questions : prev?.questions,
      position: d.position != null ? d.position : prev?.position,
    }));
    if (d.seconds_left != null && d.status === 'live') {
      setDeadline(Date.now() + d.seconds_left * 1000);
      setTimeLeftStr(fmt(d.seconds_left));
    }

    if (d.locked || d.status === 'ended' || d.status === 'kicked') {
      setArmed(false);
    }
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

  async function fetchState() {
    try {
      const isActive =
        !document.hidden &&
        !!document.fullscreenElement &&
        document.hasFocus() &&
        !!dataRef.current?.entered &&
        !dataRef.current?.locked &&
        dataRef.current?.status === 'live';

      const d = await getJson(`${API_BASE}/student/state?active=${isActive ? '1' : '0'}`, {
        cache: 'no-store',
        headers: await sessionAuthHeaders(),
      });
      applyData(d);
    } catch (e) {
      setWarning('Connection problem: ' + (e.message || 'Unable to contact server.') + ' Retrying automatically…');
    } finally {
      setLoading(false);
    }
  }

  async function recordViolation(reason) {
    // If not armed or already locked, do not record further violations
    if (!armedRef.current || dataRef.current?.locked) return;

    const now = Date.now();
    if (now - lastVRef.current < 1500) return;
    lastVRef.current = now;

    setWarning(`Warning: ${reason} has been recorded.`);

    try {
      const headers = await sessionAuthHeaders();
      headers['Content-Type'] = 'application/json';
      const updated = await getJson(`${API_BASE}/student/violation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason }),
      });
      applyData(updated);
    } catch (_) {}
  }

  async function enterFullscreen() {
    if (entering || data?.locked) return;
    setEntering(true);
    setWarning('');

    try {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (fsErr) {
        console.warn('Fullscreen request rejected or not supported:', fsErr);
      }

      // Arm the exam once fullscreen is active; violations only count from here on
      setArmed(true);
    } catch (e) {
      setWarning('Unable to enter fullscreen: ' + (e.message || 'Please try again.'));
    } finally {
      setEntering(false);
    }
  }

  async function loadStateAndEnter() {
    const token = sessionStorage.getItem('exam_student_token');
    if (!token) {
      navigate('/', { replace: true });
      return;
    }

    try {
      const code = sessionStorage.getItem('exam_student_code') || '';
      // Start/enter exam directly with session auth
      const enterRes = await getJson(`${API_BASE}/student/enter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await sessionAuthHeaders()),
        },
        body: JSON.stringify({ exam_code: code, start_exam: true }),
      });
      if (enterRes.session_token) {
        sessionStorage.setItem('exam_student_token', enterRes.session_token);
      }
      applyData(enterRes);
      if (!enterRes.locked && document.fullscreenElement) {
        setArmed(true);
      }
    } catch (e) {
      // Fallback: try GET /state if /enter had a transient error
      try {
        const d = await getJson(`${API_BASE}/student/state`, {
          cache: 'no-store',
          headers: await sessionAuthHeaders(),
        });
        applyData(d);
        if (!d.locked && document.fullscreenElement) {
          setArmed(true);
        }
      } catch (inner) {
        setWarning('Unable to load exam: ' + (e.message || 'Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  }

  // Set up event listeners once on mount
  useEffect(() => {
    let mounted = true;

    // No student token → redirect to login
    if (!sessionStorage.getItem('exam_student_token')) {
      navigate('/', { replace: true });
      return;
    }

    loadStateAndEnter();

    function handleVisibility() {
      if (document.hidden) {
        sendLeaveSignal();
        recordViolation('Tab switch');
      }
    }

    function handleBlur() {
      // Blur can fire during clicks inside the window or focus shifts.
      // Only record a violation if document is hidden or fullscreen was dropped.
      if (document.hidden || !document.fullscreenElement) {
        sendLeaveSignal();
        recordViolation('Window lost focus');
      }
    }

    function handleFullscreenChange() {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs) {
        sendLeaveSignal();
        recordViolation('Left fullscreen');
      }
    }

    function handleKeyDown(e) {
      const k = e.key.toLowerCase();
      const bad =
        e.key === 'F12' ||
        e.key === 'PrintScreen' ||
        (e.ctrlKey && ['c', 'v', 'x', 'a', 'u', 's', 'p'].includes(k)) ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) ||
        (e.metaKey && ['c', 'v', 'x', 'a', 'u', 's', 'p'].includes(k)) ||
        (e.metaKey && e.shiftKey && ['i', 'j', 'c'].includes(k));
      if (bad) {
        e.preventDefault();
        recordViolation('Blocked key: ' + e.key);
      }
    }

    function blockEvent(e) {
      e.preventDefault();
    }

    function handleBeforeUnload(e) {
      sendLeaveSignal();
      if (dataRef.current && dataRef.current.status === 'live' && !dataRef.current.locked) {
        e.preventDefault();
        e.returnValue = '';
      }
    }

    function handlePageHide() {
      sendLeaveSignal();
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);

    // Keep contextmenu, copy, cut, paste restricted, but permit normal mouse selection & clicks
    const blocked = ['contextmenu', 'copy', 'cut', 'paste'];
    blocked.forEach((ev) => document.addEventListener(ev, blockEvent));
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      sendLeaveSignal();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
      blocked.forEach((ev) => document.removeEventListener(ev, blockEvent));
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  // Polling loop
  useEffect(() => {
    let active = true;

    async function tick() {
      if (!active) return;
      await fetchState();
      if (active) {
        pollTimerRef.current = setTimeout(tick, POLL_MS);
      }
    }

    tick();

    return () => {
      active = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!deadline || !data || data.status !== 'live' || data.locked) return;
    const timerId = setInterval(() => {
      const left = Math.round((deadline - Date.now()) / 1000);
      setTimeLeftStr(fmt(Math.max(0, left)));
    }, 500);
    return () => clearInterval(timerId);
  }, [deadline, data?.status, data?.locked]);

  // The overlay is shown ONLY when the exam is live, not locked, and not in fullscreen.
  // The question is hidden behind it until fullscreen is active.
  const showOverlay =
    !loading &&
    data &&
    data.status === 'live' &&
    !data.locked &&
    !isFullscreen;

  const readyToShowQuestion =
    data &&
    data.status === 'live' &&
    !data.locked &&
    data.entered &&
    isFullscreen;

  return (
    <div style={style.examRoot}>
      <header style={style.bar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b id="examTitle" data-testid="examTitle">{data?.title || 'Exam'}</b>
          <span style={{ color: '#64748b' }}>&middot;</span>
          <span id="studentRollNo" data-testid="studentRollNo" style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>
            {studentRollNo ? `Roll No: ${studentRollNo}` : ''}
          </span>
          {studentRollNo && <span style={{ color: '#64748b' }}>&middot;</span>}
          <span id="studentName" data-testid="studentName" style={{ color: '#f8fafc', fontSize: 13, fontWeight: 600 }}>
            {studentName}
          </span>
        </div>
        <div>
          <span id="viol" style={{ marginRight: 16 }}>
            {data && data.violations != null ? `Violations: ${data.violations}/${data.max || 3}` : ''}
          </span>
          <span id="timer" className="timer" style={style.timer}>
            {timeLeftStr}
          </span>
        </div>
      </header>

      {loading && <Loading message="Connecting to exam server…" />}

      {warning && (
        <div id="warn" className="alert" style={style.alert}>
          {warning}
        </div>
      )}

      {/* Main content display based on exam state */}
      {!loading && data && (
        <main id="main" style={style.main}>
          {data.locked ? (
            <div style={style.card}>
              <h2 style={{ color: '#FF1818', marginTop: 0, fontWeight: 800 }}>Exam locked</h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: '#FFFFFF' }}>
                Your exam was locked because of too many violations (<b style={{ color: '#FF1818' }}>{data.violations}/{data.max || 3}</b>). Please contact the faculty to unlock your exam.
              </p>
              <Link to="/student/dashboard" onClick={sendLeaveSignal} style={style.btnPrimaryLink}>
                Back to dashboard
              </Link>
            </div>
          ) : data.status === 'ended' ? (
            <div style={style.card}>
              <h2 style={{ marginTop: 0, color: '#FFFFFF', fontWeight: 800 }}>Exam ended</h2>
              <p style={{ fontSize: 16, color: '#E4E4E7' }}>Thank you. Your exam has ended.</p>
              <Link to="/student/dashboard" onClick={sendLeaveSignal} style={style.btnPrimaryLink}>
                Back to dashboard
              </Link>
            </div>
          ) : data.status === 'kicked' ? (
            <div style={style.card}>
              <h2 style={{ marginTop: 0, color: '#FFFFFF', fontWeight: 800 }}>Session expired</h2>
              <p style={{ fontSize: 16, color: '#E4E4E7' }}>This student session is no longer active. Please sign in again.</p>
              <Link to="/" onClick={sendLeaveSignal} style={style.btnPrimaryLink}>
                Login
              </Link>
            </div>
          ) : readyToShowQuestion ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div
                data-testid="studentExamBadge"
                style={{
                  background: '#18181B',
                  border: '1px solid #27272A',
                  borderRadius: 0,
                  padding: '12px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  fontSize: 14,
                }}
              >
                <div>
                  <span style={{ color: '#A1A1AA', marginRight: 6 }}>Student Name:</span>
                  <strong style={{ color: '#FFFFFF' }}>{studentName}</strong>
                </div>
                <div>
                  <span style={{ color: '#A1A1AA', marginRight: 6 }}>Roll Number:</span>
                  <strong style={{ color: '#FFFFFF' }}>{studentRollNo || '—'}</strong>
                </div>
              </div>

              {Array.isArray(data.questions) && data.questions.length > 0 ? (
                data.questions.map((q, idx) => (
                  <div key={q.id || idx}>
                    <h2 style={{ marginBottom: 12, color: '#FFFFFF', fontSize: 20, fontWeight: 800 }}>
                      Question {q.position != null ? q.position : idx + 1}
                      {data.questions.length > 1 && (
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#A1A1AA', marginLeft: 10 }}>
                          ({idx + 1} of {data.questions.length})
                        </span>
                      )}
                    </h2>
                    <div style={style.question}>
                      {q.body || q.question}
                    </div>
                  </div>
                ))
              ) : (
                <div>
                  <h2 style={{ marginBottom: 16, color: '#FFFFFF', fontSize: 20, fontWeight: 800 }}>Question {data.position || ''}</h2>
                  <div style={style.question}>
                    {data.question || 'No question has been assigned yet. Please contact faculty.'}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={style.card}>
              <p style={{ color: '#A1A1AA', margin: 0, fontSize: 15 }}>
                Waiting for the faculty to start the exam…
              </p>
            </div>
          )}
        </main>
      )}

      {/* Fullscreen Entry Overlay: shown when the exam is live but not in fullscreen.
           NEVER shown if exam is locked. No exam-code input here. */}
      {showOverlay && (
        <div id="fsOverlay" className="overlay" style={style.overlay}>
          <div style={style.overlayCard}>
            <h2 style={{ marginTop: 0, color: '#FFFFFF', fontWeight: 800 }}>Return to fullscreen to continue</h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: '#e5e7eb' }}>
              The exam is live and your question is ready. Click below to enter fullscreen.
              Switching tabs or leaving fullscreen is recorded as a violation.
            </p>
            <button
              className="btn"
              id="fsBtn"
              onClick={enterFullscreen}
              disabled={entering}
              style={style.btn}
            >
              {entering ? 'Entering…' : 'Enter fullscreen'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        .exam { user-select: none; -webkit-user-select: none }
        body.exam, #root.exam { background: #0A0A0A; }
      `}</style>
    </div>
  );
}

const style = {
  examRoot: { fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: '#0A0A0A', minHeight: '100vh', color: '#FFFFFF' },
  bar: {
    background: '#121212', color: '#FFFFFF', padding: '14px 24px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid #27272A',
  },
  timer: { fontSize: 20, fontWeight: 800, color: '#FF1818', fontFamily: 'ui-monospace, monospace' },
  main: { maxWidth: 900, margin: '30px auto', padding: '0 20px' },
  muted: { color: '#A1A1AA' },
  card: {
    background: '#121212', borderRadius: 0, padding: 28,
    border: '1px solid #27272A', color: '#FFFFFF',
    boxShadow: 'none',
  },
  question: {
    whiteSpace: 'pre-wrap', fontSize: 18, lineHeight: 1.65,
    background: '#18181B', padding: 24, borderRadius: 0,
    border: '1px solid #27272A', color: '#FFFFFF',
    boxShadow: 'none',
  },
  btnPrimaryLink: {
    display: 'inline-block',
    background: '#FF1818',
    color: '#FFFFFF',
    border: '1px solid #FF1818',
    padding: '9px 18px',
    borderRadius: 0,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 700,
    marginTop: 14,
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 99, textAlign: 'center', color: '#FFFFFF', fontFamily: 'Inter, system-ui, sans-serif',
  },
  overlayCard: { maxWidth: 420, background: '#121212', border: '1px solid #27272A', padding: 28, borderRadius: 0 },
  btn: {
    background: '#FF1818', color: '#FFFFFF', border: '1px solid #FF1818', padding: '10px 18px',
    borderRadius: 0, cursor: 'pointer', fontSize: 14, marginTop: 10, fontWeight: 700,
  },
  alert: {
    background: '#141414', border: '1px solid #27272A', borderLeft: '3px solid #FF1818',
    color: '#FFFFFF', padding: '10px 14px',
    borderRadius: 0, margin: '14px 20px 0', maxWidth: 900, marginLeft: 'auto', marginRight: 'auto',
  },
  alertErr: {
    background: '#141414', border: '1px solid #27272A', borderLeft: '3px solid #FF1818',
    color: '#FFFFFF', padding: '10px 14px',
    borderRadius: 0, margin: '14px 20px 0', maxWidth: 900, marginLeft: 'auto', marginRight: 'auto',
  },
};
