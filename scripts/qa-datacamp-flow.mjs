/**
 * QA del FLUJO COMPLETO de estudio sobre DataCamp real: generación con mock IA,
 * Recordar → Comprobar (con revisión) → Aplicar (tarjetas) → Fijar →
 * «Lección terminada», y el registro del historial con el mazo generado.
 *
 * Uso: npm run qa:datacamp:flow  (cookies reales en .qa-datacamp-cookies.json, git-ignorado)
 */
import { chromium } from 'playwright';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');
const PROFILE = path.join(repoRoot, 'chrome-datacamp-profile');
const SHOTS = path.join(repoRoot, 'tmp', 'datacamp-qa');
const OUTER = '[id^="usb-dock-host-"]';
const VIDEO_URL = 'https://app.datacamp.com/es/campus/courses/working-with-the-openai-api/introduction-to-the-openai-api?ex=1&skip_variants_modal=true';
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const check = (name, ok, detail = '') => {
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`);
	if (!ok) failures += 1;
};

try { execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*chrome-datacamp-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' }); } catch {}

// ── Mock IA OpenAI-compatible (mismo payload que qa-full-flows) ───────────────
const QA_STUDY_JSON = {
	relevance: { score: 91, reason: 'Mecanismo central de la API para tu objetivo.' },
	summary: 'La API de OpenAI expone modelos a los que se llama con peticiones HTTP autenticadas.',
	conceptTerms: ['api', 'endpoint', 'token'],
	keyConcepts: [
		'la API de OpenAI expone modelos vía HTTP con autenticación por key',
		'el endpoint de chat recibe mensajes y devuelve la respuesta del modelo',
		'los parámetros (model, temperature) controlan el comportamiento',
	],
	quickWin: 'Haz tu primera petición al endpoint de chat con curl.',
	questions: [
		{ q: 'QA · ¿Qué expone la API de OpenAI y cómo se autentica?', bloom: 'recordar', difficulty: 'confused', conceptRefs: [0], hint: 'HTTP + key', answer: 'Modelos vía HTTP, autenticados con una API key' },
		{ q: 'QA · ¿Qué recibe y qué devuelve el endpoint de chat?', bloom: 'comprender', difficulty: 'partial', conceptRefs: [1], hint: 'Mensajes dentro, respuesta fuera', answer: 'Recibe una lista de mensajes y devuelve la respuesta del modelo' },
		{ q: 'QA · Aplica: ¿qué parámetros fijarías para una respuesta creativa y por qué?', bloom: 'aplicar', difficulty: 'clear', conceptRefs: [2], hint: 'Temperature', answer: 'Temperature alta: más aleatoriedad en el muestreo' },
	],
	application: { isCode: false, setup: 'Tienes tu API key', challenge: 'Llama al endpoint de chat y muestra la respuesta', solution: 'POST /v1/chat/completions con el header Authorization y el body con messages' },
	interviewQ: { q: 'QA · Explica en 60s cómo funciona la API de OpenAI.', idealAnswer: 'HTTP, key, mensajes, respuesta del modelo.' },
	nextAction: 'Ejecuta tu primera petición y guarda la respuesta.',
	ankiCards: [
		{ id: 'card-001', type: 'concepto', conceptRefs: [0], front: 'QA · ¿Cómo se autentica la API de OpenAI?', back: 'Con una API key en el header Authorization.', tags: ['openai'] },
		{ id: 'card-002', type: 'concepto', conceptRefs: [1], front: 'QA · ¿Qué hace el endpoint de chat?', back: 'Recibe mensajes y devuelve la respuesta del modelo.', tags: ['openai'] },
		{ id: 'card-003', type: 'comparacion', conceptRefs: [2], front: 'QA · ¿Qué controla temperature?', back: 'La aleatoriedad/creatividad del muestreo.', tags: ['openai'] },
	],
};
const evalVerdictFor = (body) => {
	// Determinista: la pregunta clear (bloom aplicar) falla → consolidación;
	// el resto correcto a la primera.
	if (/PREGUNTA \(nivel aplicar\)/.test(body)) {
		return '[INCORRECTO]\nBIEN: Reconoces el parámetro que influye.\nFALTO: Temperature sube la aleatoriedad del muestreo; no garantiza creatividad.\nPARA RECORDAR: temperature = azar del muestreo.';
	}
	return '[CORRECTO]\nBIEN: Capturas la idea central del concepto preguntado.\nFALTO: (nada)\nPARA RECORDAR: Conecta siempre el mecanismo con un ejemplo propio.';
};

const portFree = (candidate) => new Promise((resolve) => {
	const probe = createHttpServer();
	probe.once('error', () => resolve(false));
	probe.once('listening', () => probe.close(() => resolve(true)));
	candidate >= 8160 ? resolve(false) : probe.listen(candidate, '127.0.0.1', () => resolve(true));
});
let QA_PORT = 8123;
while (!(await portFree(QA_PORT))) QA_PORT += 1;

const qaAi = createHttpServer((req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
	if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
	if (req.method === 'GET' && req.url.includes('/models')) {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ object: 'list', data: [{ id: 'qa-model', object: 'model' }] }));
		return;
	}
	let raw = '';
	req.on('data', (c) => { raw += c; });
	req.on('end', () => {
		let content;
		if (/JSON VÁLIDO|JSON VALIDO/.test(raw)) content = JSON.stringify(QA_STUDY_JSON);
		else if (/formato EXACTO/.test(raw)) content = evalVerdictFor(raw);
		else if (/Refinar|objetiv/i.test(raw)) content = JSON.stringify({ objectives: [
			{ id: 'qa-obj-1', icon: 'target', title: 'Entender la API de OpenAI', sub: 'HTTP, key y endpoint de chat' },
		] });
		else content = 'OK';
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ id: 'qa', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
	});
});
qaAi.listen(QA_PORT, '127.0.0.1');
process.on('exit', () => { try { qaAi.close(); } catch { /* ya cerrado */ } });
console.log(`  (mock IA OpenAI-compatible en 127.0.0.1:${QA_PORT})`);

// ── Navegador ─────────────────────────────────────────────────────────────────
const context = await chromium.launchPersistentContext(PROFILE, {
	headless: false, channel: 'chromium',
	args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled',
		`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
	viewport: { width: 1680, height: 1000 }, ignoreDefaultArgs: ['--enable-automation'],
});
await context.clearCookies();
const raw = JSON.parse(readFileSync('.qa-datacamp-cookies.json', 'utf8'));
await context.addCookies(raw.map((c) => ({
	name: c.name, value: String(c.value),
	domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
	path: c.path || '/', secure: c.secure !== false, httpOnly: Boolean(c.httpOnly),
	sameSite: c.sameSite === 'no_restriction' ? 'None' : 'Lax',
	...(c.expirationDate ? { expires: Math.floor(c.expirationDate) } : {}),
})));
const page = context.pages()[0] ?? await context.newPage();
const consoleTail = [];
page.on('console', (m) => { const t = `[pg] ${m.text().slice(0, 220)}`; consoleTail.push(t); if (consoleTail.length > 200) consoleTail.shift(); });
page.on('pageerror', (e) => { consoleTail.push(`[pgerror] ${String(e).slice(0, 300)}`); if (consoleTail.length > 200) consoleTail.shift(); });

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
const clickInShadow = (match) => page.evaluate((m) => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const btn = [...root.querySelectorAll('button')].find((b) => m.test((b.textContent ?? '').trim()) && !b.disabled);
	if (!btn) return false;
	btn.click();
	return true;
}, match);
const clickAndWait = async (clickRe, ready, tries = 6, stepMs = 1500) => {
	const readyNow = () => page.evaluate(({ sel, text }) => {
		const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		if (!root) return false;
		if (sel && root.querySelector(sel)) return true;
		if (text) return [...root.querySelectorAll('button')].some((b) => new RegExp(text).test((b.textContent ?? '').trim()));
		return false;
	}, { sel: ready.sel ?? null, text: ready.text?.source ?? null });
	for (let i = 0; i < tries; i += 1) {
		await clickInShadow(clickRe);
		for (let waited = 0; waited < stepMs; waited += 250) {
			await page.waitForTimeout(250);
			if (await readyNow()) return true;
		}
	}
	return false;
};
const waitClickInShadow = async (match, ms = 12000) => {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (await clickInShadow(match)) return true;
		await page.waitForTimeout(350);
	}
	return false;
};
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
const fillTextarea = (phRe, value) => page.evaluate(({ ph, value }) => {
	const re = new RegExp(ph);
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const ta = [...root.querySelectorAll('textarea')].find((el) => re.test(el.placeholder));
	if (!ta) return false;
	const setter = Object.getOwnPropertyDescriptor(root.ownerDocument.defaultView.HTMLTextAreaElement.prototype, 'value').set;
	setter.call(ta, value);
	ta.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}, { ph: phRe.source, value });

