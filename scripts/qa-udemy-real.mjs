// QA en UDEMY REAL: carga la sesión del usuario (cookies exportadas), abre la
// lección real del curso, y verifica el pipeline completo sobre el sitio vivo:
//   1. dock montado en udemy.com real + metadatos raspados (curso/lección),
//   2. captura de subtítulos EN del reproductor real (network VTT / textTracks
//      / panel de transcripción),
//   3. sesión de estudio generada con IA real (muse-spark vía proxy local),
//   4. exportación .apkg descargada y auditada por SQLite (mazo Curso::Lección
//      con las plantillas dev-card).
//
// Requisitos:
//   - Cookies en USB_COOKIES (default: %TEMP%/usb-qa-udemy-cookies.json),
//     exportadas desde una sesión logueada de Udemy (formato EditThisCookie).
//   - El proxy del provider corriendo en 127.0.0.1:6660 con muse-spark.
//
// Run: node scripts/qa-udemy-real.mjs
//   USB_COURSE_URL=... node scripts/qa-udemy-real.mjs
//
// Artifacts: qa-udemy-objectives.png, qa-udemy-study.png, qa-udemy-apkg-audit ok.
//
// NOTA DE SEGURIDAD: las cookies son credenciales de sesión vivas. Viven en el
// archivo temporal indicado y en el perfil de prueba (fuera del repo). Borra el
// archivo al terminar y, si quieres, cierra la sesión de Udemy para rotarlas.

import { createServer } from 'node:https';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { sessionExportKey } from '../src/app/services/obsidianExport.ts';

chromium.use(stealth());

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
const distDir = path.join(repoRoot, 'dist');
const COOKIES_FILE = process.env.USB_COOKIES || path.join(tmpdir(), 'usb-qa-udemy-cookies.json');
const COURSE_URL = process.env.USB_COURSE_URL || 'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342?start=0#overview';
const PROVIDER_CFG = {
	kind: 'openai',
	baseUrl: process.env.USB_PROVIDER_BASE_URL || 'http://127.0.0.1:6660/v1',
	apiKey: process.env.USB_PROVIDER_API_KEY || 'gmifree',
	model: process.env.USB_MODEL || 'muse-spark-1.3-contributor-free',
};

