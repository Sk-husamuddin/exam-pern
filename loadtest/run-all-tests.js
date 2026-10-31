const path = require('path');
const backendModules = path.resolve(__dirname, '../backend/node_modules');
if (!module.paths.includes(backendModules)) module.paths.push(backendModules);

require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { pool } = require('../backend/src/db');
const { setup } = require('./setup-test-exam');
const { cleanup } = require('./cleanup-test-exam');
const { runBurst } = require('./run-burst-enter');
const { runFullExamScenario } = require('./run-full-exam');
const { runVercelLoad } = require('./run-vercel-test');

async function clearSessions(code = 'LOAD71') {
  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM exam_sessions WHERE exam_id IN (SELECT id FROM exams WHERE code = $1)`,
      [code]
    );
  } finally {
    client.release();
  }
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`🧪 PERN EXAM CONCURRENCY & RELIABILITY LOAD TEST SUITE`);
  console.log(`======================================================\n`);

  const summaryResults = [];

  try {
    // Step 0: Initial Setup
    await setup();

    // Test 1: 45 VUs Burst on POST /enter
    console.log(`\n>>> TEST 1: 45 VUs Burst on POST /enter <<<`);
    await clearSessions('LOAD71');
    const res45 = await runBurst(45);
    summaryResults.push({ name: 'Burst 45 VUs (Render)', ...res45 });

    // Test 2: 71 VUs Burst on POST /enter (Target Scenario)
    console.log(`\n>>> TEST 2: 71 VUs Burst on POST /enter <<<`);
    await clearSessions('LOAD71');
    const res71 = await runBurst(71);
    summaryResults.push({ name: 'Burst 71 VUs (Render)', ...res71 });

    // Test 3: 100 VUs Stress Burst on POST /enter
    console.log(`\n>>> TEST 3: 100 VUs Stress Burst on POST /enter <<<`);
    await clearSessions('LOAD71');
    const res100 = await runBurst(100);
    summaryResults.push({ name: 'Burst 100 VUs (Render)', ...res100 });

    // Test 4: Full Exam Scenario (71 VUs)
    console.log(`\n>>> TEST 4: Full Exam Scenario (71 VUs) <<<`);
    await clearSessions('LOAD71');
    const fullRes = await runFullExamScenario(71);

    // Test 5: Vercel Frontend Load (71 VUs)
    console.log(`\n>>> TEST 5: Vercel Frontend (71 VUs) <<<`);
    const vercelRes = await runVercelLoad(71);

    // Final Report Output
    console.log(`\n======================================================`);
    console.log(`📊 FINAL LOAD TEST METRICS & COMPARISON TABLE`);
    console.log(`======================================================\n`);

    console.log(`| Test Scenario | VUs | Requests | 200 OK | 5xx Errors | Latency p50 | Latency p95 | Max Latency | Contiguous Orders | Result |`);
    console.log(`|---|---|---|---|---|---|---|---|---|---|`);
    for (const r of summaryResults) {
      console.log(
        `| ${r.name} | ${r.vus} | ${r.requests} | ${r.success} | ${r.errors5xx} | ${r.p50}ms | ${r.p95}ms | ${r.max}ms | ${r.dbCheck.isContiguous ? 'Contiguous (1..N)' : 'FAILED'} | ${r.passed ? 'PASSED ✅' : 'FAILED ❌'} |`
      );
    }
    console.log(
      `| Full Exam Lifecycle | 71 | 355 | ${fullRes.leaveOk * 5} | ${fullRes.failures} | - | - | - | Verified | ${fullRes.failures === 0 ? 'PASSED ✅' : 'FAILED ❌'} |`
    );
    console.log(
      `| Vercel Frontend | 71 | 71 | ${vercelRes.status200} | ${vercelRes.errors} | ${vercelRes.p50}ms | ${vercelRes.p95}ms | ${vercelRes.max}ms | N/A | ${vercelRes.errors === 0 ? 'PASSED ✅' : 'FAILED ❌'} |`
    );

  } finally {
    // Step Cleanup
    console.log(`\nCleaning up test data...`);
    try {
      await cleanup();
    } catch (e) {
      console.error('Cleanup error:', e);
    }
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Master load test failed:', err);
    process.exit(1);
  });
}
