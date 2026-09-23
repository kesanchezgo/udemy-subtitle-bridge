// Probe de diagnóstico sobre UDEMY REAL: qué selectores del DOM existen y qué
// responde el content script del dock al puente GET_TRANSCRIPT.
// Run: node scripts/qa-udemy-probe.mjs

import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
const distDir = path.join(repoRoot, 'dist');
const COOKIES_FILE = process.env.USB_COOKIES || path.join(tmpdir(), 'usb-qa-udemy-cookies.json');
const COURSE_URL = process.env.USB_COURSE_URL || 'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/42163342?start=0#overview';

const SAME_SITE = { lax: 'Lax', strict: 'Strict', no_restriction: 'None' };
const raw = JSON.parse(readFileSync(COOKIES_FILE, 'utf-8'));
const cookies = raw.map((c) => {
	const out = { name: c.name, value: c.value, domain: c.domain, path: c.path || '/', secure: Boolean(c.secure), httpOnly: Boolean(c.httpOnly) };
	if (!c.session && typeof c.expirationDate === 'number') out.expires = c.expirationDate;
	const ss = SAME_SITE[String(c.sameSite).toLowerCase()];
	if (ss) out.sameSite = ss;
	return out;
});

const userDataDir = path.join(tmpdir(), 'usb-qa-udemy-profile');
rmSync(userDataDir, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(userDataDir, {
	headless: false,
	viewport: { width: 1680, height: 1000 },
	args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`, '--lang=es', '--disable-features=ExternalProtocolDialog'],
});
await context.addCookies(cookies);
const page = await context.newPage();
await page.goto(COURSE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
// Esperar contenido real (bot-detection puede servir el shell): hasta 3 min.
let realContent = false;
let reloaded = false;
for (let i = 0; i < 36; i++) {
	const st = await page.evaluate(() => ({
		hasVideo: Boolean(document.querySelector('video')),
		hasTitle: Boolean(document.querySelector('[data-purpose="course-title"], h1')),
	}));
	if (st.hasVideo && st.hasTitle) { realContent = true; break; }
	if (i === 12 && !reloaded) {
		reloaded = true;
		console.log('   contenido vacío — recargando…');
		await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
	}
	if (i === 16) console.log('   ⏳ Si ves un checkpoint o la lección vacía, interactúa a mano en la ventana del QA.');
	await page.waitForTimeout(5000);
}
console.log('contenido real renderizado:', realContent);

const domReport = await page.evaluate(() => {
	const q = (s) => document.querySelector(s)?.textContent?.trim()?.slice(0, 80) ?? null;
	return {
		pageTitle: document.title,
		bodyHead: (document.body?.innerText || '').slice(0, 400).split('\n').join(' | '),
		iframes: [...document.querySelectorAll('iframe')].map((f) => f.src.slice(0, 80)).slice(0, 5),
		url: location.href,
		courseTitle: q('[data-purpose="course-title"]'),
		itemTitleCurrent: q('li[aria-current="true"] [data-purpose="item-title"]'),
		curriculumItemTitle: q('[data-purpose="curriculum-item-view-title"]'),
		lessonTitle: q('[data-purpose="lesson-title"]'),
		courseDescription: q('[data-purpose="course-description"]'),
		transcriptPanel: Boolean(document.querySelector('[data-purpose="transcript-panel"]')),
		transcriptCues: document.querySelectorAll('[data-purpose="transcript-cue"]').length,
		video: Boolean(document.querySelector('video')),
		videoTextTracks: document.querySelector('video')?.textTracks?.length ?? null,
		captionsCue: Boolean(document.querySelector('[data-purpose="captions-cue"], [class*="captions-display--captions-cue-text"]')),
		wellKnownCourseHeading: q('h1'),
	};
});
console.log('=== DOM REAL ===');
console.log(JSON.stringify(domReport, null, 2));

// Puente con el content script: GET_TRANSCRIPT → TRANSCRIPT_RESULT
const transcript = await page.evaluate(() => new Promise((resolve) => {
	let done = false;
	const onResult = (e) => {
		const msg = e.detail;
		if (msg?.type !== 'TRANSCRIPT_RESULT') return;
		done = true;
		window.removeEventListener('usb_to_sidebar', onResult);
		resolve({ text_len: (msg.payload?.text || '').length, source: msg.payload?.source, cueCount: msg.payload?.cueCount, head: (msg.payload?.text || '').slice(0, 160) });
	};
	window.addEventListener('usb_to_sidebar', onResult);
	window.dispatchEvent(new CustomEvent('usb_to_content', { detail: { type: 'GET_TRANSCRIPT', payload: { maxChars: 22000 } } }));
	setTimeout(() => { if (!done) resolve({ error: 'sin respuesta del content script en 8 s' }); }, 8000);
}));
// Estado del dock: valor real del input de curso + storage del perfil
const dockState = await page.evaluate(() => {
	const host = document.querySelector('[id^="usb-dock-host-"]');
	const sr = host?.shadowRoot;
	if (!sr) return { error: 'sin dock' };
	const courseInput = sr.querySelector('input[placeholder*="Nombre del curso"]');
	const lessonInput = sr.querySelector('input[placeholder*="Nombre del video"]');
	const ls = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (/agent|usb/i.test(k)) ls[k] = (localStorage.getItem(k) || '').slice(0, 80);
	}
	return {
		courseInput: courseInput?.value ?? null,
		lessonInput: lessonInput?.value ?? null,
		localStorage: ls,
	};
});
const syncDump = await (async () => {
	const cdp = await context.newCDPSession(page);
	// leer sync storage del SW vía evaluación directa
	return null;
})();
const sw2 = context.serviceWorkers()[0];
const storageDump = sw2 ? await sw2.evaluate(() => new Promise((res) => {
	chrome.storage.sync.get(null, (syncData) => {
		chrome.storage.local.get(null, (localData) => {
			res({
				syncKeys: Object.keys(syncData || {}),
				agent_course_name_sync: syncData?.agent_course_name,
				localKeys: Object.keys(localData || {}).slice(0, 20),
			});
		});
	});
})) : { error: 'no sw' };
// Abrir Study + leer valores reales de los inputs y localizar el string demo
try {
	const guard = [...document.querySelectorAll('body *')].length ? null : null;
	// el auth guard vive en el shadow del dock
	const sr0 = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const cont = [...(sr0?.querySelectorAll('button') || [])].find((b) => /Continuar sin cuenta/i.test(b.textContent || ''));
	if (cont) cont.click();
} catch (e) {}
await page.waitForTimeout(1500);
await page.evaluate(() => {
	const sr = document.querySelector('[id^="usb-dock-host-"]')?.shadowRoot;
	const tabs = [...sr.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Study');
	if (tabs[0]) tabs[0].click();
});
await page.waitForTimeout(3000);
await page.evaluate(() => {
	const host = document.querySelector('[id^="usb-dock-host-"]');
	const sr = host?.shadowRoot;
	const tabs = [...sr.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Study');
	if (tabs[0]) tabs[0].click();
});
await page.waitForTimeout(3000);
const inputState = await page.evaluate(() => {
	const host = document.querySelector('[id^="usb-dock-host-"]');
	const sr = host?.shadowRoot;
	if (!sr) return { error: 'sin dock' };
	const courseInput = sr.querySelector('input[placeholder*="Nombre del curso"]');
	const lessonInput = sr.querySelector('input[placeholder*="Nombre del video"]');
	// ¿dónde vive el string "Spring Boot ... Java 25"?
	const holders = [...sr.querySelectorAll('*')]
		.filter((el) => el.children.length === 0 && /Updated for Java 25/.test(el.textContent || ''))
		.slice(0, 4)
		.map((el) => el.tagName + ' | value="' + (el.value ?? '') .slice(0, 50) + '" | text="' + (el.textContent || '').slice(0, 60) + '"');
	return {
		courseInputValue: courseInput?.value ?? null,
		lessonInputValue: lessonInput?.value ?? null,
		springBootHolders: holders,
	};
});
console.log('=== INPUT VALUES ===');
console.log(JSON.stringify(inputState, null, 2));

console.log('=== CHROME STORAGE (sync/local) ===');
console.log(JSON.stringify(storageDump, null, 2));

console.log('=== DOCK STATE (input + localStorage) ===');
console.log(JSON.stringify(dockState, null, 2));

console.log('=== GET_TRANSCRIPT (puente) ===');
console.log(JSON.stringify(transcript, null, 2));

// Intento de playback + transcript toggle, y repetir
await page.evaluate(() => {
	const v = document.querySelector('video');
	if (v) { v.muted = true; v.play?.().catch(() => undefined); }
	const toggle = [...document.querySelectorAll('button')].find((b) => /transcript|transcripci/i.test(b.textContent || ''));
	if (toggle) toggle.click();
});
await page.waitForTimeout(9000);
const domReport2 = await page.evaluate(() => ({
	transcriptPanel: Boolean(document.querySelector('[data-purpose="transcript-panel"]')),
	transcriptCues: document.querySelectorAll('[data-purpose="transcript-cue"]').length,
	videoTime: document.querySelector('video')?.currentTime ?? null,
	videoPaused: document.querySelector('video')?.paused ?? null,
	captionsCue: Boolean(document.querySelector('[data-purpose="captions-cue"], [class*="captions-display--captions-cue-text"]')),
}));
console.log('=== DOM tras playback+transcript ===');
console.log(JSON.stringify(domReport2, null, 2));
const transcript2 = await page.evaluate(() => new Promise((resolve) => {
	let done = false;
	const onResult = (e) => {
		const msg = e.detail;
		if (msg?.type !== 'TRANSCRIPT_RESULT') return;
		done = true;
		window.removeEventListener('usb_to_sidebar', onResult);
		resolve({ text_len: (msg.payload?.text || '').length, source: msg.payload?.source, cueCount: msg.payload?.cueCount, head: (msg.payload?.text || '').slice(0, 160) });
	};
	window.addEventListener('usb_to_sidebar', onResult);
	window.dispatchEvent(new CustomEvent('usb_to_content', { detail: { type: 'GET_TRANSCRIPT', payload: { maxChars: 22000 } } }));
	setTimeout(() => { if (!done) resolve({ error: 'sin respuesta' }); }, 8000);
}));
console.log('=== GET_TRANSCRIPT tras playback ===');
console.log(JSON.stringify(transcript2, null, 2));

await page.screenshot({ path: path.join(repoRoot, 'qa-udemy-probe.png') });
await context.close();
process.exit(0);
