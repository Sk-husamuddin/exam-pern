const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const facultyRoutes = require('./routes/faculty');
const studentRoutes = require('./routes/student');

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

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || /^https:\/\/exam-pern.*\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
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
