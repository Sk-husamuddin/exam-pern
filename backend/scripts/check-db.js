const { Pool } = require('pg');
const config = require('../src/config');

async function main() {
  const maskedUrl = config.DATABASE_URL
    ? config.DATABASE_URL.replace(/:([^:@]+)@/, ':****@')
    : 'NOT SET';
  console.log('DATABASE_URL host (masked):', maskedUrl);

  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_URL && config.DATABASE_URL.includes('supabase.co')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const nowRes = await pool.query('SELECT now() AS now');
    console.log('DB now():', nowRes.rows[0].now);

    const expectedTables = ['profiles', 'exams', 'questions', 'exam_sessions', 'violation_log'];
    const tablesRes = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const existing = tablesRes.rows.map((r) => r.table_name);
    console.log('Existing tables:', existing);

    for (const t of expectedTables) {
      if (existing.includes(t)) {
        console.log(`  [OK] ${t}`);
      } else {
        console.log(`  [MISSING] ${t} — run 001_initial_schema.sql in Supabase SQL Editor`);
      }
    }

    // Quick index check
    const idxRes = await pool.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname;
    `);
    console.log('Indexes:', idxRes.rows.map((r) => r.indexname).join(', '));

    console.log('\nDB connectivity check: PASS');
  } catch (err) {
    console.error('DB connectivity check FAILED:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
