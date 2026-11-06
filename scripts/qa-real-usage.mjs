// Prueba de uso REAL: lección de ~3 min del curso real, flujo mínimo.
// Mismo mecanismo que qa-full-flows clone: mock IA en 8123, provider seed
// por SW, transcripción del vídeo real.
import { chromium } from 'playwright';
import { createObserverTimeline, EVAL_LOADING } from './observer-timeline.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');
const OUTER = '[id^="usb-dock-host-"]';
const PROFILE = path.join(repoRoot, 'chrome-real-profile');
const SHOTS = path.join(repoRoot, 'tmp', 'real-usage');
const SLUG = 'java-in-depth-become-a-complete-java-engineer';
mkdirSync(SHOTS, { recursive: true });

try { execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*chrome-real-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' }); } catch {}
rmSync(path.join(PROFILE, 'Default', 'Service Worker'), { recursive: true, force: true });
const watchdog = setTimeout(() => { console.log('WATCHDOG'); process.exit(9); }, 25 * 60 * 1000);

// ── Mock IA (igual que qa-full-flows) ──
const QA_STUDY = {
	relevance: { score: 91, reason: 'ok' },
	summary: 'Resumen.',
	conceptTerms: ['bytecode'],
	keyConcepts: ['javac compila a bytecode', 'la JVM interpreta en runtime', 'el JIT compila hot spots', 'bytecode portable'],
	quickWin: 'Ejecuta el .class en dos SO.',
	questions: [
		{ q: 'QA · ¿Qué produce javac?', bloom: 'recordar', difficulty: 'confused', conceptRefs: [0], hint: 'No es .exe', answer: 'Bytecode en .class' },
		{ q: 'QA · ¿Por qué corre en Win y Linux?', bloom: 'comprender', difficulty: 'partial', conceptRefs: [1], hint: 'Por plataforma', answer: 'La JVM interpreta' },
		{ q: 'QA · ¿Cuándo compila el JIT?', bloom: 'aplicar', difficulty: 'clear', conceptRefs: [2], hint: 'Runtime', answer: 'Hot spots' },
		{ q: 'QA · ¿Java más lento que C++?', bloom: 'evaluar', difficulty: 'mastered', conceptRefs: [2, 3], hint: 'Depende', answer: 'No: JIT' },
	],
	application: { isCode: false, setup: 'Tienes App.java', challenge: 'Ejecuta sin recompilar', solution: 'java -cp . App' },
	interviewQ: { q: 'QA · Explica portabilidad.', idealAnswer: 'Bytecode + JVM + JIT.' },
	nextAction: 'Ejecuta en dos SO.',
	ankiCards: [
		{ id: 'card-001', type: 'concepto', conceptRefs: [0], front: 'QA · ¿Qué produce javac?', back: 'Bytecode.', tags: ['java'] },
		{ id: 'card-002', type: 'concepto', conceptRefs: [2], front: 'QA · ¿Cuándo compila el JIT?', back: 'En runtime.', tags: ['java'] },
		{ id: 'card-003', type: 'comparacion', conceptRefs: [1, 3], front: 'QA · ¿Portable?', back: 'Bytecode sí; JVM no.', tags: ['java'] },
	],
};
const evalV = (b) => /nivel aplicar/.test(b)
	? '[INCORRECTO]\nBIEN: ok\nFALTO: JIT compila en runtime.\nPARA RECORDAR: JIT = caliente.'
	: '[CORRECTO]\nBIEN: Capturas la idea.\nFALTO: (nada)\nPARA RECORDAR: Un ejemplo propio.';
const mockHandler = (req, res) => {
	console.log(`  [mock] ${req.method} ${req.url}`);
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Private-Network', 'true');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
	if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
	// Sondeo de disponibilidad del dock: GET /v1/models
	if (req.method === 'GET' && req.url.includes('/models')) {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ object: 'list', data: [{ id: 'qa-model', object: 'model' }] }));
		return;
	}
	let raw = '';
	req.on('data', (c) => { raw += c; });
	req.on('end', () => {
		let c;
		if (/JSON VÁLIDO/.test(raw)) c = JSON.stringify(QA_STUDY);
		else if (/formato EXACTO/.test(raw)) c = evalV(raw);
		else c = 'OK';
		if (/"stream"\s*:\s*true/.test(raw)) {
			// SSE: trocea el contenido como un proveedor OpenAI-compatible
			res.writeHead(200, { 'Content-Type': 'text/event-stream' });
			const pieces = c.match(/\S+\s*/g) ?? [c];
			for (const piece of pieces) {
				res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
			}
			res.write('data: [DONE]\n\n');
			res.end();
			return;
		}
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: c } }] }));
	});
};
// QA_REAL_PROXY=1: sin mock — usa el proxy real del usuario (kivaroute en
// 127.0.0.1:6660) con deepseek-v4.1-flash:free (timing de punta a punta).
const REAL_PROXY = process.env.QA_REAL_PROXY === '1';
if (!REAL_PROXY) {
	const s8123 = http.createServer(mockHandler);
	await new Promise((r) => s8123.listen(8123, '127.0.0.1', r));
}

// ── Navegador + cookies + seed ──
const pageConsoleBuf = [];
const preGenEvents = [];
function page_console_attach(ctx) {
	for (const pg of ctx.pages()) attach(pg);
	ctx.on('page', attach);
	ctx.on('serviceworker', (sw) => {
		sw.on('console', (m) => push(`[sw] ${m.text().slice(0, 220)}`));
	});
	function attach(pg) {
		pg.on('console', (m) => push(`[pg] ${m.text().slice(0, 260)}`));
		pg.on('pageerror', (e) => push(`[pgerror] ${String(e).slice(0, 300)}`));
	}
	function push(s) {
		pageConsoleBuf.push(s);
		if (pageConsoleBuf.length > 300) pageConsoleBuf.shift();
		// Hitos de la pre-generacion con hora: permiten decir si el mazo estaba
		// listo ANTES de pulsar Empezar (el modo de observacion no lo sabia).
		if (/pre-generaci[oó]n lista|mazo pre-generado consumido/.test(s)) {
			preGenEvents.push({ text: s.slice(0, 90), at: Date.now() });
		}
	}
}

const context = await chromium.launchPersistentContext(PROFILE, {
	headless: false, channel: 'chromium',
	args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled',
		`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
	viewport: { width: 1680, height: 1000 }, ignoreDefaultArgs: ['--enable-automation'],
});
if (existsSync('.qa-udemy-cookies.json')) {
	// Limpiar las cookies del perfil: si sobrevive un access_token rotado de una
	// sesión anterior, el navegador manda las dos y la API responde HTML (403).
	await context.clearCookies();
	const raw = JSON.parse(readFileSync('.qa-udemy-cookies.json', 'utf8'));
	await context.addCookies(raw.map((c) => ({
		name: c.name, value: String(c.value).replace(/^"|"$/g, ''),
		url: `https://${String(c.domain).replace(/^\./, '')}${c.path || '/'}`,
		secure: c.secure !== false, httpOnly: Boolean(c.httpOnly),
		...(c.expirationDate ? { expires: Math.floor(c.expirationDate) } : {}),
	})));
}

// Captura de consola (el content script escribe en la consola de la página)
page_console_attach(context);

// Export real a Obsidian: solo si el usuario lo pide (QA_OBSIDIAN_VAULT=<vault>).
// El vault real vive fuera del repo; sin esta variable no se toca nada suyo.
const obsidianVault = process.env.QA_OBSIDIAN_VAULT ?? '';
let celebrationOk = null;
const obsidianUris = [];
context.on('request', (r) => { if (r.url().startsWith('obsidian://')) obsidianUris.push(r.url()); });
if (obsidianVault) console.log(`  export a Obsidian activado → vault «${obsidianVault}»`);

