// Ground truth: did the click actually validate + save the deepseek provider?
// Reads the persisted config right after clicking, and samples the panel fast
// enough to catch the transient validation message.
//
// Run: node scripts/verify-provider-fix2.mjs

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

const readConfig = () => extPage.evaluate(() => new Promise((r) => {
  chrome.storage.local.get(['usg_ai_provider_config', 'usg_provider_validation'], (x) => r({
    config: x.usg_ai_provider_config ?? null,
    validation: x.usg_provider_validation ?? null,
  }));
}));

console.log('BEFORE:', JSON.stringify(await readConfig()));

const page = browser.pages()[0] || (await browser.newPage());
const proxyReqs = [];
page.on('request', (r) => { if (/6660/.test(r.url())) proxyReqs.push('REQ ' + r.url()); });
page.on('requestfailed', (r) => { if (/6660/.test(r.url())) proxyReqs.push('FAIL ' + r.url() + ' :: ' + r.failure()?.errorText); });
page.on('response', (r) => { if (/6660/.test(r.url())) proxyReqs.push('RES ' + r.status()); });

await browser.addCookies([
  { name: 'access_token', value: 'yZTXnPgP7tlnLDQBS3L2m49p0nnDXzHFSXJa/NmjYj8:qrjTfL+QtPlN+ug3DcbIbFH185QA3Ztd0Tqd7VZlqMw', domain: '.udemy.com', path: '/' },
  { name: 'client_id', value: 'bd2565cb7b0c313f5e9bae44961e8db2', domain: '.udemy.com', path: '/' },
  { name: 'ud_user_jwt', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTA3NzQwMDMwLCJlbWFpbCI6InNhbmpheW1vbmRhbDM1NkBnbWFpbC5jb20iLCJpc19zdXBlcnVzZXIiOmZhbHNlLCJncm91cF9pZHMiOltdfQ.bF1dbqK8R2-yi5GMDufkSzctvRsMmn72iJcBVggZ1TM', domain: '.udemy.com', path: '/' },
  { name: 'dj_session_id', value: '2nnyh1qvx7q8dcuajibhclo2nkk8hsu5', domain: '.udemy.com', path: '/' },
  { name: 'ud_cache_logged_in', value: '1', domain: '.udemy.com', path: '/' },
]);

await page.goto(LECTURE, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(18000);

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

console.log('\n--- clicking Probar y guardar ---');
await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  Array.from(root?.querySelectorAll('button') || [])
    .find((b) => /Probar y guardar/i.test(b.textContent || ''))?.click();
});

// Sample fast to catch the transient message.
let sawSuccess = false;
let sawValidationMsg = null;
for (let i = 0; i < 30; i += 1) {
  await page.waitForTimeout(400);
  const snap = await page.evaluate(() => {
    const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
    if (!root) return '';
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
    return parts.join(' | ');
  });
  const m = snap.match(/Conexión correcta[^|]{0,80}|No se pudo[^|]{0,120}|limitando peticiones[^|]{0,80}|saldo\/cuota[^|]{0,80}|HTTP \d+[^|]{0,80}|Proveedor guardado|La validación[^|]{0,80}/);
  if (m && !sawValidationMsg) sawValidationMsg = m[0];
  if (m && /Conexión correcta|Proveedor guardado/.test(m[0])) sawSuccess = true;
  if (i % 6 === 5) console.log(`[t=${((i + 1) * 0.4).toFixed(1)}s]`, m ? m[0] : '(no msg yet)');
}

await page.screenshot({ path: 'qa-provider-fix2.png' });

const after = await readConfig();
console.log('\nAFTER:', JSON.stringify(after, null, 2));

console.log('\nproxy traffic (page world):', proxyReqs.length ? proxyReqs.join(', ') : '(none — all via SW)');

console.log('\n=== ASSERTIONS ===');
const checks = [
  ['validation message appeared', Boolean(sawValidationMsg)],
  ['validation succeeded (Conexión correcta / guardado)', sawSuccess],
  ['config persisted with deepseek-v4.1-flash', after.config?.model === 'deepseek-v4.1-flash' && after.config?.baseUrl === 'http://127.0.0.1:6660/v1'],
  ['no content-script fetch to proxy', !proxyReqs.some((r) => r.startsWith('REQ') || r.startsWith('FAIL'))],
];
let all = true;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  if (!ok) all = false;
}
console.log(all ? '\nALL PASS' : '\nFAILURES REMAIN');
await browser.close();
process.exit(all ? 0 : 1);
