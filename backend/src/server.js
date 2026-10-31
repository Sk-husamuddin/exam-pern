const app = require('./app');
const config = require('./config');
const { pool } = require('./db');

const PORT = config.PORT;

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception thrown:', err);
});

const server = app.listen(PORT, () => {
  console.log(`Exam PERN backend running on http://localhost:${PORT}`);
  console.log(`BASE_URL: ${config.BASE_URL}`);
});

function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await pool.end();
      console.log('Postgres pool closed.');
    } catch (e) {
      console.error('Error closing Postgres pool:', e);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
