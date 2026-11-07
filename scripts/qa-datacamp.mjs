/**
 * QA del adaptador de DataCamp: dock SOLO en lecciones de vídeo y DENTRO del
 * layout (sin sobrepone), contexto real, doblaje ES → overlay desactivado por
 * defecto (encendido a mano: cues que avanzan por el relé del marco),
 * redimensionado que sobrevive a cruzar el iframe del vídeo, y transcripción
 * del estudio.
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

const overlayText = () => page.evaluate(() => document.querySelector('#usb-overlay')?.textContent?.trim() ?? '');
const overlayHidden = () => page.evaluate(() => {
	const el = document.querySelector('#usb-overlay');
	if (!el) return true;
	const cs = getComputedStyle(el);
	return cs.display === 'none' || cs.visibility === 'hidden' || (el.textContent ?? '').trim() === '';
});

const storageViaSw = async (keys) => {
	const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
	if (!sw) return null;
	return sw.evaluate((ks) => new Promise((done) => chrome.storage.sync.get(ks, (r) => done(r))), keys);
};

// ── 1. Lección de vídeo: dock DENTRO del layout + contexto ────────────────────
await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
let dockShown = false;
for (let i = 0; i < 25; i += 1) {
	dockShown = await page.locator(OUTER).count() > 0;
	if (dockShown) break;
	await page.waitForTimeout(1000);
}
check('la lección de vídeo monta el dock', dockShown);

const layout = await page.evaluate(() => {
	const main = document.querySelector('main');
	const host = document.querySelector('[id^="usb-dock-host-"]');
	if (!main || !host) return null;
	const m = main.getBoundingClientRect();
	const h = host.getBoundingClientRect();
	return { mainRight: Math.round(m.right), dockLeft: Math.round(h.left), margin: getComputedStyle(main).marginRight };
});
check('el dock NO se sobrepone: <main> estrechado al lado del dock',
	Boolean(layout) && layout.mainRight <= layout.dockLeft + 2,
	`main.right=${layout?.mainRight} vs dock.left=${layout?.dockLeft} · margin-right=${layout?.margin}`);

let ctx = null;
for (let i = 0; i < 12 && !ctx?.agent_course_name; i += 1) {
	ctx = await storageViaSw(['agent_course_name', 'agent_lesson_name']);
	if (ctx?.agent_course_name) break;
	await page.waitForTimeout(1500);
}
check('curso real en el contexto', /openai api|api de openai/i.test(String(ctx?.agent_course_name ?? '')), String(ctx?.agent_course_name ?? '(vacío)'));
check('lección real en el contexto', /API de OpenAI|OpenAI API/i.test(String(ctx?.agent_lesson_name ?? '')), String(ctx?.agent_lesson_name ?? '(vacío)'));

// ── 2. Doblaje al español: overlay DESACTIVADO por defecto ────────────────────
const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
let status = null;
if (sw) {
	const tabId = await sw.evaluate(() => new Promise((done) => chrome.tabs.query({ url: 'https://app.datacamp.com/*' }, (t) => done(t?.[0]?.id ?? null))));
	for (let i = 0; i < 12 && !status?.status?.reason; i += 1) {
		status = await sw.evaluate(async (id) => new Promise((done) => chrome.tabs.sendMessage(id, { type: 'USG_GET_STATUS' }, (r) => {
			void chrome.runtime.lastError;
			done(r ?? null);
		})), tabId).catch(() => null);
		if (!status?.status?.reason) await page.waitForTimeout(1500);
	}
	check('el motivo dice que está doblado (subtítulos sin sentido aquí)', /doblaj|doblado/i.test(String(status?.status?.reason ?? '')), String(status?.status?.reason ?? '(sin motivo)'));
	check('el overlay está desactivado en el estado', status?.status?.overlayEnabled === false);
}
let hidden = true;
for (let i = 0; i < 16; i += 1) {
	hidden = await overlayHidden();
	if (hidden) break;
	await page.waitForTimeout(750);
}
check('ningún subtítulo pintado sobre el vídeo doblado', hidden);

// Optar por subtítulos a mano: aparecen (español oficial) y avanzan con el
// relé del marco — la hora del vídeo llega del iframe del projector.
await page.frames().find((f) => f.url().includes('projector.datacamp.com'))?.evaluate(() => {
	// muted + play(): el autoplay con sonido depende de la política del
	// navegador; silenciado siempre está permitido y da la hora que el test
	// necesita. Un usuario real pulsa play con su gesto.
	const video = document.querySelector('video');
	if (video) {
		video.muted = true;
		video.play?.().catch(() => {});
	}
}).catch(() => {});
if (sw) {
	await sw.evaluate(async () => {
		const id = await new Promise((done) => chrome.tabs.query({ url: 'https://app.datacamp.com/*' }, (t) => done(t?.[0]?.id ?? null)));
		await new Promise((done) => chrome.tabs.sendMessage(id, { type: 'USG_SET_OVERLAY_ENABLED', payload: { enabled: true } }, () => {
			void chrome.runtime.lastError;
			done(null);
		}));
	}).catch(() => {});
}
let esShown = '';
for (let i = 0; i < 24 && !esShown; i += 1) {
	esShown = await overlayText();
	await page.waitForTimeout(750);
}
check('con el overlay encendido a mano, subtítulo en español', /[\u00bf¡ñ]|del |curso /i.test(esShown), `«${esShown.slice(0, 60)}»`);
let changed = false;
const t0 = esShown;
for (let i = 0; i < 25 && !changed; i += 1) {
	await page.waitForTimeout(1000);
	const t = await overlayText();
	if (t && t !== t0) changed = true;
}
check('la hora del vídeo llega por el relé (los cues avanzan)', changed, `«${t0.slice(0, 36)}» → «${(await overlayText()).slice(0, 36)}»`);
await page.screenshot({ path: path.join(SHOTS, 'datacamp-video-ex1.png') }).catch(() => {});

// ── 3. Transcripción del estudio (mismo canal que Udemy) ─────────────────────
if (sw) {
	const transcript = await sw.evaluate(async () => {
		const id = await new Promise((done) => chrome.tabs.query({ url: 'https://app.datacamp.com/*' }, (t) => done(t?.[0]?.id ?? null)));
		return new Promise((done) => chrome.tabs.sendMessage(id, { type: 'USG_GET_STUDY_TRANSCRIPT', maxChars: 4000 }, (r) => {
			void chrome.runtime.lastError;
			done(r ?? null);
		}));
	}).catch(() => null);
	const text = String(transcript?.transcriptText ?? '');
	check('transcripción del estudio disponible', Boolean(transcript?.ok) && (transcript?.cueCount ?? 0) > 0, `${text.length} chars`);
	check('la transcripción es el contenido de la lección', /OpenAI|API/i.test(text), text.slice(0, 90));
}

// ── 4. Redimensionado: ampliar → reducir → ampliar (el flujo del usuario) ────
{
	const handlePos = () => page.evaluate(() => {
		const host = document.querySelector('[id^="usb-dock-host-"]');
		const handle = [...host.shadowRoot.querySelectorAll('*')].find((e) => (e.getAttribute('title') ?? '') === 'Arrastrar para redimensionar');
		const r = handle.getBoundingClientRect();
		return { w: Math.round(host.getBoundingClientRect().width), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
	});
	const start = await handlePos();
	// Ampliar primero: el arrastre hacia la izquierda CRUZA el iframe del vídeo.
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	for (let i = 1; i <= 10; i += 1) await page.mouse.move(start.x - i * 12, start.y);
	await page.mouse.up();
	await page.waitForTimeout(400);
	const widened = await handlePos();
	check('ampliar el dock funciona (captura de puntero sobre el iframe)', widened.w > start.w + 60, `${start.w} → ${widened.w}`);
	// Reducir desde la posición ACTUAL del asa.
	await page.mouse.move(widened.x, widened.y);
	await page.mouse.down();
	for (let i = 1; i <= 8; i += 1) await page.mouse.move(widened.x + i * 12, widened.y);
	await page.mouse.up();
	await page.waitForTimeout(400);
	const reduced = await handlePos();
	check('reducir después funciona', reduced.w < widened.w, `${widened.w} → ${reduced.w}`);
	// Y volver a ampliar (el bug reportado: quedaba clavado tras reducir).
	await page.mouse.move(reduced.x, reduced.y);
	await page.mouse.down();
	for (let i = 1; i <= 10; i += 1) await page.mouse.move(reduced.x - i * 12, reduced.y);
	await page.mouse.up();
	await page.waitForTimeout(400);
	const regrown = await handlePos();
	check('volver a ampliar tras reducir funciona', regrown.w > reduced.w + 60, `${reduced.w} → ${regrown.w}`);
}

// ── 5. Lección que NO es vídeo: el dock desaparece y el layout se recupera ────
await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
check('el dock NO aparece fuera de la zona de vídeo', await page.locator(OUTER).count() === 0);
const chatLayout = await page.evaluate(() => {
	const main = document.querySelector('main');
	return main ? getComputedStyle(main).marginRight : null;
});
check('sin dock, <main> recupera su margen', chatLayout === '0px', `margin-right=${chatLayout}`);
await page.screenshot({ path: path.join(SHOTS, 'datacamp-chat-ex2.png') }).catch(() => {});

// ── 6. Otra lección de vídeo: el dock vuelve con su contexto ──────────────────
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
await context.close();
process.exit(failures === 0 ? 0 : 1);
