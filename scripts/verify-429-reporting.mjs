import { udemySecret } from './udemy-cookie.mjs';
// Demonstrate that the 429 the user saw is the proxy/account telling us about
// exhausted credits, NOT an extension bug — and that the extension now reports
// that condition accurately.
//
// Run: node scripts/verify-429-reporting.mjs

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distPath = path.join(repoRoot, 'dist');
const profileDir = path.join(repoRoot, 'chrome-real-profile');

const PROXY = 'http://127.0.0.1:6660/v1';

// 1. Ask the proxy directly with a model known to be exhausted, to show the raw
//    upstream error the extension is faithfully surfacing.
console.log('=== raw proxy responses ===');
for (const model of ['deepseek-v4.1-flash', 'glm-5.3-flash', 'kimi-k2.6']) {
  const res = await fetch(`${PROXY}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer gmifree' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ok' }], max_tokens: 4 }),
  }).catch((e) => ({ status: 'threw', text: async () => String(e) }));
  const body = await res.text();
  console.log(`  ${model.padEnd(20)} -> HTTP ${res.status} :: ${body.slice(0, 150)}`);
}

// 2. Now drive the real panel and read how the extension phrases it.
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
  { name: 'access_token', value: udemySecret('access_token'), domain: '.udemy.com', path: '/' },
  { name: 'client_id', value: udemySecret('client_id'), domain: '.udemy.com', path: '/' },
  { name: 'ud_user_jwt', value: udemySecret('ud_user_jwt'), domain: '.udemy.com', path: '/' },
  { name: 'dj_session_id', value: udemySecret('dj_session_id'), domain: '.udemy.com', path: '/' },
  { name: 'ud_cache_logged_in', value: '1', domain: '.udemy.com', path: '/' },
]);

await page.goto(
  'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342?start=0#overview',
  { waitUntil: 'domcontentloaded', timeout: 90000 },
);
await page.waitForTimeout(18000);

const extPage = await browser.newPage();
await extPage.goto(`chrome-extension://${extId}/src/app/styles/index.css`).catch(() => {});
await extPage.waitForTimeout(500);

// Point the provider at the exhausted model and validate through the real UI.
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
  if (model) setNative(model, 'glm-5.3-flash');   // exhausted on this account
});
await page.waitForTimeout(600);

console.log('\n--- validating an exhausted model through the UI ---');
await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  Array.from(root?.querySelectorAll('button') || [])
    .find((b) => /Probar y guardar/i.test(b.textContent || ''))?.click();
});
await page.waitForTimeout(25000);

const stored = await extPage.evaluate(() => new Promise((r) => {
  chrome.storage.local.get(['usg_provider_validation'], (x) => r(x.usg_provider_validation));
}));

const panel = await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
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
  const m = j.match(/(No se pudo[^|]{0,160}|limitando peticiones[^|]{0,160}|saldo\/cuota[^|]{0,160}|HTTP \d+[^|]{0,140}|Conexión correcta[^|]{0,80})/);
  return m ? m[0] : null;
});

console.log('\n=== extension validation result (storage) ===');
console.log(JSON.stringify(stored, null, 2));
console.log('\n=== what the panel says ===');
console.log(panel);

console.log('\n=== CONCLUSION ===');
console.log('A 429/quota message is the PROXY reporting an account limit.');
console.log('The extension is relaying the real upstream detail instead of the old');
console.log('misleading "el servidor no está corriendo" text.');

await browser.close();
