import { buildGeminiGenerateContentUrl, initGeminiKeys, markGeminiKeyCooldown, normalizeGeminiKeys, saveGeminiKeys, selectGeminiKeysForPurpose, setGeminiKeysSync, type GeminiPurpose } from './gemini-config';
import { buildAnthropicBody, buildOpenAiCompatibleBody, buildProviderChatUrl, buildProviderHeaders, extractProviderText, getAiProviderConfig, initAiProviderConfig, normalizeAiProviderConfig, AI_PROVIDER_STORAGE_KEY, type AiProviderConfig } from './app/services/ai-providers';
import {
	buildObjectivesPrompt,
	buildRefinePrompt,
	buildStudyPrompt,
	buildSrtTranslationPrompt,
	estimateAnkiCardTarget,
	formatOriginalSrtBlocks,
	type SrtBlock,
	type StudyMetadata
} from './shared/prompts';

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
	cueCount?: number;
	transcriptTruncated?: boolean;
	lectureKey?: string;
	courseSlug?: string;
	lectureId?: string;
	apiKeys?: unknown;
};

const chromeApi = (globalThis as typeof globalThis & { chrome?: any }).chrome;
let localAiHealthCache: { checkedAt: number; ok: boolean } | null = null;

void initGeminiKeys();
void initAiProviderConfig();

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
	if (areaName === 'local' && AI_PROVIDER_STORAGE_KEY in changes) {
		void initAiProviderConfig();
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

	if (type === 'USG_SYNC_GEMINI_KEYS') {
		const apiKeys = Array.isArray(message.apiKeys)
			? normalizeGeminiKeys(message.apiKeys.map(String))
			: [];
		console.info(`[USG][gemini] sync keys from client: ${describeGeminiKeys(apiKeys)}`);
		setGeminiKeysSync(apiKeys);
		saveGeminiKeys(apiKeys)
			.then(() => sendResponse({ ok: true, source: 'background', keyCount: apiKeys.length }))
			.catch((error) => sendResponse({ ok: false, source: 'background', keyCount: apiKeys.length, error: toErrorMessage(error) }));
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

		translateSrtToSpanish(srtText)
			.then((result) => sendResponse({ ok: true, ...result }))
			.catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));

		return true;
	}

	// Provider validation must run HERE, not in the content script: a fetch to a
	// third-party host from the page's isolated world is subject to CORS and gets
	// blocked, while the service worker has host permissions and is not.
	if (type === 'USG_VALIDATE_PROVIDER') {
		const cfg = (message as { config?: Partial<AiProviderConfig> }).config;
		const requestId = String((message as { requestId?: unknown }).requestId || '');

		// MV3 hazard: a service worker can be torn down while a long fetch is in
		// flight, which surfaces to the caller as "The message port closed before a
		// response was received". So we acknowledge immediately and publish the
		// result to chrome.storage. The caller polls storage keyed by requestId.
		publishProviderValidation(requestId, { status: 'pending', message: 'Validando…' });

		void validateProviderFromBackground(normalizeAiProviderConfig(cfg))
			.then((result) => publishProviderValidation(requestId, result))
			.catch((error) => publishProviderValidation(requestId, { status: 'unreachable', message: toErrorMessage(error) }));

		sendResponse({ ok: true, status: 'pending', message: 'Validando…' });
		return false;
	}

	// Cheap no-op the dock sends on an interval while a probe is running. A
	// service worker is torn down after ~30s idle, and a slow provider probe can
	// outlast that; each inbound message resets the timer and keeps us alive.
	if (type === 'USG_KEEPALIVE') {
		sendResponse({ ok: true });
		return false;
	}

	if (type === 'USG_GENERATE_COURSE_OBJECTIVES') {
		const courseName = String((message as { courseName?: unknown }).courseName || '');
		const description = String((message as { description?: unknown }).description || '');

		generateObjectivesViaGemini(courseName, description)
			.then((result) => sendResponse({ ok: true, ...result }))
			.catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));

		return true;
	}

	if (type === 'USG_REFINE_OBJECTIVE') {
		const courseName = String((message as { courseName?: unknown }).courseName || '');
		const description = String((message as { description?: unknown }).description || '');
		const rawGoal = String((message as { rawGoal?: unknown }).rawGoal || '');

		refineObjectiveViaGemini(courseName, description, rawGoal)
			.then((result) => sendResponse({ ok: true, ...result }))
			.catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));

		return true;
	}

	if (type === 'USG_GENERATE_LEARNING_PANEL') {
		let keySync: Promise<void> = Promise.resolve();
		let incomingApiKeys: string[] = [];
		if (Array.isArray(message.apiKeys)) {
			const apiKeys = normalizeGeminiKeys(message.apiKeys.map(String));
			incomingApiKeys = apiKeys;
			console.info(`[USG][study] incoming apiKeys in generate message: ${describeGeminiKeys(apiKeys)}`);
			if (apiKeys.length > 0) {
				setGeminiKeysSync(apiKeys);
				keySync = saveGeminiKeys(apiKeys);
			}
		}
		const transcriptText = String(message.transcriptText || '');
		const studyMessage = message as ExtensionMessage & {
			courseName?: unknown;
			courseDescription?: unknown;
			lessonName?: unknown;
			objective?: unknown;
			cueCount?: unknown;
			transcriptTruncated?: unknown;
		};
		const metadata = {
			lectureKey: String(message.lectureKey || ''),
			courseSlug: String(message.courseSlug || ''),
			lectureId: String(message.lectureId || ''),
			courseName: String(studyMessage.courseName || ''),
			courseDescription: String(studyMessage.courseDescription || ''),
			lessonName: String(studyMessage.lessonName || ''),
			objective: String(studyMessage.objective || ''),
			cueCount: typeof studyMessage.cueCount === 'number' ? studyMessage.cueCount : undefined,
			transcriptTruncated: Boolean(studyMessage.transcriptTruncated)
		};

		keySync
			.then(() => generateLearningPanelFromTranscript(transcriptText, metadata, incomingApiKeys))
			.then((result) => sendResponse({ ok: true, source: 'background', ...result }))
			.catch((error) => {
				const studyDebug = error && typeof error === 'object'
					? (error as { studyDebug?: StudyDebugPayload }).studyDebug
					: undefined;
				loadGeminiKeysForBackground(incomingApiKeys)
					.then(({ debug }) => sendResponse({
						ok: false,
						source: 'background',
						error: toErrorMessage(error),
						debug: { ...debug, ...(studyDebug || {}) }
					}))
					.catch(() => sendResponse({ ok: false, source: 'background', error: toErrorMessage(error) }));
			});

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

function parseSrtBlocks(srtText: string): SrtBlock[] {
	const normalized = String(srtText || '').replace(/\r/g, '').trim();
	if (!normalized) {
		return [];
	}

	return normalized
		.split(/\n{2,}/)
		.map((block) => {
			const lines = block.split('\n').map((line) => line.trim());
			// Preserve the cue's multi-line text layout: keep inner line breaks
			// instead of collapsing the whole cue into a single line.
			return {
				index: Number(lines[0]) || 0,
				timeLine: lines[1],
				text: lines.slice(2).join('\n').trim()
			};
		})
		.filter((block) => block.timeLine && block.timeLine.includes('-->') && block.text.length > 0);
}

function formatSrtBlocks(blocks: SrtBlock[]) {
	return blocks
		.map((block, index) => `${index + 1}\n${block.timeLine}\n${block.text}`)
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
	return originalBlocks.map((original) => {
		// Only trust an index-matched translation. A positional fallback could
		// silently assign another cue's text, so missing blocks stay in EN.
		const translated = byIndex.get(original.index);
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

async function translateSrtWithProvider(blocks: SrtBlock[]) {
	const response = await requestConfiguredProviderText(buildSrtTranslationPrompt(blocks), 0.15, 32768);
	return normalizeTranslatedChunk(blocks, response);
}

async function translateSrtWithGemini(blocks: SrtBlock[]) {
	await initGeminiKeys();
	if (getGeminiApiKeys().length === 0) {
		throw new Error('No Gemini API keys configured.');
	}

	const response = await requestGeminiText(buildSrtTranslationPrompt(blocks), 0.15, 32768, 'translation', (notice) => {
		console.warn(`[USG][translation] retry round ${notice.round}/${notice.totalRounds} after ${(notice.waitMs / 1000).toFixed(0)}s — ${notice.reason}`);
		broadcastRetryNotice('translation', notice);
	});
	return normalizeTranslatedChunk(blocks, response);
}

// ── Translation Cache MIGRATED to client-side cacheService ───────────────────
// The background no longer caches translations. The sidebar (cacheService)
// handles all caching with TTL configurable by the user.

async function translateSrtToSpanish(sourceSrt: string): Promise<{ srt: string; blockCount: number; chunkCount: number; backend: 'local' | 'provider' | 'gemini' }> {
	const blocks = parseSrtBlocks(sourceSrt);
	if (!blocks.length) {
		throw new Error('EN SRT is empty or invalid.');
	}

	let translatedBlocks: SrtBlock[];
	let localError: unknown = null;
	let usedLocal = false;
	// Which backend produced the first pass, so the patch pass reuses it.
	type TranslationBackend = 'local' | 'provider' | 'gemini';
	let usedBackend: TranslationBackend = 'gemini';
	try {
		if (await checkLocalAiHealth()) {
			translatedBlocks = await translateSrtWithLocal(blocks);
			usedLocal = true;
			usedBackend = 'local';
		} else {
			throw new Error('Local AI is not connected.');
		}
	} catch (error) {
		localError = error;
		// Try the user-configured provider before falling back to Gemini.
		try {
			translatedBlocks = await translateSrtWithProvider(blocks);
			usedBackend = 'provider';
		} catch (providerError) {
			try {
				translatedBlocks = await translateSrtWithGemini(blocks);
				usedBackend = 'gemini';
			} catch (geminiError) {
				throw new Error(`Batch SRT translation failed. Local: ${toErrorMessage(localError)} Provider: ${toErrorMessage(providerError)} Gemini: ${toErrorMessage(geminiError)}`);
			}
		}
	}

	// Detect untranslated blocks (text identical to original EN) by matching on
	// the block index, not by position, so reordered model output stays correct.
	const originalByIndex = new Map(blocks.map((block) => [block.index, block]));
	const missingBlocks: SrtBlock[] = [];
	const seenMissing = new Set<number>();
	for (const translated of translatedBlocks) {
		const original = originalByIndex.get(translated.index);
		if (!original || seenMissing.has(original.index)) continue;
		if (translated.text === original.text) {
			missingBlocks.push(original);
			seenMissing.add(original.index);
		}
	}

	// If there are missing blocks, try a second pass just for those, reusing the
	// backend that produced the first pass so a local-only setup still patches.
	if (missingBlocks.length > 0 && missingBlocks.length <= Math.ceil(blocks.length * 0.15)) {
		try {
			const patchBlocks =
				usedBackend === 'local'
					? await translateSrtWithLocal(missingBlocks)
					: usedBackend === 'provider'
						? await translateSrtWithProvider(missingBlocks)
						: await translateSrtWithGemini(missingBlocks);
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
		chunkCount: 1,
		backend: usedBackend
	};
}

// ── Gemini API helpers for learning panel generation ──

function getGeminiApiKeys(): string[] {
	const g = globalThis as typeof globalThis & { USB_GEMINI_API_KEYS?: string[] };
	return Array.isArray(g.USB_GEMINI_API_KEYS) ? normalizeGeminiKeys(g.USB_GEMINI_API_KEYS) : [];
}

function fingerprintKey(apiKey: string): string {
	const key = String(apiKey || '').trim();
	if (!key) return '(empty)';
	if (key.length <= 10) return 'short-key';
	return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function describeGeminiKeys(keys: string[]): string {
	const normalized = normalizeGeminiKeys(keys);
	return `${normalized.length} key(s) [${normalized.map(fingerprintKey).join(', ')}]`;
}

function readChromeStorageArea(areaName: 'local' | 'sync', keys: string[]): Promise<Record<string, unknown>> {
	const storage = chromeApi?.storage?.[areaName];
	if (!storage?.get) {
		return Promise.resolve({});
	}

	return new Promise((resolve) => {
		try {
			storage.get(keys, (items: Record<string, unknown>) => {
				const err = chromeApi?.runtime?.lastError;
				if (err?.message) {
					console.warn(`[USG][gemini] ${areaName} storage read failed:`, err.message);
					resolve({});
					return;
				}
				resolve(items || {});
			});
		} catch (error) {
			console.warn(`[USG][gemini] ${areaName} storage read threw:`, toErrorMessage(error));
			resolve({});
		}
	});
}

type GeminiKeyDebugState = {
	incoming: string;
	memory: string;
	local: string;
	syncArray: string;
	legacy: string;
	resolved: string;
};

type StudyDebugPayload = {
	promptPreview?: string;
	rawResponse?: string;
	rawResponseLength?: number;
	parseError?: string;
};

function attachStudyDebug(error: Error, debug: StudyDebugPayload): Error {
	(error as Error & { studyDebug?: StudyDebugPayload }).studyDebug = debug;
	return error;
}

async function loadGeminiKeysForBackground(incomingKeys: string[] = []): Promise<{ keys: string[]; debug: GeminiKeyDebugState }> {
	await initGeminiKeys().catch(() => undefined);

	const [localData, syncData] = await Promise.all([
		readChromeStorageArea('local', ['usg_gemini_api_keys']),
		readChromeStorageArea('sync', ['gemini_api_keys', 'gemini_api_key_1', 'gemini_api_key_2'])
	]);

	const localKeys = Array.isArray(localData.usg_gemini_api_keys)
		? normalizeGeminiKeys((localData.usg_gemini_api_keys as unknown[]).map(String))
		: [];
	const syncArray = Array.isArray(syncData.gemini_api_keys)
		? normalizeGeminiKeys((syncData.gemini_api_keys as unknown[]).map(String))
		: [];
	const legacy = normalizeGeminiKeys([
		typeof syncData.gemini_api_key_1 === 'string' ? syncData.gemini_api_key_1 : '',
		typeof syncData.gemini_api_key_2 === 'string' ? syncData.gemini_api_key_2 : ''
	]);
	const memoryKeys = getGeminiApiKeys();
	const incoming = normalizeGeminiKeys(incomingKeys);
	const keys = normalizeGeminiKeys([
		...incoming,
		...memoryKeys,
		...localKeys,
		...syncArray,
		...legacy
	]);

	if (keys.length > 0) {
		setGeminiKeysSync(keys);
	}

	return {
		keys,
		debug: {
			incoming: describeGeminiKeys(incoming),
			memory: describeGeminiKeys(memoryKeys),
			local: describeGeminiKeys(localKeys),
			syncArray: describeGeminiKeys(syncArray),
			legacy: describeGeminiKeys(legacy),
			resolved: describeGeminiKeys(keys)
		}
	};
}

function getGeminiModel(): string {
	const g = globalThis as typeof globalThis & { USB_GEMINI_MODEL?: string };
	return String(g.USB_GEMINI_MODEL || GEMINI_DEFAULT_MODEL).trim();
}

/**
 * Classify a Gemini HTTP error so callers can decide whether to retry,
 * pivot to another key, or surface a helpful message to the user.
 *
 * - 429 (RESOURCE_EXHAUSTED) → rate-limit / quota exhausted (transient: try next key, then backoff)
 * - 503 (UNAVAILABLE)        → model is busy / saturated (transient: wait + retry)
 * - 500 / 502 / 504          → server error (transient: retry once)
 * - 401 / 403                → invalid / unauthorized API key (terminal for THIS key)
 * - 400                      → bad request (likely a prompt issue — terminal)
 * - other                    → unknown (terminal)
 */
type GeminiErrorClass = 'rate_limit' | 'overloaded' | 'server_error' | 'invalid_key' | 'bad_request' | 'unknown';

function classifyGeminiError(status: number, body: string): { class: GeminiErrorClass; transient: boolean } {
	const lower = body.toLowerCase();
	if (status === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) {
		return { class: 'rate_limit', transient: true };
	}
	if (status === 503 || lower.includes('unavailable') || lower.includes('overloaded') || lower.includes('high demand')) {
		return { class: 'overloaded', transient: true };
	}
	if (status >= 500 && status < 600) {
		return { class: 'server_error', transient: true };
	}
	if (status === 401 || status === 403 || lower.includes('api key not valid') || lower.includes('permission_denied')) {
		return { class: 'invalid_key', transient: false };
	}
	if (status === 400) {
		return { class: 'bad_request', transient: false };
	}
	return { class: 'unknown', transient: false };
}

function humanizeGeminiErrorClass(cls: GeminiErrorClass): string {
	switch (cls) {
		case 'rate_limit':   return 'Gemini está limitando las peticiones (cuota alcanzada). Espera unos segundos y reintenta.';
		case 'overloaded':   return 'Gemini está saturado por alta demanda (HTTP 503). Reintenta en 1-2 minutos.';
		case 'server_error': return 'Error temporal en los servidores de Gemini. Reintenta en unos segundos.';
		case 'invalid_key':  return 'La API key de Gemini no es válida o no tiene permisos. Verifícala en ⚙️ → API keys.';
		case 'bad_request':  return 'Gemini rechazó la petición (formato del prompt). Revisa los logs del Service Worker.';
		case 'unknown':      return 'Error desconocido al hablar con Gemini. Revisa los logs del Service Worker.';
	}
}

/**
 * Suggested wait time before retrying, based on the error class.
 * Conservative values: Gemini explicitly says "try again later" on 503, so we
 * wait long enough to let the demand spike pass instead of hammering the API.
 */
function suggestRetryDelayMs(cls: GeminiErrorClass, round: number): number {
	if (cls === 'overloaded')   return Math.min(30000, 8000 * (round + 1));   //  8s, 16s, 24s
	if (cls === 'rate_limit')   return Math.min(60000, 15000 * (round + 1));  // 15s, 30s, 45s — quota window
	if (cls === 'server_error') return Math.min(15000, 4000 * (round + 1));   //  4s,  8s, 12s
	return 5000;
}

function suggestKeyCooldownMs(cls: GeminiErrorClass, round: number): number {
	if (cls === 'rate_limit' || cls === 'overloaded' || cls === 'server_error') {
		return suggestRetryDelayMs(cls, round);
	}
	return 0;
}

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

interface RetryNotice {
	round: number;        // 1-indexed round about to start
	totalRounds: number;
	waitMs: number;
	errorClass: GeminiErrorClass;
	reason: string;
}

async function requestGeminiText(
	prompt: string,
	temperature: number,
	maxOutputTokens: number,
	purpose: GeminiPurpose = 'translation',
	onRetry?: (notice: RetryNotice) => void,
	forcedApiKeys?: string[]
): Promise<string> {
	const directKeys = normalizeGeminiKeys(forcedApiKeys ?? []);
	if (directKeys.length === 0) {
		await initGeminiKeys();
	}
	const sourceKeys = directKeys.length > 0 ? directKeys : getGeminiApiKeys();
	const apiKeys = selectGeminiKeysForPurpose(sourceKeys, purpose);
	const model = getGeminiModel();

	if (!apiKeys.length) {
		throw new Error('No Gemini API keys configured.');
	}

	const MAX_RETRY_ROUNDS = 3;
	let lastError: Error | null = null;
	let lastErrorClass: GeminiErrorClass = 'unknown';

	for (let round = 0; round < MAX_RETRY_ROUNDS; round++) {
		let allTransient = true;

		for (const apiKey of apiKeys) {
			try {
				const normalizedKey = apiKey.trim();
				const generationConfig: Record<string, unknown> = { temperature, maxOutputTokens };
				if (purpose === 'objectives' || purpose === 'study') {
					generationConfig.responseMimeType = 'application/json';
				}

				const response = await fetch(buildGeminiGenerateContentUrl(model, normalizedKey), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						contents: [{ role: 'user', parts: [{ text: prompt }] }],
						generationConfig
					})
				});

				const responseText = await response.text();
				if (!response.ok) {
					const cls = classifyGeminiError(response.status, responseText);
					lastErrorClass = cls.class;
					lastError = new Error(`Gemini HTTP ${response.status} (${cls.class}): ${responseText.slice(0, 240)}`);
					markGeminiKeyCooldown(normalizedKey, suggestKeyCooldownMs(cls.class, round), cls.class);
					if (!cls.transient) {
						allTransient = false;
					}
					continue;
				}

				const parsed = JSON.parse(responseText);
				const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
				const finishReason = parsed?.candidates?.[0]?.finishReason;
				if (!text) {
					lastError = new Error(`Gemini returned empty content (finishReason: ${finishReason ?? 'unknown'}).`);
					lastErrorClass = 'unknown';
					allTransient = false;
					continue;
				}
				if (finishReason === 'MAX_TOKENS') {
					console.warn(`[USG][gemini] ⚠️ Response was truncated by MAX_TOKENS (got ${text.length} chars). Caller should increase maxOutputTokens.`);
				}

				return String(text);
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				lastErrorClass = 'server_error';
			}
		}

		if (!allTransient || round === MAX_RETRY_ROUNDS - 1) break;
		const waitMs = suggestRetryDelayMs(lastErrorClass, round);
		const reason = humanizeGeminiErrorClass(lastErrorClass);
		console.warn(`[USG][gemini] All keys returned transient errors (${lastErrorClass}). Backing off ${waitMs}ms before retry ${round + 2}/${MAX_RETRY_ROUNDS}…`);
		// Notify the caller (e.g. so the UI can render a "reintentando en Xs" toast).
		try { onRetry?.({ round: round + 2, totalRounds: MAX_RETRY_ROUNDS, waitMs, errorClass: lastErrorClass, reason }); } catch { /* swallow */ }
		await sleep(waitMs);
	}

	const reason = humanizeGeminiErrorClass(lastErrorClass);
	const detail = lastError?.message ?? 'unknown error';
	const err = new Error(`${reason} (${detail})`);
	(err as Error & { geminiClass?: GeminiErrorClass }).geminiClass = lastErrorClass;
	throw err;
}

function extractJsonParsePosition(error: unknown): number | null {
	const message = error instanceof Error ? error.message : String(error || '');
	const match = message.match(/position\s+(\d+)/i);
	if (!match) return null;
	const position = Number(match[1]);
	return Number.isFinite(position) ? position : null;
}

function jsonParseErrorContext(text: string, error: unknown): string {
	const position = extractJsonParsePosition(error);
	if (position == null) {
		return error instanceof Error ? error.message : String(error || 'unknown parse error');
	}
	const start = Math.max(0, position - 180);
	const end = Math.min(text.length, position + 180);
	return `${error instanceof Error ? error.message : String(error)} | around: ${JSON.stringify(text.slice(start, end))}`;
}

function escapeControlCharsInsideJsonStrings(input: string): string {
	let out = '';
	let inString = false;
	let escaped = false;

	for (const ch of input) {
		if (escaped) {
			out += ch;
			escaped = false;
			continue;
		}
		if (ch === '\\' && inString) {
			out += ch;
			escaped = true;
			continue;
		}
		if (ch === '"') {
			out += ch;
			inString = !inString;
			continue;
		}
		if (inString) {
			if (ch === '\n') { out += '\\n'; continue; }
			if (ch === '\r') { out += '\\n'; continue; }
			if (ch === '\t') { out += '\\t'; continue; }
			if (ch.charCodeAt(0) < 0x20) { out += ' '; continue; }
		}
		out += ch;
	}

	return out;
}

function repairLikelyJson(candidate: string): string {
	return escapeControlCharsInsideJsonStrings(candidate)
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/,\s*([}\]])/g, '$1');
}

