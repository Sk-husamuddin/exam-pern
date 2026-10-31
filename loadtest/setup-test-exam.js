const path = require('path');
const backendModules = path.resolve(__dirname, '../backend/node_modules');
if (!module.paths.includes(backendModules)) module.paths.push(backendModules);

require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const bcrypt = require('bcryptjs');
const { pool } = require('../backend/src/db');

const TEST_EXAM_CODE = 'LOAD71';
const TEST_EXAM_TITLE = 'LOAD_CONCURRENCY_TEST_71';
const STUDENT_COUNT = 100;

async function setup() {
  console.log('--- Setting up Load Test Exam and Test Students ---');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get or create a designated faculty profile for load testing
    let facRes = await client.query("SELECT id FROM profiles WHERE role = 'faculty' LIMIT 1");
    let facultyId;
    if (facRes.rows.length === 0) {
      const insFac = await client.query(
        "INSERT INTO profiles (username, name, role) VALUES ('loadtest_faculty', 'Load Test Faculty', 'faculty') RETURNING id"
      );
      facultyId = insFac.rows[0].id;
    } else {
      facultyId = facRes.rows[0].id;
    }

    // 2. Remove any previous test exam with this code to start completely clean
    const oldExam = await client.query('SELECT id FROM exams WHERE code = $1', [TEST_EXAM_CODE]);
    if (oldExam.rows.length > 0) {
      await client.query('DELETE FROM exams WHERE id = $1', [oldExam.rows[0].id]);
      console.log(`Cleaned up previous test exam (id: ${oldExam.rows[0].id})`);
    }

    // 3. Create fresh live test exam
    const insExam = await client.query(
      `INSERT INTO exams (faculty_id, title, code, duration_min, max_violations, questions_per_student, status, started_at)
       VALUES ($1, $2, $3, 120, 5, 2, 'live', now())
       RETURNING id, code, title, status`,
      [facultyId, TEST_EXAM_TITLE, TEST_EXAM_CODE]
    );
    const exam = insExam.rows[0];
    console.log(`Created test exam: ${exam.title} (code: ${exam.code}, id: ${exam.id})`);

    // 4. Insert 4 test questions
    const questions = [
      'Question 1: Explain the purpose and mechanism of Postgres advisory locks under high concurrency.',
      'Question 2: Describe how ACID properties prevent data corruption during simultaneous transactions.',
      'Question 3: Compare pessimistic locking (SELECT FOR UPDATE) vs optimistic locking strategies.',
      'Question 4: What causes PostgreSQL deadlock 40P01 and how does lock order hierarchy eliminate it?'
    ];
    for (let i = 0; i < questions.length; i++) {
      await client.query(
        'INSERT INTO questions (exam_id, q_no, body) VALUES ($1, $2, $3)',
        [exam.id, i + 1, questions[i]]
      );
    }
    console.log(`Inserted ${questions.length} questions for exam ${exam.id}`);

    // 5. Ensure 100 test students exist (LOAD_STU_001 ... LOAD_STU_100)
    console.log(`Ensuring ${STUDENT_COUNT} test students in database...`);
    const defaultPasswordHash = await bcrypt.hash('LoadTestPass123!', 8);
    const valuePlaceholders = [];
    const values = [];
    for (let i = 1; i <= STUDENT_COUNT; i++) {
      const pad = String(i).padStart(3, '0');
      const username = `LOAD_STU_${pad}`;
      const name = `Load Student ${pad}`;
      const baseIdx = (i - 1) * 3;
      valuePlaceholders.push(`($${baseIdx + 1}, $${baseIdx + 2}, 'student', $${baseIdx + 3})`);
      values.push(username, name, defaultPasswordHash);
    }
    await client.query(
      `INSERT INTO profiles (username, name, role, password_hash)
       VALUES ${valuePlaceholders.join(', ')}
       ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash`,
      values
    );
    console.log(`Successfully verified ${STUDENT_COUNT} test students with password 'LoadTestPass123!'`);

    await client.query('COMMIT');
    console.log('--- Setup Complete Successfully ---\n');
    return exam;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Setup failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  setup().then(() => pool.end()).catch(() => { pool.end(); process.exit(1); });
}

module.exports = { setup, TEST_EXAM_CODE, STUDENT_COUNT };
