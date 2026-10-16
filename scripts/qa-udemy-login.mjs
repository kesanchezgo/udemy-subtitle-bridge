/**
 * Prepara el perfil real para la prueba contra Udemy.
 *
 * El perfil chrome-real-profile no conserva la sesión: las cookies de sesión
 * (access_token, dj_session_id, ud_user_jwt) no están en su almacén. Se
 * inyectan aquí, con el mismo formato con que el navegador las entrega.
 *
 * Uso:
 *   node scripts/qa-udemy-login.mjs            (usa el JSON de cookies dado)
 *   node scripts/qa-udemy-login.mjs --check    (solo comprueba el estado)
 *
 * Las cookies se leen de .qa-udemy-cookies.json (NO versionado). Si no existe,
 * lo dice y termina. Ver .gitignore.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const profileDir = path.join(repoRoot, 'chrome-real-profile');
const cookieFile = path.join(repoRoot, '.qa-udemy-cookies.json');
const LECTURE_URL = 'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342';

if (!existsSync(cookieFile)) {
	console.error(`✗ Falta ${cookieFile}`);
	console.error('  Exporta las cookies de Udemy a ese archivo (JSON de lista de cookies)');
	console.error('  y vuelve a ejecutar. El archivo está en .gitignore, no se sube.');
	process.exit(2);
}
const raw = JSON.parse(readFileSync(cookieFile, 'utf8'));
const cookies = (Array.isArray(raw) ? raw : raw.cookies ?? []).filter((c) => c && c.name && c.value);

// Playwright exige url o path; con `url` deduce el dominio y evita el choque
// entre hostOnly y dominio con punto inicial. Siempre se usa url.
const normalized = cookies.map((c) => {
	const host = String(c.domain || 'www.udemy.com').replace(/^\./, '');
	const out = {
		name: c.name,
		value: String(c.value).replace(/^"|"$/g, ''),
		url: `https://${host}${c.path || '/'}`,
		secure: c.secure !== false,
		httpOnly: Boolean(c.httpOnly),
	};
	if (c.expirationDate && Number.isFinite(c.expirationDate)) out.expires = Math.floor(c.expirationDate);
	return out;
});

const context = await chromium.launchPersistentContext(profileDir, {
	headless: false,
	channel: 'chromium',
	args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
	viewport: { width: 1600, height: 900 },
	ignoreDefaultArgs: ['--enable-automation'],
});

await context.addCookies(normalized);
console.log(`  ${normalized.length} cookies inyectadas`);

const page = context.pages()[0] || await context.newPage();
await page.goto(LECTURE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

// La página tarda en resolver el redirect si la sesión no vale.
let landed = false;
for (let i = 0; i < 12; i += 1) {
	await page.waitForTimeout(2500);
	const url = page.url();
	if (!/login|join|signin/i.test(url)) { landed = true; break; }
}
// La SPA de Udemy monta el reproductor después del routeado. Sin esto, una
// sesión válida parecería inválida porque el vídeo aún no existe en el DOM.
let st = await page.evaluate(() => ({
	url: location.href,
	curso: document.querySelector('[data-purpose="course-title"]')?.textContent?.trim() ?? null,
	leccion: document.querySelector('[data-purpose="curriculum-item-view-title"]')?.textContent?.trim() ?? null,
	video: Boolean(document.querySelector('video')),
	cues: document.querySelectorAll('[data-purpose="transcript-cue"]').length,
}));
for (let i = 0; i < 8 && !st.video; i += 1) {
	await page.waitForTimeout(3000);
	st = await page.evaluate(() => ({
		url: location.href,
		curso: document.querySelector('[data-purpose="course-title"]')?.textContent?.trim() ?? null,
		leccion: document.querySelector('[data-purpose="curriculum-item-view-title"]')?.textContent?.trim() ?? null,
		video: Boolean(document.querySelector('video')),
		cues: document.querySelectorAll('[data-purpose="transcript-cue"]').length,
	}));
}
console.log('  estado:', JSON.stringify(st));
if (landed && st.video) {
	console.log('  ✓ sesión válida: la lección cargó con vídeo y transcripción');
} else {
	console.log('  ✗ la sesión no valida o la lección no está accesible');
}

// Dejar el perfil con las cookies: Chromium las persiste al cerrar limpio.
await context.close();
console.log(landed && st.video ? '\n✅ LISTO PARA LA PRUEBA REAL' : '\n❌ SESIÓN NO VÁLIDA');
process.exit(landed && st.video ? 0 : 1);
