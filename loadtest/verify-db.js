const path = require('path');
const backendModules = path.resolve(__dirname, '../backend/node_modules');
if (!module.paths.includes(backendModules)) module.paths.push(backendModules);

require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { pool } = require('../backend/src/db');

async function verify(expectedCount = null) {
  console.log('--- Verifying Database Integrity for Test Exam (LOAD71) ---');
  const client = await pool.connect();
  try {
    const examRes = await client.query("SELECT id, title, code, questions_per_student FROM exams WHERE code = 'LOAD71'");
    if (examRes.rows.length === 0) {
      console.error('Test exam LOAD71 not found!');
      return { ok: false, error: 'Exam not found' };
    }
    const exam = examRes.rows[0];

    // Check sessions
    const sessRes = await client.query(
      `SELECT s.id, s.user_id, s.login_order, s.assigned_q_ids, p.username
       FROM exam_sessions s
       JOIN profiles p ON p.id = s.user_id
       WHERE s.exam_id = $1
       ORDER BY s.login_order ASC`,
      [exam.id]
    );

    const rows = sessRes.rows;
    console.log(`Total sessions recorded: ${rows.length}`);

    // Check duplicate users
    const dupRes = await client.query(
      `SELECT user_id, COUNT(*) as c
       FROM exam_sessions
       WHERE exam_id = $1
       GROUP BY user_id
       HAVING COUNT(*) > 1`,
      [exam.id]
    );
    const hasDupUsers = dupRes.rows.length > 0;
    console.log(`Duplicate sessions per user: ${dupRes.rows.length} ${hasDupUsers ? '❌ FAIL' : '✅ PASS (0 duplicates)'}`);

    // Check duplicate login_order
    const dupOrderRes = await client.query(
      `SELECT login_order, COUNT(*) as c
       FROM exam_sessions
       WHERE exam_id = $1
       GROUP BY login_order
       HAVING COUNT(*) > 1`,
      [exam.id]
    );
    const hasDupOrders = dupOrderRes.rows.length > 0;
    console.log(`Duplicate login_order values: ${dupOrderRes.rows.length} ${hasDupOrders ? '❌ FAIL' : '✅ PASS (0 duplicates)'}`);

    // Check contiguity (1 to N without gaps)
    const orders = rows.map((r) => r.login_order);
    let contiguous = true;
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i + 1) {
        contiguous = false;
        console.warn(`Gap or mismatch at index ${i}: expected ${i + 1}, found ${orders[i]}`);
        break;
      }
    }
    console.log(`login_order contiguous 1..${rows.length}: ${contiguous ? '✅ PASS (Contiguous)' : '❌ FAIL (Gaps detected)'}`);

    // Check assigned questions
    let invalidQuestions = 0;
    for (const r of rows) {
      const qIds = r.assigned_q_ids;
      if (!Array.isArray(qIds) || qIds.length !== exam.questions_per_student) {
        invalidQuestions++;
      }
    }
    console.log(`Question assignments (${exam.questions_per_student} per student): ${invalidQuestions === 0 ? '✅ PASS (All assigned correctly)' : `❌ FAIL (${invalidQuestions} misassigned)`}`);

    const ok = !hasDupUsers && !hasDupOrders && contiguous && (invalidQuestions === 0) && (!expectedCount || rows.length === expectedCount);
    console.log(`Verification Result: ${ok ? 'PASSED ✅' : 'FAILED ❌'}\n`);
    return {
      ok,
      totalSessions: rows.length,
      duplicateUsers: dupRes.rows.length,
      duplicateOrders: dupOrderRes.rows.length,
      contiguous,
      invalidQuestions,
    };
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const expected = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  verify(expected).then((r) => { pool.end(); process.exit(r.ok ? 0 : 1); }).catch(() => { pool.end(); process.exit(1); });
}

module.exports = { verify };
