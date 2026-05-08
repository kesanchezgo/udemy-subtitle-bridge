import { onMessageFromSidebar, sendToSidebar } from './app/services/contentBridge';

type OverlayPosition = 'top' | 'center' | 'bottom';
type OverlayTone = 'white' | 'yellow' | 'cyan';

type OverlayConfig = {
	visible: boolean;
	autoTranslate: boolean;
	enabled: boolean;
	position: OverlayPosition;
	tone: OverlayTone;
	fontSize: number;
	opacity: number;
	offsetMs: number;
	shadowStrength: number;
};

type CapturedCue = {
	index: number;
	startTime: number;
	endTime: number;
	text: string;
};

const SUBTITLE_SELECTORS = [
	'.ud-transcript-cue',
	'[data-purpose="transcript-cue-active"]',
	'.captions-display--captions-cue-text--ECkct',
	'[data-purpose="captions-cue-text"]',
	'[data-purpose="transcript-cue"]'
];

const NATIVE_CAPTION_SELECTORS = [
	'[class*="captions-display--captions-container"]',
	'.captions-display--captions-cue-text--ECkct',
	'[data-purpose="captions-cue-text"]'
];

const DEFAULT_CONFIG: OverlayConfig = {
	visible: true,
	autoTranslate: true,
	enabled: true,
	position: 'bottom',
	tone: 'white',
	fontSize: 32,
	opacity: 0.86,
	offsetMs: 0,
	shadowStrength: 60
};

let overlayEl: HTMLDivElement | null = null;
let overlayTextEl: HTMLDivElement | null = null;
let nativeCaptionStyleEl: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;
let currentSubtitle = '';
let currentConfig: OverlayConfig = { ...DEFAULT_CONFIG };

let capturedEnVtt: string | null = null;
let capturedCues: CapturedCue[] = [];
let collectedLines: Array<{ text: string; ts: number }> = [];

function getLectureKey() {
	const match = window.location.pathname.match(/lecture\/(\d+)/);
	return match ? match[1] : null;
}

function getCourseSlug() {
	const match = window.location.pathname.match(/\/course\/([^/]+)/);
	return match ? match[1] : null;
}

function getLectureTitle() {
	const selectors = [
		'[data-purpose="lesson-title"]',
		'[data-purpose="video-title"]',
		'.ud-heading-xl',
		'h1[class*="title"]',
		'.lecture-title'
	];

	for (const selector of selectors) {
		const el = document.querySelector(selector);
		if (el) {
			const text = (el as HTMLElement).innerText || el.textContent || '';
			const trimmed = text.trim();
			if (trimmed) {
				return trimmed;
			}
		}
	}

	return null;
}

// ── Network Bridge: inject page-network-bridge.js to capture VTT from fetch/XHR ──

function injectNetworkBridge() {
	const chromeApi = (globalThis as typeof globalThis & { chrome?: { runtime?: { getURL?: (path: string) => string } } }).chrome;
	if (!chromeApi?.runtime?.getURL) {
		return;
	}

	try {
		const script = document.createElement('script');
		script.src = chromeApi.runtime.getURL('src/page-network-bridge.js');
		script.onload = () => script.remove();
		(document.head || document.documentElement).appendChild(script);

		document.addEventListener('USG_NET_CAPTURE', ((event: CustomEvent) => {
			const detail = event.detail;
			if (!detail || !detail.url) {
				return;
			}

			const url = String(detail.url).toLowerCase();
			if (url.includes('.vtt') && (url.includes('en') || url.includes('english'))) {
				capturedEnVtt = String(detail.body || '');
				parseVttIntoCues(capturedEnVtt);
			}
		}) as EventListener);
	} catch (_error) {
		// Keep silent if injection fails.
	}
}

// ── VTT Parsing ──

