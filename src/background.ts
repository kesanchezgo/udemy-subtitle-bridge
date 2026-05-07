import { translateLine } from './app/services/localAI';

const SIDE_PANEL_PATH = 'index.html';

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

try {
	chromeApi?.runtime?.getURL('src/gemini-config.local.js');
} catch (_error) {
	// Optional during development.
}

void configureSidePanelBehavior();

chromeApi?.runtime?.onInstalled?.addListener(() => {
	void configureSidePanelBehavior();
});

chromeApi?.runtime?.onStartup?.addListener(() => {
	void configureSidePanelBehavior();
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

async function generateLearningPanelFromTranscript(transcriptText: string, metadata: { lectureKey: string; courseSlug: string; lectureId: string }) {
	const cleaned = String(transcriptText || '').replace(/\r/g, '').trim();
	if (cleaned.length < 120) {
		throw new Error('Transcript is too short for learning panel generation.');
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