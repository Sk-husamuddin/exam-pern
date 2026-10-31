const express = require('express');
const crypto = require('crypto');
const { query, pool } = require('../db');
const { verifyStudentJwt, verifyStudentSession, verifyStudentJwtOrSession } = require('../middleware/auth');

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
    const enteredEpoch = s.entered_at_epoch ? parseInt(s.entered_at_epoch, 10) : null;

    let seconds_left = null;
    if (status === 'live') {
      if (enteredEpoch == null) {
        seconds_left = s.duration_min * 60;
      } else {
        const elapsed = nowEpoch - enteredEpoch;
        seconds_left = Math.max(0, s.duration_min * 60 - elapsed);
        if (elapsed >= s.duration_min * 60) {
          status = 'ended';
        }
      }
    }

    res.json({
      status,
      title: s.title,
      locked: !!s.locked,
      violations: parseInt(s.violations, 10),
      max: parseInt(s.max_violations, 10),
      seconds_left,
      entered: enteredEpoch != null,
    });
  } catch (err) {
    console.error('GET /dashboard-state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Enter exam: provide exam_code + student JWT (from login) or session token.
// Assigns questions (least-used first, random tie-break).
// Serialized per-exam via pg_advisory_xact_lock on a dedicated client.
// Retries up to 3 times on transient lock/unique conflicts.
// ------------------------------------------------------------------
const RETRY_CODES = new Set(['40P01', '40001', '23505']);
const MAX_ENTER_RETRIES = 3;

router.post('/enter', verifyStudentJwtOrSession, async (req, res) => {
  const startTime = Date.now();
  const { exam_code, start_exam } = req.body;
  if (!exam_code) {
    return res.status(400).json({ error: 'Exam code is required' });
  }

  const s = req.student;
  const code = String(exam_code).toUpperCase().trim();
  const token = crypto.randomBytes(16).toString('hex');
  const wantsStart = start_exam !== false;

  let attempt = 0;
  while (attempt < MAX_ENTER_RETRIES) {
    attempt++;
    let client;
    try {
      client = await pool.connect();
      const r = await client.query(
        'SELECT * FROM fn_student_enter_exam($1, $2, $3, $4)',
        [code, s.userId, token, wantsStart]
      );

      if (!r.rows || r.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid exam code, or the exam has ended' });
      }

      const row = r.rows[0];
      const questions = Array.isArray(row.questions_json) ? row.questions_json : [];
      let position = 0;
      let questionText = null;

      if (questions.length > 0) {
        position = parseInt(questions[0].position, 10);
        questionText = questions.map((q) => `Question ${q.position}:\n${q.body}`).join('\n\n');
      }

      const out = {
        status: row.status,
        title: row.title,
        locked: !!row.locked,
        violations: parseInt(row.violations || 0, 10),
        max: parseInt(row.max_violations, 10),
        seconds_left: row.seconds_left,
        entered: !!row.entered,
        session_token: row.token,
      };

      if (position > 0 || questions.length > 0) {
        out.position = position;
        out.questions = questions;
        out.question = questionText;
      }

      const durationMs = Date.now() - startTime;
      if (durationMs > 1000) {
        console.warn(`[SLOW POST /enter] code=${code} duration=${durationMs}ms attempts=${attempt}`);
      }

      return res.json(out);
    } catch (err) {
      const pgCode = err.code;
      if (err.message && err.message.includes('INVALID_EXAM')) {
        return res.status(400).json({ error: 'Invalid exam code, or the exam has ended' });
      }
      if (RETRY_CODES.has(pgCode) && attempt < MAX_ENTER_RETRIES) {
        const backoffMs = 50 + Math.floor(Math.random() * 100);
        console.warn(`[RETRY POST /enter] code=${code} pgError=${pgCode} attempt=${attempt}/${MAX_ENTER_RETRIES} backoff=${backoffMs}ms`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      console.error('POST /enter fatal error:', err);
      return res.status(500).json({ error: 'Could not assign a question, please click again.' });
    } finally {
      if (client) client.release();
    }
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
    const enteredEpoch = s.entered_at_epoch ? parseInt(s.entered_at_epoch, 10) : null;

    let seconds_left = null;
    if (status === 'live') {
      if (enteredEpoch == null) {
        seconds_left = s.duration_min * 60;
      } else {
        const elapsed = nowEpoch - enteredEpoch;
        seconds_left = Math.max(0, s.duration_min * 60 - elapsed);
        if (elapsed >= s.duration_min * 60) {
          status = 'ended';
        }
      }
    }

    const assignedIds = Array.isArray(s.assigned_q_ids) && s.assigned_q_ids.length > 0
      ? s.assigned_q_ids
      : (s.q_id ? [s.q_id] : []);
    const hasAssigned = assignedIds.length > 0;

    const out = {
      status,
      title: s.title,
      locked: !!s.locked,
      violations: parseInt(s.violations, 10),
      max: parseInt(s.max_violations, 10),
      seconds_left,
      entered: hasAssigned && enteredEpoch != null,
    };

    if (status === 'live' && !s.locked && hasAssigned) {
      const qRows = await query(
        'SELECT id, q_no, body FROM questions WHERE id = ANY($1) AND exam_id = $2 ORDER BY q_no ASC',
        [assignedIds, s.exam_id]
      );
      if (qRows.rows.length > 0) {
        out.questions = qRows.rows.map((r) => ({
          id: r.id,
          position: parseInt(r.q_no, 10),
          body: r.body,
        }));
        out.position = out.questions[0].position;
        out.question = out.questions.map((q) => `Question ${q.position}:\n${q.body}`).join('\n\n');
      } else {
        out.question = 'Question not found. Please inform the faculty.';
      }
    }

    // Only update last_seen when the student is actively taking the exam (in fullscreen, tab visible, not locked)
    const isActive = req.query.active === '1' && !s.locked && hasAssigned && status === 'live';
    if (isActive) {
      await query('UPDATE exam_sessions SET last_seen = now() WHERE id = $1', [s.id]);
    }

    res.json(out);
  } catch (err) {
    console.error('GET /state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Explicit leave / offline signal (called on beforeunload, pagehide, blur, tab switch)
// ------------------------------------------------------------------
router.post('/leave', verifyStudentSession, async (req, res) => {
  try {
    await query("UPDATE exam_sessions SET last_seen = now() - interval '1 minute' WHERE id = $1", [req.student.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /leave error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Record violation (tab switch, blur, fullscreen exit, blocked key)
// Uses the exam session token returned by /enter.
// Single atomic UPDATE: increments violations, locks if threshold reached.
// ------------------------------------------------------------------
router.post('/violation', verifyStudentSession, async (req, res) => {
  try {
    const s = req.student;
    const reason = String(req.body.reason || 'Unknown').substring(0, 100);

    const nowEpoch = Math.floor(Date.now() / 1000);
    const enteredEpoch = s.entered_at_epoch ? parseInt(s.entered_at_epoch, 10) : null;
    const hasAssigned = !!s.q_id || (Array.isArray(s.assigned_q_ids) && s.assigned_q_ids.length > 0);
    const maxViolations = parseInt(s.max_violations, 10) || 3;
    const markPast = reason.includes('fullscreen') || reason.includes('Tab') || reason.includes('focus');

    let curViolations = parseInt(s.violations, 10) || 0;
    let curLocked = !!s.locked;

    if (s.status === 'live' && !s.locked && hasAssigned && enteredEpoch != null && nowEpoch - enteredEpoch < s.duration_min * 60) {
      const updRes = await query(
        `UPDATE exam_sessions
         SET violations = violations + 1,
             locked = CASE WHEN violations + 1 >= $2 THEN true ELSE locked END,
             last_seen = CASE WHEN violations + 1 >= $2 OR $3 = true THEN now() - interval '1 minute' ELSE last_seen END
         WHERE id = $1
         RETURNING violations, locked`,
        [s.id, maxViolations, markPast]
      );

      if (updRes.rows.length > 0) {
        curViolations = parseInt(updRes.rows[0].violations, 10);
        curLocked = !!updRes.rows[0].locked;
        // Non-blocking violation log insertion
        query('INSERT INTO violation_log (session_id, reason) VALUES ($1, $2)', [s.id, reason]).catch((e) =>
          console.warn('violation_log insert warning:', e.message)
        );
      }
    }

    let status = s.status;
    let seconds_left = null;
    if (status === 'live') {
      if (enteredEpoch != null) {
        const elapsed = nowEpoch - enteredEpoch;
        seconds_left = Math.max(0, s.duration_min * 60 - elapsed);
        if (elapsed >= s.duration_min * 60) {
          status = 'ended';
        }
      } else {
        seconds_left = s.duration_min * 60;
      }
    }

    return res.json({
      status,
      title: s.title,
      locked: curLocked,
      violations: curViolations,
      max: maxViolations,
      seconds_left,
    });
  } catch (err) {
    console.error('POST /violation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
