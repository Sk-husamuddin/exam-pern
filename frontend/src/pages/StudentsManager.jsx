import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserPlus,
  FileSpreadsheet,
  UploadCloud,
  LoaderCircle,
  Download,
  Search,
  KeyRound,
  Trash2,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { apiGet, apiPost, apiDelete, apiFormPost } from '../lib/api.js';
import Loading from '../components/Loading.jsx';

export default function StudentsManager() {
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [search, setSearch] = useState('');
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef(null);

  // Manual add
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    loadStudents();
  }, [search]);

  async function loadStudents() {
    setLoading(true);
    setError(null);
    try {
      const q = search ? `?q=${encodeURIComponent(search)}` : '';
      const json = await apiGet(`/faculty/students${q}`);
      const rows = Array.isArray(json?.students) ? json.students : [];
      setStudents(rows);
      setTotal(rows.length);
    } catch (err) {
      setError(err.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }

  async function retry() {
    await loadStudents();
  }

  async function addStudent(e) {
    e.preventDefault();
    if (!username.trim() || creating) return;
    setCreating(true);
    setFlash(null);
    try {
      const json = await apiPost('/faculty/students', {
        username: username.trim(),
        name: name.trim(),
      });
      if (json && json.ok) {
        setUsername('');
        setName('');
        setFlash({ type: 'ok', msg: json.message || 'Student created successfully' });
        await loadStudents();
      } else {
        setFlash({ type: 'err', msg: json && json.error ? json.error : 'Create failed' });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Create failed' });
    } finally {
      setCreating(false);
    }
  }

  async function importStudents(e) {
    e.preventDefault();
    if (!file || importing) return;
    setImporting(true);
    setFlash(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const json = await apiFormPost('/faculty/students/import', formData);
      if (json && json.ok) {
        setFlash({ type: 'ok', msg: json.message });
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadStudents();
      } else {
        setFlash({ type: 'err', msg: json && json.error ? json.error : 'Import failed' });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Import failed' });
    } finally {
      setImporting(false);
    }
  }

  async function resetPassword(id, uname) {
    if (!confirm(`Reset the password of ${uname} to the username?`)) return;
    try {
      const json = await apiPost(`/faculty/students/${id}/reset`);
      if (json && json.ok) {
        setFlash({ type: 'ok', msg: json.message });
        await loadStudents();
      } else {
        setFlash({ type: 'err', msg: json && json.error ? json.error : 'Reset failed' });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Reset failed' });
    }
  }

  async function deleteStudent(id, uname) {
    if (!confirm(`Delete student ${uname} and their records?`)) return;
    try {
      await apiDelete(`/faculty/students/${id}`);
      setFlash({ type: 'ok', msg: 'Student deleted' });
      await loadStudents();
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Delete failed' });
    }
  }

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
              <button
                onClick={retry}
                style={{
                  background: 'transparent',
                  border: '1px solid currentColor',
                  color: 'currentColor',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '4px 10px',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Navigation Bar */}
          <nav style={style.nav}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={20} color="#818cf8" />
              <span style={{ fontWeight: 700, fontSize: 16 }}>Student Roster</span>
              <span style={style.badge}>{total} Enrolled</span>
            </div>
            <span style={style.spacer}></span>
            <Link to="/faculty/dashboard" style={style.backLink}>
              <ArrowLeft size={16} />
              <span>Back to dashboard</span>
            </Link>
          </nav>

          {/* Flash alert banner */}
          {flash && (
            <div
              style={{
                ...style.flash,
                ...(flash.type === 'ok' ? style.flashOk : style.flashErr),
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {flash.type === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span style={{ flex: 1 }}>{flash.msg}</span>
              <button
                onClick={() => setFlash(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 16,
                  padding: '0 4px',
                }}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
          )}

          {/* Info Banner */}
          <div style={style.infoBanner}>
            <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: 2 }}>
              Default Student Credentials
            </div>
            <div style={{ color: '#A1A1AA', fontSize: 13, lineHeight: 1.5 }}>
              Every student&apos;s <b style={{ color: '#FFFFFF' }}>password is identical to their username</b> (roll number). Students log in with their roll number, that password, and the exam code.
            </div>
          </div>

          {/* Action Row */}
          <div style={style.row}>
            {/* 1. Manual Creation Card */}
            <div style={style.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={style.cardIconBg}>
                  <UserPlus size={18} color="#FF1818" />
                </div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>
                  1. Create manually
                </h3>
              </div>
              <form onSubmit={addStudent} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label htmlFor="student-username" style={style.label}>
                    Username (Roll Number) *
                  </label>
                  <input
                    id="student-username"
                    style={style.input}
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. 21CS001"
                    required
                    maxLength="50"
                    disabled={creating}
                  />
                </div>
                <div>
                  <label htmlFor="student-name" style={style.label}>
                    Full Name
                  </label>
                  <input
                    id="student-name"
                    style={style.input}
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ravi Kumar"
                    maxLength="100"
                    disabled={creating}
                  />
                </div>
                <button
                  type="submit"
                  disabled={creating || !username.trim()}
                  style={{
                    ...style.btnPrimary,
                    opacity: creating || !username.trim() ? 0.65 : 1,
                    cursor: creating || !username.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creating ? (
                    <>
                      <LoaderCircle className="spin" size={16} />
                      <span>Creating student…</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={16} />
                      <span>Create student</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* 2. Bulk Excel / CSV Import Card */}
            <div style={style.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={style.cardIconBg}>
                  <FileSpreadsheet size={18} color="#FF1818" />
                </div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>
                  2. Import from Excel / CSV
                </h3>
              </div>
              <p style={{ ...style.muted, marginBottom: 12 }}>
                File (.xlsx or .csv): <b style={{ color: '#FFFFFF' }}>Column A = roll number</b>, <b style={{ color: '#FFFFFF' }}>Column B = full name</b>.{' '}
                <a
                  href="data:text/csv;charset=utf-8,username%2Cname%0A21CS001%2CRavi%20Kumar%0A21CS002%2CPriya%20Sharma"
                  download="sample_students.csv"
                  style={style.sampleLink}
                >
                  <Download size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  Download sample CSV
                </a>
              </p>

              <form onSubmit={importStudents} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label htmlFor="student-file-input" style={style.label}>
                    Excel / CSV Spreadsheet *
                  </label>
                  <input
                    id="student-file-input"
                    ref={fileInputRef}
                    type="file"
                    name="file"
                    accept=".xlsx,.csv"
                    required
                    disabled={importing}
                    onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                    style={style.fileInput}
                  />
                </div>

                {/* Animated loading card while importing */}
                {importing && (
                  <div style={style.importStatusBox} role="status" aria-live="polite">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={style.pulseIconBox}>
                        <FileSpreadsheet size={22} color="#FF1818" className="spin" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#FFFFFF' }}>
                          Uploading & Processing Roster…
                        </div>
                        <div style={{ fontSize: 12, color: '#A1A1AA', marginTop: 2 }}>
                          Reading rows, hashing student passwords, and creating database profiles.
                        </div>
                      </div>
                    </div>
                    {/* Animated Progress Bar */}
                    <div className="progress-track" style={style.progressTrack}>
                      <div className="progress-value" style={style.progressValue} />
                    </div>
                    <div style={{ fontSize: 11, color: '#FF1818', fontWeight: 600, textAlign: 'right' }}>
                      Please wait, do not close this window…
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={importing || !file}
                  style={{
                    ...style.btnPrimary,
                    opacity: importing || !file ? 0.65 : 1,
                    cursor: importing || !file ? 'not-allowed' : 'pointer',
                  }}
                >
                  {importing ? (
                    <>
                      <LoaderCircle className="spin" size={16} />
                      <span>Importing student roster…</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={16} />
                      <span>Import students</span>
                    </>
                  )}
                </button>
              </form>

              <div style={style.tipText}>
                💡 <b>Tip:</b> Format column A as <b>Text</b> in Excel so roll numbers like <code>0012</code> keep leading zeros. Up to 1,000 students per batch.
              </div>
            </div>
          </div>

          {/* Search and Table Area */}
          <div style={style.tableSection}>
            <div style={style.tableHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>
                  Enrolled Students ({total})
                </h3>
              </div>
              <form style={style.searchForm} onSubmit={(e) => e.preventDefault()}>
                <div style={style.searchWrapper}>
                  <Search size={15} color="#94a3b8" style={style.searchIcon} />
                  <input
                    style={style.searchInput}
                    name="q"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by username or name…"
                    aria-label="Search students"
                  />
                </div>
                {search !== '' && (
                  <button type="button" onClick={() => setSearch('')} style={style.btnLink}>
                    Clear
                  </button>
                )}
              </form>
            </div>

            <div style={style.tableCard}>
              <table style={style.table}>
                <thead>
                  <tr>
                    <th style={style.th}>Roll Number (Username)</th>
                    <th style={style.th}>Full Name</th>
                    <th style={{ ...style.th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={style.emptyTd}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <Users size={32} color="#94a3b8" />
                          <span style={{ fontWeight: 500 }}>
                            {search ? 'No students matched your search.' : 'No students found. Create one above or import an Excel/CSV file.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    students.map((s) => (
                      <tr key={s.id} style={style.tr}>
                        <td style={style.td}>
                          <span style={style.codePill}>{s && s.username}</span>
                        </td>
                        <td style={style.td}>
                          <span style={{ fontWeight: 600, color: '#FFFFFF' }}>
                            {s && (s.name || s.username)}
                          </span>
                        </td>
                        <td style={{ ...style.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            title="Reset password to roll number"
                            onClick={() => s && resetPassword(s.id, s.username)}
                            style={style.btnReset}
                          >
                            <KeyRound size={13} />
                            <span>Reset password</span>
                          </button>
                          <button
                            type="button"
                            title="Delete student"
                            onClick={() => s && deleteStudent(s.id, s.username)}
                            style={style.btnDelete}
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const style = {
  page: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    maxWidth: 1100,
    margin: '0 auto',
    padding: '24px 16px',
    color: '#FFFFFF',
    backgroundColor: '#0A0A0A',
    minHeight: '100vh',
  },
  nav: {
    background: '#121212',
    color: '#FFFFFF',
    padding: '14px 20px',
    borderRadius: 0,
    border: '1px solid #27272A',
    display: 'flex',
    alignItems: 'center',
    marginBottom: 20,
    boxShadow: 'none',
  },
  spacer: { flex: 1 },
  badge: {
    background: '#18181B',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: 0,
    border: '1px solid #27272A',
    marginLeft: 6,
  },
  backLink: {
    color: '#FFFFFF',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 0,
    background: 'transparent',
    border: '1px solid #27272A',
    transition: 'background 0.2s ease',
  },
  infoBanner: {
    background: '#121212',
    border: '1px solid #27272A',
    borderLeft: '4px solid #FF1818',
    padding: '14px 18px',
    borderRadius: 0,
    marginBottom: 20,
    color: '#FFFFFF',
  },
  flash: {
    padding: '12px 16px',
    borderRadius: 0,
    marginBottom: 18,
    fontSize: 14,
    fontWeight: 500,
  },
  flashOk: {
    background: '#141414',
    border: '1px solid #27272A',
    borderLeft: '4px solid #10B981',
    color: '#FFFFFF',
  },
  flashErr: {
    background: '#141414',
    border: '1px solid #27272A',
    borderLeft: '4px solid #FF1818',
    color: '#FFFFFF',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 20,
    marginBottom: 28,
  },
  card: {
    background: '#121212',
    borderRadius: 0,
    padding: 24,
    border: '1px solid #27272A',
    boxShadow: 'none',
    color: '#FFFFFF',
  },
  cardIconBg: {
    width: 32,
    height: 32,
    borderRadius: 0,
    background: '#18181B',
    color: '#FF1818',
    display: 'grid',
    placeItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: '#E4E4E7',
    display: 'block',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #27272A',
    borderRadius: 0,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    background: '#18181B',
    color: '#FFFFFF',
    transition: 'border-color 0.15s ease',
  },
  fileInput: {
    width: '100%',
    padding: '8px 10px',
    border: '1px dashed #3F3F46',
    borderRadius: 0,
    fontSize: 13,
    background: '#18181B',
    color: '#FFFFFF',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  btnPrimary: {
    background: '#FF1818',
    color: '#FFFFFF',
    border: '1px solid #FF1818',
    padding: '10px 16px',
    borderRadius: 0,
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
    boxShadow: 'none',
  },
  muted: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 1.5,
  },
  sampleLink: {
    color: '#FF1818',
    fontWeight: 700,
    textDecoration: 'underline',
    display: 'inline-block',
  },
  tipText: {
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 14,
    padding: '10px 12px',
    background: '#18181B',
    borderRadius: 0,
    border: '1px solid #27272A',
    lineHeight: 1.5,
  },
  importStatusBox: {
    background: '#18181B',
    border: '1px solid #27272A',
    borderRadius: 0,
    padding: 14,
    marginTop: 6,
    color: '#FFFFFF',
  },
  pulseIconBox: {
    width: 36,
    height: 36,
    borderRadius: 0,
    background: '#27272A',
    color: '#FF1818',
    display: 'grid',
    placeItems: 'center',
  },
  progressTrack: {
    height: 6,
    width: '100%',
    background: '#27272A',
    borderRadius: 0,
    overflow: 'hidden',
    margin: '12px 0 6px',
  },
  progressValue: {
    height: '100%',
    width: '45%',
    background: '#FF1818',
    borderRadius: 0,
  },
  tableSection: {
    marginTop: 12,
  },
  tableHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  searchForm: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 10,
    pointerEvents: 'none',
    color: '#71717A',
  },
  searchInput: {
    padding: '8px 12px 8px 32px',
    border: '1px solid #27272A',
    borderRadius: 0,
    fontSize: 13,
    outline: 'none',
    width: 240,
    background: '#18181B',
    color: '#FFFFFF',
  },
  btnLink: {
    background: 'transparent',
    border: 'none',
    color: '#A1A1AA',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    padding: '4px 8px',
  },
  tableCard: {
    background: '#121212',
    borderRadius: 0,
    border: '1px solid #27272A',
    overflow: 'hidden',
    boxShadow: 'none',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  th: {
    background: '#18181B',
    padding: '12px 16px',
    fontSize: 11,
    fontWeight: 700,
    color: '#A1A1AA',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '1px solid #27272A',
  },
  tr: {
    borderBottom: '1px solid #27272A',
  },
  td: {
    padding: '12px 16px',
    fontSize: 14,
    color: '#FFFFFF',
    verticalAlign: 'middle',
  },
  codePill: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 13,
    fontWeight: 700,
    background: '#18181B',
    color: '#FFFFFF',
    padding: '3px 8px',
    borderRadius: 0,
    border: '1px solid #27272A',
  },
  emptyTd: {
    padding: '40px 16px',
    textAlign: 'center',
    color: '#A1A1AA',
  },
  btnReset: {
    background: '#FFFFFF',
    color: '#000000',
    border: '1px solid #FFFFFF',
    padding: '6px 10px',
    borderRadius: 0,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    marginRight: 8,
  },
  btnDelete: {
    background: 'transparent',
    color: '#FF1818',
    border: '1px solid #FF1818',
    padding: '6px 10px',
    borderRadius: 0,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
};