// Siembra el objetivo del curso (escenario de la 2ª lección). Debe correr
// DESPUÉS de cualquier limpieza de historial y ANTES de montar el dock.
const seedCourseObjectiveRecord = async (label = '') => {
	const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	if (!sw) return false;
	const courseNameSeed = 'Java In-Depth: Become a Complete Java Engineer! [2026]';
	const objective = 'Dominar el tema de esta lección.';
	const now = Date.now();
	const slug = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '').slice(0, 80) || 'untitled';
	const key = `usb_history_lecture::${slug(courseNameSeed)}::${slug('seeded lesson')}`;
	await sw.evaluate(({ key, courseNameSeed, objective, now, slugCourse, slugLesson }) => new Promise((res) => {
		chrome.storage.local.set({
			[key]: {
				courseId: slugCourse, lectureId: slugLesson,
				courseName: courseNameSeed, lectureName: 'Seeded lesson',
				objective, objectiveId: 'custom',
				checkedConceptIndexes: [0], conceptsAcknowledged: false,
				questionsComplete: false, focusStep: 2, flowVersion: 2,
				questions: [], ankiCardsCount: 1, status: 'in_progress',
				startedAt: now, updatedAt: now, version: 1,
			},
		}, () => res(true));
	}), { key, courseNameSeed, objective, now, slugCourse: slug(courseNameSeed), slugLesson: slug('seeded lesson') }).catch(() => {});
	console.log(`  objetivo del curso sembrado${label ? ` (${label})` : ''}`);
	return true;
};

// Abrir página para despertar el SW + seed
const seedPage = await context.newPage();
await seedPage.goto(`https://www.udemy.com/course/${SLUG}/learn/lecture/42163342`,
	{ waitUntil: 'domcontentloaded', timeout: 60000 });
await seedPage.waitForSelector(OUTER, { timeout: 45000 });
// Sembrar el proveedor REINTENTANDO y verificando la escritura: el SW puede
// apagarse a mitad del set y la escritura se pierde (antes se anunciaba el
// seed aunque hubiera fallado, y la app sondeaba el 8010 por defecto).
let seeded = false;
for (let attempt = 1; attempt <= 5 && !seeded; attempt++) {
	const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	if (!sw) { await new Promise((r) => setTimeout(r, 1500)); continue; }
	await sw.evaluate(({ real, seedCourseObjective, courseNameSeed, obsidianVault }) => new Promise((res) => {
		// (nada de process.env aqui dentro: no existe en el navegador y abortaba el set)
		if (seedCourseObjective) {
			const slug = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '').slice(0, 80) || 'untitled';
			const now = Date.now();
			const key = `usb_history_lecture::${slug(courseNameSeed)}::${slug('seeded lesson')}`;
			chrome.storage.local.set({ [key]: {
				courseId: slug(courseNameSeed), lectureId: slug('seeded lesson'),
				courseName: courseNameSeed, lectureName: 'Seeded lesson',
				objective: 'Dominar el tema de esta lección.', objectiveId: 'custom',
				checkedConceptIndexes: [0], conceptsAcknowledged: false,
				questionsComplete: false, focusStep: 2, flowVersion: 2,
				questions: [], ankiCardsCount: 1, status: 'in_progress',
				startedAt: now, updatedAt: now, version: 1,
			} }, () => {});
		}
		chrome.storage.local.set({
			usg_ai_provider_config: real
				? { kind: 'local', baseUrl: 'http://127.0.0.1:6660/v1', apiKey: '', model: 'deepseek-v4.1-flash:free' }
				: { kind: 'openai', baseUrl: 'http://127.0.0.1:8123/v1', apiKey: 'qa-key', model: 'qa-model' },
			// Export real a Obsidian (opt-in con QA_OBSIDIAN_VAULT): apunta al vault
			// de verdad para poder entregar la URI al sistema y comprobar la nota.
			...(obsidianVault ? {
				obsidian_export_config: {
					vaultName: obsidianVault, sourcesFolder: 'wiki/fuentes', mocsFolder: 'cursos',
					includeCards: true, autoExport: false, includeRawSrt: false,
				},
			} : {}),
		}, res);
	}), { real: REAL_PROXY, seedCourseObjective: process.env.QA_SEED_COURSE_OBJECTIVE === '1', courseNameSeed: 'Java In-Depth: Become a Complete Java Engineer! [2026]', obsidianVault }).catch(() => {});
	await new Promise((r) => setTimeout(r, 500));
	const back = await sw.evaluate(() => new Promise((res) => {
		chrome.storage.local.get(['usg_ai_provider_config'], (r) => res(r?.usg_ai_provider_config ?? null));
	})).catch(() => null);
	if (back?.baseUrl) {
		seeded = true;
		console.log(`  proveedor guardado: ${back.kind} ${back.baseUrl} ${back.model}`);
	} else {
		console.log(`  semilla del proveedor fallo (intento ${attempt}); reintentando`);
		await new Promise((r) => setTimeout(r, 1500));
	}
}
if (!seeded) { console.log('✗ no se pudo sembrar el proveedor de IA'); process.exit(1); }

const page = seedPage;

const shadow = () => page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	if (!root) return '';
	const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (n) => (n.parentElement?.tagName === 'STYLE' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
	});
	let o = '';
	while (w.nextNode()) o += w.currentNode.textContent ?? '';
	return o.replace(/\s+/g, ' ');
});
const click = (m) => page.evaluate((mm) => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const b = [...root.querySelectorAll('button')].find((x) => mm.test((x.textContent ?? '').trim()) && !x.disabled);
	if (!b) return false;
	b.click();
	return true;
}, m);
const fill = (ph, val) => page.evaluate(([ph, val]) => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const el = [...root.querySelectorAll('input, textarea')].find((e) => e.placeholder.includes(ph));
	if (!el) return false;
	const proto = el.tagName === 'TEXTAREA' ? root.ownerDocument.defaultView.HTMLTextAreaElement : root.ownerDocument.defaultView.HTMLInputElement;
	Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, val);
	el.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}, [ph, val]);
// Captura de cues robusta: un 0 de subtitulos no debe abortar (en una sesion
// humana seria perder la leccion entera). Reanuda la reproduccion y reintenta.
const waitForTranscript = async (attempts) => {
	for (let intento = 1; intento <= attempts; intento++) {
		const dTr = Date.now() + 60000;
		while (Date.now() < dTr) {
			const txt = await shadow();
			if (/Subtítulos listos/.test(txt)) { console.log(`  transcripción: lista ✓ (intento ${intento})`); return true; }
			if (/Sin subtítulos/.test(txt)) break;
			await page.waitForTimeout(1000);
		}
		if (intento < attempts) {
			console.log(`  transcripción: sin cues (intento ${intento}); reintentando…`);
			await page.evaluate(() => {
				const v = document.querySelector('video');
				if (v) { try { v.currentTime = Math.max(0, (v.duration || 60) - 12); } catch { /* ignore */ } v.play().catch(() => {}); }
			});
			await page.waitForTimeout(9000);
			await page.evaluate(() => { document.querySelector('video')?.pause(); });
		}
	}
	console.log('  transcripción: NO hay (agotados los reintentos)');
	return false;
};

// Navegacion con reintento: Udemy aborta alguna navegacion (net::ERR_ABORTED)
// y una corrida entera no debe caerse por eso.
const gotoWithRetry = async (url, attempts = 4) => {
	for (let i = 1; i <= attempts; i++) {
		try {
			await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
			return true;
		} catch (err) {
			console.log('  navegacion fallo (intento ' + i + '): ' + String(err).slice(0, 70));
			await page.waitForTimeout(2500);
		}
	}
	return false;
};

