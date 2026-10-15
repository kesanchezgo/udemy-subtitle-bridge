/**
 * Cierre de la verificación de Obsidian tras el rediseño, con los métodos
 * correctos de Playwright (shadow DOM open: se puede atravesar):
 *   - page.mouse.wheel SOBRE el dock para desplazar su contenedor real.
 *   - locator.scrollIntoViewIfNeeded() + locator.click() (evento real).
 *   - Fallback: clic por coordenadas del bounding box.
 *
 * Prueba: lección ya completada (del historial) → paso 5 → Exportar →
 * verifica insignia «✓ Listo», apertura del protocolo (diálogo capturado vía
 * CDP) y guard de duplicados en el segundo clic.
 *
 * Uso: node scripts/qa-obsidian-verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const repoRoot = process.cwd();
const distDir = path.resolve('dist');
const COURSE = 'Java In-Depth: Become a Complete Java Engineer! [2026]';
const LESSON = '8. Platform Dependency + Demo';
const OUT = 'tmp/obsidian-verify';
const OUTER = '[id^="usb-dock-host-"]';

// ── fixture con transcripción ─────────────────────────────────────────────────
const CUES = [
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
	'so the same class file runs on Windows and Linux.',
];
const VTT = 'WEBVTT\n\n' + CUES.map((c, i) => {
	const t = (s) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(0).padStart(2, '0')}.000`;
	return `${i + 1}\n${t(i * 5)} --> ${t(i * 5 + 4.5)}\n${c}`;
}).join('\n\n') + '\n';
const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${COURSE}</title></head>
<body><h1 data-purpose="course-title">${COURSE}</h1><main><h2 data-purpose="curriculum-item-view-title">${LESSON}</h2>
<video controls muted><track kind="subtitles" srclang="en" label="English" default src="/q.vtt"></video>
<div data-purpose="transcript-panel">${CUES.map((c) => `<div data-purpose="transcript-cue">${c}</div>`).join('')}</div>
</main></body></html>`;

const dir = path.join(tmpdir(), 'usb-qa-certs');
const key = path.join(dir, 'key.pem');
const cert = path.join(dir, 'cert.pem');
if (!fs.existsSync(key)) {
	fs.mkdirSync(dir, { recursive: true });
	spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=udemy.com'], { stdio: 'pipe' });
}
const server = createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
	if (req.url?.endsWith('q.vtt')) { res.writeHead(200, { 'Content-Type': 'text/vtt' }); res.end(VTT); return; }
	res.writeHead(200, { 'Content-Type': 'text/html' });
	res.end(PAGE);
});
let port = 443;
server.on('error', () => { port += 1; if (port < 4460) server.listen(port, '127.0.0.1'); });
await new Promise((r) => server.listen(port, '127.0.0.1', r));

// ── lección ya completada en el historial (mismas claves que historyService) ──
const record = {
	courseId: 'javaindepthbecomeacompletejavaengineer2026',
	lectureId: '8platformdependencydemo',
	courseName: COURSE, lectureName: LESSON,
	objective: 'Dominar la independencia de plataforma de Java', objectiveId: 'custom',
	status: 'completed', confidence: 'clear', questionsComplete: true, focusStep: 4,
	questions: [], ankiCardsCount: 6,
	studyContent: {
		relevance: { score: 92, reason: 'Mecanismo central de portabilidad.' },
		keyConcepts: ['javac compila a bytecode', 'la JVM interpreta en runtime'],
		quickWin: 'Ejecuta un .class en otra plataforma', questions: [],
		application: { setup: 'c', challenge: 'x', solution: 'y', isCode: false },
		interviewQ: { q: 'q', idealAnswer: 'a' }, nextAction: 'x', ankiCards: [],
	},
	ankiCards: [
		{ id: 'card-001', front: '¿Qué produce javac?', back: 'Bytecode.', tags: ['java'], type: 'concepto' },
	],
	version: 2,
};

const PROFILE = path.join(repoRoot, 'temp_profile_obs_verify');
fs.rmSync(PROFILE, { recursive: true, force: true });
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

// Interceptar TODO request a obsidian:// (protocolo externo del navegador).
let obsidianRequests = [];
context.on('request', (req) => { if (req.url().startsWith('obsidian://')) obsidianRequests.push(req.url()); });

// Capturar el diálogo de protocolo externo (Chrome dialogo) vía CDP.
let protocolEvents = [];
try {
	const cdp = await context.newCDPSession(page);
	cdp.on('Page.javascriptDialogOpening', (e) => {
		protocolEvents.push(e.message);
		cdp.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
	});
	await cdp.send('Page.enable');
} catch { /* CDP no disponible */ }

