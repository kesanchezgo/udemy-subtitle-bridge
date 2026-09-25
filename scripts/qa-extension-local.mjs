// Full local visual QA for the BUILT extension (dist/), not the standalone
// React app. Unlike scripts/qa-local.js (which mounts the sidebar without a
// service worker, so background-dependent features show error banners), this
// script:
//   1. loads dist/ as a real MV3 extension in Chromium,
//   2. serves a deterministic Udemy-shaped fixture page under
//      https://www.udemy.com/course/... using --host-resolver-rules + a
//      throwaway self-signed cert (no hosts-file edits, no network), so the
//      REAL content script injects,
//   3. seeds chrome.storage with the local AI provider (muse-spark proxy) and
//      the Obsidian export config,
//   4. generates objectives + a study session with REAL AI through the dock,
//      drives the full stepper to "No olvidar" and verifies the export paths:
//      ayuda in-app, portapapeles, .apkg real (unzip + SQLite audit), URIs
//      obsidian:// capturadas y guard de duplicados,
//   5. screenshots the dock at the default text scale and again with the
//      browser default font bumped to 20px, to verify the typography scale.
//
// Run: npm run qa:extension        (build + this script)
//      node scripts/qa-extension-local.mjs   (assumes dist/ is fresh)
//
// Artifacts: qa-extension-objectives.png, qa-extension-study.png,
//            qa-extension-export.png, qa-extension-scaled-20px.png

import { createServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { sessionExportKey } from '../src/app/services/obsidianExport.ts';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
const distDir = path.join(repoRoot, 'dist');
const PROVIDER_CFG = {
	kind: 'openai',
	baseUrl: process.env.USB_PROVIDER_BASE_URL || 'http://127.0.0.1:6660/v1',
	apiKey: process.env.USB_PROVIDER_API_KEY || 'gmifree',
	model: process.env.USB_MODEL || 'muse-spark-1.3-contributor-free',
};

// Títulos fijos del fallback heurístico — verlos significa que el provider falló.
const TEMPLATE_TITLES = ['Entender a fondo', 'Aplicar en proyecto real', 'Aprobar entrevista', 'Preparar certificación'];

const step = (msg) => console.log(`\n▶ ${msg}`);

// ── Fixture: página con la marca real de Udemy que el content script scrapea ─

const TRANSCRIPT_CUES = [
	"Now let's see how Java achieves platform independence",
	'but without affecting execution speed.',
	'We discussed about compilation and interpretation,',
	'which offer contrasting benefits and limitations.',
	'With compilation we get fast execution speed',
	'but without the benefit of platform independence.',
	'With interpretation we get platform independence',
	'but with much slower execution speed.',
	'Java uses a hybrid approach: source code is compiled to bytecode,',
	'then the JVM interprets that bytecode at runtime.',
	'The JVM is platform-specific, but the bytecode is not,',
	'so the same .class file runs anywhere a JVM exists.',
];

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QA fixture — Udemy Subtitle Bridge</title>
<style>
  body { font-family: Arial, sans-serif; margin: 48px; max-width: 960px; color: #1c1d1f; }
  h1 { font-size: 28px; } h2 { font-size: 20px; }
  .description { color: #5022a3; }
  video { width: 640px; height: 360px; background: #000; display: block; margin-bottom: 24px; }
  [data-purpose="transcript-panel"] { background: #f7f9fa; padding: 16px; border-radius: 8px; }
  [data-purpose="transcript-cue"] { display: block; padding: 6px 8px; cursor: pointer; border-radius: 4px; }
  [data-purpose="transcript-cue"]:hover { background: #eceef1; }
</style>
</head>
<body>
<h1 data-purpose="course-title">Java Programming Bootcamp: Spring Boot &amp; REST APIs</h1>
<div class="description" data-purpose="course-description">
  <p>Complete Java course with Spring Boot, Spring MVC, REST APIs, JPA/Hibernate and a real project.</p>
</div>
<main>
  <h2 data-purpose="curriculum-item-view-title">Platform Independence in Java</h2>
  <div style="height: 2600px; background: linear-gradient(#eef, #fee);">spacer: hace la página desplazable para el test de scroll</div>
  <video id="qa-video" controls muted poster="">
    <source src="/qa-video.mp4" type="video/mp4">
    <track kind="subtitles" srclang="en" label="English" default src="/qa-captions.vtt">
  </video>
  <div data-purpose="transcript-panel">
${TRANSCRIPT_CUES.map((c) => `    <div data-purpose="transcript-cue">${c}</div>`).join('\n')}
  </div>
</main>
</body>
</html>`;

// WebVTT del <track>: fuente de transcripción determinista (video textTracks,
// prioridad 2 en collectTranscriptText) independiente del timing del observer.
const FIXTURE_VTT = `WEBVTT\n\n${TRANSCRIPT_CUES.map((c, i) => {
	const t = (s) => {
		const m = Math.floor(s / 60), sec = (s % 60).toFixed(0).padStart(2, '0');
		return `00:${String(m).padStart(2, '0')}:${sec}.000`;
	};
	return `${i + 1}\n${t(i * 5)} --> ${t(i * 5 + 4.5)}\n${c}`;
}).join('\n\n')}\n`;

// ── Self-signed cert (reutilizado entre corridas) ────────────────────────────

function ensureCert() {
	const dir = path.join(tmpdir(), 'usb-qa-certs');
	const key = path.join(dir, 'key.pem');
	const cert = path.join(dir, 'cert.pem');
	if (existsSync(key) && existsSync(cert)) return { key, cert };
	mkdirSync(dir, { recursive: true });
	const r = spawnSync('openssl', [
		'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
		'-keyout', key, '-out', cert, '-days', '3650',
		'-subj', '/CN=udemy.com',
	], { stdio: 'pipe' });
	if (r.status !== 0) {
		throw new Error(`openssl failed (${r.stderr?.toString().slice(0, 200)}). Genera el certificado a mano en ${dir}.`);
	}
	return { key, cert };
}

// ── Servidor HTTPS haciendo de udemy.com ────────────────────────────────────

function startFixtureServer() {
	const { key, cert } = ensureCert();
	return new Promise((resolve, reject) => {
		const tryListen = (port) => {
			const server = createServer(
				{ key: readFileSync(key), cert: readFileSync(cert) },
				(req, res) => {
					if (/\.vtt(\?|$)/.test(req.url || '')) {
						res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8' });
						res.end(FIXTURE_VTT);
						return;
					}
					res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
					res.end(FIXTURE_HTML);
				},
			);
			server.on('error', () => {
				if (port < 8450) tryListen(port + 1);
				else reject(new Error('No free port for the QA fixture server.'));
			});
			server.listen(port, '127.0.0.1', () => resolve({ server, port }));
		};
		tryListen(443);
	});
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const qaMark = () => page.evaluate(() => document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot?.querySelector('#usb-dock-root')?.getAttribute('data-usb-qa-last') || '(sin marca)');

async function dockText(page) {
	// ShadowRoot COMPLETO: los toasts de sonner no viven dentro de
	// #usb-dock-root, y sin ellos el QA es ciego a los estados de export.
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
			await page.screenshot({ path: path.join(repoRoot, `qa-extension-FAIL-${label}.png`) });
			console.error(`--- screenshot: qa-extension-FAIL-${label}.png`);
		} catch { /* best effort */ }
	}
	process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (!existsSync(distDir)) {
	console.error('dist/ no existe. Ejecuta: npm run build');
	process.exit(1);
}

step('Starting udemy.com fixture server (HTTPS)');
const { server, port } = await startFixtureServer();
const fixtureUrl = port === 443
	? 'https://www.udemy.com/course/qa-extension-local/learn/lecture/12345/'
	: `https://www.udemy.com:${port}/course/qa-extension-local/learn/lecture/12345/`;
console.log(`   serving ${fixtureUrl}`);

step('Launching Chromium with the real extension loaded');
const userDataDir = path.join(tmpdir(), 'usb-qa-extension-profile');
rmSync(userDataDir, { recursive: true, force: true });

const context = await chromium.launchPersistentContext(userDataDir, {
	headless: false,
	viewport: { width: 1680, height: 1000 },
	acceptDownloads: true,
	args: [
		`--disable-extensions-except=${distDir}`,
		`--load-extension=${distDir}`,
		'--host-resolver-rules=MAP udemy.com 127.0.0.1, MAP www.udemy.com 127.0.0.1',
		'--ignore-certificate-errors',
		'--lang=es',
		// Sin esto, el diálogo nativo «¿Abrir Obsidian?» de la primera exportación
		// es modal y BLOQUEA toda entrada a la página para el resto del QA.
		'--disable-features=ExternalProtocolDialog',
	],
});

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => {
	pageErrors.push(String(e).slice(0, 240));
	console.log('   [pageerror]', String(e).slice(0, 160));
});

step('Waiting for the MV3 service worker');
let [sw] = context.serviceWorkers();
if (!sw) {
	sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
}
if (!sw) await fail('service worker never appeared', page, 'sw');
console.log('   service worker up:', sw.url());

step('Seeding provider config + Obsidian export config + clearing stale dock prefs');
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
		vaultName: 'QA Vault',
		sourcesFolder: 'wiki/fuentes',
		mocsFolder: 'cursos',
		includeCards: true,
		autoExport: false,
		includeRawSrt: false,
	},
});

step(`Navigating to the fixture page: ${fixtureUrl}`);
try {
	await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) {
	await fail(`navigation failed: ${String(e).slice(0, 160)}`, page, 'nav');
}

step('Waiting for the dock to mount (real content script)');
const dockHost = await page.waitForSelector('[id^="usb-dock-host-"]', { timeout: 20000 }).catch(() => null);
if (!dockHost) await fail('dock host never mounted', page, 'mount');

const defaultWidth = (await dockHost.boundingBox())?.width;
console.log(`   dock mounted, width=${defaultWidth?.toFixed(0)}px (expected ~550 = 500 × 1.1)`);

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

step('Waiting for objectives (REAL AI through the configured provider)');
try {
	await page.locator('text=/PARA QUÉ ESTUDIAS ESTO/i').first().waitFor({ timeout: 20000 });
} catch (e) {
	await fail(`Study tab content never appeared: ${String(e).slice(0, 120)}`, page, 'objectives');
}

let usedTemplates = false;
let regenerateClicks = 0;
let objectivesLoaded = false;
for (let i = 0; i < 40; i++) {
	const text = await dockText(page);
	usedTemplates = TEMPLATE_TITLES.filter((t) => text.includes(t)).length >= 3;
	if (usedTemplates) break;
	const pending = /Objetivos pendientes de IA real/i.test(text);
	// El affordance "Regenerar" solo existe cuando las tarjetas de objetivos
	// tienen contenido real (el esqueleto no lo renderiza).
	objectivesLoaded = !pending && /Regenerar/i.test(text);
	if (objectivesLoaded && !/Generando/i.test(text)) break;
	// El round-trip del provider puede perder la carrera contra el pipeline de
	// traducción en proxies gratuitos (rate limits). "Regenerar con IA" es la
	// recuperación manual del dock — usarla como un usuario real, máx 3 veces.
	if (pending && regenerateClicks < 3) {
		regenerateClicks++;
		console.log(`   objectives pending — clicking "Regenerar con IA" (${regenerateClicks}/3)`);
		await page.locator('[id^="usb-dock-host-"] button:has-text("Regenerar con IA")')
			.first().click({ timeout: 5000 }).catch(() => null);
		await sleep(4000);
		continue;
	}
	await sleep(2500);
}
if (usedTemplates) {
	await fail('objectives fell back to heuristic templates (provider path failed)', page, 'objectives-template');
}
if (!objectivesLoaded) {
	await fail('objective cards never rendered content', page, 'objectives-skeleton');
}
await sleep(2000);

await page.screenshot({ path: path.join(repoRoot, 'qa-extension-objectives.png') });
console.log('   objectives OK (no template fallback) → qa-extension-objectives.png');

step('Choosing an objective and generating the study session (REAL AI)');
try {
	const custom = page.locator('[id^="usb-dock-host-"] textarea[placeholder*="Conseguir trabajo"]').first();
	if (await custom.count() > 0) {
		await custom.fill('Conseguir trabajo como backend developer');
		await sleep(500);
	} else {
		await page.locator('[id^="usb-dock-host-"] button:has-text("Dominar")').first().click({ timeout: 5000 });
	}
} catch { /* an objective may already be active */ }

try {
	await page.locator('[id^="usb-dock-host-"] button:has-text("Generar sesión de aprendizaje")').first().click({ timeout: 10000 });
} catch (e) {
	await fail(`could not click the generate button: ${String(e).slice(0, 120)}`, page, 'generate');
}

step('Waiting for the study session to finish generating');
// La pista VTT del fixture carga async; el content script refresca los cues
// del video ~3 s tras el bootstrap. Si el primer intento llega antes, el
// background rechaza con "too short" — esperar y reintentar una vez.
let sessionOk = false;
let retriedShortTranscript = false;
for (let i = 0; i < 60; i++) {
	await sleep(2500);
	const text = await dockText(page);
	if (/Generando|Analizando|Preparando/i.test(text)) continue;
	if (/¿Lo sé\?|Próximo paso concreto/i.test(text) && !/No se pudo/i.test(text)) {
		sessionOk = true;
		break;
	}
	if (/too short/i.test(text) && !retriedShortTranscript) {
		retriedShortTranscript = true;
		console.log('   transcript not ready yet — waiting for VTT cues, retrying once');
		await sleep(8000);
		await page.locator('[id^="usb-dock-host-"] button:has-text("Generar sesión de aprendizaje"), [id^="usb-dock-host-"] button:has-text("Reintentar")')
			.first()
			.click({ timeout: 5000 })
			.catch(() => null);
		continue;
	}
	if (/No se pudo|Error al generar/i.test(text)) {
		await fail('study generation reported an error', page, 'study-error');
	}
}
if (!sessionOk) {
	await fail('study session did not render after 150s', page, 'study-timeout');
}

await page.screenshot({ path: path.join(repoRoot, 'qa-extension-study.png') });
console.log('   study session rendered → qa-extension-study.png');

// ── Fase de export: el dock corre en el mundo aislado del content script, así
// que las señales se leen del DOM compartido (data-usb-qa-last breadcrumb,
// MutationObserver para hrefs obsidian://) y de CDP para las descargas.

step('Driving the full stepper to step 5 (No olvidar)');
try {
	await page.locator('[id^="usb-dock-host-"] button:has-text("Entendido")').first().click({ timeout: 15000 });
	await page.locator('[id^="usb-dock-host-"] button:has-text("Verificar mi comprensión")').first().click({ timeout: 15000 });
	await page.locator('[id^="usb-dock-host-"] button:has-text("Saltar a la práctica")').first().click({ timeout: 15000 });
	await sleep(600);
	// Los dots del stepper son clickeables cuando el paso está desbloqueado
	// (title = label del paso). Directo al paso 5 tras el force-complete.
	await page.locator('[id^="usb-dock-host-"] button[title="No olvidar"]').first().click({ timeout: 10000 });
} catch (e) {
	await fail(`stepper did not reach the export step: ${String(e).slice(0, 140)}`, page, 'stepper');
}
await page.locator('[id^="usb-dock-host-"] >> text=/^Obsidian$/').first().waitFor({ timeout: 20000 });
await page.screenshot({ path: path.join(repoRoot, 'qa-extension-export.png') });
console.log('   export panel reached → qa-extension-export.png');

step('Verifying scroll boundary (rueda sobre el dock nunca mueve la página)');
const scrollTarget = await page.evaluate(() => {
	const sr = document.querySelector('[id^="usb-dock-host-"]').shadowRoot;
	const el = [...sr.querySelectorAll('.custom-scrollbar')].find((c) => c.scrollHeight > c.clientHeight + 10 && c.getClientRects().length > 0);
	if (!el) return null;
	const r = el.getBoundingClientRect();
	return { cx: r.x + r.width / 2, cy: r.y + Math.min(200, r.height / 2) };
});
if (scrollTarget) {
	const pageBefore = await page.evaluate(() => window.scrollY);
	await page.mouse.move(scrollTarget.cx, scrollTarget.cy);
	for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 200); await sleep(150); }
	const pageAfter = await page.evaluate(() => window.scrollY);
	const containerTop = await page.evaluate(() => {
		const sr = document.querySelector('[id^="usb-dock-host-"]').shadowRoot;
		const el = [...sr.querySelectorAll('.custom-scrollbar')].find((c) => c.scrollHeight > c.clientHeight + 10 && c.getClientRects().length > 0);
		return el ? Math.round(el.scrollTop) : -1;
	});
	if (pageAfter > pageBefore) {
		await fail(`la rueda sobre el dock desplazó la PÁGINA de Udemy (${pageBefore} → ${pageAfter})`, page, 'scroll-page');
	}
	console.log(`   ✅ scroll: página quieta (${pageAfter}) | contenedor del dock scrollTop=${containerTop}`);
} else {
	console.log('   (sin contenedor desplazable visible en esta vista — skip)');
}

