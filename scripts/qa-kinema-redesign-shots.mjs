/**
 * Capturas del rediseño Kinema para el gate visual: SettingsSheet (4
 * secciones), portal de vocabulario, chip de glosario sobre el video,
 * historial, paso Anki y dock inicial — en tema oscuro y claro.
 *
 * Usa el MISMO fixture que el E2E (data-purpose, track VTT, vídeo), siembra
 * ANTES de refrescar y fuerza el tema por contexto (colorScheme), para que
 * cada captura corresponda al tema indicado.
 *
 * Uso: node scripts/qa-kinema-redesign-shots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const OUT = 'tmp/redesign-shots';
const distDir = path.resolve('dist');
const repoRoot = process.cwd();
const MODEL = process.env.USB_MODEL || 'cline-free/mimo-v2.6-flash';

const COURSE = 'Java Programming Bootcamp: Spring Boot & REST APIs';
const LESSON = 'Platform Independence in Java';

const TRANSCRIPT_CUES = [
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

// VTT válido: número de cue, tiempos incrementales (mismo formato que el E2E).
const FIXTURE_VTT = 'WEBVTT\n\n' + TRANSCRIPT_CUES.map((c, i) => {
	const t2 = (s) => {
		const m = Math.floor(s / 60), sec = (s % 60).toFixed(0).padStart(2, '0');
		return '00:' + String(m).padStart(2, '0') + ':' + sec + '.000';
	};
	return (i + 1) + '\n' + t2(i * 5) + ' --> ' + t2(i * 5 + 4.5) + '\n' + c;
}).join('\n\n') + '\n';

const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${COURSE}</title></head>
<body>
<h1 data-purpose="course-title">${COURSE}</h1>
<div class="description" data-purpose="course-description"><p>Complete Java course with Spring Boot, Spring MVC, REST APIs, JPA/Hibernate and a real project.</p></div>
<main>
  <h2 data-purpose="curriculum-item-view-title">${LESSON}</h2>
  <video id="qa-video" controls muted>
    <track kind="subtitles" srclang="en" label="English" default src="/qa-captions.vtt">
  </video>
  <div data-purpose="transcript-panel">
${TRANSCRIPT_CUES.map((c) => `    <div data-purpose="transcript-cue">${c}</div>`).join('\n')}
  </div>
</main>
</body></html>`;

function ensureCert() {
	const dir = path.join(tmpdir(), 'usb-qa-certs');
	const key = path.join(dir, 'key.pem');
	const cert = path.join(dir, 'cert.pem');
	if (fs.existsSync(key) && fs.existsSync(cert)) return { key, cert };
	fs.mkdirSync(dir, { recursive: true });
	spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=udemy.com'], { stdio: 'pipe' });
	return { key, cert };
}
const { key, cert } = ensureCert();
const server = createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
	if (req.url?.endsWith('qa-captions.vtt')) {
		res.writeHead(200, { 'Content-Type': 'text/vtt' });
		res.end(FIXTURE_VTT);
		return;
	}
	res.writeHead(200, { 'Content-Type': 'text/html' });
	res.end(PAGE);
});
let port = 443;
server.on('error', () => { port += 1; if (port < 4460) server.listen(port, '127.0.0.1'); });
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const url = `https://www.udemy.com:${port}/course/java-bootcamp/learn/lecture/1/`;

fs.mkdirSync(OUT, { recursive: true });
const shot = async (page, name) => {
	await page.screenshot({ path: path.join(OUT, name + '.png') });
	console.log('  ✓', name + '.png');
};
const dock = (page) => page.locator('[id^="usb-dock-host-"]');

const openSettingsSection = async (page, section) => {
	// El deep-link abre la hoja Y expande la sección pedida.
	await page.evaluate((s) => {
		try { localStorage.setItem('kinema_settings_open_section', s); } catch {}
		window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: s } }));
	}, section);
	await page.waitForTimeout(2600);
};

async function runPass(colorScheme) {
	fs.rmSync(path.join(repoRoot, `temp_profile_r_${colorScheme}`), { recursive: true, force: true });
	const context = await chromium.launchPersistentContext(path.join(repoRoot, `temp_profile_r_${colorScheme}`), {
		headless: false,
		colorScheme,
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
	await page.goto(url);
	await page.waitForSelector('[id^="usb-dock-host-"]', { timeout: 20000 });

	// Semilla vía SW + refresh: el dock monta con datos y el tema del contexto.
	const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
	if (sw) {
		await sw.evaluate(({ course, lesson, model }) => new Promise((resolve) => {
			chrome.storage.local.set({
				usg_ai_provider_config: { kind: 'openai', baseUrl: 'http://127.0.0.1:6660/v1', apiKey: 'gmifree', model },
				enabled: true,
				obsidian_export_config: { vaultName: 'QA Vault', sourcesFolder: 'wiki/fuentes', mocsFolder: 'cursos', includeCards: true, autoExport: false, includeRawSrt: false },
				'usb_vocab_session_java programming bootcamp: spring boot & rest apis|platform independence in java|en': {
					course, lesson,
					config: { rootDeck: 'Kinema', targetLang: 'en', targetLangLabel: 'English', baseLangLabel: 'español', minLevel: 'B1', maxWords: 8, audioMode: 'field' },
					candidates: [
						{ word: 'platform', level: 'B1', pos: 'noun', meaning: 'plataforma', phonetic: '/ˈplætfɔːrm/', monolingual: 'the system on which software runs', sentence: 'The JVM is platform-specific.', sentenceTranslation: 'La JVM es específica de la plataforma.' },
						{ word: 'bytecode', level: 'C1', pos: 'noun', meaning: 'código de bytes', phonetic: '/ˈbaɪtkoʊd/', monolingual: 'compiled code that a virtual machine executes', sentence: 'javac produces bytecode.', sentenceTranslation: 'javac produce bytecode.' },
						{ word: 'interpret', level: 'B2', pos: 'verb', meaning: 'interpretar', phonetic: '/ɪnˈtɜːrprɪt/', monolingual: 'to execute instructions one by one', sentence: 'The JVM interprets bytecode at runtime.', sentenceTranslation: 'La JVM interpreta el bytecode en tiempo de ejecución.' },
					],
					selected: ['platform', 'bytecode'],
					demo: false,
					exports: [],
				},
			}, () => chrome.storage.sync.set({
				usb_vocab_config: { rootDeck: 'Kinema', targetLang: 'en', targetLangLabel: 'English', baseLangLabel: 'español', minLevel: 'B1', maxWords: 8, audioMode: 'field' },
				'usb_history_lecture::java-bootcamp::platform-independence': {
					courseId: 'java-bootcamp', lectureId: 'platform-independence',
					courseName: course, lectureName: lesson,
					objective: 'Dominar la independencia de plataforma de Java para entrevistas senior',
					startedAt: Date.now() - 3600000, updatedAt: Date.now(),
					status: 'completed', confidence: 'clear',
					studyContent: {
						relevance: { score: 92, reason: 'Mecanismo central de portabilidad.' },
						keyConcepts: ['javac compila a bytecode', 'la JVM interpreta en runtime'],
						quickWin: 'Ejecuta un .class en otra plataforma',
						questions: [],
						application: { setup: 'c', challenge: 'x', solution: 'y', isCode: false },
						interviewQ: { q: '¿Por qué Java es portable y rápido?', idealAnswer: 'Bytecode + JVM con JIT.' },
						nextAction: 'Ejecuta con -XX:+PrintCompilation',
						ankiCards: [],
					},
					ankiCards: [
						{ id: 'card-001', front: '¿Qué produce javac?', back: 'Bytecode.', tags: ['java'], type: 'concepto' },
						{ id: 'card-002', front: '¿Qué imprime 1+2+3?', back: '6.', tags: ['java'], type: 'codigo' },
					],
					ankiCardsCount: 2, questionsComplete: true, questions: [], version: 1,
				},
			}, resolve));
		}), { course: COURSE, lesson: LESSON, model: MODEL });
		// El acordeón de Ajustes persiste su sección abierta en localStorage.
		await page.evaluate(() => { try { localStorage.setItem('kinema_settings_open_section', 'vocabulary'); } catch {} });
		await page.reload();
		await page.waitForSelector('[id^="usb-dock-host-"]', { timeout: 20000 });
		await page.waitForTimeout(1500);
	}

	await page.locator('text=/Continuar sin cuenta/i').first().click({ timeout: 8000 }).catch(() => {});
	await page.waitForTimeout(1500);

	const s = colorScheme === 'dark' ? 'dark' : 'sepia';

	await dock(page).locator('button:has-text("Study")').first().click({ timeout: 8000 }).catch(() => {});
	await page.waitForTimeout(900);
	await shot(page, `01-dock-study-${s}`);

	await dock(page).locator('button:has-text("Entendido")').first().click({ timeout: 12000 }).catch(() => console.log('   · sin Entendido'));
	await page.waitForTimeout(700);
	await dock(page).locator('button:has-text("Siguiente")').first().click({ timeout: 12000 }).catch(() => {});
	await page.waitForTimeout(700);
	await dock(page).locator('button:has-text("Saltar a la práctica")').first().click({ timeout: 12000 }).catch(() => {});
	await page.waitForTimeout(700);
	await dock(page).locator('button:has-text("Siguiente")').first().click({ timeout: 12000 }).catch(() => {});
	await page.waitForTimeout(2200);
	await shot(page, `02-step5-anki-${s}`);

	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-history')));
	await page.waitForTimeout(1400);
	await shot(page, `03-history-${s}`);
	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-history')));
	await page.waitForTimeout(800);

	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:open-settings', { detail: { section: 'provider' } })));
	await page.waitForTimeout(2400);
	await shot(page, `04-settings-provider-${s}`);

	await openSettingsSection(page, 'vocabulary');
	await shot(page, `05-settings-vocabulary-${s}`);

	await openSettingsSection(page, 'obsidian');
	await shot(page, `06-settings-obsidian-${s}`);

	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
	await page.waitForTimeout(900);

	// Chip de glosario: el overlay lo recibe del portal de vocabulario, así que
	// hay abrirlo una vez más; luego pausar dentro de la cue con la palabra.
	await openSettingsSection(page, 'vocabulary');
	await page.evaluate(() => window.dispatchEvent(new CustomEvent('usb:close-settings')));
	await page.waitForTimeout(1200);
	await page.waitForFunction(() => {
		const v = document.querySelector('video');
		const tr = v?.textTracks?.[0];
		return Boolean(tr && tr.cues && tr.cues.length > 0);
	}, { timeout: 8000 }).catch(() => {});
	await page.evaluate(() => {
		const v = document.querySelector('video');
		if (v) { v.currentTime = 0.3; v.pause?.(); }
	});
	await page.waitForTimeout(2200);
	await page.evaluate(() => document.getElementById('usb-gloss-chip')?.scrollIntoView({ block: 'center' })).catch(() => {});
	await page.waitForTimeout(600);
	await shot(page, `07-gloss-chip-${s}`);

	await context.close();
	fs.rmSync(path.join(repoRoot, `temp_profile_r_${colorScheme}`), { recursive: true, force: true });
}

console.log('── pasada tema oscuro ──');
await runPass('dark');
console.log('── pasada tema claro ──');
await runPass('light');

server.close();
console.log('\nCapturas en ' + OUT + '/');
