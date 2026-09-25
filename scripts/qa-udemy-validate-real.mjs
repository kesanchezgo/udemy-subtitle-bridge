// Validación del proveedor sobre UDEMY REAL con las cookies del usuario,
// usando el MISMO flujo que el usuario: panel "Motores de IA" → OpenAI →
// URL/key/modelo → "Probar y guardar" → leer el veredicto del panel.
// Sin seeding por SW (esa vía colgaba con el target del SW no responsivo):
// el panel persiste por sus propios medios (onSaveProvider).
//
// Run: node scripts/qa-udemy-validate-real.mjs

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
const distDir = path.join(repoRoot, 'dist');
const COOKIES_FILE = process.env.USB_COOKIES || path.join(tmpdir(), 'usb-qa-udemy-cookies.json');
const COURSE_URL = process.env.USB_COURSE_URL || 'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342?start=0#overview';
const MODEL_MUERTO = process.env.USB_MODEL_MUERTO || 'cline-free/gemini-3.8-flash';
const MODEL_OK = 'muse-spark-1.3-contributor-free';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const step = (m) => console.log(`\n▶ ${m}`);
async function dockText(page) {
	return page.evaluate(() => document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot?.textContent || '');
}
async function fail(message, page, label) {
	console.error(`\n❌ ${message}`);
	try {
		await page.screenshot({ path: path.join(repoRoot, `qa-udemy-validate-FAIL-${label}.png`) });
	} catch {}
	process.exit(1);
}

if (!existsSync(distDir)) { console.error('dist/ no existe'); process.exit(1); }
if (!existsSync(COOKIES_FILE)) { console.error('sin cookies en', COOKIES_FILE); process.exit(1); }

const SAME_SITE = { lax: 'Lax', strict: 'Strict', no_restriction: 'None' };
const cookies = JSON.parse(readFileSync(COOKIES_FILE, 'utf-8')).map((c) => {
	const out = { name: c.name, value: c.value, domain: c.domain, path: c.path || '/', secure: Boolean(c.secure), httpOnly: Boolean(c.httpOnly) };
	if (!c.session && typeof c.expirationDate === 'number') out.expires = c.expirationDate;
	const ss = SAME_SITE[String(c.sameSite).toLowerCase()];
	if (ss) out.sameSite = ss;
	return out;
});

const userDataDir = path.join(tmpdir(), 'usb-qa-udemy-validate-profile');
rmSync(userDataDir, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(userDataDir, {
	headless: false,
	viewport: { width: 1400, height: 950 },
	args: [
		`--disable-extensions-except=${distDir}`,
		`--load-extension=${distDir}`,
		'--lang=es',
		'--disable-features=ExternalProtocolDialog',
	],
});
await context.addCookies(cookies);
const page = await context.newPage();
page.on('pageerror', (e) => console.log('   [pageerror]', String(e).slice(0, 120)));

step(`Navegando a la lección real (bot-detection puede tardar)`);
let navigated = false;
for (let attempt = 0; attempt < 2 && !navigated; attempt++) {
	try {
		await page.goto(COURSE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
	} catch (e) {
		console.log('   goto lento — esperando al dock igualmente…');
	}
	navigated = await page.waitForSelector('[id^="usb-dock-host-"]', { timeout: 30000 }).then(() => true).catch(() => false);
	if (!navigated && attempt === 0) {
		console.log('   dock no montó — recargando una vez…');
		await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
	}
}
if (!navigated) await fail('dock nunca montó en udemy.com real', page, 'montaje');
console.log('   dock montado en la lección real');

if (page.url().includes('/login')) await fail('las cookies expiraron (redirigió a login)', page, 'login');

step('Skipping the auth guard');
try {
	await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 6000 });
	console.log('   auth guard skipped');
} catch {
	console.log('   no auth guard');
}
await sleep(1000);

step('Opening the AI engines panel and configuring OpenAI-compatible');
await page.locator('[title="Configurar motores de IA"]').first().click({ timeout: 10000 });
await sleep(800);
const panel = page.locator('[id^="usb-dock-host-"] .usb-ai-panel').first();
await panel.locator('button:has-text("OpenAI")').first().click({ timeout: 5000 }).catch(() => null);
await sleep(300);