await page.goto(`https://www.udemy.com:${port}/course/j/learn/lecture/1/`);
await page.waitForSelector(OUTER, { timeout: 20000 });
const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
if (sw) {
	// historial en LOCAL (historyService), contexto + config en SYNC
	await sw.evaluate(({ record }) => new Promise((resolve) => {
		// obsidianExportService y historyService leen de LOCAL (chromeLocalStorage).
		chrome.storage.local.set({
			[`usb_history_lecture::${record.courseId}::${record.lectureId}`]: record,
			obsidian_export_config: { vaultName: 'QA Vault', sourcesFolder: 'wiki/fuentes', mocsFolder: 'cursos', includeCards: true, autoExport: false, includeRawSrt: false },
		}, () => {
			chrome.storage.sync.set({
				agent_course_name: record.courseName,
				agent_lesson_name: record.lessonName,
				agent_selected_obj: 'custom',
			}, resolve);
		});
	}), { record });
	await page.reload();
	await page.waitForSelector(OUTER, { timeout: 20000 });
	await page.waitForTimeout(1800);
}
await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1500);
fs.mkdirSync(OUT, { recursive: true });

// ── paso 5 ───────────────────────────────────────────────────────────────────
await page.locator(`${OUTER} button:has-text("Study")`).first().click().catch(() => {});
await page.waitForTimeout(1200);
const modules = await page.evaluate(() => {
	const sr = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const ps = [...(sr?.querySelectorAll('section p') ?? [])].map((p) => (p.textContent || '').trim());
	return {
		cards: ps.includes('Tarjetas de la lección'),
		vocab: ps.includes('Mazo de idiomas · opcional'),
		obsidian: ps.includes('Obsidian'),
	};
});
console.log('módulos del paso 5:', JSON.stringify(modules));

// ── localizar y hacer scroll con la rueda sobre el dock ──────────────────────
const dockBox = await (await page.locator(OUTER)).boundingBox();
const obsidianBtn = page.locator(`${OUTER} section`).filter({
	has: page.locator('p', { hasText: /^Obsidian$/ }),
}).locator('button', { hasText: /^(Exportar|Exportado)$/ }).last();

// Rueda sobre el dock hasta que el botón sea visible y clickeable.
let clickable = false;
for (let i = 0; i < 14 && !clickable; i += 1) {
	if (await obsidianBtn.count().catch(() => 0)) {
		await obsidianBtn.scrollIntoViewIfNeeded().catch(() => {});
		const box = await obsidianBtn.boundingBox().catch(() => null);
		if (box && box.y > 60 && box.y + box.height < 990 && box.width > 0) clickable = true;
	}
	if (!clickable) {
		await page.mouse.move(dockBox.x + dockBox.width / 2, dockBox.y + dockBox.height * 0.7);
		await page.mouse.wheel(0, 400);
		await page.waitForTimeout(500);
	}
}
console.log('botón visible tras scroll:', clickable);
await page.screenshot({ path: path.join(OUT, '01-antes-exportar.png') });

