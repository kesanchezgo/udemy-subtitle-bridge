// Deterministic harness for the ES-overlay cue sync.
//
// Serves a structural clone of Udemy's lecture DOM on a udemy.com URL (so the
// built extension's content script injects for real), with a locally served
// <video> whose currentTime advances. Imports a translated ES SRT through the
// same event the dock uses, then asserts the overlay tracks the clock.
//
// Requires ffmpeg to mint the test clip on first run.
//
// Run: node scripts/e2e-harness.mjs

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '..', 'dist');
const profileDir = path.resolve(__dirname, '..', '.e2e-harness-profile');
const webmPath = path.resolve(__dirname, '..', 'artifacts', 'test-lecture.webm');

if (!fs.existsSync(webmPath)) {
  fs.mkdirSync(path.dirname(webmPath), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:d=60', '-c:v', 'libvpx-vp9', '-b:v', '50k', '-an', webmPath], { stdio: 'ignore' });
}

const mediaServer = http.createServer((req, res) => {
  if (req.url && req.url.endsWith('.webm')) {
    res.writeHead(200, { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*' });
    res.end(fs.readFileSync(webmPath));
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => mediaServer.listen(4599, '127.0.0.1', r));

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Lecture</title>
<style>
  body { margin:0; background:#1c1d1f; color:#fff; font-family:sans-serif; }
  #shaka-video-container-999 { position:relative !important; width:900px; height:506px; margin:24px auto; background:#000; overflow:hidden; }
  video { width:100%; height:100%; display:block; }
  .captions-display-module--captions-container--AezHx { position:absolute; left:0; right:0; bottom:8%; text-align:center; }
  .captions-display-module--captions-cue-text--KMBV6 { font-size:2.4rem; opacity:.75; }
</style></head>
<body>
  <main class="app--content-column--LnPGp">
    <section class="lecture-view--container--mrZSm"
      aria-label="Section 2: Java: A High-level Overview, Lecture 10: Platform Independence in Java + Demo">
      <div class="video-viewer--container--3yIje">
        <div data-purpose="shaka-video-player" class="video-player-module--video-player--ZGjpj">
          <div id="shaka-video-container-999" class="video-player-module--video-container--dsN0B">
            <video class="video-player-module--relative-fill--4wqey" id="lecture-999"
                   preload="auto" muted playsinline crossorigin="anonymous"
                   src="http://127.0.0.1:4599/test-lecture.webm"></video>
            <div id="lecture-999-captions-display-container" class="video-player-module--absolute-fill--sCDvv">
              <div class="captions-display-module--captions-container--AezHx captions-display-module--user-inactive--ddJ4w">
                <div class="captions-display-module--captions-cue-text--KMBV6"
                     data-purpose="captions-cue-text" style="font-size:2.4rem;opacity:.75;">but here in the Java world,</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</body></html>`;

const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  channel: 'chromium',
  args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`, '--no-first-run'],
  viewport: { width: 1440, height: 900 },
});

// Play the real (locally served) video so currentTime advances naturally.
await browser.addInitScript(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const v = document.getElementById('lecture-999');
    if (!v) return;
    v.muted = true;
    // Pause briefly so the harness controls timing via seeks.
    window.__seek = (sec) => { try { v.currentTime = sec; } catch { /* not ready */ } };
    v.addEventListener('loadedmetadata', () => { v.play().catch(() => {}); }, { once: true });
  });
});

const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (/USG/.test(m.text())) logs.push(m.text()); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('http://127.0.0.1:4599/')) {
    return route.continue();
  }
  if (route.request().resourceType() === 'document' && url.startsWith('https://www.udemy.com/course/')) {
    return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
  }
  return route.continue();
});

await page.goto('https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342',
  { waitUntil: 'domcontentloaded' });
console.log('Waiting for content script…');
await page.waitForTimeout(7000);

// Ensure the video is playing so currentTime advances on its own.
await page.evaluate(() => {
  const v = document.querySelector('video');
  if (v) { v.muted = true; v.play().catch(() => {}); }
});
await page.waitForTimeout(2000);

// Import the ES SRT the same way the dock does.
await page.evaluate(() => {
  const srt = `1
00:00:00,082 --> 00:00:02,100
(música animada)

2
00:00:02,100 --> 00:00:03,090
Dheeru: Hola.

3
00:00:03,090 --> 00:00:05,610
Soy Dheeru y bienvenidos de nuevo.

4
00:00:05,610 --> 00:00:09,540
Veamos cómo Java logra la independencia de plataforma`;
  window.dispatchEvent(new CustomEvent('usb_to_content', {
    detail: { type: 'IMPORT_ES_SRT', payload: { srtText: srt } },
  }));
});
await page.waitForTimeout(1200);

const readOverlay = () => page.evaluate(() => {
  const overlay = document.getElementById('usb-overlay');
  const textEl = overlay?.querySelector('div');
  return {
    text: textEl?.textContent ?? null,
    overlayDisplay: overlay ? getComputedStyle(overlay).display : null,
  };
});

console.log('\n--- cue tracking ---');
let mismatches = 0;
const expectations = [
  { t: 1.0, expect: 'música animada' },
  { t: 2.5, expect: 'Dheeru: Hola.' },
  { t: 4.0, expect: 'bienvenidos de nuevo' },
  { t: 7.0, expect: 'independencia de plataforma' },
  { t: 3.0, expect: 'Dheeru: Hola.' },
];
for (const { t, expect } of expectations) {
  await page.evaluate((sec) => window.__seek(sec), t);
  await page.waitForTimeout(700);
  const s = await readOverlay();
  const ok = s.text && s.text.includes(expect);
  if (!ok) mismatches += 1;
  console.log(`  ${ok ? '✓' : '✗'} t=${t}s -> "${s.text}"`);
}

console.log(`\nMismatches: ${mismatches}`);
await page.screenshot({ path: 'qa-harness.png' });
await browser.close();
mediaServer.close();

if (mismatches > 0) {
  console.log('RESULT: FAIL');
  process.exitCode = 1;
} else {
  console.log('RESULT: PASS');
}
