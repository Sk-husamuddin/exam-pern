const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const config = require('../config');

const router = express.Router();

// ------------------------------------------------------------------
// Faculty signup via Supabase Auth is handled on the frontend.
// This route creates the matching profiles row after Supabase signup.
// ------------------------------------------------------------------
router.post('/faculty/profile', async (req, res) => {
  try {
    const { auth_user_id, username, name } = req.body;
    if (!auth_user_id || !username || !name) {
      return res.status(400).json({ error: 'auth_user_id, username and name are required' });
    }

    const { rows } = await query(
      `INSERT INTO profiles (auth_user_id, username, name, role)
       VALUES ($1, $2, $3, 'faculty')
       ON CONFLICT (username) DO UPDATE SET name = $3, auth_user_id = $1
       RETURNING id, username, name, role`,
      [auth_user_id, username, name]
    );
    res.json({ ok: true, profile: rows[0] });
  } catch (err) {
    console.error('faculty/profile error:', err);
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
    const token = require('crypto').randomBytes(16).toString('hex');

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

    res.json({
      ok: true,
      token, // exam session token (sent with exam_code on /api/student/enter)
      studentJwt, // JWT for authenticated student routes
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
