import { chromium } from 'playwright';

const SUPABASE_URL = 'https://oexgrrsqowgpcckdgmmn.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9leGdycnNxb3dncGNja2RnbW1uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzI0Mzg5OCwiZXhwIjoyMTA4ODE5ODk4fQ.CscmP-1NbDqx6Q3B6tbqUchAPpClnkpGponThnvV0Co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9leGdycnNxb3dncGNja2RnbW1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNDM4OTgsImV4cCI6MjEwODgxOTg5OH0.0L9lfRmiHvrjZrQ07J_RBEMCi4jTaCxeFHDg1tycOy4';
const BASE = 'http://localhost:3000';

const TS = Date.now().toString(36);
const FACULTY_EMAIL = `faculty_smoke_${TS}@example.com`;
const FACULTY_PW = 'SmokeTest123!';
const STUDENT_USER = `SM${TS}`;
const STUDENT_PW = STUDENT_USER;

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  PASS: ${msg}`);
  } else {
    failures++;
    console.log(`  FAIL: ${msg}`);
  }
}

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { status: res.status, body: data };
}

(async () => {
  // Setup faculty user via Supabase Admin API
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: FACULTY_EMAIL, password: FACULTY_PW, email_confirm: true, user_metadata: { role: 'faculty' } }),
  });

  // Faculty sign in via Supabase Auth to get token
  const supabaseRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FACULTY_EMAIL, password: FACULTY_PW }),
  });
  const supabaseData = await supabaseRes.json();
  const facultyToken = supabaseData.access_token;

  // Create exam via backend API
  const createExam = await api('POST', '/api/faculty/exams', { title: `Smoke Exam ${TS}`, duration: 60, max_violations: 3 }, facultyToken);
  assert(createExam.status === 200 && createExam.body.ok, `Exam created via API`);
  const examId = createExam.body.exam.id;
  const examCode = createExam.body.exam.code;
  assert(/^[A-F0-9]{6}$/.test(examCode), `Exam code: ${examCode}`);

  // Add 3 questions via API
  for (let i = 1; i <= 3; i++) {
    const q = await api('POST', '/api/faculty/questions', { exam_id: examId, body: `Smoke question ${i}` }, facultyToken);
    assert(q.status === 200 && q.body.ok, `Question ${i} created`);
  }

  // Add student via backend API
  const stu = await api('POST', '/api/faculty/students', { username: STUDENT_USER, name: 'Smoke Student' }, facultyToken);
  assert(stu.status === 200 && stu.body.ok, `Student created: ${STUDENT_USER}`);

  // Start exam via backend API
  const start = await api('POST', `/api/faculty/exams/${examId}/start`, null, facultyToken);
  assert(start.status === 200 && start.body.ok, `Exam started`);

  // === STUDENT CONTEXT ===
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Users\\DELL'\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe",
  });
  const context = await browser.newContext();

  // Stub fullscreen APIs since headless Chromium may not grant real fullscreen
  await context.addInitScript(() => {
    window.__fsElement = null;
    Object.defineProperty(document, 'fullscreenElement', {
      get: () => window.__fsElement,
      configurable: true,
    });
    document.documentElement.requestFullscreen = async function () {
      window.__fsElement = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async function () {
      window.__fsElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
  });

  const page = await context.newPage();
  const consoleMsgs = [];
  page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleMsgs.push(`PAGE_ERROR: ${e.message}`));

  // Student login in ONE submit (roll number, password, exam code)
  await page.goto(`${BASE}/student/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[id="roll-number"]', STUDENT_USER);
  await page.fill('input[id="student-password"]', STUDENT_PW);
  await page.fill('input[id="exam-code"]', examCode);
  await page.click('form button[type="submit"]');

  // Should land on /student/dashboard first
  await page.waitForURL(`${BASE}/student/dashboard`, { timeout: 15000 });
  assert(page.url() === `${BASE}/student/dashboard`, 'Student lands on /student/dashboard after login');

  // Click the red "Start Exam" button to begin exam & enter fullscreen
  await page.click('button:has-text("Start Exam")');

  // Should navigate into /student/exam
  await page.waitForURL(`${BASE}/student/exam`, { timeout: 15000 });
  assert(page.url() === `${BASE}/student/exam`, 'Student lands on /student/exam after clicking Start Exam');

  // Debug: print page content
  const pageContent = await page.locator('body').innerText();
  console.log('PAGE CONTENT AFTER LOGIN:', pageContent.substring(0, 500));
  const inputs = await page.locator('input').evaluateAll((els) => els.map(e => ({ id: e.id, type: e.type, placeholder: e.placeholder })));
  console.log('INPUTS ON EXAM PAGE:', JSON.stringify(inputs));
  const sessionData = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      out[key] = sessionStorage.getItem(key);
    }
    return out;
  });
  console.log('SESSION_STORAGE:', JSON.stringify(sessionData));

  // Assert NO exam-code input on /student/exam
  const examCodeInput = await page.locator('input#exam-code, input[placeholder*="Exam code"]').count();
  assert(examCodeInput === 0, 'No exam-code input on /student/exam page');

  // Wait for question to load
  await page.waitForFunction(() => {
    const el = document.getElementById('root');
    return el && el.innerHTML.length > 0 && el.innerText.includes('Question');
  }, { timeout: 10000 });

  const questionVisible = await page.evaluate(() => {
    const h2 = document.querySelector('h2');
    return h2 && h2.textContent.startsWith('Question');
  });
  assert(questionVisible, 'Question is displayed on /student/exam');

  const violationsVisible = await page.evaluate(() => {
    const el = document.getElementById('viol');
    return el && el.textContent.includes('Violations: 0/3');
  });
  assert(violationsVisible, 'Violations show 0/3 initially');

  // Trigger tab switch violation
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => {
    const el = document.getElementById('viol');
    return el && el.textContent.includes('Violations: 1/3');
  }, { timeout: 5000 });
  assert(await page.evaluate(() => {
    const el = document.getElementById('viol');
    return el && el.textContent.includes('Violations: 1/3');
  }), 'Tab switch recorded as violation');

  // Trigger 2 more violations to reach max (3)
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1500);

  // Student should be locked
  const studentLocked = await page.evaluate(() => {
    return document.body.textContent.includes('locked') || document.body.textContent.includes('Exam locked');
  });
  assert(studentLocked, 'Student exam locked after max violations');

  // Faculty unlock via API
  const { body: monBody } = await api('GET', `/api/faculty/state?exam_id=${examId}`, null, facultyToken);
  const sid = monBody.students.find((s) => s.username === STUDENT_USER)?.sid;
  const unlock = await api('POST', '/api/faculty/action', { exam_id: examId, action: 'unlock', sid }, facultyToken);
  assert(unlock.status === 200 && unlock.body.ok, `Faculty unlocks student`);

  // Student should be able to resume
  await page.waitForFunction(() => {
    const h2 = document.querySelector('h2');
    return h2 && h2.textContent.startsWith('Question') && !document.body.textContent.includes('locked');
  }, { timeout: 10000 });
  assert(await page.evaluate(() => {
    const h2 = document.querySelector('h2');
    return h2 && h2.textContent.startsWith('Question') && !document.body.textContent.includes('locked');
  }), 'Student resumes exam after faculty unlock');

  // Refresh student page - should show overlay (no code input)
  await page.reload();
  await page.waitForURL(`${BASE}/student/exam`, { timeout: 15000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('root');
    return el && el.innerHTML.length > 0;
  }, { timeout: 10000 });

  const overlayVisible = await page.evaluate(() => {
    const h2 = document.querySelector('h2');
    return h2 && h2.textContent.includes('Return to fullscreen to continue');
  });
  assert(overlayVisible, 'After refresh, "Return to fullscreen" overlay appears');

  const noCodeInput = await page.evaluate(() => {
    return !document.querySelector('input#exam-code, input[placeholder*="Exam code"]');
  });
  assert(noCodeInput, 'No code input on /student/exam after refresh');

  const sameQuestion = await page.evaluate(() => {
    const h2 = document.querySelector('h2');
    return h2 && h2.textContent.startsWith('Question');
  });
  assert(sameQuestion, 'Same question shown after refresh');

  // === SECOND LOGIN KICKS FIRST ===
  const sBrowser2 = await chromium.launch({
    headless: true,
    executablePath: "C:\\Users\\DELL'\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe",
  });
  const sContext2 = await sBrowser2.newContext();
  await sContext2.addInitScript(() => {
    window.__fsElement = null;
    Object.defineProperty(document, 'fullscreenElement', {
      get: () => window.__fsElement,
      configurable: true,
    });
    document.documentElement.requestFullscreen = async function () {
      window.__fsElement = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async function () {
      window.__fsElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
  });
  const sPage2 = await sContext2.newPage();

  await sPage2.goto(`${BASE}/student/login`, { waitUntil: 'domcontentloaded' });
  await sPage2.fill('input[id="roll-number"]', STUDENT_USER);
  await sPage2.fill('input[id="student-password"]', STUDENT_PW);
  await sPage2.fill('input[id="exam-code"]', examCode);
  await sPage2.click('form button[type="submit"]');

  await sPage2.waitForURL(`${BASE}/student/exam`, { timeout: 15000 });
  const secondLoginSucceeds = sPage2.url() === `${BASE}/student/exam`;
  assert(secondLoginSucceeds, 'Second login of same student succeeds');

  // First session should be kicked (401/kicked on next state poll)
  await page.waitForTimeout(2000);
  const firstSessionKicked = await page.evaluate(() => {
    return document.body.textContent.includes('Session expired') || document.body.textContent.includes('kicked');
  });
  assert(firstSessionKicked, 'First student session is kicked after second login');

  await sBrowser2.close();

  // === WRONG PASSWORD TEST ===
  await page.goto(`${BASE}/student/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[id="roll-number"]', STUDENT_USER);
  await page.fill('input[id="student-password"]', 'wrongpassword');
  await page.fill('input[id="exam-code"]', examCode);
  await page.click('form button[type="submit"]');
  await page.waitForTimeout(1000);
  const wrongPwError = await page.evaluate(() => {
    return document.body.textContent.includes('Invalid roll number or password');
  });
  assert(wrongPwError, 'Wrong password shows real backend error on login page');

  // === WRONG EXAM CODE TEST ===
  await page.fill('input[id="exam-code"]', 'WRONG99');
  await page.click('form button[type="submit"]');
  await page.waitForTimeout(1000);
  const wrongCodeError = await page.evaluate(() => {
    return document.body.textContent.includes('Invalid exam code') || document.body.textContent.includes('Invalid exam code, or the exam has ended');
  });
  assert(wrongCodeError, 'Wrong exam code shows real backend error');

  await browser.close();

  console.log(`\n${failures === 0 ? 'ALL STUDENT-FLOW TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
  process.exit(failures > 0 ? 1 : 0);
})();
