/**
 * Suite completa de flujos.
 *
 * Cubre, en orden y sobre UNA sola carga de página, los flujos que la extensión
 * expone al usuario. Cada bloque es independiente: si uno falla, los siguientes
 * siguen, y el informe final dice cuáles fallaron.
 *
 *   A. Arranque      — el content script inyecta el dock y el overlay.
 *   B. Subtítulos    — el overlay traduce y sigue al reloj del vídeo.
 *   C. Ajustes       — deep-link, sepia, toaster (regresión de revisión 2).
 *   D. Study         — flujo de 4 pasos: restauración v1, flujo mínimo, salto,
 *                       refuerzos, .apkg real y confirmación de Reiniciar.
 *   E. Obsidian     — export con URIs y aviso de duplicado con su botón.
 *   F. Proveedor    — permiso de host cubierto vs. host sin permiso.
 *   G. Vocabulario  — pipeline y checkpoints del registro de lemas.
 *
 * Dos modos de ejecución:
 *
 *   --real   Contra Udemy de verdad, con el perfil real y las cookies de sesión
 *            de .qa-udemy-cookies.json. Es la prueba que vale; los bloques que
 *            dependen de una lección ya completada y sembrada en el historial
 *            (D, E) se saltan, porque sembrar eso en producción Inventaría datos
 *            en la cuenta real.
 *
 *   (sin flag) Sobre un clon determinista servido bajo udemy.com. Cubre TODOS
 *            los bloques, incluidos D y E, con una lección completada sembrada.
 *
 * Uso: npm run qa:full            (clon determinista, suite completa)
 *      node scripts/qa-full-flows.mjs --real   (Udemy real)
 *      node scripts/qa-full-flows.mjs --keep   (conserva el perfil temporal)
 */
import { createServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
const distDir = path.join(repoRoot, 'dist');
const OUTER = '[id^="usb-dock-host-"]';
const KEEP = process.argv.includes('--keep');
const REAL = process.argv.includes('--real');
const SHOTS = path.join(repoRoot, 'tmp', 'full-flows');

const COURSE = 'Java In-Depth: Become a Complete Java Engineer! [2026]';
const LESSON = '8. Platform Dependency + Demo';
const COURSE_ID = 'javaindepthbecomeacompletejavaengineer2026';
const LESSON_ID = '8platformdependencydemo';

// ── transcripción EN del clon (la misma fixture que usa la suite de Obsidian) ──
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

// El clon imita la estructura que raspa el content script de Udemy.
const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${COURSE}</title></head>
<body>
<h1 data-purpose="course-title">${COURSE}</h1>
<main class="app--content-column--LnPGp">
  <h2 data-purpose="curriculum-item-view-title">${LESSON}</h2>
  <div id="shaka-video-container-999">
    <video id="video-999" controls muted preload="metadata" src="/q.vtt"></video>
    <div class="captions-display-module--captions-container--AezHx"><span class="captions-display-module--captions-cue-text--KMBV6"></span></div>
  </div>
  <div data-purpose="transcript-panel">${CUES.map((c) => `<div data-purpose="transcript-cue">${c}</div>`).join('')}</div>
</main>
</body></html>`;

// ── servidor HTTPS local bajo el nombre de Udemy ───────────────────────────────
const dir = path.join(tmpdir(), 'usb-qa-certs');
const key = path.join(dir, 'key.pem');
const cert = path.join(dir, 'cert.pem');
if (!existsSync(key)) { mkdirSync(dir, { recursive: true }); spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=udemy.com'], { stdio: 'pipe' }); }
const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
	if (req.url?.endsWith('.vtt')) { res.writeHead(200, { 'Content-Type': 'text/vtt' }); res.end(VTT); return; }
	res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE);
});
let port = 4700;
let context;
let page;
let PROFILE = '';
const LECTURE_URL = 'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342';

// ── Mock OpenAI-compatible (IA determinista para el modo CLON) ────────────────
// El background genera Study vía el proveedor configurado; el QA le apunta a
// este servidor para que generación y evaluación no dependan de claves reales.
const QA_STUDY_JSON = {
	relevance: { score: 91, reason: 'Mecanismo central de portabilidad para tu objetivo.' },
	summary: 'Java compila a bytecode y la JVM lo interpreta o compila al vuelo.',
	conceptTerms: ['bytecode', 'jvm', 'jit'],
	keyConcepts: [
		'javac compila el fuente a bytecode (.class), no a código máquina',
		'la JVM de cada plataforma interpreta el mismo bytecode',
		'el JIT compila los puntos calientes a nativo en runtime',
		'el bytecode es portable; la JVM no',
	],
	quickWin: 'Ejecuta el mismo .class en dos SO distintos.',
	questions: [
		{ q: 'QA · ¿Qué produce exactamente javac a partir del código fuente?', bloom: 'recordar', difficulty: 'confused', conceptRefs: [0], hint: 'No es un .exe', answer: 'Bytecode en archivos .class' },
		{ q: 'QA · ¿Por qué el mismo .class corre en Windows y Linux?', bloom: 'comprender', difficulty: 'partial', conceptRefs: [1], hint: 'Algo específico por plataforma', answer: 'Cada plataforma tiene su JVM que interpreta el mismo bytecode' },
		{ q: 'QA · ¿Cuándo compila el JIT y qué gana frente al AOT?', bloom: 'aplicar', difficulty: 'clear', conceptRefs: [2], hint: 'Runtime vs antes de ejecutar', answer: 'El JIT compila hot spots en runtime; gana optimización con perfiles reales, a costa de warm-up' },
		{ q: 'QA · Evalúa: ¿Java es siempre más lento que C++?', bloom: 'evaluar', difficulty: 'mastered', conceptRefs: [2, 3], hint: 'Depende del workload', answer: 'En picos cálidos el JIT se acerca a nativo; C++ gana en latencia predecible' },
	],
	application: { isCode: false, setup: 'Tienes App.java compilado', challenge: 'Lleva el .class a otra plataforma y ejecútalo sin recompilar', solution: 'java -cp . App funciona si la JVM soporta la versión del bytecode' },
	interviewQ: { q: 'QA · Explica en 60s la independencia de plataforma de Java.', idealAnswer: 'Bytecode portable + JVM por plataforma + JIT para velocidad.' },
	nextAction: 'Ejecuta tu app en dos SO y anota las diferencias.',
	ankiCards: [
		{ id: 'card-001', type: 'concepto', conceptRefs: [0], front: 'QA · ¿Qué produce javac?', back: 'Bytecode en archivos .class, no código máquina.', tags: ['java', 'compilacion'] },
		{ id: 'card-002', type: 'concepto', conceptRefs: [2], front: 'QA · ¿Cuándo compila el JIT?', back: 'En runtime, sobre los hot spots detectados.', tags: ['java', 'rendimiento'] },
		{ id: 'card-003', type: 'comparacion', conceptRefs: [1, 3], front: 'QA · ¿Portable: bytecode o JVM?', back: 'El bytecode es portable; la JVM es específica por plataforma.', tags: ['java', 'portabilidad'] },
	],
};
const evalVerdictFor = (body) => {
	// Determinista: la pregunta clear (bloom aplicar) falla → consolidación;
	// el resto correcto a la primera.
	if (/PREGUNTA \(nivel aplicar\)/.test(body)) {
		return '[INCORRECTO]\nBIEN: Reconoces el escenario de despliegue, que es el primer paso.\nFALTO: El JIT compila los hot spots EN RUNTIME y cachea el resultado; AOT compila antes de ejecutar.\nPARA RECORDAR: JIT = optimización en caliente; AOT = arranque inmediato.';
	}
	return '[CORRECTO]\nBIEN: Capturas la idea central del concepto preguntado.\nFALTO: (nada)\nPARA RECORDAR: Conecta siempre el mecanismo con un ejemplo propio.';
};
const QA_PORT = 8123;
const qaAi = createHttpServer((req, res) => {
	// CORS: el fetch sale del content script (origen de la página), así que el
	// mock debe responder como cualquier proveedor OpenAI-compatible alojado.
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
	if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
	let raw = '';
	req.on('data', (c) => { raw += c; });
	req.on('end', () => {
		let content;
		if (/JSON VÁLIDO/.test(raw)) {
			content = JSON.stringify(QA_STUDY_JSON);
		} else if (/formato EXACTO/.test(raw)) {
			content = evalVerdictFor(raw);
		} else if (/Refinar|objetiv/i.test(raw)) {
			content = JSON.stringify({ objectives: [
				{ id: 'qa-obj-1', icon: 'target', title: 'Dominar la portabilidad', sub: 'Bytecode, JVM y JIT con casos reales' },
				{ id: 'qa-obj-2', icon: 'code', title: 'Practicar el despliegue', sub: 'Llevar un .class a otro SO' },
			] });
		} else {
			content = 'OK';
		}
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ id: 'qa', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
	});
});
qaAi.listen(QA_PORT, '127.0.0.1');
console.log(`  (mock IA OpenAI-compatible en 127.0.0.1:${QA_PORT})`);

// Lección ya completada, con el mismo esquema que escribe historyService. Solo
// se siembra en modo CLON: en modo REAL inventaría datos en la cuenta real.
const RECORD = {
	courseId: COURSE_ID, lectureId: LESSON_ID, courseName: COURSE, lectureName: LESSON,
	objective: 'Dominar la independencia de plataforma de Java', objectiveId: 'custom',
	status: 'completed', confidence: 'clear', questionsComplete: true, focusStep: 4,
	startedAt: Date.now() - 86400000, updatedAt: Date.now() - 3600000,
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
		{ id: 'card-002', front: '¿Qué interpreta el bytecode?', back: 'La JVM.', tags: ['java'], type: 'concepto' },
	],
	version: 2,
};

/** Siembra el historial/vocab/proveedor vía el SW (reutilizable: la sección E
 *  re-siembra porque el Reiniciar del flujo limpia el registro con clearProgress). */
async function writeSeedViaSw(opts = {}) {
	const svc = context.serviceWorkers().at(-1)
		?? await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
	if (!svc) throw new Error('SW no disponible para el seed');
	// D.4: variante v2 con tarjetas de refuerzo — restauración directa a Fijar
	// con chips «Refuerzo» que ejercitan los tokens AA del §1.
	const record = opts.reinforceCards
		? {
			...RECORD,
			flowVersion: 2,
			focusStep: 3,
			finishedAt: RECORD.updatedAt,
			questionsDone: true,
			ankiCards: RECORD.ankiCards.map((c, i) => ({
				...c,
				conceptRefs: [i],
				reinforce: true,
			})),
		}
		: RECORD;
	await Promise.race([
		svc.evaluate(({ record, qaPort }) => new Promise((resolve, reject) => {
			chrome.storage.local.set({
				[`usb_history_lecture::${record.courseId}::${record.lectureId}`]: record,
				obsidian_export_config: { vaultName: 'QA Vault', sourcesFolder: 'wiki/fuentes', mocsFolder: 'cursos', includeCards: true, autoExport: false, includeRawSrt: false },
				obsidian_exported_notes: [`${record.courseId}::${record.lectureId}`],
				usg_ai_provider_config: { kind: 'openai', baseUrl: `http://127.0.0.1:${qaPort}/v1`, apiKey: 'qa-key', model: 'qa-model' },
				[`usb_vocab_session_${record.courseName.toLowerCase()}|${record.lectureName.toLowerCase()}|en`]: {
					course: record.courseName,
					lesson: record.lectureName,
					config: { rootDeck: 'Kinema', targetLang: 'en', targetLangLabel: 'English', baseLangLabel: 'español', minLevel: 'B2', maxWords: 8, audioMode: 'field' },
					candidates: [
						{ word: 'bytecode', level: 'B1', pos: 'noun', meaning: 'código intermedio', sentence: 'The JVM interprets bytecode.', sentenceTranslation: 'La JVM interpreta bytecode.', phonetic: '/ˈbaɪtkoʊd/', monolingual: 'intermediate code' },
					],
					selected: [],
					demo: false,
					exports: [],
				},
			}, () => {
				if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
				resolve();
			});
		}), { record, qaPort: QA_PORT }),
		new Promise((_, rej) => setTimeout(() => rej(new Error('seed timeout')), 15000)),
	]);
	await Promise.race([
		svc.evaluate(({ record }) => new Promise((resolve, reject) => {
			chrome.storage.sync.set({
				agent_course_name: record.courseName,
				agent_lesson_name: record.lessonName,
				agent_selected_obj: 'custom',
			}, () => {
				if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
				resolve();
			});
		}), { record: RECORD }),
		new Promise((_, rej) => setTimeout(() => rej(new Error('seed sync timeout')), 15000)),
	]);
}