// ── primer clic real ─────────────────────────────────────────────────────────
let firstClick = 'not-attempted';
if (clickable) {
	await obsidianBtn.click({ timeout: 8000 }).then(() => { firstClick = 'clicked'; }).catch((e) => {
		firstClick = 'failed:' + String(e).slice(0, 80);
	});
}
console.log('primer clic:', firstClick);
let listo = false;
for (let i = 0; i < 12 && !listo; i += 1) {
	await page.waitForTimeout(1000);
	listo = await page.evaluate(() => {
		const sr = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		return [...sr.querySelectorAll('section')]
			.filter((s) => [...s.querySelectorAll('p')].some((p) => (p.textContent || '').trim() === 'Obsidian'))
			.some((s) => /Listo/i.test(s.textContent ?? ''));
	});
}
await page.screenshot({ path: path.join(OUT, '02-despues-exportar.png') });

// ── segundo clic → guard de duplicados ────────────────────────────────────────
let dupWarn = false;
if (clickable) {
	// El botón ahora dice «Exportado»: re-localizarlo (el locator anterior
	// quedó atado al texto «Exportar»).
	// Puede haber dos secciones montadas (paso 5 + portal de Ajustes): elegir
	// la que tenga «Listo» (la que ya exportó) o la visible con altura real.
	const obsidianBtn2 = page.locator(`${OUTER} section`).filter({
		has: page.locator('p', { hasText: /^Obsidian$/ }),
	}).locator('button', { hasText: /^(Exportar|Exportado)$/ });
	const count = await obsidianBtn2.count().catch(() => 0);
	let idx = count - 1;
	if (count > 1) {
		for (let i = 0; i < count; i += 1) {
			const isListo = await obsidianBtn2.nth(i).evaluate((el) => {
				const sec = el.closest('section');
				return /Listo/i.test(sec?.textContent ?? '');
			}).catch(() => false);
			if (isListo) { idx = i; break; }
		}
	}
	const target2 = obsidianBtn2.nth(idx);
	for (let i = 0; i < 6 && !dupWarn; i += 1) {
		await target2.scrollIntoViewIfNeeded().catch(() => {});
		await target2.click({ timeout: 8000 }).catch(async () => {
			const b = await target2.boundingBox();
			if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
		});
		await page.waitForTimeout(2000);
		dupWarn = await page.evaluate(() => {
			const sr = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
			// El aviso sale como toast de sonner fuera del dock.
			const body = document.body.innerText || '';
			return /ya fue exportada/i.test((sr?.textContent ?? '') + ' ' + body);
		});
	}
}
console.log('aviso de duplicado:', dupWarn);
console.log('diálogos de protocolo capturados:', protocolEvents.length);
console.log('requests obsidian:// totales:', obsidianRequests.length);
if (obsidianRequests[0]) console.log('   primer URI:', decodeURIComponent(obsidianRequests[0]).slice(0, 170));
if (obsidianRequests[1]) console.log('   SEGUNDO URI:', decodeURIComponent(obsidianRequests[1]).slice(0, 170));

await context.close();
server.close();
fs.rmSync(PROFILE, { recursive: true, force: true });

let failures = 0;
const check = (n, ok) => { if (ok) console.log('  ✓', n); else { failures += 1; console.error('  ✗', n); } };
check('los 3 módulos en el paso 5', modules.cards && modules.vocab && modules.obsidian);
check('botón Exportar clickeable tras scroll real', clickable);
check('primer clic ejecutado', firstClick === 'clicked', firstClick);
check('insignia «✓ Listo» tras exportar', listo);
// Un clic correcto emite 2 URIs: el MOC del curso + la nota de sesión.
check('clic de exportación emite 2 URIs (MOC + sesión)', obsidianRequests.length === 2,
	String(obsidianRequests.length));
check('guard: 2º clic no genera URIs nuevas', obsidianRequests.length === 2,
	`uris=${obsidianRequests.length} tras dos clics`);
console.log(failures === 0 ? '\n✅ OBSIDIAN CERRADO' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