step('Verifying inline help (¿No pasó nada al exportar?)');
// Primero en el orden: la celebración del .apkg taparía el botón después.
await page.locator('[id^="usb-dock-host-"] button:has-text("¿No pasó nada al exportar?")').first().click({ timeout: 10000 });
await sleep(600);
const helpText = await dockText(page);
if (!/Siempre permitir/i.test(helpText)) {
	await fail('inline help did not render troubleshooting steps', page, 'help');
}
await page.locator('[id^="usb-dock-host-"] button:has-text("Ocultar ayuda")').first().click({ timeout: 5000 }).catch(() => null);
console.log('   ✅ ayuda de diagnóstico disponible en el dock');

step('Verifying clipboard fallback (Copiar)');
let clipboardOk = false;
try {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(fixtureUrl).origin });
	await page.locator('[id^="usb-dock-host-"] button:has-text("Copiar")').first().click({ timeout: 10000 });
	let copyToast = '';
	for (let i = 0; i < 8; i++) {
		await sleep(400);
		const t = await dockText(page);
		if (/Markdown copiado/i.test(t)) { copyToast = 'copiado'; break; }
		if (/No se pudo copiar/i.test(t)) { copyToast = 'error'; break; }
	}
	console.log(`   toast de copiado: ${copyToast || '(no visible)'}`);
	const md = await page.evaluate(() => navigator.clipboard.readText());
	if (md && md.includes('type: sesion') && md.includes('#flashcards')) {
		clipboardOk = true;
		console.log(`   ✅ markdown en portapapeles (${(md.length / 1024).toFixed(1)} kB)`);
	} else {
		console.log(`   ⚠️ clipboard no contenía la nota (${md ? md.length : 0} chars)`);
	}
} catch (e) {
	console.log(`   ⚠️ clipboard no verificable en este entorno: ${String(e).slice(0, 120)}`);
}

