// Reproduce EXACTAMENTE el flujo del usuario: panel "Motores de IA" →
// "Probar y guardar" → veredicto. Diagnostica por qué la validación puede
// quedarse en el hardstop de 45 s sin veredicto publicado.
// Run: node scripts/qa-validate-provider.mjs

import { createServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
const distDir = path.join(repoRoot, 'dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── fixture + cert + server (igual que qa-extension-local) ──
function ensureCert() {
	const dir = path.join(tmpdir(), 'usb-qa-certs');
	const key = path.join(dir, 'key.pem');
	const cert = path.join(dir, 'cert.pem');
	if (existsSync(key) && existsSync(cert)) return { key, cert };
	mkdirSync(dir, { recursive: true });
	spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=udemy.com'], { stdio: 'pipe' });
	return { key, cert };
}

const { key, cert } = ensureCert();
const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
	res.end('<!doctype html><html><body><h1>qa</h1></body></html>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const fixtureUrl = `https://www.udemy.com:${port}/course/qa/learn/lecture/1/`;
console.log('fixture:', fixtureUrl);

const userDataDir = path.join(tmpdir(), 'usb-qa-validate-profile');
rmSync(userDataDir, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(userDataDir, {
	headless: false,
	viewport: { width: 1200, height: 900 },
	args: [
		`--disable-extensions-except=${distDir}`,
		`--load-extension=${distDir}`,
		'--host-resolver-rules=MAP udemy.com 127.0.0.1, MAP www.udemy.com 127.0.0.1',
		'--ignore-certificate-errors',
		'--lang=es',
		'--disable-features=ExternalProtocolDialog',
	],
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('   [pageerror]', String(e).slice(0, 140)));

let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
console.log('SW:', sw ? 'ok' : 'NO');

await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
const dock = await page.waitForSelector('[id^="usb-dock-host-"]', { timeout: 20000 });
console.log('dock montado');

// Guest mode (el auth guard tapa el header si no se salta)
try {
	await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 });
	console.log('auth guard skipped');
} catch {
	console.log('no auth guard');
}
await sleep(800);

// Abrir el panel de IA (chip del header)
await page.locator('[title="Configurar motores de IA"]').first().click({ timeout: 10000 });
await sleep(800);

// Rellenar los campos como el usuario
await page.locator('[id^="usb-dock-host-"] input[placeholder*="http"], [id^="usb-dock-host-"] input[placeholder*="Base URL"]').first()
	.fill('http://127.0.0.1:6660/v1').catch(async () => {
		// fallback: los campos pueden no tener placeholder — por orden
	});
// Los campos del panel: Local/OpenAI segmented — seleccionar OpenAI si hace falta
const openaiTab = page.locator('[id^="usb-dock-host-"] button:has-text("OpenAI")').first();
if (await openaiTab.count() > 0) await openaiTab.click({ timeout: 3000 }).catch(() => null);
await sleep(400);
// Rellenar EXACTAMENTE lo que el usuario configuró
const panel = page.locator('[id^="usb-dock-host-"] .usb-ai-panel').first();
const fld = (ph) => panel.locator(`input[placeholder*="${ph}"]`).first();
await fld('api.openai.com').fill('http://127.0.0.1:6660/v1').catch(() => null);
await fld('sk-').fill('gmifree').catch(() => null);
await fld('gpt-4o').fill(process.env.USB_MODEL || 'qoder/qwen3.8-flash').catch(() => null);
const n = await panel.locator('input').count();
for (let i = 0; i < n; i++) {
	const el = panel.locator('input').nth(i);
	const ph = (await el.getAttribute('placeholder').catch(() => '')) || '';
	const val = (await el.inputValue().catch(() => '')) || '';
	console.log(`   [${i}] "${ph.slice(0, 34)}" = "${val.slice(0, 44)}"`);
}

// Click "Probar y guardar"
const probeBtn = page.locator('[id^="usb-dock-host-"] button:has-text("Probar y guardar")').first();
await probeBtn.click({ timeout: 10000 });
console.log('click Probar y guardar — esperando veredicto (máx 50 s)…');

let verdict = '';
for (let i = 0; i < 50; i++) {
	await sleep(1000);
	const t = await page.evaluate(() => document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot?.textContent || '');
	const m = t.match(/Conexión correcta[^"]*|no respondió a tiempo[^"]*|No se pudo contactar[^"]*|Validando…/);
	if (m) {
		if (m[0] !== verdict) { verdict = m[0]; console.log(`   [${i}s] ${verdict.slice(0, 90)}`); }
		if (!/Validando/.test(verdict)) break;
	}
}

// Re-resolver el SW (el handle original puede estar muerto tras teardown MV3)
const swNow = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 6000 }).catch(() => null);
let storage = null;
if (swNow) {
	storage = await Promise.race([
		swNow.evaluate(() => new Promise((res) => chrome.storage.local.get(['usg_provider_validation'], (r) => res(r.usg_provider_validation || null)))),
		sleep(5000).then(() => ({ error: 'SW evaluate no respondió en 5 s' })),
	]);
}
console.log('storage usg_provider_validation:', JSON.stringify(storage));
console.log('VEREDICTO FINAL:', verdict || '(ninguno)');

await page.screenshot({ path: path.join(repoRoot, 'qa-validate-provider.png') });
await context.close().catch(() => undefined);
server.close();
console.log('DONE');
process.exit(0);

process.on('uncaughtException', (e) => {
	console.error('UNCAUGHT:', String(e).slice(0, 200));
	try { context.close(); } catch {}
	try { server.close(); } catch {}
	process.exit(2);
});
