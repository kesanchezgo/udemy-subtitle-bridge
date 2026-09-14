// Visual verification of the redesign: dock width, typography scale (at
// default AND at a larger browser font size), dark + light themes, and the
// redesigned AI engines panel. Saves screenshots for each state.
//
// Run: node scripts/verify-redesign.mjs
//   USB_TEST_FONT_SIZE=20 node scripts/verify-redesign.mjs   (larger text)

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distPath = path.join(repoRoot, 'dist');
const profileDir = path.join(repoRoot, 'chrome-real-profile');
const outDir = path.join(repoRoot, 'artifacts');
fs.mkdirSync(outDir, { recursive: true });

const LECTURE =
  'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342?start=0#overview';

// Chrome stores the default font size in the profile's Preferences file. Writing
// it before launch is the only reliable way to exercise the scale path.
const FONT_SIZE = Number(process.env.USB_TEST_FONT_SIZE || '16');
const TAG = process.env.USB_TEST_TAG || 'default';

if (process.env.USB_TEST_FONT_SIZE) {
  const prefsPath = path.join(profileDir, 'Default', 'Preferences');
  try {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    prefs.webkit = prefs.webkit || {};
    prefs.webkit.webprefs = prefs.webkit.webprefs || {};
    prefs.webkit.webprefs.fonts = prefs.webkit.webprefs.fonts || {};
    // Playwright's Chromium reads this as the global default font size.
    prefs.webkit.webprefs.default_font_size = FONT_SIZE;
    prefs.webkit.webprefs.default_fixed_font_size = FONT_SIZE - 1;
    fs.writeFileSync(prefsPath, JSON.stringify(prefs));
    console.log(`set profile default font size to ${FONT_SIZE}px`);
  } catch (e) {
    console.log('could not preset font size pref:', String(e).slice(0, 80));
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
  { name: 'ud_cache_language', value: 'en', domain: '.udemy.com', path: '/' },
  { name: 'caption_language', value: 'en_US', domain: '.udemy.com', path: '/' },
  { name: 'captions_enabled', value: 'true', domain: '.udemy.com', path: '/' },
]);

await page.goto(LECTURE, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(18000);
console.log('URL:', page.url());

// Read the effective geometry + the measured scale.
const metrics = await page.evaluate(() => {
  const host = document.querySelector('[id^="usb-dock-host"]');
  const root = host?.shadowRoot;
  const panel = root?.querySelector('.usb-dock') || root?.firstElementChild;
  const rect = host?.getBoundingClientRect();

  // Find a representative 9px-class label and a 10px-class one.
  const probeSize = (sel) => {
    const el = root?.querySelector(sel);
    return el ? getComputedStyle(el).fontSize : null;
  };

  const labels = Array.from(root?.querySelectorAll('[class*="text-[9px]"]') || []);
  const smalls = Array.from(root?.querySelectorAll('[class*="text-[10px]"]') || []);

  return {
    hostWidth: rect?.width ?? null,
    hostHeight: rect?.height ?? null,
    usbScaleOnHost: host ? getComputedStyle(host).getPropertyValue('--usb-scale').trim() : null,
    usbScaleInRoot: root?.host ? getComputedStyle(root.host).getPropertyValue('--usb-scale').trim() : null,
    sample9px: labels.length ? getComputedStyle(labels[0]).fontSize : null,
    sample10px: smalls.length ? getComputedStyle(smalls[0]).fontSize : null,
    themeClass: panel?.className?.includes('dock-sepia') ? 'sepia' : 'dark',
  };
});
console.log('metrics:', JSON.stringify(metrics, null, 2));

await page.screenshot({ path: path.join(outDir, `dock-${TAG}-dark.png`) });

// Open the AI engines panel and screenshot it.
await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  Array.from(root?.querySelectorAll('button') || [])
    .find((b) => /motores de IA/i.test(b.title || ''))?.click();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, `ai-panel-${TAG}-dark.png`) });

// Toggle to light theme via the header button.
const toggled = await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  const btn = Array.from(root?.querySelectorAll('button') || [])
    .find((b) => /tema claro|tema oscuro/i.test(b.title || ''));
  btn?.click();
  return Boolean(btn);
});
console.log('theme toggled:', toggled);
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(outDir, `ai-panel-${TAG}-light.png`) });

// Close panel, screenshot the main dock in light.
await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  Array.from(root?.querySelectorAll('button') || [])
    .find((b) => /motores de IA/i.test(b.title || ''))?.click();
});
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(outDir, `dock-${TAG}-light.png`) });

// Contrast check on light theme: sample computed colors of key text.
const lightContrast = await page.evaluate(() => {
  const root = document.querySelector('[id^="usb-dock-host"]')?.shadowRoot;
  const sample = (sel) => {
    const el = root?.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { color: cs.color, size: cs.fontSize };
  };
  return {
    heading: sample('p'),
    label: sample('[class*="text-[9px]"]'),
  };
});
console.log('light sample:', JSON.stringify(lightContrast));

console.log(`\nscreenshots in artifacts/:`);
['dock', 'ai-panel'].forEach((base) => {
  ['dark', 'light'].forEach((theme) => {
    console.log(`  ${base}-${TAG}-${theme}.png`);
  });
});

await browser.close();
