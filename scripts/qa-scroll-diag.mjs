// Diagnóstico de scroll: eventos de rueda REALES sobre el dock, midiendo qué
// se desplaza (contenedor del dock vs página de Udemy) y la cadena de
// hit-test desde el cursor. Run: node scripts/qa-scroll-diag.mjs

import { createServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
const distDir = path.join(repoRoot, 'dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRANSCRIPT_CUES = Array.from({ length: 40 }, (_, i) => `Cue ${i + 1}: texto de la transcripción de la lección para llenar el panel`);
const FIXTURE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>QA scroll diag</title></head>
<body style="margin:0;font-family:Arial">
<div style="height:3000px;background:linear-gradient(#eef,#fee)">página de udemy (desplazable)</div>
</body></html>`;

function ensureCert() {
	const dir = path.join(tmpdir(), 'usb-qa-certs');
	const key = path.join(dir, 'key.pem');
	const cert = path.join(dir, 'cert.pem');
	if (existsSync(key) && existsSync(cert)) return { key, cert };
	mkdirSync(dir, { recursive: true });
	spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=udemy.com'], { stdio: 'pipe' });
	return { key, cert };
}

const { key, cert } = ensureCert();
const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
	res.end('<!doctype html><html><body style="height:3000px">diag</body></html>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const userDataDir = path.join(tmpdir(), 'usb-qa-scroll-diag');
rmSync(userDataDir, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(userDataDir, {
	headless: false,
	viewport: { width: 1680, height: 1000 },
	args: [
		`--disable-extensions-except=${distDir}`,
		`--load-extension=${distDir}`,
		'--host-resolver-rules=MAP udemy.com 127.0.0.1, MAP www.udemy.com 127.0.0.1',
		'--ignore-certificate-errors',
		'--lang=es',
		'--disable-features=ExternalProtocolDialog',
	],
});
await context.addCookies([{ name: 'qa', value: '1', domain: '.udemy.com', path: '/', secure: true }]);
const page = await context.newPage();
await page.goto(`https://www.udemy.com:${port}/course/qa/learn/lecture/1/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
const dock = await page.waitForSelector('[id^="usb-dock-host-"]', { timeout: 20000 });
console.log('dock montado');

const TAB = (process.env.QA_TAB || 'study').toLowerCase();
try {
	await page.locator(`[id^="usb-dock-host-"] >> text=/${TAB === 'overlay' ? '^Overlay$' : '^Study$'}/`).first().click({ timeout: 8000 });
	await sleep(1200);
	console.log('tab activa:', TAB);
} catch (e) {
	console.log('   tab switch:', String(e).slice(0, 90));
}

try {
	await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 6000 });
} catch {}
await sleep(1000);
try {
	await page.locator(`[id^="usb-dock-host-"] >> text=/${TAB === 'overlay' ? '^Overlay$' : TAB === 'captions' ? '^Captions$' : '^Study$'}/`).first().click({ timeout: 8000 });
	await sleep(1200);
	console.log('tab activa:', TAB);
} catch (e) {
	console.log('   tab switch falló:', String(e).slice(0, 100));
}

// Posicionar el ratón sobre el CENTRO del dock (zona con contenido)
const box = await dock.boundingBox();
const mx = box.x + box.width / 2;
const my = box.y + 400;
await page.mouse.move(mx, my);

// Instrumentación: observador en window (burbuja, main world) — registra cada
// rueda que sobreviva al guard y si llegó con defaultPrevented o no.
await page.evaluate(() => {
	window.__qaBubble = [];
	window.addEventListener('wheel', (e) => {
		window.__qaBubble.push({ deltaY: Math.round(e.deltaY), defaultPrevented: e.defaultPrevented });
	});
});