function parseVttIntoCues(vttText: string) {
	const cleaned = vttText.replace('WEBVTT\n\n', '').replace('WEBVTT\r\n\r\n', '').trim();
	const blocks = cleaned.split(/\n\n|\r\n\r\n/);
	const parsed: CapturedCue[] = [];
	let index = 1;

	for (const block of blocks) {
		const lines = block.split(/\n|\r\n/);
		let timeLineIndex = 0;

		if (lines.length >= 2 && lines[0].includes('-->')) {
			timeLineIndex = 0;
		} else if (lines.length >= 3 && lines[1].includes('-->')) {
			timeLineIndex = 1;
		} else {
			continue;
		}

		const timeParts = lines[timeLineIndex].split('-->');
		if (timeParts.length !== 2) {
			continue;
		}

		const startTime = parseVttTime(timeParts[0].trim());
		const endTime = parseVttTime(timeParts[1].trim());
		const text = lines.slice(timeLineIndex + 1).join(' ').trim();

		if (text && Number.isFinite(startTime) && Number.isFinite(endTime)) {
			parsed.push({ index, startTime, endTime, text });
			index++;
		}
	}

	if (parsed.length > 0) {
		capturedCues = parsed;
	}
}

function parseVttTime(timeStr: string): number {
	const cleaned = timeStr.replace(',', '.').trim();
	const parts = cleaned.split(':');
	if (parts.length === 3) {
		return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
	}
	if (parts.length === 2) {
		return Number(parts[0]) * 60 + Number(parts[1]);
	}
	return 0;
}

// ── Extract cues from <video> textTracks ──

function extractCuesFromVideo(): CapturedCue[] {
	const video = document.querySelector('video');
	if (!video || !video.textTracks) {
		return [];
	}

	for (let i = 0; i < video.textTracks.length; i++) {
		const track = video.textTracks[i];
		const lang = (track.language || '').toLowerCase();
		const isEnglish = lang.includes('en') || (track.label || '').toLowerCase().includes('english');

		if (isEnglish || track.mode === 'showing' || track.mode === 'hidden') {
			if (!track.cues) {
				track.mode = 'hidden';
			}

			if (track.cues && track.cues.length > 0) {
				const extracted: CapturedCue[] = [];
				for (let j = 0; j < track.cues.length; j++) {
					const cue = track.cues[j] as VTTCue;
					extracted.push({
						index: j + 1,
						startTime: cue.startTime,
						endTime: cue.endTime,
						text: cue.text
					});
				}
				return extracted;
			}
		}
	}

	return [];
}

// ── SRT formatting ──

function formatTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const ms = Math.round((seconds % 1) * 1000);
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function cuesToSrt(cues: CapturedCue[]): string {
	return cues
		.map((cue, i) => `${i + 1}\n${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n${cue.text}`)
		.join('\n\n');
}

// ── Collect all available transcript text ──

function collectTranscriptText(maxChars: number): { text: string; source: string; cueCount: number; truncated: boolean } {
	// Priority 1: VTT captured from network
	if (capturedCues.length > 0) {
		let text = capturedCues.map((c) => c.text).join(' ');
		const truncated = text.length > maxChars;
		if (truncated) {
			text = text.slice(0, maxChars);
		}
		return { text, source: 'network-vtt', cueCount: capturedCues.length, truncated };
	}

	// Priority 2: Video textTracks
	const videoCues = extractCuesFromVideo();
	if (videoCues.length > 0) {
		let text = videoCues.map((c) => c.text).join(' ');
		const truncated = text.length > maxChars;
		if (truncated) {
			text = text.slice(0, maxChars);
		}
		return { text, source: 'video-text-tracks', cueCount: videoCues.length, truncated };
	}

	// Priority 3: DOM-collected lines
	if (collectedLines.length > 0) {
		let text = collectedLines.map((l) => l.text).join(' ');
		const truncated = text.length > maxChars;
		if (truncated) {
			text = text.slice(0, maxChars);
		}
		return { text, source: 'dom-observer', cueCount: collectedLines.length, truncated };
	}

	// Priority 4: Current visible transcript panel
	const transcriptPanel = document.querySelector('[data-purpose="transcript-panel"]');
	if (transcriptPanel) {
		const cueElements = transcriptPanel.querySelectorAll('[data-purpose="transcript-cue"]');
		if (cueElements.length > 0) {
			const texts: string[] = [];
			cueElements.forEach((el) => {
				const t = (el as HTMLElement).innerText || el.textContent || '';
				if (t.trim()) {
					texts.push(t.trim());
				}
			});
			if (texts.length > 0) {
				let text = texts.join(' ');
				const truncated = text.length > maxChars;
				if (truncated) {
					text = text.slice(0, maxChars);
				}
				return { text, source: 'transcript-panel', cueCount: texts.length, truncated };
			}
		}
	}

	return { text: '', source: 'none', cueCount: 0, truncated: false };
}