if (REAL) {
	// ── modo REAL: perfil con sesión + extensión, contra Udemy ──────────────────
	const cookieFile = path.join(repoRoot, '.qa-udemy-cookies.json');
	if (!existsSync(cookieFile)) {
		console.error('✗ Falta .qa-udemy-cookies.json (ver .gitignore). Sin sesión no hay prueba real.');
		process.exit(2);
	}
	// El perfil persiste el service worker REGISTRADO de la extensión. Si el
	// registro es anterior al último build, Chrome sigue ejecutando el código
	// viejo (sin USG_HOST_COVERED, sin el keepalive) y los mensajes del panel
	// caen en "port closed". Medido: la clave es la misma aunque dist cambie.
	// Borrar el registro obliga a re-registrar con el dist actual. Los SW de
	// Udemy se re-registran solos al cargar la página.
	const swDir = path.join(repoRoot, 'chrome-real-profile', 'Default', 'Service Worker');
	rmSync(swDir, { recursive: true, force: true });
	const raw = JSON.parse(readFileSync(cookieFile, 'utf8'));
	const norm = raw.map((c) => ({
		name: c.name,
		value: String(c.value).replace(/^"|"$/g, ''),
		url: `https://${String(c.domain).replace(/^\./, '')}${c.path || '/'}`,
		secure: c.secure !== false,
		httpOnly: Boolean(c.httpOnly),
		...(c.expirationDate ? { expires: Math.floor(c.expirationDate) } : {}),
	}));
	context = await chromium.launchPersistentContext(path.join(repoRoot, 'chrome-real-profile'), {
		headless: false, channel: 'chromium',
		args: [
			'--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled',
			`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`,
		],
		viewport: { width: 1680, height: 1000 }, ignoreDefaultArgs: ['--enable-automation'],
	});
	await context.addCookies(norm);
	console.log(`  (modo REAL · ${norm.length} cookies · lección del curso de Java)`);
	page = await context.newPage();
} else {
	// ── modo CLON: servidor local bajo udemy.com ────────────────────────────────
	server.on('error', () => { port += 1; if (port < 4720) server.listen(port, '127.0.0.1'); });
	await new Promise((r) => server.listen(port, '127.0.0.1', r));
	// Perfil único por ejecución: un chromium zombi de una corrida anterior
	// no puede bloquear el rmSync del siguiente.
	PROFILE = path.join(repoRoot, `temp_profile_fullflows_${process.pid}`);
	rmSync(PROFILE, { recursive: true, force: true });
	context = await chromium.launchPersistentContext(PROFILE, {
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
	page = await context.newPage();
	console.log('  (modo CLON determinista · servidor local bajo udemy.com)');
}
const consoleErrors = [];
// §6 (v1.5.1): la confirmación de reinicio vive en el dock — ningún flujo
// de la UI debe abrir diálogos nativos (bloquearían la página de Udemy).
const nativeDialogs = [];
page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 140)));
page.on('dialog', (d) => { nativeDialogs.push(d.message()); d.dismiss().catch(() => {}); });
const d4Traces = [];
page.on('console', (m) => { if (/d4trace/.test(m.text())) d4Traces.push(m.text().slice(0, 160)); });
page.on('console', (m) => {
	if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 140));
});

// ── informe ────────────────────────────────────────────────────────────────────
const results = [];
const check = (name, ok, detail) => {
	results.push({ name, ok, detail });
	console.log(`  ${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const section = (t) => console.log(`\n${t}`);

await page.goto(REAL ? LECTURE_URL : `https://www.udemy.com:${port}/course/j/learn/lecture/1/`);
await page.waitForSelector(OUTER, { timeout: REAL ? 40000 : 25000 });
let sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 25000 }).catch(() => null);
if (sw && !REAL) {
	// Cada fase es UNA llamada de storage plana con timeout propio: si el SW de
	// MV3 muere a mitad del callback, el evaluate no resuelve nunca (visto en QA)
	// y el bucle de reintento toma una instancia nueva.
	const withTimeout = (p, tag) => Promise.race([
		p,
		new Promise((_, rej) => setTimeout(() => rej(new Error(`${tag} timeout`)), 15000)),
	]);
	const seedLocal = (worker) => withTimeout(worker.evaluate(({ record, qaPort }) => new Promise((resolve, reject) => {
		chrome.storage.local.set({
			[`usb_history_lecture::${record.courseId}::${record.lectureId}`]: record,
			obsidian_export_config: { vaultName: 'QA Vault', sourcesFolder: 'wiki/fuentes', mocsFolder: 'cursos', includeCards: true, autoExport: false, includeRawSrt: false },
			obsidian_exported_notes: [`${record.courseId}::${record.lectureId}`],
			// Proveedor IA apuntando al mock del QA (generación determinista):
			// plano, en la MISMA llamada — sin carreras con el reload.
			usg_ai_provider_config: { kind: 'openai', baseUrl: `http://127.0.0.1:${qaPort}/v1`, apiKey: 'qa-key', model: 'qa-model' },
			// Sesión de vocabulario guardada con minLevel B2 (el panel carga B1):
			// criterios distintos. El panel debe MOSTRARLA marcada como pendiente
			// de aplicar, no esconderla como si no existiera. Es la regresión del
			// bug que escondía sesiones guardadas al restaurarlas.
			[`usb_vocab_session_${record.courseName.toLowerCase()}|${record.lectureName.toLowerCase()}|en`]: {
				course: record.courseName,
				lesson: record.lectureName,
				config: { rootDeck: 'Kinema', targetLang: 'en', targetLangLabel: 'English', baseLangLabel: 'español', minLevel: 'B2', maxWords: 8, audioMode: 'field' },
				candidates: [
					{ word: 'bytecode', level: 'B1', pos: 'noun', meaning: 'código intermedio', sentence: 'The JVM interprets bytecode.', sentenceTranslation: 'La JVM interpreta bytecode.', phonetic: '/ˈbaɪtkoʊd/', monolingual: 'intermediate code' },
				],
				selected: [],
				demo: false,
				exports: [],
			},
		}, () => {
			if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
			resolve();
		});
	}), { record: RECORD, qaPort: QA_PORT }), 'seed');
	const seedSync = (worker) => withTimeout(worker.evaluate(({ record }) => new Promise((resolve, reject) => {
		chrome.storage.sync.set({
			agent_course_name: record.courseName,
			agent_lesson_name: record.lessonName,
			agent_selected_obj: 'custom',
		}, () => {
			if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
			resolve();
		});
	}), { record: RECORD }), 'seed sync');
	// El SW puede pararse en mitad del seed ("Service worker restarted"):
	// se reintenta con la instancia nueva hasta 5 veces.
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			await seedLocal(sw);
			await seedSync(sw);
			break;
		} catch (err) {
			if (attempt === 4 || !/Service worker restarted|seed timeout|seed sync timeout/.test(String(err))) throw err;
			console.log('  (SW reiniciado durante el seed — reintento)');
			await new Promise((r) => setTimeout(r, 1200)); // deja asentar al SW nuevo
			const next = context.serviceWorkers().at(-1) ?? await context.waitForEvent('serviceworker', { timeout: 25000 }).catch(() => null);
			if (!next) throw err;
			sw = next;
		}
	}
	await page.reload();
	await page.waitForSelector(OUTER, { timeout: 25000 });
	await page.waitForTimeout(2000);
}
await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(REAL ? 2500 : 1500);
mkdirSync(SHOTS, { recursive: true });

// ══ A. Arranque ═══════════════════════════════════════════════════════════════
section('A. Arranque — inyección del content script');
const boot = await page.evaluate(() => {
	const host = document.querySelector('[id^="usb-dock-host-"]');
	const sr = host?.shadowRoot;
	const video = document.querySelector('video');
	// Los selectores de metadatos de Udemy cambian de forma; el content script
	// tiene una cadena de respaldo (og:title, document.title, slug de la URL).
	// Se mide lo que la extensión puede obtener de verdad, no un selector fijo.
	const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
		?? document.querySelector('meta[name="title"]')?.getAttribute('content')
		?? null;
	return {
		host: Boolean(host),
		shadowOpen: Boolean(sr),
		video: Boolean(video),
		ogTitle: (ogTitle || document.title || '').trim().slice(0, 60) || null,
		docTitle: (document.title || '').slice(0, 60) || null,
	};
});
check('el dock se inyecta con shadow DOM abierto', boot.host && boot.shadowOpen, JSON.stringify(boot));
// En la página real de hoy faltan los data-purpose que usaba el clon; el título
// se saca de og:title o document.title. Basta con que haya de dónde leerlo.
check('hay metadatos de curso/lección accesibles',
	Boolean(boot.video) && Boolean(boot.ogTitle || boot.docTitle), JSON.stringify(boot));

