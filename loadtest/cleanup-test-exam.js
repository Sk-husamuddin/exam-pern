const path = require('path');
const backendModules = path.resolve(__dirname, '../backend/node_modules');
if (!module.paths.includes(backendModules)) module.paths.push(backendModules);

require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { pool } = require('../backend/src/db');

async function cleanup() {
  console.log('--- Cleaning Up Test Exam and Load Test Students ---');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Delete test exams matching the load test title or code
    const delExams = await client.query(
      "DELETE FROM exams WHERE code = 'LOAD71' OR title LIKE 'LOAD_CONCURRENCY_TEST%' RETURNING id, code, title"
    );
    console.log(`Removed ${delExams.rowCount} test exams.`);

    // 2. Delete test student profiles matching pattern LOAD_STU_%
    const delStudents = await client.query(
      "DELETE FROM profiles WHERE username LIKE 'LOAD_STU_%' RETURNING id"
    );
    console.log(`Removed ${delStudents.rowCount} test student profiles.`);

    await client.query('COMMIT');
    console.log('--- Cleanup Complete ---\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Cleanup failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  cleanup().then(() => pool.end()).catch(() => { pool.end(); process.exit(1); });
}

module.exports = { cleanup };
