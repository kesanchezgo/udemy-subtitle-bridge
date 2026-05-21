import { buildGeminiGenerateContentUrl, initGeminiKeys, normalizeGeminiKeys } from './gemini-config';

const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const UDEMY_COURSE_MATCH = 'https://*.udemy.com/course/*';
const LOCAL_AI_HEALTH_ENDPOINTS = [
	'http://127.0.0.1:8010/health',
	'http://127.0.0.1:8010/v1/models',
	'http://localhost:8010/health',
	'http://localhost:8010/v1/models'
];
const LOCAL_AI_CHAT_ENDPOINTS = [
	'http://127.0.0.1:8010/v1/chat/completions',
	'http://localhost:8010/v1/chat/completions'
];
const LOCAL_AI_HEALTH_CACHE_MS = 15_000;

type ExtensionMessage = {
	type?: string;
	enabled?: boolean;
	srt?: string;
	srtText?: string;
	fileName?: string;
	transcriptText?: string;
	lectureKey?: string;
	courseSlug?: string;
	lectureId?: string;
};

const chromeApi = (globalThis as typeof globalThis & { chrome?: any }).chrome;
let localAiHealthCache: { checkedAt: number; ok: boolean } | null = null;

void initGeminiKeys();

function getConfiguredContentScriptFiles(): string[] {
	const manifest = chromeApi?.runtime?.getManifest?.();
	const contentScripts = manifest?.content_scripts as Array<{ matches?: string[]; js?: string[] }> | undefined;
	if (!Array.isArray(contentScripts)) {
		return [];
	}

	const lectureScript = contentScripts.find((entry) =>
		Array.isArray(entry.matches) && entry.matches.includes(UDEMY_COURSE_MATCH)
	);

	return Array.isArray(lectureScript?.js)
		? lectureScript.js.filter((file) => typeof file === 'string' && file.trim().length > 0)
		: [];
}

async function reinjectLatestContentScriptIntoOpenLectureTabs() {
	if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) {
		return;
	}

	const scriptFiles = getConfiguredContentScriptFiles();
	if (!scriptFiles.length) {
		return;
	}

	const tabs = await chromeApi.tabs.query({ url: [UDEMY_COURSE_MATCH] });
	for (const tab of tabs as Array<{ id?: number }>) {
		if (typeof tab.id !== 'number') {
			continue;
		}

		try {
			await chromeApi.scripting.executeScript({
				target: { tabId: tab.id, allFrames: false },
				files: scriptFiles
			});
		} catch (_error) {
			// Tab may be restricted/unavailable while navigating; ignore and continue.
		}
	}
}

function setDockActionState(tabId: number, enabled: boolean) {
	chromeApi.action?.setBadgeText?.({ tabId, text: enabled ? '' : 'OFF' });
	chromeApi.action?.setBadgeBackgroundColor?.({ tabId, color: enabled ? '#7c3aed' : '#52525b' });
	chromeApi.action?.setTitle?.({
		tabId,
		title: enabled ? 'Ocultar Subtitle Bridge' : 'Mostrar Subtitle Bridge'
	});
}

function readDockEnabledFromResponse(response: unknown): boolean | null {
	if (!response || typeof response !== 'object') {
		return null;
	}

	const value = (response as { enabled?: unknown }).enabled;
	return typeof value === 'boolean' ? value : null;
}

function sendDockToggle(tabId: number): Promise<unknown> {
	return new Promise((resolve, reject) => {
		if (!chromeApi?.tabs?.sendMessage) {
			reject(new Error('Chrome tabs messaging API is not available.'));
			return;
		}

		chromeApi.tabs?.sendMessage?.(tabId, { type: 'TOGGLE_DOCK_VISIBILITY' }, (response: unknown) => {
			const err = chromeApi.runtime?.lastError;
			if (err) {
				reject(new Error(err.message || String(err)));
				return;
			}

			resolve(response);
		});
	});
}

async function injectConfiguredContentScript(tabId: number) {
	if (!chromeApi?.scripting?.executeScript) {
		throw new Error('Chrome scripting API is not available.');
	}

	const scriptFiles = getConfiguredContentScriptFiles();
	if (!scriptFiles.length) {
		throw new Error('No content script files are configured.');
	}

	await chromeApi.scripting.executeScript({
		target: { tabId, allFrames: false },
		files: scriptFiles
	});
}

