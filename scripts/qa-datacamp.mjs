/**
 * QA del adaptador de DataCamp: la app aparece SOLO en lecciones de vídeo,
 * monta contexto real (curso/lección), muestra el subtítulo oficial (español
 * sin IA) y sigue la hora del vídeo a través del relé del marco del projector.
 *
 * Uso: npm run qa:datacamp  (cookies reales en .qa-datacamp-cookies.json, git-ignorado)
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');
const PROFILE = path.join(repoRoot, 'chrome-datacamp-profile');
const SHOTS = path.join(repoRoot, 'tmp', 'datacamp-qa');
const OUTER = '[id^="usb-dock-host-"]';
const VIDEO_URL = 'https://app.datacamp.com/es/campus/courses/working-with-the-openai-api/introduction-to-the-openai-api?ex=1&skip_variants_modal=true';
const CHAT_URL = 'https://app.datacamp.com/es/campus/courses/working-with-the-openai-api/introduction-to-the-openai-api?ex=2';
const VIDEO2_URL = 'https://app.datacamp.com/es/campus/courses/working-with-the-openai-api/introduction-to-the-openai-api?ex=4';
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const check = (name, ok, detail = '') => {
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`);
	if (!ok) failures += 1;
};

try { execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*chrome-datacamp-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' }); } catch {}

if (!existsSync('.qa-datacamp-cookies.json')) {
	console.log('✗ falta .qa-datacamp-cookies.json (cookies reales de sesión DataCamp)');
	process.exit(1);
}

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

// Contexto limpio: el perfil es persistente y el relleno automático respeta lo
// que ya está escrito; sin esta limpieza el QA no sería determinista.
{
	const sw0 = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	if (sw0) {
		await sw0.evaluate(() => new Promise((done) => chrome.storage.sync.remove(
			['agent_course_name', 'agent_lesson_name', 'agent_lesson_autofill_key', 'agent_lesson_autofill_value'],
			() => done(null),
		)));
	}
}

const shadowText = () => page.evaluate(() => {
	const host = document.querySelector('[id^="usb-dock-host-"]');
	const root = host?.shadowRoot;
	if (!root) return '';
	const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (n) => (n.parentElement?.tagName === 'STYLE' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
	});
	let out = '';
	while (w.nextNode()) out += w.currentNode.textContent ?? '';
	return out.replace(/\s+/g, ' ');
});

const overlayText = () => page.evaluate(() => document.querySelector('#usb-overlay')?.textContent?.trim() ?? '');

const storageViaSw = async (keys) => {
	const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	if (!sw) return null;
	return sw.evaluate((ks) => new Promise((done) => chrome.storage.sync.get(ks, (r) => done(r))), keys);
};

// ── 1. Lección de vídeo: dock + contexto ──────────────────────────────────────
await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
let dockShown = false;
for (let i = 0; i < 25; i += 1) {
	dockShown = await page.locator(OUTER).count() > 0;
	if (dockShown) break;
	await page.waitForTimeout(1000);
}
check('la lección de vídeo monta el dock', dockShown);
const proj = await page.locator('iframe[src*="projector.datacamp.com"]').count();
check('la lección de vídeo es un iframe del projector', proj === 1);

let ctx = null;
for (let i = 0; i < 12 && !ctx?.agent_course_name; i += 1) {
	ctx = await storageViaSw(['agent_course_name', 'agent_lesson_name']);
	if (ctx?.agent_course_name) break;
	await page.waitForTimeout(1500);
}
check('curso real en el contexto', /openai api|api de openai/i.test(String(ctx?.agent_course_name ?? '')), String(ctx?.agent_course_name ?? '(vacío)'));
check('lección real en el contexto', /API de OpenAI|OpenAI API/i.test(String(ctx?.agent_lesson_name ?? '')), String(ctx?.agent_lesson_name ?? '(vacío)'));

// ── 2. Subtítulo en español, sin IA (curso doblado) ───────────────────────────
let esShown = false;
let firstText = '';
let lastText = '';
for (let i = 0; i < 40; i += 1) {
	const t = await overlayText();
	if (i === 0) firstText = t;
	if (t) lastText = t;
	if (/[\u00bf¡]|curso|API|OpenAI/i.test(t)) { esShown = true; break; }
	await page.waitForTimeout(750);
}
check('el overlay muestra subtítulo', esShown || lastText.length > 0, `texto: «${(lastText || '(vacío)').slice(0, 70)}»`);
check('el subtítulo está en español', /[\u00bf¡ñáéíóú]|del |curso /i.test(lastText), `«${lastText.slice(0, 60)}»`);

// El relé del marco: dar play (DataCamp manda auto_play=pause) y esperar a que
// la hora avance → el texto del overlay cambia.
const projFrame = page.frames().find((f) => f.url().includes('projector.datacamp.com'));
let played = false;
if (projFrame) {
	played = await projFrame.evaluate(() => {
		const btn = document.querySelector('.vjs-big-play-button')
			?? [...document.querySelectorAll('button')].find((b) => /play/i.test(b.getAttribute('aria-label') ?? ''));
		btn?.click();
		return Boolean(btn);
	}).catch(() => false);
}
let changed = false;
const t0 = await overlayText();
for (let i = 0; i < 25 && !changed; i += 1) {
	await page.waitForTimeout(1000);
	const t = await overlayText();
	if (t && t !== t0) changed = true;
}
check('el vídeo recibe play', played);
check('la hora del vídeo llega por el relé (los cues avanzan)', changed, `«${t0.slice(0, 40)}» → «${(await overlayText()).slice(0, 40)}»`);

// Transcripción para el flujo de estudio (mismo canal que Udemy).
const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
if (sw) {
	const transcript = await sw.evaluate(async ({ tabUrl }) => {
		const tab = await new Promise((done) => chrome.tabs.query({ url: `${tabUrl.split('?')[0]}*` }, (tabs) => done(tabs?.[0] ?? null)));
		if (!tab) return null;
		return new Promise((done) => chrome.tabs.sendMessage(tab.id, { type: 'USG_GET_STUDY_TRANSCRIPT', payload: { maxChars: 4000 } }, (r) => {
			void chrome.runtime.lastError;
			done(r ?? null);
		}));
	}, { tabUrl: page.url() }).catch(() => null);
	const text = String(transcript?.transcriptText ?? transcript?.payload?.text ?? '');
	check('transcripción del estudio disponible', Boolean(transcript?.ok) && (transcript?.cueCount ?? 0) > 0, `${text.length} chars`);
	check('la transcripción es el contenido de la lección', /OpenAI|API/i.test(text), text.slice(0, 90));
} else {
	check('transcripción del estudio disponible', false, 'sin service worker');
}
await page.screenshot({ path: path.join(SHOTS, 'datacamp-video-ex1.png') }).catch(() => {});

// ── 3. Lección que NO es vídeo: el dock desaparece ────────────────────────────
await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
const dockOnChat = await page.locator(OUTER).count();
const projOnChat = await page.locator('iframe[src*="projector.datacamp.com"]').count();
check('sin iframe del projector en ejercicio de chat', projOnChat === 0);
check('el dock NO aparece fuera de la zona de vídeo', dockOnChat === 0);
await page.screenshot({ path: path.join(SHOTS, 'datacamp-chat-ex2.png') }).catch(() => {});

// ── 4. Otra lección de vídeo: el dock vuelve con su contexto ──────────────────
await page.goto(VIDEO2_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
let dockBack = false;
for (let i = 0; i < 20; i += 1) {
	dockBack = await page.locator(OUTER).count() > 0;
	if (dockBack) break;
	await page.waitForTimeout(1000);
}
check('el dock vuelve en otra lección de vídeo', dockBack);
let lesson2 = '';
for (let i = 0; i < 10; i += 1) {
	lesson2 = String((await storageViaSw(['agent_lesson_name']))?.agent_lesson_name ?? '');
	if (lesson2) break;
	await page.waitForTimeout(1500);
}
check('el contexto cambia a la lección nueva', !/¿Qué es la API/i.test(lesson2) && lesson2.length > 0, lesson2.slice(0, 60));
await page.screenshot({ path: path.join(SHOTS, 'datacamp-video-ex4.png') }).catch(() => {});

console.log(`\n${failures === 0 ? '✅' : '❌'} DataCamp: ${failures === 0 ? 'todo OK' : `${failures} fallos`}`);
clearTimeout?.();
await context.close();
process.exit(failures === 0 ? 0 : 1);
