import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { apiGet, apiPost, apiDelete } from '../lib/api.js';
import Loading from '../components/Loading.jsx';
import { Link } from 'react-router-dom';

export default function FacultyDashboard() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [selStudents, setSelStudents] = useState(0);
  const [form, setForm] = useState({ title: '', duration: 60, max_violations: 3 });
  const [showCreate, setShowCreate] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    fetchExams();
  }, []);

  async function fetchExams() {
    try {
      setLoading(true);
      const json = await apiGet('/faculty/exams');
      setExams(json.exams || []);
    } catch (err) {
      setError('Failed to load exams');
    } finally {
      setLoading(false);
    }
  }

  async function createExam(e) {
    e.preventDefault();
    try {
      const json = await apiPost('/faculty/exams', {
        title: form.title,
        duration: form.duration,
        max_violations: form.max_violations,
      });
      if (json.ok) {
        setFlash({ type: 'ok', msg: json.message });
        setShowCreate(false);
        setForm({ title: '', duration: 60, max_violations: 3 });
        fetchExams();
      } else {
        setFlash({ type: 'err', msg: json.error });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Create failed' });
    }
  }

  async function startExam(id) {
    try {
      const json = await apiPost(`/faculty/exams/${id}/start`);
      if (json.ok) {
        fetchExams();
      } else {
        alert(json.error || 'Failed to start exam');
      }
    } catch (err) {
      alert(err.message || 'Start failed');
    }
  }

  async function endExam(id) {
    if (!confirm('End the exam for everyone?')) return;
    try {
      await apiPost(`/faculty/exams/${id}/end`);
      fetchExams();
    } catch (err) {
      alert(err.message || 'End failed');
    }
  }

  async function deleteExam(id) {
    if (!confirm('Delete this exam and all its records?')) return;
    try {
      await apiDelete(`/faculty/exams/${id}`);
      fetchExams();
    } catch (err) {
      alert(err.message || 'Delete failed');
    }
  }

  async function loadExamDetail(id) {
    try {
      const json = await apiGet(`/faculty/exams/${id}`);
      setSelected(json.exam);
      setQuestions(json.exam.questions || []);
      setSelStudents(json.exam.sc || 0);
    } catch (err) {
      setError('Failed to load exam detail');
    }
  }

  const totalExams = exams.length;
  const liveExams = exams.filter((e) => e.status === 'live').length;

  return (
    <div style={style.page}>
      {loading && <Loading />}
      {!loading && (
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
            <a href="/faculty/students" style={style.link}>
              Add students
            </a>
          </b>
        </div>
      </div>

      <details
        open={!totalExams}
        style={style.card}
        onToggle={(e) => setShowCreate(e.target.open)}
      >
        <summary>+ Create new exam</summary>
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
            <th>Exam</th>
            <th>Code</th>
            <th>Status</th>
            <th>Questions</th>
            <th>Students</th>
            <th>Duration</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {exams.map((e) => (
            <tr key={e.id} style={selected?.id === e.id ? style.selRow : {}}>
              <td>
                <Link to={`/faculty/questions/${e.id}`} onClick={() => loadExamDetail(e.id)}>
                  <b>{e.title}</b>
                </Link>
              </td>
              <td><b>{e.code}</b></td>
              <td>
                <span style={style.badge(statusColor(e.status))}>{e.status}</span>
              </td>
              <td>{e.qc}</td>
              <td>{e.sc}</td>
              <td>{e.duration_min} min</td>
              <td style={style.tdActions}>
                <Link to={`/faculty/questions/${e.id}`} onClick={() => loadExamDetail(e.id)}>
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
          ))}
          {exams.length === 0 && (
            <tr>
              <td colSpan={7} style={style.mutedTd}>
                No exams yet. Create your first exam above.
              </td>
            </tr>
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
