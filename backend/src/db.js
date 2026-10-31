const { Pool } = require('pg');
const config = require('./config');

const isSupabase = config.DATABASE_URL && (
  config.DATABASE_URL.includes('supabase.com') ||
  config.DATABASE_URL.includes('supabase.co') ||
  config.DATABASE_URL.includes('pooler.supabase.com')
);

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[pg pool error] Unexpected idle client error:', err);
});

// Helper: run a query with params
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  if (config.DEBUG) {
    console.log('Executed query', { text: text.substring(0, 60), duration: Date.now() - start, rows: res.rowCount });
  }
  return res;
}

module.exports = { query, pool };
