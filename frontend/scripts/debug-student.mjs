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
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FACULTY_EMAIL, password: FACULTY_PW, email_confirm: true, user_metadata: { role: 'faculty' } }),
  });
  const supabaseRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FACULTY_EMAIL, password: FACULTY_PW }),
  });
  const facultyToken = (await supabaseRes.json()).access_token;
  const createExam = await api('POST', '/api/faculty/exams', { title: `Debug Exam ${TS}`, duration: 60, max_violations: 3 }, facultyToken);
  const examId = createExam.body.exam.id;
  const examCode = createExam.body.exam.code;
  for (let i = 1; i <= 3; i++) {
    await api('POST', '/api/faculty/questions', { exam_id: examId, body: `Debug question ${i}` }, facultyToken);
  }
  await api('POST', '/api/faculty/students', { username: STUDENT_USER, name: 'Debug Student' }, facultyToken);
  await api('POST', `/api/faculty/exams/${examId}/start`, null, facultyToken);

  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Users\\DELL'\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe",
  });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__fsElement = null;
    Object.defineProperty(document, 'fullscreenElement', { get: () => window.__fsElement, configurable: true });
    document.documentElement.requestFullscreen = async function () { window.__fsElement = document.documentElement; document.dispatchEvent(new Event('fullscreenchange')); };
    document.exitFullscreen = async function () { window.__fsElement = null; document.dispatchEvent(new Event('fullscreenchange')); };
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/student/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[id="roll-number"]', STUDENT_USER);
  await page.fill('input[id="student-password"]', STUDENT_PW);
  await page.fill('input[id="exam-code"]', examCode);
  await page.click('form button[type="submit"]');
  await page.waitForURL(`${BASE}/student/exam`, { timeout: 15000 });

  console.log('URL:', page.url());
  const bodyText = await page.locator('body').innerText();
  console.log('BODY:', bodyText.substring(0, 2000));
  const inputs = await page.locator('input').evaluateAll((els) => els.map(e => ({ id: e.id, type: e.type, placeholder: e.placeholder })));
  console.log('INPUTS:', JSON.stringify(inputs));
  const sessionStorage = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      out[key] = sessionStorage.getItem(key);
    }
    return out;
  });
  console.log('SESSION_STORAGE:', JSON.stringify(sessionStorage));
  await browser.close();
})();
