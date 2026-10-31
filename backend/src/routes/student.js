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

  let attempt = 0;
  while (attempt < MAX_ENTER_RETRIES) {
    attempt++;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Verify exam existence and active state without taking an exclusive row lock
      const examRes = await client.query(
        'SELECT id, title, code, status, duration_min, max_violations, questions_per_student FROM exams WHERE code = $1 AND status <> $2',
        [code, 'ended']
      );
      if (examRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid exam code, or the exam has ended' });
      }
      const exam = examRes.rows[0];

      // 2. Transaction-scoped advisory lock on exam.id
      // Serializes concurrent entries for the SAME exam (prevents login_order race & FK deadlock)
      // Released automatically on COMMIT or ROLLBACK; different exams stay 100% parallel.
      await client.query('SELECT pg_advisory_xact_lock($1)', [exam.id]);

      // 3. Idempotently look up existing session for (exam_id, user_id)
      const existingRes = await client.query(
        `SELECT id, token, login_order, q_id, assigned_q_ids, locked, violations, entered_at,
                EXTRACT(EPOCH FROM entered_at) as entered_at_epoch
         FROM exam_sessions WHERE exam_id = $1 AND user_id = $2`,
        [exam.id, s.userId]
      );

      let sessionRow;
      let token;
      if (existingRes.rows.length > 0) {
        sessionRow = existingRes.rows[0];
        token = sessionRow.token || crypto.randomBytes(16).toString('hex');
        await client.query('UPDATE exam_sessions SET token = $1, last_seen = now() WHERE id = $2', [token, sessionRow.id]);
      } else {
        token = crypto.randomBytes(16).toString('hex');
        // Compute login_order atomically inside the serialized advisory lock
        const insRes = await client.query(
          `INSERT INTO exam_sessions (exam_id, user_id, login_order, login_time, token, last_seen)
           VALUES (
             $1,
             $2,
             (SELECT COALESCE(MAX(login_order), 0) + 1 FROM exam_sessions WHERE exam_id = $1),
             now(),
             $3,
             now()
           )
           RETURNING id, token, login_order, q_id, assigned_q_ids, locked, violations, entered_at,
                     EXTRACT(EPOCH FROM entered_at) as entered_at_epoch`,
          [exam.id, s.userId, token]
        );
        if (!insRes.rows || insRes.rows.length === 0) {
          throw new Error('Failed to create exam session row');
        }
        sessionRow = insRes.rows[0];
      }

      // Safe guard: verify sessionRow is populated
      if (!sessionRow) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: 'Failed to retrieve exam session' });
      }

      const nowEpoch = Math.floor(Date.now() / 1000);
      let enteredEpoch = sessionRow.entered_at_epoch ? parseInt(sessionRow.entered_at_epoch, 10) : null;

      // Start exam condition:
      // If student is logging in (start_exam === false), do not start timer yet.
      // If student clicked "Start Exam" (start_exam === true) or start_exam was omitted (e.g. tests), start exam.
      const shouldStart = start_exam !== false && (start_exam === true || start_exam === undefined || enteredEpoch != null);

      if (shouldStart && enteredEpoch == null) {
        const stampRes = await client.query(
          `UPDATE exam_sessions SET entered_at = now() WHERE id = $1
           RETURNING EXTRACT(EPOCH FROM entered_at) as entered_at_epoch`,
          [sessionRow.id]
        );
        enteredEpoch = stampRes.rows[0]?.entered_at_epoch ? parseInt(stampRes.rows[0].entered_at_epoch, 10) : nowEpoch;
        sessionRow.entered_at_epoch = enteredEpoch;
      }

      const elapsed = enteredEpoch != null ? nowEpoch - enteredEpoch : 0;
      let qId = sessionRow.q_id ? parseInt(sessionRow.q_id, 10) : null;
      let qNo = 0;
      let assignedQuestionsList = [];
      let notice = null;

      const numQuestions = Math.max(1, parseInt(exam.questions_per_student, 10) || 1);
      let hasAssigned = !!qId || (Array.isArray(sessionRow.assigned_q_ids) && sessionRow.assigned_q_ids.length > 0);

      if (exam.status === 'live' && shouldStart && elapsed < exam.duration_min * 60) {
        if (!hasAssigned) {
          const qs = await client.query(
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

            await client.query(
              'UPDATE exam_sessions SET q_id = $1, assigned_q_ids = $2 WHERE id = $3',
              [firstPick, pickIds, sessionRow.id]
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
          const assignedIds = Array.isArray(sessionRow.assigned_q_ids) && sessionRow.assigned_q_ids.length > 0
            ? sessionRow.assigned_q_ids
            : [qId];

          const qrows = await client.query(
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

      await client.query('COMMIT');

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
        violations: parseInt(sessionRow.violations || 0, 10),
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

      const durationMs = Date.now() - startTime;
      if (durationMs > 1000) {
        console.warn(`[SLOW POST /enter] code=${code} duration=${durationMs}ms attempts=${attempt}`);
      }

      return res.json(out);
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      const pgCode = err.code;
      if (RETRY_CODES.has(pgCode) && attempt < MAX_ENTER_RETRIES) {
        const backoffMs = 50 + Math.floor(Math.random() * 100);
        console.warn(`[RETRY POST /enter] code=${code} pgError=${pgCode} attempt=${attempt}/${MAX_ENTER_RETRIES} backoff=${backoffMs}ms`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      console.error('POST /enter fatal error:', err);
      return res.status(500).json({ error: 'Could not assign a question, please click again.' });
    } finally {
      client.release();
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
