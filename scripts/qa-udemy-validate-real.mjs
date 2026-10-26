// Validación del proveedor sobre UDEMY REAL con las cookies del usuario,
// usando el MISMO flujo que el usuario: panel "Motores de IA" → OpenAI →
// URL/key/modelo → "Probar y guardar" → leer el veredicto del panel.
//
// La sonda de validación NO envía max_tokens (los topes bajísimos colgaban
// rutas de modelos de razonamiento vía proxies gratuitos).
//
// Run: node scripts/qa-udemy-validate-real.mjs
//   USB_MODEL_A / USB_MODEL_B: los dos modelos a validar.

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
const MODEL_A = process.env.USB_MODEL_A || 'cline-free/gemini-3.8-flash';
const MODEL_B = process.env.USB_MODEL_B || 'qoder/qwen3.8-flash';
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

// Relleno con READBACK: el panel hidrata sus campos desde chrome.storage de
// forma asíncrona y puede pisar un fill temprano; rellenar hasta que se quede.
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

// ── Validación de cada modelo: sonda sin max_tokens (fix de rutas lentas) ──
async function tryValidate(model) {
	console.log(`\n=== VALIDANDO: ${model} ===`);
	await fillStable(panel.locator('input[placeholder*="gpt-4o"]').first(), model);
	await panel.locator('button:has-text("Probar y guardar")').first().click({ timeout: 10000 });
	for (let i = 0; i < 20; i++) {
		await sleep(2000);
		const v = await panel.locator('p').filter({ hasText: /✓|⚠/ }).first().textContent().catch(() => null);
		if (v) {
			console.log(`   veredicto: ${v.slice(0, 140)}`);
			return /Conexión correcta/i.test(v) ? 'ok' : v.slice(0, 120);
		}
	}
	return 'sin veredicto';
}

const r1 = await tryValidate(MODEL_A);
const r2 = await tryValidate(MODEL_B);

// La config debe persistir aunque un pre-vuelo falle (guardado incondicional)
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
if (!savedCfg || savedCfg.model !== MODEL_B) {
	await fail(`la config no se persistió con el modelo B (persistió: "${String(savedCfg ? savedCfg.model : 'nada').slice(0, 60)}")`, page, 'persist');
}
console.log(`   ✅ config persistida en storage: ${savedCfg.baseUrl} · ${savedCfg.model}`);

await page.screenshot({ path: path.join(repoRoot, 'qa-udemy-validate-final.png') });

console.log('\n=== RESUMEN ===');
console.log(`${MODEL_A} : ${r1 === 'ok' ? '✓ Conexión correcta' : r1}`);
console.log(`${MODEL_B} : ${r2 === 'ok' ? '✓ Conexión correcta' : r2}`);
console.log(`config persistida: ${savedCfg.baseUrl} · ${savedCfg.model}`);

await context.close().catch(() => undefined);
process.exit(r1 === 'ok' && r2 === 'ok' ? 0 : 1);