const step = (msg) => console.log(`\n▶ ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const qaMark = () => page.evaluate(() => document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot?.querySelector('#usb-dock-root')?.getAttribute('data-usb-qa-last') || '(sin marca)');

async function dockText(page) {
	return page.evaluate(() => {
		const host = document.querySelector('[id^="usb-dock-host-"]');
		return host?.shadowRoot?.textContent || '';
	});
}

async function fail(message, page, label) {
	console.error(`\n❌ ${message}`);
	if (page) {
		try {
			console.error('--- dock text snapshot ---\n' + (await dockText(page)).slice(-2500));
			await page.screenshot({ path: path.join(repoRoot, `qa-udemy-FAIL-${label}.png`) });
			console.error(`--- screenshot: qa-udemy-FAIL-${label}.png`);
		} catch { /* best effort */ }
	}
	process.exit(1);
}

// ── Cookies: formato EditThisCookie → Playwright ─────────────────────────────

function toPlaywrightCookies(raw) {
	const SAME_SITE = { lax: 'Lax', strict: 'Strict', no_restriction: 'None' };
	return raw.map((c) => {
		const out = {
			name: c.name,
			value: c.value,
			domain: c.domain,
			path: c.path || '/',
			secure: Boolean(c.secure),
			httpOnly: Boolean(c.httpOnly),
		};
		if (!c.session && typeof c.expirationDate === 'number') out.expires = c.expirationDate;
		const ss = SAME_SITE[String(c.sameSite).toLowerCase()];
		if (ss) out.sameSite = ss;
		return out;
	});
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (!existsSync(distDir)) {
	console.error('dist/ no existe. Ejecuta: npm run build');
	process.exit(1);
}
if (!existsSync(COOKIES_FILE)) {
	console.error(`No hay cookies en ${COOKIES_FILE}. Exporta las cookies de tu sesión de Udemy (EditThisCookie) y guárdalas ahí.`);
	process.exit(1);
}

step('Loading Udemy session cookies');
const rawCookies = JSON.parse(readFileSync(COOKIES_FILE, 'utf-8'));
const cookies = toPlaywrightCookies(rawCookies);
console.log(`   ${cookies.length} cookies (${cookies.filter((c) => c.name === 'access_token' || c.name === 'ud_user_jwt').length} de sesión)`);

step('Launching Chromium with the real extension (REAL udemy.com — sin fixture)');
const userDataDir = path.join(tmpdir(), 'usb-qa-udemy-profile');
rmSync(userDataDir, { recursive: true, force: true });

const context = await chromium.launchPersistentContext(userDataDir, {
	headless: false,
	viewport: { width: 1680, height: 1000 },
	acceptDownloads: true,
	args: [
		`--disable-extensions-except=${distDir}`,
		`--load-extension=${distDir}`,
		'--lang=es',
		// Sin esto, el diálogo nativo «¿Abrir Obsidian?» bloquea la entrada.
		'--disable-features=ExternalProtocolDialog',
	],
});
await context.addCookies(cookies);

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => console.log('   [pageerror]', String(e).slice(0, 140)));

step('Waiting for the MV3 service worker');
let [sw] = context.serviceWorkers();
if (!sw) {
	sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
}
if (!sw) await fail('service worker never appeared', page, 'sw');

step('Seeding provider + Obsidian export config');
await sw.evaluate(({ cfg, obsidian }) => {
	return new Promise((resolve) => {
		chrome.storage.local.clear(() => {
			chrome.storage.local.set({
				usg_ai_provider_config: cfg,
				enabled: true,
				obsidian_export_config: obsidian,
			}, resolve);
		});
	});
}, {
	cfg: PROVIDER_CFG,
	obsidian: {
		vaultName: 'Dev Courses',
		sourcesFolder: 'wiki/fuentes',
		mocsFolder: 'cursos',
		includeCards: true,
		autoExport: false,
		includeRawSrt: false,
	},
});

step(`Navigating to the REAL lecture: ${COURSE_URL}`);
try {
	await page.goto(COURSE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
} catch (e) {
	await fail(`navigation failed: ${String(e).slice(0, 160)}`, page, 'nav');
}
await sleep(3000);

// ¿Login válido? Si Udemy redirige a /login o la página no es de lección, parar.
const currentUrl = page.url();
if (/\/login|\/sign/.test(currentUrl)) {
	await fail(`las cookies no sirven: Udemy redirigió a ${currentUrl}`, page, 'login');
}
console.log('   URL actual:', currentUrl);

step('Waiting for the dock to mount on REAL udemy.com');
const dockHost = await page.waitForSelector('[id^="usb-dock-host-"]', { timeout: 25000 }).catch(() => null);
if (!dockHost) await fail('dock host never mounted on real Udemy', page, 'mount');

const defaultWidth = (await dockHost.boundingBox())?.width;
console.log(`   dock mounted, width=${defaultWidth?.toFixed(0)}px`);

// Udemy usa bot-detection (HUMAN/PX): en un navegador automatizado puede
// servir el shell sin contenido (sin video, sin curriculum). El script espera
// hasta 3 min a que el contenido real aparezca — si Udemy muestra un
// checkpoint, resuélvelo a mano en la ventana del QA y el QA continúa solo.
let realContent = false;
let reloaded = false;
for (let i = 0; i < 36; i++) {
	const pageState = await page.evaluate(() => ({
		hasVideo: Boolean(document.querySelector('video')),
		hasCurriculum: Boolean(document.querySelector('[data-purpose="course-title"], [data-purpose="item-title"], .curriculum-item-view--title')),
		bodyHead: (document.body?.innerText || '').slice(0, 200),
	}));
	if (pageState.hasVideo || pageState.hasCurriculum) {
		realContent = true;
		break;
	}
	if (i === 12 && !reloaded) {
		reloaded = true;
		console.log('   contenido aún vacío — recargando la lección…');
		await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
	}
	if (i === 16) {
		console.log('   ⏳ Si la ventana del QA muestra un checkpoint o la lección vacía, interactúa a mano (login, captcha, play). El QA continúa solo.');
	}
	await sleep(5000);
}
if (!realContent) {
	await fail('la lección real nunca renderizó su contenido (posible bot-detection de Udemy). Prueba: login manual en la ventana del QA o cookies frescas.', page, 'contenido-real');
}
console.log('   ✅ contenido real de la lección renderizado');

step('Skipping the auth guard (local mode)');
try {
	await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 });
	console.log('   auth guard skipped');
} catch {
	console.log('   no auth guard — continuing');
}

step('Opening the Study tab');
try {
	await page.locator('[id^="usb-dock-host-"] >> text=/^Study$/').first().click({ timeout: 10000 });
} catch (e) {
	await fail(`could not open the Study tab: ${String(e).slice(0, 120)}`, page, 'tab');
}

step('Capturing REAL subtitles from the Udemy player');
// Estrategias en cascada: (1) esperar la captura pasiva (network VTT cuando el
// player carga), (2) reproducir el video muted, (3) abrir el panel Transcript.
const cueCount = async () => {
	const m = (await dockText(page)).match(/Subtítulos EN capturados(\d+)\s*líneas/i);
	return m ? Number(m[1]) : -1;
};
let cues = await cueCount();
if (cues <= 0) {
	console.log('   captura pasiva vacía — iniciando playback muted…');
	await page.evaluate(() => {
		const v = document.querySelector('video');
		if (v) { v.muted = true; v.play?.().catch(() => undefined); }
	});
	await sleep(6000);
	cues = await cueCount();
}
if (cues <= 0) {
	console.log('   intentando abrir el panel de Transcript…');
	for (const label of ['Transcript', 'Transcripción']) {
		const btn = page.locator(`button:has-text("${label}")`).first();
		if (await btn.count().catch(() => 0) > 0) {
			await btn.click({ timeout: 4000 }).catch(() => null);
			break;
		}
	}
	await sleep(6000);
	cues = await cueCount();
}
if (cues <= 0) {
	await fail('no se capturaron subtítulos EN del reproductor real (0 líneas tras playback + transcript)', page, 'captura');
}
console.log(`   ✅ subtítulos EN capturados del reproductor real: ${cues} líneas`);

step('Verifying REAL course metadata (confirmado por el usuario)');
const realCourseTitle = (await page.title()).replace(/^Course:\s*/i, '').replace(/\s*\|\s*Udemy\s*$/i, '').trim();
console.log('   título real de la página:', realCourseTitle);
try {
	await page.locator('text=/PARA QUÉ ESTUDIAS ESTO/i').first().waitFor({ timeout: 20000 });
} catch (e) {
	await fail(`Study tab content never appeared: ${String(e).slice(0, 120)}`, page, 'objectives');
}
// El content script auto-rellena agent_course_name/agent_lesson_name por
// chrome.storage.sync (mismo canal de usePersistedState): el dock hidrata
// el input con el título REAL de la página. Verificar por inputValue.
const courseInputReal = page.locator('[id^="usb-dock-host-"] input[placeholder*="Nombre del curso"]').first();
let courseOk = false;
let autoFillValue = null;
for (let i = 0; i < 15; i++) {
	await sleep(2000);
	autoFillValue = await courseInputReal.inputValue().catch(() => null);
	if (autoFillValue && /Java In-Depth/i.test(autoFillValue)) { courseOk = true; break; }
}
await page.screenshot({ path: path.join(repoRoot, 'qa-udemy-dock.png') });
if (!courseOk) {
	await fail(`el dock no auto-rellenó el curso real (input="${String(autoFillValue).slice(0, 60)}")`, page, 'metadata');
}
console.log(`   ✅ curso real auto-rellenado: "${autoFillValue}"`);

step('Waiting for objectives (REAL AI, curso real)');
let objectivesLoaded = false;
for (let i = 0; i < 30; i++) {
	const text = await dockText(page);
	const pending = /Objetivos pendientes de IA real/i.test(text);
	objectivesLoaded = !pending && /Regenerar/i.test(text);
	if (objectivesLoaded && !/Generando/i.test(text)) break;
	if (pending && i % 4 === 3) {
		await page.locator('[id^="usb-dock-host-"] button:has-text("Regenerar con IA")').first().click({ timeout: 5000 }).catch(() => null);
	}
	await sleep(2500);
}
if (!objectivesLoaded) {
	await fail('objective cards never rendered content', page, 'objectives');
}
await page.screenshot({ path: path.join(repoRoot, 'qa-udemy-objectives.png') });
console.log('   objectives OK con el curso real → qa-udemy-objectives.png');

step('Generating the study session (REAL transcript + REAL AI)');
try {
	await page.locator('[id^="usb-dock-host-"] button:has-text("Generar sesión de aprendizaje")').first().click({ timeout: 10000 });
} catch (e) {
	await fail(`could not click the generate button: ${String(e).slice(0, 120)}`, page, 'generate');
}
let sessionOk = false;
for (let i = 0; i < 60; i++) {
	await sleep(2500);
	const text = await dockText(page);
	if (/Generando|Analizando|Preparando/i.test(text)) continue;
	if (/¿Lo sé\?|Próximo paso concreto/i.test(text) && !/No se pudo/i.test(text)) {
		sessionOk = true;
		break;
	}
	if (/No se pudo|Error al generar/i.test(text)) {
		await fail('study generation reported an error on the REAL course', page, 'study-error');
	}
}
if (!sessionOk) {
	await fail('study session did not render after 150s (curso real)', page, 'study-timeout');
}
await page.screenshot({ path: path.join(repoRoot, 'qa-udemy-study.png') });
console.log('   ✅ sesión de estudio generada con la transcripción REAL → qa-udemy-study.png');

step('Driving the stepper to step 5 (Anki) for the export — flujo Kinema');
try {
	// 1) Nivel: elegir confianza (auto-avanza a Repaso, 2/5).
	await page.locator('[id^="usb-dock-host-"] button:has-text("Entendido")').first().click({ timeout: 15000 });
	// 2) Avanzar a Recordar (preguntas).
	await page.locator('[id^="usb-dock-host-"] button:has-text("Siguiente")').first().click({ timeout: 15000 });
	// 3) Recordar: escape hatch que completa las preguntas (→ Práctica, 4/5).
	await page.locator('[id^="usb-dock-host-"] button:has-text("Saltar a la práctica")').first().click({ timeout: 15000 });
	// 4) Práctica → Anki (5/5).
	await page.locator('[id^="usb-dock-host-"] button:has-text("Siguiente")').first().click({ timeout: 15000 });
} catch (e) {
	await fail(`stepper did not reach the export step: ${String(e).slice(0, 140)}`, page, 'stepper');
}
await sleep(800);

step('Verifying .apkg export with the REAL course deck');
let apkgOk = false;
const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).then(
	(d) => ({ d }),
	() => ({}),
);
await page.locator('[id^="usb-dock-host-"] button:has-text(".apkg")').first().click({ timeout: 10000 });
console.log(`   breadcrumb tras click: ${await qaMark()}`);
const ev = await Promise.race([
	downloadPromise,
	sleep(32000).then(() => ({})),
]);
if (!ev.d) {
	await fail('.apkg download event no disparado (curso real)', page, 'apkg-download');
}
const apkgFile = path.join(tmpdir(), 'usb-qa-udemy-export.apkg');
await ev.d.saveAs(apkgFile);
try {
	const { default: JSZip } = await import('jszip');
	const { default: initSqlJs } = await import('sql.js');
	const zip = await JSZip.loadAsync(readFileSync(apkgFile));
	const colBytes = await zip.file('collection.anki2').async('uint8array');
	const SQL = await initSqlJs({ locateFile: (f) => path.join(repoRoot, 'node_modules', 'sql.js', 'dist', f) });
	const db = new SQL.Database(colBytes);
	const colRow = db.exec('SELECT models, decks FROM col LIMIT 1')[0].values[0];
	const models = JSON.parse(colRow[0]);
	const decks = JSON.parse(colRow[1]);
	const deckNames = Object.values(decks).map((d) => d.name);
	const realDeck = deckNames.find((n) => n.includes('::') && /Java In-Depth/i.test(n));
	if (!realDeck) throw new Error('mazo del curso real ausente: ' + deckNames.join(', '));
	const model = Object.values(models).find((m) => m.name === 'Udemy Bridge Concept');
	if (!model) throw new Error('modelo Udemy Bridge Concept ausente: ' + Object.values(models).map((m) => m.name).join(', '));
	if (!model.tmpls[0].qfmt.includes('anki-wrapper dev-card')) throw new Error('plantilla dev-card ausente');
	const conceptFlds = model.flds.map((f) => f.name);
	if (JSON.stringify(conceptFlds) !== JSON.stringify(['Front', 'Back', 'Leccion', 'Fuente'])) throw new Error('campos incorrectos: ' + conceptFlds.join(','));
	const rootDeckName = deckNames.find((n) => n === 'Udemy Bridge');
	if (!rootDeckName) throw new Error('árbol Udemy Bridge ausente');
	const notes = db.exec('SELECT guid, sfld FROM notes')[0]?.values || [];
	const guids = notes.map((n) => n[0]);
	if (new Set(guids).size !== guids.length) throw new Error('GUIDs duplicados');
	apkgOk = true;
	console.log(`   ✅ .apkg del curso real válido: ${notes.length} notas en "${realDeck}"`);
	db.close();
} catch (e) {
	await fail('.apkg audit (curso real): ' + e.message, page, 'apkg-audit');
}

// ── Fase: SRT ES (traducción automática del curso real) ──────────────────────
step('Verifying ES translation state (curso real)');
const dockTextEs = await page.evaluate(() => document.querySelector('[id^="usb-dock-host-"]').shadowRoot.textContent);
const esOk = /SRT Español · (Completo|Parcial)/i.test(dockTextEs);
if (!esOk) console.log('   · el curso puede tener ES nativo o la traducción sigue en curso — no fatal');
else console.log('   ✅ SRT Español presente en el curso real');

// ── Fase: Vocabulario EN del curso real → .apkg ──────────────────────────────
step('Exporting REAL course vocabulary (.apkg)');
let vocabOk = false;
const vocabDownload = page.waitForEvent('download', { timeout: 90000 }).then((d) => ({ d }), () => ({}));
await page.locator('[id^="usb-dock-host-"] button:has-text("Extraer vocabulario")').first().click({ timeout: 15000 });
await sleep(3000);
const vocabEv = await Promise.race([vocabDownload, sleep(95000).then(() => ({}))]);
if (!vocabEv.d) {
	await fail('vocabulario: download event no disparado (curso real)', page, 'vocab-download');
} else {
	const vocabFile = path.join(tmpdir(), 'usb-qa-udemy-vocab.apkg');
	await vocabEv.d.saveAs(vocabFile);
	try {
		const { default: JSZip } = await import('jszip');
		const { default: initSqlJs } = await import('sql.js');
		const zip = await JSZip.loadAsync(readFileSync(vocabFile));
		const colBytes = await zip.file('collection.anki2').async('uint8array');
		const SQL = await initSqlJs({ locateFile: (f) => path.join(repoRoot, 'node_modules', 'sql.js', 'dist', f) });
		const db = new SQL.Database(colBytes);
		const colRow = db.exec('SELECT models, decks FROM col LIMIT 1')[0].values[0];
		const models = JSON.parse(colRow[0]);
		const decks = JSON.parse(colRow[1]);
		const vocabModel = Object.values(models).find((m) => m.name === 'Udemy Bridge Vocab');
		if (!vocabModel) throw new Error('modelo Udemy Bridge Vocab ausente');
		const flds = vocabModel.flds.map((f) => f.name);
		if (JSON.stringify(flds) !== JSON.stringify(['word', 'phonetic', 'sentence', 'translation', 'bilingual', 'monolingual', 'picture', 'sentence audio', 'word audio'])) {
			throw new Error('campos de vocabulario incorrectos: ' + flds.join(','));
		}
		const vocabDeck = Object.values(decks).find((d) => /Vocabulary::English::/i.test(d.name));
		if (!vocabDeck) throw new Error('mazo de vocabulario ausente: ' + Object.values(decks).map((d) => d.name).join(', '));
		const notes = db.exec('SELECT guid, sfld FROM notes')[0]?.values || [];
		if (notes.length === 0) throw new Error('0 notas de vocabulario');
		for (const n of notes) if (!n[0].startsWith('usb')) throw new Error('GUID sin prefijo usb');
		vocabOk = true;
		console.log(`   ✅ vocabulario real: ${notes.length} palabras en "${vocabDeck.name}" (fonética/definición incluidas)`);
		db.close();
	} catch (e) {
		await fail('vocabulario (curso real): ' + e.message, page, 'vocab-audit');
	}
}

// ── Fase: Obsidian (URIs reales del curso real) + guard de duplicados ─────────
step('Exporting to Obsidian (curso real) + duplicate guard');
await page.evaluate(() => {
	if (!window.__qaUriShim) {
		window.__qaUriShim = true;
		window.__qaUris = [];
		const obs = new MutationObserver((muts) => {
			for (const m of muts) {
				m.addedNodes.forEach((n) => {
					if (n && n.tagName === 'A' && String(n.getAttribute('href') || '').startsWith('obsidian://')) {
						window.__qaUris.push(n.getAttribute('href'));
					}
				});
			}
		});
		obs.observe(document.body, { childList: true, subtree: true });
	}
});
let obsidianOk = false;
try {
	await page.locator('[id^="usb-dock-host-"] button').filter({ hasText: /^Exportar$/ }).first().click({ timeout: 15000 });
	await sleep(3000);
	const uris = await page.evaluate(() => window.__qaUris || []);
	if (uris.length !== 2) throw new Error('esperaba 2 URIs (MOC+sesión), llegaron ' + uris.length);
	const decoded = uris.map((u) => decodeURIComponent(u));
	const session = decoded.find((d) => d.includes('type%3A%20sesion') || d.includes('type: sesion'));
	const moc = decoded.find((d) => d.includes('type%3A%20curso') || d.includes('type: curso'));
	if (!session) throw new Error('falta la URI de sesión');
	if (!moc) throw new Error('falta la URI de MOC');
	if (!session.includes('obsidian://new?vault=')) throw new Error('vault malformado');
	obsidianOk = true;
	console.log(`   ✅ 2 URIs de Obsidian capturadas (sesión ${(session.length / 1024).toFixed(1)} kB + MOC del curso real)`);
	await page.screenshot({ path: path.join(repoRoot, 'qa-udemy-obsidian.png') });
	await page.locator('[id^="usb-dock-host-"] button').filter({ hasText: /^Exportar$/ }).first().click({ timeout: 15000 });
	await sleep(1800);
	const urisAfter = await page.evaluate(() => (window.__qaUris || []).length);
	if (urisAfter !== uris.length) throw new Error('guard FALLÓ: reexportó sin avisar');
	console.log('   ✅ guard de duplicados OK en el curso real');
} catch (e) {
	await fail('obsidian (curso real): ' + e.message, page, 'obsidian-real');
}

// ── Fase: Historial + Progreso + Tema en la página real ──────────────────────
step('History, progress panel and theme switch (página real)');
let panelOk = false;
try {
	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-history')));
	await sleep(1200);
	await page.screenshot({ path: path.join(repoRoot, 'qa-udemy-history.png') });
	const histText = await page.evaluate(() => document.querySelector('[id^="usb-dock-host-"]').shadowRoot.textContent);
	if (/Java In-Depth/i.test(histText)) console.log('   ✅ historial muestra el curso real');
	else console.log('   · historial abierto (sin entrada del curso aún)');
	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-history')));
	await sleep(600);
	const progressBtn = page.locator('[id^="usb-dock-host-"] button[aria-label="Abrir progreso"]').first();
	if (await progressBtn.count()) {
		await progressBtn.click({ timeout: 5000 });
		await sleep(900);
		await page.screenshot({ path: path.join(repoRoot, 'qa-udemy-progress.png') });
		await progressBtn.click({ timeout: 5000 }).catch(() => {});
		await sleep(500);
	}
	const themeBtn = page.locator('[id^="usb-dock-host-"] button[aria-label^="Cambiar a tema"]').first();
	if (await themeBtn.count()) {
		await themeBtn.click({ timeout: 5000 });
		await sleep(900);
		await page.screenshot({ path: path.join(repoRoot, 'qa-udemy-theme.png') });
		console.log('   ✅ tema alternado en la página real');
	}
	panelOk = true;
} catch (e) {
	await fail('paneles (curso real): ' + e.message, page, 'panels-real');
}

console.log('\n=== QA UDEMY REAL — RESUMEN ===');
console.log(`dock: OK | metadatos: ${courseOk ? 'OK' : 'FAIL'} | subtítulos: ${cues} líneas | sesión: ${sessionOk ? 'OK' : 'FAIL'} | apkg: ${apkgOk ? 'OK' : 'FAIL'} | srt-es: ${esOk ? 'OK' : 'n/a'} | vocab: ${vocabOk ? 'OK' : 'FAIL'} | obsidian: ${obsidianOk ? 'OK' : 'FAIL'} | paneles: ${panelOk ? 'OK' : 'FAIL'}`);
console.log(`export dir: ${repoRoot}`);

await context.close();
process.exit(sessionOk && apkgOk && courseOk && vocabOk && obsidianOk && panelOk ? 0 : 1);