const waitFor = async (regex, ms) => {
	const d = Date.now() + ms;
	let t = '';
	while (Date.now() < d) { t = await shadow(); if (regex.test(t)) return t; await page.waitForTimeout(500); }
	return t;
};
const clickUntil = async (regex, ms) => {
	const d = Date.now() + ms;
	while (Date.now() < d) { if (await click(regex)) return true; await page.waitForTimeout(400); }
	return false;
};
const fillUntil = async (ph, val, ms) => {
	const d = Date.now() + ms;
	while (Date.now() < d) { if (await fill(ph, val)) return true; await page.waitForTimeout(400); }
	return false;
};
// reducir, no ocultar.
// QA_PACE=human: ritmo de persona (leer y teclear), no de script. Las esperas
// de IA se siguen midiendo aparte, asi que la columna 'humano' es lectura +
// escritura; sirve para saber si los 4/12 minutos son plausibles antes de que
// alguien invierta la sesion real.
const HUMAN_PACE = process.env.QA_PACE === 'human';
// Parametros EXPLICITOS de la simulacion (no son una medicion de persona):
// lectura 220 ppm, tecleo 40 ppm (~3.3 car/s). Se imprimen en el informe para
// que nadie lea la columna 'humano' como un dato real.
const READ_WPM = 220;
const TYPE_WPM = 40;
const readMs = (words) => Math.round((words / READ_WPM) * 60000 * (0.75 + Math.random() * 0.5));
const typeMs = (chars) => Math.round((chars / 5 / TYPE_WPM) * 60000);
const dwellRead = async (words) => {
	if (!HUMAN_PACE) return;
	await page.waitForTimeout(readMs(words));
};
const typePaced = async (ph, text) => {
	if (!HUMAN_PACE) return fill(ph, text);
	// Tecleo a TYPE_WPM: se escribe por tramos de 3 caracteres.
	const s = String(text);
	const total = typeMs(s.length);
	const chunks = Math.max(1, Math.ceil(s.length / 3));
	const perChunk = Math.max(40, Math.round(total / chunks));
	for (let i = 3; i <= s.length; i += 3) {
		await fill(ph, s.slice(0, i));
		await page.waitForTimeout(perChunk);
	}
	await fill(ph, s);
	return true;
};

const stepClock = { startedAt: 0, marks: [], aiByStep: {} };
const markStep = (name) => {
	stepClock.marks.push({ name, at: Date.now() });
	if (stepClock.startedAt) console.log(`  paso ${name} @ ${((Date.now() - stepClock.startedAt) / 1000).toFixed(1)}s`);
};
const addAiWait = (step, ms) => { stepClock.aiByStep[step] = (stepClock.aiByStep[step] ?? 0) + ms; };

// ── Usar la lección corta (la misma página ya está abierta) ──
// Encontrar lección corta
const lessons = await page.evaluate(async () => {
	const subs = await fetch('https://www.udemy.com/api-2.0/users/me/subscribed-courses/?fields[course]=id,title&page_size=100', { credentials: 'include' }).then((r) => r.json());
	const course = (subs.results || []).find((c) => (c.title || '').includes('Java In-Depth'));
	if (!course) return [];
	const items = [];
	let url = `https://www.udemy.com/api-2.0/courses/${course.id}/subscriber-curriculum-items/?course_id=${course.id}&fields[lecture]=title,asset&fields[asset]=length&page_size=200`;
	while (url) {
		const pg = await fetch(url, { credentials: 'include' }).then((r) => r.json());
		items.push(...(pg.results || []));
		url = pg.next;
	}
	return items.filter((it) => it._class === 'lecture').map((it) => ({ id: it.id, title: it.title, seconds: it.asset?.length || 0 })).filter((it) => it.seconds > 0);
});
const sorted = [...lessons].sort((a, b) => a.seconds - b.seconds);
// Matriz de timing: la más corta real (~3 min, sin ejercicios de segundos) y
// la más cercana a 15 min.
const QA_LESSON = process.env.QA_LESSON === 'long' ? 'long' : 'short';
const QA_FLOW = process.env.QA_FLOW === 'full' ? 'full' : 'min';
const short = sorted.find((l) => l.seconds >= 120) ?? sorted[0] ?? { id: 42163342, title: '(fallback)', seconds: 0 };
// Candidatas largas ordenadas por cercanía a 15 min: no todas tienen CC, así
// que se prueban hasta 3 hasta que una suelte transcripción.
const longCands = sorted.filter((l) => l.seconds >= 600 && l.seconds <= 1200)
	.sort((a, b) => Math.abs(a.seconds - 900) - Math.abs(b.seconds - 900))
	.slice(0, 3);
// QA_LESSON_ID fija una lección concreta por su ID de Udemy (las dos de 15 min
// de la sesión humana deben ser distintas).
const lessonById = process.env.QA_LESSON_ID
	? (lessons.find((l) => String(l.id) === String(process.env.QA_LESSON_ID)) ?? null)
	: null;
// QA_LESSON_SLOT=a|b: 1ª o 2ª candidata de 15 min. Los dos flujos de la sesión
// humana tienen que ir en lecciones distintas (repetir la misma acelera la
// segunda pasada porque ya se conocen las respuestas).
const slotIndex = process.env.QA_LESSON_SLOT === 'c' ? 2 : process.env.QA_LESSON_SLOT === 'b' ? 1 : 0;
const slotLesson = longCands[slotIndex] ?? longCands[0] ?? short;
const lesson = lessonById ?? (QA_LESSON === 'long' ? slotLesson : short);
if (lessonById) console.log(`  lección fijada por QA_LESSON_ID: ${lessonById.seconds}s «${lessonById.title}»`);
console.log(`  lección (${QA_LESSON}, ${lesson.seconds}s): «${lesson.title}» (id ${lesson.id})`);

// Navegar a la lección + configurar el modelo una vez; para long se prueban
// hasta 3 candidatas hasta que una suelte transcripción.
// Empezar por la leccion del slot: si no, el bucle volveria a la primera
// candidata e ignoraria QA_LESSON_SLOT.
const candidates = QA_LESSON === 'long'
	? [...longCands.slice(slotIndex), ...longCands.slice(0, slotIndex)]
	: [lesson];
let currentLesson = lesson;
let trReady = false;
for (let ci = 0; ci < candidates.length && !trReady; ci++) {
	const cand = candidates[ci];
	currentLesson = cand;
	console.log(`  navegando a (${cand.seconds}s) «${cand.title}» (id ${cand.id})`);
	await gotoWithRetry(`https://www.udemy.com/course/${SLUG}/learn/lecture/${cand.id}`);
	await page.waitForSelector(OUTER, { timeout: 45000 });
	await page.waitForTimeout(2500);
	await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
	await page.locator(`${OUTER} button:has-text("Study")`).first().evaluate((el) => el.click()).catch(() => {});
	await page.waitForTimeout(2000);

	if (ci === 0) {
		// Ajustes → Proveedor → cambiar modelo → guardar → cerrar
		await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'provider' } })));
		await page.waitForTimeout(2000);
		const modelChanged = await page.evaluate(() => {
			const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
			const inp = [...root.querySelectorAll('input[type="text"]')].find((el) => /muse|deepseek/i.test(el.value || ''));
			if (!inp) return false;
			const proto = Object.getOwnPropertyDescriptor(root.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set;
			proto.call(inp, 'deepseek-v4.1-flash:free');
			inp.dispatchEvent(new Event('input', { bubbles: true }));
			return true;
		});
		if (modelChanged) {
			await page.waitForTimeout(300);
			await click(/Probar conexión y guardar/);
			const dSave = Date.now() + 30000;
			while (Date.now() < dSave) {
				const t = await shadow();
				if (!/Verificando conexión/.test(t)) break;
				await page.waitForTimeout(1000);
			}
			console.log('  modelo → deepseek-v4.1-flash:free ✓');
		} else {
			console.log('  (modelo no encontrado en el panel)');
		}
		await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
		await page.waitForTimeout(800);
	}

	// Fresh session
	const st = await shadow();
	if (/Reiniciar/.test(st) && /Ponte a prueba|Fíjalo|Llévalo/.test(st)) {
		await click(/Reiniciar/);
		await page.waitForTimeout(400);
		await click(/Sí, reiniciar/);
		await page.waitForTimeout(1500);
	}

	// QA_KEEP_HISTORY=1 conserva el historial del curso (para probar la
	// pre-generación con el objetivo recordado).
	// Medición en frío: limpiar historial (y caché salvo QA_KEEP_CACHE=1, que
	// conserva la caché de objetivos del curso) para que la generación no
	// reaparezca restaurada. QA_KEEP_HISTORY=1 conserva también el historial.
	{
		const dropCache = process.env.QA_KEEP_CACHE !== '1';
		const dropHistory = process.env.QA_KEEP_HISTORY !== '1';
		const swNow = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
		if (swNow) {
			await swNow.evaluate(({ dropCacheFlag, dropHistoryFlag }) => new Promise((res) => {
				chrome.storage.local.get(null, (all) => {
					const keys = Object.keys(all || {}).filter((k) =>
						(dropCacheFlag && k.startsWith('usb_cache_')) || (dropHistoryFlag && k.startsWith('usb_history_')));
					if (!keys.length) { res(0); return; }
					chrome.storage.local.remove(keys, () => res(keys.length));
				});
			}), { dropCacheFlag: dropCache, dropHistoryFlag: dropHistory }).then((n) => console.log(`  limpieza: ${n} claves (cache=${dropCache ? 'no' : 'sí'} historia=${dropHistory ? 'no' : 'sí'})`)).catch(() => {});
		}
		await page.evaluate(({ dropCacheFlag, dropHistoryFlag }) => {
			Object.keys(localStorage)
				.filter((k) => (dropCacheFlag && k.startsWith('usb_cache_')) || (dropHistoryFlag && k.startsWith('usb_history_')))
				.forEach((k) => localStorage.removeItem(k));
		}, { dropCacheFlag: dropCache, dropHistoryFlag: dropHistory });
	}

	// QA_PICK_CARD: recargar para que el dock monte SIN objetivo persistido (con
	// una selección previa el hero queda colapsado y los cards no existen).
	if (process.env.QA_PICK_CARD === '1') {
		await page.reload();
		await page.waitForSelector(OUTER, { timeout: 45000 });
		await page.waitForTimeout(2500);
		await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
		await page.locator(`${OUTER} button:has-text("Study")`).first().evaluate((el) => el.click()).catch(() => {});
		await page.waitForTimeout(1500);
	}

	// Reproducir el vídeo (cues)
	await page.evaluate(() => { document.querySelector('video')?.play().catch(() => {}); });
	await page.waitForTimeout(20000);
	await page.evaluate(() => { document.querySelector('video')?.pause(); });
	console.log('  vídeo reproducido 20s');
