import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Users\\DELL'\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe",
  });
  const context = await browser.newContext();
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
  await page.goto('http://localhost:3000/student/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[id="roll-number"]', 'SMmvv56b99');
  await page.fill('input[id="student-password"]', 'SMmvv56b99');
  await page.fill('input[id="exam-code"]', '86DAFF');
  await page.click('form button[type="submit"]');
  await page.waitForURL('http://localhost:3000/student/exam', { timeout: 15000 });
  const inputs = await page.locator('input').evaluateAll((els) => els.map(e => ({ id: e.id, placeholder: e.placeholder, type: e.type })));
  console.log('All inputs on page:', JSON.stringify(inputs));
  const bodyText = await page.locator('body').innerText();
  console.log('Body text start:', bodyText.substring(0, 500));
  await browser.close();
})();
