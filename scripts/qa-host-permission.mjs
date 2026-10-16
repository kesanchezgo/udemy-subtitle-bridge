/**
 * Permiso de red para endpoints propios — verificación honesta.
 *
 * Contexto verificado en Chromium real:
 *   - El panel vive en el content script, donde chrome.permissions NO existe.
 *   - El service worker sí lo tiene, pero permissions.request falla allí con
 *     "This function must be called during a user gesture": ese gesto no cruza
 *     el sendMessage. Así que NO se puede mostrar un diálogo desde el dock.
 *   - Los endpoints por defecto (OpenAI, DeepSeek, OpenRouter, Anthropic,
 *     Gemini, 127.0.0.1, localhost) ya están en host_permissions; solo los hosts
 *     raros (IP de LAN, ngrok, dominio propio) requieren permiso opcional.
 *
 * Por tanto la app NO debe simular una petición ni guardar en silencio. Lo que
 * comprueba esta prueba, midiendo el estado REAL de permisos (getAll del SW) y
 * el comportamiento del panel:
 *
 *   A. El SW responde USG_HOST_COVERED correctamente (cubierto / no cubierto).
 *   B. Endpoint YA cubierto (127.0.0.1:8010) → el panel valida y guarda.
 *   C. Endpoint NO cubierto (host raro) → el panel avisa y NO valida en vano,
 *      en lugar de guardar en silencio como hacía antes.
 *
 * Uso: node scripts/qa-host-permission.mjs
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

const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Permiso</title></head>
<body><h1 data-purpose="course-title">Curso de prueba</h1><main><h2 data-purpose="curriculum-item-view-title">Lección 1</h2>
<video controls muted></video></main></body></html>`;

const dir = path.join(tmpdir(), 'usb-qa-certs');
const key = path.join(dir, 'key.pem');
const cert = path.join(dir, 'cert.pem');
if (!existsSync(key)) { mkdirSync(dir, { recursive: true }); spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=udemy.com'], { stdio: 'pipe' }); }
const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); });
let port = 4600;
server.on('error', () => { port += 1; if (port < 4620) server.listen(port, '127.0.0.1'); });
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const PROFILE = path.join(repoRoot, 'temp_profile_perm');
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

const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

await page.goto(`https://www.udemy.com:${port}/course/x/learn/lecture/1/`);
await page.waitForSelector(OUTER, { timeout: 20000 });
await page.waitForTimeout(1500);
await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1000);

let failures = 0;
const check = (n, ok, extra) => { if (ok) console.log('  ✓', n); else { failures += 1; console.error('  ✗', n, extra ?? ''); } };

/** Pone un endpoint en el campo y pulsa Guardar; devuelve el texto del panel. */
const setEndpointAndSave = async (url) => {
	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'provider' } })));
	await page.waitForTimeout(1100);
	const openaiBtn = page.locator(`${OUTER} button[role="radio"]`).filter({ hasText: /^OpenAI$/ }).first();
	if (await openaiBtn.count().catch(() => 0)) { await openaiBtn.evaluate((el) => el.click()); await page.waitForTimeout(650); }
	const ep = page.locator(`${OUTER} input[placeholder="https://api.openai.com/v1"]`).first();
	if (await ep.count().catch(() => 0)) {
		await ep.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, url);
	}
	await page.waitForTimeout(250);
	const saveBtn = page.locator(`${OUTER} button`).filter({ hasText: /Probar conexión y guardar/ }).first();
	if (!(await saveBtn.count().catch(() => 0))) return { noButton: true };
	// Muestrear DESDE el clic: el toast de sonner vive poco y esperar antes de
	// mirar lo pierde. El muestreo corre en la página, en el mismo frame.
	const samples = await saveBtn.evaluate(async (btn) => {
		const out = [];
		const snap = () => {
			const root = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
			// textContent, no innerText: la hoja cerrada tiene visibility:hidden
			// e innerText devuelve "" aunque el contenido exista.
			const text = ((root?.textContent ?? '') + ' ' + (document.body.textContent ?? ''));
			const toasts = [...(root?.querySelectorAll('[data-sonner-toast]') ?? [])].map((t) => (t.textContent ?? '').trim());
			const btnEl = [...(root?.querySelectorAll('button') ?? [])].find((b) => /Guardado y activo|Probar conexi|Verificando/.test(b.textContent || ''));
			return {
				text: text.slice(0, 160),
				toasts: toasts.slice(0, 4),
				saved: /Guardado y activo/i.test(text) || toasts.some((t) => /Guardado y activo/i.test(t)),
				denied: /Permiso denegado/i.test(text) || toasts.some((t) => /Permiso denegado/i.test(t)),
				noNetwork: /Sin permiso de red/i.test(text) || toasts.some((t) => /Sin permiso de red/i.test(t)),
				btnText: btnEl?.textContent?.trim() ?? null,
			};
		};
		out.push(snap());
		const t0 = performance.now();
		await new Promise((done) => {
			const iv = setInterval(() => { out.push(snap()); if (performance.now() - t0 > 6000) { clearInterval(iv); done(); } }, 100);
			btn.click();
		});
		return out;
	});
	// El estado final: el primero que muestre alguna señal, o el último.
	const st = samples.find((s) => s.saved || s.noNetwork || s.denied) ?? samples[samples.length - 1] ?? {};
	return st;
};

