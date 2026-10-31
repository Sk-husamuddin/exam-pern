import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { apiGet, apiPost, apiDelete } from '../lib/api.js';
import Loading from '../components/Loading.jsx';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Clock,
  ShieldAlert,
  Users,
  Plus,
  Radio,
  ExternalLink,
  Trash2,
  Play,
  Square,
  Sparkles,
  ChevronDown,
  ChevronUp,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';

export default function FacultyDashboard() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [selStudents, setSelStudents] = useState(0);
  const [form, setForm] = useState({ title: '', duration: 60, max_violations: 3, questions_to_students: 1 });
  const [showCreate, setShowCreate] = useState(false);
  const [flash, setFlash] = useState(null);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    fetchExams();
  }, []);

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
      questions_to_students: Number(e.questions_per_student) || 1,
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
    setCreating(true);
    try {
      const json = await apiPost('/faculty/exams', {
        title: form.title,
        duration: form.duration,
        max_violations: form.max_violations,
        questions_to_students: form.questions_to_students,
      });
      if (json && json.ok) {
        setFlash({ type: 'ok', msg: json.message || 'Exam created successfully!' });
        setShowCreate(false);
        setForm({ title: '', duration: 60, max_violations: 3, questions_to_students: 1 });
        await fetchExams();
      } else {
        setFlash({ type: 'err', msg: json && json.error ? json.error : 'Create failed' });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Create failed' });
    } finally {
      setCreating(false);
    }
  }

  async function startExam(id) {
    try {
      const json = await apiPost(`/faculty/exams/${id}/start`);
      if (json && json.ok) {
        setFlash({ type: 'ok', msg: 'Exam is now live!' });
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
      setFlash({ type: 'ok', msg: 'Exam ended.' });
      await fetchExams();
    } catch (err) {
      alert(err.message || 'End failed');
    }
  }

  async function deleteExam(id) {
    if (!confirm('Delete this exam and all its records?')) return;
    try {
      await apiDelete(`/faculty/exams/${id}`);
      setFlash({ type: 'ok', msg: 'Exam deleted.' });
      if (selected?.id === id) setSelected(null);
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

  const copyExamCode = (code) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const totalExams = Array.isArray(exams) ? exams.length : 0;
  const liveExams = Array.isArray(exams)
    ? exams.filter((e) => e && e.status === 'live').length
    : 0;

  return (
    <div style={style.pageWrapper}>
      {/* Top Navigation Bar */}
      <header style={style.header}>
        <div style={style.headerContainer}>
          <div style={style.brandGroup}>
            <div style={style.brandIcon}>
              <Sparkles size={20} color="#fff" />
            </div>
            <div>
              <span style={style.brandTitle}>Exam Portal</span>
              <span style={style.brandSubtitle}>Smart Exam Platform</span>
            </div>
          </div>

          <div style={style.headerActions}>
            <div style={style.userPill}>
              <span style={style.roleDot} />
              <span style={style.userRole}>Faculty Account</span>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              style={style.btnLogout}
              title="Sign out of faculty session"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={style.mainContent}>
        {loading && (
          <div style={style.loadingBox}>
            <Loading />
          </div>
        )}

        {!loading && (
          <>
            {/* Global Error Banner */}
            {error && (
              <div role="alert" aria-live="polite" style={style.alertErr}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AlertCircle size={20} color="#dc2626" />
                  <span>{error}</span>
                </div>
                <button onClick={retry} style={style.btnRetry}>
                  Retry
                </button>
              </div>
            )}

            {/* Flash Message */}
            {flash && (
              <div style={flash.type === 'ok' ? style.alertOk : style.alertErr}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {flash.type === 'ok' ? (
                    <CheckCircle2 size={18} color="#16a34a" />
                  ) : (
                    <AlertCircle size={18} color="#dc2626" />
                  )}
                  <span>{flash.msg}</span>
                </div>
                <button onClick={() => setFlash(null)} style={style.btnDismiss}>
                  ✕
                </button>
              </div>
            )}

            {/* Stats / KPI Cards */}
            <div style={style.statsGrid}>
              <div style={style.statCard}>
                <div style={{ ...style.statIconBox, background: '#eff6ff', color: '#2563eb' }}>
                  <BookOpen size={22} />
                </div>
                <div>
                  <span style={style.statLabel}>My exams</span>
                  <div style={style.statValue}>{totalExams}</div>
                </div>
              </div>

              <div style={style.statCard}>
                <div style={{ ...style.statIconBox, background: '#f0fdf4', color: '#16a34a' }}>
                  <Radio size={22} className={liveExams > 0 ? 'animate-pulse' : ''} />
                </div>
                <div>
                  <span style={style.statLabel}>Live now</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={style.statValue}>{liveExams}</span>
                    {liveExams > 0 && <span style={style.liveDot} />}
                  </div>
                </div>
              </div>

              <div style={{ ...style.statCard, background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                <div style={{ ...style.statIconBox, background: '#f5f3ff', color: '#7c3aed' }}>
                  <Users size={22} />
                </div>
                <div>
                  <span style={style.statLabel}>Next step</span>
                  <Link to="/faculty/students" style={style.actionLink}>
                    <span>Add students</span>
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </div>
            </div>

            {/* Collapsible Create Exam Form */}
            <div style={style.card}>
              <div
                style={style.createHeader}
                onClick={() => setShowCreate(!showCreate)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowCreate(!showCreate);
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={style.createIconBadge}>
                    <Plus size={18} color="#4f46e5" />
                  </div>
                  <div>
                    <h3 style={style.createTitle}>+ Create new exam</h3>
                    <p style={style.createSubtitle}>
                      Configure exam title, time limit, and anti-cheating policy
                    </p>
                  </div>
                </div>
                <div style={style.toggleIcon}>
                  {showCreate ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>

              {(showCreate || !totalExams) && (
                <form onSubmit={createExam} style={style.formContainer}>
                  <div style={style.formGrid}>
                    {/* Exam Title Field */}
                    <div style={style.formField}>
                      <label htmlFor="exam-title" style={style.inputLabel}>
                        Exam Title <span style={style.requiredStar}>*</span>
                      </label>
                      <input
                        id="exam-title"
                        style={style.input}
                        name="title"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="e.g. Operating Systems Final Exam"
                        required
                      />
                      <span style={style.fieldHint}>Title shown to students during the test</span>
                    </div>

                    {/* Duration Field */}
                    <div style={style.formField}>
                      <label htmlFor="exam-duration" style={style.inputLabel}>
                        Duration (Minutes) <span style={style.requiredStar}>*</span>
                      </label>
                      <div style={style.inputWithIcon}>
                        <Clock size={16} style={style.inputPrefixIcon} />
                        <input
                          id="exam-duration"
                          style={{ ...style.input, paddingLeft: 36 }}
                          type="number"
                          name="duration"
                          value={form.duration}
                          onChange={(e) => setForm({ ...form, duration: e.target.value })}
                          min="1"
                          max="600"
                          placeholder="60"
                          required
                        />
                      </div>
                      <span style={style.fieldHint}>Time allowed per student session</span>
                    </div>

                    {/* Max Violations Field */}
                    <div style={style.formField}>
                      <label htmlFor="exam-violations" style={style.inputLabel}>
                        Max Violations <span style={style.requiredStar}>*</span>
                      </label>
                      <div style={style.inputWithIcon}>
                        <ShieldAlert size={16} style={style.inputPrefixIcon} />
                        <input
                          id="exam-violations"
                          style={{ ...style.input, paddingLeft: 36 }}
                          type="number"
                          name="max_violations"
                          value={form.max_violations}
                          onChange={(e) => setForm({ ...form, max_violations: e.target.value })}
                          min="1"
                          max="20"
                          placeholder="3"
                          required
                        />
                      </div>
                      <span style={style.fieldHint}>Auto-locks after tab switch or exit</span>
                    </div>

                    {/* No. of questions to students Field */}
                    <div style={style.formField}>
                      <label htmlFor="exam-questions-to-students" style={style.inputLabel}>
                        No. of questions to students: <span style={style.requiredStar}>*</span>
                      </label>
                      <div style={style.inputWithIcon}>
                        <BookOpen size={16} style={style.inputPrefixIcon} />
                        <input
                          id="exam-questions-to-students"
                          style={{ ...style.input, paddingLeft: 36 }}
                          type="number"
                          name="questions_to_students"
                          value={form.questions_to_students}
                          onChange={(e) => setForm({ ...form, questions_to_students: e.target.value })}
                          min="1"
                          max="50"
                          placeholder="2"
                          required
                        />
                      </div>
                      <span style={style.fieldHint}>e.g. 2 means 2 questions are given to each student</span>
                    </div>
                  </div>

                  <div style={style.formActions}>
                    <button
                      type="submit"
                      disabled={creating || !form.title.trim()}
                      style={{
                        ...style.btnPrimary,
                        ...(creating || !form.title.trim() ? style.btnDisabled : {}),
                      }}
                    >
                      <Plus size={16} />
                      <span>{creating ? 'Creating exam…' : 'Create exam'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Exam List Section */}
            <div style={style.tableSection}>
              <div style={style.sectionHeader}>
                <div>
                  <h3 style={style.sectionTitle}>My exams</h3>
                  <p style={style.sectionSubtitle}>
                    All question papers, test codes, and active student assessments
                  </p>
                </div>
              </div>

              <div style={style.tableCard}>
                <table style={style.table}>
                  <thead>
                    <tr>
                      <th style={style.th}>Exam Title</th>
                      <th style={style.th}>Access Code</th>
                      <th style={style.th}>Status</th>
                      <th style={style.th}>Questions</th>
                      <th style={style.th}>Students</th>
                      <th style={style.th}>Duration</th>
                      <th style={{ ...style.th, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totalExams === 0 ? (
                      <tr>
                        <td colSpan={7} style={style.emptyStateCell}>
                          <div style={style.emptyStateBox}>
                            <BookOpen size={36} color="#94a3b8" />
                            <p style={style.emptyStateText}>
                              No exams yet. Create your first exam above.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      exams.map((e) => {
                        const isSelected = selected?.id === e.id;
                        return (
                          <tr
                            key={e.id}
                            style={{
                              ...style.tr,
                              ...(isSelected ? style.trSelected : {}),
                            }}
                          >
                            {/* Exam Title */}
                            <td style={style.td}>
                              <button
                                type="button"
                                onClick={() => loadExamDetail(e.id)}
                                style={style.examTitleBtn}
                                title="Click to view details"
                              >
                                <span style={style.examTitleText}>{e.title}</span>
                              </button>
                            </td>

                            {/* Exam Code */}
                            <td style={style.td}>
                              <div style={style.codeWrapper}>
                                <span style={style.codeBadge}>{e.code}</span>
                                <button
                                  type="button"
                                  onClick={() => copyExamCode(e.code)}
                                  style={style.copyBtn}
                                  title="Copy 6-character code"
                                >
                                  {copiedCode === e.code ? (
                                    <Check size={14} color="#16a34a" />
                                  ) : (
                                    <Copy size={14} color="#64748b" />
                                  )}
                                </button>
                              </div>
                            </td>

                            {/* Status */}
                            <td style={style.td}>
                              <span style={style.statusBadge(e.status)}>
                                <span style={style.statusDot(e.status)} />
                                {e.status}
                              </span>
                            </td>

                            {/* Questions */}
                            <td style={style.td}>
                              <span style={style.countPill}>{e.qc} questions</span>
                            </td>

                            {/* Students */}
                            <td style={style.td}>
                              <span style={style.countPill}>{e.sc} joined</span>
                            </td>

                            {/* Duration */}
                            <td style={style.td}>
                              <span style={style.durationText}>{e.duration_min} min</span>
                            </td>

                            {/* Action Buttons */}
                            <td style={{ ...style.td, textAlign: 'right' }}>
                              <div style={style.actionsCell}>
                                <Link to={`/faculty/questions/${e.id}`}>
                                  <button style={style.btnActionSecondary}>
                                    {e.status === 'draft' ? 'Manage questions' : 'View'}
                                  </button>
                                </Link>

                                <Link to={`/faculty/monitor/${e.id}`}>
                                  <button style={style.btnActionMonitor}>
                                    <Radio size={14} />
                                    <span>Monitor</span>
                                  </button>
                                </Link>

                                {e.status === 'draft' && (
                                  <button
                                    onClick={() => startExam(e.id)}
                                    disabled={e.qc === 0}
                                    style={{
                                      ...style.btnActionStart,
                                      ...(e.qc === 0 ? style.btnDisabled : {}),
                                    }}
                                    title={e.qc === 0 ? 'Add at least one question first' : 'Start exam now'}
                                  >
                                    <Play size={13} />
                                    <span>Start exam</span>
                                  </button>
                                )}

                                {e.status === 'live' && (
                                  <button
                                    onClick={() => endExam(e.id)}
                                    style={style.btnActionEnd}
                                    title="End exam for everyone"
                                  >
                                    <Square size={13} />
                                    <span>End exam</span>
                                  </button>
                                )}

                                {e.status !== 'live' && (
                                  <button
                                    onClick={() => deleteExam(e.id)}
                                    style={style.btnActionDelete}
                                    title="Delete exam"
                                  >
                                    <Trash2 size={14} />
                                    <span>Delete</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected Exam Details Drawer */}
            {selected && (
              <div style={style.detailCard}>
                <div style={style.detailHeader}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h2 style={style.detailTitle}>{selected.title}</h2>
                      <span style={style.statusBadge(selected.status)}>
                        <span style={style.statusDot(selected.status)} />
                        {selected.status}
                      </span>
                    </div>
                    <p style={style.detailSubtitle}>
                      {questions.length} question(s) &middot; {selected.duration_min} minutes &middot;{' '}
                      auto-lock after {selected.max_violations} violations &middot; {selStudents} student(s) logged in
                    </p>
                  </div>

                  <div style={style.detailCodeBox}>
                    <span style={style.detailCodeLabel}>Exam Access Code</span>
                    <span style={style.detailCodeValue}>{selected.code}</span>
                  </div>
                </div>

                <div style={style.detailActions}>
                  {selected.status === 'draft' && (
                    <>
                      <Link to={`/faculty/questions/${selected.id}`}>
                        <button style={style.btnPrimary}>Create / edit questions</button>
                      </Link>
                      <Link to={`/faculty/monitor/${selected.id}`}>
                        <button style={style.btnSecondary}>Open live monitor</button>
                      </Link>
                      <button onClick={() => deleteExam(selected.id)} style={style.btnActionDelete}>
                        <Trash2 size={14} />
                        <span>Delete exam</span>
                      </button>
                    </>
                  )}
                  {selected.status !== 'draft' && (
                    <div style={style.lockAlert}>
                      This exam is {selected.status}, so its questions and settings are locked.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const style = {
  pageWrapper: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
    color: '#0f172a',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    position: 'sticky',
    top: 0,
    zIndex: 20,
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
  },
  headerContainer: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '14px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  brandIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 10px rgba(79, 70, 229, 0.25)',
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#0f172a',
    display: 'block',
    letterSpacing: '-0.02em',
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#64748b',
    display: 'block',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  userPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 14px',
    backgroundColor: '#f1f5f9',
    borderRadius: 9999,
  },
  roleDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: '#4f46e5',
  },
  userRole: {
    fontSize: 13,
    fontWeight: 600,
    color: '#334155',
  },
  btnLogout: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    color: '#dc2626',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  mainContent: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '28px 24px 60px',
  },
  loadingBox: {
    padding: '80px 0',
    textAlign: 'center',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    border: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },
  statIconBox: {
    width: 50,
    height: 50,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: '#64748b',
    display: 'block',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 26,
    fontWeight: 700,
    color: '#0f172a',
    lineHeight: 1,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: '#16a34a',
  },
  actionLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    fontWeight: 600,
    color: '#4f46e5',
    textDecoration: 'none',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
    marginBottom: 28,
    overflow: 'hidden',
  },
  createHeader: {
    padding: '18px 22px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    backgroundColor: '#ffffff',
    transition: 'background-color 0.15s ease',
  },
  createIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#1e293b',
  },
  createSubtitle: {
    margin: '2px 0 0',
    fontSize: 12,
    color: '#64748b',
  },
  toggleIcon: {
    color: '#94a3b8',
  },
  formContainer: {
    padding: '0 22px 22px',
    borderTop: '1px solid #f1f5f9',
    backgroundColor: '#fafafa',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 18,
    paddingTop: 18,
    marginBottom: 18,
  },
  formField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#334155',
  },
  requiredStar: {
    color: '#dc2626',
  },
  inputWithIcon: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputPrefixIcon: {
    position: 'absolute',
    left: 12,
    color: '#94a3b8',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    fontSize: 14,
    color: '#0f172a',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box',
  },
  fieldHint: {
    fontSize: 11,
    color: '#64748b',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    color: '#334155',
    border: '1px solid #cbd5e1',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  tableSection: {
    marginBottom: 32,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    margin: '3px 0 0',
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  th: {
    backgroundColor: '#f8fafc',
    padding: '13px 18px',
    fontSize: 12,
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid #e2e8f0',
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
    transition: 'background-color 0.15s ease',
  },
  trSelected: {
    backgroundColor: '#eef2ff',
  },
  td: {
    padding: '14px 18px',
    fontSize: 14,
    verticalAlign: 'middle',
  },
  examTitleBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left',
  },
  examTitleText: {
    fontWeight: 600,
    color: '#1e293b',
    fontSize: 14,
  },
  codeWrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  codeBadge: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 13,
    fontWeight: 700,
    color: '#1e293b',
    backgroundColor: '#f1f5f9',
    padding: '3px 8px',
    borderRadius: 6,
    letterSpacing: '0.08em',
    border: '1px solid #e2e8f0',
  },
  copyBtn: {
    background: 'none',
    border: 'none',
    padding: 3,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 4,
  },
  statusBadge: (status) => {
    const config = {
      live: { bg: '#ecfdf5', text: '#059669', dot: '#10b981' },
      ended: { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
      draft: { bg: '#fef3c7', text: '#d97706', dot: '#f59e0b' },
    };
    const c = config[status] || { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' };
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 10px',
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 600,
      backgroundColor: c.bg,
      color: c.text,
      textTransform: 'capitalize',
    };
  },
  statusDot: (status) => {
    const dots = {
      live: '#10b981',
      ended: '#94a3b8',
      draft: '#f59e0b',
    };
    return {
      width: 6,
      height: 6,
      borderRadius: '50%',
      backgroundColor: dots[status] || '#94a3b8',
    };
  },
  countPill: {
    fontSize: 13,
    color: '#475569',
    fontWeight: 500,
  },
  durationText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: 500,
  },
  actionsCell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btnActionSecondary: {
    backgroundColor: '#f1f5f9',
    color: '#1e293b',
    border: '1px solid #e2e8f0',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  btnActionMonitor: {
    backgroundColor: '#ecfdf5',
    color: '#059669',
    border: '1px solid #a7f3d0',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
  btnActionStart: {
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
  btnActionEnd: {
    backgroundColor: '#fff1f2',
    color: '#e11d48',
    border: '1px solid #fecdd3',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
  btnActionDelete: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: '1px solid transparent',
    padding: '6px 8px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.15s ease',
  },
  emptyStateCell: {
    padding: '60px 20px',
    textAlign: 'center',
  },
  emptyStateBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#64748b',
    margin: 0,
  },
  detailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 24,
    border: '1px solid #cbd5e1',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
    marginTop: 24,
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 20,
    marginBottom: 16,
  },
  detailTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: '#0f172a',
  },
  detailSubtitle: {
    margin: '6px 0 0',
    fontSize: 13,
    color: '#64748b',
  },
  detailCodeBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: '10px 16px',
    textAlign: 'center',
  },
  detailCodeLabel: {
    display: 'block',
    fontSize: 11,
    color: '#64748b',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 3,
  },
  detailCodeValue: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: '0.12em',
    color: '#4f46e5',
  },
  detailActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    paddingTop: 16,
    borderTop: '1px solid #f1f5f9',
  },
  lockAlert: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 13,
    padding: '8px 14px',
    borderRadius: 6,
    fontWeight: 500,
  },
  alertOk: {
    backgroundColor: '#ecfdf5',
    color: '#065f46',
    border: '1px solid #a7f3d0',
    padding: '12px 18px',
    borderRadius: 10,
    marginBottom: 20,
    fontSize: 14,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertErr: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    padding: '12px 18px',
    borderRadius: 10,
    marginBottom: 20,
    fontSize: 14,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  btnRetry: {
    backgroundColor: '#ffffff',
    border: '1px solid #f87171',
    color: '#dc2626',
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDismiss: {
    background: 'none',
    border: 'none',
    color: 'currentColor',
    cursor: 'pointer',
    fontSize: 14,
  },
};