// ── Export EN as SRT ──

function exportEnSrt(): { srt: string; cueCount: number; source: string; fileName: string } {
	// Priority 1: Network VTT
	if (capturedCues.length > 0) {
		const srt = cuesToSrt(capturedCues);
		const slug = getCourseSlug() || 'udemy';
		const key = getLectureKey() || 'lecture';
		return { srt, cueCount: capturedCues.length, source: 'network-vtt', fileName: `${slug}_${key}_en.srt` };
	}

	// Priority 2: Video textTracks
	const videoCues = extractCuesFromVideo();
	if (videoCues.length > 0) {
		const srt = cuesToSrt(videoCues);
		const slug = getCourseSlug() || 'udemy';
		const key = getLectureKey() || 'lecture';
		return { srt, cueCount: videoCues.length, source: 'video-text-tracks', fileName: `${slug}_${key}_en.srt` };
	}

	return { srt: '', cueCount: 0, source: 'none', fileName: '' };
}

// ── Overlay rendering (unchanged) ──

function findVideoContainer() {
	const selectors = [
		'[data-purpose="video-player"]',
		'.video-player--container--',
		'.video-player',
		'.learner-video-player',
		'.udemy-video-player'
	];

	for (const selector of selectors) {
		const element = document.querySelector(selector);
		if (element instanceof HTMLElement) {
			return element;
		}
	}

	const video = document.querySelector('video');
	return video?.parentElement ?? null;
}

function ensureContainerPosition(container: HTMLElement) {
	if (window.getComputedStyle(container).position === 'static') {
		container.style.position = 'relative';
	}
}

function getToneColor(tone: OverlayTone) {
	if (tone === 'yellow') {
		return '#fde68a';
	}
	if (tone === 'cyan') {
		return '#67e8f9';
	}
	return '#ffffff';
}

function getPositionStyles(position: OverlayPosition, offsetMs: number) {
	if (position === 'top') {
		return { top: `${10 + Math.max(-50, Math.min(50, offsetMs / 120))}%`, bottom: 'auto' };
	}

	if (position === 'center') {
		return { top: '50%', bottom: 'auto', transform: 'translate(-50%, -50%)' };
	}

	return { bottom: `${10 + Math.max(-50, Math.min(50, offsetMs / 120))}%`, top: 'auto' };
}

function readNumber(value: unknown, fallback: number) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (Array.isArray(value)) {
		const first = value[0];
		if (typeof first === 'number' && Number.isFinite(first)) {
			return first;
		}
	}

	return fallback;
}

