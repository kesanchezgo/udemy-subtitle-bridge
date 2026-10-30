/**
 * Verificación visual del prototipo (vista previa standalone), checklist de la
 * contrarrevisión: Vocabulario (Producir sí / Audio no), Obsidian (2 toggles),
 * Study sin .txt, Captions (interruptor del glosario) y temas claro/sepia.
 *
 * El módulo de export y las descargas .apkg son las mismas que qa-full-flows
 * D/E y qa-anki-all ya verifican sobre este mismo código sincronizado
 * (incluido Prism en media); aquí el flujo de objetivos del stepper requiere
 * IA real y se cubre allí.
 *
 * Uso: node scripts/qa-prototype-preview.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, '.mock', 'dist');
const SHOTS = path.join(repoRoot, 'tmp', 'prototype-preview');
fs.mkdirSync(SHOTS, { recursive: true });

const server = http.createServer((req, res) => {
	const url = req.url.split('?')[0];
	const file = path.join(distDir, url === '/' ? 'index.html' : url);
	if (fs.existsSync(file) && fs.statSync(file).isFile()) {
		const ext = path.extname(file);
		const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
		res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
		res.end(fs.readFileSync(file));
		return;
	}
	res.writeHead(200, { 'Content-Type': 'text/html' });
	res.end(fs.readFileSync(path.join(distDir, 'index.html')));
});
const port = 4880;
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const COURSE = 'Curso Prototipo QA';
const LESSON = 'Lección Prototipo QA';

let failures = 0;
const check = (n, ok, extra) => { if (ok) console.log('  ✓', n); else { failures += 1; console.error('  ✗', n, extra ?? ''); } };

const browser = await chromium.launch({ headless: false, viewport: { width: 1100, height: 950 } });
const context = await browser.newContext({ acceptDownloads: true, locale: 'es' });
const page = await context.newPage();

// Siembra el historial por el fallback de localStorage de chromeStorage /
// historyService (preview): claves usb_sync_* y usb_history_*.
await page.goto(`http://127.0.0.1:${port}/`);
await page.evaluate(({ COURSE, LESSON }) => {
	const record = {
		courseId: 'curso-prototipo-qa', lectureId: 'leccion-prototipo-qa',
		courseName: COURSE, lectureName: LESSON,
		objective: 'Verificar el prototipo', objectiveId: 'custom',
		status: 'completed', confidence: 'clear', questionsComplete: true, focusStep: 4,
		questions: [], ankiCardsCount: 2,
		studyContent: {
			relevance: { score: 90, reason: 'Verificación del prototipo.' },
			keyConcepts: ['concepto A del prototipo', 'concepto B del prototipo'],
			quickWin: 'Prueba el prototipo', questions: [],
			application: { setup: 's', challenge: 'c', solution: 'x', isCode: false },
			interviewQ: { q: 'q', idealAnswer: 'a' }, nextAction: 'n', ankiCards: [],
		},
		ankiCards: [
			{ id: 'c1', front: '¿Pregunta uno?', back: '<p>Respuesta uno</p>', tags: ['qa'], type: 'concepto' },
			{ id: 'c2', front: '¿Pregunta dos?', back: '<p>Respuesta dos</p>', tags: ['qa'], type: 'concepto' },
		],
		version: 2,
	};
	localStorage.setItem('usb_history_lecture::curso-prototipo-qa::leccion-prototipo-qa', JSON.stringify(record));
	localStorage.setItem('usb_sync_agent_course_name', JSON.stringify(COURSE));
	localStorage.setItem('usb_sync_agent_lesson_name', JSON.stringify(LESSON));
	localStorage.setItem('usb_sync_agent_selected_obj', JSON.stringify('custom'));
}, { COURSE, LESSON });
await page.reload();
await page.waitForTimeout(4500);

// El prototipo trae config de Supabase propia: entrar como invitado.
await page.evaluate(() => {
	const btn = [...document.querySelectorAll('button')].find((b) => /Continuar sin cuenta/i.test(b.textContent || ''));
	btn?.click();
});
await page.waitForTimeout(2500);

const uiText = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const openTab = async (tab) => {
	await page.evaluate((tab) => {
		const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === tab);
		btn?.click();
	}, tab);
	await page.waitForTimeout(1500);
	await page.screenshot({ path: path.join(SHOTS, 'tab-' + tab + '.png') });
};
const openSettingsSection = async (section) => {
	await page.evaluate((section) => {
		window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section } }));
	}, section);
	await page.waitForTimeout(1100);
};

// ── Ajustes → Mazo de idiomas (B3/B4) ────────────────────────────────────────
console.log('\n▶ Ajustes → Mazo de idiomas (B3/B4)');
await openSettingsSection('vocabulary');
{
	const txt = await uiText();
	check('grupo «Tarjeta para producir» presente (B3)', /Tarjeta para producir/i.test(txt), txt.slice(0, 120));
	check('sin selector «Audio» / «Archivo de calidad» (B4)', !/Archivo de calidad/i.test(txt));
	await page.screenshot({ path: path.join(SHOTS, 'vocabulario-settings.png') });
}

// ── Ajustes → Obsidian (C6) ──────────────────────────────────────────────────
console.log('\n▶ Ajustes → Obsidian (C6)');
await openSettingsSection('obsidian');
{
	const txt = await uiText();
	check('«Tarjetas de la lección» (renombre C6)', /Tarjetas de la lección/i.test(txt));
	const srState = await page.evaluate(() => {
		const row = [...document.querySelectorAll('*')].find((e) => e.textContent?.trim() === 'Repasar también en Obsidian' && e.children.length === 0);
		const scope = row?.closest('div[class*="flex"]')?.parentElement ?? row?.parentElement?.parentElement;
		const sw = scope?.querySelector('[role="switch"]');
		return sw ? (sw.getAttribute('aria-checked') ?? sw.dataset.state) : 'no-encontrado';
	});
	check('«Repasar también en Obsidian» presente y apagado (un solo planificador)', srState !== 'no-encontrado' && srState !== 'true', String(srState));
	await page.screenshot({ path: path.join(SHOTS, 'obsidian-settings.png') });
}

// ── Captions — interruptor del glosario ──────────────────────────────────────
console.log('\n▶ Captions — interruptor del glosario');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
await page.waitForTimeout(500);
await openTab('Captions');
{
	const glossState = await page.evaluate(() => {
		const sw = [...document.querySelectorAll('[role="switch"]')].find((s) => /vocabulario de apoyo/i.test(s.getAttribute('aria-label') ?? ''));
		return sw ? (sw.getAttribute('aria-checked') ?? sw.dataset.state) : 'no-encontrado';
	});
	check('el interruptor «Glosario en el video» existe en Captions', glossState !== 'no-encontrado', String(glossState));
	check('el glosario arranca activado (default)', glossState === 'true' || glossState === 'checked', String(glossState));
	await page.screenshot({ path: path.join(SHOTS, 'captions-glosario.png') });
}

// ── Study — sin .txt (A8) ────────────────────────────────────────────────────
console.log('\n▶ Study — sin .txt (A8)');
await openTab('Study');
{
	const txt = await uiText();
	check('la vista Study del prototipo no contiene la guía .txt (A8)', !/PLANTILLA-ANKI|CSS y plantilla/i.test(txt));
	await page.screenshot({ path: path.join(SHOTS, 'study-export.png') });
}

// ── Temas: sepia (el claro es el default ya capturado) ───────────────────────
console.log('\n▶ Temas claro y sepia');
await page.evaluate(() => { try { localStorage.setItem('usb_theme', 'sepia'); } catch {} });
await page.reload();
await page.waitForTimeout(3500);
await page.evaluate(() => {
	const btn = [...document.querySelectorAll('button')].find((b) => /Continuar sin cuenta/i.test(b.textContent || ''));
	btn?.click();
});
await page.waitForTimeout(1500);
const sepiaApplied = await page.evaluate(() => Boolean(document.querySelector('.dock-sepia')));
check('el tema sepia se aplica en el prototipo', sepiaApplied);
await page.screenshot({ path: path.join(SHOTS, 'tema-sepia.png') });

await browser.close();
server.close();

console.log(failures === 0 ? '\n✅ PROTOTIPO VERIFICADO' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
