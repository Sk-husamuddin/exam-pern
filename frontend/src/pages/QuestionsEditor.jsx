import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { apiGet, apiPost, apiPut, apiDelete, apiFormPost } from '../lib/api.js';
import Loading from '../components/Loading.jsx';

export default function QuestionsEditor() {
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [draft, setDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);

  // Manual add
  const [manualBody, setManualBody] = useState('');

  // Word import
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('auto');
  const [preview, setPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    loadExam();
  }, [examId]);

  async function loadExam() {
    try {
      setLoading(true);
      const json = await apiGet(`/faculty/exams/${examId}`);
      setExam(json.exam);
      setQuestions(json.exam.questions || []);
      setDraft(json.exam.status === 'draft');
    } catch (err) {
      setError('Failed to load exam');
    } finally {
      setLoading(false);
    }
  }

  async function addQuestion(e) {
    e.preventDefault();
    if (!manualBody.trim()) return;
    try {
      const json = await apiPost('/faculty/questions', {
        exam_id: examId,
        body: manualBody.trim(),
      });
      if (json.ok) {
        setManualBody('');
        loadExam();
      } else {
        setFlash({ type: 'err', msg: json.error });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Add failed' });
    }
  }

  async function updateQuestion(qId, body) {
    try {
      const json = await apiPut(`/faculty/questions/${qId}`, { body });
      if (json.ok) loadExam();
      else alert(json.error);
    } catch (err) {
      alert(err.message || 'Update failed');
    }
  }

  async function deleteQuestion(qId) {
    if (!confirm('Delete this question?')) return;
    try {
      await apiDelete(`/faculty/questions/${qId}`);
      loadExam();
    } catch (err) {
      alert('Failed to delete');
    }
  }

  // ---------- Word import ----------
  async function handleFileSelect(e) {
    setFile(e.target.files[0]);
  }

  async function readDocx(e) {
    e.preventDefault();
    if (!file) return;
    setImportLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    try {
      const json = await apiFormPost('/faculty/questions/import-docx', formData);
      if (json.ok) {
        setPreview({ items: json.items || [], ignored: json.ignored || 0, mode: json.mode, file: file.name, note: json.note });
      } else {
        setFlash({ type: 'err', msg: json.error });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: 'Import failed' });
    } finally {
      setImportLoading(false);
    }
  }

  async function confirmImport(e) {
    e.preventDefault();
    if (!preview) return;
    const items = preview.items.map((t, i) => ({
      keep: true,
      body: t,
    }));
    try {
      const json = await apiPost('/faculty/questions/import-docx/confirm', {
        exam_id: examId,
        questions: items,
      });
      if (json.ok) {
        setPreview(null);
        setFlash({ type: 'ok', msg: json.message });
        loadExam();
      } else {
        setFlash({ type: 'err', msg: json.error });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Confirm failed' });
    }
  }

  const MODES = {
    auto: 'Detect automatically (recommended)',
    marker: 'Numbered text: Q1. / Question 2: / 1.',
    numbered: 'Word auto-numbered list',
    separator: 'A line with --- between questions',
    blank: 'Blank line between questions',
    para: 'Every paragraph is one question',
  };

  return (
    <div style={style.page}>
      {loading && <Loading />}
      {!loading && (
      <nav style={style.nav}>
        <Link to="/faculty/dashboard" style={style.link}>&larr; Back to dashboard</Link>
        <span style={style.spacer}></span>
        <span>Questions — {exam?.title}</span>
      </nav>

      {flash && (
        <div style={{ ...style.flash, ...(flash.type === 'ok' ? style.flashOk : style.flashErr) }}>{flash.msg}</div>
      )}

      {!exam ? (
        <p>Loading…</p>
      ) : (
        <>
          <div style={style.qhead}>
            <h2 style={{ margin: 0 }}>{exam.title}</h2>
            <div>Exam code: <span style={style.code}>{exam.code}</span></div>
          </div>
          <p style={style.muted}>{questions.length} question(s) so far</p>

          {!draft && (
            <div style={style.alert}>This exam is {exam.status}, so its questions are locked and shown read-only.</div>
          )}

          {draft && (
            <>
              <div style={style.row}>
                <div style={style.card}>
                  <h3 style={{ marginTop: 0 }}>1. Create manually</h3>
                  <form onSubmit={addQuestion} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={style.label}>Question {questions.length + 1}</label>
                    <textarea
                      style={style.textarea}
                      name="body"
                      value={manualBody}
                      onChange={(e) => setManualBody(e.target.value)}
                      placeholder="Write the question here..."
                      required
                    />
                    <button type="submit" style={style.btnPrimary}>Add question</button>
                  </form>
                </div>

                <div style={style.card}>
                  <h3 style={{ marginTop: 0 }}>2. Import from a Word document</h3>
                  <p style={style.muted}>Upload a .docx file. You will see a preview and can edit or remove questions before saving.</p>
                  <form onSubmit={readDocx} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={style.label}>Word file (.docx)</label>
                    <input type="file" name="file" accept=".docx" required onChange={handleFileSelect} />
                    <label style={style.label}>How are the questions separated?</label>
                    <select
                      style={style.input}
                      name="mode"
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      {Object.entries(MODES).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                    <button type="submit" style={style.btnPrimary} disabled={importLoading}>
                      {importLoading ? 'Reading…' : 'Read document'}
                    </button>
                  </form>
                  <p style={style.muted}>Only text is imported (images and equations are skipped).</p>
                </div>
              </div>

              {preview && (
                <div style={style.card}>
                  <h3 style={{ marginTop: 0 }}>Preview: {preview.items.length} question(s) found in “{preview.file}”</h3>
                  <p style={style.muted}>
                    Detected using: <b>{MODES[preview.mode]}</b>.
                    {preview.ignored && ` Text before the first question (${preview.ignored} paragraph(s)) was ignored.`}{' '}
                    {preview.note}
                  </p>
                  <form onSubmit={confirmImport} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {preview.items.map((t, i) => (
                      <div key={i} style={style.item}>
                        <label style={style.itemLabel}>
                          <input
                            type="checkbox"
                            name={`q[${i}][keep]`}
                            defaultChecked
                            style={{ width: 'auto', marginRight: 8 }}
                          />
                          Item {i + 1}
                        </label>
                        <textarea
                          style={style.textarea}
                          name={`q[${i}][body]`}
                          defaultValue={t}
                          maxLength="20000"
                        />
                      </div>
                    ))}
                    <button type="submit" style={style.btnPrimary}>Add selected questions</button>
                    <button
                      type="button"
                      onClick={() => setPreview(null)}
                      style={{ ...style.btn, background: '#6b7280', marginLeft: 8 }}
                    >
                      Cancel
                    </button>
                  </form>
                </div>
              )}

              <h3 id="list" style={style.h3}>Questions in this exam ({questions.length})</h3>
              {questions.map((q) => (
                <div key={q.id} style={style.cardItem}>
                  <div style={style.qheadItem}>
                    <b>Question {q.q_no}</b>
                  </div>
                  {draft ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const body = e.target.elements.body.value;
                        updateQuestion(q.id, body);
                      }}
                      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                    >
                      <textarea
                        style={style.textarea}
                        name="body"
                        defaultValue={q.body}
                        required
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" style={style.btnSm}>Save changes</button>
                        <button
                          type="button"
                          onClick={() => deleteQuestion(q.id)}
                          style={style.btnSmRed}
                        >
                          Delete
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div style={style.questionBody}>{q.body}</div>
                  )}
                </div>
              ))}
              {questions.length === 0 && <p style={style.muted}>No questions yet.</p>}
            </>
          )}
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
  link: { color: '#2b5cff', textDecoration: 'none' },
  spacer: { flex: 1 },
  qhead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 },
  code: {
    fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 18, letterSpacing: 2,
    background: '#eef1f7', padding: '2px 8px', borderRadius: 6,
  },
  muted: { color: '#6b7280', fontSize: 14 },
  h3: { marginTop: 0, fontSize: 16 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  card: {
    background: '#fff', borderRadius: 10, padding: 22, boxShadow: '0 2px 10px rgba(0,0,0,.08)', marginBottom: 18, flex: 1, minWidth: 300,
  },
  cardItem: {
    background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,.08)', marginBottom: 12,
  },
  label: { fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 4 },
  textarea: {
    width: '100%', padding: 9, border: '1px solid #c6ccd8', borderRadius: 6, font: 'inherit', minHeight: 120, fontFamily: 'ui-monospace, Consolas, monospace',
  },
  input: { padding: 9, border: '1px solid #c6ccd8', borderRadius: 6, fontSize: 14 },
  btnPrimary: { background: '#2b5cff', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14, marginTop: 6 },
  btn: { background: '#2b5cff', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  btnSm: {
    background: '#2b5cff', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginRight: 6,
  },
  btnSmRed: { background: '#d33', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnRed: { background: '#d33', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  alert: { background: '#fde8e8', color: '#9b1c1c', padding: 10, borderRadius: 6, marginBottom: 12 },
  flash: { padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 14 },
  flashOk: { background: '#e6f6ec', color: '#176b3a' },
  flashErr: { background: '#fde8e8', color: '#9b1c1c' },
  item: { marginBottom: 14 },
  itemLabel: { display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, marginBottom: 6 },
  questionBody: { whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.6, background: '#fff', padding: 16, borderRadius: 8 },
};