async function toggleDockForTab(tab: { id?: number }) {
	if (typeof tab?.id !== 'number') {
		return;
	}

	try {
		const response = await sendDockToggle(tab.id);
		const enabled = readDockEnabledFromResponse(response);
		if (enabled !== null) {
			setDockActionState(tab.id, enabled);
		}
		return;
	} catch (_firstError) {
		// A freshly reloaded extension can leave an existing Udemy tab without the
		// latest content script. Inject once, then retry the user action.
	}

	try {
		await injectConfiguredContentScript(tab.id);
		await new Promise((resolve) => setTimeout(resolve, 120));
		const response = await sendDockToggle(tab.id);
		const enabled = readDockEnabledFromResponse(response);
		if (enabled !== null) {
			setDockActionState(tab.id, enabled);
		}
	} catch (error) {
		chromeApi.action?.setBadgeText?.({ tabId: tab.id, text: '' });
		chromeApi.action?.setTitle?.({
			tabId: tab.id,
			title: `Subtitle Bridge no está activo en esta pestaña: ${toErrorMessage(error)}`
		});
	}
}

async function checkLocalAiHealth(): Promise<boolean> {
	const now = Date.now();
	if (localAiHealthCache && now - localAiHealthCache.checkedAt < LOCAL_AI_HEALTH_CACHE_MS) {
		return localAiHealthCache.ok;
	}

	let ok = false;
	for (const endpoint of LOCAL_AI_HEALTH_ENDPOINTS) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 1200);
		try {
			const response = await fetch(endpoint, {
				method: 'GET',
				cache: 'no-store',
				signal: controller.signal
			});
			if (response.ok) {
				ok = true;
				break;
			}
		} catch (_error) {
			// Keep probing the next local endpoint.
		} finally {
			clearTimeout(timeout);
		}
	}

	localAiHealthCache = { checkedAt: now, ok };
	return ok;
}

chromeApi?.runtime?.onInstalled?.addListener(() => {
	void initGeminiKeys();
	void reinjectLatestContentScriptIntoOpenLectureTabs();
});

chromeApi?.runtime?.onStartup?.addListener(() => {
	void initGeminiKeys();
	void reinjectLatestContentScriptIntoOpenLectureTabs();
});

chromeApi?.action?.onClicked?.addListener((tab: { id?: number }) => {
	void toggleDockForTab(tab);
});

chromeApi?.storage?.onChanged?.addListener((changes: Record<string, unknown>, areaName: string) => {
	if (areaName === 'local' && ('usg_gemini_api_keys' in changes || 'usg_gemini_model' in changes)) {
		void initGeminiKeys();
	}
});

