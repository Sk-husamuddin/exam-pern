const path = require('path');
const backendModules = path.resolve(__dirname, '../backend/node_modules');
if (!module.paths.includes(backendModules)) module.paths.push(backendModules);

require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { pool } = require('../backend/src/db');

const TARGET_URL = process.env.LOADTEST_TARGET_URL || 'https://exam-pern.onrender.com';
const EXAM_CODE = 'LOAD71';

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function loginStudent(username, password) {
  const res = await fetch(`${TARGET_URL}/auth/student/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.studentJwt) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(data)}`);
  }
  return data.studentJwt;
}

async function runBurst(vuCount) {
  console.log(`\n======================================================`);
  console.log(`🚀 Starting Burst Test: ${vuCount} Concurrent Students`);
  console.log(`Target: ${TARGET_URL}/api/student/enter`);
  console.log(`Exam Code: ${EXAM_CODE}`);
  console.log(`======================================================\n`);

  // Step 1: Pre-authenticate all students
  console.log(`[1/3] Pre-authenticating ${vuCount} test students...`);
  const authStart = Date.now();
  const students = [];
  for (let i = 1; i <= vuCount; i++) {
    const pad = String(i).padStart(3, '0');
    const username = `LOAD_STU_${pad}`;
    students.push({ username, password: 'LoadTestPass123!' });
  }

  // Pre-login in batches of 10 to avoid cold connection flooding
  const tokens = [];
  const batchSize = 10;
  for (let i = 0; i < students.length; i += batchSize) {
    const batch = students.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (st) => {
        const token = await loginStudent(st.username, st.password);
        return { username: st.username, token };
      })
    );
    tokens.push(...results);
  }
  console.log(`✅ All ${tokens.length} students authenticated in ${Date.now() - authStart}ms.`);

  // Step 2: Fire concurrent POST /enter
  console.log(`\n[2/3] Firing burst of ${vuCount} simultaneous POST /api/student/enter...`);
  const barrierStart = Date.now();

  const results = await Promise.all(
    tokens.map(async ({ username, token }, idx) => {
      const reqStart = Date.now();
      try {
        const res = await fetch(`${TARGET_URL}/api/student/enter`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            exam_code: EXAM_CODE,
            start_exam: true,
          }),
          signal: AbortSignal.timeout(30000),
        });

        const duration = Date.now() - reqStart;
        let data = {};
        try {
          data = await res.json();
        } catch (_) {}

        return {
          idx,
          username,
          status: res.status,
          duration,
          data,
          error: res.status >= 400 ? data.error || `HTTP ${res.status}` : null,
        };
      } catch (err) {
        return {
          idx,
          username,
          status: 0,
          duration: Date.now() - reqStart,
          data: null,
          error: err.message,
        };
      }
    })
  );

  const totalDuration = Date.now() - barrierStart;

  // Step 3: Analyze metrics
  const durations = results.map((r) => r.duration);
  const status200 = results.filter((r) => r.status === 200).length;
  const status5xx = results.filter((r) => r.status >= 500).length;
  const status4xx = results.filter((r) => r.status >= 400 && r.status < 500).length;
  const failed = results.filter((r) => r.status !== 200);

  const p50 = percentile(durations, 50);
  const p90 = percentile(durations, 90);
  const p95 = percentile(durations, 95);
  const p99 = percentile(durations, 99);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);

  console.log(`\n--- Results for ${vuCount} VUs ---`);
  console.log(`Total Requests:      ${results.length}`);
  console.log(`200 OK:              ${status200} / ${results.length} (${Math.round((status200 / results.length) * 100)}%)`);
  console.log(`4xx Errors:          ${status4xx}`);
  console.log(`5xx Errors:          ${status5xx} (Criteria: ZERO)`);
  console.log(`Total Wall Time:     ${totalDuration}ms`);
  console.log(`Latency min:         ${min}ms`);
  console.log(`Latency avg:         ${avg}ms`);
  console.log(`Latency p50:         ${p50}ms`);
  console.log(`Latency p90:         ${p90}ms`);
  console.log(`Latency p95:         ${p95}ms (Criteria: < 2000ms)`);
  console.log(`Latency p99:         ${p99}ms`);
  console.log(`Latency max:         ${max}ms`);

  if (failed.length > 0) {
    console.error(`\n⚠️ Sample Failures:`);
    for (const f of failed.slice(0, 5)) {
      console.error(`  Student ${f.username} -> Status ${f.status}: ${f.error}`);
    }
  }

  // Step 4: Verify in database
  console.log(`\n[3/3] Verifying database integrity...`);
  const client = await pool.connect();
  let dbCheck = {};
  try {
    const examRes = await client.query('SELECT id FROM exams WHERE code = $1', [EXAM_CODE]);
    const examId = examRes.rows[0].id;

    const sessions = await client.query(
      `SELECT login_order, user_id FROM exam_sessions WHERE exam_id = $1 ORDER BY login_order ASC`,
      [examId]
    );

    const dupUsers = await client.query(
      `SELECT user_id, COUNT(*) FROM exam_sessions WHERE exam_id = $1 GROUP BY user_id HAVING COUNT(*) > 1`,
      [examId]
    );

    const dupOrders = await client.query(
      `SELECT login_order, COUNT(*) FROM exam_sessions WHERE exam_id = $1 GROUP BY login_order HAVING COUNT(*) > 1`,
      [examId]
    );

    const orders = sessions.rows.map((r) => r.login_order);
    let isContiguous = true;
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i + 1) {
        isContiguous = false;
        break;
      }
    }

    dbCheck = {
      totalRecorded: sessions.rows.length,
      dupUsers: dupUsers.rows.length,
      dupOrders: dupOrders.rows.length,
      isContiguous,
    };

    console.log(`Database sessions recorded:    ${dbCheck.totalRecorded}`);
    console.log(`Duplicate sessions per user:   ${dbCheck.dupUsers} (Zero duplicate sessions)`);
    console.log(`Duplicate login_order values:  ${dbCheck.dupOrders} (Zero duplicate login_order)`);
    console.log(`login_order 1..N contiguous:   ${dbCheck.isContiguous ? 'YES ✅' : 'NO ❌'}`);
  } finally {
    client.release();
  }

  const passCriteria =
    status5xx === 0 &&
    status200 === vuCount &&
    dbCheck.dupUsers === 0 &&
    dbCheck.dupOrders === 0 &&
    dbCheck.isContiguous;

  console.log(`\nSummary: Test ${vuCount} VUs ${passCriteria ? 'PASSED ✅' : 'FAILED ❌'}\n`);

  return {
    vus: vuCount,
    requests: results.length,
    success: status200,
    errors5xx: status5xx,
    min,
    avg,
    p50,
    p90,
    p95,
    p99,
    max,
    totalDuration,
    dbCheck,
    passed: passCriteria,
  };
}

module.exports = { runBurst };

if (require.main === module) {
  const vus = parseInt(process.argv[2], 10) || 45;
  runBurst(vus)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}