function tryParseJsonCandidate(candidate: string, label: string): unknown {
	try {
		return JSON.parse(candidate);
	} catch (rawError) {
		const repaired = repairLikelyJson(candidate);
		if (repaired !== candidate) {
			try {
				const parsed = JSON.parse(repaired);
				console.info(`[USG][study] JSON parse recovered after repair (${label}).`);
				return parsed;
			} catch (repairError) {
				console.warn(`[USG][study] JSON parse failed (${label}):`, jsonParseErrorContext(candidate, rawError));
				console.warn(`[USG][study] JSON repair failed (${label}):`, jsonParseErrorContext(repaired, repairError));
				return null;
			}
		}
		console.warn(`[USG][study] JSON parse failed (${label}):`, jsonParseErrorContext(candidate, rawError));
		return null;
	}
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch (_error) {
		const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
		if (jsonMatch?.[1]) {
			const parsed = tryParseJsonCandidate(jsonMatch[1].trim(), 'fenced-json');
			if (parsed) return parsed;
		}
		const objectStart = text.indexOf('{');
		const objectEnd = text.lastIndexOf('}');
		if (objectStart >= 0 && objectEnd > objectStart) {
			const parsed = tryParseJsonCandidate(text.slice(objectStart, objectEnd + 1), 'object-extract');
			if (parsed) return parsed;
		}
		const arrayStart = text.indexOf('[');
		const arrayEnd = text.lastIndexOf(']');
		if (arrayStart >= 0 && arrayEnd > arrayStart) {
			const parsed = tryParseJsonCandidate(text.slice(arrayStart, arrayEnd + 1), 'array-extract');
			if (parsed) return parsed;
		}
		return null;
	}
}

