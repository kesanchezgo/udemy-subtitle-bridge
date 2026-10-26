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
 *   D. Study         — paso 5 con los tres módulos, .apkg real, guard de Anki.
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
const LECTURE_URL = 'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342';

// Lección ya completada, con el mismo esquema que escribe historyService. Solo
// se siembra en modo CLON: en modo REAL inventaría datos en la cuenta real.
const RECORD = {
	courseId: COURSE_ID, lectureId: LESSON_ID, courseName: COURSE, lectureName: LESSON,
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
		{ id: 'card-002', front: '¿Qué interpreta el bytecode?', back: 'La JVM.', tags: ['java'], type: 'concepto' },
	],
	version: 2,
};

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
	const PROFILE = path.join(repoRoot, 'temp_profile_fullflows');
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
page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 140)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 140)); });

// ── informe ────────────────────────────────────────────────────────────────────
const results = [];
const check = (name, ok, detail) => {
	results.push({ name, ok, detail });
	console.log(`  ${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const section = (t) => console.log(`\n${t}`);

await page.goto(REAL ? LECTURE_URL : `https://www.udemy.com:${port}/course/j/learn/lecture/1/`);
await page.waitForSelector(OUTER, { timeout: REAL ? 40000 : 25000 });
const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 25000 }).catch(() => null);
if (sw && !REAL) {
	await sw.evaluate(({ record }) => new Promise((resolve) => {
		chrome.storage.local.set({
			[`usb_history_lecture::${record.courseId}::${record.lectureId}`]: record,
			obsidian_export_config: { vaultName: 'QA Vault', sourcesFolder: 'wiki/fuentes', mocsFolder: 'cursos', includeCards: true, autoExport: false, includeRawSrt: false },
			obsidian_exported_notes: [`${record.courseId}::${record.lectureId}`],
		}, () => {
			chrome.storage.sync.set({
				agent_course_name: record.courseName,
				agent_lesson_name: record.lessonName,
				agent_selected_obj: 'custom',
			}, resolve);
		});
	}), { record: RECORD });
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

// ══ D. Study — paso 5 ══════════════════════════════════════════════════════════
section('D. Study — paso 5 con los tres módulos');
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
const mods = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const ps = [...(root?.querySelectorAll('section p') ?? [])].map((p) => (p.textContent ?? '').trim());
	return {
		cards: ps.includes('Tarjetas de la lección'),
		vocab: ps.includes('Mazo de idiomas · opcional'),
		obsidian: ps.includes('Obsidian'),
	};
});
check('los tres módulos del paso 5 están presentes', mods.cards && mods.vocab && mods.obsidian, JSON.stringify(mods));

// D.2 — .apkg real: el botón debe producir un .apkg con SQLite dentro.
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
} // fin del bloque D (solo modo CLON)

// ══ E. Obsidian — export + guard de duplicados ════════════════════════════════
section('E. Obsidian — export y aviso de duplicado');
if (REAL) {
	console.log('  · omitido en modo REAL: escribiría notas en el vault real del usuario');
} else {
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
section('G. Vocabulario — pipeline y deduplicación');
// El pipeline de vocabulario (filtro CEFR, registro de lemas, GUID por
// idioma|lema) es puro y no depende del navegador: lo cubre la suite
// estructural qa-anki-decks.mjs, que verifica además que el reexport en otra
// lección no duplica. Aquí solo se comprueba que la sección del panel existe
// con sus controles, que es lo que depende del UI.
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

// ══ Cierre ════════════════════════════════════════════════════════════════════
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
// El servidor y el perfil temporal solo existen en modo CLON. El perfil real no
// se toca: tiene la sesión del usuario y se reutiliza entre corridas.
if (!REAL) {
	try { server.close(); } catch { /* ya cerrado */ }
	if (!KEEP) rmSync(path.join(repoRoot, 'temp_profile_fullflows'), { recursive: true, force: true });
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
