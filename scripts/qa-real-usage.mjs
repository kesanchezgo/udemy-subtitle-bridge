// Prueba de uso REAL: lección de ~3 min del curso real, flujo mínimo.
// Mismo mecanismo que qa-full-flows clone: mock IA en 8123, provider seed
// por SW, transcripción del vídeo real.
import { chromium } from 'playwright';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
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
// QA_REAL_PROXY=1: sin mock — usa el proxy real del usuario en 8010 con
// deepseek-v4.1-flash:free (timing de punta a punta de verdad).
const REAL_PROXY = process.env.QA_REAL_PROXY === '1';
if (!REAL_PROXY) {
	const s8123 = http.createServer(mockHandler);
	await new Promise((r) => s8123.listen(8123, '127.0.0.1', r));
}

// ── Navegador + cookies + seed ──
const pageConsoleBuf = [];
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
	}
}

const context = await chromium.launchPersistentContext(PROFILE, {
	headless: false, channel: 'chromium',
	args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled',
		`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
	viewport: { width: 1680, height: 1000 }, ignoreDefaultArgs: ['--enable-automation'],
});
if (existsSync('.qa-udemy-cookies.json')) {
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

// Abrir página para despertar el SW + seed
const seedPage = await context.newPage();
await seedPage.goto(`https://www.udemy.com/course/${SLUG}/learn/lecture/42163342`,
	{ waitUntil: 'domcontentloaded', timeout: 60000 });
await seedPage.waitForSelector(OUTER, { timeout: 45000 });
for (let i = 0; i < 10; i++) {
	const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	if (sw) {
		await sw.evaluate((real) => new Promise((res) => {
			chrome.storage.local.set({
				usg_ai_provider_config: real
					? { kind: 'local', baseUrl: 'http://127.0.0.1:8010/v1', apiKey: '', model: 'deepseek-v4.1-flash:free' }
					: { kind: 'openai', baseUrl: 'http://127.0.0.1:8123/v1', apiKey: 'qa-key', model: 'qa-model' },
			}, res);
		}), REAL_PROXY).catch(() => {});
		console.log(REAL_PROXY ? '  proveedor → proxy real 8010 (deepseek-v4.1-flash:free)' : '  proveedor → mock IA (8123)');
		break;
	}
	await new Promise((r) => setTimeout(r, 2000));
}
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
const waitFor = async (regex, ms) => {
	const d = Date.now() + ms;
	let t = '';
	while (Date.now() < d) { t = await shadow(); if (regex.test(t)) return t; await page.waitForTimeout(500); }
	return t;
};

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
const short = { id: 42163342, title: "8. Platform Dependency + Demo", seconds: 0 };
console.log(`  lección: ${short.seconds}s «${short.title}» (id ${short.id})`);

// Navegar a la lección corta
await page.goto(`https://www.udemy.com/course/${SLUG}/learn/lecture/${short.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector(OUTER, { timeout: 45000 });
await page.waitForTimeout(2500);
await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
await page.locator(`${OUTER} button:has-text("Study")`).first().evaluate((el) => el.click()).catch(() => {});
await page.waitForTimeout(2000);

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

// Fresh session
const st = await shadow();
if (/Reiniciar/.test(st) && /Ponte a prueba|Fíjalo|Llévalo/.test(st)) {
	await click(/Reiniciar/);
	await page.waitForTimeout(400);
	await click(/Sí, reiniciar/);
	await page.waitForTimeout(1500);
}

// Reproducir el vídeo (cues)
await page.evaluate(() => { document.querySelector('video')?.play().catch(() => {}); });
await page.waitForTimeout(20000);
await page.evaluate(() => { document.querySelector('video')?.pause(); });
console.log('  vídeo reproducido 20s');

// Esperar transcripción lista
const dTr = Date.now() + 90000;
let trReady = false;
while (Date.now() < dTr) {
	const t = await shadow();
	if (/Subtítulos listos/.test(t)) { console.log('  transcripción: lista ✓'); trReady = true; break; }
	if (/Sin subtítulos/.test(t)) { console.log('  transcripción: NO hay'); break; }
	await page.waitForTimeout(1000);
}

// Objetivo propio
await waitFor(/O escribe tu propio objetivo/, 15000);
await click(/O escribe tu propio objetivo/).catch?.(() => {});
await page.waitForTimeout(500);
await fill('Conseguir trabajo en fintech', 'Dominar el tema de esta lección.');

// CTA
let t0 = 0;
for (let i = 0; i < 90; i++) {
	if (await click(/Empezar · ~4–10 min|Generar sesión de aprendizaje/)) { t0 = Date.now(); break; }
	await page.waitForTimeout(1000);
}
if (!t0) { console.log('✗ CTA deshabilitado'); process.exit(1); }
console.log('  generación iniciada…');

// Resultado
const txt = await waitFor(/¿Qué tan claro te quedó el video\??/, 300000);
if (!/¿Qué tan claro/.test(txt)) {
	await page.screenshot({ path: path.join(SHOTS, 'gen-fail.png') });
	console.log('✗ generación sin resultado');
	process.exit(1);
}
const tGen = Date.now() - t0;
console.log(`  generación: ${Math.round(tGen / 1000)}s`);

// Nivel
await click(/^Más o menos/);
await page.waitForTimeout(600);

// Conceptos
await click(/Ver los conceptos|Comparar con los conceptos/);
await page.waitForTimeout(600);

// Pregunta
await click(/Ponerme a prueba/);
await page.waitForTimeout(1600);

// Responder
pageConsoleBuf.push('=== click Evaluar Q1 ===');
await fill('Escribe tu respuesta con tus propias palabras', 'javac produce bytecode y la JVM lo interpreta en cualquier plataforma.');
await click(/^Evaluar/);

// Esperar veredicto + Continuar
let ok = false;
for (let i = 0; i < 10 && !ok; i++) {
	const d = await waitFor(/Continuar a Aplicar|\bSiguiente\b/, 120000);
	if (/Continuar a Aplicar/.test(d)) { ok = true; break; }
	if (/\bSiguiente\b/.test(d)) {
		await click(/\bSiguiente\b/);
		await page.waitForTimeout(1000);
		pageConsoleBuf.push('=== click Evaluar Q' + (i + 2) + ' ===');
		await fill('Escribe tu respuesta con tus propias palabras', 'Consolidación: javac produce bytecode y la JVM lo interpreta.');
		await click(/^Evaluar/);
		continue;
	}
	break;
}
if (!ok) {
	await page.screenshot({ path: path.join(SHOTS, 'comprobar-fail.png') });
	console.log('✗ Comprobar incompleto');
	console.log('  dock:', (await shadow()).slice(-500));
	console.log('  consola completa:');
	for (const l of pageConsoleBuf) console.log('   ', l);
	process.exit(1);
}

// Continuar → Hacerlo después → Terminar
await click(/Continuar a Aplicar/);
await page.waitForTimeout(700);
await click(/Hacerlo después/);
await page.waitForTimeout(700);
await click(/Terminar lección/);
const done = await waitFor(/Lección terminada/, 15000);
const ms = Date.now() - t0;
await page.screenshot({ path: path.join(SHOTS, 'minimo.png') });

const fmt = (ms) => `${Math.floor(ms / 60000)}m ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`;
console.log(`\n── RESULTADO ──`);
console.log(`  flujo mínimo: ${/Lección terminada/.test(done) ? '✓ COMPLETADO' : '✗'} en ${fmt(ms)} (generación: ${fmt(tGen)})`);
console.log(`  objetivo ≤ 4 min: ${ms <= 240000 ? '✓ CUMPLE' : '✗ NO CUMPLE'}`);

clearTimeout(watchdog);
await context.close();
process.exit(/Lección terminada/.test(done) ? 0 : 1);