// QA_PACE=human: como una persona que ve el tramo final, el vídeo se adelanta
// a los ultimos ~3 min — solo asi entra en la ventana de pre-generacion en una
// leccion de 15 min (en una corta el tramo de 20 s ya basta).
// QA_SEEK_PLAY_SECS: segundos de video continuo cerca del final. Con 200 s la
// pre-generacion arranca ~180 s antes de Empezar: la ventaja de verdad.
const seekPlaySecs = Number(process.env.QA_SEEK_PLAY_SECS ?? 0);
if (HUMAN_PACE || seekPlaySecs > 0) {
	const playSecs = seekPlaySecs > 0 ? seekPlaySecs : 35;
	await page.evaluate((secs) => {
		const v = document.querySelector('video');
		if (v && Number.isFinite(v.duration) && v.duration > 260) {
			v.currentTime = Math.max(0, v.duration - (secs + 20));
			v.play().catch(() => {});
		} else if (v) { v.play().catch(() => {}); }
	}, playSecs);
	await page.waitForTimeout(playSecs * 1000);
	await page.evaluate(() => { document.querySelector('video')?.pause(); });
	const clock = await page.evaluate(() => {
		const v = document.querySelector('video');
		return v && Number.isFinite(v.duration) ? { ts: v.currentTime, duration: v.duration } : null;
	});
	if (clock) {
		const windowOpen = Math.max(0, clock.duration - 180);
		const advantage = Math.max(0, clock.ts - windowOpen);
		process.env.__PREGEN_ADVANTAGE_S = String(Math.round(advantage));
		console.log(`  video: ventana de pre-generacion abierta hace ~${Math.round(advantage)}s (ts ${Math.round(clock.ts)}s de ${Math.round(clock.duration)}s)`);
	}
}

	// Esperar transcripción lista (con reintentos ante 0 cues)
	trReady = await waitForTranscript(3);
}
if (!trReady && process.env.QA_MULTI_LESSON !== '1') {
	console.log('✗ ninguna candidata tiene transcripción');
	process.exit(1);
}

// ── QA_MULTI_LESSON=1: cambio de lección ────────────────────────────────────
// Cubre los tres casos de la contrarrevisión con un par de lecciones del MISMO
// nombre (distinta sección):
//   a) A pre-generada sin estudiar → B pre-genera y consume SU mazo.
//   b) Mismo nombre → ninguna consume el mazo de la otra (la clave lleva el ID).
//   c) Empezar en B mientras A sigue generando → no espera a A.
if (process.env.QA_MULTI_LESSON === '1') {
	// Descartar los mazos previos para que la prueba no herede nada.
	const swClean = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	if (swClean) {
		await swClean.evaluate(() => new Promise((res) => {
			chrome.storage.local.get(null, (all) => {
				const keys = Object.keys(all || {}).filter((k) => k.startsWith('usb_cache_'));
				chrome.storage.local.remove(keys, () => res(keys.length));
			});
		})).then((n) => console.log(`  mazos previos borrados: ${n}`)).catch(() => {});
	}
	// Par con el mismo título, distinta sección (IDs distintos).
	const byTitle = new Map();
	for (const l of lessons) {
		if (l.seconds < 60) continue;
		const key = l.title.replace(/^\d+\.\s*/, '').trim();
		byTitle.set(key, [...(byTitle.get(key) ?? []), l]);
	}
	// El par con el mismo nombre MÁS CORTO: la ventana de disparo es de 3 min,
	// así que lecciones largas no pre-generan (comportamiento correcto, pero no
	// permite probar la separación de mazos con el nombre repetido).
	const groups = [...byTitle.values()].filter((g) => g.length >= 2);
	groups.sort((a, b) => Math.max(...a.map((l) => l.seconds)) - Math.max(...b.map((l) => l.seconds)));
	const pair = groups[0];
	if (!pair) {
		console.log('✗ no hay dos lecciones con el mismo nombre en el curso');
		process.exit(1);
	}
	const [lessonA, lessonB] = pair;
	console.log(`  par mismo nombre: «${lessonA.title}» (${lessonA.id}, ${lessonA.seconds}s) y «${lessonB.title}» (${lessonB.id}, ${lessonB.seconds}s)`);
	if (Math.max(lessonA.seconds, lessonB.seconds) > 180) {
		console.log('  (aviso: duran más de 3 min; sin ventana de disparo la pre-generación no aplica)');
	}

	const playAndTrigger = async (label) => {
		await page.evaluate(() => { document.querySelector('video')?.play().catch(() => {}); });
		await page.waitForTimeout(25000);
		await page.evaluate(() => { document.querySelector('video')?.pause(); });
		const dTr2 = Date.now() + 60000;
		let ready = false;
		while (Date.now() < dTr2) {
			const txt = await shadow();
			if (/Subtítulos listos/.test(txt)) { ready = true; break; }
			if (/Sin subtítulos/.test(txt)) break;
			await page.waitForTimeout(1000);
		}
		console.log(`  ${label}: transcripción ${ready ? 'lista ✓' : 'NO'}`);
		return ready;
	};

	const gotoLesson = async (lessonId) => {
		await gotoWithRetry(`https://www.udemy.com/course/${SLUG}/learn/lecture/${lessonId}`);
		await page.waitForSelector(OUTER, { timeout: 45000 });
		await page.waitForTimeout(2500);
		await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
		await page.locator(`${OUTER} button:has-text("Study")`).first().evaluate((el) => el.click()).catch(() => {});
		await page.waitForTimeout(2000);
	};

	// Re-sembrar: la limpieza del bucle inicial borró el registro.
	await seedCourseObjectiveRecord('multi');

	// A: pre-genera durante el vídeo y NO se estudia.
	await gotoLesson(lessonA.id);
	if (!await playAndTrigger('A')) { console.log('✗ A sin transcripción'); process.exit(1); }
	if (process.env.QA_MULTI_WAIT_A === '1') {
		// Esperar a que A termine su pre-generación: su mazo queda EN CACHÉ con
		// el ID de A, y B no debe consumirlo nunca (la prueba fuerte del reparto).
		const dA = Date.now() + 240000;
		while (Date.now() < dA) {
			const txt = await shadow();
			if (/mazo pre-generado/.test(pageConsoleBuf.join(' '))) { break; }
			await page.waitForTimeout(2000);
		}
		console.log('  A: pre-generación terminada (mazo de A en caché)');
	} else {
		await page.waitForTimeout(4000); // deja arrancar la pre-generación de A
	}

	// B (mismo nombre, otro ID): debe pre-generar la suya, sin heredar nada de A.
	const tB0 = Date.now();
	await gotoLesson(lessonB.id);
	if (!await playAndTrigger('B')) { console.log('✗ B sin transcripción'); process.exit(1); }

	// Empezar en B: debe consumir el mazo de B (o esperar SOLO el suyo), nunca el de A.
	const objectiveReady = await waitFor(/O escribe tu propio objetivo/, 15000);
	if (process.env.QA_NO_OBJECTIVE !== '1') {
		await click(/O escribe tu propio objetivo/).catch?.(() => {});
		await page.waitForTimeout(500);
		await fillUntil('Conseguir trabajo en fintech', 'Dominar el tema de esta lección.', 10000);
	}
	let tCta = 0;
	for (let i = 0; i < 60; i++) {
		if (await click(/Empezar · ~4–10 min|Generar sesión de aprendizaje/)) { tCta = Date.now(); break; }
		await page.waitForTimeout(1000);
	}
	if (!tCta) { console.log('✗ CTA de B deshabilitado', objectiveReady.slice(-120)); process.exit(1); }
	const resultB = await waitFor(/¿Qué tan claro te quedó la lección\??/, 400000);
	const genMs = Date.now() - tCta;
	const consumed = pageConsoleBuf.some((l) => /mazo pre-generado consumido/.test(l));
	const discarded = pageConsoleBuf.some((l) => /pre-generación descartada/.test(l));
	console.log('\n── RESULTADO (cambio de lección) ──');
	console.log(`  B con el mismo nombre generó en ${Math.round(genMs / 1000)}s`);
	console.log(`  consumió mazo pre-generado: ${consumed ? '✓' : '✗'}`);
	console.log(`  descartó la pre-generación de A al cambiar: ${discarded ? '✓' : '✗'}`);
	console.log(`  resultado visible en B: ${/¿Qué tan claro/.test(resultB) ? '✓' : '✗'}`);
	// Separación de claves: la caché debe llevar el ID REAL de cada lección.
	const swKeys = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	const preKeys = swKeys
		? await swKeys.evaluate(() => new Promise((res) => {
			chrome.storage.local.get(null, (all) => res(Object.keys(all || {}).filter((k) => k.includes('study_pre_'))));
		})).catch(() => [])
		: [];
	console.log(`  claves study_pre_ en caché: ${preKeys.length ? preKeys.map((k) => k.replace('usb_cache_', '')).join(' | ') : '(ninguna)'}`);
	const keyHasB = preKeys.some((k) => k.includes(String(lessonB.id)));
	const keyHasA = preKeys.some((k) => k.includes(String(lessonA.id)));
	console.log(`  la clave de B lleva su ID (${lessonB.id}): ${keyHasB ? '✓' : '(consumida)'} / la de A (${lessonA.id}): ${keyHasA ? 'sí' : 'no'}`);
	// Si el mazo de A quedó en caché, la prueba es concluyente: B consumió el
	// suyo pese a existir el de A (mismo nombre de lección, distinto ID).
	const okMulti = /¿Qué tan claro/.test(resultB) && consumed && genMs <= 120000;
	clearTimeout(watchdog);
	await context.close();
	process.exit(okMulti ? 0 : 1);
}