// El panel hidrata sus campos desde chrome.storage de forma asíncrona: los
// fills pueden ser pisados por la hidratación. Rellenar con READBACK hasta
// que el valor se quede (3 intentos).
async function fillStable(locator, value) {
	for (let i = 0; i < 5; i++) {
		await locator.fill(value).catch(() => null);
		await sleep(900);
		const current = await locator.inputValue().catch(() => null);
		if (current === value) return true;
	}
	return (await locator.inputValue().catch(() => '')) === value;
}
const urlInput = panel.locator('input[placeholder*="api.openai"]').first();
const keyInput = panel.locator('input[placeholder*="sk-"]').first();
const urlOk = await fillStable(urlInput, 'http://127.0.0.1:6660/v1');
const keyOk = await fillStable(keyInput, 'gmifree');
console.log(`   fields estables: url=${urlOk} key=${keyOk}`);
if (!urlOk || !keyOk) {
	console.log('   ⚠️ fill inestable — continuando: el veredicto del panel dirá qué se validó');
}

step('Validating model with a DEAD proxy route');
await fillStable(panel.locator('input[placeholder*="gpt-4o"]').first(), MODEL_MUERTO);
await panel.locator('button:has-text("Probar y guardar")').first().click({ timeout: 10000 });
let verdictMuerto = '(sin veredicto en 40 s)';
for (let i = 0; i < 20; i++) {
	await sleep(2000);
	// Veredicto SOLO del panel (los toasts del dock contienen otros mensajes
	// con 'contactar' que enmascaran la lectura global).
	const v = await panel.locator('p').filter({ hasText: /✓|⚠/ }).first().textContent().catch(() => null);
	if (v) { verdictMuerto = v.slice(0, 140); break; }
}
console.log(`   veredicto modelo muerto: ${verdictMuerto}`);
if (!/(no respondió en 25 s|403|access_denied)/.test(verdictMuerto)) {
	await fail(`se esperaba un veredicto accionable del probe y se obtuvo: ${verdictMuerto}`, page, 'timeout-msg');
}
console.log('   ✅ veredicto accionable para la ruta muerta (sin hardstop genérico)');

step('Validating model with a LIVE proxy route');
await fillStable(panel.locator('input[placeholder*="gpt-4o"]').first(), MODEL_OK);
await panel.locator('button:has-text("Probar y guardar")').first().click({ timeout: 10000 });
let verdictOk = '(sin veredicto en 40 s)';
for (let i = 0; i < 20; i++) {
	await sleep(2000);
	const v = await panel.locator('p').filter({ hasText: /✓|⚠/ }).first().textContent().catch(() => null);
	if (v) { verdictOk = v.slice(0, 140); break; }
}
console.log(`   veredicto muse-spark: ${verdictOk}`);
if (!/(Conexión correcta|403|access_denied)/.test(verdictOk)) {
	await fail(`muse-spark debería producir un veredicto del proxy y se obtuvo: ${verdictOk}`, page, 'muse-fail');
}
console.log('   ✅ veredicto del proxy recibido (403 de policy = GMIFREE_CORS_ORIGINS en el proxy)');


// La config debe persistir aunque el pre-vuelo falle (guardado incondicional).
// Leerla vía el SW de la EXTENSIÓN (filtro por URL: la página de Udemy
// registra los suyos) con reintentos de wake.
let savedCfg = null;
for (let i = 0; i < 3 && !savedCfg; i++) {
	const w = context.serviceWorkers().filter((x) => x.url().startsWith('chrome-extension://')).pop()
		|| await context.waitForEvent('serviceworker', { timeout: 4000 }).catch(() => null);
	if (!w) continue;
	savedCfg = await Promise.race([
		w.evaluate(() => new Promise((res) => chrome.storage.local.get(['usg_ai_provider_config'], (r) => res(r.usg_ai_provider_config || null)))),
		sleep(3000).then(() => null),
	]).catch(() => null);
	if (!savedCfg || !savedCfg.model) savedCfg = null;
}
if (!savedCfg || savedCfg.model !== MODEL_OK) {
	await fail(`la config no se persistió con el modelo sano (persistió: "${String(savedCfg ? savedCfg.model : 'nada').slice(0, 60)}")`, page, 'persist');
}
console.log(`   ✅ config persistida en storage: ${savedCfg.baseUrl} · ${savedCfg.model}`);
await page.screenshot({ path: path.join(repoRoot, 'qa-udemy-validate-final.png') });

console.log('\n=== RESUMEN ===');
console.log(`modelo muerto : ${verdictMuerto}`);
console.log(`muse-spark    : ${verdictOk}`);

await context.close().catch(() => undefined);
process.exit(/Conexión correcta/.test(verdictOk) && /no respondió en 25 s/.test(verdictMuerto) ? 0 : 1);
