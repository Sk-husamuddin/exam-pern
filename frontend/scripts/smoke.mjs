import { chromium } from 'playwright';

const SUPABASE_URL = 'https://oexgrrsqowgpcckdgmmn.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9leGdycnNxb3dncGNja2RnbW1uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzI0Mzg5OCwiZXhwIjoyMTA4ODE5ODk4fQ.CscmP-1NbDqx6Q3B6tbqUchAPpClnkpGponThnvV0Co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9leGdycnNxb3dncGNja2RnbW1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNDM4OTgsImV4cCI6MjEwODgxOTg5OH0.0L9lfRmiHvrjZrQ07J_RBEMCi4jTaCxeFHDg1tycOy4';
const BASE = process.env.BASE || 'http://localhost:3000';

const EMAIL = `faculty_smoke_${Date.now()}@example.com`;
const PASSWORD = 'SmokeTest123!';
const EXAM_TITLE = `Smoke Exam ${Date.now()}`;

const consoleMsgs = [];
const pageErrors = [];
const failedRequests = [];
const failedModuleLoads = [];

async function createFacultyUser() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { role: 'faculty' } }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`CREATE faculty user ${EMAIL}: status=${res.status}`);
  return body;
}

async function waitForRoot(page, timeout = 15000) {
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('root');
      return el && el.innerHTML.length > 0;
    }, { timeout });
    return true;
  } catch (e) {
    return false;
  }
}

(async () => {
  await createFacultyUser();

  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Users\\DELL'\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe",
  });
  const context = await browser.newContext();

  context.on('console', msg => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
  context.on('pageerror', err => pageErrors.push(String(err.message || err)));
  context.on('requestfailed', req => {
    const f = req.failure();
    failedRequests.push(`${req.method()} ${req.url()} ${f ? f.errorText : 'failed'}`);
  });
  context.on('response', res => {
    if (!res.ok() && res.resourceType && ['script', 'stylesheet', 'font', 'image', 'xhr', 'fetch'].includes(res.resourceType)) {
      failedModuleLoads.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  const page = await context.newPage();

  const results = {};

  async function capture(label) {
    await new Promise((r) => setTimeout(r, 1000));
    const mounted = await waitForRoot(page, 10000);
    const rootLen = await page.locator('#root').evaluate(el => (el ? el.innerHTML.length : 0));
    const bodyText = await page.locator('body').innerText();
    results[label] = { url: page.url(), mounted, rootLen, bodyLen: bodyText.length, bodyText };
    console.log(`=== ${label} ===`);
    console.log(`  url=${page.url()} mounted=${mounted} rootLen=${rootLen} bodyLen=${bodyText.length}`);
    console.log(`  body: ${bodyText.slice(0, 200)}`);
  }

  // Sign in via the actual UI form
  await page.goto(`${BASE}/faculty/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#faculty-email', EMAIL);
  await page.fill('#faculty-password', PASSWORD);
  await page.click('form button[type="submit"]');
  try {
    await page.waitForURL(`${BASE}/faculty/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    console.log('NAVIGATE dashboard did not occur; url:', page.url());
  }
  await waitForRoot(page, 10000);
  await new Promise((r) => setTimeout(r, 3000));
  await capture('dashboard after login');

  // Create an exam via the UI
  await page.fill('input[name="title"]', EXAM_TITLE);
  await page.click('button:has-text("Create exam")');
  await new Promise((r) => setTimeout(r, 2000));
  await capture('dashboard after create exam');

  // Verify exam code appears
  const hasCode = await page.locator('text=/^[A-F0-9]{6}$/').count() > 0;
  console.log(`EXAM CODE VISIBLE: ${hasCode}`);

  // Click Monitor for the created exam
  await page.click('button:has-text("Monitor")');
  await new Promise((r) => setTimeout(r, 1500));
  await capture('live monitor');

  // End the exam via dashboard (go back)
  await page.goto(`${BASE}/faculty/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForRoot(page, 10000);
  await new Promise((r) => setTimeout(r, 1000));
  await capture('dashboard back');

  // Sign out
  await page.click('button:has-text("Logout")');
  await new Promise((r) => setTimeout(r, 1000));
  await capture('after sign out');

  console.log('=== SUMMARY ===');
  console.log('PAGE_ERRORS:', JSON.stringify(pageErrors));
  console.log('FAILED_REQUESTS:', JSON.stringify(failedRequests));
  console.log('FAILED_MODULE_LOADS:', JSON.stringify(failedModuleLoads));
  console.log('console error count:', consoleMsgs.filter(m => m.startsWith('[error]')).length);

  await browser.close();
})();