// ── QA_HUMAN_OBSERVE=1: sesión humana, el script NO responde nada ───────────
// Prepara todo (sesión, lección, caché limpia, proveedor), adelanta el vídeo a
// ~3:30 del final y lo deja reproduciéndose para que la pre-generación se
// dispare sola. A partir de ahí solo OBSERVA: no hace clic ni escribe. Marca
// pasos y esperas de IA hasta «Lección terminada» (margen amplio).
if (process.env.QA_HUMAN_OBSERVE === '1') {
	const seeked = await page.evaluate(() => {
		const v = document.querySelector('video');
		if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return null;
		v.currentTime = Math.max(0, v.duration - 210);
		v.play().catch(() => {});
		return { duration: v.duration, from: v.currentTime };
	});
	if (!seeked) { console.log('✗ no se pudo adelantar el vídeo'); process.exit(1); }
	console.log(`  vídeo adelantado a ${Math.round(seeked.from)}s de ${Math.round(seeked.duration)}s; el resto lo hace una persona`);
	console.log('  observando (sin intervenir)…');

	// Medición en un módulo aparte (scripts/observer-timeline.mjs), validado con
	// reloj virtual en scripts/qa-observer-timeline.mjs: cada fila mide desde su
	// marca hasta la siguiente y las esperas de IA se acumulan por muestreo.
	const timeline = createObserverTimeline();
	const t0obs = Date.now();
	let started = false;
	let genAt = 0;
	let firstResultAt = 0;
	let genCounted = false;
	let done = false;
	const maxMs = Number(process.env.QA_OBSERVE_MAX ?? 1800) * 1000;
	const seen = new Set();
	// Indicador de carga de EVALUACIÓN. Ojo: la pantalla de generación pinta
	// «Analizando la transcripción...», que NO es una evaluación — si se cuela,
	// el cronómetro de IA arranca durante la generación y lo suma todo.
	while (Date.now() - t0obs < maxMs) {
		const txt = await shadow();
		const now = Date.now();
		const has = (re) => re.test(txt);
		if (!started && has(/Preparando tu sesión/)) {
			started = true;
			genAt = now;
			timeline.enter('Recordar', now); // el origen es Empezar
			console.log(`  Empezar detectado @ ${Math.round((now - t0obs) / 1000)}s`);
		}
		if (started) {
			if (!genCounted && has(/¿Qué tan claro te quedó la lección\??/)) {
				genCounted = true;
				firstResultAt = now;
				timeline.addAi(now - genAt, now); // la generación es espera de IA de Recordar
				console.log(`  resultado listo: la persona esperó ${Math.round((now - genAt) / 1000)}s tras Empezar`);
			}
			if (has(/Ponte a prueba/) && !seen.has('Comprobar')) { seen.add('Comprobar'); timeline.enter('Comprobar', now); console.log(`  paso Comprobar @ ${Math.round((now - t0obs) / 1000)}s`); }
			if (has(/Llévalo a la práctica/) && !seen.has('Aplicar')) { seen.add('Aplicar'); timeline.enter('Aplicar', now); console.log(`  paso Aplicar @ ${Math.round((now - t0obs) / 1000)}s`); }
			if (has(/Terminar lección|Fíjalo en memoria/) && !seen.has('Fijar')) { seen.add('Fijar'); timeline.enter('Fijar', now); console.log(`  paso Fijar @ ${Math.round((now - t0obs) / 1000)}s`); }
			timeline.evalLoading(EVAL_LOADING.test(txt), now);
		}
		if (started && has(/Lección terminada/)) { timeline.finish(now); done = true; break; }
		await page.waitForTimeout(1200);
	}
	if (started && !done) timeline.finish(Date.now());
	const consumedPre = pageConsoleBuf.some((l) => /mazo pre-generado consumido/.test(l));
	const swObs = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	const stats = swObs ? await swObs.evaluate(() => new Promise((res) => {
		chrome.storage.local.get(['usg_study_generation_stats'], (r) => res(r?.usg_study_generation_stats ?? null));
	})).catch(() => null) : null;
	const { rows, total } = timeline.summary();
	console.log('\n── TIEMPO POR PASO (persona real, observado) ──');
	for (const r of rows) {
		console.log(`  ${r.name.padEnd(10)} total ${String(Math.round(r.total / 1000)).padStart(4)}s   espera IA ${String(Math.round(r.ai / 1000)).padStart(4)}s   humano ${String(Math.round(r.human / 1000)).padStart(4)}s`);
	}
	console.log(`  ${'TOTAL'.padEnd(10)} ${Math.round(total / 1000)}s desde Empezar (el vídeo previo no cuenta)`);
	console.log(firstResultAt
		? `  espera tras pulsar Empezar: ${Math.round((firstResultAt - genAt) / 1000)}s`
		: '  espera tras pulsar Empezar: n/d (no se pulsó Empezar)');
	// Momento en que la consola registró «pre-generación lista», relativo a Empezar.
	const readyEvent = preGenEvents.find((e) => /pre-generaci[oó]n lista/.test(e.text));
	if (started && readyEvent) {
		const rel = Math.round((readyEvent.at - genAt) / 1000);
		console.log(`  pre-generación lista: ${rel >= 0 ? rel + 's después de Empezar' : Math.abs(rel) + 's ANTES de Empezar'}`);
	} else if (started) {
		console.log('  pre-generación lista: no se registró (el mazo salió de la ruta normal)');
	}
	console.log(`  terminó la lección: ${done ? 'sí' : 'no (margen agotado)'} · mazo pre-generado consumido: ${consumedPre ? 'sí' : 'no'} · escalones: ${JSON.stringify(stats)}`);
	clearTimeout(watchdog);
	await context.close();
	process.exit(done ? 0 : 1);
}