// Instrumentación: listener a nivel host (main world, DOM compartido) —
// registra CADA rueda y si alguien llamó preventDefault.
await page.evaluate(() => {
	const host = document.querySelector('[id^="usb-dock-host-"]');
	window.__qaWheel = [];
	host.addEventListener('wheel', (e) => {
		window.__qaWheel.push({ deltaY: Math.round(e.deltaY), defaultPrevented: e.defaultPrevented });
	}, { passive: true });
});

// Cadena de hit-test desde el cursor + contenedores desplazables
const metrics = await page.evaluate(({ mx, my }) => {
	const host = document.querySelector('[id^="usb-dock-host-"]');
	const sr = host.shadowRoot;
	const chain = [];
	let node = sr.elementFromPoint(mx, my);
	while (node && node !== sr && chain.length < 12) {
		const cs = getComputedStyle(node);
		chain.push({
			tag: node.tagName,
			cls: String(node.className).slice(0, 46),
			overflowY: cs.overflowY,
			canScroll: node.scrollHeight > node.clientHeight + 2,
			scrollTop: Math.round(node.scrollTop || 0),
		});
		node = node.parentElement;
	}
	const scrollables = [];
	sr.querySelectorAll('*').forEach((el) => {
		if (el.scrollHeight > el.clientHeight + 2) {
			const oy = getComputedStyle(el).overflowY;
			if (oy === 'auto' || oy === 'scroll' || el.classList.contains('custom-scrollbar')) {
				scrollables.push({
					cls: String(el.className).slice(0, 56),
					scrollTop: Math.round(el.scrollTop),
					scrollHeight: el.scrollHeight,
					clientHeight: el.clientHeight,
				});
			}
		}
	});
	return { pageScrollY: window.scrollY, chain, scrollables };
}, { mx, my });

console.log('\n=== ANTES del scroll (ratón sobre el dock) ===');
console.log('page scrollY:', metrics.pageScrollY);
metrics.chain.forEach((c, i) => console.log(`  hit[${i}]:`, JSON.stringify(c)));
metrics.scrollables.forEach((s, i) => console.log(`  scrollable[${i}]:`, JSON.stringify(s)));

// Rueda hacia abajo sobre el dock (3 ticks de 120)
for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 120); await sleep(150); }
await sleep(400);

const after = await page.evaluate(() => {
	const sr = document.querySelector('[id^="usb-dock-host-"]').shadowRoot;
	const scrollables = [];
	sr.querySelectorAll('*').forEach((el) => {
		if (el.scrollHeight > el.clientHeight + 2) {
			const oy = getComputedStyle(el).overflowY;
			if (oy === 'auto' || oy === 'scroll' || el.classList.contains('custom-scrollbar')) {
				scrollables.push({ cls: String(el.className).slice(0, 56), scrollTop: Math.round(el.scrollTop) });
			}
		}
	});
	return { pageScrollY: window.scrollY, docScrollHeight: document.documentElement.scrollHeight, scrollables };
});
console.log('\n=== DESPUÉS de wheel(0, 360) sobre el dock ===');
console.log('page scrollY:', after.pageScrollY, '(si >0: LA PÁGINA SE MOVIÓ)');
after.scrollables.forEach((s, i) => console.log(`  scrollable[${i}]:`, JSON.stringify(s)));
console.log('ruedas registradas en el host:', JSON.stringify(await page.evaluate(() => window.__qaWheel || [])));
console.log('breadcrumb del guard:', await page.evaluate(() => document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot?.querySelector('#usb-dock-root')?.getAttribute('data-usb-wheel') || '(nunca)'));
console.log('walk del guard:', await page.evaluate(() => document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot?.querySelector('#usb-dock-root')?.getAttribute('data-usb-wheel-walk') || '(sin walk)'));
console.log('ruedas en window (burbuja):', JSON.stringify(await page.evaluate(() => window.__qaBubble || [])));

await page.screenshot({ path: path.join(repoRoot, 'qa-scroll-diag.png') });

await context.close().catch(() => undefined);
server.close();
process.exit(0);
