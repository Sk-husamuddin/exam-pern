const express = require('express');
const cors = require('cors');
const compression = require('compression');
const authRoutes = require('./routes/auth');
const facultyRoutes = require('./routes/faculty');
const studentRoutes = require('./routes/student');
const { pool } = require('./db');

const app = express();

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'https://exam-pern.vercel.app',
];

const envOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (
    allowedOrigins.includes(origin) ||
    /^https:\/\/.*\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
  ) {
    return true;
  }
  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '5mb' }));

// Request timing logger for enter
app.use('/api/student/enter', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    if (dur > 500) {
      console.log(`[POST /api/student/enter] status=${res.statusCode} duration=${dur}ms`);
    }
  });
  next();
});

// Lightweight Health check
app.get('/health', (_req, res) => res.json({ ok: true, service: 'exam-pern-backend', time: new Date().toISOString() }));

// Database connection health check
app.get('/health/db', async (_req, res) => {
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - t0;
    res.json({ ok: true, latency_ms: latencyMs });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// API routes
app.use('/auth', authRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/student', studentRoutes);

// 404
app.use((req, res) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
