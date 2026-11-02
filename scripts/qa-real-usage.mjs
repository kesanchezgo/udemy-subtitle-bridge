// Prueba de uso REAL (§8): lecciones reales de ~3 y ~15 min del curso del
// usuario, con el flujo cronometrado. IA real vía el proxy 6660 del usuario
// (modelo deepseek-v4.1-flash:free — muse-spark está archivado).
// Uso: node scripts/qa-real-usage.mjs
import { chromium } from 'playwright';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');
const OUTER = '[id^="usb-dock-host-"]';
const PROFILE = path.join(repoRoot, 'chrome-real-profile');
const SHOTS = path.join(repoRoot, 'tmp', 'real-usage');
const COURSE_SLUG = 'java-in-depth-become-a-complete-java-engineer';
mkdirSync(SHOTS, { recursive: true });

// Matar huérfanos de corridas previas
try { execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*chrome-real-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' }); } catch {}
rmSync(path.join(PROFILE, 'Default', 'Service Worker'), { recursive: true, force: true });
const watchdog = setTimeout(() => { console.log('WATCHDOG 30 min'); process.exit(9); }, 30 * 60 * 1000);

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

const page = await context.newPage();

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
	while (Date.now() < d) {
		t = await shadow();
		if (regex.test(t)) return t;
		await page.waitForTimeout(500);
	}
	return t;
};

async function openLecture(id) {
	await page.goto(`https://www.udemy.com/course/${COURSE_SLUG}/learn/lecture/${id}`,
		{ waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.waitForSelector(OUTER, { timeout: 45000 });
	await page.waitForTimeout(2500);
	await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
	await page.locator(`${OUTER} button:has-text("Study")`).first().evaluate((el) => el.click()).catch(() => {});
	await page.waitForTimeout(2000);
	// Cambiar el modelo del proveedor (muse-spark está archivado → deepseek-v4.1-flash:free)
	await fixModel();
}

async function fixModel() {
	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'provider' } })));
	await page.waitForTimeout(1500);
	const changed = await page.evaluate(() => {
		const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		// El input del modelo es un input[type="text"] cuyo valor contiene muse/deepseek
		const inp = [...root.querySelectorAll('input[type="text"]')].find((el) => /muse|deepseek/i.test(el.value || ''));
		if (!inp) return false;
		const proto = Object.getOwnPropertyDescriptor(root.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set;
		proto.call(inp, 'deepseek-v4.1-flash:free');
		inp.dispatchEvent(new Event('input', { bubbles: true }));
		return true;
	});
	if (!changed) { console.log('  (input de modelo no encontrado — se usa el configurado)'); }
	else {
		await page.waitForTimeout(300);
		await click(/Probar conexión y guardar/);
		await page.waitForTimeout(3000);
		console.log('  modelo → deepseek-v4.1-flash:free ✓');
	}
	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
	await page.waitForTimeout(600);
}

async function freshSession() {
	const t = await shadow();
	if (/Reiniciar/.test(t) && /Ponte a prueba|Fíjalo|Llévalo/.test(t)) {
		await click(/Reiniciar/);
		await page.waitForTimeout(400);
		await click(/Sí, reiniciar/);
		await page.waitForTimeout(1500);
	}
}

