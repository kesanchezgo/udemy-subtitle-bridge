/**
 * QA del adaptador de master.dev (Frontend Masters): dock DENTRO del layout,
 * títulos reales del curso/lección, VTT oficial sembrado y subtítulos nativos
 * ocultos, total del curso con source masterdev, programa (learning path) con
 * ambigüedad respetada, toggle del dock, navegación real a la siguiente lección
 * y cero llamadas a la API de Udemy desde este sitio.
 *
 * Uso: npm run qa:master   (build previo; cookies en .qa-master-cookies.json,
 * git-ignorado). NUNCA inicia sesión: si el fichero falta o expiró, aborta.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');
const PROFILE = path.join(repoRoot, 'chrome-master-profile');
const SHOTS = path.join(repoRoot, 'tmp', 'master-qa');
const OUTER = '[id^="usb-dock-host-"]';
const LESSON_URL = 'https://master.dev/courses/ai-engineering/connecting-the-client-side-tools/';
const PATH_URL = 'https://master.dev/learn/ai-engineering/';
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const check = (name, ok, detail = '') => {
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`);
	if (!ok) failures += 1;
};
const abort = (why) => { console.log(`✗ ABORTADO: ${why}`); process.exit(1); };

try { execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*chrome-master-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' }); } catch {}

// ── 0. Cookies: única fuente de sesión. Sin login, sin excepciones. ───────────
if (!existsSync('.qa-master-cookies.json')) abort('falta .qa-master-cookies.json (no se abre el login)');
let raw;
try { raw = JSON.parse(readFileSync('.qa-master-cookies.json', 'utf8')); }
catch { abort('.qa-master-cookies.json no es JSON válido'); }
if (!Array.isArray(raw) || !raw.length) abort('.qa-master-cookies.json está vacío');
const expired = raw.filter((c) => Number(c.expirationDate) > 0 && c.expirationDate * 1000 <= Date.now());
if (expired.length) abort(`cookies caducados (${expired.map((c) => c.name).join(', ')})`);

const context = await chromium.launchPersistentContext(PROFILE, {
	headless: false, channel: 'chromium',
	args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled',
		`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
	viewport: { width: 1680, height: 1000 }, ignoreDefaultArgs: ['--enable-automation'],
});
await context.clearCookies();
await context.addCookies(raw.map((c) => ({
	name: c.name, value: String(c.value),
	domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
	path: c.path || '/', secure: c.secure !== false, httpOnly: Boolean(c.httpOnly),
	sameSite: c.sameSite === 'no_restriction' ? 'None' : 'Lax',
	...(c.expirationDate ? { expires: Math.floor(c.expirationDate) } : {}),
})));

const page = context.pages()[0] ?? await context.newPage();
const udemyApiCalls = [];
const lastErrors = [];
page.on('request', (r) => { if (/api-2\.0\.udemy\.com|\/api-2\.0\//.test(r.url())) udemyApiCalls.push(r.url()); });
page.on('console', (m) => { if (/unchecked runtime\.lastError|runtime\.lastError/i.test(m.text())) lastErrors.push(m.text()); });

const swWait = async () => {
	for (let i = 0; i < 20; i += 1) {
		const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
		if (sw) return sw;
		await page.waitForTimeout(500);
	}
	return null;
};
const sw = await swWait();
if (!sw) abort('sin service worker de la extensión');

// Estado limpio del perfil de QA (los valores de una corrida anterior no deben
// decidir el programa ni el autocompletado de esta).
await sw.evaluate(() => new Promise((done) => chrome.storage.sync.remove(
	['agent_course_name', 'agent_lesson_name', 'agent_lesson_autofill_key', 'agent_lesson_autofill_value', 'dc_active_track', 'dc_program_context', 'dock_width'],
	() => done(null),
)));
await sw.evaluate(() => new Promise((done) => chrome.storage.local.remove(
	['usb_course_totals', 'dock_width'], () => done(null),
)));
const syncGet = (keys) => sw.evaluate((ks) => new Promise((done) => chrome.storage.sync.get(ks, (r) => done(r))), keys);
const localGet = (keys) => sw.evaluate((ks) => new Promise((done) => chrome.storage.local.get(ks, (r) => done(r))), keys);
const tabMessage = (message) => sw.evaluate(async (msg) => {
	const tabs = await new Promise((done) => chrome.tabs.query({ url: 'https://*.master.dev/*' }, (t) => done(t)));
	return new Promise((done) => chrome.tabs.sendMessage(tabs?.[0]?.id, msg, (r) => {
		void chrome.runtime.lastError;
		done(r ?? null);
	}));
}, message);

// ── 1. Lección real: sesión, dock, geometría y contexto ───────────────────────
await page.goto(LESSON_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
if (/\/login\/|sign_in/i.test(page.url())) abort('la cookie ya no abre master.dev (redirección a login): se aborta sin iniciar sesión');
let dock = false;
for (let i = 0; i < 30 && !dock; i += 1) { dock = await page.locator(OUTER).count() > 0; if (!dock) await page.waitForTimeout(1000); }
check('la lección monta el dock', dock);

const layout = await page.evaluate(() => {
	const main = document.querySelector('main');
	const host = document.querySelector('[id^="usb-dock-host-"]');
	const video = document.querySelector('video.vjs-tech, video');
	if (!main || !host) return null;
	const m = main.getBoundingClientRect(), h = host.getBoundingClientRect(), v = video?.getBoundingClientRect();
	return { mainRight: Math.round(m.right), dockLeft: Math.round(h.left), videoWidth: Math.round(v?.width ?? 0), margin: getComputedStyle(main).marginRight };
});
check('dock dentro del layout, sin sobreponerse', Boolean(layout) && layout.mainRight <= layout.dockLeft + 2,
	`main.right=${layout?.mainRight} vs dock.left=${layout?.dockLeft} · margin=${layout?.margin}`);
check('el vídeo conserva tamaño real (no 0px)', Boolean(layout) && layout.videoWidth > 500, `video.width=${layout?.videoWidth}`);

let ctx = {};
for (let i = 0; i < 20 && !(ctx.agent_course_name && ctx.agent_lesson_name); i += 1) {
	ctx = await syncGet(['agent_course_name', 'agent_lesson_name']);
	if (!(ctx.agent_course_name && ctx.agent_lesson_name)) await page.waitForTimeout(1000);
}
check('curso real en el contexto', /Applied AI Engineering Fundamentals/i.test(String(ctx.agent_course_name ?? '')), String(ctx.agent_course_name ?? '(vacío)'));
check('lección real, sin sufijo del curso', /Connecting the Client-Side Tools/i.test(String(ctx.agent_lesson_name ?? '')) && !/Applied AI/i.test(String(ctx.agent_lesson_name ?? '')), String(ctx.agent_lesson_name ?? '(vacío)'));

// ── 2. VTT oficial, transcripción y subtítulos nativos ocultos ────────────────
let status = null;
for (let i = 0; i < 20 && !/VTT capturado/.test(String(status?.status?.reason ?? '')); i += 1) {
	status = await tabMessage({ type: 'USG_GET_STATUS' });
	if (!/VTT capturado/.test(String(status?.status?.reason ?? ''))) await page.waitForTimeout(1000);
}
check('VTT oficial de la lección sembrado', /VTT capturado/.test(String(status?.status?.reason ?? '')) && (status?.status?.prefetchedCueCount ?? 0) > 0,
	`${status?.status?.prefetchMode ?? '?'} · cues=${status?.status?.prefetchedCueCount ?? 0}`);
const transcript = await tabMessage({ type: 'USG_GET_STUDY_TRANSCRIPT', maxChars: 4000 });
check('transcripción del estudio disponible', transcript?.ok === true && (transcript?.cueCount ?? 0) > 0,
	`${transcript?.source ?? '?'} · ${(String(transcript?.transcriptText ?? '')).length} chars`);
const nativeStyle = await page.evaluate(() => {
	const el = document.getElementById('usb-native-caption-hide-style');
	return el ? el.textContent ?? '' : null;
});
check('subtítulos nativos de fmplayer ocultos por el pipeline', Boolean(nativeStyle) && /vjs-text-track-cue/.test(nativeStyle) && /visibility:\s*hidden/.test(nativeStyle),
	(nativeStyle ?? '(sin estilo)').slice(0, 100));
check('cero llamadas a la API de Udemy desde master.dev', udemyApiCalls.length === 0, udemyApiCalls.slice(0, 2).join(' '));
await page.screenshot({ path: path.join(SHOTS, 'master-lesson.png') }).catch(() => {});

// ── 3. Total del curso desde kabuki, con source masterdev ─────────────────────
let totals = {};
for (let i = 0; i < 12; i += 1) {
	totals = (await localGet(['usb_course_totals'])).usb_course_totals ?? {};
	if (Object.values(totals).some((t) => t?.source === 'masterdev')) break;
	await page.waitForTimeout(1000);
}
const masterTotal = Object.entries(totals).find(([, t]) => t?.source === 'masterdev');
check('total del curso guardado con source masterdev', Boolean(masterTotal) && (masterTotal[1].total ?? 0) > 0,
	masterTotal ? `${masterTotal[0]}=${masterTotal[1].total}` : '(sin total)');

// ── 4. Learning paths: ambigüedad y elección explícita ────────────────────────
let programCtx = null;
for (let i = 0; i < 16 && !programCtx?.tracks?.length; i += 1) {
	programCtx = (await syncGet(['dc_program_context'])).dc_program_context ?? null;
	if (!programCtx?.tracks?.length) await page.waitForTimeout(1000);
}
check('programa con site masterdev y tracks reales', programCtx?.site === 'masterdev' && (programCtx?.tracks?.length ?? 0) >= 2,
	`site=${programCtx?.site ?? '?'} · tracks=${programCtx?.tracks?.map((t) => t.slug).join(', ') ?? '?'}`);
check('ambigüedad respetada: sin programa autoelegido', programCtx?.activeSlug === null && programCtx?.program === null,
	`activeSlug=${String(programCtx?.activeSlug)} program=${String(programCtx?.program ?? null)}`);
const chosen = programCtx?.tracks?.[0]?.slug ?? null;
if (chosen) {
	await sw.evaluate((slug) => new Promise((done) => chrome.storage.sync.set({ dc_active_track: slug }, () => done(null))), chosen);
	let program = null;
	for (let i = 0; i < 16; i += 1) {
		const c = (await syncGet(['dc_program_context'])).dc_program_context ?? null;
		if (c?.program?.slug === chosen) { program = c.program; break; }
		await page.waitForTimeout(1000);
	}
	check('la elección explícita carga el learning path', Boolean(program) && (program?.courses?.length ?? 0) > 0,
		`${program?.slug ?? '?'} · ${program?.courses?.length ?? 0} cursos`);
	check('progreso NO inventado (done y completionRate en null)', program?.courses?.every((c) => c.done === null) === true && program?.completionRate === null,
		`completionRate=${String(program?.completionRate)} · done=[${(program?.courses ?? []).map((c) => String(c.done)).join(',')}]`);
}

// ── 5. Toggle del dock y navegación real a la siguiente lección ───────────────
const hidden = await tabMessage({ type: 'TOGGLE_DOCK_VISIBILITY' });
await page.waitForTimeout(600);
// El host se deja en el DOM y se oculta con display:none (transición), no se retira.
const dockDisplay = () => page.evaluate((sel) => {
	const el = document.querySelector(sel);
	return el ? getComputedStyle(el).display : null;
}, OUTER);
check('toggle oculta el dock', hidden?.enabled === false && await dockDisplay() === 'none', `${JSON.stringify(hidden)} · display=${await dockDisplay()}`);
const shown = await tabMessage({ type: 'TOGGLE_DOCK_VISIBILITY' });
await page.waitForTimeout(600);
check('toggle vuelve a mostrar el dock', shown?.enabled === true && await dockDisplay() !== 'none', `${JSON.stringify(shown)} · display=${await dockDisplay()}`);

const nextButton = await page.evaluate(() => {
	const b = document.querySelector('button[data-nav-link="next"]:not([disabled]), button[aria-label="Next Lesson"]:not([disabled])');
	return b ? { label: b.getAttribute('aria-label') ?? '', href: b.closest('a')?.getAttribute('href') ?? '' } : null;
});
check('botón real de fmplayer para la siguiente lección', Boolean(nextButton), nextButton ? `${nextButton.label} ${nextButton.href}` : '(no encontrado)');
const before = page.url();
// El handler navega y avisa al dock con NEXT_LECTURE_RESULT; no hay sendResponse,
// así que la prueba real es la URL (y el contexto de abajo).
await tabMessage({ type: 'GO_TO_NEXT_LECTURE' });
let after = before;
for (let i = 0; i < 20 && after === before; i += 1) { await page.waitForTimeout(1000); after = page.url(); }
check('GO_TO_NEXT_LECTURE cambia de lección', after !== before && /\/courses\/ai-engineering\/[^/]+\/?$/.test(new URL(after).pathname),
	`${new URL(before).pathname} → ${new URL(after).pathname}`);
let lesson2 = '';
for (let i = 0; i < 20; i += 1) {
	lesson2 = String((await syncGet(['agent_lesson_name'])).agent_lesson_name ?? '');
	if (lesson2 && !/Connecting the Client-Side Tools/i.test(lesson2)) break;
	await page.waitForTimeout(1000);
}
check('el contexto sigue a la lección nueva', Boolean(lesson2) && !/Connecting the Client-Side Tools/i.test(lesson2), lesson2);

// ── 6. Fuera del área de lección: sin dock y layout recuperado ────────────────
await page.goto(PATH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
check('sin dock fuera del área de lección', await page.locator(OUTER).count() === 0);
const pathMargin = await page.evaluate(() => {
	const main = document.querySelector('main');
	return main ? getComputedStyle(main).marginRight : null;
});
check('sin dock, <main> recupera su margen', pathMargin === null || pathMargin === '0px', `margin-right=${pathMargin}`);
await page.screenshot({ path: path.join(SHOTS, 'master-learning-path.png') }).catch(() => {});

check('cero errores de runtime.lastError', lastErrors.length === 0, lastErrors.slice(0, 2).join(' | '));

// ── 7. Limpieza del perfil de QA ──────────────────────────────────────────────
await sw.evaluate(() => new Promise((done) => chrome.storage.sync.clear(() => done(null))));
await sw.evaluate(() => new Promise((done) => chrome.storage.local.clear(() => done(null))));

console.log(`\n${failures === 0 ? '✅' : '❌'} master.dev: ${failures === 0 ? 'todo OK' : `${failures} fallos`}`);
await context.close();
process.exit(failures === 0 ? 0 : 1);
