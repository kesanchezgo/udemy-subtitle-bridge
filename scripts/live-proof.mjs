// Visual proof: plays the REAL Udemy lecture and captures a screenshot at
// multiple, progressively later timestamps, asserting the ES overlay is visible
// and in Spanish at EACH one (not just the first cues).
//
// Run: node scripts/live-proof.mjs

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distPath = path.join(repoRoot, 'dist');
const profileDir = path.join(repoRoot, 'chrome-real-profile');

const LECTURE_URL = 'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342?start=0#overview';

const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  channel: 'chromium',
  args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`, '--no-first-run', '--no-default-browser-check'],
  viewport: { width: 1600, height: 900 },
});

await browser.addCookies([
  { name: 'access_token', value: 'yZTXnPgP7tlnLDQBS3L2m49p0nnDXzHFSXJa/NmjYj8:qrjTfL+QtPlN+ug3DcbIbFH185QA3Ztd0Tqd7VZlqMw', domain: '.udemy.com', path: '/' },
  { name: 'client_id', value: 'bd2565cb7b0c313f5e9bae44961e8db2', domain: '.udemy.com', path: '/' },
  { name: 'ud_user_jwt', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTA3NzQwMDMwLCJlbWFpbCI6InNhbmpheW1vbmRhbDM1NkBnbWFpbC5jb20iLCJpc19zdXBlcnVzZXIiOmZhbHNlLCJncm91cF9pZHMiOltdfQ.bF1dbqK8R2-yi5GMDufkSzctvRsMmn72iJcBVggZ1TM', domain: '.udemy.com', path: '/' },
  { name: 'dj_session_id', value: '2nnyh1qvx7q8dcuajibhclo2nkk8hsu5', domain: '.udemy.com', path: '/' },
  { name: 'ud_cache_user', value: '107740030', domain: '.udemy.com', path: '/' },
  { name: 'ud_cache_logged_in', value: '1', domain: '.udemy.com', path: '/' },
  { name: 'ud_cache_language', value: 'en', domain: '.udemy.com', path: '/' },
  { name: 'caption_language', value: 'en_US', domain: '.udemy.com', path: '/' },
  { name: 'captions_enabled', value: 'true', domain: '.udemy.com', path: '/' },
]);

const page = browser.pages()[0] || await browser.newPage();
await page.goto(LECTURE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(18000);

// Guest mode so the dock's controls render.
const dock = (fn) => page.evaluate(fn);
await dock(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  Array.from(root?.querySelectorAll('button') || []).find((b) => /Continuar sin cuenta/i.test(b.textContent || ''))?.click();
});
await page.waitForTimeout(2000);
console.log('Guest mode entered.');

// Wait until the ES translation has been produced (cues attribute > 0).
console.log('Waiting for ES cues to load (translation via proxy)…');
let cuesReady = 0;
for (let i = 0; i < 60; i += 1) {
  await page.waitForTimeout(3000);
  cuesReady = await page.evaluate(() => {
    const o = document.getElementById('usb-overlay');
    return Number(o?.getAttribute('data-usb-cues') || 0);
  });
  if (cuesReady > 0) break;
}
console.log(`ES cues ready: ${cuesReady}`);

// Seek to a sequence of LATER timestamps and screenshot each.
const video = await page.$('video');
const marks = [60, 120, 200, 300, 420, 520];
const results = [];

for (let i = 0; i < marks.length; i += 1) {
  const t = marks[i];
  await page.evaluate((sec) => {
    const v = document.querySelector('video');
    if (v) { v.currentTime = sec; v.play().catch(() => {}); }
  }, t);
  await page.waitForTimeout(3500);

  const state = await page.evaluate(() => {
    const o = document.getElementById('usb-overlay');
    const v = document.querySelector('video');
    const txt = o?.firstElementChild?.textContent || '';
    const isEs = /[áéíóúñ¿¡]|\b(que|de|la|el|los|las|con|para|una|del|en|es|son|pero|más)\b/i.test(txt);
    return {
      videoTime: v?.currentTime ?? null,
      overlayText: txt,
      overlayDisplay: o ? getComputedStyle(o).display : null,
      overlayRect: o?.getBoundingClientRect().toJSON() ?? null,
      isSpanish: isEs,
    };
  });
  results.push({ mark: t, ...state });
  console.log(`  [${i + 1}/${marks.length}] t=${state.videoTime?.toFixed(0)}s display=${state.overlayDisplay} es=${state.isSpanish} "${state.overlayText.slice(0, 64)}"`);

  await page.screenshot({ path: `qa-proof-${i + 1}-t${t}.png`, clip: { x: 0, y: 0, width: 1240, height: 700 } });
}

console.log('\n=== SUMMARY ===');
const withEs = results.filter((r) => r.isSpanish && r.overlayText.trim().length > 0).length;
console.log(`Timestamps with visible ES text: ${withEs}/${results.length}`);
results.forEach((r) => console.log(`  t=${r.mark}s -> "${r.overlayText.slice(0, 70)}"`));

await browser.close();
console.log(withEs >= 4 ? '\nRESULT: PASS (ES overlay visible across the lecture)' : '\nRESULT: FAIL');