// QA_PICK_CARD=1: pulsa el primer objetivo del curso (así el objetivo del CTA
// coincide con el que usa la pre-generación, como en la 2ª lección de un curso).
if (process.env.QA_PICK_CARD === '1') {
	const picked = await page.evaluate(() => {
		const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		const card = root?.querySelector('button.kx-obj');
		if (!card) return false;
		card.click();
		return true;
	});
	console.log(picked ? '  objetivo: primer card del curso pulsado' : '  (no se encontró un card de objetivo)');
	await page.waitForTimeout(800);
}

// Objetivo propio (QA_NO_OBJECTIVE=1 usa el objetivo activo por defecto, que es
// el que emplea la pre-generación)
if (process.env.QA_NO_OBJECTIVE !== '1' && process.env.QA_PICK_CARD !== '1') {
	await waitFor(/O escribe tu propio objetivo/, 15000);
	await click(/O escribe tu propio objetivo/).catch?.(() => {});
	await page.waitForTimeout(500);
	await fill('Conseguir trabajo en fintech', 'Dominar el tema de esta lección.');
}

// CTA
let t0 = 0;
for (let i = 0; i < 90; i++) {
	if (await click(/Empezar · ~4–10 min|Generar sesión de aprendizaje/)) { t0 = Date.now(); break; }
	await page.waitForTimeout(1000);
}
if (!t0) {
	// Diagnostico: el CTA depende de objetivo + contexto + transcripcion + IA
	// disponible. Decir solo 'deshabilitado' obliga a adivinar.
	const dock = await shadow();
	const aviso = dock.match(/(Elige o escribe un objetivo|Sin proveedor de IA|Comprobando la IA|El proveedor no responde|Sin transcripci|Escribe el nombre del curso)[^]{0,90}/);
	const swNow = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	const health = swNow ? await swNow.evaluate(() => new Promise((res) => {
		chrome.storage.local.get(['usg_provider_health_debug'], (r) => res(r?.usg_provider_health_debug ?? null));
	})).catch(() => null) : null;
	console.log('✗ CTA deshabilitado');
	console.log('  motivo visible:', aviso ? aviso[1] : '(sin aviso: el bloqueo no se explica en la UI)');
	console.log('  salud de IA:', JSON.stringify(health));
	process.exit(1);
}
stepClock.startedAt = t0;
markStep('Recordar'); // Empezar: la generacion es espera de IA de Recordar
console.log('  generación iniciada…');

// Resultado
const txt = await waitFor(/¿Qué tan claro te quedó la lección\??/, 600000);
if (!/¿Qué tan claro/.test(txt)) {
	await page.screenshot({ path: path.join(SHOTS, 'gen-fail.png') });
	console.log('✗ generación sin resultado');
	console.log('  dock:', (await shadow()).slice(-400));
	console.log('  consola reciente:');
	for (const l of pageConsoleBuf.slice(-30)) console.log('   ', l);
	process.exit(1);
}
const tGen = Date.now() - t0;
addAiWait('Recordar', tGen); // la generacion es espera de IA del primer paso
console.log(`  generación: ${Math.round(tGen / 1000)}s`);

// Nivel
await dwellRead(20); // lee la pregunta de nivel
await click(/^Más o menos/);
await page.waitForTimeout(600);

// Conceptos
await click(/Ver las ideas clave|Comparar con las ideas clave/);
await page.waitForTimeout(600);

// Pregunta (paso Comprobar)
await dwellRead(45); // revisa los conceptos
markStep('Comprobar');
await click(/Ponerme a prueba/);
await page.waitForTimeout(1600);

// Responder (la tarjeta de pregunta monta con animación: esperar el textarea)
await dwellRead(35); // lee la pregunta y piensa
if (!await typePaced('Escribe tu respuesta con tus propias palabras', 'javac produce bytecode y la JVM lo interpreta en cualquier plataforma.')) {
	await page.screenshot({ path: path.join(SHOTS, 'comprobar-fail.png') });
	console.log('✗ textarea de pregunta no apareció');
	// Diagnostico: se quedo en Recordar (no avanzo) o el paso Comprobar esta
	// vacio (sin preguntas)? El dock y el registro persistido lo dicen.
	const dumpTxt = await shadow();
	console.log('  dock:', dumpTxt.replace(/\s+/g, ' ').slice(-260));
	const swNow2 = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	const rec = swNow2 ? await swNow2.evaluate((lid) => new Promise((res) => {
		chrome.storage.local.get(null, (all) => {
			const k = Object.keys(all || {}).find((x) => x.startsWith('usb_history_lecture::') && x.endsWith('::' + lid));
			const r = k ? all[k] : null;
			const sc = r?.studyContent;
			res({ key: k || null, concepts: sc?.keyConcepts?.length ?? null, questions: sc?.questions?.length ?? null, confidence: r?.confidence ?? null });
		});
	}), String(currentLesson.id)).catch(() => null) : null;
	console.log('  registro:', JSON.stringify(rec));
	console.log('  consola reciente:');
	for (const l of pageConsoleBuf.slice(-25)) console.log('   ', l);
	process.exit(1);
}
if (process.env.QA_COLD_SW === '1') {
	// El SW se suspende tras ~30 s de inactividad: esperar antes de evaluar
	// reproduce el despertar real (persona pensando la respuesta) y valida que
	// el allowlist espere a que la config esté cargada.
	console.log('  esperando 35s para que el service worker se suspenda...');
	await page.waitForTimeout(35000);
}
let tEvalWait = Date.now();
pageConsoleBuf.push('=== click Revisar mi respuesta Q1 ===');
await clickUntil(/^Revisar mi respuesta$/, 10000);

