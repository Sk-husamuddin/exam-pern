import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../lib/supabase.js';
import Loading from '../components/Loading.jsx';

export default function ExamScreen() {
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
      window.location.href = '/student/login';
      throw new Error('Session expired');
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
      window.location.href = '/student/login';
      return;
    }

    try {
      const d = await getJson(`${API_BASE}/student/state`, {
        cache: 'no-store',
        headers: await sessionAuthHeaders(),
      });

      if (!d.entered) {
        // Not assigned yet: call /enter using the exam code from sessionStorage (no user input)
        const code = sessionStorage.getItem('exam_student_code') || '';
        const enterRes = await getJson(`${API_BASE}/student/enter`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await jwtAuthHeaders()),
          },
          body: JSON.stringify({ exam_code: code }),
        });
        applyData(enterRes);
        if (!enterRes.locked && document.fullscreenElement) {
          setArmed(true);
        }
      } else {
        applyData(d);
        if (!d.locked && document.fullscreenElement) {
          setArmed(true);
        }
      }
    } catch (e) {
      setWarning('Unable to load exam: ' + (e.message || 'Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  // Set up event listeners once on mount
  useEffect(() => {
    let mounted = true;

    // No student token → redirect to login
    if (!sessionStorage.getItem('exam_student_token')) {
      window.location.href = '/student/login';
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
      sendLeaveSignal();
      recordViolation('Window lost focus');
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

    const blocked = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart'];
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
        <div>
          <b id="examTitle" data-testid="examTitle">{data?.title || 'Exam'}</b> &middot; Student
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
              <h2 style={{ color: '#b91c1c', marginTop: 0 }}>Exam locked</h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: '#374151' }}>
                Your exam was locked because of too many violations (<b>{data.violations}/{data.max || 3}</b>). Please contact the faculty to unlock your exam.
              </p>
              <Link to="/student/dashboard" onClick={sendLeaveSignal} style={style.btnPrimaryLink}>
                Back to dashboard
              </Link>
            </div>
          ) : data.status === 'ended' ? (
            <div style={style.card}>
              <h2 style={{ marginTop: 0 }}>Exam ended</h2>
              <p style={{ fontSize: 16, color: '#374151' }}>Thank you. Your exam has ended.</p>
              <Link to="/student/dashboard" onClick={sendLeaveSignal} style={style.btnPrimaryLink}>
                Back to dashboard
              </Link>
            </div>
          ) : data.status === 'kicked' ? (
            <div style={style.card}>
              <h2 style={{ marginTop: 0 }}>Session expired</h2>
              <p style={{ fontSize: 16, color: '#374151' }}>This student session is no longer active. Please sign in again.</p>
              <Link to="/student/login" onClick={sendLeaveSignal} style={style.btnPrimaryLink}>
                Login
              </Link>
            </div>
          ) : readyToShowQuestion ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {Array.isArray(data.questions) && data.questions.length > 0 ? (
                data.questions.map((q, idx) => (
                  <div key={q.id || idx}>
                    <h2 style={{ marginBottom: 12, color: '#1e293b', fontSize: 20 }}>
                      Question {q.position != null ? q.position : idx + 1}
                      {data.questions.length > 1 && (
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b', marginLeft: 10 }}>
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
                  <h2 style={{ marginBottom: 16 }}>Question {data.position || ''}</h2>
                  <div style={style.question}>
                    {data.question || 'No question has been assigned yet. Please contact faculty.'}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={style.card}>
              <p style={{ color: '#4b5563', margin: 0, fontSize: 15 }}>
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
            <h2 style={{ marginTop: 0 }}>Return to fullscreen to continue</h2>
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
        body.exam, #root.exam { background: #f4f6f9; }
      `}</style>
    </div>
  );
}

const style = {
  examRoot: { fontFamily: 'system-ui, sans-serif' },
  bar: {
    background: '#1d2433', color: '#fff', padding: '12px 24px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  timer: { fontSize: 20, fontWeight: 'bold' },
  main: { maxWidth: 900, margin: '30px auto', padding: '0 20px' },
  muted: { color: '#6b7280' },
  card: {
    background: '#fff', borderRadius: 10, padding: 28,
    boxShadow: '0 2px 10px rgba(0,0,0,.08)',
  },
  question: {
    whiteSpace: 'pre-wrap', fontSize: 18, lineHeight: 1.65,
    background: '#fff', padding: 24, borderRadius: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  btnPrimaryLink: {
    display: 'inline-block',
    background: '#2b5cff',
    color: '#fff',
    padding: '9px 18px',
    borderRadius: 6,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    marginTop: 14,
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(20,25,40,.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 99, textAlign: 'center', color: '#fff', fontFamily: 'system-ui, sans-serif',
  },
  overlayCard: { maxWidth: 420, background: 'rgba(255,255,255,.08)', padding: 28, borderRadius: 12 },
  btn: {
    background: '#2b5cff', color: '#fff', border: 'none', padding: '10px 18px',
    borderRadius: 6, cursor: 'pointer', fontSize: 14, marginTop: 10, fontWeight: 600,
  },
  alert: {
    background: '#fde8e8', color: '#9b1c1c', padding: '10px 14px',
    borderRadius: 6, margin: '14px 20px 0', maxWidth: 900, marginLeft: 'auto', marginRight: 'auto',
  },
  alertErr: {
    background: '#fde8e8', color: '#9b1c1c', padding: '10px 14px',
    borderRadius: 6, margin: '14px 20px 0', maxWidth: 900, marginLeft: 'auto', marginRight: 'auto',
  },
};
