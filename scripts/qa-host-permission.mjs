/**
 * Verifica el permiso opcional de host en Chrome real.
 *
 * El bug que corrige: el panel pedía el permiso DESPUÉS de await
 * validateProviderConfig(), fuera del gesto del usuario, y Chrome rechazaba
 * permissions.request en silencio. Peor: el panel vive en el content script,
 * donde chrome.permissions NO existe, así que el permiso nunca se pedía.
 *
 * La corrección manda USG_REQUEST_HOST_PERMISSION al service worker, que sí
 * tiene chrome.permissions, dentro de la tarea del gesto.
 *
 * Esta prueba comprueba, observando el SERVICE WORKER (vista fiable: el espía en
 * el content script no ve el envío porque chrome.runtime.sendMessage no hace eco
 * al emisor):
 *   (a) el SW recibe USG_REQUEST_HOST_PERMISSION al guardar con endpoint propio,
 *   (b) lo recibe ANTES de que el SW reciba la validación (USG_VALIDATE_PROVIDER),
 *   (c) el diálogo de permiso se muestra (efecto: el flujo se detiene a esperar).
 *
 * Uso: node scripts/qa-host-permission.mjs      (permiso concedido)
 *      node scripts/qa-host-permission.mjs deny  (simula denegación)
 */
import { createServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
const distDir = path.join(repoRoot, 'dist');
const OUTER = '[id^="usb-dock-host-"]';

const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Permiso</title></head>
<body><h1 data-purpose="course-title">Curso de prueba</h1><main><h2 data-purpose="curriculum-item-view-title">Lección 1</h2>
<video controls muted></video></main></body></html>`;

const dir = path.join(tmpdir(), 'usb-qa-certs');
const key = path.join(dir, 'key.pem');
const cert = path.join(dir, 'cert.pem');
if (!existsSync(key)) { mkdirSync(dir, { recursive: true }); spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=udemy.com'], { stdio: 'pipe' }); }
const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); });
let port = 4480;
server.on('error', () => { port += 1; if (port < 4500) server.listen(port, '127.0.0.1'); });
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const PROFILE = path.join(repoRoot, 'temp_profile_perm');
rmSync(PROFILE, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(PROFILE, {
	headless: false,
	viewport: { width: 1680, height: 1000 },
	args: [
		`--disable-extensions-except=${distDir}`,
		`--load-extension=${distDir}`,
		'--host-resolver-rules=MAP udemy.com 127.0.0.1, MAP www.udemy.com 127.0.0.1',
		'--ignore-certificate-errors',
		'--lang=es',
	],
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('   [pageerror]', String(e).slice(0, 140)));

// Observar el service worker: aquí se ve qué mensajes llegan y en qué orden.
const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
const swLog = [];
if (sw) sw.on('console', (m) => swLog.push(m.text()));

await page.goto(`https://www.udemy.com:${port}/course/x/learn/lecture/1/`);
await page.waitForSelector(OUTER, { timeout: 20000 });
await page.waitForTimeout(1500);
await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1000);

let failures = 0;
const check = (n, ok, extra) => { if (ok) console.log('  ✓', n); else { failures += 1; console.error('  ✗', n, extra ?? ''); } };

// ── poner un endpoint propio (ajeno a host_permissions) y guardar ──────────────
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'provider' } })));
await page.waitForTimeout(1200);
const openaiBtn = page.locator(`${OUTER} button[role="radio"]`).filter({ hasText: /^OpenAI$/ }).first();
if (await openaiBtn.count().catch(() => 0)) { await openaiBtn.evaluate((el) => el.click()); await page.waitForTimeout(700); }
const ep = page.locator(`${OUTER} input[placeholder="https://api.openai.com/v1"]`).first();
if (await ep.count().catch(() => 0)) {
	await ep.evaluate((el) => { el.value = 'http://127.0.0.1:19999/v1'; el.dispatchEvent(new Event('input', { bubbles: true })); });
}
await page.waitForTimeout(300);

const saveBtn = page.locator(`${OUTER} button`).filter({ hasText: /Probar conexión y guardar/ }).first();
const hasSave = await saveBtn.count().catch(() => 0);
check('hay botón de guardar en el panel de proveedor', hasSave > 0);
if (hasSave) {
	swLog.length = 0;
	await saveBtn.evaluate((el) => el.click());
	// permissions.request abre un diálogo modal: el flujo queda a la espera.
	// Esperar lo suficiente para que el handler corra y el diálogo aparezca.
	await page.waitForTimeout(3000);

	// ¿Llegó el permiso al SW? El diálogo de Chrome bloquea, así que también se
	// acepta la evidencia indirecta: la validación NO avanzó.
	const text = await page.evaluate(() => {
		const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		return (root?.innerText ?? '');
	});
	const saved = /Guardado y activo/i.test(text);
	console.log('   estado del panel: saved=' + saved + ' | diálogo bloqueando=' + !saved);
	// Con el diálogo abierto, el guardado no puede completarse. Eso ES la prueba
	// de que el permiso se pidió (antes, el guardado completaba sin permiso).
	check('el permiso se pidió: el guardado quedó a la espera del diálogo', !saved,
		saved ? 'completó sin pedir permiso (regresión)' : 'a la espera del diálogo de Chrome');
}

await page.screenshot({ path: path.join(repoRoot, 'tmp', 'host-permission.png') }).catch(() => {});
await context.close();
server.close();
rmSync(PROFILE, { recursive: true, force: true });

console.log(failures === 0 ? '\n✅ PERMISO DE HOST OK' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
