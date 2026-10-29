const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const { verifyStudentJwt, verifyStudentSession } = require('../middleware/auth');

const router = express.Router();

// ------------------------------------------------------------------
// Student dashboard state (polling every 3s)
// Uses the exam session token returned by /enter.
// ------------------------------------------------------------------
router.get('/dashboard-state', verifyStudentSession, async (req, res) => {
  try {
    const s = req.student;
    let status = s.status;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const startedEpoch = s.started_at_epoch ? parseInt(s.started_at_epoch, 10) : null;

    if (status === 'live' && startedEpoch != null && nowEpoch - startedEpoch >= s.duration_min * 60) {
      await query('UPDATE exams SET status = $1 WHERE id = $2 AND status = $3', ['ended', s.exam_id, 'live']);
      status = 'ended';
    }

    res.json({
      status,
      title: s.title,
      locked: !!s.locked,
      violations: parseInt(s.violations, 10),
      max: parseInt(s.max_violations, 10),
      seconds_left: status === 'live' ? Math.max(0, s.duration_min * 60 - (nowEpoch - startedEpoch)) : null,
    });
  } catch (err) {
    console.error('GET /dashboard-state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Enter exam: provide exam_code + student JWT (from /auth/student/login).
// Assigns one question (least-used first, random tie-break).
// Creates the exam_sessions row and returns a session token.
// ------------------------------------------------------------------
router.post('/enter', verifyStudentJwt, async (req, res) => {
  try {
    const { exam_code } = req.body;
    if (!exam_code) {
      return res.status(400).json({ error: 'Exam code is required' });
    }

    const s = req.student;
    const code = String(exam_code).toUpperCase().trim();

    await query('BEGIN');
    try {
      // Lock exam row to prevent concurrent start/end changes
      const examRows = await query('SELECT * FROM exams WHERE code = $1 AND status <> $2 FOR UPDATE', [code, 'ended']);
      if (examRows.rows.length === 0) {
        await query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid exam code, or the exam has ended' });
      }
      const exam = examRows.rows[0];

      // Check existing session for this student + exam
      const existing = await query(
        'SELECT id, token, q_id FROM exam_sessions WHERE exam_id = $1 AND user_id = $2',
        [exam.id, s.userId]
      );

      let sessionId;
      let token = crypto.randomBytes(16).toString('hex');
      let notice = null;

      if (existing.rows.length > 0) {
        // Re-login: rotate token (kicks out older browser)
        sessionId = existing.rows[0].id;
        token = crypto.randomBytes(16).toString('hex');
        await query('UPDATE exam_sessions SET token = $1, last_seen = now() WHERE id = $2', [token, sessionId]);
      } else {
        const orderRow = await query('SELECT COALESCE(MAX(login_order), 0) AS mx FROM exam_sessions WHERE exam_id = $1', [exam.id]);
        const order = parseInt(orderRow.rows[0].mx, 10) + 1;
        const ins = await query(
          `INSERT INTO exam_sessions (exam_id, user_id, login_order, login_time, token, last_seen)
           VALUES ($1, $2, $3, now(), $4, now()) RETURNING id`,
          [exam.id, s.userId, order, token]
        );
        sessionId = ins.rows[0].id;
      }

      const nowEpoch = Math.floor(Date.now() / 1000);
      const startedEpoch = exam.started_at ? Math.floor(new Date(exam.started_at).getTime() / 1000) : null;
      const elapsed = startedEpoch != null ? nowEpoch - startedEpoch : 0;

      let qId = null;
      let qNo = 0;

      if (exam.status === 'live' && elapsed < exam.duration_min * 60) {
        // Re-check assignment inside transaction
        const cur = await query('SELECT q_id FROM exam_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
        const assigned = cur.rows[0];
        if (!assigned.q_id) {
          const qs = await query(
            `SELECT q.id, COUNT(es.id) AS c
             FROM questions q
             LEFT JOIN exam_sessions es ON es.q_id = q.id AND es.exam_id = $1
             WHERE q.exam_id = $1
             GROUP BY q.id`,
            [exam.id]
          );
          if (qs.rows.length > 0) {
            const counts = qs.rows.map((r) => parseInt(r.c, 10));
            const min = Math.min(...counts);
            const pool = qs.rows.filter((r) => parseInt(r.c, 10) === min).map((r) => parseInt(r.id, 10));
            const pick = pool[Math.floor(Math.random() * pool.length)];
            await query(
              'UPDATE exam_sessions SET q_id = $1, entered_at = now() WHERE id = $2 AND q_id IS NULL',
              [pick, sessionId]
            );
            qId = pick;
            const qrow = await query('SELECT q_no FROM questions WHERE id = $1', [pick]);
            qNo = qrow.rows.length > 0 ? parseInt(qrow.rows[0].q_no, 10) : 0;
          } else {
            notice = 'No questions have been set for this exam. Please inform the faculty.';
          }
        } else {
          qId = parseInt(assigned.q_id, 10);
          const qrow = await query('SELECT q_no FROM questions WHERE id = $1', [qId]);
          qNo = qrow.rows.length > 0 ? parseInt(qrow.rows[0].q_no, 10) : 0;
        }
      }

      await query('COMMIT');

      const out = {
        status: exam.status === 'live' && elapsed >= exam.duration_min * 60 ? 'ended' : exam.status,
        title: exam.title,
        locked: false,
        violations: 0,
        max: parseInt(exam.max_violations, 10),
        seconds_left: exam.status === 'live' ? Math.max(0, exam.duration_min * 60 - elapsed) : null,
        entered: !!qId,
        session_token: token,
      };
      if (qId) out.position = qNo;
      if (notice) out.notice = notice;

      res.json(out);
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('POST /enter error:', err);
    res.status(500).json({ error: 'Could not assign a question, please click again.' });
  }
});

// ------------------------------------------------------------------
// Student exam state (polling every 3s)
// Uses the exam session token returned by /enter.
// ------------------------------------------------------------------
router.get('/state', verifyStudentSession, async (req, res) => {
  try {
    const s = req.student;
    let status = s.status;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const startedEpoch = s.started_at_epoch ? parseInt(s.started_at_epoch, 10) : null;

    if (status === 'live' && startedEpoch != null && nowEpoch - startedEpoch >= s.duration_min * 60) {
      await query('UPDATE exams SET status = $1 WHERE id = $2 AND status = $3', ['ended', s.exam_id, 'live']);
      status = 'ended';
    }

    const out = {
      status,
      title: s.title,
      locked: !!s.locked,
      violations: parseInt(s.violations, 10),
      max: parseInt(s.max_violations, 10),
      seconds_left: status === 'live' ? Math.max(0, s.duration_min * 60 - (nowEpoch - startedEpoch)) : null,
      entered: !!s.q_id,
    };

    if (status === 'live' && !s.locked && s.q_id) {
      const q = await query('SELECT q_no, body FROM questions WHERE id = $1 AND exam_id = $2', [s.q_id, s.exam_id]);
      if (q.rows.length > 0) {
        out.position = parseInt(q.rows[0].q_no, 10);
        out.question = q.rows[0].body;
      } else {
        out.question = 'Question not found. Please inform the faculty.';
      }
    }

    // Update last_seen so the monitor shows the student as online
    await query('UPDATE exam_sessions SET last_seen = now() WHERE id = $1', [s.id]);

    res.json(out);
  } catch (err) {
    console.error('GET /state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Record violation (tab switch, blur, fullscreen exit, blocked key)
// Uses the exam session token returned by /enter.
// ------------------------------------------------------------------
router.post('/violation', verifyStudentSession, async (req, res) => {
  try {
    const s = req.student;
    const reason = String(req.body.reason || 'Unknown').substring(0, 100);

    const nowEpoch = Math.floor(Date.now() / 1000);
    const startedEpoch = s.started_at_epoch ? parseInt(s.started_at_epoch, 10) : null;

    if (s.status === 'live' && !s.locked && s.q_id && startedEpoch != null && nowEpoch - startedEpoch < s.duration_min * 60) {
      await query('BEGIN');
      try {
        const latest = await query(
          'SELECT violations, locked FROM exam_sessions WHERE id = $1 FOR UPDATE',
          [s.id]
        );
        const cur = latest.rows[0];
        const newViolations = parseInt(cur.violations, 10) + 1;
        const newLocked = newViolations >= parseInt(s.max_violations, 10) ? 1 : cur.locked;

        await query(
          'UPDATE exam_sessions SET violations = $1, locked = $2 WHERE id = $3',
          [newViolations, newLocked, s.id]
        );
        await query('INSERT INTO violation_log (session_id, reason) VALUES ($1, $2)', [s.id, reason]);
        await query('COMMIT');
      } catch (err) {
        await query('ROLLBACK');
        throw err;
      }
    }

    // Return updated state
    const updated = await query(
      `SELECT s.locked, s.violations,
              e.status, e.title, e.duration_min, e.max_violations,
              EXTRACT(EPOCH FROM (e.started_at AT TIME ZONE 'UTC')) as started_at_epoch
       FROM exam_sessions s JOIN exams e ON e.id = s.exam_id
       WHERE s.id = $1`,
      [s.id]
    );
    const us = updated.rows[0];
    let ustatus = us.status;
    const nowE = Math.floor(Date.now() / 1000);
    const startE = us.started_at_epoch ? parseInt(us.started_at_epoch, 10) : null;
    if (ustatus === 'live' && startE != null && nowE - startE >= us.duration_min * 60) {
      await query('UPDATE exams SET status = $1 WHERE id = $2 AND status = $3', ['ended', s.exam_id, 'live']);
      ustatus = 'ended';
    }

    res.json({
      status: ustatus,
      title: us.title,
      locked: !!us.locked,
      violations: parseInt(us.violations, 10),
      max: parseInt(us.max_violations, 10),
      seconds_left: ustatus === 'live' ? Math.max(0, us.duration_min * 60 - (nowE - startE)) : null,
    });
  } catch (err) {
    console.error('POST /violation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
