const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const facultyRoutes = require('./routes/faculty');
const studentRoutes = require('./routes/student');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Health
app.get('/health', (_req, res) => res.json({ ok: true, service: 'exam-pern-backend' }));

// API routes
app.use('/auth', authRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/student', studentRoutes);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