step('Verifying .apkg download (unzip + SQLite audit)');
let apkgOk = false;
const recentConsole = [];
const consoleCapture = (m) => recentConsole.push(String(m.text()).slice(0, 300));
page.on('console', consoleCapture);
await sleep(3500);
const apkgBtn = page.locator('[id^="usb-dock-host-"] button:has-text(".apkg")').first();
const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).then(
	(d) => ({ d }),
	() => ({}),
);
await apkgBtn.click({ timeout: 10000 });
console.log(`   breadcrumb tras click: ${await qaMark()}`);
const signals = new Set();
let download = { d: null };
for (let i = 0; i < 40; i++) {
	await sleep(250);
	const btn = (await apkgBtn.textContent().catch(() => '')) || '';
	if (/Iniciando|Inicializando|Insertando|Exportando|Error/i.test(btn)) {
		signals.add(`[btn] ${btn.trim().slice(0, 50)}`);
	}
	const t = await dockText(page);
	if (/Paquete Anki listo/i.test(t)) signals.add('toast: Paquete Anki listo');
	if (/Hubo un error al generar/i.test(t)) signals.add('toast: Hubo un error');
}
const ev = await Promise.race([
	downloadPromise,
	sleep(500).then(() => ({})),
]);
page.off('console', consoleCapture);
console.log(`   señales apkg: ${[...signals].join(' | ') || '(ninguna)'}`);
if (ev.d) {
	const apkgFile = path.join(tmpdir(), 'usb-qa-export.apkg');
	await ev.d.saveAs(apkgFile);
	console.log('   download event capturado');
	try {
		const { default: JSZip } = await import('jszip');
		const { default: initSqlJs } = await import('sql.js');
		const zip = await JSZip.loadAsync(readFileSync(apkgFile));
		const colFile = zip.file('collection.anki2');
		if (!colFile) throw new Error('collection.anki2 ausente en el zip');
		const colBytes = await colFile.async('uint8array');
		const SQL = await initSqlJs({ locateFile: (f) => path.join(repoRoot, 'node_modules', 'sql.js', 'dist', f) });
		const db = new SQL.Database(colBytes);
		const colRow = db.exec('SELECT models, decks FROM col LIMIT 1')[0].values[0];
		const models = JSON.parse(colRow[0]);
		const decks = JSON.parse(colRow[1]);
		const model = Object.values(models).find((m) => m.name === 'Subtitle Bridge Basic');
		if (!model) throw new Error('modelo Subtitle Bridge Basic ausente');
		if (!model.css.includes('.nightMode')) throw new Error('CSS dev-card (nightMode) ausente');
		if (!model.tmpls[0].qfmt.includes('anki-wrapper dev-card')) throw new Error('plantilla front dev-card ausente');
		if (!model.tmpls[0].afmt.includes('prism-java.min.js')) throw new Error('plantilla back sin Prism (fix cara B ausente)');
		const deckNames = Object.values(decks).map((d) => d.name);
		if (!deckNames.some((n) => n.includes('::'))) throw new Error('mazo sin subnivel Curso::Lección: ' + deckNames.join(', '));
		const notes = db.exec('SELECT guid, flds FROM notes')[0]?.values || [];
		if (notes.length < 3) throw new Error('solo ' + notes.length + ' notas');
		const guids = notes.map((n) => n[0]);
		if (new Set(guids).size !== guids.length) throw new Error('GUIDs duplicados dentro del paquete');
		if (!guids.every((g) => String(g).startsWith('usb'))) throw new Error('GUID sin prefijo usb');
		const cards = db.exec('SELECT COUNT(*) FROM cards')[0].values[0][0];
		if (cards !== notes.length) throw new Error('cards != notes');
		console.log('   ✅ .apkg válido: ' + notes.length + ' notas, plantillas dev-card + Prism, GUIDs únicos');
		apkgOk = true;
		db.close();
	} catch (e) {
		await fail('.apkg audit: ' + e.message, page, 'apkg-audit');
	}
} else {
	console.error('   consola reciente: ' + JSON.stringify(recentConsole.slice(-6)));
	await fail('.apkg: download event no disparado tras 30 s', page, 'apkg-download');
}

