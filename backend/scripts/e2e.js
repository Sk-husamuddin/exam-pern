/*
 * E2E test for Smart Exam Platform (PERN).
 * Runs against live local backend + real Supabase project.
 * Creates a throwaway faculty account via Supabase Admin API,
 * exercises every module, asserts PASS/FAIL per step, cleans up.
 *
 * Prerequisites:
 *  - Backend running on http://localhost:5000
 *  - Supabase schema applied (001 + 002)
 *  - env vars set: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */
const config = require('../src/config');
const BASE = 'http://127.0.0.1:5000';
let pass = 0;
let fail = 0;
let facultyAuthUserId = null;
let facultyAccessToken = null;
let facultyProfileId = null;
let examId = null;
let studentJwt = null;
let sessionToken = null;
let freshJwt = null;
let freshSessionToken = null;
const TS = Date.now().toString(36); // unique suffix for usernames

function log(msg) {
  console.log(msg);
}

function assert(cond, stepName, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS: ${stepName}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  FAIL: ${stepName}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(method, path, body, headers = {}) {
  const opts = { method, headers };
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 8000);
  opts.signal = ctrl.signal;
  try {
    const res = await fetch(`${BASE}${path}`, { ...opts, headers });
    let data;
    try {
      data = await res.json();
    } catch (_) {
      data = { error: `HTTP ${res.status}` };
    }
    if (res.status >= 400) {
      console.log(`    DEBUG ${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
    }
    clearTimeout(to);
    return { status: res.status, body: data };
  } catch (err) {
    clearTimeout(to);
    console.log(`    DEBUG ${method} ${path} → FETCH_ERROR: ${err.message}`);
    return { status: 0, body: { error: err.message } };
  }
}

async function supabaseAdmin(path, body) {
  const res = await fetch(
    `${config.SUPABASE_URL}/auth/v1/admin/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: config.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
    }
  );
  return res.json();
}

async function supabaseDeleteUser(uid) {
  await fetch(`${config.SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: config.SUPABASE_ANON_KEY,
    },
  });
}

async function main() {
  console.log('\n========================================');
  console.log('E2E TEST — Smart Exam Platform (PERN)');
  console.log('========================================\n');

  // ------------------------------------------------------------------
  // Step 1: /health + DB reachable
  // ------------------------------------------------------------------
  log('Step 1 — Health & DB');
  try {
    const h = await req('GET', '/health');
    assert(h.status === 200 && h.body.ok === true, '/health OK');
  } catch (e) {
    assert(false, '/health OK', e.message);
  }

  try {
    const { query } = require('../src/db');
    const r = await query('SELECT now() AS now');
    assert(r.rows.length === 1, 'DB query OK', `now=${r.rows[0].now}`);
  } catch (e) {
    assert(false, 'DB query OK', e.message);
  }

  // ------------------------------------------------------------------
  // Setup: create throwaway faculty via Supabase Admin API
  // ------------------------------------------------------------------
  const email = `e2e_${TS}@example.com`;
  const password = 'E2ePassword123!';
  log(`\nSetup — create faculty ${email}`);
  try {
    const created = await supabaseAdmin('users', {
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'faculty' },
    });
    facultyAuthUserId = created.id;
    log(`  Created faculty auth user: ${facultyAuthUserId}`);
  } catch (e) {
    assert(false, 'Create faculty via Admin API', e.message);
    return summarize();
  }

  // Sign in via Supabase Auth to get access token
  try {
    const sr = await fetch(`${config.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const sj = await sr.json();
    facultyAccessToken = sj.access_token;
    assert(!!facultyAccessToken, 'Faculty sign-in (Supabase Auth)', `got token: ${!!facultyAccessToken}`);
  } catch (e) {
    assert(false, 'Faculty sign-in', e.message);
    return summarize();
  }

  // ------------------------------------------------------------------
  // Step 2: Faculty token accepted; profile auto-created
  // ------------------------------------------------------------------
  log('\nStep 2 — Faculty auth');
  try {
    const r = await req('GET', '/api/faculty/exams', null, {
      Authorization: `Bearer ${facultyAccessToken}`,
    });
    assert(r.status === 200, 'Faculty token accepted /api/faculty/exams', `status=${r.status}`);

    const { query } = require('../src/db');
    const prof = await query('SELECT id FROM profiles WHERE auth_user_id = $1 AND role = $2', [
      facultyAuthUserId,
      'faculty',
    ]);
    assert(prof.rows.length === 1, 'Profile auto-created for faculty', `profile_id=${prof.rows[0]?.id}`);
    facultyProfileId = prof.rows[0].id;
  } catch (e) {
    assert(false, 'Faculty auth flow', e.message);
  }

  try {
    const r = await req('GET', '/api/faculty/exams', null, {
      Authorization: 'Bearer wrong-token-12345',
    });
    assert(r.status === 401, 'Wrong token → 401', `status=${r.status}`);
  } catch (e) {
    assert(false, 'Wrong token → 401', e.message);
  }

  try {
    const r = await req('GET', '/api/faculty/exams');
    assert(r.status === 401, 'Missing token → 401', `status=${r.status}`);
  } catch (e) {
    assert(false, 'Missing token → 401', e.message);
  }

  // ------------------------------------------------------------------
  // Step 3: Exams CRUD
  // ------------------------------------------------------------------
  log('\nStep 3 — Exams');
  try {
    const r = await req(
      'POST',
      '/api/faculty/exams',
      { title: 'E2E Exam', duration: 60, max_violations: 3 },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(r.status === 200 && r.body.ok, 'Create exam', `code=${r.body.exam?.code}`);
    examId = r.body.exam.id;
    assert(/^[A-F0-9]{6}$/.test(r.body.exam.code), 'Exam code is 6-char hex', `code=${r.body.exam.code}`);
  } catch (e) {
    assert(false, 'Create exam', e.message);
  }

  try {
    const r = await req('GET', '/api/faculty/exams', null, {
      Authorization: `Bearer ${facultyAccessToken}`,
    });
    assert(r.status === 200 && Array.isArray(r.body.exams), 'List exams', `count=${r.body.exams?.length}`);
  } catch (e) {
    assert(false, 'List exams', e.message);
  }

  try {
    const r = await req(
      'PATCH',
      `/api/faculty/exams/${examId}`,
      { title: 'E2E Exam Updated', duration: 45 },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(r.status === 200 && r.body.ok, 'Update exam', `ok=${r.body.ok}`);
  } catch (e) {
    assert(false, 'Update exam', e.message);
  }

  try {
    const r2 = await req(
      'POST',
      '/api/faculty/exams',
      { title: 'Throwaway', duration: 30, max_violations: 2 },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    const tId = r2.body.exam?.id;
    await req(
      'POST',
      `/api/faculty/exams/${tId}/end`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    const rd = await req(
      'DELETE',
      `/api/faculty/exams/${tId}`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(rd.status === 200 && rd.body.ok, 'Delete throwaway exam', `ok=${rd.body.ok}`);
  } catch (e) {
    assert(false, 'Delete exam', e.message);
  }

  // ------------------------------------------------------------------
  // Step 4: Questions
  // ------------------------------------------------------------------
  log('\nStep 4 — Questions');
  try {
    const r1 = await req(
      'POST',
      '/api/faculty/questions',
      { exam_id: examId, body: 'What is 2+2?' },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(r1.status === 200 && r1.body.ok, 'Create question manually', `q_no=${r1.body.question?.q_no}`);
    const qId1 = r1.body.question.id;

    const r2 = await req(
      'POST',
      '/api/faculty/questions',
      { exam_id: examId, body: 'What is the capital of France?' },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(r2.status === 200 && r2.body.ok, 'Create second question', `q_no=${r2.body.question?.q_no}`);

    const r3 = await req(
      'GET',
      `/api/faculty/exams/${examId}`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    const qs = r3.body.exam.questions || [];
    const qNos = qs.map((q) => q.q_no).sort((a, b) => a - b);
    assert(qNos.length === 2 && qNos[0] === 1 && qNos[1] === 2, 'q_no sequential', `qNos=${JSON.stringify(qNos)}`);

    const r4 = await req(
      'PUT',
      `/api/faculty/questions/${qId1}`,
      { body: 'Updated: What is 2+2?' },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(r4.status === 200 && r4.body.ok, 'Update question', `ok=${r4.body.ok}`);

    const r5 = await req(
      'DELETE',
      `/api/faculty/questions/${r2.body.question.id}`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(r5.status === 200 && r5.body.ok, 'Delete question', `ok=${r5.body.ok}`);
  } catch (e) {
    assert(false, 'Questions CRUD', e.message);
  }

  try {
    const JSZip = require('jszip');
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Docx Question 1: What is JSZip?</w:t></w:r></w:p>
          <w:p><w:r><w:t>Docx Question 2: Explain Node.js streams.</w:t></w:r></w:p>
        </w:body>
      </w:document>`
    );
    const docxBuf = await zip.generateAsync({ type: 'nodebuffer' });

    const form = new FormData();
    form.append('file', new Blob([docxBuf]), 'test.docx');
    form.append('mode', 'auto');
    const rPrev = await req('POST', '/api/faculty/questions/import-docx', form, {
      Authorization: `Bearer ${facultyAccessToken}`,
    });
    assert(rPrev.status === 200 && rPrev.body.ok, '.docx preview', `items=${rPrev.body.items?.length}`);

    const items = (rPrev.body.items || []).map((t, i) => ({ keep: true, body: t }));
    const rConf = await req(
      'POST',
      '/api/faculty/questions/import-docx/confirm',
      { exam_id: examId, questions: items },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(rConf.status === 200 && rConf.body.ok, '.docx confirm', `msg=${rConf.body.message}`);
  } catch (e) {
    assert(false, '.docx import', e.message);
  }

  try {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('not a zip')]), 'bad.docx');
    form.append('mode', 'auto');
    const rBad = await req('POST', '/api/faculty/questions/import-docx', form, {
      Authorization: `Bearer ${facultyAccessToken}`,
    });
    assert(rBad.status === 400, 'Malformed .docx rejected', `status=${rBad.status}`);
  } catch (e) {
    assert(false, 'Malformed .docx rejected', e.message);
  }

  // ------------------------------------------------------------------
  // Step 5: Students
  // ------------------------------------------------------------------
  log('\nStep 5 — Students');
  const stuUser = `E2ESTU${TS}`;
  try {
    const r1 = await req(
      'POST',
      '/api/faculty/students',
      { username: stuUser, name: 'Test Student One' },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(r1.status === 200 && r1.body.ok, 'Create student manually', `username=${r1.body.student?.username}`);
  } catch (e) {
    assert(false, 'Create student manually', e.message);
  }

  try {
    const r2 = await req(
      'POST',
      '/api/faculty/students',
      { username: stuUser, name: 'Duplicate' },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(r2.status === 400, 'Duplicate username rejected', `status=${r2.status}`);
  } catch (e) {
    assert(false, 'Duplicate username rejected', e.message);
  }

  try {
    const r3 = await req(
      'POST',
      '/api/faculty/students',
      { username: `0012${TS}`, name: 'Leading Zero' },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(r3.status === 200 && r3.body.ok, 'Leading-zero username', `username=${r3.body.student?.username}`);
    const { query } = require('../src/db');
    const su = await query('SELECT id FROM profiles WHERE username = $1', [`0012${TS}`]);
    studentJwt = null; // will be set below
  } catch (e) {
    assert(false, 'Leading-zero username', e.message);
  }

  try {
    const csv = `Username,Full Name\n21CS${TS},Student Two\n0012${TS},Duplicate Leading\n21CS${TS + 1},Student Three\n`;
    const form = new FormData();
    form.append('file', new Blob([csv]), 'students.csv');
    const r4 = await req('POST', '/api/faculty/students/import', form, {
      Authorization: `Bearer ${facultyAccessToken}`,
    });
    assert(r4.status === 200 && r4.body.ok, '.csv import', `msg=${r4.body.message}`);
  } catch (e) {
    assert(false, '.csv import', e.message);
  }

  try {
    const manyRows = 'Username,Full Name\n' + Array.from({ length: 1001 }, (_, i) => `user${i},Name ${i}`).join('\n');
    const form2 = new FormData();
    form2.append('file', new Blob([manyRows]), 'many.csv');
    const r5 = await req('POST', '/api/faculty/students/import', form2, {
      Authorization: `Bearer ${facultyAccessToken}`,
    });
    assert(r5.status === 400, '>1000 rows rejected', `status=${r5.status}`);
  } catch (e) {
    assert(false, '>1000 rows rejected', e.message);
  }

  try {
    const { query } = require('../src/db');
    const su = await query('SELECT id FROM profiles WHERE username = $1', [`0012${TS}`]);
    if (su.rows.length > 0) {
      const r6 = await req(
        'POST',
        `/api/faculty/students/${su.rows[0].id}/reset`,
        null,
        { Authorization: `Bearer ${facultyAccessToken}` }
      );
      assert(r6.status === 200 && r6.body.ok, 'Reset password', `msg=${r6.body.message}`);
    } else {
      assert(false, 'Reset password', 'student not found');
    }
  } catch (e) {
    assert(false, 'Reset password', e.message);
  }

  try {
    const { query } = require('../src/db');
    const su = await query('SELECT id FROM profiles WHERE username = $1', [`0012${TS}`]);
    if (su.rows.length > 0) {
      const r7 = await req(
        'DELETE',
        `/api/faculty/students/${su.rows[0].id}`,
        null,
        { Authorization: `Bearer ${facultyAccessToken}` }
      );
      assert(r7.status === 200 && r7.body.ok, 'Delete student', `ok=${r7.body.ok}`);
    } else {
      assert(false, 'Delete student', 'student not found');
    }
  } catch (e) {
    assert(false, 'Delete student', e.message);
  }

  // ------------------------------------------------------------------
  // Step 6: Exam lifecycle + student login + enter
  // ------------------------------------------------------------------
  log('\nStep 6 — Exam lifecycle & student login');
  try {
    await req(
      'POST',
      '/api/faculty/students',
      { username: `E2ESTUDENT${TS}`, name: 'E2E Student' },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );

    const rStart = await req(
      'POST',
      `/api/faculty/exams/${examId}/start`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(rStart.status === 200 && rStart.body.ok, 'Start exam', `ok=${rStart.body.ok}`);

    const rStart2 = await req(
      'POST',
      `/api/faculty/exams/${examId}/start`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(rStart2.status === 200 || rStart2.status === 400, 'Double start no crash', `status=${rStart2.status}`);

    const rWrongPw = await req('POST', '/auth/student/login', {
      username: `E2ESTUDENT${TS}`,
      password: 'wrongpassword',
    });
    assert(rWrongPw.status === 401, 'Wrong password → 401', `status=${rWrongPw.status}`);

    const rRightLogin = await req('POST', '/auth/student/login', {
      username: `E2ESTUDENT${TS}`,
      password: `E2ESTUDENT${TS}`,
    });
    assert(rRightLogin.status === 200 && rRightLogin.body.ok, 'Student login (pw==username)', `ok=${rRightLogin.body.ok}`);
    studentJwt = rRightLogin.body.studentJwt;

    const rWrongCode = await req(
      'POST',
      '/api/student/enter',
      { exam_code: 'WRONGCODE' },
      { Authorization: `Bearer ${studentJwt}` }
    );
    assert(rWrongCode.status === 400, 'Wrong exam code → 400', `status=${rWrongCode.status}`);

    const rExam = await req(
      'GET',
      `/api/faculty/exams/${examId}`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    const examCode = rExam.body.exam.code;

    const rEnter = await req(
      'POST',
      '/api/student/enter',
      { exam_code: examCode },
      { Authorization: `Bearer ${studentJwt}` }
    );
    assert(rEnter.status === 200 && rEnter.body.entered === true, 'Student enter → question assigned', `session_token=${!!rEnter.body.session_token}`);
    sessionToken = rEnter.body.session_token;
    assert(rEnter.body.position != null, 'Question position set', `position=${rEnter.body.position}`);
  } catch (e) {
    assert(false, 'Exam lifecycle setup', e.message);
  }

  try {
    const rReLogin = await req('POST', '/auth/student/login', {
      username: `E2ESTUDENT${TS}`,
      password: `E2ESTUDENT${TS}`,
    });
    assert(rReLogin.status === 200, 'Re-login (kick-out)', `ok=${rReLogin.body.ok}`);

    const rOldState = await req('GET', '/api/student/state', null, {
      Authorization: `Bearer ${sessionToken}`,
    });
    assert(rOldState.status === 401 || rOldState.body.status === 'kicked', 'Old session kicked', `status=${rOldState.status}`);
  } catch (e) {
    assert(false, 'Single-session kick-out', e.message);
  }

  // ------------------------------------------------------------------
  // Step 7: Question assignment distribution (6 concurrent enters, 3 questions)
  // ------------------------------------------------------------------
  log('\nStep 7 — Question assignment distribution');
  try {
    const rExam2 = await req(
      'POST',
      '/api/faculty/exams',
      { title: 'Distribution Exam', duration: 60, max_violations: 3 },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    const exam2Id = rExam2.body.exam.id;
    const exam2Code = rExam2.body.exam.code;

    for (let i = 0; i < 3; i++) {
      await req(
        'POST',
        '/api/faculty/questions',
        { exam_id: exam2Id, body: `Dist Q${i + 1}` },
        { Authorization: `Bearer ${facultyAccessToken}` }
      );
    }

    await req(
      'POST',
      `/api/faculty/exams/${exam2Id}/start`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );

    const enterPromises = [];
    for (let i = 0; i < 6; i++) {
      const uname = `DIST${TS}${i + 1}`;
      await req(
        'POST',
        '/api/faculty/students',
        { username: uname, name: `Dist Student ${i + 1}` },
        { Authorization: `Bearer ${facultyAccessToken}` }
      );
      const rl = await req('POST', '/auth/student/login', {
        username: uname,
        password: uname,
      });
      const sjwt = rl.body.studentJwt;
      enterPromises.push(
        req('POST', '/api/student/enter', { exam_code: exam2Code }, { Authorization: `Bearer ${sjwt}` })
      );
    }

    const results = await Promise.all(enterPromises);
    const positions = results
      .filter((r) => r.status === 200 && r.body.entered)
      .map((r) => r.body.position);

    assert(positions.length === 6, 'All 6 students entered', `entered=${positions.length}`);
    const totalEntered = positions.length;
    const counts = { 1: 0, 2: 0, 3: 0 };
    positions.forEach((p) => { if (counts[p] !== undefined) counts[p]++; });
    const totalAssigned = counts[1] + counts[2] + counts[3];
    assert(totalAssigned === totalEntered, 'All positions accounted for', `total=${totalAssigned}, entered=${totalEntered}`);
    const minCount = Math.min(counts[1], counts[2], counts[3]);
    const maxCount = Math.max(counts[1], counts[2], counts[3]);
    assert(maxCount - minCount <= 1, 'Balanced distribution', `counts=${JSON.stringify(counts)}`);

    const { query } = require('../src/db');
    const sessions = await query('SELECT user_id, q_id FROM exam_sessions WHERE exam_id = $1', [exam2Id]);
    const assigned = sessions.rows.filter((s) => s.q_id !== null).length;
    assert(assigned === totalEntered, 'Each student has exactly one question', `assigned=${assigned}, entered=${totalEntered}`);

    // End then delete distribution exam
    await req(
      'POST',
      `/api/faculty/exams/${exam2Id}/end`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    await req(
      'DELETE',
      `/api/faculty/exams/${exam2Id}`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
  } catch (e) {
    assert(false, 'Question distribution', e.message);
  }

  // ------------------------------------------------------------------
  // Step 8: Violations & lock
  // ------------------------------------------------------------------
  log('\nStep 8 — Violations & lock');
  try {
    const rReLogin = await req('POST', '/auth/student/login', {
      username: `E2ESTUDENT${TS}`,
      password: `E2ESTUDENT${TS}`,
    });
    freshJwt = rReLogin.body.studentJwt;

    const rExam = await req(
      'GET',
      `/api/faculty/exams/${examId}`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    const examCode = rExam.body.exam.code;
    const maxViolations = rExam.body.exam.max_violations;

    const rEnter2 = await req(
      'POST',
      '/api/student/enter',
      { exam_code: examCode },
      { Authorization: `Bearer ${freshJwt}` }
    );
    freshSessionToken = rEnter2.body.session_token;

    for (let i = 0; i < maxViolations; i++) {
      await req(
        'POST',
        '/api/student/violation',
        { reason: 'Tab switch' },
        { Authorization: `Bearer ${freshSessionToken}` }
      );
    }

    const rState = await req('GET', '/api/student/state', null, {
      Authorization: `Bearer ${freshSessionToken}`,
    });
    assert(rState.body.locked === true, 'Auto-lock after max_violations', `locked=${rState.body.locked}, violations=${rState.body.violations}`);

    const { query } = require('../src/db');
    const sess = await query('SELECT id FROM exam_sessions WHERE token = $1', [freshSessionToken]);
    const sid = sess.rows[0].id;

    const rUnlock = await req(
      'POST',
      '/api/faculty/action',
      { exam_id: examId, action: 'unlock', sid },
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(rUnlock.status === 200 && rUnlock.body.ok, 'Faculty unlock', `ok=${rUnlock.body.ok}`);

    const rMon = await req(
      'GET',
      `/api/faculty/state?exam_id=${examId}`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    const studentRow = rMon.body.students.find((s) => s.sid === sid);
    assert(studentRow && studentRow.violations === maxViolations, 'Monitor shows violations', `violations=${studentRow?.violations}`);
  } catch (e) {
    assert(false, 'Violations & lock', e.message);
  }

  // ------------------------------------------------------------------
  // Step 9: Shared clock & end exam
  // ------------------------------------------------------------------
  log('\nStep 9 — Shared clock & end');
  try {
    const rState = await req('GET', '/api/student/state', null, {
      Authorization: `Bearer ${freshSessionToken}`,
    });
    assert(typeof rState.body.seconds_left === 'number', 'seconds_left reported', `value=${rState.body.seconds_left}`);

    const rEnd = await req(
      'POST',
      `/api/faculty/exams/${examId}/end`,
      null,
      { Authorization: `Bearer ${facultyAccessToken}` }
    );
    assert(rEnd.status === 200 && rEnd.body.ok, 'End exam', `ok=${rEnd.body.ok}`);

    const rState2 = await req('GET', '/api/student/state', null, {
      Authorization: `Bearer ${freshSessionToken}`,
    });
    assert(rState2.body.status === 'ended', 'Student sees ended', `status=${rState2.body.status}`);
  } catch (e) {
    assert(false, 'Shared clock & end', e.message);
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  log('\nCleanup');
  try {
    await supabaseDeleteUser(facultyAuthUserId);
    log('  Faculty auth user deleted from Supabase');
  } catch (e) {
    log(`  Cleanup warning: ${e.message}`);
  }

  summarize();
}

function summarize() {
  console.log('\n========================================');
  console.log(`RESULTS: ${pass} PASS, ${fail} FAIL`);
  console.log('========================================\n');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E fatal:', err.message);
  summarize();
});