function looksTruncatedJsonResponse(text: string): boolean {
	const trimmed = String(text || '').trim();
	if (!trimmed) return true;
	if ((trimmed.startsWith('{') && !trimmed.endsWith('}')) || (trimmed.startsWith('[') && !trimmed.endsWith(']'))) {
		return true;
	}

	let depth = 0;
	let inString = false;
	let escaped = false;
	for (const ch of trimmed) {
		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === '\\' && inString) {
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (!inString) {
			if (ch === '{' || ch === '[') depth++;
			if (ch === '}' || ch === ']') depth--;
		}
	}
	return inString || depth > 0;
}

async function generateLearningPanelFromTranscript(transcriptText: string, metadata: StudyMetadata, forcedApiKeys: string[] = []) {
	const cleaned = String(transcriptText || '').replace(/\r/g, '').trim();
	if (cleaned.length < 120) {
		throw new Error('Transcript is too short for learning panel generation.');
	}

	console.groupCollapsed('[USG][study] generate learning panel');
	console.info('[USG][study] metadata:', {
		courseName: metadata.courseName,
		lessonName: metadata.lessonName,
		courseSlug: metadata.courseSlug,
		lectureId: metadata.lectureId,
		objective: metadata.objective,
		transcriptChars: cleaned.length
	});

	// ── Try the user-configured provider first (local proxy / OpenAI / etc.) ──
	// This is the same fallback chain the objectives and refine paths use, and it
	// is what makes the feature work without Gemini keys.
	try {
		console.log('[USG][study] trying configured provider…');
		const text = await requestConfiguredProviderText(buildStudyPrompt(cleaned, metadata), 0.35, 8192);
		console.info('[USG][study] raw provider response:', text);
		const parsed = safeJsonParse(text);
		if (parsed && typeof parsed === 'object') {
			console.info('[USG][study] JSON parse ok. Keys:', Object.keys(parsed as Record<string, unknown>));
			console.groupEnd();
			return { payload: parsed, raw: cleaned };
		}
		console.warn('[USG][study] ⚠️ Provider response could not be parsed as JSON object.');
	} catch (providerError) {
		console.warn('[USG][study] provider error:', providerError);
	}

	// ── Fall back to Gemini if the provider did not produce a usable payload ──
	const loadedKeys = await loadGeminiKeysForBackground(forcedApiKeys);
	const apiKeys = loadedKeys.keys;
	console.info('[USG][study] keys loaded before request:', describeGeminiKeys(apiKeys));
	console.info('[USG][study] key sources:', loadedKeys.debug);

	if (apiKeys.length > 0) {
		let prompt = '';
		let reply = '';
		try {
			prompt = buildStudyPrompt(cleaned, metadata);
			console.info('[USG][study] prompt sent to Gemini:', prompt);

			for (const maxTokens of [8192, 12000]) {
				reply = await requestGeminiText(prompt, 0.35, maxTokens, 'study', (notice) => {
					console.warn(`[USG][study] retry round ${notice.round}/${notice.totalRounds} after ${(notice.waitMs / 1000).toFixed(0)}s — ${notice.reason}`);
					broadcastRetryNotice('study', notice);
				}, apiKeys);
				console.info(`[USG][study] raw Gemini response (${maxTokens} tokens):`, reply);
				console.info('[USG][study] raw response length:', reply.length);
				const parsed = safeJsonParse(reply);

				if (parsed && typeof parsed === 'object') {
					console.info('[USG][study] JSON parse ok. Keys:', Object.keys(parsed as Record<string, unknown>));
					console.groupEnd();
					return { payload: parsed, raw: cleaned };
				}

				if (!looksTruncatedJsonResponse(reply) || maxTokens === 12000) {
					break;
				}
				console.warn('[USG][study] JSON response looks truncated. Retrying once with 12000 tokens.');
			}

			console.warn('[USG][study] JSON parse failed. Raw response was logged above.');
			const parseError = looksTruncatedJsonResponse(reply)
				? 'Gemini response was truncated before closing the JSON object.'
				: 'JSON.parse failed after markdown/object/array extraction attempts.';
			throw attachStudyDebug(
				new Error(
					looksTruncatedJsonResponse(reply)
						? 'Gemini cortó la respuesta antes de cerrar el JSON de la sesión. Revisa rawResponse en la consola.'
						: 'Gemini respondió, pero no entregó un JSON válido para la sesión de estudio. Revisa rawResponse en la consola.'
				),
				{
					promptPreview: prompt.slice(0, 5000),
					rawResponse: reply.slice(0, 20000),
					rawResponseLength: reply.length,
					parseError
				}
			);
		} catch (error) {
			console.warn('[USG] Gemini learning panel failed:', toErrorMessage(error));
			console.groupEnd();
			throw error;
		}
	}

	console.warn('[USG][study] no Gemini keys available after initGeminiKeys().');
	console.groupEnd();
	throw new Error('No hay Gemini API keys configuradas para generar la sesión de estudio.');
}


