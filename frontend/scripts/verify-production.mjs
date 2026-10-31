import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const CHROME_PATH = "C:\\Users\\DELL'\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe";

async function waitForServer(url, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode) resolve();
          else reject(new Error('No status code'));
        });
        req.on('error', reject);
        req.end();
      });
      return true;
    } catch (_) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Server at ${url} did not become ready within ${timeout}ms`);
}

async function run() {
  console.log('--- Starting vite preview server on port', PORT, '---');
  const previewProcess = spawn('npm', ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'pipe',
  });

  previewProcess.stdout.on('data', (d) => process.stdout.write(`[preview] ${d}`));
  previewProcess.stderr.on('data', (d) => process.stderr.write(`[preview err] ${d}`));

  try {
    await waitForServer(BASE, 20000);
    console.log('Preview server is ready at', BASE);

    const browser = await chromium.launch({
      headless: true,
      executablePath: CHROME_PATH,
    });
    const page = await browser.newPage();

    const results = {
      facultyLoginDirect: false,
      studentLoginDirect: false,
      studentLoginApiHost: false,
      facultyDashboardDirect: false,
    };

    // 1. Direct load of /faculty/login
    console.log('\n[1] Testing direct visit to /faculty/login ...');
    const facRes = await page.goto(`${BASE}/faculty/login`, { waitUntil: 'networkidle' });
    const facText = await page.locator('body').innerText();
    const facStatus = facRes.status();
    console.log(`  Status: ${facStatus}, Content includes "Faculty": ${facText.includes('Faculty')}`);
    if (facStatus === 200 && (facText.includes('Faculty') || facText.includes('Welcome back') || facText.includes('Sign in'))) {
      results.facultyLoginDirect = true;
      console.log('  PASS: /faculty/login loaded directly without 404');
    } else {
      console.error('  FAIL: /faculty/login did not render correctly');
    }

    // 2. Direct load of /student/login
    console.log('\n[2] Testing direct visit to /student/login ...');
    const stuRes = await page.goto(`${BASE}/student/login`, { waitUntil: 'networkidle' });
    const stuText = await page.locator('body').innerText();
    const stuStatus = stuRes.status();
    console.log(`  Status: ${stuStatus}, Content includes "Student": ${stuText.includes('Student') || stuText.includes('Roll number')}`);
    if (stuStatus === 200 && (stuText.includes('Student') || stuText.includes('Roll number') || stuText.includes('exam code'))) {
      results.studentLoginDirect = true;
      console.log('  PASS: /student/login loaded directly without 404');
    } else {
      console.error('  FAIL: /student/login did not render correctly');
    }

    // 3. Submit student login and verify requests go to onrender.com (NOT frontend host)
    console.log('\n[3] Testing student login network requests target onrender.com ...');
    const interceptedRequests = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/student/login') || url.includes('/student/enter')) {
        interceptedRequests.push({ url, method: req.method() });
        console.log(`  Intercepted request: ${req.method()} ${url}`);
      }
    });

    // Fill roll number, password, and exam code
    await page.fill('#roll-number', 'TEST_ROLL_101');
    await page.fill('#student-password', 'testpass');
    await page.fill('#exam-code', 'ABC123');
    await page.click('button[type="submit"]');

    // Wait for the login fetch to occur
    await page.waitForTimeout(3000);

    const hitOnrender = interceptedRequests.some((r) => r.url.startsWith('https://exam-pern.onrender.com/auth/student/login'));
    const hitLocalhost = interceptedRequests.some((r) => r.url.includes('localhost:') && r.url.includes('/student/login'));

    console.log(`  Sent request to https://exam-pern.onrender.com: ${hitOnrender}`);
    console.log(`  Sent request to localhost host: ${hitLocalhost}`);

    if (hitOnrender && !hitLocalhost) {
      results.studentLoginApiHost = true;
      console.log('  PASS: Student login requests routed to https://exam-pern.onrender.com');
    } else {
      console.error('  FAIL: Request destination incorrect:', interceptedRequests);
    }

    // 4. Hard-refresh /faculty/dashboard directly
    console.log('\n[4] Testing hard-refresh of /faculty/dashboard ...');
    const dashRes = await page.goto(`${BASE}/faculty/dashboard`, { waitUntil: 'networkidle' });
    const dashText = await page.locator('body').innerText();
    const dashStatus = dashRes.status();
    console.log(`  Status: ${dashStatus}, Current URL: ${page.url()}`);
    // Since unauthenticated, FacultyGuard or Supabase redirects to /faculty/login or renders Guard/Loading without 404
    if (dashStatus === 200 && !dashText.includes('404 NOT_FOUND')) {
      results.facultyDashboardDirect = true;
      console.log('  PASS: /faculty/dashboard loaded directly and rendered without 404');
    } else {
      console.error('  FAIL: /faculty/dashboard failed on direct load');
    }

    await browser.close();

    console.log('\n=======================================');
    console.log('VERIFICATION SUMMARY:');
    console.log(JSON.stringify(results, null, 2));
    console.log('=======================================');

    const allPassed = Object.values(results).every(Boolean);
    if (!allPassed) {
      process.exit(1);
    }
    process.exit(0);
  } finally {
    try {
      if (previewProcess.pid) {
        process.kill(previewProcess.pid);
      }
    } catch (_) {}
  }
}

run().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