// ══ B. Subtítulos ═════════════════════════════════════════════════════════════
section('B. Subtítulos — overlay y ajustes');
// Abrir la pestaña de subtítulos del dock.
const captionsTab = page.locator(`${OUTER} button`).filter({ hasText: /Subtítulos|Captions/ }).first();
const hasCaptionsTab = await captionsTab.count().catch(() => 0);
check('la pestaña de subtítulos existe en el dock', hasCaptionsTab > 0, String(hasCaptionsTab));
if (hasCaptionsTab) {
	await captionsTab.evaluate((el) => el.click()).catch(() => {});
	await page.waitForTimeout(1200);
	const cap = await page.evaluate(() => {
		const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		const txt = (root?.textContent ?? '');
		return {
			// La vista de subtítulos expone el desfase y los perfiles.
			desfase: /Desfase|desfase/i.test(txt),
			perfiles: /perfiles|Perfiles|Cinema/i.test(txt),
			posicion: /Posición|posición/i.test(txt),
		};
	});
	check('los controles de subtítulos se renderizan',
		cap.desfase || cap.perfiles || cap.posicion, JSON.stringify(cap));
	await page.screenshot({ path: path.join(SHOTS, 'b-subtitulos.png') });
}

// ══ C. Ajustes (regresión de revisión 2) ══════════════════════════════════════
section('C. Ajustes — deep-link, sepia y toaster');
const settingsState = () => page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const sheet = root?.querySelector('section[aria-label="Configuración de Kinema"]');
	if (!sheet) return { mounted: false, open: false, section: null };
	const headers = [...sheet.querySelectorAll('section.kx-settings-section')];
	const open = headers.find((s) => s.querySelector('button[aria-expanded="true"]'));
	return {
		mounted: true,
		open: sheet.getAttribute('aria-hidden') !== 'true' && getComputedStyle(sheet).visibility !== 'hidden',
		section: open?.getAttribute('aria-label') ?? null,
	};
});

await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
await page.waitForTimeout(500);
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'obsidian' } })));
await page.waitForTimeout(1000);
const dl = await settingsState();
check('el deep-link abre la hoja y su sección',
	dl.open && /obsidian/i.test(dl.section ?? ''), JSON.stringify(dl));

// Sepia por estilo computado: el toaster debe flotar sobre todo.
await page.evaluate(() => { try { localStorage.setItem('usb_theme', 'sepia'); } catch {} });
await page.reload();
await page.waitForSelector(OUTER, { timeout: 25000 });
await page.waitForTimeout(2500);
await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(800);
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'vocabulary' } })));
await page.waitForTimeout(1600);
// Muestreo breve: el campo tarda en recibir la piel de sepia tras el repintado,
// y una lectura única podía capturarlo antes.
let sepia = null;
for (let i = 0; i < 10; i += 1) {
	sepia = await page.evaluate(() => {
		const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		const dock = root?.querySelector('.usb-dock');
		// El campo se busca dentro de la sección abierta: fuera de ella hay
		// controles sin piel propia que falsearían la lectura.
		const sec = [...(root?.querySelectorAll('section.kx-settings-section') ?? [])]
			.find((s) => /vocabulary|idiomas/i.test(s.getAttribute('aria-label') ?? ''));
		const field = sec?.querySelector('.kx-field') ?? root?.querySelector('.kx-field');
		const sheets = [...(root?.querySelectorAll('style') ?? [])].map((s) => s.textContent ?? '');
		const theme = sheets.find((t) => t.includes('.usb-dock') && t.includes('dock-sepia')) ?? '';
		const m = theme.match(/\.usb-dock \[data-sonner-toaster\][^}]*}/);
		return {
			sepia: dock?.classList.contains('dock-sepia') ?? false,
			fieldBg: field ? getComputedStyle(field).backgroundColor : null,
			toasterRule: m ? m[0] : '',
		};
	});
	if (/^rgb\(255,\s*255,\s*255\)/.test(sepia.fieldBg ?? '')) break;
	await page.waitForTimeout(300);
}
check('el tema sepia se aplica al dock', sepia.sepia === true);
check('los campos toman la piel clara en sepia', /^rgb\(255,\s*255,\s*255\)/.test(sepia.fieldBg ?? ''), String(sepia.fieldBg));
check('el toaster queda fijo y por encima de todo',
	/position:\s*fixed/.test(sepia.toasterRule) && /2147483647/.test(sepia.toasterRule), sepia.toasterRule.slice(0, 90));
await page.screenshot({ path: path.join(SHOTS, 'c-sepia.png') });


const shadow = () => page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	if (!root) return '';
	// TreeWalker que omite <style>: el textContent del shadow arrastra el CSS
	// del toaster y ensuciaba todas las aserciones.
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (n) => (n.parentElement?.tagName === 'STYLE' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
	});
	let out = '';
	while (walker.nextNode()) out += walker.currentNode.textContent ?? '';
	return out.replace(/\s+/g, ' ');
});
const clickInShadow = (match) => page.evaluate((m) => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const btn = [...root.querySelectorAll('button')].find((b) => m.test((b.textContent ?? '').trim()) && !b.disabled);
	if (!btn) return false;
	btn.click();
	return true;
}, match);
const toastsInShadow = () => page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	return [...(root?.querySelectorAll('[data-sonner-toast]') ?? [])].map((t) => (t.textContent ?? '').trim());
});
// Rellena un input React controlado dentro del shadow DOM.
const fillInputInShadow = (ph, value) => page.evaluate(([ph, value]) => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const input = [...root.querySelectorAll('input, textarea')].find((el) => el.placeholder === ph);
	if (!input) return false;
	const proto = input.tagName === 'TEXTAREA' ? root.ownerDocument.defaultView.HTMLTextAreaElement : root.ownerDocument.defaultView.HTMLInputElement;
	const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
	setter.call(input, value);
	input.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}, [ph, value]);
const readHistoryRecord = async (lectureName) => {
	const svc = context.serviceWorkers().at(-1)
		?? await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
	if (!svc) return null;
	return svc.evaluate((ln) => new Promise((done) => {
		const slug = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 80) || 'untitled';
		chrome.storage.local.get([`usb_history_lecture::javaindepthbecomeacompletejavaengineer2026::${slug(ln)}`], (res) => {
			done(Object.values(res)[0] ?? null);
		});
	}), lectureName);
};

