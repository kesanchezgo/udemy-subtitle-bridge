/**
 * Cierre de la verificación de Obsidian tras el rediseño, con los métodos
 * correctos de Playwright (shadow DOM open: se puede atravesar):
 *   - page.mouse.wheel SOBRE el dock para desplazar su contenedor real.
 *   - locator.scrollIntoViewIfNeeded() + locator.click() (evento real).
 *   - Fallback: clic por coordenadas del bounding box.
 *
 * Prueba: lección ya completada (del historial) → paso 5 → Exportar →
 * verifica insignia «✓ Listo», apertura del protocolo (diálogo capturado vía
 * CDP) y guard de duplicados en el segundo clic.
 *
 * Uso: node scripts/qa-obsidian-verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const repoRoot = process.cwd();
const distDir = path.resolve('dist');
const COURSE = 'Java In-Depth: Become a Complete Java Engineer! [2026]';
const LESSON = '8. Platform Dependency + Demo';
const OUT = 'tmp/obsidian-verify';
const OUTER = '[id^="usb-dock-host-"]';

// ── fixture con transcripción ─────────────────────────────────────────────────
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
if (!fs.existsSync(key)) {
	fs.mkdirSync(dir, { recursive: true });
	spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=udemy.com'], { stdio: 'pipe' });
}
const server = createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
	if (req.url?.endsWith('q.vtt')) { res.writeHead(200, { 'Content-Type': 'text/vtt' }); res.end(VTT); return; }
	res.writeHead(200, { 'Content-Type': 'text/html' });
	res.end(PAGE);
});
let port = 443;
server.on('error', () => { port += 1; if (port < 4460) server.listen(port, '127.0.0.1'); });
await new Promise((r) => server.listen(port, '127.0.0.1', r));

// ── lección ya completada en el historial (mismas claves que historyService) ──
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
	ankiCards: [
		{ id: 'card-001', front: '¿Qué produce javac?', back: 'Bytecode.', tags: ['java'], type: 'concepto' },
	],
	version: 2,
};

const PROFILE = path.join(repoRoot, 'temp_profile_obs_verify');
fs.rmSync(PROFILE, { recursive: true, force: true });
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

// Interceptar TODO request a obsidian:// (protocolo externo del navegador).
let obsidianRequests = [];
context.on('request', (req) => { if (req.url().startsWith('obsidian://')) obsidianRequests.push(req.url()); });

// Capturar el diálogo de protocolo externo (Chrome dialogo) vía CDP.
let protocolEvents = [];
let cdp = null;
try {
	cdp = await context.newCDPSession(page);
	cdp.on('Page.javascriptDialogOpening', (e) => {
		protocolEvents.push(e.message);
		cdp.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
	});
	await cdp.send('Page.enable');
	// Contextos de ejecución: para poder leer el mundo aislado del content
	// script, que es donde React y markQa viven.
	cdp.on('Runtime.executionContextCreated', (e) => isolatedContexts.push(e.context));
} catch { /* CDP no disponible */ }

// Lee window.__usgQa vía CDP Runtime.evaluate. El content script NO declara
// "world": "MAIN" en el manifest → React + markQa corren en el mundo AISLADO:
// page.evaluate (y Runtime.evaluate por defecto, main world) NO ven lo que
// markQa escribe. Hay que pedir el contextId del mundo aislado.
const isolatedContexts = [];
async function readIsolatedQa() {
	if (!cdp) return { ok: false, why: 'sin CDP' };
	try {
		await cdp.send('Runtime.enable');
		const ctxs = isolatedContexts.filter((c) => !c.isDefault);
		if (!ctxs.length) return { ok: false, why: 'sin mundo aislado aún' };
		// El mundo aislado del content script es el que tiene el __usgQa real.
		for (const ctx of ctxs) {
			const res = await cdp.send('Runtime.evaluate', {
				expression: 'JSON.stringify(window.__usgQa ?? null)',
				contextId: ctx.id,
				returnByValue: true,
			});
			const val = res.exceptionDetails ? null : (res.result?.value ?? null);
			if (val && val !== 'null') {
				try {
					const parsed = JSON.parse(val);
					if (Array.isArray(parsed) && parsed.includes('exportar-guard')) {
						return { ok: true, value: val, contextId: ctx.id };
					}
				} catch { /* seguir */ }
			}
		}
		return { ok: true, value: JSON.stringify(ctxs.map((c) => c.id)), why: 'ningún contexto aislado tenía exportar-guard' };
	} catch (e) {
		return { ok: false, why: String(e).slice(0, 90) };
	}
}