function applyOverlayStyle() {
	if (!overlayEl || !overlayTextEl) {
		return;
	}

	const isVisible = currentConfig.visible && currentConfig.autoTranslate;
	const normalizedOpacity = currentConfig.opacity > 1 ? currentConfig.opacity / 100 : currentConfig.opacity;
	const shadowStrength = Math.max(0, Math.min(100, currentConfig.shadowStrength));

	overlayEl.style.display = isVisible ? 'block' : 'none';
	overlayEl.style.opacity = String(isVisible ? 1 : 0);
	overlayTextEl.style.fontSize = `${currentConfig.fontSize}px`;
	overlayTextEl.style.background = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, normalizedOpacity))})`;
	overlayTextEl.style.color = getToneColor(currentConfig.tone);
	overlayTextEl.style.textShadow = shadowStrength > 0
		? `0 1px ${Math.max(1, Math.round(shadowStrength / 20))}px rgba(0, 0, 0, ${shadowStrength / 100})`
		: 'none';

	const positionStyles = getPositionStyles(currentConfig.position, currentConfig.offsetMs);
	overlayEl.style.top = positionStyles.top ?? 'auto';
	overlayEl.style.bottom = positionStyles.bottom ?? 'auto';
	overlayEl.style.transform = positionStyles.transform ?? 'translateX(-50%)';
	syncNativeCaptionVisibility();
}

function syncNativeCaptionVisibility() {
	const shouldHideNative = currentConfig.visible && currentConfig.autoTranslate;

	if (!shouldHideNative) {
		if (nativeCaptionStyleEl) {
			nativeCaptionStyleEl.remove();
			nativeCaptionStyleEl = null;
		}
		return;
	}

	if (!nativeCaptionStyleEl) {
		nativeCaptionStyleEl = document.createElement('style');
		nativeCaptionStyleEl.id = 'usb-native-caption-hide-style';
		(document.head || document.documentElement).appendChild(nativeCaptionStyleEl);
	}

	nativeCaptionStyleEl.textContent = `${NATIVE_CAPTION_SELECTORS.join(', ')} { opacity: 0 !important; visibility: hidden !important; }`;
}

function makeDraggable(element: HTMLDivElement, container: HTMLElement) {
	let dragging = false;
	let startX = 0;
	let startY = 0;

	element.addEventListener('mousedown', (event) => {
		dragging = true;
		startX = event.clientX - element.getBoundingClientRect().left;
		startY = event.clientY - element.getBoundingClientRect().top;
		element.style.transform = 'none';
		event.preventDefault();
	});

	window.addEventListener('mousemove', (event) => {
		if (!dragging) {
			return;
		}

		const isFixed = window.getComputedStyle(element).position === 'fixed';
		const containerRect = isFixed
			? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
			: container.getBoundingClientRect();
		const nextLeft = event.clientX - containerRect.left - startX;
		const nextTop = event.clientY - containerRect.top - startY;

		element.style.left = `${Math.max(0, Math.min(containerRect.width - element.offsetWidth, nextLeft))}px`;
		element.style.top = `${Math.max(0, Math.min(containerRect.height - element.offsetHeight, nextTop))}px`;
		element.style.bottom = 'auto';
	});

	window.addEventListener('mouseup', () => {
		dragging = false;
	});
}

function createOverlay(container: HTMLElement) {
	if (overlayEl) {
		return;
	}

	ensureContainerPosition(container);

	overlayEl = document.createElement('div');
	overlayEl.id = 'usb-overlay';
	overlayEl.style.cssText = [
		'position:fixed',
		'left:50%',
		'bottom:10%',
		'z-index:9999',
		'max-width:80%',
		'text-align:center',
		'pointer-events:auto',
		'cursor:move',
		'user-select:none'
	].join(';');

	overlayTextEl = document.createElement('div');
	overlayTextEl.style.cssText = [
		'display:inline-block',
		'padding:6px 14px',
		'border-radius:14px',
		'font-family:Inter, system-ui, sans-serif',
		'font-weight:700',
		'letter-spacing:0.01em',
		'box-shadow:0 14px 40px rgba(0,0,0,0.35)',
		'backdrop-filter:blur(12px)',
		'line-height:1.35',
		'white-space:pre-wrap',
		'overflow-wrap:anywhere'
	].join(';');

	overlayEl.appendChild(overlayTextEl);
	(document.body || container).appendChild(overlayEl);
	makeDraggable(overlayEl, container);
	applyOverlayStyle();
}

function updateOverlayText(text: string) {
	if (overlayTextEl) {
		const trimmed = text.trim();
		overlayTextEl.textContent = trimmed;
		overlayTextEl.style.display = trimmed ? 'inline-block' : 'none';
	}

	syncNativeCaptionVisibility();
}

async function emitSubtitleLine(text: string) {
	const trimmed = text.trim();
	if (!trimmed || trimmed === currentSubtitle) {
		return;
	}

	currentSubtitle = trimmed;

	collectedLines.push({ text: trimmed, ts: Date.now() });
	if (collectedLines.length > 5000) {
		collectedLines = collectedLines.slice(-4000);
	}

	await sendToSidebar({
		type: 'SUBTITLE_LINE_RECEIVED',
		payload: {
			en: trimmed,
			ts: Date.now(),
			lectureKey: getLectureKey()
		}
	}).catch(() => undefined);
}

function detectSubtitleText() {
	for (const selector of SUBTITLE_SELECTORS) {
		const nodes = document.querySelectorAll(selector);
		for (const node of Array.from(nodes)) {
			const text = (node as HTMLElement).innerText || node.textContent || '';
			const trimmed = text.replace(/\s+/g, ' ').trim();
			if (trimmed) {
				return trimmed;
			}
		}
	}

	return '';
}

function scanForSubtitleChanges() {
	const text = detectSubtitleText();
	if (text) {
		void emitSubtitleLine(text);
	}
}

function startObserver() {
	if (observer) {
		return;
	}

	observer = new MutationObserver(() => {
		scanForSubtitleChanges();
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true
	});
}

// ── Chrome message handler for popup.js communication ──

function setupChromeMessageHandler() {
	const chromeApi = (globalThis as typeof globalThis & { chrome?: { runtime?: { onMessage?: { addListener: (fn: (message: Record<string, unknown>, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void) => void } } } }).chrome;
	if (!chromeApi?.runtime?.onMessage) {
		return;
	}

	chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		const type = message && (message as { type?: string }).type;
		if (!type) {
			return false;
		}

		const msg = message as Record<string, unknown>;

		if (type === 'USG_GET_STATUS') {
			const videoCues = capturedCues.length > 0 ? capturedCues : extractCuesFromVideo();
			sendResponse({
				ok: true,
				status: {
					lectureKey: getLectureKey(),
					courseSlug: getCourseSlug(),
					lectureId: getLectureKey(),
					lectureTitle: getLectureTitle(),
					hasEnglish: videoCues.length > 0 || capturedEnVtt !== null,
					hasNativeSpanish: false,
					importedCount: 0,
					prefetchMode: capturedEnVtt ? 'network-vtt' : (videoCues.length > 0 ? 'text-tracks' : 'dom-observer'),
					prefetchedCueCount: videoCues.length,
					autoDownloaded: capturedEnVtt !== null,
					autoTranslated: false,
					overlayEnabled: currentConfig.visible && currentConfig.enabled,
					canActions: true,
					settings: {
						offsetMs: currentConfig.offsetMs,
						fontSizePx: currentConfig.fontSize,
						opacity: currentConfig.opacity,
						overlayPosition: currentConfig.position,
						overlayTextColor: currentConfig.tone
					},
					reason: capturedEnVtt
						? `VTT capturado de red (${capturedCues.length} cues)`
						: videoCues.length > 0
							? `${videoCues.length} cues de textTracks`
							: collectedLines.length > 0
								? `${collectedLines.length} líneas capturadas del DOM`
								: 'Esperando subtítulos...'
				}
			});
			return false;
		}

		if (type === 'USG_EXPORT_EN_SRT') {
			const result = exportEnSrt();
			if (!result.srt) {
				sendResponse({ ok: false, error: 'No hay subtítulos EN disponibles para exportar. Activa los subtítulos en inglés en el reproductor de Udemy.' });
			} else {
				sendResponse({ ok: true, srt: result.srt, cueCount: result.cueCount, extractionMode: result.source, fileName: result.fileName });
			}
			return false;
		}

		if (type === 'USG_GET_STUDY_TRANSCRIPT') {
			const maxChars = typeof msg.maxChars === 'number' ? msg.maxChars : 22000;
			const result = collectTranscriptText(maxChars);
			if (!result.text) {
				sendResponse({ ok: false, error: 'No hay transcripción disponible. Reproduce el video con subtítulos en inglés activados.' });
			} else {
				sendResponse({
					ok: true,
					transcriptText: result.text,
					source: result.source,
					cueCount: result.cueCount,
					transcriptTruncated: result.truncated,
					lectureKey: getLectureKey(),
					courseSlug: getCourseSlug(),
					lectureTitle: getLectureTitle()
				});
			}
			return false;
		}

		if (type === 'USG_IMPORT_ES_SRT') {
			sendResponse({ ok: true, importedCount: 0, alreadyLoaded: false });
			return false;
		}

		if (type === 'USG_CLEAR_IMPORTED_FOR_LECTURE') {
			sendResponse({ ok: true });
			return false;
		}

		if (type === 'USG_SET_OVERLAY_ENABLED') {
			const enabled = Boolean(msg.enabled);
			currentConfig = { ...currentConfig, visible: enabled, enabled };
			applyOverlayStyle();
			sendResponse({ ok: true });
			return false;
		}

		if (type === 'USG_SET_OVERLAY_SETTINGS') {
			currentConfig = {
				...currentConfig,
				offsetMs: typeof msg.offsetMs === 'number' ? msg.offsetMs : currentConfig.offsetMs,
				fontSize: typeof msg.fontSizePx === 'number' ? msg.fontSizePx : currentConfig.fontSize,
				opacity: typeof msg.opacity === 'number' ? msg.opacity : currentConfig.opacity,
				position: (typeof msg.overlayPosition === 'string' ? msg.overlayPosition : currentConfig.position) as OverlayPosition,
				tone: (typeof msg.overlayTextColor === 'string' ? msg.overlayTextColor : currentConfig.tone) as OverlayTone
			};
			applyOverlayStyle();
			sendResponse({ ok: true, status: { settings: currentConfig } });
			return false;
		}

		if (type === 'USG_RETRY_AUTO_TRANSLATE') {
			const enSrt = exportEnSrt();
			if (!enSrt.srt) {
				sendResponse({ ok: false, error: 'No hay subtítulos EN disponibles para traducir.' });
				return false;
			}

			const chromeRuntime = (globalThis as typeof globalThis & { chrome?: { runtime?: { sendMessage?: (msg: unknown, cb: (res: unknown) => void) => void } } }).chrome;
			if (chromeRuntime?.runtime?.sendMessage) {
				chromeRuntime.runtime.sendMessage({
					type: 'USG_TRANSLATE_EN_SRT_AUTO',
					srtText: enSrt.srt,
					lectureKey: getLectureKey(),
					courseSlug: getCourseSlug(),
					lectureId: getLectureKey()
				}, (response) => {
					sendResponse(response || { ok: false, error: 'No response from background.' });
				});
				return true;
			}

			sendResponse({ ok: false, error: 'Chrome runtime not available.' });
			return false;
		}

		return false;
	});
}

// ── URL change watcher ──

function watchUrlChanges() {
	let lastUrl = window.location.href;

	setInterval(() => {
		const currentUrl = window.location.href;
		if (currentUrl !== lastUrl) {
			lastUrl = currentUrl;
			capturedEnVtt = null;
			capturedCues = [];
			collectedLines = [];
			currentSubtitle = '';
		}
	}, 1000);
}

// ── Bootstrap ──

function bootstrap() {
	injectNetworkBridge();

	const container = findVideoContainer();
	createOverlay(container || document.body || document.documentElement as HTMLElement);

	startObserver();
	scanForSubtitleChanges();
	setupChromeMessageHandler();
	watchUrlChanges();

	// Try to extract cues from video after a delay
	setTimeout(() => {
		if (capturedCues.length === 0) {
			const videoCues = extractCuesFromVideo();
			if (videoCues.length > 0) {
				capturedCues = videoCues;
			}
		}
	}, 3000);

	onMessageFromSidebar((message) => {
		if (message.type === 'PING') {
			void sendToSidebar({ type: 'PONG' }).catch(() => undefined);
			return;
		}

		if (message.type === 'OVERLAY_CONFIG_UPDATE') {
			const payload = message.payload as Partial<OverlayConfig> & {
				enabled?: boolean;
				show?: boolean;
				showOverlay?: boolean;
				textColor?: OverlayTone;
				syncOffset?: number | number[];
			};

			currentConfig = {
				...currentConfig,
				visible: typeof payload.visible === 'boolean'
					? payload.visible
					: typeof payload.showOverlay === 'boolean'
						? payload.showOverlay
						: typeof payload.enabled === 'boolean'
							? payload.enabled
							: typeof payload.show === 'boolean'
								? payload.show
								: currentConfig.visible,
				position: payload.position ?? currentConfig.position,
				tone: payload.tone ?? payload.textColor ?? currentConfig.tone,
				fontSize: typeof payload.fontSize === 'number' ? payload.fontSize : currentConfig.fontSize,
				opacity: typeof payload.opacity === 'number' ? payload.opacity : currentConfig.opacity,
				offsetMs: typeof payload.offsetMs === 'number' ? payload.offsetMs : readNumber(payload.syncOffset, currentConfig.offsetMs),
				shadowStrength: typeof payload.shadowStrength === 'number' ? payload.shadowStrength : currentConfig.shadowStrength
			};
			applyOverlayStyle();
			return;
		}

		if (message.type === 'AUTO_TRANSLATE_TOGGLE') {
			const payload = message.payload as { active?: boolean } | undefined;
			currentConfig = { ...currentConfig, autoTranslate: Boolean(payload?.active) };
			if (!currentConfig.autoTranslate) {
				updateOverlayText('');
			}
			applyOverlayStyle();
			return;
		}

		if (message.type === 'OVERLAY_RESET_POSITION') {
			currentConfig = { ...currentConfig, position: 'bottom', offsetMs: 0 };
			if (overlayEl) {
				overlayEl.style.left = '50%';
				overlayEl.style.top = 'auto';
				overlayEl.style.bottom = '10%';
				overlayEl.style.transform = 'translateX(-50%)';
			}
			applyOverlayStyle();
			return;
		}

		if (message.type === 'OVERLAY_TEXT_UPDATE') {
			const payload = message.payload as { text?: string } | undefined;
			if (payload && 'text' in payload) {
				updateOverlayText(typeof payload.text === 'string' ? payload.text : '');
			}
		}

		if (message.type === 'GET_TRANSCRIPT') {
			const maxChars = typeof (message.payload as { maxChars?: number })?.maxChars === 'number'
				? (message.payload as { maxChars: number }).maxChars
				: 22000;
			const result = collectTranscriptText(maxChars);
			void sendToSidebar({
				type: 'TRANSCRIPT_RESULT',
				payload: {
					...result,
					lectureKey: getLectureKey(),
					courseSlug: getCourseSlug(),
					lectureTitle: getLectureTitle()
				}
			}).catch(() => undefined);
		}

		if (message.type === 'GET_EN_SRT') {
			const result = exportEnSrt();
			void sendToSidebar({
				type: 'EN_SRT_RESULT',
				payload: result
			}).catch(() => undefined);
		}
	});
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
	bootstrap();
}
