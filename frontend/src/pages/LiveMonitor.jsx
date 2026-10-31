import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { apiGet, apiPost } from '../lib/api.js';
import Loading from '../components/Loading.jsx';

export default function LiveMonitor() {
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const POLL_MS = 3000;

  const failedPollsRef = useRef(0);
  const examRef = useRef(null);
  useEffect(() => {
    examRef.current = exam;
  }, [exam]);

  async function poll() {
    try {
      const json = await apiGet(`/faculty/state?exam_id=${examId}`);
      setExam((prev) => ({ ...(prev || {}), ...(json && json.exam ? json.exam : {}) }));
      setStudents(Array.isArray(json && json.students) ? json.students : []);
      setError(null);
      failedPollsRef.current = 0;
    } catch (err) {
      failedPollsRef.current += 1;
      // Only show error if initial load failed or 3 consecutive polls failed
      if (failedPollsRef.current >= 3 || !examRef.current) {
        setError(err.message || 'Connecting to server…');
      }
    } finally {
      setLoading(false);
    }
  }

  async function retry() {
    await poll();
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const detail = await apiGet(`/faculty/exams/${examId}`);
        if (mounted && detail && detail.exam) {
          setExam((prev) => ({ ...detail.exam, ...(prev || {}) }));
        }
      } catch (err) {
        if (mounted && !examRef.current) setError(err.message || 'Failed to load exam details');
      }
    })();

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [examId]);

  useEffect(() => {
    if (!exam || exam.status !== 'live' || exam.seconds_left == null || exam.seconds_left <= 0) return;
    const tick = setInterval(() => {
      setExam((prev) => {
        if (!prev || prev.seconds_left == null || prev.seconds_left <= 0) return prev;
        return { ...prev, seconds_left: Math.max(0, prev.seconds_left - 1) };
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [exam?.status]);

  async function act(action, sid) {
    if (action === 'end' && !confirm('End the exam for everyone?')) return;

    try {
      const json = await apiPost('/faculty/action', { exam_id: examId, action, sid });
      if (json && json.error) alert(json.error);
      await poll();
    } catch (err) {
      alert(err.message || 'Action failed');
    }
  }

  function downloadCsv() {
    if (!students || students.length === 0) {
      alert('No students have logged in to this exam yet.');
      return;
    }

    const headers = [
      'Roll Number',
      'Student Name',
      'Question No',
      'Assigned Question',
      'Violations',
      'Status',
      'Login Time',
    ];

    const escapeCsv = (val) => {
      const str = String(val == null ? '' : val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = students.map((s) => [
      s && s.username,
      s && s.name,
      s && (s.position_str || (s.position ? `Q${s.position}` : 'Not Entered')),
      s && s.question_text ? s.question_text : (s && s.position ? `Question ${s.position}` : 'Not Entered'),
      s && s.violations != null ? s.violations : 0,
      s && s.locked ? 'Locked' : s && s.online ? 'Online' : 'Offline',
      s && s.login_time ? s.login_time : '',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join(
        '\r\n'
      );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeTitle = (exam && exam.title ? exam.title : 'exam').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `${safeTitle}_assigned_questions.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const fmt = (sec) => {
    if (sec == null) return '-';
    sec = Math.max(0, Number(sec) || 0);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const statusBadge = (s) => ({
    padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#fff',
    background: s === 'live' ? '#1a8f4a' : s === 'ended' ? '#d33' : '#b7791f',
  });

  if (loading && !exam) return <Loading />;

  if (!exam) {
    return (
      <div style={style.page}>
        <nav style={style.nav}>
          <Link to="/faculty/dashboard" style={style.link}>&larr; Back to dashboard</Link>
        </nav>
        <div style={style.alertErr}>{error || 'Exam not found'}</div>
      </div>
    );
  }

  return (
    <div style={style.page}>
      <nav style={style.nav}>
        <Link to="/faculty/dashboard" style={style.link}>&larr; Back to dashboard</Link>
        <span style={style.spacer}></span>
        <span>Live Monitor — {exam.title || ''}</span>
      </nav>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            ...style.alertErr,
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

      <div style={style.card}>
        <h2 style={{ margin: 0 }}>{exam.title || ''}</h2>
        <div style={style.meta}>
          <span>Exam code: <b>{exam.code || ''}</b></span>
          <span>Status: <span id="status" style={style.badge(exam.status)}>{exam.status || ''}</span></span>
          <span>Time left: <b id="timeLeft">{fmt(exam.seconds_left)}</b></span>
          <span>Questions: <b>{exam.total_q != null ? exam.total_q : 0}</b></span>
          <span style={style.floatRight}>
            {exam.status === 'draft' && (
              <button onClick={() => act('start')} style={style.btnSmGreen}>Start exam</button>
            )}
            {exam.status === 'live' && (
              <button onClick={() => act('end')} style={style.btnSmRed}>End exam</button>
            )}
            {exam.status !== 'draft' && (
              <button
                onClick={downloadCsv}
                style={style.btnSmExport}
                title="Download CSV of student roll numbers and assigned questions"
              >
                📥 Download CSV
              </button>
            )}
            <Link to={`/faculty/questions/${examId}`}>
              <button style={style.btnSm}>Questions</button>
            </Link>
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          Students ({students.length})
        </h3>
        {exam.status !== 'draft' && students.length > 0 && (
          <button
            onClick={downloadCsv}
            style={style.btnSmExport}
            title="Download CSV of student roll numbers and assigned questions"
          >
            📥 Download CSV
          </button>
        )}
      </div>

      <table style={style.table}>
        <thead>
          <tr>
            <th style={style.th}>#</th>
            <th style={style.th}>Student</th>
            <th style={style.th}>Online</th>
            <th style={style.th}>Login time</th>
            <th style={style.th}>Question</th>
            <th style={style.th}>Violations</th>
            <th style={style.th}>Last reason</th>
            <th style={style.th}>State</th>
            <th style={style.th}></th>
          </tr>
        </thead>
        <tbody id="rows">
          {students.length === 0 ? (
            <tr>
              <td colSpan={9} style={style.mutedTd}>
                No students have logged in yet.
              </td>
            </tr>
          ) : (
            students.map((s) => (
              <tr key={s && s.sid ? s.sid : Math.random()}>
                <td style={style.td}>{s && s.login_order}</td>
                <td style={style.td}>
                  <div>{s && s.name}</div>
                  <small style={style.muted}>{s && s.username}</small>
                </td>
                <td style={style.td}>
                  <span
                    style={{ ...style.dot, ...(s && s.online ? style.dotOn : {}) }}
                  ></span>
                  {s && s.online ? 'online' : 'offline'}
                </td>
                <td style={style.td}>{s && s.login_time}</td>
                <td style={style.td}>{s && (s.position_str || (s.position ? `Q${s.position}` : <span style={style.muted}>not entered</span>))}</td>
                <td style={style.td}>{s != null ? s.violations : 0}/{exam && exam.max != null ? exam.max : 3}</td>
                <td style={{ ...style.td, ...style.muted }}>{s && s.last_reason || '-'}</td>
                <td style={style.td}>{s && s.locked ? <span style={style.badgeEnded}>locked</span> : 'ok'}</td>
                <td style={style.td}>
                  {s && s.locked ? (
                    <button onClick={() => act('unlock', s.sid)} style={style.btnSm}>Unlock</button>
                  ) : (
                    <button onClick={() => act('lock', s.sid)} style={style.btnSmRed}>Lock</button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const style = {
  page: { fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: '24px 16px', color: '#FFFFFF', backgroundColor: '#0A0A0A', minHeight: '100vh' },
  nav: {
    background: '#121212', color: '#FFFFFF', padding: '14px 24px', display: 'flex',
    gap: 18, alignItems: 'center', marginBottom: 24, border: '1px solid #27272A', borderRadius: 0,
  },
  link: { color: '#FF1818', textDecoration: 'none', fontWeight: 700 },
  spacer: { flex: 1 },
  card: {
    background: '#121212', borderRadius: 0, padding: 20, border: '1px solid #27272A', color: '#FFFFFF', marginBottom: 16,
  },
  meta: {
    display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8,
  },
  floatRight: { marginLeft: 'auto' },
  badge: (s) => ({
    padding: '3px 8px', borderRadius: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    color: s === 'draft' ? '#000000' : '#FFFFFF',
    background: s === 'live' ? '#FF1818' : s === 'ended' ? '#27272A' : '#FDB813',
  }),
  badgeEnded: { padding: '3px 8px', borderRadius: 0, fontSize: 11, fontWeight: 700, color: '#A1A1AA', background: '#27272A' },
  muted: { color: '#A1A1AA', fontSize: 12 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#121212', borderRadius: 0, overflow: 'hidden' },
  th: { background: '#18181B', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #27272A' },
  td: { padding: '12px 14px', borderBottom: '1px solid #27272A', fontSize: 13, color: '#FFFFFF' },
  mutedTd: { color: '#A1A1AA', padding: 20 },
  dot: { display: 'inline-block', width: 8, height: 8, borderRadius: 0, background: '#71717A', marginRight: 6 },
  dotOn: { background: '#FF1818' },
  btnSm: { background: '#FFFFFF', color: '#000000', border: '1px solid #FFFFFF', padding: '6px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, marginRight: 6 },
  btnSmGreen: { background: '#FFFFFF', color: '#000000', border: '1px solid #FFFFFF', padding: '6px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, marginRight: 6 },
  btnSmRed: { background: '#FF1818', color: '#FFFFFF', border: '1px solid #FF1818', padding: '6px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  btnSmExport: { background: 'transparent', color: '#FFFFFF', border: '1px solid #FFFFFF', padding: '6px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, marginRight: 6 },
  alertErr: { background: '#141414', border: '1px solid #27272A', borderLeft: '3px solid #FF1818', color: '#FFFFFF', padding: 12, borderRadius: 0, marginBottom: 12 },
};
