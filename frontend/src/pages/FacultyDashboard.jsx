import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { apiGet, apiPost, apiDelete } from '../lib/api.js';
import Loading from '../components/Loading.jsx';
import { Link } from 'react-router-dom';

export default function FacultyDashboard() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [selStudents, setSelStudents] = useState(0);
  const [form, setForm] = useState({ title: '', duration: 60, max_violations: 3 });
  const [showCreate, setShowCreate] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    fetchExams();
  }, []);

  // ------------------------------------------------------------------
  // Defensive adapter: map backend exam rows to the shape the UI uses.
  // Never throws on missing/unexpected fields.
  // ------------------------------------------------------------------
  const adaptExam = (e) => {
    if (!e || typeof e !== 'object') return null;
    return {
      id: e.id,
      code: e.code,
      title: e.title,
      status: e.status,
      qc: Number(e.qc) || 0,
      sc: Number(e.sc) || 0,
      duration_min: Number(e.duration_min) || 60,
      max_violations: Number(e.max_violations) || 3,
      started_at: e.started_at,
    };
  };

  async function fetchExams() {
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet('/faculty/exams');
      const rows = Array.isArray(json?.exams) ? json.exams : [];
      setExams(rows.map(adaptExam).filter(Boolean));
    } catch (err) {
      setError(err.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }

  async function retry() {
    await fetchExams();
  }

  async function createExam(e) {
    e.preventDefault();
    try {
      const json = await apiPost('/faculty/exams', {
        title: form.title,
        duration: form.duration,
        max_violations: form.max_violations,
      });
      if (json && json.ok) {
        setFlash({ type: 'ok', msg: json.message });
        setShowCreate(false);
        setForm({ title: '', duration: 60, max_violations: 3 });
        await fetchExams();
      } else {
        setFlash({ type: 'err', msg: json && json.error ? json.error : 'Create failed' });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Create failed' });
    }
  }

  async function startExam(id) {
    try {
      const json = await apiPost(`/faculty/exams/${id}/start`);
      if (json && json.ok) {
        await fetchExams();
      } else {
        alert(json && json.error ? json.error : 'Failed to start exam');
      }
    } catch (err) {
      alert(err.message || 'Start failed');
    }
  }

  async function endExam(id) {
    if (!confirm('End the exam for everyone?')) return;
    try {
      await apiPost(`/faculty/exams/${id}/end`);
      await fetchExams();
    } catch (err) {
      alert(err.message || 'End failed');
    }
  }

  async function deleteExam(id) {
    if (!confirm('Delete this exam and all its records?')) return;
    try {
      await apiDelete(`/faculty/exams/${id}`);
      await fetchExams();
    } catch (err) {
      alert(err.message || 'Delete failed');
    }
  }

  async function loadExamDetail(id) {
    setError(null);
    try {
      const json = await apiGet(`/faculty/exams/${id}`);
      const exam = adaptExam(json && json.exam ? json.exam : null);
      setSelected(exam);
      setQuestions(Array.isArray(json && json.exam && json.exam.questions) ? json.exam.questions : []);
      setSelStudents(json && json.exam ? Number(json.exam.sc || 0) : 0);
    } catch (err) {
      setError(err.message || 'Failed to load exam detail');
    }
  }

  const totalExams = Array.isArray(exams) ? exams.length : 0;
  const liveExams = Array.isArray(exams)
    ? exams.filter((e) => e && e.status === 'live').length
    : 0;

  const statusColor = (s) =>
    s === 'live' ? 'live' : s === 'ended' ? 'ended' : 'draft';

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
              ...style.flash,
              ...style.flashErr,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <div style={{ display: 'flex', gap: 8 }}>
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
          </div>
        )}
        <nav style={style.nav}>
          <b>Exam Portal</b>
          <span style={style.spacer}></span>
          <span>Faculty</span>
          <button onClick={() => supabase.auth.signOut()} style={style.btnDanger}>Logout</button>
        </nav>

        {flash && (
          <div style={{ ...style.flash, ...(flash.type === 'ok' ? style.flashOk : style.flashErr) }}>
            {flash.msg}
          </div>
        )}

        <div style={style.stats}>
          <div style={style.stat}>
            <small>My exams</small>
            <b>{totalExams}</b>
          </div>
          <div style={style.stat}>
            <small>Live now</small>
            <b>{liveExams}</b>
          </div>
          <div style={style.stat}>
            <small>Next step</small>
            <b>
              <Link to="/faculty/students" style={style.link}>
                Add students
              </Link>
            </b>
          </div>
        </div>

        <details
          open={showCreate || !totalExams}
          style={style.card}
          onToggle={(e) => setShowCreate(e.target.open)}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>+ Create new exam</summary>
          <form onSubmit={createExam} style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              style={style.input}
              name="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Exam title"
              required
            />
            <input
              style={{ ...style.input, width: 120 }}
              type="number"
              name="duration"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
              min="1"
              max="600"
              placeholder="60"
            />
            <input
              style={{ ...style.input, width: 120 }}
              type="number"
              name="max_violations"
              value={form.max_violations}
              onChange={(e) => setForm({ ...form, max_violations: e.target.value })}
              min="1"
              max="20"
              placeholder="3"
            />
            <button type="submit" style={style.btnPrimary}>Create exam</button>
          </form>
        </details>

        <h3 style={style.h3}>My exams</h3>
        <table style={style.table}>
          <thead>
            <tr>
              <th style={style.th}>Exam</th>
              <th style={style.th}>Code</th>
              <th style={style.th}>Status</th>
              <th style={style.th}>Questions</th>
              <th style={style.th}>Students</th>
              <th style={style.th}>Duration</th>
              <th style={style.th}></th>
            </tr>
          </thead>
          <tbody>
            {totalExams === 0 ? (
              <tr>
                <td colSpan={7} style={style.mutedTd}>
                  No exams yet. Create your first exam above.
                </td>
              </tr>
            ) : (
              exams.map((e) => (
                <tr key={e.id} style={selected?.id === e.id ? style.selRow : {}}>
                  <td style={style.td}>
                    <button
                      type="button"
                      onClick={() => loadExamDetail(e.id)}
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: '#1d2433', fontSize: 14 }}
                      title="Click to view details below"
                    >
                      <b>{e.title}</b>
                    </button>
                  </td>
                  <td style={style.td}><b>{e.code}</b></td>
                  <td style={style.td}>
                    <span style={style.badge(statusColor(e.status))}>{e.status}</span>
                  </td>
                  <td style={style.td}>{e.qc}</td>
                  <td style={style.td}>{e.sc}</td>
                  <td style={style.td}>{e.duration_min} min</td>
                  <td style={{ ...style.td, ...style.tdActions }}>
                    <Link to={`/faculty/questions/${e.id}`}>
                      <button style={style.btnSm}>{e.status === 'draft' ? 'Manage questions' : 'View'}</button>
                    </Link>{' '}
                    <Link to={`/faculty/monitor/${e.id}`}>
                      <button style={style.btnSmGreen}>Monitor</button>
                    </Link>
                    {e.status !== 'live' && (
                      <button onClick={() => deleteExam(e.id)} style={style.btnSmRed}>
                        Delete
                      </button>
                    )}
                    {e.status === 'draft' && (
                      <button
                        onClick={() => startExam(e.id)}
                        disabled={e.qc === 0}
                        style={{ ...style.btnSmGreen, ...(e.qc === 0 ? style.disabled : {}) }}
                        title={e.qc === 0 ? 'Add at least one question first' : ''}
                      >
                        Start exam
                      </button>
                    )}
                    {e.status === 'live' && (
                      <button onClick={() => endExam(e.id)} style={style.btnSmRed}>
                        End exam
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {selected && (
          <div style={style.card}>
            <div style={style.qhead}>
              <h2 style={{ margin: 0 }}>
                {selected.title}
                <span style={style.badge(statusColor(selected.status))}>{selected.status}</span>
              </h2>
              <div>
                Exam code: <span style={style.code}>{selected.code}</span>
              </div>
            </div>
            <p style={style.muted}>
              {questions.length} question(s) &middot; {selected.duration_min} min &middot;
              lock after {selected.max_violations} violations &middot; {selStudents} student(s) logged in
            </p>
            <div style={style.actions}>
              {selected.status === 'draft' && (
                <>
                  <Link to={`/faculty/questions/${selected.id}`}>
                    <button style={style.btn}>Create / edit questions</button>
                  </Link>
                  <Link to={`/faculty/monitor/${selected.id}`}>
                    <button style={style.btnGray}>Open live monitor</button>
                  </Link>
                  <button onClick={() => deleteExam(selected.id)} style={style.btnRed}>
                    Delete exam
                  </button>
                </>
              )}
            </div>
            {selected.status !== 'draft' && (
              <div style={style.alertErr}>This exam is {selected.status}, so its settings and questions are locked.</div>
            )}
          </div>
        )}
        </>
      )}
    </div>
  );
}