// ─── Course-objective generation via background (Gemini fallback chain) ─────
// Mirrors the translation chain: try Local AI (8010) → Gemini key 1 → key 2.
// Mock fallback is handled by the caller (objectivesService / localAI client).

export interface GeneratedObjective {
	id: string;
	icon: string;
	title: string;
	sub: string;
}

function parseObjectivesJSON(raw: string): GeneratedObjective[] | null {
	const attempts: string[] = [];
	const trimmed = raw.trim();
	attempts.push(trimmed);

	// Strip markdown code fences (```json ... ``` or ``` ... ```)
	const fenced = trimmed.replace(/```(?:json|javascript|js)?\s*/gi, '').replace(/```/g, '').trim();
	if (fenced !== trimmed) attempts.push(fenced);

	// Extract first balanced JSON array
	const arrayMatch = fenced.match(/\[[\s\S]*\]/);
	if (arrayMatch) attempts.push(arrayMatch[0]);

	// Sometimes models wrap the array in {"objectives": [...]} or {"items": [...]}
	const objectMatch = fenced.match(/\{[\s\S]*\}/);
	if (objectMatch) {
		try {
			const obj = JSON.parse(objectMatch[0]);
			const found = obj?.objectives ?? obj?.items ?? obj?.data ?? obj?.result;
			if (Array.isArray(found)) attempts.push(JSON.stringify(found));
		} catch { /* ignore */ }
	}

	// Repair common LLM mistakes: trailing commas, smart quotes
	for (const candidate of [...attempts]) {
		const repaired = candidate
			.replace(/[\u201C\u201D]/g, '"')        // smart double quotes
			.replace(/[\u2018\u2019]/g, "'")        // smart single quotes
			.replace(/,\s*([}\]])/g, '$1');         // trailing commas before } or ]
		if (repaired !== candidate) attempts.push(repaired);
	}

	// RECOVERY for truncated responses: if a candidate starts with "[" but
	// doesn't end cleanly with "]", try to recover the complete objects
	// before the truncation point.
	for (const candidate of [...attempts]) {
		const repaired = recoverTruncatedJsonArray(candidate);
		if (repaired && repaired !== candidate) attempts.push(repaired);
	}

	for (const candidate of attempts) {
		try {
			const arr = JSON.parse(candidate);
			if (!Array.isArray(arr) || arr.length === 0) continue;
			const cleaned: GeneratedObjective[] = arr
				.slice(0, 4)
				.map((o: { id?: string; icon?: string; title?: string; sub?: string }, i: number) => ({
					id: (o.id ?? o.title ?? `obj-${i}`).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40),
					icon: (o.icon ?? '🎯').toString().slice(0, 4),
					title: (o.title ?? 'Objetivo').toString().slice(0, 60),
					sub: (o.sub ?? '').toString().slice(0, 60)
				}))
				.filter((o) => o.title && o.title !== 'Objetivo');
			if (cleaned.length >= 3) return cleaned;
		} catch { /* try next */ }
	}
	return null;
}

