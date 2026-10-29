const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_URL && config.DATABASE_URL.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : false,
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
