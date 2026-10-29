import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { apiGet, apiPost, apiDelete, apiFormPost } from '../lib/api.js';

export default function StudentsManager() {
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);
  const [search, setSearch] = useState('');
  const [file, setFile] = useState(null);

  // Manual add
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    loadStudents();
  }, [search]);

  async function loadStudents() {
    try {
      const url = new URL('/faculty/students', window.location.origin);
      if (search) url.searchParams.set('q', search);
      const json = await apiGet(url.pathname + url.search);
      setStudents(json.students || []);
      setTotal(json.students ? json.students.length : 0);
    } catch (err) {
      setError('Failed to load students');
    } finally {
      setLoading(false);
    }
  }

  async function addStudent(e) {
    e.preventDefault();
    if (!username.trim()) return;
    try {
      const json = await apiPost('/faculty/students', {
        username: username.trim(),
        name: name.trim(),
      });
      if (json.ok) {
        setUsername('');
        setName('');
        setFlash({ type: 'ok', msg: json.message });
        loadStudents();
      } else {
        setFlash({ type: 'err', msg: json.error });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Create failed' });
    }
  }

  async function importStudents(e) {
    e.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const json = await apiFormPost('/faculty/students/import', formData);
      if (json.ok) {
        setFlash({ type: 'ok', msg: json.message });
        loadStudents();
      } else {
        setFlash({ type: 'err', msg: json.error });
      }
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Import failed' });
    }
  }

  async function resetPassword(id, uname) {
    if (!confirm(`Reset the password of ${uname} to the username?`)) return;
    try {
      const json = await apiPost(`/faculty/students/${id}/reset`);
      if (json.ok) {
        setFlash({ type: 'ok', msg: json.message });
        loadStudents();
      } else {
        setFlash({ type: 'err', msg: json.error });
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
      loadStudents();
    } catch (err) {
      setFlash({ type: 'err', msg: err.message || 'Delete failed' });
    }
  }

  return (
    <div style={style.page}>
      <nav style={style.nav}>
        <span>Students</span>
        <span style={style.spacer}></span>
        <a href="/faculty/dashboard" style={style.link}>&larr; Back to dashboard</a>
      </nav>

      {flash && (
        <div style={{ ...style.flash, ...(flash.type === 'ok' ? style.flashOk : style.flashErr) }}>{flash.msg}</div>
      )}

      <p style={style.muted}>
        Every student&apos;s <b>password is the same as the username</b> (roll number). Students log in with the username, that password, and the exam code.
      </p>

      <div style={style.row}>
        <div style={style.card}>
          <h3 style={{ marginTop: 0 }}>1. Create manually</h3>
          <form onSubmit={addStudent} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={style.label}>Username (roll number)</label>
            <input
              style={style.input}
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. 21CS001"
              required
              maxLength="50"
            />
            <label style={style.label}>Full name</label>
            <input
              style={style.input}
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ravi Kumar"
              maxLength="100"
            />
            <button type="submit" style={style.btnPrimary}>Create student</button>
          </form>
        </div>

        <div style={style.card}>
          <h3 style={{ marginTop: 0 }}>2. Import from Excel</h3>
          <p style={style.muted}>
            File (.xlsx or .csv): <b>Column A = username</b>, <b>Column B = full name</b>. A header row is allowed.{' '}
            <a href="#" style={style.link}>Download sample file</a>
          </p>
          <form onSubmit={importStudents} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={style.label}>Excel / CSV file</label>
            <input
              type="file"
              name="file"
              accept=".xlsx,.csv"
              required
              onChange={(e) => setFile(e.target.files[0])}
            />
            <button type="submit" style={style.btnPrimary}>Import students</button>
          </form>
          <p style={style.muted}>
            Tip: format column A as <b>Text</b> in Excel so roll numbers like 0012 keep their zeros. Max 1000 students per file.
          </p>
        </div>
      </div>

      <h3 style={style.h3}>Students ({total})</h3>
      <form style={style.searchForm} onSubmit={(e) => e.preventDefault()}>
        <input
          style={style.input}
          name="q"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username or name"
        />
        <button type="submit" style={style.btnSm}>Search</button>
        {search !== '' && (
          <a href="/faculty/students" style={style.btnLink}>Clear</a>
        )}
      </form>

      <table style={style.table}>
        <thead>
          <tr>
            <th>Username</th>
            <th>Full name</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id}>
              <td>{s.username}</td>
              <td>{s.name}</td>
              <td style={style.tdActions}>
                <form onSubmit={(e) => { e.preventDefault(); resetPassword(s.id, s.username); }} style={{ display: 'inline', marginRight: 6 }}>
                  <button style={style.btnSmGray}>Reset password</button>
                </form>
                <form onSubmit={(e) => { e.preventDefault(); deleteStudent(s.id, s.username); }} style={{ display: 'inline' }}>
                  <button style={style.btnSmRed}>Delete</button>
                </form>
              </td>
            </tr>
          ))}
          {students.length === 0 && (
            <tr>
              <td colSpan={3} style={style.mutedTd}>
                No students yet. Create one above or import an Excel file.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const style = {
  page: { fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 16 },
  nav: {
    background: '#1d2433', color: '#fff', padding: '12px 24px', display: 'flex',
    gap: 18, alignItems: 'center', marginBottom: 24,
  },
  spacer: { flex: 1 },
  link: { color: '#2b5cff', textDecoration: 'none' },
  muted: { color: '#6b7280', fontSize: 14 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  card: {
    background: '#fff', borderRadius: 10, padding: 22, boxShadow: '0 2px 10px rgba(0,0,0,.08)', marginBottom: 18, flex: 1, minWidth: 300,
  },
  label: { fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 4 },
  input: { width: '100%', padding: 9, border: '1px solid #c6ccd8', borderRadius: 6, fontSize: 14 },
  btnPrimary: { background: '#2b5cff', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14, marginTop: 6 },
  btn: { background: '#2b5cff', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  btnSm: { background: '#2b5cff', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginRight: 6 },
  btnSmGray: { background: '#6b7280', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnSmRed: { background: '#d33', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnLink: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, padding: '5px 10px' },
  h3: { marginTop: 0, fontSize: 16 },
  searchForm: { display: 'flex', gap: 8, maxWidth: 420, marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' },
  th: { background: '#eef1f7', padding: '9px 12px', textAlign: 'left', fontSize: 14 },
  td: { padding: '9px 12px', borderBottom: '1px solid #e6e9f0', fontSize: 14 },
  tdActions: { whiteSpace: 'nowrap' },
  mutedTd: { color: '#6b7280', padding: 20 },
  flash: { padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 14 },
  flashOk: { background: '#e6f6ec', color: '#176b3a' },
  flashErr: { background: '#fde8e8', color: '#9b1c1c' },
};
