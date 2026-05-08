import { translateLine } from './app/services/localAI';
import { buildGeminiGenerateContentUrl, initGeminiKeys, normalizeGeminiKeys } from './gemini-config';

const SIDE_PANEL_PATH = 'index.html';
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

type ExtensionMessage = {
	type?: string;
	srt?: string;
	srtText?: string;
	fileName?: string;
	transcriptText?: string;
	lectureKey?: string;
	courseSlug?: string;
	lectureId?: string;
};

const chromeApi = (globalThis as typeof globalThis & { chrome?: any }).chrome;

void initGeminiKeys().then(() => configureSidePanelBehavior());

chromeApi?.runtime?.onInstalled?.addListener(() => {
	void initGeminiKeys().then(() => configureSidePanelBehavior());
});

chromeApi?.runtime?.onStartup?.addListener(() => {
	void initGeminiKeys().then(() => configureSidePanelBehavior());
});

chromeApi?.action?.onClicked?.addListener((tab: { id?: number }) => {
	void openSidePanelForTab(tab);
});

chromeApi?.runtime?.onMessage?.addListener((message: ExtensionMessage, _sender: unknown, sendResponse: (response: unknown) => void) => {
	const type = message && message.type;

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

async function configureSidePanelBehavior() {
	if (!chromeApi?.sidePanel || typeof chromeApi.sidePanel.setPanelBehavior !== 'function') {
		return;
	}

	try {
		await chromeApi.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
	} catch (_error) {
		// Fall back to the explicit action handler below.
	}
}

async function openSidePanelForTab(tab: { id?: number }) {
	if (!chromeApi?.sidePanel || !tab || typeof tab.id !== 'number') {
		return;
	}

	try {
		await chromeApi.sidePanel.setOptions({
			tabId: tab.id,
			path: SIDE_PANEL_PATH,
			enabled: true
		});
		await chromeApi.sidePanel.open({ tabId: tab.id });
	} catch (error) {
		console.warn('[USG] Could not open side panel:', toErrorMessage(error));
	}
}

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

async function translateSrtToSpanish(sourceSrt: string) {
	const blocks = parseSrtBlocks(sourceSrt);
	if (!blocks.length) {
		throw new Error('EN SRT is empty or invalid.');
	}

	const translatedBlocks: SrtBlock[] = [];
	for (const block of blocks) {
		const result = await translateLine(block.text);
		translatedBlocks.push({
			index: block.index,
			timeLine: block.timeLine,
			text: result.success && result.content.trim() ? result.content.trim() : block.text
		});
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