step('Verifying Obsidian export (captured obsidian:// URIs)');
// El dock corre en el mundo aislado: el <a> se adjunta al DOM compartido y un
// MutationObserver captura el href real. El launch del protocolo puede abrir
// Obsidian en el OS — por eso esta fase va al final del flujo UI.
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
await page.locator('[id^="usb-dock-host-"] button:has-text("Exportar")').first().click({ timeout: 10000 });
await sleep(2500);
const uris = await page.evaluate(() => window.__qaUris || []);
let obsidianOk = false;
try {
	if (uris.length !== 2) throw new Error('esperaba 2 URIs (MOC+sesión), llegaron ' + uris.length);
	const decoded = uris.map((u) => decodeURIComponent(u));
	const session = decoded.find((d) => d.includes('type%3A%20sesion') || d.includes('type: sesion'));
	const moc = decoded.find((d) => d.includes('type%3A%20curso') || d.includes('type: curso'));
	if (!session) throw new Error('falta la URI de sesión');
	if (!moc) throw new Error('falta la URI de MOC');
	for (const marker of ['#flashcards', 'relevance_score', 'source_url', '## Ideas clave']) {
		if (!session.includes(marker)) throw new Error('la nota de sesión no incluye "' + marker + '"');
	}
	if (!session.includes('obsidian://new?vault=')) throw new Error('vault malformado en la URI');
	obsidianOk = true;
	console.log('   ✅ 2 URIs capturadas: sesión (' + (session.length / 1024).toFixed(1) + ' kB) + MOC, frontmatter y tarjetas correctas');
	const stored = await sw.evaluate(() => new Promise((res) => chrome.storage.local.get(['obsidian_exported_notes'], (r) => res(r.obsidian_exported_notes || []))));
	const expKey = sessionExportKey('Java Programming Bootcamp: Spring Boot & REST APIs', 'Platform Independence in Java');
	if (!stored.includes(expKey)) throw new Error('la exportación no registró la sesión (guard no podrá detectar duplicados)');
	console.log('   ✅ guard sembrado en storage: ' + expKey);
} catch (e) {
	await fail('obsidian export URI check: ' + e.message, page, 'obsidian-uri');
}

