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
  const [error, setError] = useState(null);
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
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet(`/faculty/exams/${examId}`);
      const ex = json && json.exam ? json.exam : null;
      setExam(ex ? { ...ex, title: ex.title || '', code: ex.code || '' } : null);
      setQuestions(Array.isArray(ex && ex.questions) ? ex.questions : []);
      setDraft(ex ? ex.status === 'draft' : false);
    } catch (err) {
      setError(err.message || 'Failed to load exam');
    } finally {
      setLoading(false);
    }
  }

  async function retry() {
    await loadExam();
  }

  async function addQuestion(e) {
    e.preventDefault();
    if (!manualBody.trim()) return;
    try {
      const json = await apiPost('/faculty/questions', {
        exam_id: examId,
        body: manualBody.trim(),
      });
      if (json && json.ok) {
        setManualBody('');
        await loadExam();
      } else {
        setFlash({ type: 'err', msg: json && json.error ? json.error : 'Add failed' });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Add failed' });
    }
  }

  async function updateQuestion(qId, body) {
    try {
      const json = await apiPut(`/faculty/questions/${qId}`, { body });
      if (json && json.ok) await loadExam();
      else alert(json && json.error ? json.error : 'Update failed');
    } catch (err) {
      alert(err.message || 'Update failed');
    }
  }

  async function deleteQuestion(qId) {
    if (!confirm('Delete this question?')) return;
    try {
      await apiDelete(`/faculty/questions/${qId}`);
      await loadExam();
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
      if (json && json.ok) {
        setPreview({ items: Array.isArray(json.items) ? json.items : [], ignored: Number(json.ignored) || 0, mode: json.mode, file: file.name, note: json.note });
      } else {
        setFlash({ type: 'err', msg: json && json.error ? json.error : 'Import failed' });
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
    const form = e.target;
    const items = preview.items.map((_, i) => ({
      keep: form.elements[`q[${i}][keep]`]?.checked ?? true,
      body: form.elements[`q[${i}][body]`]?.value ?? '',
    }));
    try {
      const json = await apiPost('/faculty/questions/import-docx/confirm', {
        exam_id: examId,
        questions: items,
      });
      if (json && json.ok) {
        setPreview(null);
        setFlash({ type: 'ok', msg: json.message });
        await loadExam();
      } else {
        setFlash({ type: 'err', msg: json && json.error ? json.error : 'Confirm failed' });
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
        <nav style={style.nav}>
          <Link to="/faculty/dashboard" style={style.link}>&larr; Back to dashboard</Link>
          <span style={style.spacer}></span>
          <span>Questions — {exam && exam.title ? exam.title : ''}</span>
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
                    <p className="muted">Only text is imported (images and equations are skipped).</p>
                  </div>
                </div>

                {preview && (
                  <div style={style.card}>
                    <h3 style={{ marginTop: 0 }}>Preview: {preview.items.length} question(s) found in “{preview.file}”</h3>
                    <p className="muted">
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
              </>
            )}

            <h3 id="list" style={style.h3}>Questions in this exam ({questions.length})</h3>
            {questions.length === 0 && <p style={style.muted}>No questions yet.</p>}
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
          </>
        )}
        </>
      )}
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
  qhead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 },
  code: {
    fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 18, letterSpacing: 2,
    background: '#18181B', border: '1px solid #27272A', color: '#FF1818', padding: '2px 8px', borderRadius: 0, fontWeight: 800,
  },
  muted: { color: '#A1A1AA', fontSize: 14 },
  h3: { marginTop: 0, fontSize: 16, color: '#FFFFFF' },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  card: {
    background: '#121212', borderRadius: 0, padding: 22, border: '1px solid #27272A', color: '#FFFFFF', marginBottom: 18, flex: 1, minWidth: 300,
  },
  cardItem: {
    background: '#121212', borderRadius: 0, padding: 16, border: '1px solid #27272A', color: '#FFFFFF', marginBottom: 12,
  },
  label: { fontSize: 13, fontWeight: 700, color: '#E4E4E7', display: 'block', marginBottom: 4 },
  textarea: {
    width: '100%', padding: 10, border: '1px solid #27272A', borderRadius: 0, font: 'inherit', minHeight: 120, fontFamily: 'ui-monospace, Consolas, monospace', background: '#18181B', color: '#FFFFFF', outline: 'none',
  },
  input: { padding: 9, border: '1px solid #27272A', borderRadius: 0, fontSize: 14, background: '#18181B', color: '#FFFFFF', outline: 'none' },
  btnPrimary: { background: '#FF1818', color: '#FFFFFF', border: '1px solid #FF1818', padding: '9px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700, marginTop: 6 },
  btn: { background: '#FF1818', color: '#FFFFFF', border: '1px solid #FF1818', padding: '9px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  btnSm: {
    background: '#FFFFFF', color: '#000000', border: '1px solid #FFFFFF', padding: '5px 10px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 700, marginRight: 6,
  },
  btnSmRed: { background: '#FF1818', color: '#FFFFFF', border: '1px solid #FF1818', padding: '5px 10px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  btnRed: { background: '#FF1818', color: '#FFFFFF', border: '1px solid #FF1818', padding: '9px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  alert: { background: '#141414', border: '1px solid #27272A', borderLeft: '3px solid #FF1818', color: '#FFFFFF', padding: 10, borderRadius: 0, marginBottom: 12 },
  flash: { padding: 10, borderRadius: 0, marginBottom: 12, fontSize: 14 },
  flashOk: { background: '#141414', border: '1px solid #27272A', borderLeft: '3px solid #10B981', color: '#FFFFFF' },
  flashErr: { background: '#141414', border: '1px solid #27272A', borderLeft: '3px solid #FF1818', color: '#FFFFFF' },
  item: { marginBottom: 14 },
  itemLabel: { display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, marginBottom: 6, color: '#FFFFFF' },
  questionBody: { whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.6, background: '#18181B', border: '1px solid #27272A', color: '#FFFFFF', padding: 16, borderRadius: 0 },
};