/**
 * Try to recover a truncated JSON array by walking from the start, tracking
 * brace depth, and cutting at the last balanced object boundary. Returns the
 * recovered string wrapped in [...] or null if recovery is impossible.
 */
function recoverTruncatedJsonArray(input: string): string | null {
	const text = input.trim();
	if (!text.startsWith('[')) return null;

	let depth = 0;
	let inString = false;
	let escapeNext = false;
	let lastValidObjectEnd = -1; // index of the last "}" that closed at depth=1

	for (let i = 1; i < text.length; i++) {
		const ch = text[i];

		if (escapeNext) { escapeNext = false; continue; }
		if (ch === '\\' && inString) { escapeNext = true; continue; }
		if (ch === '"') { inString = !inString; continue; }
		if (inString) continue;

		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) lastValidObjectEnd = i;
		} else if (ch === '[') depth++;
		else if (ch === ']' && depth === 0) return text.slice(0, i + 1);
	}

	if (lastValidObjectEnd > 0) {
		const recovered = text.slice(0, lastValidObjectEnd + 1) + ']';
		return recovered;
	}
	return null;
}

async function requestLocalText(prompt: string, temperature: number, maxTokens: number): Promise<string> {
	let lastError: Error | null = null;
	for (const endpoint of LOCAL_AI_CHAT_ENDPOINTS) {
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'local-model',
					messages: [{ role: 'user', content: prompt }],
					temperature,
					max_tokens: maxTokens,
					stream: false
				})
			});
			const responseText = await response.text();
			if (!response.ok) {
				throw new Error(`Local AI HTTP ${response.status}: ${responseText.slice(0, 220)}`);
			}
			const text = extractOpenAiText(JSON.parse(responseText));
			if (!text) throw new Error('Local AI returned empty content.');
			return text;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
		}
	}
	throw lastError || new Error('Local AI request failed.');
}

