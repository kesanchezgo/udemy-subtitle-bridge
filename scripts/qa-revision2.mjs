/**
 * Verificación dirigida a las dos correcciones de la revisión 2:
 *
 *   A. Deep-link de Ajustes: los botones «Ajustar» del panel de vocabulario y
 *      de Obsidian deben abrir la hoja de Configuración Y su sección, tanto con
 *      la hoja cerrada como ya abierta. Antes había una segunda ruta
 *      (usb:section-request → localStorage → usb:section-applied) que nadie
 *      escuchaba: la sección nunca se abría.
 *
 *   B. Sepia: los controles de Configuración deben tener piel propia
 *      (kx-field, kx-danger-btn, kx-choice seleccionada, stepper, escala,
 *      picker) y los toasts deben flotar por encima (position:fixed + z-index).
 *      Se comprueba por estilo COMPUTADO, no por captura, para que un CSS
 *      ausente falle la prueba en vez de pasar desapercibido.
 *
 * No depende de la IA: siembre una sesión del historial ya completada.
 *
 * Uso: node scripts/qa-revision2.mjs
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
const SHOT_DIR = path.join(repoRoot, 'tmp', 'revision2');
const COURSE = 'Java In-Depth: Become a Complete Java Engineer! [2026]';
const LESSON = '8. Platform Dependency + Demo';

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
if (!existsSync(key)) {
	mkdirSync(dir, { recursive: true });
	spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=udemy.com'], { stdio: 'pipe' });
}
const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
	if (req.url?.endsWith('q.vtt')) { res.writeHead(200, { 'Content-Type': 'text/vtt' }); res.end(VTT); return; }
	res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE);
});
let port = 4460;
server.on('error', () => { port += 1; if (port < 4480) server.listen(port, '127.0.0.1'); });
await new Promise((r) => server.listen(port, '127.0.0.1', r));

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
	ankiCards: [{ id: 'card-001', front: '¿Qué produce javac?', back: 'Bytecode.', tags: ['java'], type: 'concepto' }],
	version: 2,
};

const PROFILE = path.join(repoRoot, 'temp_profile_rev2');
rmSync(PROFILE, { recursive: true, force: true });
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

await page.goto(`https://www.udemy.com:${port}/course/j/learn/lecture/1/`);
await page.waitForSelector(OUTER, { timeout: 20000 });
// La ruta muerta escribía en localStorage: arrancar sin ella, para que la
// comprobación A.4 mida lo que hace ESTA corrida.
await page.evaluate(() => { try { localStorage.removeItem('kinema_settings_open_section'); } catch {} });
const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
if (sw) {
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
	}), { record });
	await page.reload();
	await page.waitForSelector(OUTER, { timeout: 20000 });
	await page.waitForTimeout(1800);
}
await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1500);
mkdirSync(SHOT_DIR, { recursive: true });
await page.locator(`${OUTER} button:has-text("Study")`).first().click().catch(() => {});
await page.waitForTimeout(1200);

// ── helpers dentro de la página ───────────────────────────────────────────────
const sr = () => page.evaluateHandle(() => document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot);

/** Estado de la hoja de Ajustes + qué sección está abierta. */
const settingsState = () => page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const sheet = root?.querySelector('section[aria-label="Configuración de Kinema"]');
	if (!sheet) return { mounted: false, open: null, section: null, text: '' };
	// Sección abierta: la cuyo botón de cabecera tiene aria-expanded=true (el
	// cuerpo se colapsa por altura, así que su display no es fiable).
	const headers = [...sheet.querySelectorAll('section.kx-settings-section')];
	const openHeader = headers.find((s) => s.querySelector('button[aria-expanded="true"]'));
	return {
		mounted: true,
		open: sheet.getAttribute('aria-hidden') !== 'true' && getComputedStyle(sheet).visibility !== 'hidden',
		section: openHeader?.getAttribute('aria-label') ?? null,
		text: (sheet.innerText ?? '').slice(0, 80),
	};
});

let failures = 0;
const check = (n, ok, extra) => { if (ok) console.log('  ✓', n); else { failures += 1; console.error('  ✗', n, extra ?? ''); } };

// ── A. Deep-link desde el panel de vocabulario («Ajustar» → sección idiomas) ──
console.log('\n▶ Deep-link A: vocabulario → Ajustes con hoja CERRADA');
// Cerrar la hoja primero si estuviera abierta.
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
await page.waitForTimeout(400);
const before = await settingsState();
check('hoja cerrada al empezar', !before.open, JSON.stringify(before));

