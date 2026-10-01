/**
 * Capturas de las pantallas del rediseño Kinema que el E2E no recorre:
 * login (AuthGuard), Dev panel, historial, panel de progreso y dock contraído,
 * en oscuro y claro — para el gate visual 1:1 contra el mock de Figma.
 *
 * Uso: node scripts/qa-kinema-captures.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '..', 'dist');
const repoRoot = path.resolve(__dirname, '..');

// Fixture mínimo de página Udemy (el content script necesita el patrón de URL)
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>QA — Kinema captures</title></head>
<body style="background:#1a1a2e;color:#fff;font-family:sans-serif;padding:40px">
<h1>Lecture fixture</h1><div id="studentVideoPlayer"></div></body></html>`;

function ensureCert() {
	const dir = path.join(tmpdir(), 'usb-qa-certs');
	const key = path.join(dir, 'key.pem');
	const cert = path.join(dir, 'cert.pem');
	if (fs.existsSync(key) && fs.existsSync(cert)) return { key, cert };
	fs.mkdirSync(dir, { recursive: true });
	spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=udemy.com'], { stdio: 'pipe' });
	return { key, cert };
}
const { key, cert } = ensureCert();
const server = createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/html' });
	res.end(PAGE);
});
let port = 443;
server.on('error', () => { port += 1; if (port < 8450) { server.close(); server.listen(port, '127.0.0.1'); } });
await new Promise((r) => server.listen(port, '127.0.0.1', r));
console.log('fixture en puerto', port);

const context = await chromium.launchPersistentContext(path.join(repoRoot, 'temp_profile_kinema'), {
	headless: false,
	colorScheme: 'dark',
	viewport: { width: 1680, height: 1000 },
	args: [
		`--disable-extensions-except=${distPath}`,
		`--load-extension=${distPath}`,
		'--host-resolver-rules=MAP udemy.com 127.0.0.1, MAP www.udemy.com 127.0.0.1',
		'--ignore-certificate-errors',
		'--lang=es',
	],
});
let sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);

fs.mkdirSync('tmp/kinema-shots', { recursive: true });
const page = await context.newPage();
await page.goto(`https://www.udemy.com:${port}/course/kinema-qa/learn/lecture/1/`);
await page.waitForSelector('[id^="usb-dock-host-"]', { timeout: 20000 });
await page.waitForTimeout(2500);

const dock = page.locator('[id^="usb-dock-host-"]');

// ── 1. Login (AuthGuard) — estado inicial sin saltar ──────────────────────────
await page.screenshot({ path: 'tmp/kinema-shots/login-dark.png' });
console.log('  ✓ login-dark');

// Continuar sin cuenta → dock completo
const skip = page.locator('text=/Continuar sin cuenta/i').first();
if (await skip.count()) await skip.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(1500);

async function shot(name) {
	await page.screenshot({ path: `tmp/kinema-shots/${name}.png` });
	console.log(`  ✓ ${name}`);
}

// ── 2. Panel de progreso (oscuro) ──────────────────────────────────────────
const progressBtn = page.locator('[id^="usb-dock-host-"] button[aria-label="Abrir progreso"]').first();
if (await progressBtn.count()) {
	await progressBtn.click({ timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(900);
	await shot('progress-dark');
	await progressBtn.click({ timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(600);
} else { console.log('  · botón de progreso no encontrado'); }

// ── 3. Historial (oscuro) ──────────────────────────────────────────────────
await page.evaluate(() => {
	const host = document.querySelector('[id^="usb-dock-host-"]');
	window.dispatchEvent(new CustomEvent('usb:open-history'));
});
await page.waitForTimeout(1200);
await shot('history-dark');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-history')));
await page.waitForTimeout(600);

// ── 4. Tema claro + progreso sepia ─────────────────────────────────────────
const themeBtn = page.locator('[id^="usb-dock-host-"] button[aria-label="Cambiar a tema claro"]').first();
if (await themeBtn.count()) {
	await themeBtn.click({ timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(900);
}
if (await progressBtn.count()) {
	await progressBtn.click({ timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(900);
	await shot('progress-sepia');
	await progressBtn.click({ timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(600);
}

// ── 5. Dock contraído (al final, y re-expandir con verificación) ───────────
const collapseBtn = page.locator('[id^="usb-dock-host-"] button[aria-label="Colapsar dock"]').first();
if (await collapseBtn.count()) {
	await collapseBtn.click({ timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(900);
	await shot('collapsed-dark');
	const expandBtn = page.locator('[id^="usb-dock-host-"] [title="Expandir Kinema"]').first();
	await expandBtn.click({ timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(900);
	const w = (await (await page.waitForSelector('[id^="usb-dock-host-"]')).boundingBox())?.width ?? 0;
	console.log(`  re-expandido: ${w.toFixed(0)}px ${w > 300 ? '✓' : '✗ NO RE-EXPANDIÓ'}`);
} else { console.log('  · botón de colapso no encontrado'); }

await context.close();
server.close();
fs.rmSync(path.join(repoRoot, 'temp_profile_kinema'), { recursive: true, force: true });
console.log('\nCapturas en tmp/kinema-shots/');