step('Verifying duplicate guard (second export warns instead of duplicating)');
await page.locator('[id^="usb-dock-host-"] button:has-text("Exportar")').first().click({ timeout: 10000 });
await sleep(1500);
const urisAfter = await page.evaluate(() => (window.__qaUris || []).length);
if (urisAfter !== uris.length) {
	await fail('duplicate guard FAILED: re-exported without asking (URIs ' + uris.length + ' → ' + urisAfter + ')', page, 'dup-guard');
}
console.log('   ✅ guard: reexportación bloqueada (URIs ' + uris.length + ' → ' + urisAfter + ', storage ya marcado)');

step('Typography scale check: browser default font 20px (expected scale 1.375)');
// CDP Page.setFontSizes no alcanza el iframe sandbox que usa el content script
// para medir la fuente del usuario: se emula el ajuste real del usuario con
// un segundo contexto lanzado con --blink-settings=defaultFontSize=20.
await context.close();

const scaledContext = await chromium.launchPersistentContext(path.join(tmpdir(), 'usb-qa-extension-profile-scaled'), {
	headless: false,
	viewport: { width: 1680, height: 1000 },
	args: [
		`--disable-extensions-except=${distDir}`,
		`--load-extension=${distDir}`,
		'--host-resolver-rules=MAP udemy.com 127.0.0.1, MAP www.udemy.com 127.0.0.1',
		'--ignore-certificate-errors',
		'--lang=es',
		'--blink-settings=defaultFontSize=20',
	],
});
const scaledPage = await scaledContext.newPage();
let scaledSw = scaledContext.serviceWorkers()[0];
if (!scaledSw) scaledSw = await scaledContext.waitForEvent('serviceworker', { timeout: 15000 });
await scaledSw.evaluate(({ cfg }) => new Promise((resolve) => {
	chrome.storage.local.clear(() => chrome.storage.local.set({ usg_ai_provider_config: cfg, enabled: true }, resolve));
}), { cfg: PROVIDER_CFG });
await scaledPage.goto(fixtureUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
const scaledHost = await scaledPage.waitForSelector('[id^="usb-dock-host-"]', { timeout: 20000 });
await sleep(1500);
const scaledWidth = (await scaledHost.boundingBox())?.width;
console.log(`   dock width at 20px default font: ${scaledWidth?.toFixed(0)}px (expected 660 — capped by DOCK_MAX_WIDTH)`);
await scaledPage.screenshot({ path: path.join(repoRoot, 'qa-extension-scaled-20px.png') });
console.log('   → qa-extension-scaled-20px.png');
await scaledContext.close();

const widthOk = Number(defaultWidth) > 500 && Number(scaledWidth) >= 640;

console.log('\n=== QA EXTENSION LOCAL — RESUMEN ===');
console.log(`dock default: ${defaultWidth?.toFixed(0)}px | dock a 20px: ${scaledWidth?.toFixed(0)}px | sesión: ${sessionOk ? 'OK' : 'FAIL'} | anchos: ${widthOk ? 'OK' : 'REVISAR'} | obsidian: ${obsidianOk ? 'OK' : 'FAIL'} | dupGuard: OK | clipboard: ${clipboardOk ? 'OK' : 'n/d'} | apkg: ${apkgOk ? 'OK' : 'FAIL'}`);

server.close();
process.exit(sessionOk && widthOk && obsidianOk && apkgOk ? 0 : 1);
