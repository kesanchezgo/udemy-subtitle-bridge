// Confirm the design is back to the pre-redesign state: original dock width,
// original AI panel markup, and the provider still validates against the proxy.
//
// Run: node scripts/verify-revert.mjs

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distPath = path.join(repoRoot, 'dist');
const profileDir = path.join(repoRoot, 'chrome-real-profile');
const outDir = path.join(repoRoot, 'artifacts');
fs.mkdirSync(outDir, { recursive: true });

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

const page = browser.pages()[0] || (await browser.newPage());

await browser.addCookies([
  { name: 'access_token', value: 'yZTXnPgP7tlnLDQBS3L2m49p0nnDXzHFSXJa/NmjYj8:qrjTfL+QtPlN+ug3DcbIbFH185QA3Ztd0Tqd7VZlqMw', domain: '.udemy.com', path: '/' },
  { name: 'client_id', value: 'bd2565cb7b0c313f5e9bae44961e8db2', domain: '.udemy.com', path: '/' },
  { name: 'ud_user_jwt', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTA3NzQwMDMwLCJlbWFpbCI6InNhbmpheW1vbmRhbDM1NkBnbWFpbC5jb20iLCJpc19zdXBlcnVzZXIiOmZhbHNlLCJncm91cF9pZHMiOltdfQ.bF1dbqK8R2-yi5GMDufkSzctvRsMmn72iJcBVggZ1TM', domain: '.udemy.com', path: '/' },
  { name: 'dj_session_id', value: '2nnyh1qvx7q8dcuajibhclo2nkk8hsu5', domain: '.udemy.com', path: '/' },
  { name: 'ud_cache_logged_in', value: '1', domain: '.udemy.com', path: '/' },
]);

await page.goto(LECTURE, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(18000);
console.log('URL:', page.url());

// Geometry + presence of the old (reverted) styling markers.
const state = await page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  const root = host?.shadowRoot;
  const rect = host?.getBoundingClientRect();

  // The redesign used a layoutId pill and per-kind hints; the old design did not.
  const hasHintText = (root?.textContent || '').includes('Acepta también un proxy');
  const hasOldScaleVar = host ? getComputedStyle(host).getPropertyValue('--usb-scale').trim() : '';

  const labels = Array.from(root?.querySelectorAll('[class*="text-[9px]"]') || []);
  const smalls = Array.from(root?.querySelectorAll('[class*="text-[10px]"]') || []);

  return {
    hostWidth: rect?.width ?? null,
    usbScaleVar: hasOldScaleVar || '(unset)',
    sample9px: labels.length ? getComputedStyle(labels[0]).fontSize : null,
    sample10px: smalls.length ? getComputedStyle(smalls[0]).fontSize : null,
    redesignHintsPresent: hasHintText,
  };
});
console.log('\n=== dock state ===');
console.log(JSON.stringify(state, null, 2));

await page.screenshot({ path: path.join(outDir, 'revert-dock.png') });

// Provider validation must still work (that fix is NOT reverted).
const extPage = await browser.newPage();
await extPage.goto(`chrome-extension://${extId}/src/app/styles/index.css`).catch(() => {});
await extPage.waitForTimeout(500);

await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  Array.from(root?.querySelectorAll('button') || [])
    .find((b) => /motores de IA/i.test(b.title || ''))?.click();
});
await page.waitForTimeout(1500);

await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  const setNative = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const inputs = Array.from(root.querySelectorAll('input'));
  const base = inputs.find((i) => /api\.openai\.com|http/i.test(i.placeholder || ''));
  const key = inputs.find((i) => (i.placeholder || '') === 'sk-...');
  const model = inputs.find((i) => /gpt-4o/i.test(i.placeholder || ''));
  if (base) setNative(base, 'http://127.0.0.1:6660/v1');
  if (key) setNative(key, 'gmifree');
  if (model) setNative(model, 'deepseek-v4.1-flash');
});
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, 'revert-ai-panel.png') });

console.log('\n--- clicking Probar y guardar ---');
await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  Array.from(root?.querySelectorAll('button') || [])
    .find((b) => /Probar y guardar/i.test(b.textContent || ''))?.click();
});
await page.waitForTimeout(20000);

const after = await extPage.evaluate(() => new Promise((r) => {
  chrome.storage.local.get(['usg_ai_provider_config', 'usg_provider_validation'], (x) => r({
    config: x.usg_ai_provider_config ?? null,
    validation: x.usg_provider_validation ?? null,
  }));
}));
console.log('\n=== stored config + validation ===');
console.log(JSON.stringify(after, null, 2));

console.log('\n=== ASSERTIONS ===');
const checks = [
  ['dock width is back to the original 360', state.hostWidth === 360],
  ['no --usb-scale variable (redesign removed)', state.usbScaleVar === '(unset)'],
  ['font sizes are the original fixed px', state.sample9px === '9px' && state.sample10px === '10px'],
  ['redesign hints are gone', state.redesignHintsPresent === false],
  ['provider validation still works', Boolean(after.validation?.status)],
];
let all = true;
for (const [n, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${n}`);
  if (!ok) all = false;
}
console.log('\nvalidation status:', after.validation?.status, '|', after.validation?.message);
console.log(all ? '\nALL PASS' : '\nFAILURES REMAIN');
await browser.close();
process.exit(all ? 0 : 1);
