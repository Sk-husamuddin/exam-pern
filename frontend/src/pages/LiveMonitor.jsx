import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_BASE } from '../lib/supabase.js';

export default function LiveMonitor() {
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const POLL_MS = 3000;

  async function authHeaders() {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function poll() {
    try {
      const res = await fetch(`${API_BASE}/faculty/state?exam_id=${examId}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error('Session expired');
        throw new Error('Poll failed');
      }
      const json = await res.json();
      setExam(json.exam);
      setStudents(json.students || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [examId]);

  async function act(action, sid) {
    if (action === 'end' && !confirm('End the exam for everyone?')) return;

    const res = await fetch(`${API_BASE}/faculty/action`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam_id: examId, action, sid }),
    });
    const json = await res.json();
    if (json.error) alert(json.error);
    poll();
  }

  const fmt = (sec) => {
    if (sec == null) return '-';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!exam) return <p>Loading exam…</p>;

  return (
    <div style={style.page}>
      <nav style={style.nav}>
        <Link to="/faculty/dashboard" style={style.link}>&larr; Back to dashboard</Link>
        <span style={style.spacer}></span>
        <span>Live Monitor — {exam.title}</span>
      </nav>

      <div style={style.card}>
        <h2 style={{ margin: 0 }}>{exam.title}</h2>
        <div style={style.meta}>
          <span>Exam code: <b>{exam.code}</b></span>
          <span>Status: <span id="status" style={style.badge(exam.status)}>{exam.status}</span></span>
          <span>Time left: <b id="timeLeft">{fmt(exam.seconds_left)}</b></span>
          <span>Questions: <b>{exam.total_q}</b></span>
          <span style={style.floatRight}>
            {exam.status === 'draft' && (
              <button onClick={() => act('start')} style={style.btnSmGreen}>Start exam</button>
            )}
            {exam.status === 'live' && (
              <button onClick={() => act('end')} style={style.btnSmRed}>End exam</button>
            )}
            <Link to={`/faculty/questions/${examId}`}>
              <button style={style.btnSm}>Questions</button>
            </Link>
          </span>
        </div>
      </div>

      {error && <div style={style.alertErr}>{error}</div>}

      <table style={style.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Student</th>
            <th>Online</th>
            <th>Login time</th>
            <th>Question</th>
            <th>Violations</th>
            <th>Last reason</th>
            <th>State</th>
            <th></th>
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
              <tr key={s.sid}>
                <td>{s.login_order}</td>
                <td>
                  <div>{s.name}</div>
                  <small style={style.muted}>{s.username}</small>
                </td>
                <td>
                  <span
                    style={{ ...style.dot, ...(s.online ? style.dotOn : {}) }}
                  ></span>
                  {s.online ? 'online' : 'offline'}
                </td>
                <td>{s.login_time}</td>
                <td>{s.position ? `Q${s.position}` : <span style={style.muted}>not entered</span>}</td>
                <td>{s.violations}/{exam.max}</td>
                <td style={style.muted}>{s.last_reason || '-'}</td>
                <td>{s.locked ? <span style={style.badgeEnded}>locked</span> : 'ok'}</td>
                <td>
                  {s.locked ? (
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

import { supabase } from '../lib/supabase.js';

const style = {
  page: { fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 16 },
  nav: {
    background: '#1d2433', color: '#fff', padding: '12px 24px', display: 'flex',
    gap: 18, alignItems: 'center', marginBottom: 24,
  },
  link: { color: '#2b5cff', textDecoration: 'none' },
  spacer: { flex: 1 },
  card: {
    background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,.08)', marginBottom: 16,
  },
  meta: {
    display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8,
  },
  floatRight: { marginLeft: 'auto' },
  badge: (s) => ({
    padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#fff',
    background: s === 'live' ? '#1a8f4a' : s === 'ended' ? '#d33' : '#b7791f',
  }),
  badgeEnded: { padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#fff', background: '#d33' },
  muted: { color: '#6b7280', fontSize: 12 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' },
  th: { background: '#eef1f7', padding: '9px 12px', textAlign: 'left', fontSize: 13 },
  td: { padding: '9px 12px', borderBottom: '1px solid #e6e9f0', fontSize: 13 },
  mutedTd: { color: '#6b7280', padding: 20 },
  dot: { display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: '#bbb', marginRight: 6 },
  dotOn: { background: '#1a8f4a' },
  btnSm: { background: '#2b5cff', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginRight: 6 },
  btnSmGreen: { background: '#1a8f4a', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginRight: 6 },
  btnSmRed: { background: '#d33', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  alertErr: { background: '#fde8e8', color: '#9b1c1c', padding: 10, borderRadius: 6, marginBottom: 12 },
};
