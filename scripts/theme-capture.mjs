// Captura el dock standalone en AMBOS temas (sepia/light y dark) para
// auditoría visual del diseño. Vistas: Study (objetivos), panel de IA,
// Captions, Overlay. Run: node scripts/theme-capture.mjs
// Artifacts: theme-light-*.png / theme-dark-*.png en la raíz.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
const PORT = 4174;
const APP_URL = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function spawnDevServer() {
	const viteCli = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
	const dev = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
		cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'],
	});
	return dev;
}

async function waitForServer(url, timeoutMs = 30000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url, { cache: 'no-store' });
			if (res.status < 500) return;
		} catch { /* retry */ }
		await sleep(250);
	}
	throw new Error(`server not ready at ${url}`);
}

const dev = spawnDevServer();
await waitForServer(APP_URL);

const browser = await chromium.launch({ headless: false });

for (const theme of ['sepia', 'dark']) {
	const context = await browser.newContext({ viewport: { width: 900, height: 1040 }, deviceScaleFactor: 2 });
	const page = await context.newPage();
	await page.addInitScript((t) => localStorage.setItem('usb_dock_theme', t), theme);

	await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
	await sleep(1500);

	// Guest mode
	try {
		await page.getByRole('button', { name: 'Continuar sin cuenta' }).first().click({ timeout: 8000 });
	} catch { /* puede no aparecer */ }
	await sleep(1200);

	// Study tab (objetivos) — theme tag check
	const themeTag = await page.evaluate(() => document.querySelector('.usb-dock')?.className.includes('dock-sepia') ? 'sepia' : 'dark');
	console.log(`[${theme}] dock className theme: ${themeTag}`);
	await page.screenshot({ path: path.join(repoRoot, `theme-${theme}-study.png`) });

	// Provider panel (IA y modelos)
	try {
		await page.locator('[title="Configurar motores de IA"]').first().click({ timeout: 5000 });
		await sleep(900);
		await page.screenshot({ path: path.join(repoRoot, `theme-${theme}-ai-panel.png`) });
		await page.locator('[title="Configurar motores de IA"]').first().click({ timeout: 3000 }).catch(() => null);
		await sleep(400);
	} catch (e) {
		console.log(`[${theme}] provider panel: ${String(e).slice(0, 100)}`);
	}

	// Captions tab
	try {
		await page.locator('button:has-text("Captions")').first().click({ timeout: 5000 });
		await sleep(900);
		await page.screenshot({ path: path.join(repoRoot, `theme-${theme}-captions.png`) });
	} catch (e) {
		console.log(`[${theme}] captions: ${String(e).slice(0, 100)}`);
	}

	// Overlay tab
	try {
		await page.locator('button:has-text("Overlay")').first().click({ timeout: 5000 });
		await sleep(900);
		await page.screenshot({ path: path.join(repoRoot, `theme-${theme}-overlay.png`) });
	} catch (e) {
		console.log(`[${theme}] overlay: ${String(e).slice(0, 100)}`);
	}

	await context.close();
}

await browser.close();
dev.kill('SIGTERM');
console.log('\nCapturas listas: theme-{sepia,dark}-{study,ai-panel,captions,overlay}.png');
process.exit(0);