function statusColor(s) {
  return s === 'live' ? 'live' : s === 'ended' ? 'ended' : 'draft';
}

const style = {
  page: { fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 16 },
  nav: {
    background: '#1d2433', color: '#fff', padding: '12px 24px', display: 'flex',
    gap: 18, alignItems: 'center', marginBottom: 24,
  },
  btnDanger: { background: '#d33', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' },
  spacer: { flex: 1 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '14px 0' },
  stat: { background: '#eef1f7', borderRadius: 8, padding: 12 },
  statSmall: { display: 'block', color: '#6b7280', marginBottom: 4, fontSize: 12 },
  h3: { marginTop: 0, fontSize: 16 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' },
  th: { background: '#eef1f7', padding: '9px 12px', textAlign: 'left', fontSize: 14 },
  td: { padding: '9px 12px', borderBottom: '1px solid #e6e9f0', fontSize: 14 },
  tdActions: { whiteSpace: 'nowrap' },
  mutedTd: { color: '#6b7280', padding: 20 },
  badge: (kind) => {
    const colors = { live: '#1a8f4a', ended: '#d33', draft: '#b7791f' };
    return { padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#fff', background: colors[kind] || '#6b7280' };
  },
  card: {
    background: '#fff', borderRadius: 10, padding: 22, boxShadow: '0 2px 10px rgba(0,0,0,.08)', marginBottom: 18,
  },
  qhead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 },
  code: {
    fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 18, letterSpacing: 2,
    background: '#eef1f7', padding: '2px 8px', borderRadius: 6,
  },
  muted: { color: '#6b7280', fontSize: 14 },
  actions: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 },
  btn: { background: '#2b5cff', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  btnGray: { background: '#6b7280', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  btnRed: { background: '#d33', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  btnPrimary: { background: '#2b5cff', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  btnSm: {
    background: '#2b5cff', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginRight: 6,
  },
  btnSmGreen: { background: '#1a8f4a', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginRight: 6 },
  btnSmRed: { background: '#d33', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  disabled: { opacity: 0.5, cursor: 'not-allowed' },
  flash: { padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 14 },
  flashOk: { background: '#e6f6ec', color: '#176b3a' },
  flashErr: { background: '#fde8e8', color: '#9b1c1c' },
  alertErr: { background: '#fde8e8', color: '#9b1c1c', padding: 10, borderRadius: 6, marginTop: 14 },
  link: { color: '#2b5cff', textDecoration: 'none' },
  selRow: { background: '#eaf0ff' },
};