await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'vocabulary' } })));
await page.waitForTimeout(900);
const afterClosed = await settingsState();
check('la hoja se abrió', afterClosed.open, JSON.stringify(afterClosed));
check('la sección Mazo de idiomas quedó abierta',
	/vocabulary|idiomas|Mazo de idiomas/i.test(afterClosed.section ?? '') ,
	`sections=${JSON.stringify(afterClosed.section)}`);

// ── A.2 mismo deep-link con la hoja YA ABIERTA ────────────────────────────────
console.log('\n▶ Deep-link A.2: mismo evento con la hoja ya abierta');
// Dejar otra sección abierta para que el cambio sea observable.
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'cache' } })));
await page.waitForTimeout(700);
const other = await settingsState();
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'vocabulary' } })));
await page.waitForTimeout(900);
const afterOpen = await settingsState();
check('la sección cambió con la hoja abierta',
	other.section !== afterOpen.section && /vocabulary|idiomas/i.test(afterOpen.section ?? ''),
	`otra=${JSON.stringify(other.section)} → nueva=${JSON.stringify(afterOpen.section)}`);

// ── A.3 el botón «Ajustar» real de Obsidian ────────────────────────────────────
console.log('\n▶ Deep-link A.3: botón «Ajustar» de Obsidian (clic real)');
// Cerrar la hoja primero: así «abre la hoja» mide de verdad el clic y no un
// estado heredado de A.2. También deja el acordeón en vocabulary a propósito.
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
await page.waitForTimeout(600);
const preA3 = await settingsState();
check('hoja cerrada antes del clic de Obsidian', !preA3.open, JSON.stringify(preA3));
const obsidianAdjust = page.locator(`${OUTER} section`).filter({
	has: page.locator('p', { hasText: /^Obsidian$/ }),
}).locator('button', { hasText: /Ajustar/ }).last();
const adjustCount = await obsidianAdjust.count().catch(() => 0);
if (adjustCount > 0) {
	const home = await obsidianAdjust.evaluate((el) => {
		const sec = el.closest('section[id], section.kx-page, section.kx-settings-section, section[aria-label]');
		return {
			label: sec?.getAttribute('aria-label') ?? null,
			inSheet: Boolean(el.closest('section[aria-label="Configuración de Kinema"]')),
		};
	}).catch(() => null);
	console.log('   «Ajustar» vive en:', JSON.stringify(home));
	await obsidianAdjust.scrollIntoViewIfNeeded().catch(() => {});
	await page.waitForTimeout(300);
	await obsidianAdjust.click({ timeout: 8000, force: true }).catch(async () => {
		const b = await obsidianAdjust.boundingBox();
		if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { force: true });
	});
	await page.waitForTimeout(1200);
	const obsState = await settingsState();
	check('«Ajustar» de Obsidian abre la hoja', obsState.open, JSON.stringify(obsState));
	check('«Ajustar» de Obsidian abre su sección',
		/obsidian/i.test(obsState.section ?? ''),
		`seccion=${JSON.stringify(obsState.section)}`);
	await page.screenshot({ path: path.join(SHOT_DIR, 'deeplink-obsidian.png') });
} else {
	console.log('   · sin botón «Ajustar» visible en Obsidian (skip)');
}

// ── A.4 la ruta muerta fue eliminada ──────────────────────────────────────────
console.log('\n▶ Deep-link A.4: la segunda ruta fue eliminada');
// La ruta muerta (usb:section-request → localStorage → usb:section-applied)
// escribía la clave en un useEffect de SettingsSheet, sin que el usuario
// abriera nada. Comprobación: borrar la clave, cerrar la hoja, reabrirla por el
// botón de configuración SIN sección, y verificar que la clave NO se reescribe
// por arte de magia (solo setOpenId del acordeón debe tocarla, y nadie llama).
await page.evaluate(() => { try { localStorage.removeItem('kinema_settings_open_section'); } catch {} });
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
await page.waitForTimeout(400);
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings')));
await page.waitForTimeout(1000);
const keyAfterNoSection = await page.evaluate(() => localStorage.getItem('kinema_settings_open_section'));
check('abrir sin sección no escribe la clave por la ruta muerta', keyAfterNoSection === null, `clave=${JSON.stringify(keyAfterNoSection)}`);

// ── B. Sepia por estilo computado ─────────────────────────────────────────────
console.log('\n▶ Sepia: controles de Configuración con piel propia');
await page.evaluate(() => { try { localStorage.setItem('usb_theme', 'sepia'); } catch {} });
await page.reload();
await page.waitForSelector(OUTER, { timeout: 20000 });
await page.waitForTimeout(2500);
await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(800);
// Abrir Ajustes y la sección de vocabulario, que es donde viven el stepper, la
// escala CEFR y el picker de idioma (y el campo del mazo raíz).
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'vocabulary' } })));
await page.waitForTimeout(1400);
const sheetReady = await settingsState();
console.log('   hoja:', JSON.stringify(sheetReady));

