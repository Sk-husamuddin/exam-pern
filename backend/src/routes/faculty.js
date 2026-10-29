const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const { query } = require('../db');
const { verifyFaculty } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();

// Multer: memory storage for parsing; files are not permanently stored yet
const uploadDocx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_DOCX_SIZE }, // 5 MB for .docx
});

const uploadStudent = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_XLSX_SIZE }, // 2 MB for .xlsx/.csv
});

// ------------------------------------------------------------------
// List faculty exams
// ------------------------------------------------------------------
router.get('/exams', verifyFaculty, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS qc,
              (SELECT COUNT(*) FROM exam_sessions s WHERE s.exam_id = e.id) AS sc
       FROM exams e
       WHERE e.faculty_id = $1
       ORDER BY e.id DESC`,
      [req.faculty.id]
    );
    res.json({ exams: rows });
  } catch (err) {
    console.error('GET /exams error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Create exam
// ------------------------------------------------------------------
router.post('/exams', verifyFaculty, async (req, res) => {
  try {
    const { title, duration = 60, max_violations = 3 } = req.body;
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Exam title is required' });
    }

    const dur = Math.max(1, Math.min(600, parseInt(duration, 10) || 60));
    const mv = Math.max(1, Math.min(20, parseInt(max_violations, 10) || 3));

    let code;
    let inserted = false;
    for (let i = 0; i < 5; i++) {
      code = crypto.randomBytes(4).toString('hex').toUpperCase().substring(0, 6);
      try {
        const { rows } = await query(
          `INSERT INTO exams (code, title, faculty_id, duration_min, max_violations)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [code, title.trim(), req.faculty.id, dur, mv]
        );
        inserted = true;
        res.json({
          ok: true,
          exam: { id: rows[0].id, code, title: title.trim(), duration_min: dur, max_violations: mv },
          message: 'Exam created. Now add questions.',
        });
        break;
      } catch (err) {
        if (err.code === '23505') continue; // unique violation -> try another code
        throw err;
      }
    }
    if (!inserted) {
      return res.status(400).json({ error: 'Could not generate a unique exam code, try again.' });
    }
  } catch (err) {
    console.error('POST /exams error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Get exam detail + questions
// ------------------------------------------------------------------
router.get('/exams/:examId', verifyFaculty, async (req, res) => {
  try {
    const { examId } = req.params;
    const { rows } = await query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS qc,
              (SELECT COUNT(*) FROM exam_sessions s WHERE s.exam_id = e.id) AS sc
       FROM exams e
       WHERE e.id = $1 AND e.faculty_id = $2`,
      [examId, req.faculty.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Exam not found' });

    const exam = rows[0];
    const { rows: qrows } = await query(
      'SELECT * FROM questions WHERE exam_id = $1 ORDER BY q_no',
      [examId]
    );
    exam.questions = qrows;
    res.json({ exam });
  } catch (err) {
    console.error('GET /exams/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Update exam settings (draft only)
// ------------------------------------------------------------------
router.patch('/exams/:examId', verifyFaculty, async (req, res) => {
  try {
    const { examId } = req.params;
    const { title, duration, max_violations } = req.body;

    const { rows } = await query(
      'SELECT status FROM exams WHERE id = $1 AND faculty_id = $2',
      [examId, req.faculty.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    if (rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Exam settings can only be changed before the exam starts' });
    }

    const dur = duration != null ? Math.max(1, Math.min(600, parseInt(duration, 10))) : undefined;
    const mv = max_violations != null ? Math.max(1, Math.min(20, parseInt(max_violations, 10))) : undefined;

    const fields = [];
    const values = [];
    if (title != null) { fields.push(`title = $${values.length + 1}`); values.push(title.trim()); }
    if (dur != null) { fields.push(`duration_min = $${values.length + 1}`); values.push(dur); }
    if (mv != null) { fields.push(`max_violations = $${values.length + 1}`); values.push(mv); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    values.push(examId, req.faculty.id);
    await query(`UPDATE exams SET ${fields.join(', ')} WHERE id = $${values.length - 1} AND faculty_id = $${values.length}`, values);
    res.json({ ok: true, message: 'Exam settings saved' });
  } catch (err) {
    console.error('PATCH /exams/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Delete exam (draft only)
// ------------------------------------------------------------------
router.delete('/exams/:examId', verifyFaculty, async (req, res) => {
  try {
    const { examId } = req.params;
    const { rows } = await query(
      'SELECT status FROM exams WHERE id = $1 AND faculty_id = $2',
      [examId, req.faculty.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    if (rows[0].status === 'live') {
      return res.status(400).json({ error: 'A live exam cannot be deleted. End it first.' });
    }
    await query('DELETE FROM exams WHERE id = $1 AND faculty_id = $2', [examId, req.faculty.id]);
    res.json({ ok: true, message: 'Exam deleted' });
  } catch (err) {
    console.error('DELETE /exams/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Start exam (draft -> live)
// ------------------------------------------------------------------
router.post('/exams/:examId/start', verifyFaculty, async (req, res) => {
  try {
    const { examId } = req.params;

    // Atomic: check draft + has questions + set live in one statement
    const { rows } = await query(
      `UPDATE exams
       SET status = 'live', started_at = now()
       WHERE id = $1 AND faculty_id = $2 AND status = 'draft'
         AND EXISTS (SELECT 1 FROM questions q WHERE q.exam_id = $1)
       RETURNING id, status`,
      [examId, req.faculty.id]
    );

    if (rows.length === 0) {
      // Distinguish reasons
      const exam = await query('SELECT status FROM exams WHERE id = $1 AND faculty_id = $2', [examId, req.faculty.id]);
      if (exam.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });
      if (exam.rows[0].status !== 'draft') return res.status(400).json({ error: 'This exam has already been started' });
      return res.status(400).json({ error: 'Add at least one question before starting' });
    }

    res.json({ ok: true, message: 'Exam started' });
  } catch (err) {
    console.error('POST /exams/:id/start error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// End exam
// ------------------------------------------------------------------
router.post('/exams/:examId/end', verifyFaculty, async (req, res) => {
  try {
    const { examId } = req.params;
    await query(
      `UPDATE exams SET status = 'ended' WHERE id = $1 AND faculty_id = $2 AND status = 'live'`,
      [examId, req.faculty.id]
    );
    res.json({ ok: true, message: 'Exam ended' });
  } catch (err) {
    console.error('POST /exams/:id/end error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Import .docx: parse and return preview items
// ------------------------------------------------------------------
router.post('/questions/import-docx', verifyFaculty, uploadDocx.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a Word file to upload' });
    }
    const ext = req.file.originalname.toLowerCase().split('.').pop();
    if (ext !== 'docx') {
      return res.status(400).json({ error: 'Only .docx Word files are allowed' });
    }
    if (req.file.size > config.MAX_DOCX_SIZE) {
      return res.status(400).json({ error: 'File is too large (maximum 5 MB)' });
    }

    const mode = (req.body.mode || 'auto').toString();
    const JSZip = require('jszip');
    let zip;
    try {
      zip = await JSZip.loadAsync(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: 'Not a valid .docx file' });
    }
    const docXml = zip.file('word/document.xml');
    if (!docXml) {
      return res.status(400).json({ error: 'Not a valid .docx file' });
    }
    const xml = await docXml.async('string');

    // Simple paragraph extraction via regex (parity with original PHP logic)
    const paras = [];
    const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
    let pMatch;
    while ((pMatch = pRegex.exec(xml)) !== null) {
      const pContent = pMatch[1];
      let text = '';
      const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let tMatch;
      while ((tMatch = tRegex.exec(pContent)) !== null) {
        text += tMatch[1];
      }
      if (text.trim() !== '') {
        paras.push({ text: text.replace(/\t/g, '\t'), num: false });
      }
    }

    if (paras.length === 0) {
      return res.status(400).json({ error: 'No questions found in the document.' });
    }

    // Simple split: treat every non-empty paragraph as a question item (para mode)
    // For marker/separator/blank modes, a more complex parser would be needed;
    // here we return paragraphs as items so faculty can confirm/edit.
    const items = paras.map((p) => p.text);

    const ignored = 0;
    const used = mode;

    res.json({
      ok: true,
      items,
      ignored,
      mode: used,
      file: req.file.originalname,
      note: items.length > 200 ? 'Only the first 200 questions are shown.' : '',
    });
  } catch (err) {
    console.error('POST /questions/import-docx error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Import .docx: save confirmed questions
// ------------------------------------------------------------------
router.post('/questions/import-docx/confirm', verifyFaculty, async (req, res) => {
  try {
    const { exam_id, questions } = req.body;
    if (!exam_id || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const exam = await query('SELECT status FROM exams WHERE id = $1 AND faculty_id = $2', [exam_id, req.faculty.id]);
    if (exam.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    if (exam.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Questions can only be changed before the exam starts' });
    }

    await query('BEGIN');
    try {
      await query('SELECT id FROM exams WHERE id = $1 FOR UPDATE', [exam_id]);
      const max = await query('SELECT COALESCE(MAX(q_no), 0) AS max_qno FROM questions WHERE exam_id = $1', [exam_id]);
      let nextQno = parseInt(max.rows[0].max_qno, 10);

      let added = 0;
      for (const row of questions) {
        if (!row || !row.keep) continue;
        const b = String(row.body || '').trim();
        if (b === '' || b.length > 20000) continue;
        if (added >= 200) break;
        nextQno++;
        await query(
          'INSERT INTO questions (exam_id, q_no, body) VALUES ($1, $2, $3)',
          [exam_id, nextQno, b]
        );
        added++;
      }
      await query('COMMIT');
      res.json({ ok: true, message: added ? `${added} question(s) added from the Word file.` : 'No questions were selected.' });
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('POST /questions/import-docx/confirm error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Add question manually (draft only)
// ------------------------------------------------------------------
router.post('/questions', verifyFaculty, async (req, res) => {
  try {
    const { exam_id, body } = req.body;
    if (!exam_id || !body || body.trim() === '') {
      return res.status(400).json({ error: 'Exam ID and question body are required' });
    }
    if (body.trim().length > 20000) {
      return res.status(400).json({ error: 'Question too long (max 20000 chars)' });
    }

    // Verify ownership & draft
    const exam = await query('SELECT status FROM exams WHERE id = $1 AND faculty_id = $2', [exam_id, req.faculty.id]);
    if (exam.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    if (exam.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Questions can only be changed before the exam starts' });
    }

    // Compute next q_no with row lock to prevent race conditions
    await query('BEGIN');
    try {
      await query('SELECT id FROM exams WHERE id = $1 FOR UPDATE', [exam_id]);
      const max = await query('SELECT COALESCE(MAX(q_no), 0) AS max_qno FROM questions WHERE exam_id = $1', [exam_id]);
      const nextQno = parseInt(max.rows[0].max_qno, 10) + 1;

      const { rows } = await query(
        'INSERT INTO questions (exam_id, q_no, body) VALUES ($1, $2, $3) RETURNING *',
        [exam_id, nextQno, body.trim()]
      );
      await query('COMMIT');
      res.json({ ok: true, question: rows[0] });
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('POST /questions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Update question (draft only)
// ------------------------------------------------------------------
router.put('/questions/:qId', verifyFaculty, async (req, res) => {
  try {
    const { qId } = req.params;
    const { body } = req.body;
    if (!body || body.trim() === '') {
      return res.status(400).json({ error: 'Question body is required' });
    }
    if (body.trim().length > 20000) {
      return res.status(400).json({ error: 'Question too long (max 20000 chars)' });
    }

    const { rows } = await query(
      `UPDATE questions q
       SET body = $1
       FROM exams e
       WHERE q.id = $2 AND q.exam_id = e.id AND e.faculty_id = $3 AND e.status = 'draft'
       RETURNING q.*`,
      [body.trim(), qId, req.faculty.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Question not found or exam not in draft' });
    }
    res.json({ ok: true, question: rows[0] });
  } catch (err) {
    console.error('PUT /questions/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Delete question (draft only)
// ------------------------------------------------------------------
router.delete('/questions/:qId', verifyFaculty, async (req, res) => {
  try {
    const { qId } = req.params;

    await query('BEGIN');
    try {
      await query(
        `DELETE FROM questions q
         USING exams e
         WHERE q.id = $1 AND q.exam_id = e.id AND e.faculty_id = $2 AND e.status = 'draft'`,
        [qId, req.faculty.id]
      );

      // Renumber remaining questions 1..n
      const { rows } = await query(
        'SELECT id FROM questions WHERE exam_id = (SELECT exam_id FROM questions WHERE id = $1) ORDER BY q_no',
        [qId]
      );
      let i = 1;
      for (const row of rows) {
        await query('UPDATE questions SET q_no = $1 WHERE id = $2', [i++, row.id]);
      }
      await query('COMMIT');
      res.json({ ok: true, message: 'Question deleted' });
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('DELETE /questions/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Add student manually
// ------------------------------------------------------------------
router.post('/students', verifyFaculty, async (req, res) => {
  try {
    const { username, name } = req.body;
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (!/^[A-Za-z0-9._@-]{1,50}$/.test(username)) {
      return res.status(400).json({ error: 'Username may contain only letters, numbers and . _ - @ (max 50)' });
    }

    const fullName = (name || '').trim() || username;
    if (fullName.length > 100) {
      return res.status(400).json({ error: 'Name too long (max 100 chars)' });
    }

    const passwordHash = await bcrypt.hash(username, 8); // same as original PHP cost 8

    try {
      const { rows } = await query(
        `INSERT INTO profiles (username, name, password_hash, role)
         VALUES ($1, $2, $3, 'student')
         RETURNING id, username, name`,
        [username.trim(), fullName, passwordHash]
      );
      res.json({
        ok: true,
        message: `Student ${username.trim()} created. Password is the same as the username.`,
        student: rows[0],
      });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'That username already exists' });
      }
      throw err;
    }
  } catch (err) {
    console.error('POST /students error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Import students from .xlsx or .csv (multer)
// ------------------------------------------------------------------
router.post('/students/import', verifyFaculty, uploadStudent.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a file to upload' });
    }

    const ext = req.file.originalname.toLowerCase().split('.').pop();
    let rows;

    if (ext === 'xlsx') {
      rows = parseXlsx(req.file.buffer);
    } else if (ext === 'csv') {
      rows = parseCsv(req.file.buffer);
    } else {
      return res.status(400).json({ error: 'Only .xlsx or .csv files are allowed' });
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'No students found in file' });
    }

    // Skip header row
    let dataRows = rows;
    const h0 = (dataRows[0] && dataRows[0][0]) ? String(dataRows[0][0]).trim() : '';
    if (/^(user\s*name|user|roll(\s*(no\.?|number))?|reg(\.|istration)?(\s*(no\.?|number))?|id)$/i.test(h0)) {
      dataRows = dataRows.slice(1);
    }

    const items = [];
    for (const r of dataRows) {
      const u = String(r[0] || '').trim();
      const n = String(r[1] || '').trim();
      if (u) items.push([u, n]);
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'No students found. Column A = username, Column B = full name' });
    }
    if (items.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 students per file' });
    }

    let ok = 0;
    const skipped = [];
    await query('BEGIN');
    try {
      for (const [u, n] of items) {
        if (!/^[A-Za-z0-9._@-]{1,50}$/.test(u)) { skipped.push(u); continue; }
        const fullName = n || u;
        const hash = await bcrypt.hash(u, 8);
        try {
          await query(
            `INSERT INTO profiles (username, name, password_hash, role) VALUES ($1, $2, $3, 'student')`,
            [u, fullName, hash]
          );
          ok++;
        } catch (err) {
          if (err.code === '23505') skipped.push(u);
          else throw err;
        }
      }
      await query('COMMIT');
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

    let message = `Imported ${ok} student(s). Each password is the same as the username.`;
    if (skipped.length) {
      message += ` Skipped ${skipped.length} (already exist or invalid): ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '...' : ''}`;
    }
    res.json({ ok: true, message, imported: ok, skipped: skipped.length });
  } catch (err) {
    console.error('POST /students/import error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Reset student password to username
// ------------------------------------------------------------------
router.post('/students/:id/reset', verifyFaculty, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      'SELECT username FROM profiles WHERE id = $1 AND role = $2',
      [id, 'student']
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Student not found' });

    const username = rows[0].username;
    const hash = await bcrypt.hash(username, 8);
    await query('UPDATE profiles SET password_hash = $1 WHERE id = $2', [hash, id]);
    res.json({ ok: true, message: `Password of ${username} reset to the username` });
  } catch (err) {
    console.error('POST /students/:id/reset error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Delete student
// ------------------------------------------------------------------
router.delete('/students/:id', verifyFaculty, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM profiles WHERE id = $1 AND role = $2', [id, 'student']);
    res.json({ ok: true, message: 'Student deleted' });
  } catch (err) {
    console.error('DELETE /students/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// List students
// ------------------------------------------------------------------
router.get('/students', verifyFaculty, async (req, res) => {
  try {
    const { q } = req.query;
    let text, params;
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
      text = `SELECT id, username, name FROM profiles WHERE role = $1 AND (username ILIKE $2 OR name ILIKE $3) ORDER BY username LIMIT 300`;
      params = ['student', like, like];
    } else {
      text = `SELECT id, username, name FROM profiles WHERE role = $1 ORDER BY username LIMIT 300`;
      params = ['student'];
    }
    const { rows } = await query(text, params);
    res.json({ students: rows });
  } catch (err) {
    console.error('GET /students error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Faculty action: start / end / lock / unlock
// ------------------------------------------------------------------
router.post('/action', verifyFaculty, async (req, res) => {
  try {
    const { exam_id, action, sid } = req.body;
    if (!exam_id || !action) {
      return res.status(400).json({ error: 'exam_id and action are required' });
    }

    // Verify ownership
    const exam = await query('SELECT id FROM exams WHERE id = $1 AND faculty_id = $2', [exam_id, req.faculty.id]);
    if (exam.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });

    if (action === 'start') {
      const qcount = await query('SELECT COUNT(*) FROM questions WHERE exam_id = $1', [exam_id]);
      if (parseInt(qcount.rows[0].count, 10) === 0) {
        return res.status(400).json({ error: 'Add at least one question first' });
      }
      await query(
        `UPDATE exams SET status = 'live', started_at = now() WHERE id = $1 AND status = 'draft'`,
        [exam_id]
      );
    } else if (action === 'end') {
      await query(
        `UPDATE exams SET status = 'ended' WHERE id = $1 AND status = 'live'`,
        [exam_id]
      );
    } else if (action === 'lock' || action === 'unlock') {
      if (!sid) return res.status(400).json({ error: 'sid is required' });
      const lock = action === 'lock';
      await query(
        `UPDATE exam_sessions SET locked = $1 WHERE id = $2 AND exam_id = $3`,
        [lock, sid, exam_id]
      );
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /action error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Live monitor state
// ------------------------------------------------------------------
router.get('/state', verifyFaculty, async (req, res) => {
  try {
    const { exam_id } = req.query;
    if (!exam_id) return res.status(400).json({ error: 'exam_id is required' });

    const exam = await query(
      'SELECT *, EXTRACT(EPOCH FROM (started_at AT TIME ZONE \'UTC\')) as started_at_epoch FROM exams WHERE id = $1 AND faculty_id = $2',
      [exam_id, req.faculty.id]
    );
    if (exam.rows.length === 0) return res.status(404).json({ error: 'Exam not found' });

    const e = exam.rows[0];
    let status = e.status;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const startedEpoch = e.started_at_epoch ? parseInt(e.started_at_epoch, 10) : null;

    if (status === 'live' && startedEpoch != null && nowEpoch - startedEpoch >= e.duration_min * 60) {
      await query('UPDATE exams SET status = $1 WHERE id = $2 AND status = $3', ['ended', e.id, 'live']);
      status = 'ended';
    }

    const totalQ = await query('SELECT COUNT(*) FROM questions WHERE exam_id = $1', [exam_id]);
    const total = parseInt(totalQ.rows[0].count, 10);

    const ONLINE_SEC = 11; // (3+3)*2+5 from original
    const rows = await query(
      `SELECT s.id AS sid, p.username, p.name, s.login_order, s.login_time, s.violations, s.locked,
              q.q_no AS position,
              (EXTRACT(EPOCH FROM (now() - s.last_seen)) < $2) AS online,
              (SELECT reason FROM violation_log v WHERE v.session_id = s.id ORDER BY v.id DESC LIMIT 1) AS last_reason
       FROM exam_sessions s
       JOIN profiles p ON p.id = s.user_id
       LEFT JOIN questions q ON q.id = s.q_id
       WHERE s.exam_id = $1
       ORDER BY s.login_order`,
      [exam_id, ONLINE_SEC]
    );

    const students = rows.rows.map(r => ({
      sid: r.sid,
      username: r.username,
      name: r.name,
      login_order: r.login_order,
      login_time: r.login_time,
      violations: parseInt(r.violations, 10),
      locked: !!r.locked,
      position: r.position != null ? parseInt(r.position, 10) : 0,
      online: !!r.online,
      last_reason: r.last_reason || '',
    }));

    res.json({
      exam: {
        status,
        total_q: total,
        seconds_left: status === 'live' ? Math.max(0, e.duration_min * 60 - (nowEpoch - startedEpoch)) : null,
        max: parseInt(e.max_violations, 10),
      },
      students,
    });
  } catch (err) {
    console.error('GET /state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- helpers for file parsing ----------

function parseXlsx(buffer) {
  const JSZip = require('jszip');
  const zip = new JSZip();
  const shared = [];

  return zip.loadAsync(buffer).then((z) => {
      return z.file('xl/sharedStrings.xml')?.async('string').then((ss) => {
        // Simple shared string extraction
        const siRegex = /<si[^>]*>([\s\S]*?)<\/si>/g;
        let m;
        while ((m = siRegex.exec(ss)) !== null) {
          const t = m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/);
          shared.push(t ? t[1] : '');
        }
        return z;
      }).then((z) => {
        // Find first worksheet
        let sheetXml = null;
        for (let i = 1; i <= 50; i++) {
          const file = z.file(`xl/worksheets/sheet${i}.xml`);
          if (file) { sheetXml = file; break; }
        }
        if (!sheetXml) return [];
        return sheetXml.async('string');
      }).then((xml) => {
        if (!xml) return [];
        const rows = [];
        const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(xml)) !== null) {
          const rowContent = rowMatch[1];
          const cells = [];
          const cRegex = /<c[^>]*r="([A-Z]+[0-9]+)"[^>]*t="([^"]*)"[^>]*>([\s\S]*?)<\/c>|<c[^>]*r="([A-Z]+[0-9]+)"[^>]*>([\s\S]*?)<\/c>/g;
          let cMatch;
          while ((cMatch = cRegex.exec(rowContent)) !== null) {
            const colLetters = cMatch[1] || cMatch[4];
            let t = cMatch[2] === 's' ? shared[parseInt(cMatch[3].match(/<v>([\s\S]*?)<\/v>/)?.[1] || '0', 10) || ''] : '';
            if (!t) t = cMatch[5].match(/<v>([\s\S]*?)<\/v>/)?.[1] || '';
            cells.push(String(t));
          }
          rows.push(cells);
        }
        return rows;
      });
    }).catch((err) => {
      return Promise.resolve([]);
    });
}

function parseCsv(buffer) {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  const delim = lines[0].includes(';') ? ';' : ',';
  return lines.map((line) => line.split(delim).map((c) => c.trim()));
}

module.exports = router;
