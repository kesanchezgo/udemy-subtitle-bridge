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

const SUBTITLE_SELECTORS = [
	'.ud-transcript-cue',
	'[data-purpose="transcript-cue-active"]',
	'.captions-display--captions-cue-text--ECkct',
	'[data-purpose="captions-cue-text"]',
	'[data-purpose="transcript-cue"]'
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
let observer: MutationObserver | null = null;
let currentSubtitle = '';
let currentConfig: OverlayConfig = { ...DEFAULT_CONFIG };

function getLectureKey() {
	const match = window.location.pathname.match(/lecture\/(\d+)/);
	return match ? match[1] : null;
}

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

	const isVisible = currentConfig.visible && currentConfig.autoTranslate && currentConfig.enabled;
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

		const containerRect = container.getBoundingClientRect();
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
		'position:absolute',
		'left:50%',
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
	container.appendChild(overlayEl);
	makeDraggable(overlayEl, container);
	applyOverlayStyle();
}

function updateOverlayText(text: string) {
	if (overlayTextEl) {
		overlayTextEl.textContent = text;
	}
}

async function emitSubtitleLine(text: string) {
	const trimmed = text.trim();
	if (!trimmed || trimmed === currentSubtitle) {
		return;
	}

	currentSubtitle = trimmed;
	updateOverlayText(trimmed);
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

function bootstrap() {
	const container = findVideoContainer();
	if (container) {
		createOverlay(container);
	}

	startObserver();
	scanForSubtitleChanges();

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
			currentConfig = { ...currentConfig, autoTranslate: Boolean(payload?.active), enabled: Boolean(payload?.active) };
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
			if (payload?.text) {
				updateOverlayText(payload.text);
			}
		}
	});
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
	bootstrap();
}