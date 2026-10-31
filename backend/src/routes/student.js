const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
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
// Creates the exam_sessions row and returns a session token.
// ------------------------------------------------------------------
router.post('/enter', verifyStudentJwtOrSession, async (req, res) => {
  try {
    const { exam_code, start_exam } = req.body;
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
        'SELECT id, token, q_id, assigned_q_ids, entered_at FROM exam_sessions WHERE exam_id = $1 AND user_id = $2',
        [exam.id, s.userId]
      );

      let sessionId;
      let token;
      let notice = null;

      if (existing.rows.length > 0) {
        sessionId = existing.rows[0].id;
        token = existing.rows[0].token || crypto.randomBytes(16).toString('hex');
        await query('UPDATE exam_sessions SET token = $1, last_seen = now() WHERE id = $2', [token, sessionId]);
      } else {
        token = crypto.randomBytes(16).toString('hex');
        const orderRow = await query('SELECT COALESCE(MAX(login_order), 0) AS mx FROM exam_sessions WHERE exam_id = $1', [exam.id]);
        const order = parseInt(orderRow.rows[0].mx, 10) + 1;
        const ins = await query(
          `INSERT INTO exam_sessions (exam_id, user_id, login_order, login_time, token, last_seen)
           VALUES ($1, $2, $3, now(), $4, now()) RETURNING id`,
          [exam.id, s.userId, order, token]
        );
        sessionId = ins.rows[0].id;
      }

      const curSession = (await query(
        `SELECT id, q_id, assigned_q_ids, entered_at,
                EXTRACT(EPOCH FROM entered_at) as entered_at_epoch
         FROM exam_sessions WHERE id = $1 FOR UPDATE`,
        [sessionId]
      )).rows[0];

      const nowEpoch = Math.floor(Date.now() / 1000);
      let enteredEpoch = curSession.entered_at_epoch ? parseInt(curSession.entered_at_epoch, 10) : null;

      // Start exam condition:
      // If student is logging in (start_exam === false), do not start yet.
      // If student clicked "Start Exam" (start_exam === true) or start_exam was not passed (e.g. e2e API test), start exam.
      const shouldStart = start_exam !== false && (start_exam === true || start_exam === undefined || enteredEpoch != null);

      if (shouldStart && enteredEpoch == null) {
        await query('UPDATE exam_sessions SET entered_at = now() WHERE id = $1', [sessionId]);
        enteredEpoch = nowEpoch;
      }

      const elapsed = enteredEpoch != null ? nowEpoch - enteredEpoch : 0;
      let qId = null;
      let qNo = 0;
      let assignedQuestionsList = [];

      const numQuestions = Math.max(1, parseInt(exam.questions_per_student, 10) || 1);
      let hasAssigned = !!curSession.q_id || (Array.isArray(curSession.assigned_q_ids) && curSession.assigned_q_ids.length > 0);

      if (exam.status === 'live' && shouldStart && elapsed < exam.duration_min * 60) {
        if (!hasAssigned) {
          const qs = await query(
            `SELECT q.id, q.q_no, q.body,
                    COUNT(es.id) AS c
             FROM questions q
             LEFT JOIN exam_sessions es ON (es.q_id = q.id OR q.id = ANY(es.assigned_q_ids)) AND es.exam_id = $1
             WHERE q.exam_id = $1
             GROUP BY q.id, q.q_no, q.body
             ORDER BY c ASC, RANDOM()`,
            [exam.id]
          );

          if (qs.rows.length > 0) {
            const countToPick = Math.min(numQuestions, qs.rows.length);
            const picked = qs.rows.slice(0, countToPick);
            picked.sort((a, b) => parseInt(a.q_no, 10) - parseInt(b.q_no, 10));

            const pickIds = picked.map((q) => parseInt(q.id, 10));
            const firstPick = pickIds[0];

            await query(
              'UPDATE exam_sessions SET q_id = $1, assigned_q_ids = $2 WHERE id = $3',
              [firstPick, pickIds, sessionId]
            );

            qId = firstPick;
            qNo = parseInt(picked[0].q_no, 10);
            assignedQuestionsList = picked.map((q) => ({
              id: q.id,
              position: parseInt(q.q_no, 10),
              body: q.body,
            }));
            hasAssigned = true;
          } else {
            notice = 'No questions have been set for this exam. Please inform the faculty.';
          }
        } else {
          hasAssigned = true;
          const assignedIds = Array.isArray(curSession.assigned_q_ids) && curSession.assigned_q_ids.length > 0
            ? curSession.assigned_q_ids
            : [curSession.q_id];

          const qrows = await query(
            'SELECT id, q_no, body FROM questions WHERE id = ANY($1) AND exam_id = $2 ORDER BY q_no ASC',
            [assignedIds, exam.id]
          );

          if (qrows.rows.length > 0) {
            qId = parseInt(qrows.rows[0].id, 10);
            qNo = parseInt(qrows.rows[0].q_no, 10);
            assignedQuestionsList = qrows.rows.map((q) => ({
              id: q.id,
              position: parseInt(q.q_no, 10),
              body: q.body,
            }));
          }
        }
      }

      await query('COMMIT');

      // Fetch fresh session info for response
      const sess = await query('SELECT * FROM exam_sessions WHERE id = $1', [sessionId]);
      const sessionRow = sess.rows[0];

      let seconds_left = null;
      if (exam.status === 'live') {
        if (enteredEpoch == null) {
          seconds_left = exam.duration_min * 60;
        } else {
          seconds_left = Math.max(0, exam.duration_min * 60 - elapsed);
        }
      }

      const out = {
        status: exam.status === 'live' && enteredEpoch != null && elapsed >= exam.duration_min * 60 ? 'ended' : exam.status,
        title: exam.title,
        locked: !!sessionRow.locked,
        violations: parseInt(sessionRow.violations, 10),
        max: parseInt(exam.max_violations, 10),
        seconds_left,
        entered: (hasAssigned || Boolean(notice)) && enteredEpoch != null,
        session_token: token,
      };
      if (qId || assignedQuestionsList.length > 0) {
        out.position = qNo;
        if (assignedQuestionsList.length > 0) {
          out.questions = assignedQuestionsList;
          out.question = assignedQuestionsList.map((q) => `Question ${q.position}:\n${q.body}`).join('\n\n');
        }
      }
      if (notice) out.notice = notice;

      res.json(out);
      if (qId || assignedQuestionsList.length > 0) {
        out.position = qNo;
        if (assignedQuestionsList.length > 0) {
          out.questions = assignedQuestionsList;
          out.question = assignedQuestionsList.map((q) => `Question ${q.position}:\n${q.body}`).join('\n\n');
        }
      }
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
// ------------------------------------------------------------------
router.post('/violation', verifyStudentSession, async (req, res) => {
  try {
    const s = req.student;
    const reason = String(req.body.reason || 'Unknown').substring(0, 100);

    const nowEpoch = Math.floor(Date.now() / 1000);
    const enteredEpoch = s.entered_at_epoch ? parseInt(s.entered_at_epoch, 10) : null;

    const hasAssigned = !!s.q_id || (Array.isArray(s.assigned_q_ids) && s.assigned_q_ids.length > 0);
    if (s.status === 'live' && !s.locked && hasAssigned && enteredEpoch != null && nowEpoch - enteredEpoch < s.duration_min * 60) {
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

        // If the student left fullscreen, switched tabs, blurred, or got locked, immediately mark last_seen in the past
        if (newLocked === 1 || reason.includes('fullscreen') || reason.includes('Tab') || reason.includes('focus')) {
          await query("UPDATE exam_sessions SET last_seen = now() - interval '1 minute' WHERE id = $1", [s.id]);
        }

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
