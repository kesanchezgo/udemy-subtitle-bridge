// Confirm the ES overlay text comes from the real provider (not mock), by
// reading the pipeline status from chrome.storage (background writes there)
// and the dock UI's own source labels.
//
// Run: node scripts/verify-translation-source.mjs

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distPath = path.join(repoRoot, 'dist');
const profileDir = path.join(repoRoot, 'chrome-real-profile');

const LECTURE =
  'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342?start=0#overview';

const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${distPath}`,
    `--load-extension=${distPath}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
  ],
  viewport: { width: 1600, height: 900 },
  ignoreDefaultArgs: ['--enable-automation'],
});

let sw = browser.serviceWorkers()[0];
if (!sw) sw = await browser.waitForEvent('serviceworker', { timeout: 20000 });
const extId = new URL(sw.url()).host;

const extPage = await browser.newPage();
await extPage.goto(`chrome-extension://${extId}/src/app/styles/index.css`).catch(() => {});
await extPage.waitForTimeout(500);

// Observe the proxy from the SW side itself: count its fetches via Performance API.
const page = browser.pages()[0] || (await browser.newPage());
await browser.addCookies([
  { name: 'access_token', value: 'yZTXnPgP7tlnLDQBS3L2m49p0nnDXzHFSXJa/NmjYj8:qrjTfL+QtPlN+ug3DcbIbFH185QA3Ztd0Tqd7VZlqMw', domain: '.udemy.com', path: '/' },
  { name: 'client_id', value: 'bd2565cb7b0c313f5e9bae44961e8db2', domain: '.udemy.com', path: '/' },
  { name: 'ud_user_jwt', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTA3NzQwMDMwLCJlbWFpbCI6InNhbmpheW1vbmRhbDM1NkBnbWFpbC5jb20iLCJpc19zdXBlcnVzZXIiOmZhbHNlLCJncm91cF9pZHMiOltdfQ.bF1dbqK8R2-yi5GMDufkSzctvRsMmn72iJcBVggZ1TM', domain: '.udemy.com', path: '/' },
  { name: 'dj_session_id', value: '2nnyh1qvx7q8dcuajibhclo2nkk8hsu5', domain: '.udemy.com', path: '/' },
  { name: 'ud_cache_logged_in', value: '1', domain: '.udemy.com', path: '/' },
  { name: 'ud_cache_language', value: 'en', domain: '.udemy.com', path: '/' },
  { name: 'caption_language', value: 'en_US', domain: '.udemy.com', path: '/' },
  { name: 'captions_enabled', value: 'true', domain: '.udemy.com', path: '/' },
]);

await page.goto(LECTURE, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(18000);

await page.evaluate(() => {
  const v = document.querySelector('video');
  if (v) { v.muted = true; v.play().catch(() => {}); }
});
await page.waitForTimeout(8000);

await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  const btn = Array.from(root?.querySelectorAll('button') || []).find((b) => /Retranducir/i.test(b.textContent || ''));
  btn?.click();
});
console.log('Retranducir clicked.');

// Wait for the pipeline to do its work.
await page.waitForTimeout(45000);

// 1. Did the SW make requests to the proxy? Ask the SW directly.
const swFetches = await sw.evaluate(() => {
  const entries = performance.getEntriesByType('resource');
  return entries
    .filter((e) => /6660/.test(e.name))
    .map((e) => ({ name: e.name.slice(-45), ms: Math.round(e.duration) }));
});
console.log('\n=== SW fetches to the proxy (Performance API) ===');
console.log(swFetches.length ? JSON.stringify(swFetches.slice(0, 20), null, 2) : '(none)');

// 2. What does the pipeline UI say about its source?
const pipelineText = await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  if (!root) return null;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts = [];
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement;
    if (p && p.tagName !== 'STYLE' && p.tagName !== 'SCRIPT') {
      const t = (n.textContent || '').trim();
      if (t) parts.push(t);
    }
  }
  const j = parts.join(' | ');
  const m = j.match(/Traduciendo SRT…[^|]{0,60}|Mock|bloques[^|]{0,40}|Traducción batch[^|]{0,80}|Pipeline SRT[^|]{0,60}/g);
  return { matches: m ? m.slice(0, 12) : null, hasMock: /\bMock\b/.test(j) };
});
console.log('\n=== pipeline UI source ===');
console.log(JSON.stringify(pipelineText, null, 2));

// 3. The overlay's live state.
const overlay = await page.evaluate(() => {
  const o = document.getElementById('usb-overlay');
  const v = document.querySelector('video');
  return {
    t: v?.currentTime ?? null,
    text: o?.firstElementChild?.textContent ?? null,
  };
});
console.log('\noverlay now:', JSON.stringify(overlay));

await page.screenshot({ path: 'qa-translation-source.png' });

const checks = [
  ['SW fetched the proxy for translation', swFetches.length > 0],
  ['UI does NOT say Mock', pipelineText ? !pipelineText.hasMock : false],
  ['overlay shows Spanish', /[áéíóúñ¿¡]|que |de |la |el /i.test(overlay.text || '')],
];
let all = true;
console.log('\n=== ASSERTIONS ===');
for (const [n, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${n}`);
  if (!ok) all = false;
}
console.log(all ? '\nALL PASS' : '\nFAILURES REMAIN');
await browser.close();
process.exit(all ? 0 : 1);