async function findLessons() {
	await page.goto(`https://www.udemy.com/course/${COURSE_SLUG}/learn/lecture/42163342`,
		{ waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.waitForTimeout(3000);
	const r = await page.evaluate(async () => {
		const subs = await fetch('/api-2.0/users/me/subscribed-courses/?fields[course]=id,title&page_size=100', { credentials: 'include' }).then((r) => r.json());
		const course = (subs.results || []).find((c) => (c.title || '').includes('Java In-Depth'));
		if (!course) return [];
		const items = [];
		let url = `/api-2.0/courses/${course.id}/subscriber-curriculum-items/?course_id=${course.id}&fields[lecture]=title,asset&fields[asset]=length&page_size=200`;
		while (url) {
			const pg = await fetch(url, { credentials: 'include' }).then((r) => r.json());
			items.push(...(pg.results || []));
			url = pg.next;
		}
		return items.filter((it) => it._class === 'lecture').map((it) => ({
			id: it.id, title: it.title, seconds: it.asset?.length || 0,
		})).filter((it) => it.seconds > 0);
	});
	const sorted = [...r].sort((a, b) => a.seconds - b.seconds);
	const pick = (t) => sorted.reduce((b, it) => (Math.abs(it.seconds - t) < Math.abs(b.seconds - t) ? it : b));
	const short = pick(180);
	const long = pick(900);
	console.log(`  corta: ${short.seconds}s «${short.title}»`);
	console.log(`  larga: ${long.seconds}s «${long.title}»`);
	return { short, long };
}

// Reproducir el vídeo para que el content script capture los cues
async function playForTranscript() {
	await page.evaluate(() => {
		const v = document.querySelector('video');
		if (v) { v.muted = true; v.play().catch(() => {}); }
	});
	await page.waitForTimeout(9000);
	await page.evaluate(() => { document.querySelector('video')?.pause(); });
}

// Esperar CTA habilitado y pulsarlo. Devuelve el timestamp.
async function clickGenerationCTA() {
	await fill('Conseguir trabajo en fintech', 'Dominar el tema de esta lección.');
	for (let i = 0; i < 90; i++) {
		if (await click(/Empezar · ~4–10 min|Generar sesión de aprendizaje/)) return Date.now();
		await page.waitForTimeout(1000);
	}
	await page.screenshot({ path: path.join(SHOTS, 'cta-fail.png') });
	return 0;
}

async function answer(text) {
	await fill('Escribe tu respuesta con tus propias palabras', text);
	await click(/^Evaluar/);
}

async function runMinimal(lectureId, label) {
	await openLecture(lectureId);
	await freshSession();
	await playForTranscript();
	const t0 = await clickGenerationCTA();
	if (!t0) return { ok: false, why: 'CTA deshabilitado' };
	const txt = await waitFor(/¿Qué tan claro te quedó el video\??/, 300000);
	if (!/¿Qué tan claro/.test(txt)) return { ok: false, why: 'sin resultado', ms: Date.now() - t0 };
	const tGen = Date.now() - t0;
	await click(/^Más o menos/);
	await page.waitForTimeout(600);
	await click(/Ver los conceptos|Comparar con los conceptos/);
	await page.waitForTimeout(600);
	await click(/Ponerme a prueba/);
	await page.waitForTimeout(1600);
	let ok = false;
	for (let i = 0; i < 10 && !ok; i++) {
		const d = await waitFor(/Continuar a Aplicar|\bSiguiente\b/, 120000);
		if (/Continuar a Aplicar/.test(d)) { ok = true; break; }
		if (/\bSiguiente\b/.test(d)) {
			await click(/\bSiguiente\b/);
			await page.waitForTimeout(1000);
			await answer('javac produce bytecode y la JVM lo interpreta.');
			continue;
		}
		break;
	}
	if (!ok) return { ok: false, why: 'Comprobar incompleto', ms: Date.now() - t0, tGen };
	await click(/Continuar a Aplicar/);
	await page.waitForTimeout(700);
	await click(/Hacerlo después/);
	await page.waitForTimeout(700);
	await click(/Terminar lección/);
	const done = await waitFor(/Lección terminada/, 15000);
	const ms = Date.now() - t0;
	await page.screenshot({ path: path.join(SHOTS, `min-${label}.png`) });
	return { ok: /Lección terminada/.test(done), ms, tGen };
}

async function runComplete(lectureId, label) {
	await openLecture(lectureId);
	await freshSession();
	await playForTranscript();
	const t0 = await clickGenerationCTA();
	if (!t0) return { ok: false, why: 'CTA deshabilitado' };
	const txt = await waitFor(/¿Qué tan claro te quedó el video\??/, 300000);
	if (!/¿Qué tan claro/.test(txt)) return { ok: false, why: 'sin resultado', ms: Date.now() - t0 };
	const tGen = Date.now() - t0;
	await click(/^Más o menos/);
	await page.waitForTimeout(600);
	await fill('Lo que recuerdo es…', 'Java compila a bytecode y la JVM lo ejecuta.');
	await click(/Comparar con los conceptos|Ver los conceptos/);
	await page.waitForTimeout(600);
	for (const m of ['javac compila', 'la JVM interpreta']) {
		await page.evaluate((mm) => {
			const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
			[...root.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(mm))?.click();
		}, m);
		await page.waitForTimeout(300);
	}
	await click(/Ponerme a prueba/);
	await page.waitForTimeout(1600);
	await answer('Ni idea.');
	const d1 = await waitFor(/\bSiguiente\b|Continuar a Aplicar/, 120000);
	if (/\bSiguiente\b/.test(d1)) {
		await click(/\bSiguiente\b/);
		await page.waitForTimeout(1000);
		await answer('javac compila a bytecode y la JVM lo interpreta; JIT compila hot spots.');
		await waitFor(/Continuar a Aplicar/, 120000);
	}
	await click(/Continuar a Aplicar/);
	await page.waitForTimeout(700);
	await click(/Pedir pista|Ver solución/);
	await page.waitForTimeout(400);
	await fill(/Tu solución aquí|Tu respuesta aquí/, 'Llevo el .class a otra plataforma y ejecuto java -cp . App.');
	await click(/Revisar con IA/);
	const p = await waitFor(/Fíjalo en memoria|Continuar de todas formas/, 120000);
	await click(/Fíjalo en memoria|Continuar de todas formas/);
	await page.waitForTimeout(700);
	await click(/Exportar \.apkg/);
	const dl = await page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
	if (dl) await dl.saveAs(path.join(SHOTS, `com-${label}.apkg`)).catch(() => {});
	await page.waitForTimeout(1500);
	await click(/Terminar lección/);
	const done = await waitFor(/Lección terminada/, 15000);
	const ms = Date.now() - t0;
	await page.screenshot({ path: path.join(SHOTS, `com-${label}.png`) });
	return { ok: /Lección terminada/.test(done), ms, tGen, practica: /Fíjalo/.test(p), exported: Boolean(dl) };
}

console.log('\n── Currículo ──');
const { short, long } = await findLessons();
const fmt = (ms) => `${Math.floor(ms / 60000)}m ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`;

console.log(`\n── MÍNIMO · ${short.seconds}s «${short.title}» (≤ 4 min) ──`);
const rMin = await runMinimal(short.id, 'corta');
console.log(rMin.ok ? `  ✓ ${fmt(rMin.ms)} (gen: ${fmt(rMin.tGen)})` : `  ✗ ${rMin.why}`);

console.log(`\n── COMPLETO · ${long.seconds}s «${long.title}» (≤ 12 min) ──`);
const rCom = await runComplete(long.id, 'larga');
console.log(rCom.ok ? `  ✓ ${fmt(rCom.ms)} (gen: ${fmt(rCom.tGen)}) · práctica: ${rCom.practica} · export: ${rCom.exported}` : `  ✗ ${rCom.why}`);

console.log(`\n── RESUMEN ──
  mínimo  (${short.seconds}s): ${rMin.ok ? 'PASS' : 'FAIL'} ${rMin.ok ? fmt(rMin.ms) : rMin.why} · ≤ 4 min
  completo (${long.seconds}s): ${rCom.ok ? 'PASS' : 'FAIL'} ${rCom.ok ? fmt(rCom.ms) : rCom.why} · ≤ 12 min`);

await page.screenshot({ path: path.join(SHOTS, 'final.png') });
clearTimeout(watchdog);
await context.close();
process.exit(rMin.ok && rCom.ok ? 0 : 1);