// Historial limpio para esta lección (el perfil es persistente).
// El SW de MV3 se duerme entre que lo buscas y el evaluate: cada escritura va
// con carrera de timeout y reintento (mismo patrón que qa-full-flows).
const swEval = async (fn, arg, ms = 8000) => {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		// DataCamp registra SU PROPIO service worker (gsstm.datacamp.com, sin API
		// chrome): solo el de la extensión sirve para leer storage.
		const workers = context.serviceWorkers().filter((w) => w.url().startsWith('chrome-extension://'));
		const svc = workers.at(-1) ?? await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
		if (!svc) { console.log(`  · swEval intento ${attempt + 1}: sin SW (${workers.length} registrados)`); await page.waitForTimeout(1000); continue; }
		const result = await Promise.race([
			svc.evaluate(fn, arg).then((v) => ['OK', v]).catch((e) => ['EVAL_FAIL', String(e).slice(0, 90)]),
			page.waitForTimeout(ms).then(() => ['TIMEOUT', null]),
		]);
		if (result[0] === 'OK') return result[1];
		console.log(`  · swEval intento ${attempt + 1}: ${result[0]} ${result[1] ?? ''} (workers=${workers.length}, url=${svc.url().slice(0, 50)})`);
		await page.waitForTimeout(1200);
	}
	throw new Error('el service worker no respondió tras 4 intentos');
};
const clearHistoryFor = async () => {
	await swEval(() => new Promise((done) => chrome.storage.local.get(null, (all) => {
		const keys = Object.keys(all ?? {}).filter((k) => k.startsWith('usb_history_lecture::'));
		chrome.storage.local.remove(keys, () => done(keys.length));
	})));
};

