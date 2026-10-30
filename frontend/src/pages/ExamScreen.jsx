import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../lib/supabase.js';
import Loading from '../components/Loading.jsx';

export default function ExamScreen() {
  const [data, setData] = useState(null);
  const [backendDown, setBackendDown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [armed, setArmed] = useState(false);
  const [entered, setEntered] = useState(false);
  const [deadline, setDeadline] = useState(0);

  const lastDataRef = useRef(null);
  const armedRef = useRef(false);
  const lastVRef = useRef(0);
  const dataRef = useRef(null);
  const pollTimerRef = useRef(null);

  const POLL_MS = 3000;

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  async function sessionAuthHeaders() {
    const token = localStorage.getItem('exam_student_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function jwtAuthHeaders() {
    const token = localStorage.getItem('exam_student_jwt');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function checkBackendHealth() {
    try {
      const base = API_BASE.startsWith('http') ? API_BASE.replace(/\/api$/, '') : '';
      const res = await fetch(`${base}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error('Health check failed');
      const json = await res.json();
      if (!json.ok) throw new Error('Service unhealthy');
      setBackendDown(false);
      return true;
    } catch (_) {
      setBackendDown(true);
      return false;
    }
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

  function showMessage(title, text, href, linkText) {
    const main = document.getElementById('main');
    if (!main) return;
    main.innerHTML = '';
    main.dataset.shown = '';
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = text || '';
    main.append(h, p);
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      a.className = 'btn';
      a.textContent = linkText || 'Back';
      a.style.display = 'inline-block';
      a.style.textDecoration = 'none';
      a.style.background = '#2b5cff';
      a.style.color = '#fff';
      a.style.padding = '8px 16px';
      a.style.borderRadius = '6px';
      a.style.marginTop = '12px';
      main.append(a);
    }
  }

  function render(d) {
    if (!d || typeof d !== 'object') return;
    lastDataRef.current = d;
    setData(d);
    setBackendDown(false);

    if (d.title) {
      const titleEl = document.getElementById('examTitle');
      if (titleEl) titleEl.textContent = d.title;
    }

    const violEl = document.getElementById('viol');
    if (violEl && d.violations != null) {
      violEl.textContent = `Violations: ${d.violations}/${d.max || 3}`;
    }

    if (d.seconds_left != null && d.status === 'live') {
      setDeadline(Date.now() + d.seconds_left * 1000);
    }

    if (d.status === 'kicked') {
      showMessage(
        'Session expired',
        'This student session is no longer active. Please sign in again.',
        '/student/login',
        'Login'
      );
      setArmed(false);
      return;
    }
    if (d.status === 'ended') {
      showMessage(
        'Exam ended',
        'Thank you. Your exam has ended.',
        '/student/dashboard',
        'Back to dashboard'
      );
      setArmed(false);
      return;
    }
    if (d.locked) {
      showMessage(
        'Exam locked',
        'Your exam was locked because of too many violations. Please contact the faculty.'
      );
      setArmed(false);
      return;
    }

    const isFullscreen = !!document.fullscreenElement;
    const ready = !!d.entered && isFullscreen;
    const fsOverlay = document.getElementById('fsOverlay');
    if (fsOverlay) fsOverlay.style.display = ready ? 'none' : 'flex';

    const main = document.getElementById('main');
    if (!ready) {
      if (main) {
        main.innerHTML =
          '<p class="muted">Exam is ready. Click “Enter fullscreen & show my question” to continue.</p>';
        main.dataset.shown = '';
      }
      return;
    }

    if (!d.question) {
      showMessage(
        'Question not available',
        'No question has been assigned to this exam session. Please contact the faculty.'
      );
      return;
    }

    const key = String(d.position || '') + '|' + String(d.question);
    if (main && main.dataset.shown !== key) {
      main.innerHTML = '';
      const h = document.createElement('h2');
      h.textContent = `Question ${d.position || ''}`;
      const q = document.createElement('div');
      q.className = 'question';
      q.style.whiteSpace = 'pre-wrap';
      q.style.fontSize = '18px';
      q.style.lineHeight = '1.65';
      q.style.background = '#fff';
      q.style.padding = '24px';
      q.style.borderRadius = '10px';
      q.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)';
      q.textContent = d.question;
      main.append(h, q);
      main.dataset.shown = key;
    }
  }

  async function fetchState() {
    try {
      const healthy = await checkBackendHealth();
      if (!healthy) {
        const warn = document.getElementById('warn');
        if (warn) {
          warn.textContent = 'Connection problem: Backend server is not reachable on port 5000.';
          warn.style.display = 'block';
        }
        return;
      }
      setBackendDown(false);

      const d = await getJson(`${API_BASE}/student/state`, {
        cache: 'no-store',
        headers: await sessionAuthHeaders(),
      });
      render(d);
    } catch (e) {
      const warn = document.getElementById('warn');
      if (warn) {
        warn.textContent = 'Connection problem: ' + (e.message || 'Unable to contact server.') + ' Retrying automatically…';
        warn.style.display = 'block';
      }
    } finally {
      setLoading(false);
    }
  }

  async function recordViolation(reason) {
    if (!armedRef.current) return;
    const now = Date.now();
    if (now - lastVRef.current < 1500) return;
    lastVRef.current = now;

    const warn = document.getElementById('warn');
    if (warn) {
      warn.textContent = 'Warning: ' + reason + ' has been recorded.';
      warn.style.display = 'block';
    }

    try {
      const headers = await sessionAuthHeaders();
      headers['Content-Type'] = 'application/json';
      const updated = await getJson(`${API_BASE}/student/violation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason }),
      });
      render(updated);
    } catch (_) {}
  }

  async function enterFullscreen() {
    const btn = document.getElementById('fsBtn');
    if (btn) btn.disabled = true;

    try {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (fsErr) {
        console.warn('Fullscreen request rejected or not supported:', fsErr);
      }

      const examCodeInput = document.getElementById('examCodeInput');
      const examCode = examCodeInput ? examCodeInput.value.trim().toUpperCase() : '';
      if (examCode) {
        localStorage.setItem('exam_student_code', examCode);
      }

      const headers = await jwtAuthHeaders();
      headers['Content-Type'] = 'application/json';

      // 1. Enter exam and assign question
      const enterRes = await getJson(`${API_BASE}/student/enter`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ exam_code: examCode }),
      });

      if (enterRes.session_token) {
        localStorage.setItem('exam_student_token', enterRes.session_token);
      }

      if (enterRes.notice) {
        const warn = document.getElementById('warn');
        if (warn) {
          warn.textContent = enterRes.notice;
          warn.style.display = 'block';
        }
      }

      // 2. Immediately fetch the assigned question body and full state
      const stateHeaders = await sessionAuthHeaders();
      const fullState = await getJson(`${API_BASE}/student/state`, {
        cache: 'no-store',
        headers: stateHeaders,
      });

      render(fullState);
      setArmed(true);
      setEntered(true);
    } catch (e) {
      const warn = document.getElementById('warn');
      if (warn) {
        warn.textContent = 'Unable to enter exam: ' + (e.message || 'Please try again.');
        warn.style.display = 'block';
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Set up event listeners once on mount
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) recordViolation('Tab switch');
    }

    function handleBlur() {
      recordViolation('Window lost focus');
    }

    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        recordViolation('Left fullscreen');
      }
      if (lastDataRef.current) render(lastDataRef.current);
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
      if (dataRef.current && dataRef.current.status === 'live') {
        e.preventDefault();
        e.returnValue = '';
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);

    const blocked = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart'];
    blocked.forEach((ev) => document.addEventListener(ev, blockEvent));
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
      blocked.forEach((ev) => document.removeEventListener(ev, blockEvent));
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Polling loop (separate from data re-renders)
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

  // Client-side smooth countdown timer
  useEffect(() => {
    if (!deadline || !data || data.status !== 'live') return;
    const timerId = setInterval(() => {
      const left = Math.round((deadline - Date.now()) / 1000);
      const el = document.getElementById('timer');
      if (el) el.textContent = fmt(Math.max(0, left));
    }, 500);
    return () => clearInterval(timerId);
  }, [deadline, data?.status]);

  const defaultExamCode = localStorage.getItem('exam_student_code') || '';

  return (
    <div style={style.examRoot}>
      <header style={style.bar}>
        <div>
          <b id="examTitle">Exam</b> &middot; Student
        </div>
        <div>
          <span id="viol" style={{ marginRight: 16 }}></span>
          <span id="timer" className="timer" style={style.timer}></span>
        </div>
      </header>

      {backendDown && (
        <div style={style.alertErr}>
          <b>Backend not reachable:</b> The exam server on port 5000 is not running. Please start the backend and refresh this page.
        </div>
      )}

      {loading && <Loading message="Connecting to exam server…" />}

      <div id="warn" className="alert" style={{ ...style.alert, display: 'none' }}></div>

      <main id="main" style={style.main}>
        <p className="muted" style={style.muted}>
          Connecting to the exam server… If this message remains, check the database configuration and browser network errors.
        </p>
      </main>

      <div id="fsOverlay" className="overlay" style={{ ...style.overlay, display: 'flex' }}>
        <div style={style.overlayCard}>
          <h2>Start your exam</h2>
          <p>
            The exam is live. Click below to go fullscreen. One question from the faculty question list for this exam is
            assigned to you and shown. Switching tabs or leaving fullscreen is recorded as a violation.
          </p>
          <input
            id="examCodeInput"
            type="text"
            placeholder="Exam code"
            defaultValue={defaultExamCode}
            style={style.input}
            maxLength="10"
          />
          <br />
          <button className="btn" id="fsBtn" onClick={enterFullscreen} style={style.btn}>
            Enter fullscreen & show my question
          </button>
        </div>
      </div>

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
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(20,25,40,.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 99, textAlign: 'center', color: '#fff', fontFamily: 'system-ui, sans-serif',
  },
  overlayCard: { maxWidth: 420, background: 'rgba(255,255,255,.06)', padding: 24, borderRadius: 10 },
  input: {
    width: '100%', padding: 9, border: 'none', borderRadius: 6, margin: '10px 0', fontSize: 14,
    boxSizing: 'border-box',
  },
  btn: {
    background: '#2b5cff', color: '#fff', border: 'none', padding: '9px 16px',
    borderRadius: 6, cursor: 'pointer', fontSize: 14, marginTop: 10,
  },
  alert: {
    background: '#fde8e8', color: '#9b1c1c', padding: '10px 14px',
    borderRadius: 6, margin: '10px 20px', maxWidth: 900, marginLeft: 'auto', marginRight: 'auto',
  },
  alertErr: {
    background: '#fde8e8', color: '#9b1c1c', padding: '10px 14px',
    borderRadius: 6, margin: '10px 20px', maxWidth: 900, marginLeft: 'auto', marginRight: 'auto',
  },
};
