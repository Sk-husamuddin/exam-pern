const jwt = require('jsonwebtoken');
const { query } = require('../db');
const config = require('../config');

// ------------------------------------------------------------------
// In-memory cache for Supabase token validations (keyed by token hash).
// Avoids a network call to Supabase on every request. TTL ~60s.
// ------------------------------------------------------------------
const tokenCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function cacheGet(token) {
  const entry = tokenCache.get(token);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    tokenCache.delete(token);
    return null;
  }
  return entry.data;
}

function cacheSet(token, data) {
  tokenCache.set(token, { data, ts: Date.now() });
}

// ------------------------------------------------------------------
// Verify Supabase faculty token by calling Supabase /auth/v1/user.
// This is algorithm-agnostic (works with RS256/ECC P-256, not just HS256).
// Auto-provisions the profiles row if missing.
// ------------------------------------------------------------------
async function verifyFaculty(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.substring(7);

    // Check cache first
    let supabaseUser = cacheGet(token);
    if (!supabaseUser) {
      try {
        const supabaseRes = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
          headers: {
            apikey: config.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        });
        if (!supabaseRes.ok) {
          let msg = 'Invalid or expired faculty token';
          if (supabaseRes.status === 401) msg = 'Invalid or expired faculty token';
          if (supabaseRes.status === 403) msg = 'Forbidden faculty token';
          return res.status(401).json({ error: msg });
        }
        supabaseUser = await supabaseRes.json();
        cacheSet(token, supabaseUser);
      } catch (fetchErr) {
        console.error('Supabase /auth/v1/user fetch error:', fetchErr.message);
        return res.status(401).json({ error: 'Unable to verify faculty token' });
      }
    }

    const authUserId = supabaseUser.id;
    if (!authUserId) {
      return res.status(401).json({ error: 'Token missing subject' });
    }

    // Auto-provision profile if missing (ON CONFLICT DO NOTHING)
    const email = supabaseUser.email || '';
    const usernameBase = email.split('@')[0] || 'user';
    let username = usernameBase;

    const { rows: existing } = await query(
      'SELECT id, username, name, role FROM profiles WHERE auth_user_id = $1 AND role = $2',
      [authUserId, 'faculty']
    );

    if (existing.length === 0) {
      // Ensure username uniqueness with numeric suffix
      let suffix = 0;
      let tryUsername = username;
      while (true) {
        const { rows: dup } = await query('SELECT 1 FROM profiles WHERE username = $1', [tryUsername]);
        if (dup.length === 0) break;
        suffix++;
        tryUsername = `${usernameBase}${suffix}`;
      }
      username = tryUsername;

      const { rows: inserted } = await query(
        `INSERT INTO profiles (auth_user_id, username, name, role)
         VALUES ($1, $2, $3, 'faculty')
         ON CONFLICT (username) DO NOTHING
         RETURNING id, username, name, role`,
        [authUserId, username, email || username]
      );

      if (inserted.length === 0) {
        // Race: username taken by concurrent insert. Re-fetch by auth_user_id.
        const { rows: refetch } = await query(
          'SELECT id, username, name, role FROM profiles WHERE auth_user_id = $1 AND role = $2',
          [authUserId, 'faculty']
        );
        if (refetch.length === 0) {
          return res.status(403).json({ error: 'Faculty profile not found' });
        }
        req.faculty = refetch[0];
        next();
        return;
      }
      req.faculty = inserted[0];
    } else {
      req.faculty = existing[0];
    }

    next();
  } catch (err) {
    console.error('verifyFaculty error:', err.message);
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
    console.error('verifyStudentJwt error:', err.message);
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
      `SELECT s.*, p.username, p.name, e.title, e.code, e.status, e.duration_min, e.max_violations, e.questions_per_student,
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
    console.error('verifyStudentSession error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { verifyFaculty, verifyStudentJwt, verifyStudentSession };