await page.goto(`https://www.udemy.com:${port}/course/j/learn/lecture/1/`);
await page.waitForSelector(OUTER, { timeout: 20000 });
const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
if (sw) {
	// historial en LOCAL (historyService), contexto + config en SYNC
	await sw.evaluate(({ record }) => new Promise((resolve) => {
		// obsidianExportService y historyService leen de LOCAL (chromeLocalStorage).
		chrome.storage.local.set({
			[`usb_history_lecture::${record.courseId}::${record.lectureId}`]: record,
			obsidian_export_config: { vaultName: 'QA Vault', sourcesFolder: 'wiki/fuentes', mocsFolder: 'cursos', includeCards: true, autoExport: false, includeRawSrt: false },
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
fs.mkdirSync(OUT, { recursive: true });

// ── paso 5 ───────────────────────────────────────────────────────────────────
await page.locator(`${OUTER} button:has-text("Study")`).first().click().catch(() => {});
await page.waitForTimeout(1200);
const modules = await page.evaluate(() => {
	const sr = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const ps = [...(sr?.querySelectorAll('section p') ?? [])].map((p) => (p.textContent || '').trim());
	return {
		cards: ps.includes('Tarjetas de la lección'),
		vocab: ps.includes('Mazo de idiomas · opcional'),
		obsidian: ps.includes('Obsidian'),
	};
});
console.log('módulos del paso 5:', JSON.stringify(modules));

// ── localizar y hacer scroll con la rueda sobre el dock ──────────────────────
const dockBox = await (await page.locator(OUTER)).boundingBox();
const obsidianBtn = page.locator(`${OUTER} section`).filter({
	has: page.locator('p', { hasText: /^Obsidian$/ }),
}).locator('button', { hasText: /^(Exportar|Exportado)$/ }).last();

// Rueda sobre el dock hasta que el botón sea visible y clickeable.
let clickable = false;
for (let i = 0; i < 14 && !clickable; i += 1) {
	if (await obsidianBtn.count().catch(() => 0)) {
		await obsidianBtn.scrollIntoViewIfNeeded().catch(() => {});
		const box = await obsidianBtn.boundingBox().catch(() => null);
		if (box && box.y > 60 && box.y + box.height < 990 && box.width > 0) clickable = true;
	}
	if (!clickable) {
		await page.mouse.move(dockBox.x + dockBox.width / 2, dockBox.y + dockBox.height * 0.7);
		await page.mouse.wheel(0, 400);
		await page.waitForTimeout(500);
	}
}
console.log('botón visible tras scroll:', clickable);
await page.screenshot({ path: path.join(OUT, '01-antes-exportar.png') });

// ── primer clic real ─────────────────────────────────────────────────────────
let firstClick = 'not-attempted';
if (clickable) {
	await obsidianBtn.click({ timeout: 8000 }).then(() => { firstClick = 'clicked'; }).catch((e) => {
		firstClick = 'failed:' + String(e).slice(0, 80);
	});
}
console.log('primer clic:', firstClick);
let listo = false;
for (let i = 0; i < 12 && !listo; i += 1) {
	await page.waitForTimeout(1000);
	listo = await page.evaluate(() => {
		const sr = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
		return [...sr.querySelectorAll('section')]
			.filter((s) => [...s.querySelectorAll('p')].some((p) => (p.textContent || '').trim() === 'Obsidian'))
			.some((s) => /Listo/i.test(s.textContent ?? ''));
	});
}
await page.screenshot({ path: path.join(OUT, '02-despues-exportar.png') });

// Marcar el timeline de QA (window.__usgQa) para cruzar con las señales.
// El guard escribe 'exportar-guard' ahí; el mark inicial permite verificar
// que el breadcrumb está disponible antes del 2º clic.
await page.evaluate(() => {
	const w = window;
	(w.__usgQa ??= []).push('qa-script-start');
});

// Helpers inyectados en la página:
//  1) __qaProbe — snapshot del toaster de sonner + del timeline markQa.
//  2) __qaWatch — MutationObserver sobre el ol[data-sonner-toaster] del shadow
//     root: registra cada mount/unmount de [data-sonner-toast] con su tipo y
//     texto. Es la única forma fiable de ver un toast de 10000 ms que el
//     muestreo por intervalo (50 ms) puede perder, y de capturar el motivo del
//     desmontaje (duración cumplida vs. descarte por sonner).
// Vive en la página porque todo debe correr en el MISMO frame del clic: entre
// un await y otro, React/sonner ya desmontaron el toast.
await page.evaluate(() => {
  window.__qaProbe = () => {
    const out = { toasts: [], guard: false, guardFired: false, qaTail: [], sonner: false, shadowRoot: false, action: false };
    try {
      const sr = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot || null;
      out.shadowRoot = Boolean(sr);
      const sonner = sr?.querySelector('[data-sonner-toaster]') || null;
      out.sonner = Boolean(sonner);
      out.toasts = [...(sonner?.querySelectorAll('[data-sonner-toast]') ?? [])].map((t) => ({
        type: t.getAttribute('data-type') || '?',
        mounted: t.getAttribute('data-mounted') || '?',
        removed: t.getAttribute('data-removed') || '?',
        swiped: t.getAttribute('data-swiped') || '?',
        text: (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        // El botón de acción del aviso: sonner lo renderiza como <button> con
        // data-button data-action dentro del toast. Sin él, el aviso dice al
        // usuario que reexportar duplica pero no le da salida.
        actions: [...t.querySelectorAll('button[data-action], button[data-button]')]
          .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      }));
      out.guard = out.toasts.some((t) => /ya fue exportada/i.test(t.text));
      out.action = out.toasts.some((t) => t.actions.some((a) => /exportar copia/i.test(a)));
      const qa = window.__usgQa;
      out.guardFired = Array.isArray(qa) && qa.includes('exportar-guard');
      out.qaTail = Array.isArray(qa) ? qa.slice(-8) : [];
    } catch (e) {
      out.error = String(e);
    }
    return out;
  };
  window.__qaEvents = [];
  // Observar el SHADOW ROOT completo (childList+subtree): el <ol
  // data-sonner-toaster> solo existe mientras hay toasts (sonner devuelve null
  // con la lista vacía), así que observar el toaster directamente no ve nada.
  // Así capturamos el mount Y el unmount de cada [data-sonner-toast].
  const sr = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
  if (sr) {
    const obs = new MutationObserver((recs) => {
      for (const r of recs) {
        for (const n of r.addedNodes) {
          if (n instanceof Element && n.matches?.('[data-sonner-toast]')) {
            window.__qaEvents.push({
              t: Math.round(performance.now()), ev: 'mount',
              type: n.getAttribute('data-type') || '?',
              text: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
            });
          }
        }
        for (const n of r.removedNodes) {
          if (n instanceof Element && n.matches?.('[data-sonner-toast]')) {
            window.__qaEvents.push({
              t: Math.round(performance.now()), ev: 'unmount',
              type: n.getAttribute('data-type') || '?',
              text: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
            });
          }
        }
      }
    });
    obs.observe(sr, { childList: true, subtree: true });
  }
  // ¿Está el toaster en el shadow root del dock o en document? sonner usa
  // position:fixed + z-index 999999999, así que podría acabar fuera del shadow.
  window.__qaToasterWhere = () => ({
    inShadow: Boolean(sr?.querySelector('ol[data-sonner-toaster]')),
    inDocument: Boolean(document.querySelector('ol[data-sonner-toaster]')),
  });
});

// ── segundo clic → guard de duplicados ────────────────────────────────────────
// Diagnóstico del toast del guard.
let dupWarn = false;
let dupAction = false;
let guardActions = [];
let guardFired = false;
let qaTail = [];
if (clickable) {
  // El botón ahora dice «Exportado»: re-localizarlo (el locator anterior
  // quedó atado al texto «Exportar»).
  // Puede haber dos secciones montadas (paso 5 + portal de Ajustes): elegir
  // la que tenga «Listo» (la que ya exportó).
  const obsidianBtn2 = page.locator(`${OUTER} section`).filter({
    has: page.locator('p', { hasText: /^Obsidian$/ }),
  }).locator('button', { hasText: /^(Exportar|Exportado)$/ });
  const count = await obsidianBtn2.count().catch(() => 0);
  let idx = count - 1;
  if (count > 1) {
    for (let i = 0; i < count; i += 1) {
      const isListo = await obsidianBtn2.nth(i).evaluate((el) => {
        const sec = el.closest('section');
        return /Listo/i.test(sec?.textContent ?? '');
      }).catch(() => false);
      if (isListo) { idx = i; break; }
    }
  }
  const target2 = obsidianBtn2.nth(idx);

  // (a) Los toasts de la 1ª exportación duran 3500 ms. Esperamos 5 s para que
  //     el sonner esté vacío ANTES del 2º clic: así el toast del guard no
  //     compite por los slots de visibleToasts={3} con los de la 1ª exportación.
  await page.waitForTimeout(5000);
  await target2.scrollIntoViewIfNeeded().catch(() => {});
  // (b) Captura previa: qué hay en pantalla antes del 2º clic (y si el
  //     Toaster bottom-center sigue tapando el botón).
  await page.screenshot({ path: path.join(OUT, '03-espera-5s.png') });

  // (c) Clic sintético sobre el botón REAL de la sección Obsidian (el clic
  //     de Playwright no llega: el Toaster overlay lo intercepta). Dispara
  //     el handler de React igual. Muestreamos el toaster cada 50 ms durante
  //     12 s en la página, en el mismo frame, por si sonner desmonta el
  //     toast (3500 ms) antes de que cualquier await pueda leerlo.
  const clicked = await target2.evaluate(async (btn) => {
    const samples = [{ t: 0, ...window.__qaProbe() }];
    const t0 = performance.now();
    await new Promise((done) => {
      const iv = setInterval(() => {
        samples.push({ t: Math.round(performance.now() - t0), ...window.__qaProbe() });
      }, 50);
      setTimeout(() => { clearInterval(iv); done(); }, 12000);
      btn.click(); // handler de React → guard → toast.warning
    });
    return samples;
  });
  await page.screenshot({ path: path.join(OUT, '04-diagnostico-guard.png') });
  // Lectura final (post-desmontado) para markQa / qaTail.
  const finalProbe = await page.evaluate(() => window.__qaProbe());

  const samples = clicked || [];
  const guardSamples = samples.filter((s) => s.guard);
  dupWarn = guardSamples.length > 0 || finalProbe.guard;
  dupAction = samples.some((s) => s.action) || Boolean(finalProbe.action);
  guardActions = guardSamples.flatMap((s) => s.toasts.filter((t) => /ya fue exportada/i.test(t.text)).flatMap((t) => t.actions ?? []));
  guardFired = samples.some((s) => s.guardFired) || finalProbe.guardFired;
  qaTail = finalProbe.qaTail || [];

  // ¿Había OTROS toasts ocupando los slots (p.e. el de éxito de la 1ª
  // exportación, o avisos del flujo de estudio)?
  const maxToasts = samples.reduce((m, s) => Math.max(m, s.toasts?.length || 0), 0);
  const otherToasts = [];
  for (const s of samples) {
    for (const t of s.toasts || []) {
      if (!/ya fue exportada/i.test(t.text) && !otherToasts.some((o) => o.text === t.text)) {
        otherToasts.push(t);
      }
    }
  }

  const toastEvents = await page.evaluate(() => window.__qaEvents || []);
  const toasterWhere = await page.evaluate(() => (typeof window.__qaToasterWhere === 'function' ? window.__qaToasterWhere() : {}));
  // main world (donde page.evaluate corre) vs lo que escribió markQa
  const mainWorldQa = await page.evaluate(() => window.__usgQa ?? null);
  const cdpQa = await readIsolatedQa();
  // markQa corre en el mundo AISLADO del content script: solo ahí aparece
  // 'exportar-guard'. Esa es la confirmación de que el guard se disparó.
  const isolatedQa = cdpQa.ok && cdpQa.value && cdpQa.value !== 'null' && cdpQa.contextId !== undefined
    ? (() => { try { return JSON.parse(cdpQa.value); } catch { return null; } })()
    : null;
  if (Array.isArray(isolatedQa)) {
    qaTail = isolatedQa.slice(-8);
    if (isolatedQa.includes('exportar-guard')) guardFired = true;
  }
  const guardMounts = toastEvents.filter((e) => e.ev === 'mount' && /ya fue exportada/i.test(e.text));
  const guardUnmounts = toastEvents.filter((e) => e.ev === 'unmount' && /ya fue exportada/i.test(e.text));
  // El MutationObserver es la fuente de verdad: si vio el mount, el toast
  // existió (aunque el muestreo por intervalo no lo alcanzara).
  if (!dupWarn && guardMounts.length) dupWarn = true;

  console.log('   [diagnóstico toast del guard]');
  console.log('     muestras tomadas         :', samples.length);
  console.log('     guard (markQa) disparado :', guardFired, qaTail.length ? `qaTail=${JSON.stringify(qaTail)}` : '(sin marcas)');
  console.log('     toast del guard visible  :', dupWarn, guardSamples.length ? `(muestreo ${guardSamples[0].t}–${guardSamples[guardSamples.length - 1].t} ms)` : '(nunca en muestreo)');
  console.log('     botón «Exportar copia»   :', dupAction, guardActions.length ? `acciones=${JSON.stringify(guardActions)}` : '(sin acciones en el toast)');
  console.log('     eventos MutationObserver :', toastEvents.length ? JSON.stringify(toastEvents.map((e) => `${e.ev}@${e.t}ms ${e.type}:${e.text.slice(0, 40)}`)) : '(ninguno)');
  if (guardMounts.length && guardUnmounts.length) {
    console.log('     vida del toast del guard :', `${guardUnmounts[0].t - guardMounts[0].t} ms (mount@${guardMounts[0].t} → unmount@${guardUnmounts[0].t})`);
  } else if (guardMounts.length) {
    console.log('     vida del toast del guard : montado y NUNCA desmontado (dura 10000 ms por su duration propio)');
  }
  console.log('     toasts simultáneos (max) :', maxToasts);
  console.log('     otros toasts vistos      :', otherToasts.length ? JSON.stringify(otherToasts.map((t) => ({ type: t.type, text: t.text.slice(0, 50) }))) : '(ninguno)');
  console.log('     toaster ubicación        :', JSON.stringify(toasterWhere));
  console.log('     __usgQa main world       :', JSON.stringify(mainWorldQa));
  console.log('     __usgQa mundo aislado    :', cdpQa.ok ? String(cdpQa.value).slice(0, 300) : `(no legible: ${cdpQa.why})`);
  const s0 = samples[0];
  if (s0) console.log('     sample inicial           :', JSON.stringify({ t: s0.t, toasts: s0.toasts?.length ?? 0, guard: s0.guard, sonner: s0.sonner, shadowRoot: s0.shadowRoot }));
}
console.log('aviso de duplicado:', dupWarn);
console.log('diálogos de protocolo capturados:', protocolEvents.length);
console.log('requests obsidian:// totales:', obsidianRequests.length);
if (obsidianRequests[0]) console.log('   primer URI:', decodeURIComponent(obsidianRequests[0]).slice(0, 170));
if (obsidianRequests[1]) console.log('   SEGUNDO URI:', decodeURIComponent(obsidianRequests[1]).slice(0, 170));

await context.close();
server.close();
fs.rmSync(PROFILE, { recursive: true, force: true });

let failures = 0;
const check = (n, ok) => { if (ok) console.log('  ✓', n); else { failures += 1; console.error('  ✗', n); } };
check('los 3 módulos en el paso 5', modules.cards && modules.vocab && modules.obsidian);
check('botón Exportar clickeable tras scroll real', clickable);
check('primer clic ejecutado', firstClick === 'clicked', firstClick);
check('insignia «✓ Listo» tras exportar', listo);
// Un clic correcto emite 2 URIs: el MOC del curso + la nota de sesión.
check('clic de exportación emite 2 URIs (MOC + sesión)', obsidianRequests.length === 2,
	String(obsidianRequests.length));
check('guard: 2º clic no genera URIs nuevas', obsidianRequests.length === 2,
	`uris=${obsidianRequests.length} tras dos clics`);
// Guard verificado por markQa (window.__usgQa): el handler corrió y entró
// en la rama de duplicado ANTES de abrir cualquier URI.
check('guard disparado (markQa «exportar-guard» en window.__usgQa)', guardFired,
	`qaTail=${JSON.stringify(qaTail)}`);
// Toast del guard: ¿se montó y mostró el texto? (diagnóstico, no bloqueante:
// si markQa confirma el guard pero el toast no se ve, es bug de UI, no de
// lógica — se reporta igualmente.)
check('toast «ya fue exportada» visible tras el guard', dupWarn);
// El aviso debe ofrecer la salida: «Exportar copia» reexporta sin duplicar
// archivo (sonner nombra el segundo como "nombre 1.md"). Sin el botón, el
// aviso solo dice que algo va a pasar mal y deja al usuario sin acción.
check('botón «Exportar copia» en el aviso', dupAction,
	guardActions.length ? `acciones=${JSON.stringify(guardActions)}` : 'sin acciones en el toast');
if (!dupWarn && guardFired) {
	console.error('   ⚠ markQa confirma el guard pero el toast NUNCA se mostró → bug de UI del toaster (no de lógica).');
}
console.log(failures === 0 ? '\n✅ OBSIDIAN CERRADO' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