// ── Sembrar el proveedor (mock) y abrir la lección ────────────────────────────
await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await clearHistoryFor();
await swEval((qaPort) => new Promise((done) => {
	chrome.storage.local.set({
		usg_ai_provider_config: { kind: 'openai', baseUrl: `http://127.0.0.1:${qaPort}/v1`, apiKey: 'qa-key', model: 'qa-model' },
	}, () => done(null));
}), QA_PORT);

// Dock montado (el adaptador siembra el transcript del vídeo).
let dockShown = false;
for (let i = 0; i < 25 && !dockShown; i += 1) {
	dockShown = await page.locator(OUTER).count() > 0;
	if (dockShown) break;
	await page.waitForTimeout(1000);
}
check('la lección de vídeo monta el dock', dockShown);

// ── Estudio: pestaña Study → objetivo → generar ──────────────────────────────
await page.locator(`${OUTER} button:has-text("Study")`).first().evaluate((el) => el.click()).catch(() => {});
await page.waitForTimeout(1500);
await waitClickInShadow(/Editar curso o lección/);
await page.waitForTimeout(400);
await fillInputInShadow('Nombre del video/clase actual', '¿Qué es la API de OpenAI?');
await page.waitForTimeout(300);
await fillInputInShadow('Ej: Conseguir trabajo en fintech como Java dev en 3 meses…', 'Entender cómo funciona la API de OpenAI');
await page.waitForTimeout(300);

let genOk = false;
for (let i = 0; i < 10 && !genOk; i += 1) {
	genOk = await clickInShadow(/Empezar · ~4–10 min|Generar sesión de aprendizaje · ~4–10 min|Generar sesión de aprendizaje/);
	if (!genOk) await page.waitForTimeout(700);
}
check('el CTA de generación se habilita con lección + objetivo', genOk);
let genTxt = '';
for (let i = 0; i < 30; i += 1) {
	genTxt = await shadow();
	if (/¿Qué tan claro te quedó la lección\?/.test(genTxt)) break;
	await page.waitForTimeout(500);
}
check('la sesión de estudio se genera (mock)', /¿Qué tan claro te quedó la lección\?/.test(genTxt), genTxt.slice(0, 110));

