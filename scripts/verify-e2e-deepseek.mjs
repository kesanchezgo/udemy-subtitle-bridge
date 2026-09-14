// The REAL end goal: Retranducir with deepseek-v4.1-flash and watch the ES
// overlay advance on the video, cue by cue.
//
// Run: node scripts/verify-e2e-deepseek.mjs

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

const page = browser.pages()[0] || (await browser.newPage());
const proxyTraffic = [];
page.on('request', (r) => { if (/6660/.test(r.url())) proxyTraffic.push({ m: r.method(), u: r.url().slice(-40) }); });
page.on('response', (r) => { if (/6660/.test(r.url())) proxyTraffic.push({ s: r.status(), u: r.url().slice(-40) }); });
page.on('requestfailed', (r) => { if (/6660/.test(r.url())) proxyTraffic.push({ f: r.failure()?.errorText }); });

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
console.log('URL:', page.url());

// Play the video (muted autoplay) so cues advance.
await page.evaluate(() => {
  const v = document.querySelector('video');
  if (v) { v.muted = true; v.play().catch(() => {}); }
});

// Give capture time to build the EN SRT, then trigger Retranducir.
await page.waitForTimeout(8000);

const clicked = await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  if (!root) return { found: false };
  const btn = Array.from(root.querySelectorAll('button')).find((b) => /Retranducir/i.test(b.textContent || ''));
  if (!btn) return { found: false, disabled: btn?.disabled ?? null };
  btn.click();
  return { found: true };
});
console.log('Retranducir click:', JSON.stringify(clicked));

// Watch the overlay for 90s: expect Spanish text advancing over time.
console.log('\n--- overlay tracking ---');
const samples = [];
let spanishCount = 0;
for (let i = 0; i < 30; i += 1) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => {
    const overlay = document.getElementById('usb-overlay');
    const v = document.querySelector('video');
    return {
      t: v?.currentTime ?? null,
      text: overlay?.firstElementChild?.textContent ?? null,
      visible: overlay ? getComputedStyle(overlay).display !== 'none' : false,
    };
  });
  const isSpanish = /[áéíóúñ¿¡]|que |de |la |el |con |para |una |este |ahora /i.test(s.text || '');
  if (isSpanish) spanishCount += 1;
  samples.push({ t: s.t, es: isSpanish, text: (s.text || '').slice(0, 55) });
  if (i % 4 === 0) console.log(`  t=${s.t?.toFixed(1)}s ${isSpanish ? '🇪🇸' : '·'} "${(s.text || '').slice(0, 60)}"`);
}

await page.screenshot({ path: 'qa-e2e-deepseek.png' });

const ok200 = proxyTraffic.filter((e) => e.s === 200).length;
const failed = proxyTraffic.filter((e) => e.f).length;

console.log('\n=== ASSERTIONS ===');
const checks = [
  ['Retranducir button found and clicked', clicked.found],
  ['proxy traffic: got 200s from provider (SW world)', ok200 > 0],
  ['no failed proxy requests', failed === 0],
  ['overlay rendered Spanish at least once', spanishCount > 0],
];
let all = true;
for (const [n, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${n}`);
  if (!ok) all = false;
}
console.log(`\nproxy: ${ok200}×200, ${failed}×failed | overlay: ${spanishCount}/30 samples Spanish`);
console.log(all ? '\nALL PASS' : '\nFAILURES REMAIN');
await browser.close();
process.exit(all ? 0 : 1);