// ══ D. Study — flujo de 4 pasos (flowVersion 2) ════════════════════════════════
section('D. Study — flujo de 4 pasos (flowVersion 2)');
if (REAL) {
	// En la cuenta real no existe una lección completada que sembrar, y
	// inventarla en el historial del usuario no es aceptable. Estas rutas se
	// cubren en modo CLON y en la suite específica de Obsidian.
	console.log('  · omitido en modo REAL: requiere una lección completada sembrada');
} else {
await page.evaluate(() => { try { localStorage.setItem('usb_theme', 'dark'); } catch {} });
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
await page.waitForTimeout(500);
await page.locator(`${OUTER} button:has-text("Study")`).first().evaluate((el) => el.click()).catch(() => {});
await page.waitForTimeout(1500);


// ── D.0 — restauración del registro v1 sembrado (migración 5 → 4 pasos) ────
let d0 = '';
for (let i = 0; i < 10; i += 1) {
	d0 = await shadow();
	if (/Lección completada|Lección terminada/.test(d0)) break;
	await page.waitForTimeout(900);
}
check('v1 sembrada restaura al paso Fijar con el resumen de cierre',
/Lección completada/.test(d0) && /Lección terminada/.test(d0), d0.slice(0, 200));
const mods = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const ps = [...(root?.querySelectorAll('section p') ?? [])].map((p) => (p.textContent ?? '').trim());
	return {
		cards: ps.includes('Tarjetas de la lección'),
		vocab: ps.includes('Mazo de idiomas · opcional'),
		obsidian: ps.includes('Obsidian'),
	};
});
check('los tres módulos de Fijar están presentes', mods.cards && mods.vocab && mods.obsidian, JSON.stringify(mods));

// D.0b — .apkg real: el botón debe producir un .apkg con SQLite dentro.
const apkgBtn = page.locator(`${OUTER} button`).filter({ hasText: /Exportar \.apkg/ }).first();
if (await apkgBtn.count().catch(() => 0)) {
	const dlPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
	await apkgBtn.evaluate((el) => el.click()).catch(() => {});
	const dl = await dlPromise;
	if (dl) {
		const tmpApkg = path.join(SHOTS, 'flow.apkg');
		await dl.saveAs(tmpApkg).catch(() => {});
		const bytes = existsSync(tmpApkg) ? readFileSync(tmpApkg).length : 0;
		check('el .apkg se descarga y no está vacío', bytes > 1000, `${bytes} bytes`);
	} else {
		check('el .apkg se descarga', false, 'sin evento de descarga en 60 s');
	}
} else {
	check('hay botón de exportar .apkg', false, 'no encontrado');
}

// ── D.1 — flujo mínimo: nivel → 1 respuesta → Hacerlo después → Terminar ───
// Lección NUEVA: Reiniciar (aceptando la confirmación nativa) lleva a objetivo.
const MIN_LESSON = 'Flujo minimo QA';
await clickInShadow(/Reiniciar/);
await page.waitForTimeout(400);
await clickInShadow(/Sí, reiniciar/);
let objTxt0 = '';
for (let i = 0; i < 8; i += 1) {
	await page.waitForTimeout(600);
	objTxt0 = await shadow();
	if (/¿Para qué estudias esto\??/.test(objTxt0)) break;
}
check('Reiniciar con confirmación aceptada vuelve a la pantalla de objetivo',
	/¿Para qué estudias esto\??/.test(objTxt0) && !/Lección terminada/.test(objTxt0), objTxt0.replace(/\s+/g, ' ').slice(0, 200));

// §1.5: el indicador de transcripción es un estado real — jamás «248 líneas».
for (let i = 0; i < 10; i += 1) {
	const d1txt = await shadow();
	if (/Subtítulos listos|Esperando subtítulos|Sin subtítulos/.test(d1txt)) break;
	await page.waitForTimeout(1200);
}
const d1txt2 = await shadow();
check('el indicador de transcripción es un estado real (nunca «248 líneas»)',
	/Subtítulos listos|Esperando subtítulos|Sin subtítulos/.test(d1txt2) && !/248 líneas/.test(d1txt2),
	(d1txt2.match(/Subtítulos listos[^.]*|Esperando subtítulos[^.]*|Sin subtítulos[^.]*/) ?? ['?'])[0]);

await clickInShadow(/Editar curso o lección/);
await page.waitForTimeout(400);
await fillInputInShadow('Nombre del video/clase actual', MIN_LESSON);
await page.waitForTimeout(300);
// En el clon no hay IA: los objetivos son mock y el CTA exige objetivo propio.
await fillInputInShadow('Ej: Conseguir trabajo en fintech como Java dev en 3 meses…', 'Dominar la portabilidad de Java');
await page.waitForTimeout(300);

let genOk = false;
for (let i = 0; i < 10 && !genOk; i += 1) {
	genOk = await clickInShadow(/Empezar · ~4–10 min|Generar sesión de aprendizaje · ~4–10 min|Generar sesión de aprendizaje/);
	if (!genOk) await page.waitForTimeout(700);
}
check('el CTA de generación se habilita con detección + objetivo', genOk);
// Espera activa a la fase de resultado (un fallo de generación avisa con toast).
for (let i = 0; i < 25; i += 1) {
	const dbg = await shadow();
	if (/¿Qué tan claro te quedó el video\?/.test(dbg)) break;
	await page.waitForTimeout(400);
}
await clickInShadow(/^Confuso/); // paso Recordar: 1 toque de nivel
await page.waitForTimeout(600);
// Gate del recuerdo libre (§1.1): rellenarlo y comparar con la lista.
const fillRecall = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const ta = [...root.querySelectorAll('textarea')].find((el) => /Lo que recuerdo es/.test(el.placeholder));
	if (!ta) return false;
	const setter = Object.getOwnPropertyDescriptor(root.ownerDocument.defaultView.HTMLTextAreaElement.prototype, 'value').set;
	setter.call(ta, 'Recuerdo que Java compila a bytecode y la JVM lo ejecuta en cualquier SO.');
	ta.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
});
check('el recuerdo libre admite texto antes de la lista', fillRecall);
await clickInShadow(/Comparar con los conceptos|Ver los conceptos/);
await page.waitForTimeout(600);
await clickInShadow(/Ponerme a prueba/);
await page.waitForTimeout(800);
// Responde la pregunta (≥20 caracteres para el XP de submit).
const fillQ = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const ta = [...root.querySelectorAll('textarea')].find((el) => /Escribe tu respuesta con tus propias palabras/.test(el.placeholder));
	if (!ta) return false;
	const setter = Object.getOwnPropertyDescriptor(root.ownerDocument.defaultView.HTMLTextAreaElement.prototype, 'value').set;
	setter.call(ta, 'El bytecode es un formato intermedio que ejecuta la JVM en cualquier sistema operativo.');
	ta.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
});
check('la pregunta del nivel elegido aparece con su textarea', fillQ);
const sawSkippedToast = [];
await clickInShadow(/^Evaluar/);
await page.waitForTimeout(4500); // evaluación mock streaming
let flowOk = false;
for (let i = 0; i < 8 && !flowOk; i += 1) {
	const txt = await shadow();
	if (/Continuar a Aplicar/.test(txt)) { flowOk = true; break; }
	if (/Continuar a practicar/.test(txt)) { flowOk = true; break; }
	if (/\bSiguiente\b/.test(txt)) {
		// Falló: la consolidación del nivel anterior debe aparecer (§1.2).
		await clickInShadow(/\bSiguiente\b/);
		await page.waitForTimeout(900);
		await page.evaluate(() => {
			const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
			const ta = [...root.querySelectorAll('textarea')].find((el) => /Escribe tu respuesta con tus propias palabras/.test(el.placeholder));
			if (ta && !ta.value) {
				const setter = Object.getOwnPropertyDescriptor(root.ownerDocument.defaultView.HTMLTextAreaElement.prototype, 'value').set;
				setter.call(ta, 'Consolidación: la JVM interpreta el bytecode y el JIT compila los puntos calientes.');
				ta.dispatchEvent(new Event('input', { bubbles: true }));
			}
		});
		await clickInShadow(/^Evaluar/);
		await page.waitForTimeout(4500);
		continue;
	}
	await page.waitForTimeout(800);
}
// El último clic puede ser el que completa: comprobar de nuevo antes de rendirse.
for (let i = 0; i < 4 && !flowOk; i += 1) {
	if (await clickInShadow(/Continuar a Aplicar|Continuar a practicar/)) { flowOk = true; break; }
	await page.waitForTimeout(700);
}
await page.screenshot({ path: path.join(SHOTS, 'd-estudio.png') });
check('el paso Comprobar se completa (a la primera o con consolidación)', flowOk, flowOk ? '' : (await shadow()).slice(0, 120));
sawSkippedToast.push(...await toastsInShadow());
check('responder NO emite «Evaluación saltada»',
	!sawSkippedToast.some((x) => /Evaluación saltada/i.test(x)), JSON.stringify(sawSkippedToast).slice(0, 120));
