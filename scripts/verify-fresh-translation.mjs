// Definitive fresh-translation test: clear ALL translation cache, then run
// Retranducir with deepseek-v4.1-flash and verify:
//   1. The SW makes real fetches to 127.0.0.1:6660 (Performance API in SW).
//   2. The overlay advances in Spanish.
//
// Run: node scripts/verify-fresh-translation.mjs

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

// Extension page: clear every usb_cache_* entry + any translation keys.
const extPage = await browser.newPage();
await extPage.goto(`chrome-extension://${extId}/src/app/styles/index.css`).catch(() => {});
await extPage.waitForTimeout(500);

const cleared = await extPage.evaluate(() => new Promise((resolve) => {
  chrome.storage.local.get(null, (all) => {
    const keys = Object.keys(all).filter((k) => k.startsWith('usb_cache_') || /translat|srt_es/i.test(k));
    chrome.storage.local.remove(keys, () => resolve({ removed: keys.length, keys: keys.slice(0, 8) }));
  });
}));
console.log('cache cleared:', JSON.stringify(cleared));

// Reset SW performance entries so we only count this run's fetches.
await sw.evaluate(() => performance.clearResourceTimings());

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
console.log('Retranducir clicked (fresh run).');

// Track for 120s: SW fetches + overlay Spanish samples.
let spanishSamples = 0, totalSamples = 0;
for (let i = 0; i < 20; i += 1) {
  await page.waitForTimeout(6000);
  const s = await page.evaluate(() => {
    const o = document.getElementById('usb-overlay');
    const v = document.querySelector('video');
    return { t: v?.currentTime ?? null, text: o?.firstElementChild?.textContent ?? null };
  });
  totalSamples += 1;
  const isEs = /[áéíóúñ¿¡]|que |de |la |el |con |para /i.test(s.text || '');
  if (isEs) spanishSamples += 1;
  if (i % 3 === 0) console.log(`  t=${s.t?.toFixed(1)}s ${isEs ? '🇪🇸' : '·'} "${(s.text || '').slice(0, 55)}"`);
}

const swFetches = await sw.evaluate(() =>
  performance.getEntriesByType('resource')
    .filter((e) => /6660/.test(e.name))
    .map((e) => ({ url: e.name.slice(-38), ms: Math.round(e.duration) }))
);
console.log(`\nSW fetches to proxy: ${swFetches.length}`);
console.log(swFetches.length ? JSON.stringify(swFetches.slice(0, 10), null, 2) : '(none)');

await page.screenshot({ path: 'qa-fresh-translation.png' });

console.log('\n=== ASSERTIONS ===');
const checks = [
  ['SW made real fetches to 127.0.0.1:6660', swFetches.length > 0],
  ['overlay rendered Spanish (fresh, non-cached)', spanishSamples > 0],
];
let all = true;
for (const [n, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${n}`);
  if (!ok) all = false;
}
console.log(`\noverlay: ${spanishSamples}/${totalSamples} Spanish samples`);
console.log(all ? '\nALL PASS' : '\nFAILURES REMAIN');
await browser.close();
process.exit(all ? 0 : 1);
