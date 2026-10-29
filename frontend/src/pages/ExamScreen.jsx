import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../lib/supabase.js';

export default function ExamScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [armed, setArmed] = useState(false);
  const [lastV, setLastV] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [polling, setPolling] = useState(false);
  const [entered, setEntered] = useState(false);

  const lastDataRef = useRef(null);
  const csrfRef = useRef('');

  const POLL_MS = 3000;

  async function authHeaders() {
    const token = localStorage.getItem('exam_student_token');
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
    if (!res.ok || d.error) throw new Error(d.error || `Request failed (${res.status})`);
    return d;
  }

  function fmt(sec) {
    sec = Math.max(0, Number(sec) || 0);
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0').padStart(2, '0');
  }

  function showMessage(title, text, href, linkText) {
    const main = document.getElementById('main');
    if (!main) return;
    main.innerHTML = '';
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
      main.append(a);
    }
  }

  function render(d) {
    if (!d || typeof d !== 'object') throw new Error('Invalid server response');
    lastDataRef.current = d;
    setData(d);

    if (d.status === 'kicked') {
      showMessage('Session expired', 'This student session is no longer active. Please sign in again.', '/student/login', 'Login');
      setArmed(false);
      return;
    }
    if (d.status === 'ended') {
      showMessage('Exam ended', 'Thank you. Your exam has ended.', '/student/dashboard', 'Back to dashboard');
      setArmed(false);
      return;
    }
    if (d.locked) {
      showMessage('Exam locked', 'Your exam was locked because of too many violations. Please contact the faculty.');
      setArmed(false);
      return;
    }

    const ready = !!d.entered && !!document.fullscreenElement;
    document.getElementById('fsOverlay').style.display = ready ? 'none' : 'flex';

    if (!ready) {
      document.getElementById('main').innerHTML =
        '<p class="muted">Exam is ready. Click “Enter fullscreen & show my question” to continue.</p>';
      document.getElementById('main').dataset.shown = '';
      return;
    }

    if (!d.question) {
      showMessage('Question not available', 'No question has been assigned to this exam session. Please contact the faculty.');
      return;
    }

    const key = String(d.position || '') + '|' + String(d.question);
    const main = document.getElementById('main');
    if (main.dataset.shown !== key) {
      main.innerHTML = '';
      const h = document.createElement('h2');
      h.textContent = `Question ${d.position || ''}`;
      const q = document.createElement('div');
      q.className = 'question';
      q.textContent = d.question;
      main.append(h, q);
      main.dataset.shown = key;
    }
  }

  async function poll() {
    if (polling) return;
    setPolling(true);
    try {
      const d = await getJson(`${API_BASE}/student/state`, { cache: 'no-store', headers: await authHeaders() });
      render(d);
    } catch (e) {
      const warn = document.getElementById('warn');
      if (warn) {
        warn.textContent = 'Connection problem: ' + (e.message || 'Unable to contact the server.') + ' Retrying automatically…';
        warn.style.display = 'block';
      }
    } finally {
      setPolling(false);
      setTimeout(poll, POLL_MS);
    }
  }

  async function violation(reason) {
    if (!armed) return;
    const now = Date.now();
    if (now - lastV < 1500) return;
    setLastV(now);
    const fd = new FormData();
    fd.append('reason', reason);
    const warn = document.getElementById('warn');
    if (warn) {
      warn.textContent = 'Warning: ' + reason + ' has been recorded.';
      warn.style.display = 'block';
    }
    getJson(`${API_BASE}/student/violation`, {
      method: 'POST',
      body: fd,
      headers: await authHeaders(),
    }).then(render).catch(() => {});
  }

  async function enterFullscreen() {
    const btn = document.getElementById('fsBtn');
    btn.disabled = true;
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      const fd = new FormData();
      fd.append('exam_code', document.getElementById('examCodeInput').value || '');
      const d = await getJson(`${API_BASE}/student/enter`, {
        method: 'POST',
        body: fd,
        headers: await authHeaders(),
      });
      if (d.notice) {
        const warn = document.getElementById('warn');
        if (warn) {
          warn.textContent = d.notice;
          warn.style.display = 'block';
        }
      }
      render(d);
      setArmed(true);
      setEntered(!!d.entered);
    } catch (e) {
      const warn = document.getElementById('warn');
      if (warn) {
        warn.textContent = 'Unable to enter exam: ' + (e.message || 'Please try again.');
        warn.style.display = 'block';
      }
    } finally {
      btn.disabled = false;
    }
  }

  useEffect(() => {
    // Read CSRF token from meta if present (kept for parity with original)
    const meta = document.querySelector('meta[name="csrf"]');
    if (meta) csrfRef.current = meta.content;

    // Violation detection
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) violation('Tab switch');
    });
    window.addEventListener('blur', () => violation('Window lost focus'));

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        violation('Left fullscreen');
        if (lastDataRef.current) render(lastDataRef.current);
      } else if (lastDataRef.current) {
        render(lastDataRef.current);
      }
    });

    // Block keys
    document.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      const bad =
        e.key === 'F12' ||
        e.key === 'PrintScreen' ||
        (e.ctrlKey && ['c', 'v', 'x', 'a', 'u', 's', 'p'].includes(k)) ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) ||
        (e.metaKey && ['c', 'v', 'x', 'a', 'u', 's', 'p'].includes(k)) || // macOS fix
        (e.metaKey && e.shiftKey && ['i', 'j', 'c'].includes(k));        // macOS fix
      if (bad) {
        e.preventDefault();
        violation('Blocked key: ' + e.key);
      }
    });

    // Block context menu / copy / paste / select / drag
    ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart'].forEach((ev) => {
      document.addEventListener(ev, (e) => e.preventDefault());
    });

    // Beforeunload warning
    window.addEventListener('beforeunload', (e) => {
      if (data && data.status === 'live') {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    poll();

    // Client-side timer
    const timerId = setInterval(() => {
      if (data && data.status === 'live' && deadline) {
        const el = document.getElementById('timer');
        if (el) el.textContent = fmt(Math.round((deadline - Date.now()) / 1000));
      }
    }, 500);

    return () => {
      clearInterval(timerId);
      document.removeEventListener('visibilitychange', () => {});
      window.removeEventListener('blur', () => {});
      document.removeEventListener('fullscreenchange', () => {});
      document.removeEventListener('keydown', () => {});
      ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart'].forEach((ev) => {
        document.removeEventListener(ev, () => {});
      });
      window.removeEventListener('beforeunload', () => {});
    };
  }, [data]);

  return (
    <div style={style.examRoot}>
      <header style={style.bar}>
        <div>
          <b id="examTitle">Exam</b> &middot; Student
        </div>
        <div>
          <span id="viol"></span> <span id="timer" className="timer" style={style.timer}></span>
        </div>
      </header>
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
            style={style.input}
            maxLength="10"
          />
          <br />
          <button className="btn" id="fsBtn" onClick={enterFullscreen} style={style.btn}>
            Enter fullscreen & show my question
          </button>
        </div>
      </div>
      <style jsx>{`
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
  timer: { fontSize: 20, fontWeight: 'bold', marginLeft: 14 },
  main: { maxWidth: 900, margin: '30px auto', padding: '0 20px' },
  muted: { color: '#6b7280' },
  question: {
    whiteSpace: 'pre-wrap', fontSize: 19, lineHeight: 1.65,
    background: '#fff', padding: 24, borderRadius: 10,
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(20,25,40,.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 99, textAlign: 'center', color: '#fff', fontFamily: 'system-ui, sans-serif',
  },
  overlayCard: { maxWidth: 420, background: 'rgba(255,255,255,.06)', padding: 24, borderRadius: 10 },
  input: {
    width: '100%', padding: 9, border: 'none', borderRadius: 6, margin: '10px 0', fontSize: 14,
  },
  btn: {
    background: '#2b5cff', color: '#fff', border: 'none', padding: '9px 16px',
    borderRadius: 6, cursor: 'pointer', fontSize: 14, marginTop: 10,
  },
  alert: {
    background: '#fde8e8', color: '#9b1c1c', padding: '10px 14px',
    borderRadius: 6, margin: '10px 0',
  },
};
