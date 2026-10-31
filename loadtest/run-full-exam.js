const path = require('path');
const backendModules = path.resolve(__dirname, '../backend/node_modules');
if (!module.paths.includes(backendModules)) module.paths.push(backendModules);

require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { pool } = require('../backend/src/db');

const TARGET_URL = process.env.LOADTEST_TARGET_URL || 'https://exam-pern.onrender.com';
const EXAM_CODE = 'LOAD71';

async function runFullExamScenario(vuCount = 71) {
  console.log(`\n======================================================`);
  console.log(`🎓 Starting Full-Exam Lifecycle Load Test: ${vuCount} VUs`);
  console.log(`Flow: Login -> Enter -> Heartbeat (State) -> Violation -> Leave`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`======================================================\n`);

  const t0 = Date.now();
  let stepCounts = {
    loginOk: 0,
    enterOk: 0,
    stateOk: 0,
    violationOk: 0,
    leaveOk: 0,
    failures: 0,
  };

  const studentIndices = Array.from({ length: vuCount }, (_, i) => i + 1);

  await Promise.all(
    studentIndices.map(async (idx) => {
      const pad = String(idx).padStart(3, '0');
      const username = `LOAD_STU_${pad}`;
      const password = 'LoadTestPass123!';

      try {
        // 1. Student Login
        const loginRes = await fetch(`${TARGET_URL}/auth/student/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok || !loginData.studentJwt) {
          throw new Error(`Login failed for ${username}: ${JSON.stringify(loginData)}`);
        }
        stepCounts.loginOk++;

        // 2. Enter Exam
        const enterRes = await fetch(`${TARGET_URL}/api/student/enter`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${loginData.studentJwt}`,
          },
          body: JSON.stringify({ exam_code: EXAM_CODE, start_exam: true }),
        });
        const enterData = await enterRes.json();
        if (!enterRes.ok || !enterData.token) {
          throw new Error(`Enter failed for ${username}: ${JSON.stringify(enterData)}`);
        }
        stepCounts.enterOk++;
        const sessionToken = enterData.token;

        // 3. Heartbeat / State Polling
        const stateRes = await fetch(`${TARGET_URL}/api/student/state?active=1`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        const stateData = await stateRes.json();
        if (!stateRes.ok || stateData.status !== 'live') {
          throw new Error(`State failed for ${username}: ${JSON.stringify(stateData)}`);
        }
        stepCounts.stateOk++;

        // 4. Record simulated violation (tab blur)
        const violRes = await fetch(`${TARGET_URL}/api/student/violation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ reason: 'Loadtest simulated tab switch' }),
        });
        const violData = await violRes.json();
        if (!violRes.ok || violData.violations === undefined) {
          throw new Error(`Violation failed for ${username}: ${JSON.stringify(violData)}`);
        }
        stepCounts.violationOk++;

        // 5. Leave exam
        const leaveRes = await fetch(`${TARGET_URL}/api/student/leave`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        const leaveData = await leaveRes.json();
        if (!leaveRes.ok || !leaveData.ok) {
          throw new Error(`Leave failed for ${username}: ${JSON.stringify(leaveData)}`);
        }
        stepCounts.leaveOk++;
      } catch (err) {
        stepCounts.failures++;
        console.error(`VU ${username} error:`, err.message);
      }
    })
  );

  const totalTime = Date.now() - t0;
  console.log(`\n--- Full-Exam Scenario Summary (${vuCount} Students) ---`);
  console.log(`Logins Successful:    ${stepCounts.loginOk} / ${vuCount}`);
  console.log(`Enters Successful:    ${stepCounts.enterOk} / ${vuCount}`);
  console.log(`Heartbeats (State):   ${stepCounts.stateOk} / ${vuCount}`);
  console.log(`Violations Logged:    ${stepCounts.violationOk} / ${vuCount}`);
  console.log(`Leaves Completed:     ${stepCounts.leaveOk} / ${vuCount}`);
  console.log(`Total Failures:       ${stepCounts.failures}`);
  console.log(`Total Execution Time: ${totalTime}ms`);
  console.log(`Result:               ${stepCounts.failures === 0 ? 'ALL STEPS PASSED ✅' : 'FAILURES OCCURRED ❌'}\n`);

  return stepCounts;
}

module.exports = { runFullExamScenario };

if (require.main === module) {
  const vus = parseInt(process.argv[2], 10) || 71;
  runFullExamScenario(vus)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}