await clickInShadow(/Continuar a Aplicar|Continuar a practicar/);
await page.waitForTimeout(700);
await clickInShadow(/Hacerlo después/);
await page.waitForTimeout(700);
const finTxt = await shadow();
check('«Hacerlo después» lleva a Fijar con práctica pendiente',
	/Terminar lección/.test(finTxt) && /práctica pendiente/.test(finTxt), finTxt.slice(0, 160));
await clickInShadow(/Terminar lección/);
await page.waitForTimeout(1500);
const doneTxt = await shadow();
check('«Terminar lección» cierra sin exportar', /Lección terminada/.test(doneTxt), doneTxt.slice(0, 140));
const recMin = await readHistoryRecord(MIN_LESSON);
check('el registro guarda finishedAt + status completed + questionsDone',
	Boolean(recMin?.finishedAt) && recMin?.status === 'completed' && recMin?.questionsDone === true,
	JSON.stringify({ f: recMin?.finishedAt, s: recMin?.status, q: recMin?.questionsDone }).slice(0, 120));
check('el resumen refleja práctica pendiente y sin exportar',
	/pendiente/.test(recMin?.practiceStatus ?? '') || recMin?.practiceStatus === 'later',
	String(recMin?.practiceStatus));

// ── D.1b — §1 en sepia: «Refuerzo» e «Incluir» con los tokens AA ────────────
// La lección mínima quedó terminada: al recargar en sepia restaura a Fijar
// con sus tarjetas de refuerzo en la vista previa.
await page.evaluate(() => { try { localStorage.setItem('usb_theme', 'sepia'); } catch {} });
await page.reload();
await page.waitForSelector(OUTER, { timeout: 25000 });
await page.waitForTimeout(2000);
await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(1000);
await page.locator(`${OUTER} button:has-text("Study")`).first().evaluate((el) => el.click()).catch(() => {});
let d1b = '';
for (let i = 0; i < 14; i += 1) {
	await page.waitForTimeout(700);
	d1b = await shadow();
	if (/Lección terminada/.test(d1b)) break;
}
check('sepia: la lección mínima restaura a Fijar terminada',
	/Lección terminada/.test(d1b), d1b.slice(0, 160));
await clickInShadow(/Ver tarjetas/);
await page.waitForTimeout(700);
const refuerzoColor = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const chip = [...root.querySelectorAll('span')].find((s) => (s.textContent ?? '').trim() === 'Refuerzo');
	return chip ? getComputedStyle(chip).color : 'no encontrado';
});
check('sepia: el chip «Refuerzo» usa el ámbar AA (rgb(146, 64, 14))',
	refuerzoColor === 'rgb(146, 64, 14)', refuerzoColor);
await clickInShadow(/^Quitar$/);
await page.waitForTimeout(400);
const incluirColor = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const btn = [...root.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === 'Incluir');
	return btn ? getComputedStyle(btn).color : 'no encontrado';
});
check('sepia: «Incluir» tras «Quitar» usa el verde AA (rgb(4, 120, 87))',
	incluirColor === 'rgb(4, 120, 87)', incluirColor);

// ── D.2 — «Saltar» SÍ emite el aviso y el resumen lo refleja ────────────────
const SKIP_LESSON = 'Saltar QA';
await clickInShadow(/Reiniciar/);
await page.waitForTimeout(400);
await clickInShadow(/Sí, reiniciar/);
await page.waitForTimeout(1200);
await clickInShadow(/Editar curso o lección/);
await page.waitForTimeout(400);
await fillInputInShadow('Nombre del video/clase actual', SKIP_LESSON);
await page.waitForTimeout(300);
await fillInputInShadow('Ej: Conseguir trabajo en fintech como Java dev en 3 meses…', 'Dominar la portabilidad de Java');
await page.waitForTimeout(300);
for (let i = 0; i < 10; i += 1) { if (await clickInShadow(/Empezar · ~4–10 min|Generar sesión de aprendizaje/)) break; await page.waitForTimeout(700); }
await page.waitForTimeout(9000);
await clickInShadow(/^Confuso/);
await page.waitForTimeout(600);
await clickInShadow(/Comparar con los conceptos|Ver los conceptos/);
await page.waitForTimeout(600);
await clickInShadow(/Ponerme a prueba/);
await page.waitForTimeout(700);
await clickInShadow(/Saltar comprobación/);
await page.waitForTimeout(900);
const skipToasts = await toastsInShadow();
check('«Saltar comprobación» emite «Evaluación saltada»',
	skipToasts.some((x) => /Evaluación saltada/i.test(x)), JSON.stringify(skipToasts).slice(0, 120));
const recSkip = await readHistoryRecord(SKIP_LESSON);
check('el salto queda registrado (questionsDone + questionsSkipped)',
	recSkip?.questionsDone === true && recSkip?.questionsSkipped === true,
	JSON.stringify({ q: recSkip?.questionsDone, sk: recSkip?.questionsSkipped }));

// ── D.3 — confirmación de reinicio DENTRO del dock (§6, v1.5.1) ────────────
await clickInShadow(/Reiniciar/);
await page.waitForTimeout(500);
const d3txt = await shadow();
check('al pulsar «Reiniciar» aparece «¿Borrar respuestas?» sin diálogo nativo',
	/¿Borrar respuestas\??/.test(d3txt) && /Sí, reiniciar/.test(d3txt), d3txt.slice(0, 180));