/** True when the configured provider can serve a request on its own. */
function canServeWithConfiguredProvider(cfg: AiProviderConfig): boolean {
	if (cfg.kind === 'local') return Boolean(cfg.baseUrl);
	return Boolean(cfg.baseUrl && cfg.apiKey);
}

/**
 * Turn a provider error response into something actionable. Rate limits and
 * exhausted balances are the two failures users actually hit with hosted
 * OpenAI-compatible proxies, and both look like a generic 429/400 unless the
 * body is inspected. Reporting them as "server not running" sends people down
 * the wrong path entirely.
 */
function describeProviderHttpError(status: number, rawBody: string): string {
	const body = (rawBody || '').slice(0, 400);
	const lower = body.toLowerCase();

	if (status === 429 || lower.includes('rate limit') || lower.includes('ratelimit')) {
		return `El proveedor está limitando peticiones (HTTP 429). ${body.slice(0, 200)}`;
	}
	if (lower.includes('insufficient') && (lower.includes('quota') || lower.includes('balance'))) {
		return `La cuenta del proveedor no tiene saldo/cuota disponible (HTTP ${status}). ${body.slice(0, 200)}`;
	}
	if (status === 401 || status === 403) {
		return `API key rechazada o sin permisos (HTTP ${status}). ${body.slice(0, 160)}`;
	}
	if (status === 404) {
		return `El endpoint o el modelo no existe en ese servidor (HTTP 404). ${body.slice(0, 160)}`;
	}
	return `El servidor respondió HTTP ${status}. ${body.slice(0, 200)}`;
}

/**
 * Where the background parks a provider-validation result so the caller can read
 * it without depending on the message port surviving a multi-second fetch.
 */
const PROVIDER_VALIDATION_STORAGE_KEY = 'usg_provider_validation';

function publishProviderValidation(
	requestId: string,
	result: { status: string; message: string; httpStatus?: number },
): void {
	if (!requestId) return;
	try {
		void chromeApi?.storage?.local?.set?.({
			[PROVIDER_VALIDATION_STORAGE_KEY]: { requestId, ...result, at: Date.now() },
		});
	} catch {
		/* storage unavailable — the direct response still carries the ack */
	}
}

/**
 * Validate a provider config by issuing a minimal real request. Runs in the
 * service worker so host permissions apply and CORS does not block localhost.
 */
