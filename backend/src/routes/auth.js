const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const config = require('../config');
const { verifyFaculty } = require('../middleware/auth');

const router = express.Router();

// ------------------------------------------------------------------
// Faculty profile: create/update the calling faculty user's own profile.
// Requires a valid Supabase faculty Bearer token. Never trusts body auth_user_id.
// ------------------------------------------------------------------
router.post('/faculty/profile', verifyFaculty, async (req, res) => {
  try {
    const { username, name } = req.body;
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }
    const authUserId = req.faculty.id;
    const displayName = (name || '').trim() || username.trim();

    const { rows } = await query(
      `INSERT INTO profiles (auth_user_id, username, name, role)
       VALUES ($1, $2, $3, 'faculty')
       ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, auth_user_id = EXCLUDED.auth_user_id
       WHERE profiles.id = EXCLUDED.id
       RETURNING id, username, name, role`,
      [authUserId, username.trim(), displayName]
    );
    if (rows.length === 0) {
      // Username taken by a different user; try with suffix
      let suffix = 1;
      let tryUsername = `${username.trim()}${suffix}`;
      while (true) {
        const { rows: dup } = await query('SELECT 1 FROM profiles WHERE username = $1 AND id <> $2', [tryUsername, authUserId]);
        if (dup.length === 0) break;
        suffix++;
        tryUsername = `${username.trim()}${suffix}`;
      }
      const { rows: rows2 } = await query(
        `INSERT INTO profiles (auth_user_id, username, name, role)
         VALUES ($1, $2, $3, 'faculty')
         RETURNING id, username, name, role`,
        [authUserId, tryUsername, displayName]
      );
      return res.json({ ok: true, profile: rows2[0], username: tryUsername });
    }
    res.json({ ok: true, profile: rows[0] });
  } catch (err) {
    console.error('faculty/profile error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Student login: roll number (username) + password.
// By design password == username, but we verify bcrypt anyway.
// ------------------------------------------------------------------
router.post('/student/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const { rows } = await query(
      'SELECT id, username, name, password_hash, role FROM profiles WHERE username = $1 AND role = $2',
      [username, 'student']
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid roll number or password' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid roll number or password' });
    }

    // Single-session token (replaces PHP session token)

    // Insert or reuse session
    let session;
    const existing = await query('SELECT id FROM exam_sessions WHERE exam_id IS NULL AND user_id = $1', [user.id]);
    // We don't know exam_id yet at login; create a placeholder session will be created on enter.
    // Instead we just return token and user info; exam_sessions row is created when student enters exam code.
    // To preserve single-session behavior, store token in a temporary column? 
    // Simpler: return token; frontend sends exam_code with it on enter.

    // Issue a short-lived student JWT for API auth (optional layer)
    const studentJwt = jwt.sign(
      { userId: user.id, username: user.username, role: 'student' },
      config.STUDENT_JWT_SECRET,
      { expiresIn: '12h' }
    );

    // Kick-out: rotate token for all existing exam sessions so the old
    // browser is invalidated (same as PHP login.php behavior).
    const token = require('crypto').randomBytes(16).toString('hex');
    const sessions = await query(
      'SELECT id FROM exam_sessions WHERE user_id = $1',
      [user.id]
    );
    for (const s of sessions.rows) {
      await query('UPDATE exam_sessions SET token = $1, last_seen = now() WHERE id = $2', [token, s.id]);
    }

    res.json({
      ok: true,
      token,
      studentJwt,
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('student/login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (_req, res) => {
  res.json({ ok: true, message: 'Logged out (clear client-side tokens)' });
});

module.exports = router;