// Esperar veredictos reales (marcadores [CORRECTO]/[PARCIAL]/[INCORRECTO] del
// feedback) y avanzar pregunta a pregunta. El paginador del dock dice
// "Siguiente" siempre, así que el texto del dock no sirve de señal: se cuenta.
// El prototipo ya no pinta [CORRECTO]/FALTO: en crudo: el veredicto llega como
// rótulos + caja de opciones. La caja y el repaso de cierre son las señales.
const nextMovesReady = () => page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	return Boolean(root?.querySelector('[data-next-moves]')) || Boolean(root?.querySelector('[data-verify-review]'));
});
const clickLast = (m) => page.evaluate((mm) => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const b = [...root.querySelectorAll('button')].filter((x) => mm.test((x.textContent ?? '').trim()) && !x.disabled).pop();
	if (!b) return false;
	b.click();
	return true;
}, m);
let ok = false;
for (let i = 0; i < 12 && !ok; i++) {
	pageConsoleBuf.push(`=== esperando fin de evaluación ${i + 1} ===`);
	// Señal de evaluación terminada: "Continuar a Aplicar" (cola completa) o el
	// veredicto en el feedback. FALTO: aparece ya en streaming, así que se
	// espera a que el texto deje de crecer (2 lecturas estables) antes de
	// pulsar nada: con el streaming vivo ni Siguiente ni Continuar existen y
	// clickLast caería en el paginador de pasos. Los modelos reasoning pueden
	// tardar minutos por eval.
	const dEval = Date.now() + 240000;
	let outcome = '';
	while (Date.now() < dEval && !outcome) {
		const now = await shadow();
		if (/Continuar a Aplicar/.test(now)) { outcome = 'continuar'; break; }
		if (/FALTO:|FALTÓ:/.test(now) || await nextMovesReady()) {
			addAiWait('Comprobar', Date.now() - tEvalWait);
			let stable = 0;
			let last = now;
			while (Date.now() < dEval && stable < 2) {
				await page.waitForTimeout(1200);
				const now2 = await shadow();
				if (/Continuar a Aplicar/.test(now2)) { outcome = 'continuar'; break; }
				if (now2 === last) stable += 1; else { stable = 0; last = now2; }
			}
			if (!outcome) outcome = 'next';
			break;
		}
		await page.waitForTimeout(900);
	}
	if (!outcome) break; // sin señal
	pageConsoleBuf.push(`=== eval ${i + 1} fin (${outcome}) ===`);
	if (outcome === 'continuar') {
		if (await click(/Continuar a Aplicar/)) { ok = true; break; }
		break;
	}
	// §1.7: «Siguiente» del dock cierra la comprobación con una respuesta
	// revisada y pasa a Aplicar; el plan puede ofrecer antes la pregunta de
	// consolidación («Siguiente pregunta (2 de N)»), que se responde igual.
	if (await click(/^Siguiente pregunta/)) {
		await page.waitForTimeout(1200);
		tEvalWait = Date.now();
		pageConsoleBuf.push(`=== click Revisar mi respuesta Q${i + 2} ===`);
		await dwellRead(90); // lee el feedback de la IA
		if (!await typePaced('Escribe tu respuesta con tus propias palabras', 'Consolidación: javac produce bytecode y la JVM lo interpreta.')) break;
		await clickUntil(/^Revisar mi respuesta$/, 10000);
		continue;
	}
	if (await click(/^Terminar y ver la respuesta esperada$|^Terminar aquí$/)) {
		await page.waitForTimeout(1200);
		if (/Continuar a Aplicar/.test(await shadow())) { ok = true; break; }
		continue;
	}
	if (!await clickLast(/^Siguiente$/)) break;
	await page.waitForTimeout(1500);
	// ¿Se avanzó a Aplicar? Es el cierre real de la comprobación.
	if (/Continuar a Fijar|Saltar este paso|Ver la solución/.test(await shadow())) { ok = true; break; }
}
if (!ok) {
	await page.screenshot({ path: path.join(SHOTS, 'comprobar-fail.png') });
	console.log('✗ Comprobar incompleto');
	console.log('  dock:', (await shadow()).slice(-500));
	console.log('  consola completa:');
	for (const l of pageConsoleBuf) console.log('   ', l);
	process.exit(1);
}

// Duración real del paso Comprobar: descontar la generación (tGen es una
// duración; antes se imprimía la marca acumulada desde el CTA y se leía como
// si Comprobar tardase 2-3 min).
const tComprobar = Date.now() - (t0 + tGen);

// ── Cronometraje por paso (QA_HUMAN_TIMING=1) ───────────────────────────────
// Para una sesión con una persona real: mide cada paso (Recordar → Comprobar →
// Aplicar → Fijar) y, separado, lo que se esperó a la IA — lo que hay que

// ── Aplicar según el flujo ──
markStep('Aplicar');
let tAplicar = 0;
if (QA_FLOW === 'full') {
	// COMPLETO: resolver el desafío y pasarlo por la revisión de la IA.
	const tA = Date.now();
	await dwellRead(45); // lee el desafio
	// Cerrar Comprobar deja el paso Aplicar montando con animación; si el click
	// de «Continuar a Aplicar» se adelantó, se reintenta (antes se fallaba con
	// «textarea del desafío no apareció» estando todavía en Comprobar).
	const practiceReady = () => page.evaluate(() => {
		const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		if (!root) return false;
		if (root.querySelector('[data-practice-modes]')) return true;
		return [...root.querySelectorAll('textarea')].some((t) => /Escribe tu (soluci|respuesta)|Escribe tu explicaci/.test(t.placeholder ?? ''));
	});
	for (let i = 0; i < 8 && !(await practiceReady()); i += 1) {
		if (await click(/Continuar a Aplicar/)) console.log('  (reintento: «Continuar a Aplicar»)');
		await page.waitForTimeout(1500);
	}
	const filled = await fillUntil('// Escribe tu solución aquí…', 'javac App.java && java App', 8000)
		|| await fillUntil('Escribe tu respuesta aquí…', 'Compila con javac y ejecuta el .class en otro SO con la JVM.', 8000);
	if (!filled) {
		await page.screenshot({ path: path.join(SHOTS, 'aplicar-fail.png') });
		console.log('✗ textarea del desafío no apareció');
		const dbg = await page.evaluate(() => {
			const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
			return {
				placeholders: [...(root?.querySelectorAll('textarea, input') ?? [])].map((e) => e.placeholder).filter(Boolean),
				botones: [...(root?.querySelectorAll('button') ?? [])].map((b) => (b.textContent ?? '').trim().slice(0, 22)).filter(Boolean).slice(0, 14),
				cola: (root?.textContent ?? '').replace(/\s+/g, ' ').slice(-200),
			};
		});
		console.log('  diagnóstico Aplicar:', JSON.stringify(dbg));
		process.exit(1);
	}
	if (!await clickUntil(/Revisar mi respuesta/, 15000)) {
		await page.screenshot({ path: path.join(SHOTS, 'aplicar-fail.png') });
		console.log('✗ botón Revisar mi respuesta no apareció');
		process.exit(1);
	}
	// Muestreo del indicador de carga de evaluacion (igual que el observador):
	// un veredicto anterior en pantalla no debe cerrar la medicion.
	const tReview = Date.now();
	let reviewSeen = false;
	const dReview = Date.now() + 240000;
	while (Date.now() < dReview && !reviewSeen) {
		const txt = await shadow();
		if (EVAL_LOADING.test(txt)) {
			const tOn = Date.now();
			while (Date.now() - tOn < 240000 && EVAL_LOADING.test(await shadow())) { await page.waitForTimeout(600); }
			await page.waitForTimeout(400);
			continue;
		}
		if (/\[CORRECTO\]|\[PARCIAL\]|\[INCORRECTO\]|MEJORAR:|SIGUIENTE NIVEL/.test(txt)) reviewSeen = true;
		await page.waitForTimeout(700);
	}
	addAiWait('Aplicar', Date.now() - tReview);
	if (!reviewSeen) {
		await page.screenshot({ path: path.join(SHOTS, 'aplicar-fail.png') });
		console.log('✗ revisión de Aplicar sin veredicto');
		console.log('  consola reciente:');
		for (const l of pageConsoleBuf.slice(-20)) console.log('   ', l);
		process.exit(1);
	}
	await clickUntil(/Fíjalo en memoria|Continuar a Fijar/, 15000);
	// Fijar: revisar las tarjetas y EXPORTAR el .apkg. El mazo es la prioridad
	// del producto, asi que el flujo completo lo incluye (antes se pulsaba
	// 'Terminar leccion' sin exportar nada).
	await dwellRead(40); // revisa las tarjetas
	const [apkg] = await Promise.all([
		page.waitForEvent('download', { timeout: 90000 }).catch(() => null),
		clickUntil(/Exportar \.apkg/, 25000),
	]);
	if (apkg) console.log(`  .apkg exportado: ${apkg.suggestedFilename()}`);
	else console.log('  (aviso: no se detecto la descarga del .apkg)');
	await dwellRead(15); // lee el aviso de importacion si aparece
	// Export real a Obsidian (solo con QA_OBSIDIAN_VAULT): la URI se le entrega
	// al sistema después, fuera del navegador, para comprobar la nota en el vault.
	if (obsidianVault) {
		if (await clickUntil(/^Exportar$/, 25000)) {
			await page.waitForTimeout(2500);
			console.log(`  URIs obsidian:// capturadas: ${obsidianUris.length}`);
		} else {
			console.log('  ✗ no apareció el botón «Exportar» de Obsidian en Fijar');
		}
	}
		// La celebración de racha se reclama UNA vez al día (`kinema-streak-shown`
		// en el localStorage de la página): se libera para poder observarla en
		// una corrida de QA. Es estado del perfil de prueba, no del usuario.
		await page.evaluate(() => { try { localStorage.removeItem('kinema-streak-shown'); } catch {} });
	await clickUntil(/Terminar lección/, 20000);
	tAplicar = Date.now() - tA;
} else {
	// MÍNIMO: práctica pendiente («Saltar este paso»).
	await clickUntil(/^Saltar este paso$/, 15000);
		// La celebración de racha se reclama UNA vez al día (`kinema-streak-shown`
		// en el localStorage de la página): se libera para poder observarla en
		// una corrida de QA. Es estado del perfil de prueba, no del usuario.
		await page.evaluate(() => { try { localStorage.removeItem('kinema-streak-shown'); } catch {} });
	await clickUntil(/Terminar lección/, 15000);
}
markStep('Fijar');
const done = await waitFor(/Lección terminada/, 20000);
const ms = Date.now() - t0;
await page.screenshot({ path: path.join(SHOTS, `resultado-${QA_LESSON}-${QA_FLOW}.png`) });