async function validateProviderFromBackground(
	cfg: AiProviderConfig,
): Promise<{ status: string; message: string; httpStatus?: number }> {
	if (!cfg.baseUrl) return { status: 'missing_fields', message: 'Falta la Base URL.' };
	if (cfg.kind !== 'local' && !cfg.apiKey) return { status: 'missing_fields', message: 'Falta la API key.' };
	if (!cfg.model) return { status: 'missing_fields', message: 'Falta el nombre del modelo.' };

	try {
		const parsed = new URL(cfg.baseUrl);
		if (!/^https?:$/.test(parsed.protocol)) {
			return { status: 'bad_url', message: 'La Base URL debe empezar por http:// o https://.' };
		}
	} catch {
		return { status: 'bad_url', message: 'La Base URL no es válida.' };
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 25000);

	try {
		const messages = [{ role: 'user' as const, content: 'Responde solo: ok' }];
		const body = cfg.kind === 'anthropic'
			? buildAnthropicBody(messages, 8, 0, cfg.model, false)
			: buildOpenAiCompatibleBody(messages, 8, 0, cfg.model, false);

		const response = await fetch(buildProviderChatUrl(cfg, false), {
			method: 'POST',
			headers: buildProviderHeaders(cfg),
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		const text = await response.text().catch(() => '');
		if (!response.ok) {
			return { status: 'http_error', httpStatus: response.status, message: describeProviderHttpError(response.status, text) };
		}

		const content = extractProviderText(JSON.parse(text), cfg.kind);
		if (!content) {
			return { status: 'http_error', message: 'El servidor respondió pero sin contenido utilizable (¿modelo incorrecto?).' };
		}

		return { status: 'ok', message: `Conexión correcta (${cfg.kind} · ${cfg.model}).` };
	} catch (error) {
		const isAbort = error instanceof DOMException && error.name === 'AbortError';
		if (isAbort) {
			return {
				status: 'unreachable',
				message: `El modelo "${cfg.model}" no respondió en 25 s. El servidor está activo pero ese modelo está saturado o caído: prueba otro modelo del mismo proxy.`,
			};
		}
		const host = (() => { try { return new URL(cfg.baseUrl).host; } catch { return cfg.baseUrl; } })();
		return {
			status: 'unreachable',
			message: `No se pudo contactar ${host} desde la extensión. Verifica que el servidor esté corriendo en ese puerto.`,
		};
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Non-streaming completion against the user-configured provider
 * (OpenAI-compatible, Anthropic, or a custom local base URL). Throws when the
 * provider is not configured, so callers can fall through to their own chain.
 */
async function requestConfiguredProviderText(
	prompt: string,
	temperature: number,
	maxTokens: number,
): Promise<string> {
	await initAiProviderConfig().catch(() => undefined);
	const cfg = getAiProviderConfig();
	if (!canServeWithConfiguredProvider(cfg)) {
		throw new Error(`Proveedor sin configurar (kind=${cfg.kind}, baseUrl=${cfg.baseUrl || 'vacío'}). Configúralo en ⚙ → Proveedor.`);
	}

	const messages = [{ role: 'user' as const, content: prompt }];
	const body =
		cfg.kind === 'anthropic'
			? buildAnthropicBody(messages, maxTokens, temperature, cfg.model, false)
			: buildOpenAiCompatibleBody(messages, maxTokens, temperature, cfg.model, false);

	const requestUrl = buildProviderChatUrl(cfg, false);
	console.info(`[USG][provider] kind=${cfg.kind} url=${requestUrl} model=${cfg.model}`);

	let response: Response;
	try {
		response = await fetch(requestUrl, {
			method: 'POST',
			headers: buildProviderHeaders(cfg),
			body: JSON.stringify(body),
		});
	} catch (networkError) {
		const host = (() => {
			try { return new URL(cfg.baseUrl).host; } catch { return cfg.baseUrl; }
		})();
		const needsLocalhostPermission = /^(127\.0\.0\.1|localhost)(:|$)/.test(host);
		throw new Error(
			`No se pudo contactar el proveedor ${cfg.kind} (${cfg.baseUrl}). ` +
			(needsLocalhostPermission
				? `Chrome bloquea ${host} porque la extensión se instaló antes de declarar ese permiso. ` +
				  'Solución: en chrome://extensions quita la extensión y vuelve a cargarla desde dist/ (Quitar → Cargar descomprimida). Si ya lo hiciste, verifica que el servidor esté escuchando en ese puerto.'
				: 'Verifica que el servidor esté corriendo y que el permiso del host esté concedido en chrome://extensions → Detalles de la extensión.') +
			` (${toErrorMessage(networkError)})`
		);
	}

	const responseText = await response.text();
	if (!response.ok) {
		throw new Error(`Provider ${cfg.kind} HTTP ${response.status}: ${responseText.slice(0, 220)}`);
	}

	const text = extractProviderText(JSON.parse(responseText), cfg.kind);
	if (!text) throw new Error('El proveedor devolvió contenido vacío.');
	return text;
}

function broadcastRetryNotice(purpose: GeminiPurpose, notice: { round: number; totalRounds: number; waitMs: number; errorClass: string; reason: string }) {
	try {
		chromeApi?.runtime?.sendMessage?.({
			type: 'USG_GEMINI_RETRY_NOTICE',
			purpose,
			...notice,
		}, () => {
			// Sidebar may not be open — swallow the lastError silently.
			void chromeApi.runtime.lastError;
		});
	} catch { /* ignore */ }
}

async function generateObjectivesViaGemini(
	courseName: string,
	description: string
): Promise<{ objectives: GeneratedObjective[]; isMock: boolean; source: 'local' | 'gemini' | 'mock'; error?: string; rawResponse?: string }> {
	const prompt = buildObjectivesPrompt(courseName, description);

	console.groupCollapsed('[USG][objectives] generate', { courseName, description: description.slice(0, 80) + (description.length > 80 ? '…' : '') });
	console.log('[USG][objectives] prompt sent (first 400 chars):', prompt.slice(0, 400));

	// Try Local AI first
	try {
		if (await checkLocalAiHealth()) {
			console.log('[USG][objectives] trying Local AI (8010)…');
			const text = await requestLocalText(prompt, 0.5, 600);
			console.log('[USG][objectives] Local AI raw response:', text);
			const parsed = parseObjectivesJSON(text);
			if (parsed) {
				console.log('[USG][objectives] ✅ Local AI parsed successfully', parsed);
				console.groupEnd();
				return { objectives: parsed, isMock: false, source: 'local' };
			}
			console.warn('[USG][objectives] ⚠️ Local AI response could not be parsed as JSON array.');
		} else {
			console.log('[USG][objectives] Local AI health check failed — skipping.');
		}
	} catch (localError) {
		console.warn('[USG][objectives] Local AI error:', localError);
	}

	// Try the user-configured provider (OpenAI-compatible / Anthropic).
	let providerError: unknown = null;
	try {
		console.log('[USG][objectives] trying configured provider…');
		const text = await requestConfiguredProviderText(prompt, 0.5, 1500);
		const parsed = parseObjectivesJSON(text);
		if (parsed) {
			console.log('[USG][objectives] ✅ Provider parsed successfully', parsed);
			console.groupEnd();
			return { objectives: parsed, isMock: false, source: 'local' };
		}
		console.warn('[USG][objectives] ⚠️ Provider response could not be parsed as JSON array.');
	} catch (err) {
		providerError = err;
		console.warn('[USG][objectives] provider error:', err);
	}

	// Try Gemini using the 'objectives' key preference (reverses order so it
	// doesn't compete with translation for the same key when 2+ keys exist).
	let geminiError: unknown = null;
	let rawResponse: string | undefined;
	try {
		await initGeminiKeys();
		const keyCount = getGeminiApiKeys().length;
		console.log(`[USG][objectives] Gemini keys configured: ${keyCount}`);
		if (keyCount > 0) {
			const text = await requestGeminiText(prompt, 0.5, 1500, 'objectives', (notice) => {
				console.warn(`[USG][objectives] retry round ${notice.round}/${notice.totalRounds} after ${(notice.waitMs / 1000).toFixed(0)}s — ${notice.reason}`);
				broadcastRetryNotice('objectives', notice);
			});
			rawResponse = text;
			console.log('[USG][objectives] 🤖 Gemini raw response (full):');
			console.log(text);
			console.log('[USG][objectives] response length:', text.length, 'chars');
			const parsed = parseObjectivesJSON(text);
			if (parsed) {
				console.log('[USG][objectives] ✅ Gemini parsed successfully', parsed);
				console.groupEnd();
				return { objectives: parsed, isMock: false, source: 'gemini' };
			}
			// Detect a truncated response (response body looks unfinished).
			const looksTruncated = !/\]\s*$/.test(text.trim()) || text.split('"id"').length < 4;
			console.error('[USG][objectives] ❌ Failed to parse Gemini response as JSON');
			console.error('[USG][objectives] Looks truncated?', looksTruncated);
			console.error('[USG][objectives] Last 80 chars:', JSON.stringify(text.slice(-80)));
			geminiError = looksTruncated
				? `La IA fue cortada a mitad de respuesta (probablemente por el límite de tokens). Reintenta o reduce el prompt.`
				: `Failed to parse objectives JSON. Raw response (first 240 chars): ${text.slice(0, 240)}`;
		} else {
			geminiError = 'No Gemini API keys configured.';
			console.warn('[USG][objectives] ⚠️ ' + geminiError);
		}
	} catch (err) {
		geminiError = toErrorMessage(err);
		console.error('[USG][objectives] ❌ Gemini error:', err);
	}

	console.warn('[USG][objectives] No real objectives generated. Reason:', geminiError);
	console.groupEnd();

	// When Gemini had no keys at all, the actionable failure is whatever
	// happened upstream in the configured-provider path — reporting "No Gemini
	// API keys configured" would send the user to configure the wrong thing.
	const noGeminiKeys = typeof geminiError === 'string' && /no gemini api keys/i.test(geminiError);
	const reportedError = noGeminiKeys && providerError ? providerError : geminiError;

	return {
		objectives: [],
		isMock: true,
		source: 'mock',
		error: typeof reportedError === 'string' ? reportedError : undefined,
		rawResponse,
	};
}

async function refineObjectiveViaGemini(
	courseName: string,
	description: string,
	rawGoal: string
): Promise<{ refined: string; isMock: boolean; source: 'local' | 'gemini' | 'mock'; error?: string }> {
	if (!rawGoal.trim()) return { refined: '', isMock: false, source: 'mock' };

	const prompt = buildRefinePrompt(courseName, description, rawGoal);

	// Try Local AI first
	try {
		if (await checkLocalAiHealth()) {
			const text = await requestLocalText(prompt, 0.4, 200);
			const cleaned = text.replace(/^["']|["']$/g, '').trim().slice(0, 120);
			if (cleaned) return { refined: cleaned, isMock: false, source: 'local' };
		}
	} catch (_localError) {
		// Fall through to the configured provider
	}

	// Try the user-configured provider (OpenAI-compatible / Anthropic).
	let providerError: unknown = null;
	try {
		const text = await requestConfiguredProviderText(prompt, 0.4, 200);
		const cleaned = text.replace(/^["']|["']$/g, '').trim().slice(0, 120);
		if (cleaned) return { refined: cleaned, isMock: false, source: 'local' };
	} catch (err) {
		providerError = err;
		console.warn('[USG][refine] provider error:', err);
	}

	// Try Gemini using 'objectives' preference
	let geminiError: unknown = null;
	try {
		await initGeminiKeys();
		if (getGeminiApiKeys().length > 0) {
			const text = await requestGeminiText(prompt, 0.4, 200, 'refine', (notice) => {
				console.warn(`[USG][refine] retry round ${notice.round}/${notice.totalRounds} after ${(notice.waitMs / 1000).toFixed(0)}s — ${notice.reason}`);
				broadcastRetryNotice('refine', notice);
			});
			const cleaned = text.replace(/^["']|["']$/g, '').trim().slice(0, 120);
			if (cleaned) return { refined: cleaned, isMock: false, source: 'gemini' };
			geminiError = 'Gemini returned empty refined text.';
		} else {
			geminiError = 'No Gemini API keys configured.';
		}
	} catch (err) {
		geminiError = toErrorMessage(err);
	}

	// Same masking rule as objectives: if Gemini had no keys, the upstream
	// provider failure is the actionable one.
	const noGeminiKeys = typeof geminiError === 'string' && /no gemini api keys/i.test(geminiError);
	const reportedError = noGeminiKeys && providerError ? providerError : geminiError;

	return {
		refined: '',
		isMock: true,
		source: 'mock',
		error: typeof reportedError === 'string' ? reportedError : undefined,
	};
}
