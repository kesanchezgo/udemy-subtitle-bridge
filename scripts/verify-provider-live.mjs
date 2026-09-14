// Reproduce the provider-validation failure from the REAL extension in a REAL
// browser, reading the service worker's own state and network traffic.
//
// This is evidence, not reasoning: it loads dist/ into Chromium, calls
// USG_VALIDATE_PROVIDER from the content-script world (the same way the dock
// does), and reports exactly what happened, including SW console output.
//
// Run: node scripts/verify-provider-live.mjs

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distPath = path.join(repoRoot, 'dist');
const profileDir = path.join(repoRoot, 'chrome-real-profile');

const PROXY_URL = 'http://127.0.0.1:6660/v1';
const PROXY_KEY = 'gmifree';
const PROXY_MODEL = 'muse-spark-1.3-contributor-free';

// A page the extension is allowed to inject into would need host_permissions;
// we use Udemy since that is where the dock actually lives.
const TARGET = 'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/';

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
  viewport: { width: 1400, height: 900 },
  ignoreDefaultArgs: ['--enable-automation'],
});

// ── 1. Find the extension's service worker and capture its console ───────────
let sw = browser.serviceWorkers()[0];
if (!sw) {
  console.log('SW not up yet, waiting…');
  sw = await browser.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
}
if (!sw) {
  console.log('❌ No service worker — background.ts may have failed to load.');
  await browser.close();
  process.exit(1);
}
console.log('✅ Service worker:', sw.url());

const swLogs = [];
sw.on('console', (m) => swLogs.push(`[sw:${m.type()}] ${m.text()}`));

// Capture every network request the SW makes, so we see the actual fetch result.
const swRequests = [];
browser.on('request', (r) => {
  if (/6660|8010|127\.0\.0\.1|localhost/.test(r.url())) {
    swRequests.push(`REQ  ${r.method()} ${r.url()}`);
  }
});
browser.on('response', async (r) => {
  if (/6660|8010|127\.0\.0\.1|localhost/.test(r.url())) {
    swRequests.push(`RES  ${r.status()} ${r.url()}`);
  }
});
browser.on('requestfailed', (r) => {
  if (/6660|8010|127\.0\.0\.1|localhost/.test(r.url())) {
    swRequests.push(`FAIL ${r.url()} :: ${r.failure()?.errorText}`);
  }
});

// ── 2. Ask the SW directly what config it resolves and validate it ───────────
console.log('\n=== Calling USG_VALIDATE_PROVIDER from the SW context ===');
const direct = await sw.evaluate(async ({ url, key, model }) => {
  const out = { steps: [] };
  try {
    out.hasFetch = typeof fetch === 'function';
    out.steps.push(`fetch available: ${out.hasFetch}`);

    // Mirror the cfg shape the dock sends.
    const cfg = { kind: 'openai', baseUrl: url, apiKey: key, model };
    out.cfg = cfg;

    const res = await chrome.runtime.sendMessage({ type: 'USG_VALIDATE_PROVIDER', config: cfg })
      .catch((e) => ({ sendError: String(e) }));
    out.validate = res;
  } catch (e) {
    out.error = String(e);
  }
  return out;
}, { url: PROXY_URL, key: PROXY_KEY, model: PROXY_MODEL });

console.log(JSON.stringify(direct, null, 2));

// ── 3. Raw fetch from the SW to the proxy, bypassing all extension logic ─────
console.log('\n=== Raw fetch from SW (no extension logic) ===');
const raw = await sw.evaluate(async ({ url, key, model }) => {
  try {
    const r = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Responde solo: ok' }], max_tokens: 8 }),
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, body: text.slice(0, 300) };
  } catch (e) {
    return { threw: String(e), name: e?.name, message: e?.message };
  }
}, { url: PROXY_URL, key: PROXY_KEY, model: PROXY_MODEL });

console.log(JSON.stringify(raw, null, 2));

// ── 4. Now do it the way the dock does: from the content-script world ────────
console.log('\n=== Same call from the content script (page world) ===');
const page = browser.pages()[0] || (await browser.newPage());
await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(4000);
console.log('Page URL:', page.url());

const fromPage = await page.evaluate(async ({ url, key, model }) => {
  if (!globalThis.chrome?.runtime?.sendMessage) return { noChrome: true };
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'USG_VALIDATE_PROVIDER', config: { kind: 'openai', baseUrl: url, apiKey: key, model } },
      (resp) => {
        resolve({ resp, lastError: chrome.runtime.lastError?.message ?? null });
      },
    );
    setTimeout(() => resolve({ timeout: true }), 35000);
  });
}, { url: PROXY_URL, key: PROXY_KEY, model: PROXY_MODEL });

console.log(JSON.stringify(fromPage, null, 2));

// ── 5. Report ───────────────────────────────────────────────────────────────
console.log('\n=== SW network traffic to local hosts ===');
console.log(swRequests.join('\n') || '(none observed)');

console.log('\n=== SW console ===');
console.log(swLogs.join('\n') || '(none)');

await page.screenshot({ path: 'qa-provider-live.png' }).catch(() => {});
console.log('\nscreenshot: qa-provider-live.png');
await browser.close();