// ── Recordar ──────────────────────────────────────────────────────────────────
await clickAndWait(/^Confuso/, { sel: 'textarea[placeholder^="Lo que recuerdo"]' });
await fillTextarea(/^Lo que recuerdo es/, 'Recuerdo que la API de OpenAI se llama por HTTP con una key y devuelve texto.');
await clickAndWait(/Comparar con las ideas clave|Ver las ideas clave/, { text: /Ponerme a prueba/ });
// Marcar la primera idea (data-doubt-recall) para que Comprobar la use.
const marked = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const first = root?.querySelector('[data-doubt-recall] [aria-pressed]');
	if (!first) return false;
	first.click();
	return true;
});
check('las ideas clave se pueden marcar en Recordar', marked);
await clickAndWait(/Ponerme a prueba/, { sel: 'textarea[placeholder^="Escribe tu respuesta"]' });
await page.waitForTimeout(1200);

// ── Comprobar: 3 preguntas del plan (1 elegida + ideas marcadas + confirmación) ─
const verifyClosed = () => page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	return Boolean(root?.querySelector('[data-verify-review]'));
});
let flowOk = false;
let planTotal = null;
for (let i = 0; i < 14 && !flowOk; i += 1) {
	const m = (await shadow()).match(/Pregunta (\d+) de (\d+)/);
	if (m) planTotal = Number(m[2]);
	if (await verifyClosed()) { flowOk = true; break; }
	if (await fillTextarea(/^Escribe tu respuesta con tus propias palabras/, 'La API de OpenAI expone modelos por HTTP; el endpoint de chat recibe mensajes y devuelve la respuesta, y temperature controla la aleatoriedad.')) {
		await page.waitForTimeout(300);
	}
	if (await clickInShadow(/^Revisar mi respuesta$/)) { await page.waitForTimeout(4500); continue; }
	if (await clickInShadow(/^Siguiente pregunta/)) { await page.waitForTimeout(1200); continue; }
	if (await clickInShadow(/^Terminar y ver la respuesta esperada$|^Terminar aquí$/)) { await page.waitForTimeout(1200); continue; }
	await page.waitForTimeout(800);
}
check('el paso Comprobar se completa con sus revisiones', flowOk, flowOk ? `plan «de ${planTotal ?? '?'}»` : (await shadow()).slice(0, 110));
check('el plan tuvo 3 preguntas (checkCap sobre el mock)', planTotal === 3, `plan «de ${planTotal ?? '?'}»`);

// ── Aplicar: el reto del studyContent del mock; las tarjetas van al registro ──
// Observador del ciclo de vida: ¿el dock (o el iframe del vídeo) se destruye y
// recrea en la transición? Eso reiniciaría la sesión al landing.
await page.evaluate(() => {
	const w = window;
	w.__dcLog = [];
	const log = (m) => w.__dcLog.push(`${String(Date.now() % 100000).padStart(5, '0')} ${m}`);
	new MutationObserver((muts) => {
		for (const mu of muts) {
			for (const n of mu.removedNodes) if (n.id?.startsWith('usb-dock-host-')) log('dock REMOVIDO');
			for (const n of mu.addedNodes) if (n.id?.startsWith('usb-dock-host-')) log('dock CREADO');
		}
	}).observe(document.body, { childList: true, subtree: false });
	w.__dcIframeTimer = setInterval(() => {
		const iframe = document.querySelector('iframe[src*="projector"]');
		log(`iframe=${iframe ? 'sí' : 'NO'} host=${document.querySelector('[id^="usb-dock-host-"]') ? 'sí' : 'NO'}`);
	}, 500);
});
const clickedAplicar = await waitClickInShadow(/Continuar a Aplicar/);
await page.waitForTimeout(2000);
const aplicarTxt = await shadow();
check('el paso Aplicar abre con el reto del estudio', /Paso 3 de 4 · Aplicar/.test(aplicarTxt) && /Llama al endpoint de chat/.test(aplicarTxt), `clic=${clickedAplicar}`);
await page.screenshot({ path: path.join(SHOTS, 'flow-aplicar.png') }).catch(() => {});
const dcLog = await page.evaluate(() => {
	clearInterval(window.__dcIframeTimer);
	const entries = window.__dcLog ?? [];
	const changes = entries.filter((e) => !e.includes('sí host=sí'));
	return { total: entries.length, cambios: changes.slice(0, 14) };
});
check('el dock y el iframe del vídeo no se recrean en la transición', dcLog.cambios.length === 0, JSON.stringify(dcLog.cambios).slice(0, 120));