// La celebración del cierre, en la página REAL: debe salir dentro de la pila de
// avisos del panel (abajo), no en una capa propia sobre el vídeo.
await page.waitForTimeout(1200);
const celebration = await page.evaluate((outer) => {
	const root = document.querySelector(outer)?.shadowRoot;
	const el = root?.querySelector('[data-sonner-toast] .kx-celebrate');
	const dock = root?.querySelector('.usb-dock');
	if (!el || !dock) return { found: Boolean(el), dock: Boolean(dock) };
	const c = el.getBoundingClientRect();
	const d = dock.getBoundingClientRect();
	return {
		found: true,
		inside: c.left >= d.left - 1 && c.right <= d.right + 1 && c.bottom <= d.bottom + 1,
		low: c.top > d.top + d.height / 2,
		otherLayer: root.querySelectorAll('.kx-celebrate:not([data-sonner-toast] .kx-celebrate)').length,
		toasts: root.querySelectorAll('[data-sonner-toast]').length,
	};
}, OUTER).catch(() => null);
if (celebration) {
	const ok = celebration.found && celebration.inside && celebration.low && celebration.otherLayer === 0;
	console.log(`  celebración en la pila de avisos del panel: ${ok ? 'OK' : 'FALLO'} ${JSON.stringify(celebration)}`);
	if (!ok) {
		// ¿No salió la celebración, o salió fuera? Se distingue con el estado del
		// cierre: la racha se reclama una sola vez por lección.
		const diag = await page.evaluate((outer) => {
			const root = document.querySelector(outer)?.shadowRoot;
			const text = (root?.textContent ?? '').replace(/\s+/g, ' ');
			return {
				terminada: /Leccion terminada|Lección terminada/.test(text),
				toasts: [...(root?.querySelectorAll('[data-sonner-toast]') ?? [])].map((t) => (t.textContent ?? '').replace(/\s+/g, ' ').slice(0, 60)),
				celebrateAnywhere: root?.querySelectorAll('.kx-celebrate').length ?? -1,
				cola: text.slice(-180),
			};
		}, OUTER).catch(() => null);
		console.log('  diagnóstico celebración:', JSON.stringify(diag));
	}
	celebrationOk = ok;
}

if (obsidianVault && obsidianUris.length > 0) {
	const out = path.join(SHOTS, `obsidian-uris-${QA_LESSON}-${QA_FLOW}.json`);
	writeFileSync(out, JSON.stringify(obsidianUris, null, 2));
	console.log(`  URIs obsidian:// escritas en ${out}`);
	for (const u of obsidianUris) {
		const n = decodeURIComponent(u).match(/\n#+ /g)?.length ?? 0;
		console.log(`   · ${u.slice(0, 90)}… (${u.length} chars, ${n} encabezados)`);
	}
}

if (process.env.QA_VERBOSE === '1') {
	console.log('\n── consola relevante ──');
	for (const l of pageConsoleBuf.filter((x) => /pre-gener|consumido|escalón|panel request|transcript/i.test(x))) console.log('   ', l);
	const swEnd = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	if (swEnd) {
		const stats = await swEnd.evaluate(() => new Promise((res) => {
			chrome.storage.local.get(['usg_study_generation_stats'], (r) => res(r?.usg_study_generation_stats ?? null));
		})).catch(() => null);
		console.log('   escalones de generación:', JSON.stringify(stats));
	}
}

const fmt = (ms) => `${Math.floor(ms / 60000)}m ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`;
if (process.env.QA_HUMAN_TIMING === '1' && stepClock.marks.length) {
	const swStats = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	const stats = swStats ? await swStats.evaluate(() => new Promise((res) => {
		chrome.storage.local.get(['usg_study_generation_stats'], (r) => res(r?.usg_study_generation_stats ?? null));
	})).catch(() => null) : null;
	const consumedPre = pageConsoleBuf.some((l) => /mazo pre-generado consumido/.test(l));
	console.log('\n-- TIEMPO POR PASO (sesion humana) --');
	for (let i = 0; i < stepClock.marks.length; i++) {
		const m = stepClock.marks[i];
		const nextAt = stepClock.marks[i + 1]?.at ?? Date.now();
		const total = Math.max(0, nextAt - m.at);
		const ai = stepClock.aiByStep[m.name] ?? 0;
		console.log(`  ${m.name.padEnd(10)} total ${String(Math.round(total / 1000)).padStart(4)}s   espera IA ${String(Math.round(ai / 1000)).padStart(4)}s   humano ${String(Math.round((total - ai) / 1000)).padStart(4)}s`);
	}
	console.log(`  ${'TOTAL'.padEnd(10)} ${Math.round((Date.now() - stepClock.startedAt) / 1000)}s desde Empezar`);
	const advantage = process.env.__PREGEN_ADVANTAGE_S;
	console.log(`  mazo pre-generado consumido: ${consumedPre ? 'sí' : 'no'}${advantage !== undefined ? ` · ventaja de la pre-generación: ${advantage}s` : ''} · espera tras pulsar Empezar: ${Math.round(tGen / 1000)}s · escalones: ${JSON.stringify(stats)}`);
}
const limit = QA_FLOW === 'full' ? 720000 : 240000;
console.log(`\n── RESULTADO ──`);
console.log(`  ${QA_FLOW === 'full' ? 'COMPLETO' : 'mínimo'} · lección ${QA_LESSON} (${currentLesson.seconds}s): ${/Lección terminada/.test(done) ? '✓ COMPLETADO' : '✗'} en ${fmt(ms)}`);
console.log(`  generación: ${fmt(tGen)} · comprobar: ${fmt(tComprobar)}${QA_FLOW === 'full' ? ` · aplicar: ${fmt(tAplicar)}` : ''}`);
console.log(`  objetivo ${QA_FLOW === 'full' ? '≤ 12' : '≤ 4'} min: ${ms <= limit ? '✓ CUMPLE' : '✗ NO CUMPLE'}`);
if (celebrationOk !== null) console.log(`  celebración dentro del panel: ${celebrationOk ? '✓' : '✗ FUERA DEL PANEL'}`);

clearTimeout(watchdog);
await context.close();
// La celebración fuera de la pila de avisos es un fallo de posición (taparía el
// vídeo): cuenta como fallo de la corrida, no como aviso.
process.exit(/Lección terminada/.test(done) && celebrationOk !== false ? 0 : 1);