await clickInShadow(/Cancelar/);
await page.waitForTimeout(500);
const recAfterCancel = await readHistoryRecord(SKIP_LESSON);
check('«Cancelar» no borra el progreso (questionsDone sigue en true)',
	Boolean(recAfterCancel?.questionsDone), String(Boolean(recAfterCancel)));
await page.waitForTimeout(5500); // sin acción: la confirmación se revierte sola a los 5 s
const d3back = await shadow();
check('tras 5,5 s sin acción vuelve el botón «Reiniciar»',
	/Reiniciar/.test(d3back) && !/¿Borrar respuestas\??/.test(d3back), d3back.slice(0, 180));
await page.screenshot({ path: path.join(SHOTS, 'd-estudio.png') });

} // fin del bloque D (solo modo CLON)

// ══ E. Obsidian — export + guard de duplicados ════════════════════════════════
section('E. Obsidian — export y aviso de duplicado');
if (REAL) {
	console.log('  · omitido en modo REAL: escribiría notas en el vault real del usuario');
} else {
// D terminó en otra lección: volver a la sembrada (rehydrate automático).
await clickInShadow(/Reiniciar/);
await page.waitForTimeout(400);
await clickInShadow(/Sí, reiniciar/);
await page.waitForTimeout(1500);
await clickInShadow(/Editar curso o lección/);
await page.waitForTimeout(400);
await fillInputInShadow('Nombre del video/clase actual', LESSON);
// El Reiniciar del flujo limpió el registro sembrado (clearProgress): re-sembrar.
await writeSeedViaSw();
await page.reload();
await page.waitForSelector(OUTER, { timeout: 25000 });
await page.locator(`${OUTER} button:has-text("Study")`).first().evaluate((el) => el.click()).catch(() => {});
await page.waitForTimeout(2500);
let eTxt = '';
for (let i = 0; i < 12; i += 1) {
	await page.waitForTimeout(700);
	eTxt = await shadow();
	if (/Fíjalo en memoria|Lección completada/.test(eTxt)) break;
}
let obsidianUris = [];
context.on('request', (r) => { if (r.url().startsWith('obsidian://')) obsidianUris.push(r.url()); });
const obsBtn = page.locator(`${OUTER} section`).filter({
	has: page.locator('p', { hasText: /^Obsidian$/ }),
}).locator('button', { hasText: /^(Exportar|Exportado)$/ }).last();

for (let i = 0; i < 14; i++) {
	if (await obsBtn.count().catch(() => 0)) {
		await obsBtn.scrollIntoViewIfNeeded().catch(() => {});
		const b = await obsBtn.boundingBox().catch(() => null);
		if (b && b.y > 60 && b.y + b.height < 990) break;
	}
	await page.mouse.move(840, 700);
	await page.mouse.wheel(0, 400);
	await page.waitForTimeout(400);
}
if (await obsBtn.count().catch(() => 0)) {
	await obsBtn.evaluate((el) => el.click()).catch(() => {});
	await page.waitForTimeout(4000);
	check('el export emite URIs obsidian:// (MOC + nota)', obsidianUris.length === 2, `${obsidianUris.length} URIs`);
	let listo = false;
	for (let i = 0; i < 12 && !listo; i += 1) {
		await page.waitForTimeout(1000);
		listo = await page.evaluate(() => {
			const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
			return [...root.querySelectorAll('section')]
				.filter((s) => [...s.querySelectorAll('p')].some((p) => (p.textContent ?? '').trim() === 'Obsidian'))
				.some((s) => /Listo/i.test(s.textContent ?? ''));
		});
	}
	check('aparece la insignia «✓ Listo» tras exportar', listo);
	await page.screenshot({ path: path.join(SHOTS, 'e-obsidian.png') });
} else {
	check('el botón de Obsidian está presente', false, 'no encontrado tras scroll');
}
} // fin del bloque E (solo modo CLON)

// ══ F. Proveedor — permiso de host ════════════════════════════════════════════
section('F. Proveedor — permiso de host');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'provider' } })));
// La hoja tarda en abrirse y el panel del proveedor en montar sus controles. Sin
// esperar a que existan, la prueba mide una hoja cerrada y reporta fallos falsos.
const openaiBtn = page.locator(`${OUTER} button[role="radio"]`).filter({ hasText: /^OpenAI$/ }).first();
const ep = page.locator(`${OUTER} input[placeholder="https://api.openai.com/v1"]`).first();
const saveBtn = page.locator(`${OUTER} button`).filter({ hasText: /Probar conexión y guardar/ }).first();
// El campo Endpoint solo existe con el motor OpenAI elegido, y el proveedor
// activo depende del estado previo (Local no lo muestra). Hay que seleccionar
// OpenAI PRIMERO y esperar después: esperar el campo antes no lo crea.
let ready = false;
for (let i = 0; i < 16 && !ready; i += 1) {
	await page.waitForTimeout(700);
	if (await openaiBtn.count().catch(() => 0)) {
		const isOpenAi = await page.evaluate(() => {
			const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
			const on = [...root.querySelectorAll('button[role="radio"]')].find((b) => b.getAttribute('aria-checked') === 'true');
			return /OpenAI/.test(on?.textContent ?? '');
		});
		if (!isOpenAi) { await openaiBtn.evaluate((el) => el.click()).catch(() => {}); await page.waitForTimeout(700); }
	}
	if (await ep.count().catch(() => 0) && await saveBtn.count().catch(() => 0)) ready = true;
}
if (ready) {
	// Host sin permiso: debe avisar y ofrecer la acción, no guardar en silencio.
	await ep.evaluate((el) => { el.value = 'http://192.168.1.50:8080/v1'; el.dispatchEvent(new Event('input', { bubbles: true })); });
	await page.waitForTimeout(300);
	const samples = await saveBtn.evaluate(async (btn) => {
		const out = [];
		const snap = () => {
			const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
			const toasts = [...(root?.querySelectorAll('[data-sonner-toast]') ?? [])].map((t) => (t.textContent ?? '').trim());
			return toasts.slice(0, 3);
		};
		out.push(snap());
		const t0 = performance.now();
		await new Promise((done) => {
			const iv = setInterval(() => { out.push(snap()); if (performance.now() - t0 > 4000) { clearInterval(iv); done(); } }, 100);
			btn.click();
		});
		return out;
	});
	const toasts = samples.flat();
	check('avisa «Sin permiso de red» para un host no cubierto',
		toasts.some((t) => /Sin permiso de red/i.test(t)), JSON.stringify(toasts).slice(0, 120));
	check('ofrece «Conceder permiso» en el aviso',
		toasts.some((t) => /Conceder permiso/i.test(t)), JSON.stringify(toasts).slice(0, 160));
	check('no manda a la ruta manual que no funciona',
		!toasts.some((t) => /chrome:\/\/extensions/i.test(t)), JSON.stringify(toasts).slice(0, 160));
} else {
	check('el panel de proveedor tiene endpoint y botón de guardar', false, 'no encontrados');
}

