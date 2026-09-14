// Verify the three requested changes, with the design left untouched:
//   1. Dock is wider by default (400, up from 360).
//   2. Text scales with the browser/OS font size (and the design is identical
//      at the 16px default).
//   3. Theme follows the OS preference until the user picks one.
//
// Run: node scripts/verify-sizing-theme.mjs
//   USB_TEST_FONT_SIZE=22 node scripts/verify-sizing-theme.mjs

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

const FONT_SIZE = Number(process.env.USB_TEST_FONT_SIZE || '16');
const TAG = process.env.USB_TEST_TAG || 'default';

// Chrome reads the default font size from the profile Preferences file.
if (process.env.USB_TEST_FONT_SIZE) {
  const prefsPath = path.join(profileDir, 'Default', 'Preferences');
  try {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    prefs.webkit = prefs.webkit || {};
    prefs.webkit.webprefs = prefs.webkit.webprefs || {};
    prefs.webkit.webprefs.default_font_size = FONT_SIZE;
    prefs.webkit.webprefs.default_fixed_font_size = FONT_SIZE - 1;
    fs.writeFileSync(prefsPath, JSON.stringify(prefs));
    console.log(`profile default font size = ${FONT_SIZE}px`);
  } catch (e) {
    console.log('could not preset font size:', String(e).slice(0, 70));
  }
}

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

const state = await page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  const root = host?.shadowRoot;
  const rect = host?.getBoundingClientRect();

  const pick = (cls) => {
    const el = root?.querySelector(`[class*="${cls}"]`);
    return el ? getComputedStyle(el).fontSize : null;
  };

  return {
    hostWidth: Math.round(rect?.width ?? 0),
    usbScale: host ? getComputedStyle(host).getPropertyValue('--usb-scale').trim() : '(unset)',
    rootScale: root?.host ? getComputedStyle(root.host).getPropertyValue('--usb-scale').trim() : '(unset)',
    size9: pick('text-[9px]'),
    size10: pick('text-[10px]'),
    size11: pick('text-[11px]'),
    // The design markers introduced by the rejected redesign must NOT be present.
    redesignPillOrHints: (root?.textContent || '').includes('Acepta también un proxy'),
  };
});

console.log('\n=== measurements ===');
console.log(JSON.stringify(state, null, 2));

await page.screenshot({ path: path.join(outDir, `sizing-${TAG}.png`) });

// Theme should reflect the OS. Chromium defaults to light, so with no stored
// preference the dock should come up in light mode.
const themeInfo = await page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  const root = host?.shadowRoot;
  const dock = root?.querySelector('.usb-dock');
  return {
    osPrefersLight: matchMedia('(prefers-color-scheme: light)').matches,
    dockClass: dock?.className?.includes('dock-sepia') ? 'sepia(light)' : 'dark',
    stored: (() => { try { return localStorage.getItem('usb_dock_theme'); } catch { return null; } })(),
  };
});
console.log('\n=== theme ===');
console.log(JSON.stringify(themeInfo, null, 2));

const checks = [
  ['dock default width is wider (>=400)', state.hostWidth >= 400],
  ['--usb-scale is published', state.usbScale !== '(unset)'],
  ['redesign markup is absent (design untouched)', state.redesignPillOrHints === false],
  ['theme follows the OS preference', themeInfo.stored === null ? themeInfo.dockClass.startsWith(themeInfo.osPrefersLight ? 'sepia' : 'dark') : true],
];

if (FONT_SIZE === 16) {
  checks.push(['baseline text is pixel-identical (scale = 1)', state.usbScale === '1']);
  checks.push(['9px stays 9px at default', state.size9 === '9px']);
  checks.push(['10px stays 10px at default', state.size10 === '10px']);
  checks.push(['11px stays 11px at default', state.size11 === '11px']);
} else {
  const expected = FONT_SIZE / 16;
  checks.push([`scale reflects a ${FONT_SIZE}px browser font (${expected})`, Number(state.usbScale) === Number(expected.toFixed(3))]);
  checks.push(['9px grew with the browser setting', Number.parseFloat(state.size9) > 9]);
  checks.push(['10px grew with the browser setting', Number.parseFloat(state.size10) > 10]);
}

console.log('\n=== ASSERTIONS ===');
let all = true;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  if (!ok) all = false;
}
console.log(`\nwidth=${state.hostWidth}px  scale=${state.usbScale}  9px=${state.size9}  10px=${state.size10}`);
console.log(all ? '\nALL PASS' : '\nFAILURES REMAIN');
await browser.close();
process.exit(all ? 0 : 1);
