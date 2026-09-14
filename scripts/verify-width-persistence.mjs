// Prove that a width the user drags to is remembered across page loads, and
// that the dock does not snap back to the default on reload.
//
// Run: node scripts/verify-width-persistence.mjs

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

const CONFIG_KEY = 'dock_width';

const readStored = async () => {
  const extPage = browser.pages().find((p) => p.url().startsWith('chrome-extension://'));
  const page = extPage || (await browser.newPage());
  if (!extPage) await page.goto(`chrome-extension://${extId}/src/app/styles/index.css`).catch(() => {});
  return await page.evaluate((k) => new Promise((r) => chrome.storage.local.get([k], (x) => r(x[k]))), CONFIG_KEY);
};

const writeStored = async (value) => {
  const extPage = browser.pages().find((p) => p.url().startsWith('chrome-extension://'));
  const page = extPage || (await browser.newPage());
  if (!extPage) await page.goto(`chrome-extension://${extId}/src/app/styles/index.css`).catch(() => {});
  return await page.evaluate(
    ([k, v]) => new Promise((r) => chrome.storage.local.set({ [k]: v }, () => r(true))),
    [CONFIG_KEY, value],
  );
};

const measure = (page) => page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  return Math.round(host?.getBoundingClientRect().width ?? 0);
});

// ── Start clean so the first load uses the default ────────────────────────────
await writeStored(-1);
await browser.newPage().then((p) => p.goto(`chrome-extension://${extId}/src/app/styles/index.css`).catch(() => {}));
const extClean = browser.pages().find((p) => p.url().startsWith('chrome-extension://'));
await extClean.evaluate((k) => new Promise((r) => chrome.storage.local.remove([k], () => r(true))), CONFIG_KEY);

const page = browser.pages().find((p) => !p.url().startsWith('chrome-extension://')) || (await browser.newPage());

await browser.addCookies([
  { name: 'access_token', value: 'yZTXnPgP7tlnLDQBS3L2m49p0nnDXzHFSXJa/NmjYj8:qrjTfL+QtPlN+ug3DcbIbFH185QA3Ztd0Tqd7VZlqMw', domain: '.udemy.com', path: '/' },
  { name: 'client_id', value: 'bd2565cb7b0c313f5e9bae44961e8db2', domain: '.udemy.com', path: '/' },
  { name: 'ud_user_jwt', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTA3NzQwMDMwLCJlbWFpbCI6InNhbmpheW1vbmRhbDM1NkBnbWFpbC5jb20iLCJpc19zdXBlcnVzZXIiOmZhbHNlLCJncm91cF9pZHMiOltdfQ.bF1dbqK8R2-yi5GMDufkSzctvRsMmn72iJcBVggZ1TM', domain: '.udemy.com', path: '/' },
  { name: 'dj_session_id', value: '2nnyh1qvx7q8dcuajibhclo2nkk8hsu5', domain: '.udemy.com', path: '/' },
  { name: 'ud_cache_logged_in', value: '1', domain: '.udemy.com', path: '/' },
]);

await page.goto(LECTURE, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(18000);
const defaultWidth = await measure(page);
console.log('1) default width on a clean profile:', defaultWidth);

// ── Simulate a drag: the resize handle sits on the left edge of the panel ─────
const handle = await page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  const root = host?.shadowRoot;
  // The handle is the col-resize strip; it carries the resize title as a label.
  const el = root?.querySelector('[title="Arrastrar para redimensionar"], .cursor-col-resize');
  const r = el?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width } : null;
});
console.log('2) resize handle found:', Boolean(handle));

if (handle) {
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  // Drag left to widen (the handle is on the left, so moving left grows it).
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(handle.x - i * 8, handle.y);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(1200);
}

const afterDrag = await measure(page);
const storedAfterDrag = await readStored();
console.log('3) width after drag:', afterDrag, '| stored:', storedAfterDrag);
await page.screenshot({ path: path.join(outDir, 'width-after-drag.png') });

// ── Reload: the width must come back, not reset ───────────────────────────────
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
const afterReload = await measure(page);
console.log('4) width after reload:', afterReload);

// ── Second reload for good measure ────────────────────────────────────────────
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
const afterSecondReload = await measure(page);
console.log('5) width after second reload:', afterSecondReload);
await page.screenshot({ path: path.join(outDir, 'width-after-reload.png') });

console.log('\n=== ASSERTIONS ===');
const grew = afterDrag > defaultWidth;
const checks = [
  ['a resize actually happened', grew],
  ['width was persisted to storage', typeof storedAfterDrag === 'number' && storedAfterDrag > 0],
  ['width survives the first reload', afterReload === afterDrag],
  ['width survives the second reload', afterSecondReload === afterDrag],
];
let all = true;
for (const [n, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${n}`);
  if (!ok) all = false;
}
console.log(`\ndefault=${defaultWidth}  dragged=${afterDrag}  stored=${storedAfterDrag}  reload1=${afterReload}  reload2=${afterSecondReload}`);
console.log(all ? '\nALL PASS' : '\nFAILURES REMAIN');

await browser.close();
process.exit(all ? 0 : 1);
