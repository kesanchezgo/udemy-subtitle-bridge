// Live probe against REAL Udemy with the user's session, using the extension's
// own chrome-real-profile so login state persists. Measures the overlay's actual
// position vs the video rect and reports every mismatch.
//
// Run: node scripts/live-probe.mjs

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

const page = browser.pages()[0] || await browser.newPage();

// Capture EVERYTHING to see why the translation pipeline yields no ES cues.
const allLogs = [];
page.on('console', (m) => allLogs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => allLogs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => allLogs.push(`[reqfail] ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', async (r) => {
  const u = r.url();
  if (/8010|6660|chat\/completions|generativelanguage/i.test(u)) {
    allLogs.push(`[net] ${r.status()} ${u.slice(0, 120)}`);
  }
});

// Inject the user's session cookies so the lecture page loads authenticated.
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

await page.goto(LECTURE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
console.log('URL:', page.url());
console.log('Waiting for player + dock…');
await page.waitForTimeout(20000);

const urlNow = page.url();
console.log('URL after wait:', urlNow);
if (urlNow.includes('login') || urlNow.includes('join')) {
  console.log('❌ Session expired — redirected to login.');
}

const probe = await page.evaluate(() => {
  const overlay = document.getElementById('usb-overlay');
  const dock = document.querySelector('[id^="usb-dock-host"]');
  const video = document.querySelector('video');
  const container = document.getElementById('shaka-video-container-' + (video?.id?.replace(/\D/g, '') || ''));
  return {
    hasDock: Boolean(dock),
    hasOverlay: Boolean(overlay),
    videoFound: Boolean(video),
    videoId: video?.id ?? null,
    videoRect: video?.getBoundingClientRect().toJSON() ?? null,
    videoTime: video?.currentTime ?? null,
    videoPaused: video?.paused ?? null,
    overlayParentId: overlay?.parentElement?.id || overlay?.parentElement?.tagName || null,
    overlayPosition: overlay ? getComputedStyle(overlay).position : null,
    overlayDisplay: overlay ? getComputedStyle(overlay).display : null,
    overlayZ: overlay ? getComputedStyle(overlay).zIndex : null,
    overlayRect: overlay?.getBoundingClientRect().toJSON() ?? null,
    overlayText: overlay?.firstElementChild?.textContent ?? null,
  };
});

console.log('\n=== LIVE PROBE ===');
console.log(JSON.stringify(probe, null, 2));

// Try to play and watch for at least 15s.
await page.evaluate(() => {
  const v = document.querySelector('video');
  if (v) { v.muted = true; v.play().catch(() => {}); }
});

// (manual import removed — we test the real auto-translate pipeline below)
console.log('--- driving real pipeline ---');

// Inspect what the extension has cached for this lecture and what key it uses.
const cacheProbe = await page.evaluate(async () => {
  const out = {};
  try {
    const all = await new Promise((res) => {
      if (!globalThis.chrome?.storage?.local) return res({});
      globalThis.chrome.storage.local.get(null, (r) => res(r || {}));
    });
    Object.keys(all).forEach((k) => {
      if (/translation|cache|srt|lecture/i.test(k)) out[k] = String(all[k]).slice(0, 120);
    });
  } catch (e) { out.error = String(e); }
  out.url = location.href;
  return out;
});
console.log('Storage keys:', JSON.stringify(cacheProbe, null, 2));

// The dock sits behind AuthGuard. Enter guest mode so the Captions/translation
// controls render.
const guestEntered = await page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  const root = host?.shadowRoot;
  if (!root) return 'no-shadow';
  const buttons = Array.from(root.querySelectorAll('button'));
  const guest = buttons.find((b) => /Continuar sin cuenta/i.test(b.textContent || ''));
  if (!guest) return { found: false };
  guest.click();
  return { found: true };
});
console.log('Guest enter:', JSON.stringify(guestEntered));
await page.waitForTimeout(1500);

// Configure the OpenAI-compatible provider (the user's local proxy) through the
// dock UI: open the AI engines panel, pick OpenAI, fill base URL / key / model.
await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  if (!root) return;
  const btn = Array.from(root.querySelectorAll('button')).find((b) => b.title === 'Configurar motores de IA');
  btn?.click();
});
await page.waitForTimeout(1200);

const providerSet = await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  if (!root) return 'no-shadow';
  const inputs = Array.from(root.querySelectorAll('input'));
  const kindBtns = Array.from(root.querySelectorAll('button'));
  const openaiBtn = kindBtns.find((b) => (b.textContent || '').trim() === 'OpenAI');
  openaiBtn?.click();
  return { inputCount: inputs.length, placeholders: inputs.map((i) => i.placeholder) };
});
console.log('Provider panel:', JSON.stringify(providerSet));

// Set provider values via the React-controlled inputs.
await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  if (!root) return;
  const setNative = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const inputs = Array.from(root.querySelectorAll('input'));
  const baseUrl = inputs.find((i) => /openai|baseurl|127/i.test(i.placeholder || '') || /Base URL/i.test(i.closest('div')?.parentElement?.textContent || ''));
  const key = inputs.find((i) => (i.placeholder || '') === 'sk-...');
  const model = inputs.find((i) => /gpt-4o|modelo/i.test(i.placeholder || ''));
  if (baseUrl) setNative(baseUrl, 'http://127.0.0.1:6660/v1');
  if (key) setNative(key, 'gmifree');
  if (model) setNative(model, 'qoder/qwen3.8-flash');
  const save = Array.from(root.querySelectorAll('button')).find((b) => /Guardar proveedor/i.test(b.textContent || ''));
  save?.click();
});
console.log('Provider configured (openai @ 127.0.0.1:6660).');
await page.waitForTimeout(1500);

// Close the panel.
await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  Array.from(root?.querySelectorAll('button') || []).find((b) => !b.textContent?.trim() && b.querySelector('svg'))?.click();
});
await page.waitForTimeout(1000);

// Dump the full dock UI so we can see what's actually rendered.
const dockDump = await page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  const root = host?.shadowRoot;
  if (!root) return 'no-shadow';
  const tabButtons = Array.from(root.querySelectorAll('[role="tab"], button')).map((b) => (b.textContent || '').trim()).filter(Boolean);
  return { text: root.textContent?.slice(0, 800), buttons: Array.from(new Set(tabButtons)).slice(0, 50) };
});
console.log('Dock dump:', JSON.stringify(dockDump, null, 2));

// Switch to the Captions tab explicitly.
const tabResult = await page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  const root = host?.shadowRoot;
  const btns = Array.from(root.querySelectorAll('button'));
  const cap = btns.find((b) => (b.textContent || '').trim() === 'Captions');
  if (cap) { cap.click(); return 'clicked Captions'; }
  return 'no Captions tab';
});
console.log('Tab:', tabResult);
await page.waitForTimeout(2000);

// Drive the REAL pipeline: click the dock's "Retranducir" / translation trigger.
const clicked = await page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  const root = host?.shadowRoot;
  if (!root) return 'no-shadow';
  const buttons = Array.from(root.querySelectorAll('button'));
  const target = buttons.find((b) => /Retranducir|Retraducir/i.test(b.textContent || ''));
  if (!target) return { found: false, labels: buttons.map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 40) };
  target.click();
  return { found: true, label: (target.textContent || '').trim() };
});
console.log('Pipeline trigger:', JSON.stringify(clicked));
await page.waitForTimeout(12000);

// Watch the ES overlay advance over time.
console.log('\n--- ES overlay tracking (real translation) ---');
for (let i = 0; i < 8; i += 1) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => {
    const overlay = document.getElementById('usb-overlay');
    const video = document.querySelector('video');
    return {
      t: video?.currentTime ?? null,
      text: overlay?.firstElementChild?.textContent ?? null,
      cues: overlay?.getAttribute('data-usb-cues'),
    };
  });
  const isSpanish = /[áéíóúñ¿¡]|que |de |la |el |los |con |para /i.test(s.text || '');
  console.log(`  t=${s.t?.toFixed(1)}s cues=${s.cues} ${s.text ? (isSpanish ? '🇪🇸' : '🇬🇧') : '·'} "${(s.text || '').slice(0, 60)}"`);
}

await page.screenshot({ path: 'qa-live-translated.png' });

// Read the pipeline status text the dock shows (error / progress).
const pipelineUi = await page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  const root = host?.shadowRoot;
  if (!root) return 'no-shadow';
  // Collect only visible text nodes (skip <style> content).
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts = [];
  let n;
  while ((n = walker.nextNode())) {
    const parent = n.parentElement;
    if (parent && parent.tagName !== 'STYLE' && parent.tagName !== 'SCRIPT') {
      const t = (n.textContent || '').trim();
      if (t) parts.push(t);
    }
  }
  const joined = parts.join(' | ');
  const m = joined.match(/(PIPELINE|bloques|Retranducir|No se pudo|Error|Timeout|Esperando|Gemini procesando|Conectando|traducid)[^|]{0,160}/gi);
  return { matches: m ? m.slice(0, 20) : [], tail: joined.slice(-500) };
});
console.log('Pipeline UI:', JSON.stringify(pipelineUi, null, 2));

const afterPipeline = await page.evaluate(() => {
  const overlay = document.getElementById('usb-overlay');
  const video = document.querySelector('video');
  return {
    t: video?.currentTime ?? null,
    cues: overlay?.getAttribute('data-usb-cues'),
    active: overlay?.getAttribute('data-usb-active'),
    text: overlay?.firstElementChild?.textContent ?? null,
  };
});
console.log('After real pipeline run:', JSON.stringify(afterPipeline));

console.log('\n--- relevant logs ---');
console.log(allLogs.filter((l) => /USG|usb_c|background|8010|6660|completions|translat|runtime|error|failed/i.test(l)).slice(-60).join('\n') || '(none)');

const samples = [];
for (let i = 0; i < 6; i += 1) {
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => {
    const overlay = document.getElementById('usb-overlay');
    const video = document.querySelector('video');
    return {
      t: video?.currentTime ?? null,
      overlayText: overlay?.firstElementChild?.textContent ?? null,
      overlayDisplay: overlay ? getComputedStyle(overlay).display : null,
      cues: overlay?.getAttribute('data-usb-cues'),
      csTime: overlay?.getAttribute('data-usb-time'),
      csActive: overlay?.getAttribute('data-usb-active'),
      csVisible: overlay?.getAttribute('data-usb-visible'),
      csAutoTr: overlay?.getAttribute('data-usb-autotr'),
    };
  });
  samples.push(s);
  console.log(`  sample ${i}: t=${s.t?.toFixed(1)} text="${s.overlayText}" | cues=${s.cues} csTime=${s.csTime} active="${s.csActive}" vis=${s.csVisible} at=${s.csAutoTr}`);
}

await page.screenshot({ path: 'qa-live-probe.png' });
console.log('screenshot: qa-live-probe.png');

await browser.close();