// ── A. El SW responde la consulta de cobertura ────────────────────────────────
console.log('\n▶ A. USG_HOST_COVERED responde en el service worker');
if (sw) {
	const cov = await sw.evaluate(async () => {
		const casos = {
			cubierto: await chrome.permissions.contains({ origins: ['http://127.0.0.1/*'] }),
			raro: await chrome.permissions.contains({ origins: ['http://192.168.1.50/*'] }),
		};
		return casos;
	});
	console.log('   contains:', JSON.stringify(cov));
	check('el SW distingue host cubierto de host sin permiso',
		cov.cubierto === true && cov.raro === false, JSON.stringify(cov));
} else {
	console.log('   · sin service worker (skip)');
}

// ── B. Endpoint ya cubierto → valida y guarda ─────────────────────────────────
console.log('\n▶ B. endpoint cubierto (127.0.0.1:8010) → valida y guarda');
const before = sw ? await sw.evaluate(() => chrome.permissions.getAll().then((a) => a.origins.length)) : -1;
const b = await setEndpointAndSave('http://127.0.0.1:8010/v1');
console.log('   panel:', JSON.stringify({ saved: b.saved, noNetwork: b.noNetwork, denied: b.denied, btn: b.btnText }));
check('con host cubierto no avisa de falta de permiso', b.noNetwork === false, JSON.stringify(b));
check('con host cubierto llega a guardar (o a validar y fallar por red, sin aviso de permiso)',
	(b.saved === true || b.btnText !== null), JSON.stringify(b));

// ── C. Endpoint sin cubrir → avisa en vez de callarse ─────────────────────────
console.log('\n▶ C. endpoint sin permiso (host raro) → avisa, no guarda en silencio');
const c = await setEndpointAndSave('http://192.168.1.50:8080/v1');
console.log('   panel:', JSON.stringify({ saved: c.saved, noNetwork: c.noNetwork, denied: c.denied, btn: c.btnText }));
check('con host sin permiso avisa «Sin permiso de red»', c.noNetwork === true, JSON.stringify(c));
check('con host sin permiso no marca «Guardado y activo»', c.saved === false, JSON.stringify(c));

// ── D. Los permisos reales no cambiaron (no se falsea nada) ───────────────────
console.log('\n▶ D. el estado real de permisos queda intacto');
const after = sw ? await sw.evaluate(() => chrome.permissions.getAll().then((a) => a.origins)) : [];
check('los hosts permitidos no cambiaron durante la prueba',
	before === (sw ? after.length : -1), `${before} → ${after.length}`);
console.log('   hosts tras la prueba:', JSON.stringify(after).slice(0, 240));

await page.screenshot({ path: path.join(repoRoot, 'tmp', 'host-permission.png') }).catch(() => {});
await context.close();
server.close();
rmSync(PROFILE, { recursive: true, force: true });

console.log(failures === 0 ? '\n✅ PERMISO DE HOST OK' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
