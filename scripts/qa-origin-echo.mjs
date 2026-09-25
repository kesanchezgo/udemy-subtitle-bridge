// Diagnóstico: ¿qué header Origin envía el fetch del service worker de la
// extensión? Servidor eco registra los headers recibidos.
// Run: node scripts/qa-origin-echo.mjs

import { createServer } from 'node:http';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
const distDir = path.join(repoRoot, 'dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Servidor eco: registra y devuelve los headers recibidos
const received = [];
const echo = createServer((req, res) => {
	const headers = { ...req.headers };
	received.push({ url: req.url, method: req.method, origin: req.headers.origin || '(sin Origin)', referer: req.headers.referer || '(sin Referer)', userAgent: (req.headers['user-agent'] || '').slice(0, 60) });
	res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
	res.end(JSON.stringify({ ok: true, echoed: headers.origin || null }));
});
await new Promise((r) => echo.listen(7777, '127.0.0.1', r));
console.log('echo server en 7777');

const userDataDir = path.join(tmpdir(), 'usb-qa-origin-profile');
rmSync(userDataDir, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(userDataDir, {
	headless: false,
	viewport: { width: 1000, height: 800 },
	args: [
		`--disable-extensions-except=${distDir}`,
		`--load-extension=${distDir}`,
		'--lang=es',
	],
});
const page = await context.newPage();
await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => undefined);

let sw = null;
for (let i = 0; i < 8 && !sw; i++) {
	const ext = context.serviceWorkers().filter((w) => w.url().startsWith('chrome-extension://'));
	sw = ext[ext.length - 1] || null;
	if (!sw) {
		// despertar: abrir la página de la extensión forza el arranque
		const extId = ext[0]?.url()?.split('/')[2];
		if (extId) {
			const p2 = await context.newPage();
			await p2.goto(`chrome-extension://${extId}/manifest.json`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
			await p2.close().catch(() => undefined);
		}
		await sleep(1500);
	}
}
if (!sw) { console.error('SW de la extensión no encontrado'); process.exit(1); }
console.log('SW de la extensión:', sw.url());

// Fetch DESDE el SW (el mismo entorno que validateProviderFromBackground)
const result = await Promise.race([
	sw.evaluate(async () => {
		try {
			const r = await fetch('http://127.0.0.1:7777/from-sw', {
				method: 'POST',
				headers: { 'Authorization': 'Bearer test', 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'test', messages: [{ role: 'user', content: 'ok' }], max_tokens: 8 }),
			});
			return { status: r.status };
		} catch (e) {
			return { error: String(e).slice(0, 120) };
		}
	}),
	sleep(10000).then(() => ({ error: 'timeout' })),
]);
console.log('fetch desde el SW:', JSON.stringify(result));
await sleep(500);

console.log('\n=== HEADERS RECIBIDOS POR EL ECHO SERVER ===');
received.forEach((r, i) => console.log(`[${i}] ${r.method} ${r.url} | Origin: ${r.origin} | Referer: ${r.referer} | UA: ${r.userAgent}`));

await context.close().catch(() => undefined);
echo.close();
process.exit(0);