const sepia = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const dock = root?.querySelector('.usb-dock');
	const isSepia = dock?.classList.contains('dock-sepia') ?? false;
	// Probar dentro de la sección de vocabulario abierta (los controles del
	// stepper/escala/picker solo existen montados ahí).
	const vocab = [...(root?.querySelectorAll('section.kx-settings-section') ?? [])]
		.find((s) => /vocabulary|idiomas/i.test(s.getAttribute('aria-label') ?? ''))
		?? root;
	const probe = (sel) => {
		const el = vocab.querySelector(sel);
		if (!el) return null;
		const cs = getComputedStyle(el);
		return {
			bg: cs.backgroundColor,
			color: cs.color,
			border: cs.borderColor,
			// El ancho es lo que 'border: 0' anula: borderColor sigue heredado.
			borderWidth: cs.borderTopWidth,
			borderBottomWidth: cs.borderBottomWidth,
			shadow: cs.boxShadow.slice(0, 60),
		};
	};
	return {
		isSepia,
		field: probe('.kx-field'),
		dangerBtn: probe('.kx-danger-btn'),
		dangerText: probe('.kx-danger-text'),
		stepperInput: probe('.kx-stepper-input'),
		scale: probe('.kx-scale'),
		scaleBtnOn: probe('.kx-scale-btn[data-on="1"]'),
		choiceOn: probe('.kx-tile-btn.kx-choice[data-on="1"]'),
		tileOn: probe('.kx-tile-btn:not(.kx-choice)[data-on="1"]'),
	};
});
console.log('   estado sepia:', JSON.stringify(sepia).slice(0, 400));

check('el dock está en sepia', sepia.isSepia === true);
// Campo: fondo blanco y texto casi negro (no transparente/heredado).
if (sepia.field) {
	check('kx-field tiene fondo blanco en sepia', /^rgb\(255,\s*255,\s*255\)/.test(sepia.field.bg), sepia.field.bg);
	check('kx-field tiene texto oscuro en sepia', /^rgb\(26,\s*25,\s*34\)/.test(sepia.field.color), sepia.field.color);
} else { console.log('   · sin .kx-field visible ahora (skip campo)'); }
if (sepia.dangerBtn) {
	check('kx-danger-btn en rojo sobre tinte', /rgba?\(225,\s*29,\s*72/.test(sepia.dangerBtn.border) && /rgb\(190,\s*18,\s*60\)/.test(sepia.dangerBtn.color), `${sepia.dangerBtn.color} / ${sepia.dangerBtn.border}`);
} else { console.log('   · sin .kx-danger-btn visible ahora (skip peligro)'); }
if (sepia.dangerText) {
	check('kx-danger-text en rojo', /rgb\(190,\s*18,\s*60\)/.test(sepia.dangerText.color), sepia.dangerText.color);
}
if (sepia.stepperInput) {
	check('kx-stepper-input sin fondo y sin borde visible',
		sepia.stepperInput.bg === 'rgba(0, 0, 0, 0)'
		&& sepia.stepperInput.borderWidth === '0px' && sepia.stepperInput.borderBottomWidth === '0px',
		`bg=${sepia.stepperInput.bg} border=${sepia.stepperInput.borderWidth} shadow=${sepia.stepperInput.shadow}`);
} else { console.log('   · sin .kx-stepper-input visible ahora (skip stepper)'); }
if (sepia.scale) {
	check('kx-scale con fondo blanco en sepia', /^rgb\(255,\s*255,\s*255\)/.test(sepia.scale.bg), sepia.scale.bg);
}
if (sepia.choiceOn) {
	check('kx-choice seleccionada TINTADA (no violeta sólido)',
		!/rgb\(109,\s*74,\s*255\)/.test(sepia.choiceOn.bg) && /rgba?\(109,\s*74,\s*255/.test(sepia.choiceOn.bg),
		sepia.choiceOn.bg);
	check('kx-choice seleccionada con texto violeta oscuro', /rgb\(63,\s*37,\s*196\)/.test(sepia.choiceOn.color), sepia.choiceOn.color);
} else { console.log('   · sin .kx-choice seleccionada visible ahora (skip opción)'); }

// ── B.1b kx-choice CEFR seleccionada en la sección de idiomas ─────────────────
// Los chips A1..C2 son kx-tile-btn.kx-choice; uno (el nivel) está data-on="1".
const cefr = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const on = root?.querySelector('.kx-tile-btn.kx-choice[data-on="1"]');
	const off = root?.querySelector('.kx-tile-btn.kx-choice:not([data-on="1"])');
	const read = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color, border: cs.borderColor }; };
	return { on: read(on), off: read(off) };
});
console.log('   CEFR:', JSON.stringify(cefr));
if (cefr.on) {
	check('opción CEFR activa tintada (no violeta sólido)',
		!/rgb\(109,\s*74,\s*255\)/.test(cefr.on.bg) && /109,\s*74,\s*255/.test(cefr.on.bg),
		cefr.on.bg);
	check('opción CEFR activa con texto violeta oscuro', /rgb\(63,\s*37,\s*196\)/.test(cefr.on.color), cefr.on.color);
} else { console.log('   · sin opción CEFR activa (skip)'); }