// ══ G. Vocabulario ════════════════════════════════════════════════════════════
section('G. Vocabulario — restauración de la sesión guardada');
// El pipeline de vocabulario (filtro CEFR, registro de lemas, GUID por
// idioma|lema) es puro y no depende del navegador: lo cubre la suite
// estructural qa-anki-decks.mjs. Aquí se comprueba lo que depende del UI:
// que una sesión guardada se RESTAURE al volver al panel, incluso cuando
// difiere en criterios (sembrada con B2, el panel carga B1). El bug original
// la escondía como si no existiera.
if (REAL) {
	console.log('  · restauración omitida en modo REAL (requiere la sesión sembrada del clon)');
} else {
	await page.evaluate(() => { try { localStorage.setItem('usb_theme', 'dark'); } catch {} });
	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
	await page.waitForTimeout(700);
	// Volver a la vista Study (los ajustes la dejaron en segundo plano).
	await page.locator(`${OUTER} button:has-text("Study")`).first().evaluate((el) => el.click()).catch(() => {});
	await page.waitForTimeout(1800);
	const restored = await page.evaluate(() => {
		const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		const txt = (root?.textContent ?? '').replace(/\s+/g, ' ');
		return {
			region: Boolean(root?.querySelector('[aria-label="Candidatas de vocabulario"]')),
			palabra: /bytecode/i.test(txt),
			contador: txt.match(/\d+ · \d+ sel\. · \d+ exp\./)?.[0] ?? null,
			// Con criterios distintos el botón debe proponer APLICAR los cambios,
			// no regenerar desde cero (la sesión existe y el usuario la conservó).
			botonAplicar: /Aplicar cambios a la lista/i.test(txt),
			botonProponer: /Proponer palabras/i.test(txt),
		};
	});
	check('la sesión guardada con criterios distintos SE MUESTRA',
		restored.region && restored.palabra, JSON.stringify(restored));
	check('la sesión restaurada se marca como pendiente de aplicar (no se regenera)',
		restored.botonAplicar && !restored.botonProponer, JSON.stringify(restored));
	// El panel de ajustes conserva sus controles (mismo bloque, vista adicional).
	const vocabUi = await page.evaluate(() => {
		const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		const txt = (root?.textContent ?? '');
		return {
			panel: /Mazo de idiomas/i.test(txt),
			cefr: /CEFR/i.test(txt),
			nivel: /Desde el nivel/i.test(txt),
		};
	});
	check('el panel de Mazo de idiomas se renderiza con sus controles',
		vocabUi.panel && (vocabUi.cefr || vocabUi.nivel), JSON.stringify(vocabUi));
	await page.screenshot({ path: path.join(SHOTS, 'g-vocabulario.png') });
}

// ══ H. Glosario — el interruptor de Captions llega al content script ═════════
section('H. Glosario — showGlossaryChip aceptado por el content script');
// Bug: ExtensionSidebar enviaba showGlossaryChip y el content script leía
// showGlossary — el interruptor no hacía nada sobre el video. El contrato se
// verifica con el breadcrumb del content script (data-usb-gloss-debug, que
// updateGlossChip refresca con el flag ACEPTADO, el tiempo del video y el
// tamaño del glosario) — exactamente el estado del que depende el chip.
if (REAL) {
	console.log('  · omitido en modo REAL (requiere la sesión sembrada del clon)');
} else {
	const glossDebug = () => page.evaluate(() => {
		try { return JSON.parse(document.documentElement.dataset.usbGlossDebug || 'null'); }
		catch { return null; }
	});
	// Glosario con contenido (el chip depende de que haya palabras).
	await page.evaluate(() => {
		window.dispatchEvent(new CustomEvent('usb_to_content', {
			detail: { type: 'GLOSSARY_UPDATE', payload: { words: [{ word: 'platform', meaning: 'plataforma' }] } },
		}));
	});
	await page.waitForTimeout(600);
	const seeded = await glossDebug();
	check('GLOSSARY_UPDATE aceptado (glosario con 1 entrada)', Boolean(seeded) && seeded.gloss === 1, JSON.stringify(seeded));
	// OFF por el MISMO canal que usa el interruptor: el flag aceptado debe caer.
	await page.evaluate(() => {
		window.dispatchEvent(new CustomEvent('usb_to_content', {
			detail: { type: 'OVERLAY_CONFIG_UPDATE', payload: { showGlossaryChip: false } },
		}));
	});
	await page.waitForTimeout(700);
	const off = await glossDebug();
	check('glosario OFF: showGlossaryChip=false aceptado por el content script', Boolean(off) && off.chip === false, JSON.stringify(off));
	// ON de nuevo: el flag vuelve (y updateGlossChip re-evalúa el chip al instante).
	await page.evaluate(() => {
		window.dispatchEvent(new CustomEvent('usb_to_content', {
			detail: { type: 'OVERLAY_CONFIG_UPDATE', payload: { showGlossaryChip: true } },
		}));
	});
	await page.waitForTimeout(700);
	const on = await glossDebug();
	check('glosario ON: showGlossaryChip=true aceptado de nuevo', Boolean(on) && on.chip === true, JSON.stringify(on));
	await page.screenshot({ path: path.join(SHOTS, 'h-glosario.png') });
}

// ══ Cierre// ══ Cierre// ══ Cierre ════════════════════════════════════════════════════════════════════
section('Errores de consola');
// El bloqueo de protocolos externos es esperado y es la prueba de que la URI se
// emitió: sin Obsidian instalado, Chrome rechaza obsidian:// y lo registra.
// No es un fallo de la extensión.
const KNOWN = [
	/favicon/i,
	/net::ERR_/i,
	/Failed to load resource/i,
	/Not allowed to launch 'obsidian:/i,
];
const realErrors = consoleErrors.filter((e) => !KNOWN.some((k) => k.test(e)));
check('sin errores de consola relevantes', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
const protocolBlocked = consoleErrors.filter((e) => /Not allowed to launch 'obsidian:/i.test(e)).length;
if (protocolBlocked) console.log(`  (protocolo externo bloqueado ${protocolBlocked}× — normal sin Obsidian instalado)`);

await context.close();
check('sin diálogos nativos en toda la suite (§6)', nativeDialogs.length === 0,
	nativeDialogs.length ? JSON.stringify(nativeDialogs).slice(0, 120) : '');

// El servidor y el perfil temporal solo existen en modo CLON. El perfil real no
// se toca: tiene la sesión del usuario y se reutiliza entre corridas.
if (!REAL) {
	try { server.close(); } catch { /* ya cerrado */ }
	// Perfil ÚNICO de esta corrida (pid) + el legado fijo si existe y no está
	// bloqueado por un chromium zombi: force + try para no enmascarar resultados.
	if (!KEEP) {
		try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* zombi */ }
		try { rmSync(path.join(repoRoot, 'temp_profile_fullflows'), { recursive: true, force: true }); } catch { /* zombi */ }
	}
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${'─'.repeat(64)}`);
console.log(`  ${results.length - failed.length}/${results.length} comprobaciones en verde`);
if (failed.length) {
	console.log('\n  Fallos:');
	for (const f of failed) console.log(`   ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
	console.log(`\n❌ SUITE CON FALLOS`);
} else {
	console.log(`\n✅ TODOS LOS FLUJOS OK`);
}
process.exit(failed.length ? 1 : 0);