chromeApi?.runtime?.onMessage?.addListener((message: ExtensionMessage, sender: unknown, sendResponse: (response: unknown) => void) => {
	const type = message && message.type;

	if (type === 'USG_DOCK_VISIBILITY_CHANGED') {
		const tabId = (sender as { tab?: { id?: number } } | undefined)?.tab?.id;
		if (typeof tabId === 'number') {
			const enabled = message.enabled !== false;
			setDockActionState(tabId, enabled);
		}
		sendResponse({ ok: true });
		return false;
	}

	if (type === 'USG_CHECK_LOCAL_AI') {
		checkLocalAiHealth()
			.then((ok) => sendResponse({ ok: true, connected: ok }))
			.catch((error) => sendResponse({ ok: false, connected: false, error: toErrorMessage(error) }));
		return true;
	}

	if (type === 'USG_DOWNLOAD_EN_SRT_AUTO') {
		const fileName = sanitizeFileName(String(message.fileName || 'udemy_en.srt'));
		const srt = String(message.srt || '');
		if (!srt.trim()) {
			sendResponse({ ok: false, error: 'SRT content is empty.' });
			return false;
		}

		const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(srt)}`;
		chromeApi.downloads.download(
			{
				url: dataUrl,
				filename: `UdemySubtitleBridge/${fileName}`,
				saveAs: false,
				conflictAction: 'uniquify'
			},
			(downloadId: number) => {
				const err = chromeApi.runtime.lastError;
				if (err) {
					sendResponse({ ok: false, error: err.message || 'Automatic download failed.' });
					return;
				}
				sendResponse({ ok: true, downloadId: Number(downloadId) || 0 });
			}
		);

		return true;
	}

	if (type === 'USG_TRANSLATE_EN_SRT_AUTO') {
		const srtText = String(message.srtText || '');
		const lectureKey = String(message.lectureKey || '');
		const courseSlug = String(message.courseSlug || '');

		translateSrtWithCache(srtText, lectureKey, courseSlug)
			.then((result) => sendResponse({ ok: true, ...result }))
			.catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));

		return true;
	}

	if (type === 'USG_GENERATE_LEARNING_PANEL') {
		const transcriptText = String(message.transcriptText || '');
		const metadata = {
			lectureKey: String(message.lectureKey || ''),
			courseSlug: String(message.courseSlug || ''),
			lectureId: String(message.lectureId || '')
		};

		generateLearningPanelFromTranscript(transcriptText, metadata)
			.then((result) => sendResponse({ ok: true, ...result }))
			.catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));

		return true;
	}

	return false;
});

function sanitizeFileName(fileName: string) {
	const base = fileName.replace(/[\\/:*?"<>|]/g, '-').trim();
	if (!base) {
		return 'udemy_en.srt';
	}
	if (/\.srt$/i.test(base)) {
		return base;
	}
	return `${base}.srt`;
}

function toErrorMessage(error: unknown) {
	if (!error) {
		return 'Unknown error.';
	}
	if (typeof error === 'string') {
		return error;
	}
	if (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
		const message = (error as { message?: string }).message;
		if (message && message.trim()) {
			return message;
		}
	}
	return String(error);
}

type SrtBlock = {
	index: number;
	timeLine: string;
	text: string;
};

function parseSrtBlocks(srtText: string): SrtBlock[] {
	const normalized = String(srtText || '').replace(/\r/g, '').trim();
	if (!normalized) {
		return [];
	}

	return normalized
		.split(/\n\n+/)
		.map((block) => block.split('\n').map((line) => line.trim()))
		.filter((lines) => lines.length >= 3)
		.map((lines) => ({
			index: Number(lines[0]) || 0,
			timeLine: lines[1],
			text: lines.slice(2).join(' ').trim()
		}))
		.filter((block) => block.timeLine.includes('-->') && block.text.length > 0);
}

function formatSrtBlocks(blocks: SrtBlock[]) {
	return blocks
		.map((block, index) => `${index + 1}\n${block.timeLine}\n${block.text}`)
		.join('\n\n');
}

function formatOriginalSrtBlocks(blocks: SrtBlock[]) {
	return blocks
		.map((block) => `${block.index}\n${block.timeLine}\n${block.text}`)
		.join('\n\n');
}

function stripModelFences(text: string) {
	return String(text || '')
		.replace(/^\s*```(?:srt|text)?\s*/i, '')
		.replace(/\s*```\s*$/i, '')
		.trim();
}

function looksLikeStudyFeedback(text: string) {
	const upper = String(text || '').toUpperCase();
	return (
		upper.includes('[PARCIAL]') ||
		upper.includes('[CORRECTO]') ||
		upper.includes('[INCORRECTO]') ||
		upper.includes('BIEN:') ||
		upper.includes('FALTÓ:') ||
		upper.includes('FALTO:') ||
		upper.includes('PROFUNDIZACIÓN:') ||
		upper.includes('PROFUNDIZACION:')
	);
}

function buildSrtTranslationPrompt(blocks: SrtBlock[]) {
	return [
		'Actua como traductor tecnico experto para cursos de programacion.',
		'Traduce este SRT de ingles a espanol latino neutro.',
		'',
		'REGLAS OBLIGATORIAS:',
		'1. Devuelve SOLO SRT plano. Sin markdown, sin explicaciones, sin comentarios.',
		'2. Conserva exactamente los numeros de bloque y timestamps.',
		'3. No unas, no dividas, no reordenes bloques.',
		'4. Traduce solo el texto del subtitulo.',
		'5. Mantén terminos tecnicos y nombres propios en ingles cuando sea mas claro: JVM, bytecode, compiler, class, object, heap, stack, thread, Spring Boot, Java, API, framework.',
		'6. No generes feedback de estudio, porcentajes, BIEN/FALTO/PROFUNDIZACION ni evaluaciones.',
		`7. IMPORTANTE: El SRT tiene exactamente ${blocks.length} bloques. Tu respuesta debe tener exactamente ${blocks.length} bloques traducidos.`,
		'',
		'SRT EN:',
		formatOriginalSrtBlocks(blocks)
	].join('\n');
}

function extractOpenAiText(data: unknown): string {
	const choice = (data as {
		choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
	})?.choices?.[0];
	const content = choice?.message?.content ?? choice?.text;
	return typeof content === 'string' ? content.trim() : '';
}

async function requestLocalSrtText(prompt: string, maxOutputTokens: number): Promise<string> {
	let lastError: Error | null = null;

	for (const endpoint of LOCAL_AI_CHAT_ENDPOINTS) {
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'local-model',
					messages: [
						{
							role: 'system',
							content: 'Responde unicamente con SRT traducido. No incluyas markdown, analisis, feedback ni explicaciones.'
						},
						{ role: 'user', content: prompt }
					],
					temperature: 0.15,
					max_tokens: maxOutputTokens,
					stream: false
				})
			});

			const responseText = await response.text();
			if (!response.ok) {
				throw new Error(`Local AI HTTP ${response.status}: ${responseText.slice(0, 260)}`);
			}

			const text = extractOpenAiText(JSON.parse(responseText));
			if (!text) {
				throw new Error('Local AI returned empty content.');
			}

			return text;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
		}
	}

	throw lastError || new Error('Local AI batch translation failed.');
}

function normalizeTranslatedChunk(originalBlocks: SrtBlock[], responseText: string): SrtBlock[] {
	const parsed = parseSrtBlocks(stripModelFences(responseText));

	// Accept if at least 90% of blocks were translated; fill missing with original EN
	const minAcceptable = Math.floor(originalBlocks.length * 0.9);
	if (parsed.length < minAcceptable) {
		throw new Error(`Gemini returned ${parsed.length}/${originalBlocks.length} SRT blocks.`);
	}

	const byIndex = new Map(parsed.map((block) => [block.index, block]));
	return originalBlocks.map((original, fallbackIndex) => {
		const translated = byIndex.get(original.index) || parsed[fallbackIndex];
		const text = String(translated?.text || '').trim();
		if (!text) {
			// Use original EN text for missing blocks instead of failing
			return {
				index: original.index,
				timeLine: original.timeLine,
				text: original.text
			};
		}
		if (looksLikeStudyFeedback(text)) {
			throw new Error(`Gemini/background returned Study feedback instead of translation at block ${original.index}.`);
		}
		return {
			index: original.index,
			timeLine: original.timeLine,
			text
		};
	});
}

async function translateSrtWithLocal(blocks: SrtBlock[]) {
	const response = await requestLocalSrtText(buildSrtTranslationPrompt(blocks), 32768);
	return normalizeTranslatedChunk(blocks, response);
}

async function translateSrtWithGemini(blocks: SrtBlock[]) {
	await initGeminiKeys();
	if (getGeminiApiKeys().length === 0) {
		throw new Error('No Gemini API keys configured.');
	}

	const response = await requestGeminiText(buildSrtTranslationPrompt(blocks), 0.15, 32768);
	return normalizeTranslatedChunk(blocks, response);
}

// ── Translation Cache (chrome.storage.local, 7 days TTL) ──────────────────────

const CACHE_PREFIX = 'usg_srt_cache_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCacheKey(lectureKey: string): string {
	return `${CACHE_PREFIX}${lectureKey}`;
}

async function getCachedTranslation(lectureKey: string): Promise<{ srt: string; blockCount: number } | null> {
	if (!lectureKey || !chromeApi?.storage?.local) return null;

	return new Promise((resolve) => {
		chromeApi.storage.local.get([getCacheKey(lectureKey)], (result: Record<string, unknown>) => {
			const entry = result[getCacheKey(lectureKey)] as {
				srt?: string;
				blockCount?: number;
				timestamp?: number;
			} | undefined;

			if (!entry || !entry.srt || !entry.timestamp) {
				resolve(null);
				return;
			}

			// Check TTL
			if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
				// Expired — remove it
				chromeApi.storage.local.remove([getCacheKey(lectureKey)]);
				resolve(null);
				return;
			}

			resolve({ srt: entry.srt, blockCount: entry.blockCount || 0 });
		});
	});
}

async function setCachedTranslation(lectureKey: string, srt: string, blockCount: number): Promise<void> {
	if (!lectureKey || !chromeApi?.storage?.local) return;

	return new Promise((resolve) => {
		chromeApi.storage.local.set({
			[getCacheKey(lectureKey)]: {
				srt,
				blockCount,
				timestamp: Date.now()
			}
		}, () => resolve());
	});
}

async function translateSrtWithCache(
	sourceSrt: string,
	lectureKey: string,
	_courseSlug: string
): Promise<{ srt: string; blockCount: number; chunkCount: number; cached?: boolean }> {
	// 1. Check cache first
	if (lectureKey) {
		const cached = await getCachedTranslation(lectureKey);
		if (cached) {
			return { ...cached, chunkCount: 1, cached: true };
		}
	}

	// 2. No cache — translate
	const result = await translateSrtToSpanish(sourceSrt);

	// 3. Save to cache
	if (lectureKey && result.srt) {
		void setCachedTranslation(lectureKey, result.srt, result.blockCount);
	}

	return result;
}

async function translateSrtToSpanish(sourceSrt: string) {
	const blocks = parseSrtBlocks(sourceSrt);
	if (!blocks.length) {
		throw new Error('EN SRT is empty or invalid.');
	}

	let translatedBlocks: SrtBlock[];
	let localError: unknown = null;
	try {
		if (await checkLocalAiHealth()) {
			translatedBlocks = await translateSrtWithLocal(blocks);
		} else {
			throw new Error('Local AI is not connected.');
		}
	} catch (error) {
		localError = error;
		try {
			translatedBlocks = await translateSrtWithGemini(blocks);
		} catch (geminiError) {
			throw new Error(`Batch SRT translation failed. Local: ${toErrorMessage(localError)} Gemini: ${toErrorMessage(geminiError)}`);
		}
	}

	// Detect untranslated blocks (text identical to original EN)
	const missingBlocks: SrtBlock[] = [];
	for (let i = 0; i < translatedBlocks.length; i++) {
		if (i < blocks.length && translatedBlocks[i].text === blocks[i].text) {
			missingBlocks.push(blocks[i]);
		}
	}

	// If there are missing blocks, try a second pass just for those
	if (missingBlocks.length > 0 && missingBlocks.length <= Math.ceil(blocks.length * 0.15)) {
		try {
			const patchBlocks = await translateSrtWithGemini(missingBlocks);
			const patchMap = new Map(patchBlocks.map((b) => [b.index, b]));
			translatedBlocks = translatedBlocks.map((block) => {
				const patch = patchMap.get(block.index);
				if (patch && patch.text && patch.text !== block.text) {
					return { ...block, text: patch.text };
				}
				return block;
			});
		} catch (_patchError) {
			// Patch failed — use what we have (some blocks stay in EN)
		}
	}

	return {
		srt: `${formatSrtBlocks(translatedBlocks)}\n`,
		blockCount: translatedBlocks.length,
		chunkCount: 1
	};
}

// ── Gemini API helpers for learning panel generation ──

function getGeminiApiKeys(): string[] {
	const g = globalThis as typeof globalThis & { USB_GEMINI_API_KEYS?: string[] };
	return Array.isArray(g.USB_GEMINI_API_KEYS) ? normalizeGeminiKeys(g.USB_GEMINI_API_KEYS) : [];
}

function getGeminiModel(): string {
	const g = globalThis as typeof globalThis & { USB_GEMINI_MODEL?: string };
	return String(g.USB_GEMINI_MODEL || GEMINI_DEFAULT_MODEL).trim();
}

async function requestGeminiText(prompt: string, temperature: number, maxOutputTokens: number): Promise<string> {
	await initGeminiKeys();
	const apiKeys = getGeminiApiKeys();
	const model = getGeminiModel();

	if (!apiKeys.length) {
		throw new Error('No Gemini API keys configured.');
	}

	let lastError: Error | null = null;

	for (const apiKey of apiKeys) {
		try {
			const normalizedKey = apiKey.trim();
			const response = await fetch(buildGeminiGenerateContentUrl(model, normalizedKey), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					contents: [{ role: 'user', parts: [{ text: prompt }] }],
					generationConfig: { temperature, maxOutputTokens }
				})
			});

			const responseText = await response.text();
			if (!response.ok) {
				throw new Error(`Gemini HTTP ${response.status}: ${responseText.slice(0, 260)}`);
			}

			const parsed = JSON.parse(responseText);
			const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
			if (!text) {
				throw new Error('Gemini returned empty content.');
			}

			return String(text);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
		}
	}

	throw lastError || new Error('All Gemini API keys failed.');
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch (_error) {
		const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
		if (jsonMatch?.[1]) {
			try {
				return JSON.parse(jsonMatch[1].trim());
			} catch (_innerError) {
				// Return null below.
			}
		}
		return null;
	}
}

function buildStudyPrompt(transcriptText: string, metadata: { courseSlug: string; lectureId: string }) {
	return [
		'Eres un tutor especializado en Java y Spring Boot para desarrolladores que se preparan para entrevistas semi-senior.',
		'',
		`CURSO: ${metadata.courseSlug || 'Java In-Depth'}`,
		`LECCIÓN: ${metadata.lectureId || 'Desconocida'}`,
		'',
		'TRANSCRIPCIÓN DEL VIDEO:',
		transcriptText.slice(0, 18000),
		'',
		'Genera un JSON VÁLIDO (sin markdown, sin ```json) con esta estructura EXACTA:',
		'{',
		'  "relevance": { "score": 0-100, "reason": "explicación breve" },',
		'  "keyConcepts": ["concepto 1", "concepto 2", "concepto 3"],',
		'  "quickWin": "una acción rápida que el estudiante puede hacer ahora",',
		'  "questions": [',
		'    { "q": "pregunta", "bloomLevel": "Recordar|Comprender|Aplicar|Analizar", "hint": "pista", "answer": "respuesta ideal" }',
		'  ],',
		'  "application": {',
		'    "isCode": true,',
		'    "setup": "contexto del ejercicio",',
		'    "challenge": "código con bug o ejercicio",',
		'    "solution": "solución explicada"',
		'  },',
		'  "interviewQ": { "q": "pregunta de entrevista", "idealAnswer": "respuesta ideal" },',
		'  "nextAction": "siguiente paso recomendado",',
		'  "ankiCards": [',
		'    { "front": "pregunta flashcard", "back": "respuesta flashcard", "tag": "tema" }',
		'  ]',
		'}',
		'',
		'REGLAS:',
		'- Genera 2-4 preguntas de diferentes niveles de Bloom',
		'- Genera 3-5 tarjetas Anki',
		'- El challenge DEBE ser código Java/Spring Boot con bugs reales',
		'- Todo en español excepto términos técnicos (JVM, heap, thread, etc.)',
		'- Responde SOLO con el JSON, sin texto adicional'
	].join('\n');
}