// Saltar el reto (mismo camino que qa-full-flows): el mazo generado queda en el
// registro y Fijar muestra el módulo de tarjetas.
await waitClickInShadow(/^Saltar este paso$/);
let finTxt = '';
for (let i = 0; i < 16; i += 1) {
	await page.waitForTimeout(500);
	finTxt = await shadow();
	if (/Terminar lección/.test(finTxt)) break;
}
check('Aplicar lleva a Fijar con «Terminar lección»', /Terminar lección/.test(finTxt), finTxt.slice(0, 110));
check('Fijar muestra «Tarjetas de la lección»', /Tarjetas de la lección/.test(finTxt));

// ── Fijar: cerrar la lección ──────────────────────────────────────────────────
await waitClickInShadow(/Terminar lección/);
await page.waitForTimeout(1500);
const doneTxt = await shadow();
check('«Terminar lección» cierra la lección', /Lección terminada/.test(doneTxt), doneTxt.slice(0, 130));
const celebrated = await page.evaluate(() => Boolean(document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot?.querySelector('[data-sonner-toast] .kx-celebrate'))).catch(() => false);
check('la celebración sale en la pila del panel', celebrated);
await page.screenshot({ path: path.join(SHOTS, 'flow-fijar.png') }).catch(() => {});

// ── Historial: la lección queda guardada, completada y con su mazo ────────────
// El SW de MV3 pudo dormirse tras el cierre (su target queda muerto para
// Playwright): una recarga arranca el content script de nuevo y su keepalive
// despierta el SW; el registro ya está persistido en storage.
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(5000);
const record = await swEval(() => new Promise((done) => {
	chrome.storage.local.get(null, (all) => {
		const recs = Object.entries(all ?? {})
			.filter(([k]) => k.startsWith('usb_history_lecture::'))
			.map(([, v]) => v)
			.sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
		done(recs[0] ?? null);
	});
}));
check('la lección queda en el historial', Boolean(record?.id || record?.lectureName), JSON.stringify({ name: record?.lectureName, course: record?.courseName }).slice(0, 120));
check('el registro queda COMPLETADO (práctica «later» por el salto del reto)', String(record?.status ?? '') === 'completed' && ['done', 'completed', 'later'].includes(String(record?.practiceStatus ?? '')), `status=${record?.status} practice=${record?.practiceStatus}`);
check('el studyContent del mock quedó guardado', (record?.studyContent?.keyConcepts?.length ?? 0) === 3 && (record?.studyContent?.questions?.length ?? 0) === 3, `ideas=${record?.studyContent?.keyConcepts?.length} preguntas=${record?.studyContent?.questions?.length}`);
check('las tarjetas Anki quedan en el registro', (record?.ankiCards?.length ?? record?.ankiCardsCount ?? 0) >= 3, `cards=${record?.ankiCards?.length ?? record?.ankiCardsCount}`);
check('el curso/lección guardados son los de DataCamp', /openai/i.test(String(record?.courseName ?? '')) && /OpenAI/i.test(String(record?.lectureName ?? '')), `${record?.courseName} / ${record?.lectureName}`);

console.log(`\n${failures === 0 ? '✅' : '❌'} DataCamp flujo completo: ${failures === 0 ? 'todo OK' : `${failures} fallos`}`);
if (failures > 0) {
	console.log('  últimas líneas de consola:');
	for (const l of consoleTail.slice(-12)) console.log('   ', l);
}
await context.close();
process.exit(failures === 0 ? 0 : 1);
