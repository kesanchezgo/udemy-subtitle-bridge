// After the blur fixes: re-audit for compositing layers and screenshot each tab
// in dark + sepia to eyeball crispness.
// Run: node scripts/verify-no-blur.mjs

import { chromium } from 'playwright';

const url = 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 520, height: 1000 }, deviceScaleFactor: 2 });

await page.goto(url, { waitUntil: 'networkidle' });
try {
  await page.getByRole('button', { name: 'Crear cuenta' }).first().click({ timeout: 3000 });
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click({ timeout: 3000 });
  await page.getByRole('button', { name: 'Continuar sin cuenta' }).click({ timeout: 3000 });
} catch {}
await page.waitForTimeout(2500);

const audit = () => page.evaluate(() => {
  const offenders = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('.usb-dock *')) {
    const cs = getComputedStyle(el);
    const reasons = [];
    if (cs.filter && cs.filter !== 'none') reasons.push(`filter:${cs.filter}`);
    if (cs.backdropFilter && cs.backdropFilter !== 'none') reasons.push(`backdrop:${cs.backdropFilter}`);
    if (!reasons.length) continue;
    const hasText = (el.textContent || '').trim().length > 0;
    const hasSvg = Boolean(el.querySelector('svg'));
    if (!hasText && !hasSvg) continue;
    const key = reasons.join() + (el.className || '').toString().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    offenders.push({ reasons, cls: (el.className || '').toString().slice(0, 70), text: (el.textContent || '').trim().slice(0, 26) });
  }
  return offenders;
});

const clickTab = (name) => page.evaluate((n) => {
  const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === n);
  if (b) { b.click(); return true; } return false;
}, name);

const toggleTheme = () => page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button')).find((x) => /tema (claro|oscuro)/i.test(x.getAttribute('title') || ''));
  if (b) { b.click(); return true; } return false;
});

let total = 0;
for (const tab of ['Study', 'Captions', 'Overlay']) {
  await clickTab(tab);
  await page.waitForTimeout(1000);
  const o = await audit();
  total += o.length;
  console.log(`\n[${tab}] ${o.length} offenders`);
  o.slice(0, 6).forEach((x) => console.log(`   ${x.reasons.join(', ')} "${x.text}" ${x.cls}`));
  await page.screenshot({ path: `qa-crisp-${tab.toLowerCase()}-dark.png`, fullPage: false });
}

// Switch to sepia and re-shoot each tab.
await toggleTheme();
await page.waitForTimeout(1200);
for (const tab of ['Study', 'Captions', 'Overlay']) {
  await clickTab(tab);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `qa-crisp-${tab.toLowerCase()}-sepia.png`, fullPage: false });
}

console.log(`\nTotal offenders with text/icons: ${total}`);
await browser.close();
process.exitCode = total === 0 ? 0 : 1;