async function generateLearningPanelFromTranscript(transcriptText: string, metadata: { lectureKey: string; courseSlug: string; lectureId: string }) {
	const cleaned = String(transcriptText || '').replace(/\r/g, '').trim();
	if (cleaned.length < 120) {
		throw new Error('Transcript is too short for learning panel generation.');
	}

	const apiKeys = getGeminiApiKeys();

	if (apiKeys.length > 0) {
		try {
			const prompt = buildStudyPrompt(cleaned, metadata);
			const reply = await requestGeminiText(prompt, 0.35, 2800);
			const parsed = safeJsonParse(reply);

			if (parsed && typeof parsed === 'object') {
				return { payload: parsed, raw: cleaned };
			}
		} catch (error) {
			console.warn('[USG] Gemini learning panel failed, using provisional:', toErrorMessage(error));
		}
	}

	const summary = cleaned.split(/\s+/).slice(0, 24).join(' ');
	return {
		payload: {
			relevance: {
				score: 70,
				reason: `Resumen provisional para ${metadata.courseSlug || 'el curso'} y ${metadata.lectureId || 'la lección actual'}.`
			},
			keyConcepts: [summary, 'Revisión guiada del contenido', 'Aplicación práctica del tema'],
			quickWin: 'Repasa el segmento más denso y escribe una explicación de 2 líneas.',
			questions: [],
			application: {
				isCode: false,
				setup: 'Contexto generado desde transcript local.',
				challenge: summary,
				solution: 'Usar la lección como base para práctica posterior.'
			},
			interviewQ: {
				q: '¿Cuál es la idea principal que deja esta lección?',
				idealAnswer: summary
			},
			nextAction: 'Convertir la lección en tarjetas o ejercicios de repaso.',
			ankiCards: []
		},
		raw: cleaned
	};
}