// ── B.2 Toaster sobre el vídeo y el dock ─────────────────────────────────────
console.log('\n▶ Sepia: toaster con position:fixed y z-index máximo');
const toasterCss = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	// El <ol> solo existe con toasts presentes. Si no hay toast, leer la regla
	// del <style> de THEME_CSS (el que contiene '.usb-dock'), no el de sonner.
	const ol = root?.querySelector('ol[data-sonner-toaster]');
	if (ol) {
		const cs = getComputedStyle(ol);
		return { source: 'element', position: cs.position, zIndex: cs.zIndex, width: cs.width };
	}
	const sheets = [...(root?.querySelectorAll('style') ?? [])].map((s) => s.textContent ?? '');
	const themeCss = sheets.find((t) => t.includes('.usb-dock') && t.includes('dock-sepia')) ?? '';
	const m = themeCss.match(/\.usb-dock \[data-sonner-toaster\][^}]*}/);
	return { source: 'rule', rule: m ? m[0].slice(0, 220) : '(no encontrada)' };
});
console.log('   toaster:', JSON.stringify(toasterCss).slice(0, 260));
if (toasterCss.source === 'element') {
	check('toaster position:fixed', toasterCss.position === 'fixed', toasterCss.position);
	check('toaster z-index máximo', Number(toasterCss.zIndex) >= 2147483647, String(toasterCss.zIndex));
} else {
	check('la regla del toaster fuerza fixed', /position:\s*fixed/.test(toasterCss.rule ?? ''), toasterCss.rule);
	check('la regla del toaster fija z-index máximo', /2147483647/.test(toasterCss.rule ?? ''), toasterCss.rule);
}

await page.screenshot({ path: path.join(SHOT_DIR, 'sepia-ajustes.png') });
await page.screenshot({ path: path.join(SHOT_DIR, 'sepia-panel-completo.png'), fullPage: false });

// ── B.2 kx-danger-btn en la confirmación de borrado del Historial ─────────────
console.log('\n▶ Sepia: botón de peligro (borrado en Historial)');
await page.evaluate(() => { try { localStorage.removeItem('kinema_settings_open_section'); } catch {} });
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
await page.waitForTimeout(500);
// Volver a Study y abrir el Historial (icono de historial en la cabecera).
const historyBtn = page.locator(`${OUTER} button`).filter({ has: page.locator('svg') }).filter({ hasText: '' });
await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:history-open')));
await page.waitForTimeout(900);
const danger = await page.evaluate(() => {
	const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const btn = root?.querySelector('.kx-danger-btn');
	const txt = root?.querySelector('.kx-danger-text');
	const read = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color, border: cs.borderColor }; };
	return { btn: read(btn), text: read(txt), hasPanel: Boolean(root?.innerText?.includes('Historial')) };
});
console.log('   peligro:', JSON.stringify(danger));
if (danger.btn) {
	check('kx-danger-btn rojo sobre tinte translúcido',
		/rgb\(190,\s*18,\s*60\)/.test(danger.btn.color) && /rgba?\(225,\s*29,\s*72/.test(danger.btn.bg),
		`color=${danger.btn.color} bg=${danger.btn.bg}`);
} else { console.log('   · sin .kx-danger-btn visible ahora (skip peligro)'); }
if (danger.text) {
	check('kx-danger-text en rojo', /rgb\(190,\s*18,\s*60\)/.test(danger.text.color), danger.text.color);
}
await page.screenshot({ path: path.join(SHOT_DIR, 'sepia-historial.png') });

await context.close();
server.close();
rmSync(PROFILE, { recursive: true, force: true });

console.log(failures === 0 ? '\n✅ REVISIÓN 2 VERIFICADA' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
