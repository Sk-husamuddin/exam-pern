const jwt = require('jsonwebtoken');
const { query } = require('../db');
const config = require('../config');

// ------------------------------------------------------------------
// Verify Supabase JWT issued for faculty (Authorization: Bearer <token>)
// ------------------------------------------------------------------
async function verifyFaculty(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      decoded = jwt.verify(token, config.SUPABASE_JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired faculty token' });
    }

    const authUserId = decoded.sub;
    if (!authUserId) {
      return res.status(401).json({ error: 'Token missing subject' });
    }

    const { rows } = await query(
      'SELECT id, username, name, role FROM profiles WHERE auth_user_id = $1 AND role = $2',
      [authUserId, 'faculty']
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: 'Faculty profile not found' });
    }

    req.faculty = rows[0];
    next();
  } catch (err) {
    console.error('verifyFaculty error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ------------------------------------------------------------------
// Verify custom student JWT issued at /auth/student/login.
// This identifies the student BEFORE an exam_sessions row exists.
// Used by: POST /api/student/enter
// ------------------------------------------------------------------
async function verifyStudentJwt(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.body.token;

    if (!token) {
      return res.status(401).json({ error: 'Missing student JWT' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.STUDENT_JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired student token' });
    }

    const { rows } = await query(
      'SELECT id, username, name, role FROM profiles WHERE id = $1 AND role = $2',
      [decoded.userId, 'student']
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: 'Student profile not found' });
    }

    req.student = { ...rows[0], userId: rows[0].id };
    next();
  } catch (err) {
    console.error('verifyStudentJwt error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ------------------------------------------------------------------
// Verify custom student session token (stored in exam_sessions.token).
// Returned by POST /api/student/enter.
// Used by: GET /api/student/state, POST /api/student/violation
// ------------------------------------------------------------------
async function verifyStudentSession(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.body.token;

    if (!token) {
      return res.status(401).json({ error: 'Missing student session token' });
    }

    const { rows } = await query(
      `SELECT s.*, p.username, p.name, e.title, e.code, e.status, e.duration_min, e.max_violations,
              EXTRACT(EPOCH FROM (e.started_at AT TIME ZONE 'UTC')) as started_at_epoch
       FROM exam_sessions s
       JOIN profiles p ON p.id = s.user_id
       JOIN exams e ON e.id = s.exam_id
       WHERE s.token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(401).json({ status: 'kicked' });
    }

    req.student = rows[0];
    next();
  } catch (err) {
    console.error('verifyStudentSession error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { verifyFaculty, verifyStudentJwt, verifyStudentSession };
