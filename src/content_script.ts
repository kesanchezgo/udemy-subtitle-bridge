import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import dockStylesheet from './app/styles/index.css?inline';
import { THEME_CSS } from './app/styles/sepia-overrides';
import { InPageDock } from './app/components/InPageDock';
import { onMessageFromSidebar, sendToSidebar } from './app/services/contentBridge';
import {
	DOCK_COLLAPSED_WIDTH,
	DOCK_DEFAULT_WIDTH,
	DOCK_MAX_WIDTH,
	DOCK_MIN_WIDTH
} from './app/constants/dock';

type OverlayPosition = 'top' | 'center' | 'bottom';
type OverlayTone = 'white' | 'yellow' | 'cyan';
type OverlayCustomPos = { x: number; y: number } | null;

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
	customPos: OverlayCustomPos;
};

type CapturedCue = {
	index: number;
	startTime: number;
	endTime: number;
	text: string;
};

type SubtitleDetection = {
	text: string;
	timed: boolean;
};

const SUBTITLE_SELECTORS = [
	'.ud-transcript-cue',
	'[data-purpose="transcript-cue-active"]',
	'.captions-display--captions-cue-text--ECkct',
	'[class*="captions-display--captions-cue-text--"]',
	'[class*="captions-display--captions-line--"]',
	'[data-purpose="captions-cue-text"]',
	'[data-purpose="transcript-cue"]'
];

const NATIVE_CAPTION_SELECTORS = [
	'[class*="captions-display--captions-container"]',
	'.captions-display--captions-cue-text--ECkct',
	'[class*="captions-display--captions-cue-text--"]',
	'[class*="captions-display--captions-line--"]',
	'[class*="captions-display--captions-cue-container--"]',
	'[class*="captions-display--captions-region--"]',
	'[data-purpose="captions-cue-text"]',
	'[data-purpose="captions-cue"]'
];

const DEFAULT_CONFIG: OverlayConfig = {
	visible: true,
	autoTranslate: true,
	enabled: true,
	position: 'bottom',
	tone: 'white',
	fontSize: 24,
	opacity: 85,
	offsetMs: 0,
	shadowStrength: 60,
	customPos: null
};

const EXT_RUNTIME_ID =
	((globalThis as typeof globalThis & { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id) ??
	'local';
const DOCK_BUILD_TAG = '2026-05-13-perf-v1.2.0';
const BOOTSTRAP_GUARD_KEY = `__usb_subtitle_bridge_bootstrap_${EXT_RUNTIME_ID}`;
const DOCK_HOST_ID = `usb-dock-host-${EXT_RUNTIME_ID}`;
const DOCK_HOST_PREFIX = 'usb-dock-host-';
const STATIC_DOCK_HOST_ID = 'usb-dock-host';
const DOCK_MOUNT_ID = 'usb-dock-root';
const DARKREADER_LOCK_META_ID = `usb-darkreader-lock-${EXT_RUNTIME_ID}`;
const DOCK_Z_INDEX = 2147483646;
const OVERLAY_Z_INDEX = 2147483647;
const OVERLAY_EDGE_PADDING = 8;
const VIDEO_FRAME_SAMPLE_WIDTH = 160;
const VIDEO_FRAME_SAMPLE_HEIGHT = 90;
const VIDEO_FRAME_LUMA_THRESHOLD = 26;
const VIDEO_FRAME_MIN_ACTIVE_RATIO = 0.08;

let dockHostEl: HTMLDivElement | null = null;
let overlayEl: HTMLDivElement | null = null;
let overlayTextEl: HTMLDivElement | null = null;
let overlayHandleEl: HTMLDivElement | null = null;
let nativeCaptionStyleEl: HTMLStyleElement | null = null;
let frameSampleCanvas: HTMLCanvasElement | null = null;
let frameSampleCtx: CanvasRenderingContext2D | null = null;
let lastDetectedContentRect: { key: string; rect: DOMRect | null } | null = null;
let layoutReconcileTimers: number[] = [];
let layoutNotifyFrame: number | null = null;
let observer: MutationObserver | null = null;
let subtitleScanInterval: number | null = null;
let subtitleScanFrame: number | null = null;
let pendingSubtitleEmitTimer: number | null = null;
let pendingSubtitleText = '';
let overlayViewportListenersAttached = false;
let currentSubtitle = '';
let currentConfig: OverlayConfig = { ...DEFAULT_CONFIG };
let lastSyncedOverlayPosKey = '';
const forcedHiddenTracks = new WeakSet<TextTrack>();
const autoEnabledTracks = new WeakSet<TextTrack>();

let capturedEnVtt: string | null = null;
let capturedCues: CapturedCue[] = [];
let importedEsCues: CapturedCue[] = [];
let collectedLines: Array<{ text: string; ts: number }> = [];
let dockWidth = DOCK_DEFAULT_WIDTH;
let dockCollapsed = false;
let dockEnabled = true;
let dockHideTimer: number | null = null;
let dockViewportListenersAttached = false;
let dockViewportFrame: number | null = null;
let activeLectureKey: string | null = null;

function isDarkReaderActive() {
	return document.documentElement.hasAttribute('data-darkreader-mode')
		|| document.querySelector('style.darkreader, meta[name="darkreader"]') !== null;
}

function ensureDarkReaderLockForDock() {
	// Dark Reader does not run on chrome-extension:// popup/local, but it does on Udemy pages.
	// Without this lock, injected shadow styles are transformed and drift from local design.
	if (!isDarkReaderActive()) {
		return;
	}

	let lockMeta = document.getElementById(DARKREADER_LOCK_META_ID) as HTMLMetaElement | null;
	if (!lockMeta) {
		lockMeta = document.createElement('meta');
		lockMeta.id = DARKREADER_LOCK_META_ID;
		lockMeta.name = 'darkreader-lock';
		lockMeta.setAttribute('data-usb-runtime', EXT_RUNTIME_ID);
		lockMeta.setAttribute('data-usb-build', DOCK_BUILD_TAG);
		(document.head || document.documentElement).appendChild(lockMeta);
		return;
	}

	lockMeta.setAttribute('data-usb-build', DOCK_BUILD_TAG);
}

function removeDarkReaderLockForDock() {
	const lockMeta = document.getElementById(DARKREADER_LOCK_META_ID);
	if (lockMeta) {
		lockMeta.remove();
	}
}

function cleanupLegacyPageArtifacts() {
	// Older experimental builds injected the theme stylesheet in document.head.
	// Current Figma parity requires theme CSS only inside the dock ShadowRoot.
	document.querySelectorAll('#usb-theme-css').forEach((node) => node.remove());
}

function cleanupStaleDockHosts() {
	// Remove obsolete static host id from previous builds.
	const staticHost = document.getElementById(STATIC_DOCK_HOST_ID);
	if (staticHost) {
		staticHost.remove();
	}

	cleanupLegacyPageArtifacts();

	// Remove hosts from other runtimes/builds so only one dock instance survives.
	const allRuntimeHosts = Array.from(document.querySelectorAll<HTMLElement>(`[id^="${DOCK_HOST_PREFIX}"]`));
	for (const host of allRuntimeHosts) {
		if (host.id !== DOCK_HOST_ID) {
			host.remove();
		}
	}

	// Remove stale overlays that may be left by previous scripts/runtimes.
	const staleOverlays = Array.from(document.querySelectorAll<HTMLElement>('#usb-overlay'));
	for (const overlay of staleOverlays) {
		const ownerRuntime = overlay.getAttribute('data-usb-runtime');
		const ownerBuild = overlay.getAttribute('data-usb-build');
		if (ownerRuntime !== EXT_RUNTIME_ID || ownerBuild !== DOCK_BUILD_TAG) {
			overlay.remove();
		}
	}
}

function getLectureKey() {
	const match = window.location.pathname.match(/lecture\/(\d+)/);
	return match ? match[1] : null;
}

function getCourseSlug() {
	const match = window.location.pathname.match(/\/course\/([^/]+)/);
	return match ? match[1] : null;
}

function cleanMetadataText(text: string) {
	return text
		.replace(/\s+/g, ' ')
		.replace(/^Course:\s*/i, '')
		.replace(/\s*\|\s*Udemy\s*$/i, '')
		.trim();
}

function isBadMetadataText(text: string) {
	const normalized = cleanMetadataText(text).toLowerCase();
	return !normalized
		|| normalized === 'start a new search'
		|| normalized === 'search'
		|| normalized === 'overview'
		|| normalized === 'course content'
		|| normalized === 'q&a'
		|| normalized === 'notes'
		|| normalized === 'announcements'
		|| normalized === 'reviews'
		|| normalized.length < 3;
}

function readTextFromSelector(selector: string) {
	const el = document.querySelector(selector);
	if (!el) return '';
	const text = (el as HTMLElement).innerText || el.textContent || '';
	const cleaned = cleanMetadataText(text);
	return isBadMetadataText(cleaned) ? '' : cleaned;
}

function getCourseTitle() {
	const selectors = [
		'[data-purpose="course-title"]',
		'.curriculum-item-view--course-title--s5jCa',
		'[class*="course-title"]',
		'meta[property="og:title"]',
		'meta[name="title"]'
	];

	for (const selector of selectors) {
		const meta = document.querySelector(selector) as HTMLMetaElement | null;
		const value = meta?.content ? cleanMetadataText(meta.content) : readTextFromSelector(selector);
		if (value && !isBadMetadataText(value)) {
			return value;
		}
	}

	const title = cleanMetadataText(document.title || '');
	if (title && !isBadMetadataText(title)) {
		return title;
	}

	const slug = getCourseSlug();
	return slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : null;
}

function getLectureTitle() {
	const selectors = [
		'li[aria-current="true"] [data-purpose="item-title"]',
		'[data-purpose="curriculum-item-view-title"]',
		'[data-purpose="lesson-title"]',
		'[data-purpose="video-title"]',
		'[data-purpose="lecture-title"]',
		'h1[class*="title"]',
		'.lecture-title'
	];

	for (const selector of selectors) {
		const trimmed = readTextFromSelector(selector);
		if (trimmed) {
			return trimmed;
		}
	}

	return null;
}

function isUdemyLecturePage() {
	return /\/course\/[^/]+\/learn\/lecture\/\d+/.test(window.location.pathname);
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
	const parsed = parseTimedTextIntoCues(vttText).filter((cue) => isValidSubtitleText(cue.text));
	if (parsed.length > 0) {
		capturedCues = parsed;
	}
}

function parseTimedTextIntoCues(sourceText: string): CapturedCue[] {
	const cleaned = sourceText
		.replace(/^\uFEFF/, '')
		.replace(/^WEBVTT[^\n\r]*(\r?\n)+/i, '')
		.trim();
	const blocks = cleaned.split(/\r?\n\r?\n/);
	const parsed: CapturedCue[] = [];
	let index = 1;

	for (const block of blocks) {
		const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
		let timeLineIndex = -1;

		for (let i = 0; i < lines.length; i += 1) {
			if (lines[i].includes('-->')) {
				timeLineIndex = i;
				break;
			}
		}

		if (timeLineIndex < 0) {
			continue;
		}

		const timeParts = lines[timeLineIndex].split('-->');
		if (timeParts.length !== 2) {
			continue;
		}

		const startTime = parseVttTime(timeParts[0].trim());
		const endTime = parseVttTime(timeParts[1].trim());
		const text = lines.slice(timeLineIndex + 1).join(' ').replace(/<[^>]+>/g, '').trim();

		if (text && Number.isFinite(startTime) && Number.isFinite(endTime)) {
			parsed.push({ index, startTime, endTime, text });
			index++;
		}
	}

	return parsed;
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

function isSubtitleLikeTrack(track: TextTrack) {
	const kind = (track.kind || '').toLowerCase();
	const language = (track.language || '').toLowerCase();
	const label = (track.label || '').toLowerCase();
	const isCaptionKind = kind === 'captions' || kind === 'subtitles';
	const looksEnglish = language.startsWith('en') || label.includes('english') || label.includes('en');

	return isCaptionKind && (looksEnglish || track.mode === 'showing' || track.mode === 'hidden');
}

function pickPreferredSubtitleTrack(tracks: TextTrack[]) {
	return tracks
		.filter(isSubtitleLikeTrack)
		.sort((a, b) => {
			const score = (track: TextTrack) => {
				const language = (track.language || '').toLowerCase();
				const label = (track.label || '').toLowerCase();
				return (track.mode === 'showing' ? 6 : track.mode === 'hidden' ? 4 : 0)
					+ (language === 'en' || language.startsWith('en-') ? 8 : 0)
					+ (label.includes('english') ? 6 : 0)
					+ (label === 'en' || label.startsWith('en ') ? 4 : 0);
			};
			return score(b) - score(a);
		})[0] ?? null;
}

function ensureEnglishTextTracksEnabled(hiddenOnly = true) {
	const videos = Array.from(document.querySelectorAll('video'));
	for (const video of videos) {
		const tracks = Array.from(video.textTracks || []);
		const preferred = pickPreferredSubtitleTrack(tracks);
		if (!preferred) {
			continue;
		}

		try {
			if (preferred.mode === 'disabled') {
				preferred.mode = hiddenOnly ? 'hidden' : 'showing';
				autoEnabledTracks.add(preferred);
			}
		} catch {
			// Udemy/Shaka can lock track mode briefly while switching lectures.
		}
	}
}

function normalizeSubtitleText(text: string) {
	return text
		.replace(/<[^>]+>/g, ' ')
		.replace(/\{\\[^}]+\}/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function isValidSubtitleText(text: string) {
	const normalized = normalizeSubtitleText(text);
	const lower = normalized.toLowerCase();

	if (!normalized) return false;
	if (normalized.length > 320) return false;
	if (lower.includes('thumb-sprites') || lower.includes('#xywh=')) return false;
	if (/\.(jpg|jpeg|png|webp|gif|vtt|m3u8)([#?]|$)/i.test(normalized)) return false;
	if (/^https?:\/\//i.test(normalized) || /^blob:/i.test(normalized)) return false;
	if (/^\d+(?:\.\d+)?(?:,\d+(?:\.\d+)?){3}$/.test(normalized)) return false;

	return /[a-zA-ZÀ-ÿ]/.test(normalized);
}

// ── Extract cues from <video> textTracks ──

function extractCuesFromVideo(): CapturedCue[] {
	ensureEnglishTextTracksEnabled(true);
	const video = document.querySelector('video');
	if (!video || !video.textTracks) {
		return [];
	}

	for (let i = 0; i < video.textTracks.length; i++) {
		const track = video.textTracks[i];

		if (isSubtitleLikeTrack(track)) {
			if (!track.cues) {
				track.mode = 'hidden';
			}

			if (track.cues && track.cues.length > 0) {
				const extracted: CapturedCue[] = [];
				for (let j = 0; j < track.cues.length; j++) {
					const cue = track.cues[j] as VTTCue;
					const text = normalizeSubtitleText(cue.text || '');
					if (!isValidSubtitleText(text)) {
						continue;
					}
					extracted.push({
						index: j + 1,
						startTime: cue.startTime,
						endTime: cue.endTime,
						text
					});
				}
				if (extracted.length > 0) {
					return extracted;
				}
			}
		}
	}

	return [];
}

function refreshCapturedCuesFromVideo() {
	const videoCues = extractCuesFromVideo();
	if (videoCues.length > capturedCues.length) {
		capturedCues = videoCues;
	}
	return capturedCues;
}

function getCurrentVideoTime(): number | undefined {
	const video = document.querySelector('video');
	if (video instanceof HTMLVideoElement && Number.isFinite(video.currentTime)) {
		return video.currentTime;
	}
	return undefined;
}

function getActiveCueTextFromList(cues: CapturedCue[], offsetMs = 0) {
	const currentTime = getCurrentVideoTime();
	if (!Number.isFinite(currentTime) || cues.length === 0) {
		return '';
	}

	const time = (currentTime as number) - (offsetMs / 1000);
	const active = cues
		.filter((cue) => time >= cue.startTime - 0.05 && time <= cue.endTime + 0.05)
		.map((cue) => ({ ...cue, text: normalizeSubtitleText(cue.text) }))
		.filter((cue) => isValidSubtitleText(cue.text))
		.sort((a, b) => b.startTime - a.startTime || b.endTime - a.endTime);

	return active[0]?.text ?? '';
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
		.filter((cue) => isValidSubtitleText(cue.text))
		.map((cue, i) => `${i + 1}\n${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n${cue.text}`)
		.join('\n\n');
}

function buildCollectedLinesSrtCandidate(): { srt: string; cueCount: number; source: string; fileName: string } {
	const validLines = collectedLines.filter((line) => isValidSubtitleText(line.text));
	if (validLines.length === 0) {
		return { srt: '', cueCount: 0, source: 'none', fileName: '' };
	}

	const cues = validLines.map((line, index) => {
		const rawStart = Number.isFinite(line.ts) && line.ts >= 0 && line.ts < 36000
			? line.ts
			: index * 4;
		const next = validLines[index + 1];
		const rawNext = next && Number.isFinite(next.ts) && next.ts >= 0 && next.ts < 36000
			? next.ts
			: rawStart + 4;
		const startTime = Math.max(0, rawStart);
		const endTime = Math.max(startTime + 1.4, Math.min(rawNext, startTime + 7));
		return {
			index: index + 1,
			startTime,
			endTime,
			text: line.text
		};
	});

	const slug = getCourseSlug() || 'udemy';
	const key = getLectureKey() || 'lecture';
	return {
		srt: cuesToSrt(cues),
		cueCount: cues.length,
		source: 'dom-observer',
		fileName: `${slug}_${key}_en.srt`
	};
}

// ── Collect all available transcript text ──

function collectTranscriptText(maxChars: number): { text: string; source: string; cueCount: number; truncated: boolean } {
	refreshCapturedCuesFromVideo();
	const validCollectedLines = collectedLines.filter((l) => isValidSubtitleText(l.text));

	// Priority 1: VTT captured from network
	if (capturedCues.length > 0) {
		const validCues = capturedCues.filter((c) => isValidSubtitleText(c.text));
		const shouldPreferCollected = validCollectedLines.length > validCues.length;
		let text = (shouldPreferCollected ? validCollectedLines.map((l) => l.text) : validCues.map((c) => c.text)).join(' ');
		const truncated = text.length > maxChars;
		if (truncated) {
			text = text.slice(0, maxChars);
		}
		if (text.trim()) {
			return {
				text,
				source: shouldPreferCollected ? 'dom-observer' : 'network-vtt',
				cueCount: shouldPreferCollected ? validCollectedLines.length : validCues.length,
				truncated
			};
		}
	}

	// Priority 2: Video textTracks
	const videoCues = extractCuesFromVideo();
	if (videoCues.length > 0) {
		const validCues = videoCues.filter((c) => isValidSubtitleText(c.text));
		let text = validCues.map((c) => c.text).join(' ');
		const truncated = text.length > maxChars;
		if (truncated) {
			text = text.slice(0, maxChars);
		}
		if (text.trim()) {
			return { text, source: 'video-text-tracks', cueCount: validCues.length, truncated };
		}
	}

	// Priority 3: DOM-collected lines
	if (collectedLines.length > 0) {
		let text = validCollectedLines.map((l) => l.text).join(' ');
		const truncated = text.length > maxChars;
		if (truncated) {
			text = text.slice(0, maxChars);
		}
		if (text.trim()) {
			return { text, source: 'dom-observer', cueCount: validCollectedLines.length, truncated };
		}
	}

	// Priority 4: Current visible transcript panel
	const transcriptPanel = document.querySelector('[data-purpose="transcript-panel"]');
	if (transcriptPanel) {
		const cueElements = transcriptPanel.querySelectorAll('[data-purpose="transcript-cue"]');
		if (cueElements.length > 0) {
			const texts: string[] = [];
			cueElements.forEach((el) => {
				const t = (el as HTMLElement).innerText || el.textContent || '';
				const cleaned = normalizeSubtitleText(t);
				if (isValidSubtitleText(cleaned)) {
					texts.push(cleaned);
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
	refreshCapturedCuesFromVideo();
	const collectedCandidate = buildCollectedLinesSrtCandidate();

	// Priority 1: Network VTT
	if (capturedCues.length > 0) {
		const validCues = capturedCues.filter((cue) => isValidSubtitleText(cue.text));
		if (collectedCandidate.cueCount > validCues.length) {
			return collectedCandidate;
		}
		const srt = cuesToSrt(validCues);
		const slug = getCourseSlug() || 'udemy';
		const key = getLectureKey() || 'lecture';
		return { srt, cueCount: validCues.length, source: 'network-vtt', fileName: `${slug}_${key}_en.srt` };
	}

	// Priority 2: Video textTracks
	const videoCues = extractCuesFromVideo();
	if (videoCues.length > 0) {
		const validCues = videoCues.filter((cue) => isValidSubtitleText(cue.text));
		if (collectedCandidate.cueCount > validCues.length) {
			return collectedCandidate;
		}
		const srt = cuesToSrt(validCues);
		const slug = getCourseSlug() || 'udemy';
		const key = getLectureKey() || 'lecture';
		return { srt, cueCount: validCues.length, source: 'video-text-tracks', fileName: `${slug}_${key}_en.srt` };
	}

	return collectedCandidate;
}

function requestPipelineTranslation(expectedLectureKey?: string) {
	const currentLectureKey = getLectureKey();
	if (expectedLectureKey && currentLectureKey && expectedLectureKey !== currentLectureKey) {
		void sendToSidebar({
			type: 'PIPELINE_TRANSLATION_RESULT',
			payload: {
				lectureKey: currentLectureKey,
				ok: false,
				error: 'La lección cambió antes de iniciar la traducción.'
			}
		}).catch(() => undefined);
		return;
	}

	const enSrt = exportEnSrt();
	const basePayload = {
		lectureKey: currentLectureKey,
		courseSlug: getCourseSlug(),
		courseTitle: getCourseTitle(),
		lectureTitle: getLectureTitle(),
		source: enSrt.source,
		sourceSrt: enSrt.srt,
		sourceCueCount: enSrt.cueCount,
		fileName: enSrt.fileName
	};

	void sendToSidebar({
		type: 'PIPELINE_TRANSLATION_SOURCE',
		payload: basePayload
	}).catch(() => undefined);

	if (!enSrt.srt || enSrt.cueCount <= 0) {
		void sendToSidebar({
			type: 'PIPELINE_TRANSLATION_RESULT',
			payload: {
				...basePayload,
				ok: false,
				error: 'No hay subtítulos EN disponibles para traducir todavía.'
			}
		}).catch(() => undefined);
		return;
	}

	const chromeRuntime = (globalThis as typeof globalThis & {
		chrome?: { runtime?: { sendMessage?: (msg: unknown, cb: (res: unknown) => void) => void } }
	}).chrome;

	if (!chromeRuntime?.runtime?.sendMessage) {
		void sendToSidebar({
			type: 'PIPELINE_TRANSLATION_RESULT',
			payload: {
				...basePayload,
				ok: false,
				error: 'Chrome runtime no está disponible para traducir el SRT.'
			}
		}).catch(() => undefined);
		return;
	}

	chromeRuntime.runtime.sendMessage({
		type: 'USG_TRANSLATE_EN_SRT_AUTO',
		srtText: enSrt.srt,
		lectureKey: getLectureKey(),
		courseSlug: getCourseSlug(),
		lectureId: getLectureKey()
	}, (response) => {
		const result = (response && typeof response === 'object' ? response : {}) as {
			ok?: boolean;
			srt?: string;
			blockCount?: number;
			chunkCount?: number;
			error?: string;
		};
		if (result.ok && typeof result.srt === 'string' && result.srt.trim()) {
			importedEsCues = parseTimedTextIntoCues(result.srt);
			currentSubtitle = '';
			scanForSubtitleChanges();
		}
		void sendToSidebar({
			type: 'PIPELINE_TRANSLATION_RESULT',
			payload: {
				...basePayload,
				...result,
				ok: Boolean(result.ok),
				importedCount: importedEsCues.length,
				blockCount: typeof result.blockCount === 'number' ? result.blockCount : enSrt.cueCount
			}
		}).catch(() => undefined);
	});
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

function getToneColor(tone: OverlayTone) {
	if (tone === 'yellow') {
		return '#fde047';
	}
	if (tone === 'cyan') {
		return '#67e8f9';
	}
	return '#ffffff';
}

function getPositionStyles(position: OverlayPosition) {
	if (position === 'top') {
		return { top: '10%', bottom: 'auto' };
	}

	if (position === 'center') {
		return { top: '50%', bottom: 'auto', transform: 'translate(-50%, -50%)' };
	}

	return { bottom: '10%', top: 'auto' };
}

function clampValue(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function getFrameSampleContext() {
	if (!frameSampleCanvas) {
		frameSampleCanvas = document.createElement('canvas');
		frameSampleCanvas.width = VIDEO_FRAME_SAMPLE_WIDTH;
		frameSampleCanvas.height = VIDEO_FRAME_SAMPLE_HEIGHT;
		frameSampleCtx = frameSampleCanvas.getContext('2d', { willReadFrequently: true });
	}
	return frameSampleCtx;
}

function pixelLuma(data: Uint8ClampedArray, index: number) {
	return (data[index] * 0.2126) + (data[index + 1] * 0.7152) + (data[index + 2] * 0.0722);
}

function isActiveFrameColumn(data: Uint8ClampedArray, width: number, height: number, x: number) {
	let active = 0;
	let sampled = 0;
	for (let y = 2; y < height - 2; y += 1) {
		const index = ((y * width) + x) * 4;
		if (pixelLuma(data, index) > VIDEO_FRAME_LUMA_THRESHOLD) {
			active += 1;
		}
		sampled += 1;
	}

	return sampled > 0 && active / sampled >= VIDEO_FRAME_MIN_ACTIVE_RATIO;
}

function isActiveFrameRow(data: Uint8ClampedArray, width: number, height: number, y: number) {
	let active = 0;
	let sampled = 0;
	for (let x = 2; x < width - 2; x += 1) {
		const index = ((y * width) + x) * 4;
		if (pixelLuma(data, index) > VIDEO_FRAME_LUMA_THRESHOLD) {
			active += 1;
		}
		sampled += 1;
	}

	return sampled > 0 && active / sampled >= VIDEO_FRAME_MIN_ACTIVE_RATIO;
}

function getDetectedFrameContentRect(video: HTMLVideoElement, renderedRect: DOMRect): DOMRect | null {
	if (
		video.readyState < 2 ||
		renderedRect.width <= 40 ||
		renderedRect.height <= 40
	) {
		return null;
	}

	const key = [
		Math.round(renderedRect.left),
		Math.round(renderedRect.top),
		Math.round(renderedRect.width),
		Math.round(renderedRect.height),
		video.videoWidth,
		video.videoHeight,
		Math.floor(video.currentTime * 2)
	].join(':');

	if (lastDetectedContentRect?.key === key) {
		return lastDetectedContentRect.rect;
	}

	const ctx = getFrameSampleContext();
	if (!ctx || !frameSampleCanvas) {
		lastDetectedContentRect = { key, rect: null };
		return null;
	}

	try {
		ctx.clearRect(0, 0, VIDEO_FRAME_SAMPLE_WIDTH, VIDEO_FRAME_SAMPLE_HEIGHT);
		ctx.drawImage(video, 0, 0, VIDEO_FRAME_SAMPLE_WIDTH, VIDEO_FRAME_SAMPLE_HEIGHT);
		const { data } = ctx.getImageData(0, 0, VIDEO_FRAME_SAMPLE_WIDTH, VIDEO_FRAME_SAMPLE_HEIGHT);

		let left = 0;
		let right = VIDEO_FRAME_SAMPLE_WIDTH - 1;
		let top = 0;
		let bottom = VIDEO_FRAME_SAMPLE_HEIGHT - 1;

		while (left < VIDEO_FRAME_SAMPLE_WIDTH && !isActiveFrameColumn(data, VIDEO_FRAME_SAMPLE_WIDTH, VIDEO_FRAME_SAMPLE_HEIGHT, left)) {
			left += 1;
		}
		while (right > left && !isActiveFrameColumn(data, VIDEO_FRAME_SAMPLE_WIDTH, VIDEO_FRAME_SAMPLE_HEIGHT, right)) {
			right -= 1;
		}
		while (top < VIDEO_FRAME_SAMPLE_HEIGHT && !isActiveFrameRow(data, VIDEO_FRAME_SAMPLE_WIDTH, VIDEO_FRAME_SAMPLE_HEIGHT, top)) {
			top += 1;
		}
		while (bottom > top && !isActiveFrameRow(data, VIDEO_FRAME_SAMPLE_WIDTH, VIDEO_FRAME_SAMPLE_HEIGHT, bottom)) {
			bottom -= 1;
		}

		left = Math.max(0, left - 1);
		right = Math.min(VIDEO_FRAME_SAMPLE_WIDTH - 1, right + 1);
		top = Math.max(0, top - 1);
		bottom = Math.min(VIDEO_FRAME_SAMPLE_HEIGHT - 1, bottom + 1);

		const contentWidthRatio = (right - left + 1) / VIDEO_FRAME_SAMPLE_WIDTH;
		const contentHeightRatio = (bottom - top + 1) / VIDEO_FRAME_SAMPLE_HEIGHT;
		const hasHorizontalCrop = left > 3 || right < VIDEO_FRAME_SAMPLE_WIDTH - 4;
		const hasVerticalCrop = top > 3 || bottom < VIDEO_FRAME_SAMPLE_HEIGHT - 4;

		if (
			(!hasHorizontalCrop && !hasVerticalCrop) ||
			contentWidthRatio < 0.35 ||
			contentHeightRatio < 0.35 ||
			contentWidthRatio > 0.985 && contentHeightRatio > 0.985
		) {
			lastDetectedContentRect = { key, rect: null };
			return null;
		}

		const detectedRect = new DOMRect(
			renderedRect.left + (renderedRect.width * (left / VIDEO_FRAME_SAMPLE_WIDTH)),
			renderedRect.top + (renderedRect.height * (top / VIDEO_FRAME_SAMPLE_HEIGHT)),
			renderedRect.width * ((right - left + 1) / VIDEO_FRAME_SAMPLE_WIDTH),
			renderedRect.height * ((bottom - top + 1) / VIDEO_FRAME_SAMPLE_HEIGHT)
		);

		lastDetectedContentRect = { key, rect: detectedRect };
		return detectedRect;
	} catch {
		// Cross-origin video frames can taint canvas. In that case we keep the
		// CSS-rendered media rect instead of guessing.
		lastDetectedContentRect = { key, rect: null };
		return null;
	}
}

function getRenderedVideoRect(video: HTMLVideoElement): DOMRect {
	const rect = video.getBoundingClientRect();
	const mediaWidth = video.videoWidth || 0;
	const mediaHeight = video.videoHeight || 0;

	if (
		rect.width <= 40 ||
		rect.height <= 40 ||
		mediaWidth <= 0 ||
		mediaHeight <= 0
	) {
		return rect;
	}

	const fit = window.getComputedStyle(video).objectFit || 'contain';
	if (fit === 'fill' || fit === 'cover') {
		return getDetectedFrameContentRect(video, rect) ?? rect;
	}

	const mediaRatio = mediaWidth / mediaHeight;
	const rectRatio = rect.width / rect.height;
	let width = rect.width;
	let height = rect.height;
	let left = rect.left;
	let top = rect.top;

	// Udemy often letterboxes technical slides. Use the rendered media rect,
	// not the raw <video> box, so sidebar preview percentages match the video.
	if (rectRatio > mediaRatio) {
		width = rect.height * mediaRatio;
		left = rect.left + (rect.width - width) / 2;
	} else if (rectRatio < mediaRatio) {
		height = rect.width / mediaRatio;
		top = rect.top + (rect.height - height) / 2;
	}

	const renderedRect = new DOMRect(left, top, width, height);
	return getDetectedFrameContentRect(video, renderedRect) ?? renderedRect;
}

function findOverlayAnchorRect(preferredContainer?: HTMLElement | null): DOMRect | null {
	const video = document.querySelector('video');
	if (video instanceof HTMLVideoElement) {
		const rect = getRenderedVideoRect(video);
		if (rect.width > 40 && rect.height > 40) {
			return rect;
		}
	}

	if (preferredContainer) {
		const rect = preferredContainer.getBoundingClientRect();
		if (rect.width > 40 && rect.height > 40) {
			return rect;
		}
	}

	const fallbackContainer = findVideoContainer();
	if (fallbackContainer) {
		const rect = fallbackContainer.getBoundingClientRect();
		if (rect.width > 40 && rect.height > 40) {
			return rect;
		}
	}

	return null;
}

function getOverlayParent() {
	const fullscreenElement = document.fullscreenElement;
	if (fullscreenElement instanceof HTMLElement) {
		return fullscreenElement;
	}

	return document.body || document.documentElement;
}

function ensureOverlayParent() {
	if (!overlayEl) {
		return;
	}

	const parent = getOverlayParent();
	if (overlayEl.parentElement !== parent) {
		parent.appendChild(overlayEl);
	}
}

function handleOverlayViewportChange() {
	ensureOverlayParent();
	applyOverlayStyle();
}

function attachOverlayViewportListeners() {
	if (overlayViewportListenersAttached) {
		return;
	}

	window.addEventListener('resize', handleOverlayViewportChange, { passive: true });
	window.addEventListener('scroll', handleOverlayViewportChange, true);
	document.addEventListener('fullscreenchange', handleOverlayViewportChange);
	overlayViewportListenersAttached = true;
}

function detachOverlayViewportListeners() {
	if (!overlayViewportListenersAttached) {
		return;
	}

	window.removeEventListener('resize', handleOverlayViewportChange);
	window.removeEventListener('scroll', handleOverlayViewportChange, true);
	document.removeEventListener('fullscreenchange', handleOverlayViewportChange);
	overlayViewportListenersAttached = false;
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

function readCustomPos(value: unknown): OverlayCustomPos {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as { x?: unknown; y?: unknown };
	const x = readNumber(candidate.x, Number.NaN);
	const y = readNumber(candidate.y, Number.NaN);
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		return null;
	}

	return {
		x: Math.max(0, Math.min(100, x)),
		y: Math.max(0, Math.min(100, y))
	};
}

function clampDockWidth(value: number) {
	return Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, value));
}

const USB_LAYOUT_ATTR = 'data-usb-layout-managed';
const UDEMY_LAYOUT_TARGET_SELECTORS = [
	'.app--content-column--LnPGp',
	"[data-purpose='course-taking-container']",
	'.ud-app-loader'
];

function getUdemyLayoutTargets() {
	const targets = new Set<HTMLElement>();
	for (const selector of UDEMY_LAYOUT_TARGET_SELECTORS) {
		document.querySelectorAll<HTMLElement>(selector).forEach((node) => targets.add(node));
	}
	return Array.from(targets);
}

function clearDockLayoutStyles(target: HTMLElement) {
	// Previous builds used margin-right directly. Always clear it so stale
	// injected HTML or a hot-reloaded extension cannot leave a phantom gap.
	target.style.removeProperty('margin-right');
	target.style.removeProperty('padding-right');

	if (target.getAttribute(USB_LAYOUT_ATTR) === '1') {
		target.style.removeProperty('width');
		target.style.removeProperty('max-width');
		target.style.removeProperty('transition');
		target.removeAttribute(USB_LAYOUT_ATTR);
		return;
	}

	const transition = target.style.transition;
	if (
		transition.includes('margin-right')
		|| transition.includes('max-width')
		|| transition.includes('width')
	) {
		target.style.removeProperty('transition');
	}
}

function findContentColumn() {
	return document.querySelector<HTMLElement>('.app--content-column--LnPGp')
		?? document.querySelector<HTMLElement>("[data-purpose='course-taking-container']")
		?? null;
}

function notifyUdemyPlayerLayoutChanged() {
	if (layoutNotifyFrame !== null) {
		return;
	}

	layoutNotifyFrame = window.requestAnimationFrame(() => {
		layoutNotifyFrame = null;
		window.dispatchEvent(new Event('resize'));
		applyOverlayStyle();
	});
}

function getDockTopOffset() {
	const selectors = [
		'[data-purpose="header"]',
		'[class*="header--header"]',
		'[class*="app--header"]',
		'header'
	];
	let best = 0;

	for (const selector of selectors) {
		document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
			const rect = el.getBoundingClientRect();
			const style = window.getComputedStyle(el);
			const anchored = style.position === 'fixed' || style.position === 'sticky';
			if (
				anchored
				&& rect.top <= 2
				&& rect.bottom > 32
				&& rect.bottom < 96
				&& rect.width > window.innerWidth * 0.35
			) {
				best = Math.max(best, Math.round(rect.bottom));
			}
		});
	}

	return best;
}

function applyDockViewportFrame() {
	const host = dockHostEl || document.getElementById(DOCK_HOST_ID);
	if (!host) {
		return;
	}

	const top = getDockTopOffset();
	host.style.top = `${top}px`;
	host.style.height = `calc(100vh - ${top}px)`;
}

function handleDockViewportChange() {
	if (dockViewportFrame !== null) {
		return;
	}

	dockViewportFrame = window.requestAnimationFrame(() => {
		dockViewportFrame = null;
		applyDockViewportFrame();
		applyOverlayStyle();
	});
}

function attachDockViewportListeners() {
	if (dockViewportListenersAttached) {
		return;
	}

	window.addEventListener('resize', handleDockViewportChange, { passive: true });
	window.addEventListener('scroll', handleDockViewportChange, true);
	dockViewportListenersAttached = true;
}

function detachDockViewportListeners() {
	if (!dockViewportListenersAttached) {
		return;
	}

	window.removeEventListener('resize', handleDockViewportChange);
	window.removeEventListener('scroll', handleDockViewportChange, true);
	dockViewportListenersAttached = false;
}

function adjustUdemyLayout(width: number, collapsed: boolean, liveResize = false) {
	if (!dockEnabled) {
		resetUdemyLayout();
		notifyUdemyPlayerLayoutChanged();
		return;
	}

	const effectiveWidth = collapsed ? DOCK_COLLAPSED_WIDTH : width;
	const host = dockHostEl || document.getElementById(DOCK_HOST_ID);
	if (host) {
		applyDockViewportFrame();
		host.style.width = `${effectiveWidth}px`;
		host.style.setProperty('--usb-dock-width', `${effectiveWidth}px`);
		host.style.background = '#0d0e0f';
	}

	for (const target of getUdemyLayoutTargets()) {
		clearDockLayoutStyles(target);
	}

	const contentColumn = findContentColumn();
	if (!contentColumn) {
		return;
	}

	contentColumn.setAttribute(USB_LAYOUT_ATTR, '1');
	contentColumn.style.width = `calc(100vw - ${effectiveWidth}px)`;
	contentColumn.style.maxWidth = `calc(100vw - ${effectiveWidth}px)`;
	contentColumn.style.marginRight = '0px';
	contentColumn.style.transition = liveResize
		? 'none'
		: 'width 0.3s cubic-bezier(0.4,0,0.2,1), max-width 0.3s cubic-bezier(0.4,0,0.2,1)';

	notifyUdemyPlayerLayoutChanged();
}

function clearLayoutReconcileTimers() {
	for (const timer of layoutReconcileTimers) {
		window.clearTimeout(timer);
	}
	layoutReconcileTimers = [];

	if (dockViewportFrame !== null) {
		window.cancelAnimationFrame(dockViewportFrame);
		dockViewportFrame = null;
	}
}

function startLayoutReconcileBurst() {
	clearLayoutReconcileTimers();
	const delays = [0, 120, 320, 800];
	layoutReconcileTimers = delays.map((delay) => window.setTimeout(() => {
		adjustUdemyLayout(dockWidth, dockCollapsed, delay < 320);
		applyOverlayStyle();
		if (delay === delays[delays.length - 1]) {
			layoutReconcileTimers = [];
		}
	}, delay));
}

function handleDockBridgeEvent(event: Event) {
	const detail = (event as CustomEvent<{ type?: string; payload?: { width?: number; live?: boolean } }>).detail;
	if (!detail?.type) {
		return;
	}

	if (detail.type === 'DOCK_RESIZE') {
		dockWidth = clampDockWidth(readNumber(detail.payload?.width, dockWidth));
		dockCollapsed = false;
		adjustUdemyLayout(dockWidth, dockCollapsed, detail.payload?.live === true);
		if (detail.payload?.live !== true) {
			startLayoutReconcileBurst();
		}
		return;
	}

	if (detail.type === 'DOCK_COLLAPSE') {
		dockCollapsed = true;
		adjustUdemyLayout(dockWidth, dockCollapsed);
		startLayoutReconcileBurst();
		return;
	}

	if (detail.type === 'DOCK_EXPAND') {
		dockCollapsed = false;
		adjustUdemyLayout(dockWidth, dockCollapsed);
		startLayoutReconcileBurst();
	}
}

function initInPageDock() {
	if (!dockEnabled) {
		resetUdemyLayout();
		notifyUdemyPlayerLayoutChanged();
		return;
	}

	cleanupStaleDockHosts();
	ensureDarkReaderLockForDock();

	const existingHost = dockHostEl || document.getElementById(DOCK_HOST_ID);
	if (existingHost) {
		const existingBuild = existingHost.getAttribute('data-usb-build');
		if (existingBuild !== DOCK_BUILD_TAG) {
			existingHost.remove();
			dockHostEl = null;
		} else {
			existingHost.style.display = 'block';
			existingHost.style.pointerEvents = 'auto';
			existingHost.style.transform = 'translateX(0)';
			existingHost.style.opacity = '1';
			applyDockViewportFrame();
			adjustUdemyLayout(dockWidth, dockCollapsed);
			startLayoutReconcileBurst();
			return;
		}
	}

	if (dockHostEl || document.getElementById(DOCK_HOST_ID)) {
		const host = dockHostEl || document.getElementById(DOCK_HOST_ID);
		if (host) {
			host.style.display = 'block';
			host.style.pointerEvents = 'auto';
			host.style.transform = 'translateX(0)';
			host.style.opacity = '1';
			applyDockViewportFrame();
		}
		adjustUdemyLayout(dockWidth, dockCollapsed);
		startLayoutReconcileBurst();
		return;
	}

	const host = document.createElement('div');
	dockHostEl = host;
	host.id = DOCK_HOST_ID;
	host.className = 'usb-dock-host darkreader-ignore';
	host.setAttribute('data-darkreader-ignore', 'true');
	host.setAttribute('data-usb-runtime', EXT_RUNTIME_ID);
	host.setAttribute('data-usb-build', DOCK_BUILD_TAG);
	host.style.position = 'fixed';
	host.style.top = '0px';
	host.style.right = '0';
	host.style.width = `${dockCollapsed ? DOCK_COLLAPSED_WIDTH : dockWidth}px`;
	host.style.height = '100vh';
	host.style.zIndex = String(DOCK_Z_INDEX);
	host.style.display = 'block';
	host.style.pointerEvents = 'auto';
	host.style.overflow = 'visible';
	host.style.background = '#0d0e0f';
	host.style.opacity = '0';
	host.style.transform = 'translateX(100%)';
	host.style.transition = 'transform 0.32s cubic-bezier(0.22,1,0.36,1), opacity 0.22s ease';
	host.style.willChange = 'transform, opacity';
	host.style.boxShadow = '-22px 0 48px rgba(0,0,0,0.28)';
	applyDockViewportFrame();

	const shadow = host.attachShadow({ mode: 'open' });

	const stylesheet = document.createElement('style');
	stylesheet.textContent = dockStylesheet;

	// Theme tokens/overrides must live inside Shadow DOM; injecting them in document.head
	// does not affect closed shadow content and causes visual drift vs local popup mode.
	const themeStylesheet = document.createElement('style');
	themeStylesheet.textContent = THEME_CSS;

	const hostReset = document.createElement('style');
	hostReset.textContent = `
:host {
	display: block;
	font-size: 16px;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	/* Keep host isolated without clobbering Tailwind visual utilities. */
	color-scheme: dark;
	box-sizing: border-box;
	isolation: isolate;
	/* Tailwind v4 registers many utility defaults through @property. In a
	   ShadowRoot those registrations are not reliable, so seed the defaults
	   here to keep borders, gradients, shadows, transforms and animations
	   identical to the normal local preview stylesheet. */
	--tw-translate-x: 0;
	--tw-translate-y: 0;
	--tw-translate-z: 0;
	--tw-rotate-x: initial;
	--tw-rotate-y: initial;
	--tw-rotate-z: initial;
	--tw-skew-x: initial;
	--tw-skew-y: initial;
	--tw-space-y-reverse: 0;
	--tw-divide-y-reverse: 0;
	--tw-border-style: solid;
	--tw-gradient-position: initial;
	--tw-gradient-from: #0000;
	--tw-gradient-via: #0000;
	--tw-gradient-to: #0000;
	--tw-gradient-from-position: 0%;
	--tw-gradient-via-position: 50%;
	--tw-gradient-to-position: 100%;
	--tw-leading: initial;
	--tw-font-weight: initial;
	--tw-tracking: initial;
	--tw-ordinal: initial;
	--tw-slashed-zero: initial;
	--tw-numeric-figure: initial;
	--tw-numeric-spacing: initial;
	--tw-numeric-fraction: initial;
	--tw-shadow: 0 0 #0000;
	--tw-shadow-color: initial;
	--tw-shadow-alpha: 100%;
	--tw-inset-shadow: 0 0 #0000;
	--tw-inset-shadow-color: initial;
	--tw-inset-shadow-alpha: 100%;
	--tw-ring-color: initial;
	--tw-ring-shadow: 0 0 #0000;
	--tw-inset-ring-color: initial;
	--tw-inset-ring-shadow: 0 0 #0000;
	--tw-ring-inset: initial;
	--tw-ring-offset-width: 0px;
	--tw-ring-offset-color: #fff;
	--tw-ring-offset-shadow: 0 0 #0000;
	--tw-outline-style: solid;
	--tw-blur: initial;
	--tw-brightness: initial;
	--tw-contrast: initial;
	--tw-grayscale: initial;
	--tw-hue-rotate: initial;
	--tw-invert: initial;
	--tw-opacity: initial;
	--tw-saturate: initial;
	--tw-sepia: initial;
	--tw-drop-shadow: initial;
	--tw-drop-shadow-color: initial;
	--tw-drop-shadow-alpha: 100%;
	--tw-drop-shadow-size: initial;
	--tw-backdrop-blur: initial;
	--tw-backdrop-brightness: initial;
	--tw-backdrop-contrast: initial;
	--tw-backdrop-grayscale: initial;
	--tw-backdrop-hue-rotate: initial;
	--tw-backdrop-invert: initial;
	--tw-backdrop-opacity: initial;
	--tw-backdrop-saturate: initial;
	--tw-backdrop-sepia: initial;
	--tw-duration: initial;
	--tw-animation-delay: 0s;
	--tw-animation-direction: normal;
	--tw-animation-fill-mode: none;
	--tw-animation-iteration-count: 1;
	--tw-enter-blur: 0;
	--tw-enter-opacity: 1;
	--tw-enter-rotate: 0;
	--tw-enter-scale: 1;
	--tw-enter-translate-x: 0;
	--tw-enter-translate-y: 0;
	--tw-exit-blur: 0;
	--tw-exit-opacity: 1;
	--tw-exit-rotate: 0;
	--tw-exit-scale: 1;
	--tw-exit-translate-x: 0;
	--tw-exit-translate-y: 0;
}

:host *, :host *::before, :host *::after {
	box-sizing: border-box;
}
`;

	const mount = document.createElement('div');
	mount.id = DOCK_MOUNT_ID;
	mount.style.width = '100%';
	mount.style.height = '100%';

	shadow.appendChild(stylesheet);
	shadow.appendChild(themeStylesheet);
	shadow.appendChild(hostReset);
	shadow.appendChild(mount);

	(document.body || document.documentElement).appendChild(host);
	attachDockViewportListeners();
	cleanupLegacyPageArtifacts();
	window.setTimeout(cleanupLegacyPageArtifacts, 0);
	window.setTimeout(cleanupLegacyPageArtifacts, 1500);

	createRoot(mount).render(createElement(InPageDock, {
		onSessionResolved: (_session: Session | null) => {
			void _session;
		},
		localAiConnected: true,
		injectGlobalThemeCss: false
	}));

	adjustUdemyLayout(dockWidth, dockCollapsed);
	startLayoutReconcileBurst();
	window.requestAnimationFrame(() => {
		host.style.transform = 'translateX(0)';
		host.style.opacity = '1';
	});
}

function notifyDockVisibilityChanged() {
	const chromeRuntime = (globalThis as typeof globalThis & {
		chrome?: { runtime?: { sendMessage?: (msg: unknown) => void } }
	}).chrome;
	chromeRuntime?.runtime?.sendMessage?.({
		type: 'USG_DOCK_VISIBILITY_CHANGED',
		enabled: dockEnabled
	});
}

function setDockVisibility(enabled: boolean) {
	dockEnabled = enabled;

	if (!enabled) {
		clearLayoutReconcileTimers();
		detachDockViewportListeners();
		const host = dockHostEl || document.getElementById(DOCK_HOST_ID);
		if (host) {
			if (dockHideTimer != null) {
				window.clearTimeout(dockHideTimer);
				dockHideTimer = null;
			}
			host.style.transition = 'transform 0.24s cubic-bezier(0.4,0,1,1), opacity 0.18s ease';
			host.style.transform = 'translateX(100%)';
			host.style.opacity = '0';
			host.style.pointerEvents = 'none';
			dockHideTimer = window.setTimeout(() => {
				dockHideTimer = null;
				if (!dockEnabled && host.isConnected) {
					host.style.display = 'none';
				}
			}, 260);
		}
		resetUdemyLayout();
		notifyUdemyPlayerLayoutChanged();
		notifyDockVisibilityChanged();
		return dockEnabled;
	}

	if (!isUdemyLecturePage()) {
		notifyDockVisibilityChanged();
		return dockEnabled;
	}

	if (dockHideTimer != null) {
		window.clearTimeout(dockHideTimer);
		dockHideTimer = null;
	}

	const host = dockHostEl || document.getElementById(DOCK_HOST_ID);
	if (host) {
		host.style.display = 'block';
		host.style.pointerEvents = 'auto';
		host.style.transition = 'transform 0.32s cubic-bezier(0.22,1,0.36,1), opacity 0.22s ease';
		host.style.transform = 'translateX(100%)';
		host.style.opacity = '0';
		attachDockViewportListeners();
		applyDockViewportFrame();
		adjustUdemyLayout(dockWidth, dockCollapsed);
		window.requestAnimationFrame(() => {
			host.style.transform = 'translateX(0)';
			host.style.opacity = '1';
		});
		startLayoutReconcileBurst();
	} else {
		initInPageDock();
	}

	notifyDockVisibilityChanged();
	return dockEnabled;
}

function resetUdemyLayout() {
	for (const target of getUdemyLayoutTargets()) {
		clearDockLayoutStyles(target);
	}
}

function destroyInPageDock() {
	clearLayoutReconcileTimers();
	detachDockViewportListeners();
	const host = dockHostEl || document.getElementById(DOCK_HOST_ID);
	if (host) {
		host.remove();
	}
	dockHostEl = null;
	resetUdemyLayout();
	removeDarkReaderLockForDock();
}

function destroyOverlay() {
	if (overlayEl) {
		overlayEl.remove();
		overlayEl = null;
		overlayTextEl = null;
		overlayHandleEl = null;
	}
	detachOverlayViewportListeners();

	if (nativeCaptionStyleEl) {
		nativeCaptionStyleEl.remove();
		nativeCaptionStyleEl = null;
	}
}

function stopObserver() {
	if (observer) {
		observer.disconnect();
		observer = null;
	}
	if (subtitleScanInterval != null) {
		window.clearInterval(subtitleScanInterval);
		subtitleScanInterval = null;
	}
	if (subtitleScanFrame !== null) {
		window.cancelAnimationFrame(subtitleScanFrame);
		subtitleScanFrame = null;
	}
	if (pendingSubtitleEmitTimer != null) {
		window.clearTimeout(pendingSubtitleEmitTimer);
		pendingSubtitleEmitTimer = null;
	}
	pendingSubtitleText = '';
}

function resetRuntimeState() {
	capturedEnVtt = null;
	capturedCues = [];
	importedEsCues = [];
	collectedLines = [];
	currentSubtitle = '';
	if (pendingSubtitleEmitTimer != null) {
		window.clearTimeout(pendingSubtitleEmitTimer);
		pendingSubtitleEmitTimer = null;
	}
	pendingSubtitleText = '';
	updateOverlayText('');
}

function buildLectureContextPayload() {
	refreshCapturedCuesFromVideo();
	const videoCues = capturedCues;
	const validCueCount = videoCues.filter((cue) => isValidSubtitleText(cue.text)).length;
	const validCollectedLineCount = collectedLines.filter((line) => isValidSubtitleText(line.text)).length;
	const bestCueCount = Math.max(validCueCount, validCollectedLineCount);
	return {
		lectureKey: getLectureKey(),
		courseSlug: getCourseSlug(),
		courseTitle: getCourseTitle(),
		lectureTitle: getLectureTitle(),
		cueCount: bestCueCount,
		hasEnglish: bestCueCount > 0,
		source: capturedEnVtt && validCueCount >= validCollectedLineCount && validCueCount > 0
			? 'network-vtt'
			: validCueCount >= validCollectedLineCount && validCueCount > 0
				? 'video-text-tracks'
				: validCollectedLineCount > 0
					? 'dom-observer'
					: 'none'
	};
}

function sendLectureContextUpdate() {
	void sendToSidebar({
		type: 'LECTURE_CONTEXT_UPDATE',
		payload: buildLectureContextPayload()
	}).catch(() => undefined);
}

function syncUdemyRuntimeForUrl() {
	if (isUdemyLecturePage()) {
		const nextLectureKey = getLectureKey();
		if (activeLectureKey !== nextLectureKey) {
			activeLectureKey = nextLectureKey;
			resetRuntimeState();
			sendLectureContextUpdate();
			window.setTimeout(sendLectureContextUpdate, 1200);
			window.setTimeout(() => {
				refreshCapturedCuesFromVideo();
				scanForSubtitleChanges();
				sendLectureContextUpdate();
			}, 3000);
			[6000, 10000, 16000].forEach((delay) => {
				window.setTimeout(() => {
					refreshCapturedCuesFromVideo();
					sendLectureContextUpdate();
				}, delay);
			});
		}
		initInPageDock();
		if (!overlayEl) {
			const container = findVideoContainer();
			createOverlay(container || document.body || document.documentElement as HTMLElement);
		}
		startObserver();
		scanForSubtitleChanges();
		sendLectureContextUpdate();
		return;
	}

	activeLectureKey = null;
	destroyInPageDock();
	destroyOverlay();
	stopObserver();
	resetRuntimeState();
}

function applyOverlayStyle() {
	if (!overlayEl || !overlayTextEl) {
		return;
	}
	ensureOverlayParent();

	const isVisible = currentConfig.visible && currentConfig.autoTranslate;
	const normalizedOpacity = currentConfig.opacity > 1 ? currentConfig.opacity / 100 : currentConfig.opacity;
	const shadowStrength = Math.max(0, Math.min(100, currentConfig.shadowStrength));

	overlayEl.style.display = isVisible ? 'block' : 'none';
	overlayEl.style.opacity = String(isVisible ? 1 : 0);
	overlayEl.style.pointerEvents = isVisible ? 'auto' : 'none';
	overlayTextEl.style.fontSize = `${currentConfig.fontSize}px`;
	overlayTextEl.style.background = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, normalizedOpacity))})`;
	overlayTextEl.style.color = getToneColor(currentConfig.tone);
	overlayTextEl.style.textShadow = shadowStrength > 0
		? `0 1px ${Math.round(shadowStrength / 20)}px rgba(0, 0, 0, ${shadowStrength / 100})`
		: 'none';

	overlayEl.style.position = 'fixed';
	overlayEl.style.bottom = 'auto';
	overlayEl.style.width = 'max-content';

	const anchorRect = findOverlayAnchorRect();
	if (!anchorRect) {
		const positionStyles = getPositionStyles(currentConfig.position);
		if (currentConfig.customPos) {
			overlayEl.style.left = `${currentConfig.customPos.x}%`;
			overlayEl.style.top = `${currentConfig.customPos.y}%`;
			overlayEl.style.bottom = 'auto';
			overlayEl.style.transform = 'translate(-50%, -50%)';
		} else {
			overlayEl.style.left = '50%';
			overlayEl.style.top = positionStyles.top ?? 'auto';
			overlayEl.style.bottom = positionStyles.bottom ?? 'auto';
			overlayEl.style.transform = positionStyles.transform ?? 'translateX(-50%)';
		}
		syncNativeCaptionVisibility();
		return;
	}

	overlayEl.style.maxWidth = `${Math.max(180, Math.round(anchorRect.width * 0.8))}px`;

	const overlayWidth = overlayEl.offsetWidth;
	const overlayHeight = overlayEl.offsetHeight;
	const pad = OVERLAY_EDGE_PADDING;

	let left = anchorRect.left + (anchorRect.width * 0.5);
	let top = anchorRect.top + (anchorRect.height * 0.5);
	let transformY = false;

	if (currentConfig.customPos) {
		left = anchorRect.left + (anchorRect.width * (currentConfig.customPos.x / 100));
		top = anchorRect.top + (anchorRect.height * (currentConfig.customPos.y / 100));
		transformY = true;
	} else if (currentConfig.position === 'center') {
		left = anchorRect.left + (anchorRect.width * 0.5);
		top = anchorRect.top + (anchorRect.height * 0.5);
		transformY = true;
	} else if (currentConfig.position === 'top') {
		top = anchorRect.top + (anchorRect.height * 0.1);
		transformY = false;
	} else {
		top = anchorRect.bottom - (anchorRect.height * 0.1) - overlayHeight;
		transformY = false;
	}

	if (transformY) {
		const halfW = overlayWidth / 2;
		const halfH = overlayHeight / 2;
		left = clampValue(left, anchorRect.left + halfW + pad, anchorRect.right - halfW - pad);
		top = clampValue(top, anchorRect.top + halfH + pad, anchorRect.bottom - halfH - pad);
		overlayEl.style.transform = 'translate(-50%, -50%)';
	} else {
		const halfW = overlayWidth / 2;
		left = clampValue(left, anchorRect.left + halfW + pad, anchorRect.right - halfW - pad);
		top = clampValue(top, anchorRect.top + pad, anchorRect.bottom - overlayHeight - pad);
		overlayEl.style.transform = 'translateX(-50%)';
	}

	overlayEl.style.left = `${Math.round(left)}px`;
	overlayEl.style.top = `${Math.round(top)}px`;
	syncNativeCaptionVisibility();
}

function syncNativeCaptionVisibility() {
	const shouldHideNative = currentConfig.visible && currentConfig.autoTranslate;
	syncNativeTrackMode(shouldHideNative);

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

function syncNativeTrackMode(shouldHideNative: boolean) {
	const videos = Array.from(document.querySelectorAll('video'));
	for (const video of videos) {
		const tracks = Array.from(video.textTracks || []);
		const preferredTrack = shouldHideNative ? pickPreferredSubtitleTrack(tracks) : null;
		for (const track of tracks) {
			try {
				if (shouldHideNative) {
					if (track === preferredTrack && track.mode === 'disabled') {
						track.mode = 'hidden';
						autoEnabledTracks.add(track);
						continue;
					}
					if (track.mode === 'showing') {
						track.mode = 'hidden';
						forcedHiddenTracks.add(track);
					}
					continue;
				}

				if (forcedHiddenTracks.has(track) && track.mode === 'hidden') {
					track.mode = 'showing';
					forcedHiddenTracks.delete(track);
					continue;
				}

				if (autoEnabledTracks.has(track) && track.mode === 'hidden') {
					track.mode = 'disabled';
					autoEnabledTracks.delete(track);
				}
			} catch {
				// Ignore track mode errors in locked players.
			}
		}
	}
}

function syncOverlayPositionToSidebar(pos: { x: number; y: number }) {
	const x = clampValue(Math.round(pos.x), 0, 100);
	const y = clampValue(Math.round(pos.y), 0, 100);
	const key = `${x}:${y}`;
	if (key === lastSyncedOverlayPosKey) {
		return;
	}
	lastSyncedOverlayPosKey = key;
	void sendToSidebar({
		type: 'OVERLAY_POSITION_SYNC',
		payload: { customPos: { x, y } }
	}).catch(() => undefined);
}

function makeDraggable(element: HTMLDivElement, _container: HTMLElement) {
	let dragging = false;

	element.addEventListener('mousedown', (event) => {
		if (event.button !== 0) {
			return;
		}
		if (!(currentConfig.visible && currentConfig.autoTranslate)) {
			return;
		}
		dragging = true;
		element.style.cursor = 'grabbing';
		event.preventDefault();
		event.stopPropagation();
	});

	window.addEventListener('mousemove', (event) => {
		if (!dragging) {
			return;
		}

		const anchorRect = findOverlayAnchorRect();
		if (!anchorRect) {
			return;
		}

		const x = clampValue(((event.clientX - anchorRect.left) / anchorRect.width) * 100, 0, 100);
		const y = clampValue(((event.clientY - anchorRect.top) / anchorRect.height) * 100, 0, 100);
		currentConfig = { ...currentConfig, customPos: { x, y } };
		applyOverlayStyle();
		syncOverlayPositionToSidebar({ x, y });
	});

	window.addEventListener('mouseup', () => {
		if (!dragging) {
			return;
		}
		dragging = false;
		element.style.cursor = 'grab';
		if (element === overlayHandleEl && overlayEl && !overlayEl.matches(':hover')) {
			element.style.opacity = '0';
		}
	});
}

function createOverlay(container: HTMLElement) {
	if (overlayEl) {
		return;
	}

	const existingOverlay = document.getElementById('usb-overlay');
	if (existingOverlay && existingOverlay.parentElement) {
		existingOverlay.remove();
	}

	overlayEl = document.createElement('div');
	overlayEl.id = 'usb-overlay';
	overlayEl.setAttribute('data-usb-runtime', EXT_RUNTIME_ID);
	overlayEl.setAttribute('data-usb-build', DOCK_BUILD_TAG);
	overlayEl.style.cssText = [
		'position:fixed',
		'left:50%',
		'bottom:10%',
		`z-index:${OVERLAY_Z_INDEX}`,
		'width:max-content',
		'max-width:80%',
		'text-align:center',
		'pointer-events:auto',
		'cursor:grab',
		'user-select:none'
	].join(';');

	overlayTextEl = document.createElement('div');
	overlayTextEl.style.cssText = [
		'display:inline-block',
		'max-width:100%',
		'box-sizing:border-box',
		'padding:4px 14px 5px',
		'border-radius:4px',
		'font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
		'font-weight:500',
		'line-height:1.45',
		'text-align:center',
		'white-space:pre-wrap',
		'overflow-wrap:anywhere'
	].join(';');

	overlayEl.appendChild(overlayTextEl);

	overlayHandleEl = document.createElement('div');
	overlayHandleEl.id = 'usb-drag-handle';
	overlayHandleEl.innerHTML = [
		'<svg width="16" height="10" viewBox="0 0 16 10" fill="none" xmlns="http://www.w3.org/2000/svg">',
		'<rect x="0" y="0" width="16" height="2" rx="1" fill="rgba(255,255,255,0.55)"/>',
		'<rect x="0" y="4" width="16" height="2" rx="1" fill="rgba(255,255,255,0.55)"/>',
		'<rect x="0" y="8" width="16" height="2" rx="1" fill="rgba(255,255,255,0.55)"/>',
		'</svg>'
	].join('');
	overlayHandleEl.style.cssText = [
		'position:absolute',
		'top:-18px',
		'left:50%',
		'transform:translateX(-50%)',
		'width:28px',
		'height:14px',
		'background:rgba(0,0,0,0.55)',
		'border:1px solid rgba(255,255,255,0.18)',
		'border-radius:4px',
		'cursor:grab',
		'display:flex',
		'align-items:center',
		'justify-content:center',
		'pointer-events:auto',
		'opacity:0',
		'transition:opacity 0.2s ease',
		`z-index:${OVERLAY_Z_INDEX + 1}`,
		'user-select:none'
	].join(';');
	overlayEl.appendChild(overlayHandleEl);

	overlayEl.addEventListener('mouseenter', () => {
		if (overlayHandleEl) overlayHandleEl.style.opacity = '1';
	});
	overlayEl.addEventListener('mouseleave', () => {
		if (overlayHandleEl && overlayHandleEl.style.cursor !== 'grabbing') {
			overlayHandleEl.style.opacity = '0';
		}
	});

	getOverlayParent().appendChild(overlayEl);
	makeDraggable(overlayHandleEl, container);
	makeDraggable(overlayEl, container);
	attachOverlayViewportListeners();
	applyOverlayStyle();
}

function updateOverlayText(text: string) {
	if (overlayTextEl) {
		const trimmed = text.trim();
		overlayTextEl.textContent = trimmed;
		overlayTextEl.style.display = trimmed ? 'inline-block' : 'none';
	}
	if (overlayEl) {
		applyOverlayStyle();
	}

	syncNativeCaptionVisibility();
}

function isTransientMergedSubtitle(nextText: string) {
	const next = normalizeSubtitleText(nextText);
	const current = normalizeSubtitleText(currentSubtitle);
	if (!next || !current || next === current || current.length < 12) {
		return false;
	}

	const expandedOldCue = next.length > current.length + 8 && next.includes(current);
	if (expandedOldCue) {
		return true;
	}

	return false;
}

async function emitSubtitleLine(text: string) {
	const trimmed = text.trim();
	if (!trimmed || trimmed === currentSubtitle || isTransientMergedSubtitle(trimmed)) {
		return;
	}

	currentSubtitle = trimmed;

	const videoTime = getCurrentVideoTime();
	collectedLines.push({
		text: trimmed,
		ts: Number.isFinite(videoTime) ? (videoTime as number) : Date.now()
	});
	if (collectedLines.length > 5000) {
		collectedLines = collectedLines.slice(-4000);
	}
	const validCueCount = capturedCues.filter((cue) => isValidSubtitleText(cue.text)).length;
	const validCollectedLineCount = collectedLines.filter((line) => isValidSubtitleText(line.text)).length;

	await sendToSidebar({
		type: 'SUBTITLE_LINE_RECEIVED',
		payload: {
			en: trimmed,
			ts: getCurrentVideoTime() ?? Date.now(),
			lectureKey: getLectureKey(),
			cueCount: Math.max(validCueCount, validCollectedLineCount),
			courseTitle: getCourseTitle(),
			lectureTitle: getLectureTitle()
		}
	}).catch(() => undefined);
}

function scheduleSubtitleLineEmit(text: string) {
	const trimmed = text.trim();
	if (!trimmed || trimmed === currentSubtitle || isTransientMergedSubtitle(trimmed)) {
		return;
	}

	const delay = Math.max(0, currentConfig.offsetMs);
	if (delay <= 0) {
		if (pendingSubtitleEmitTimer != null) {
			window.clearTimeout(pendingSubtitleEmitTimer);
			pendingSubtitleEmitTimer = null;
		}
		pendingSubtitleText = '';
		void emitSubtitleLine(trimmed);
		return;
	}

	if (pendingSubtitleText === trimmed && pendingSubtitleEmitTimer != null) {
		return;
	}

	if (pendingSubtitleEmitTimer != null) {
		window.clearTimeout(pendingSubtitleEmitTimer);
	}

	pendingSubtitleText = trimmed;
	pendingSubtitleEmitTimer = window.setTimeout(() => {
		const nextText = pendingSubtitleText;
		pendingSubtitleText = '';
		pendingSubtitleEmitTimer = null;
		void emitSubtitleLine(nextText);
	}, delay);
}

function detectActiveCueFromTracks() {
	const video = document.querySelector('video');
	if (!video || !video.textTracks) {
		return '';
	}

	const tracks = Array.from(video.textTracks);
	const shouldUseOffset = currentConfig.offsetMs !== 0;
	const currentTime = getCurrentVideoTime();
	const offsetTime = Number.isFinite(currentTime)
		? (currentTime as number) - (currentConfig.offsetMs / 1000)
		: Number.NaN;
	const preferred = tracks.filter(isSubtitleLikeTrack).sort((a, b) => {
		const aLang = (a.language || '').toLowerCase();
		const bLang = (b.language || '').toLowerCase();
		const aScore = (a.mode === 'showing' ? 2 : a.mode === 'hidden' ? 1 : 0) + (aLang.includes('en') ? 2 : 0);
		const bScore = (b.mode === 'showing' ? 2 : b.mode === 'hidden' ? 1 : 0) + (bLang.includes('en') ? 2 : 0);
		return bScore - aScore;
	});

	for (const track of preferred) {
		const cues = shouldUseOffset && Number.isFinite(offsetTime)
			? track.cues
			: track.activeCues;
		if (!cues || cues.length === 0) {
			continue;
		}
		const active = Array.from(cues)
			.filter((cue) => {
				if (!shouldUseOffset) return true;
				return offsetTime >= cue.startTime - 0.05 && offsetTime <= cue.endTime + 0.05;
			})
			.map((cue) => ({
				startTime: cue.startTime,
				endTime: cue.endTime,
				text: normalizeSubtitleText((cue as VTTCue).text || '')
			}))
			.filter((cue) => isValidSubtitleText(cue.text))
			.sort((a, b) => b.startTime - a.startTime || b.endTime - a.endTime);
		const text = active[0]?.text ?? '';
		if (text) {
			return text;
		}
	}

	return '';
}

function detectCueTextFromCapturedCues() {
	refreshCapturedCuesFromVideo();

	if (capturedCues.length === 0) {
		return '';
	}

	return getActiveCueTextFromList(capturedCues, currentConfig.offsetMs);
}

function detectCueTextFromImportedEsCues() {
	return getActiveCueTextFromList(importedEsCues, currentConfig.offsetMs);
}

function detectSubtitleText(): SubtitleDetection | null {
	const trackText = detectActiveCueFromTracks();
	if (trackText) {
		return { text: trackText, timed: true };
	}

	const capturedCueText = detectCueTextFromCapturedCues();
	if (capturedCueText) {
		return { text: capturedCueText, timed: true };
	}

	for (const selector of SUBTITLE_SELECTORS) {
		const nodes = document.querySelectorAll(selector);
		for (const node of Array.from(nodes)) {
			const text = (node as HTMLElement).innerText || node.textContent || '';
			const trimmed = normalizeSubtitleText(text);
			if (isValidSubtitleText(trimmed)) {
				return { text: trimmed, timed: false };
			}
		}
	}

	return null;
}

function scanForSubtitleChanges() {
	const importedText = detectCueTextFromImportedEsCues();
	if (importedText) {
		if (pendingSubtitleEmitTimer != null) {
			window.clearTimeout(pendingSubtitleEmitTimer);
			pendingSubtitleEmitTimer = null;
		}
		pendingSubtitleText = '';
		if (importedText !== currentSubtitle) {
			currentSubtitle = importedText;
			updateOverlayText(importedText);
			void sendToSidebar({
				type: 'IMPORTED_ES_LINE_RECEIVED',
				payload: {
					es: importedText,
					ts: getCurrentVideoTime() ?? Date.now(),
					lectureKey: getLectureKey(),
					courseTitle: getCourseTitle(),
					lectureTitle: getLectureTitle()
				}
			}).catch(() => undefined);
		}
		return;
	}

	const detection = detectSubtitleText();
	if (detection?.text) {
		if (detection.timed) {
			if (pendingSubtitleEmitTimer != null) {
				window.clearTimeout(pendingSubtitleEmitTimer);
				pendingSubtitleEmitTimer = null;
			}
			pendingSubtitleText = '';
			void emitSubtitleLine(detection.text);
			return;
		}
		scheduleSubtitleLineEmit(detection.text);
	}
}

function scheduleSubtitleScan() {
	if (subtitleScanFrame !== null) {
		return;
	}

	subtitleScanFrame = window.requestAnimationFrame(() => {
		subtitleScanFrame = null;
		scanForSubtitleChanges();
	});
}

function startObserver() {
	if (observer) {
		return;
	}

	observer = new MutationObserver(() => {
		scheduleSubtitleScan();
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true
	});

	if (subtitleScanInterval == null) {
		subtitleScanInterval = window.setInterval(() => {
			scanForSubtitleChanges();
		}, 250);
	}
}

// ── Chrome runtime message handler ──

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

		if (type === 'TOGGLE_DOCK_VISIBILITY') {
			const enabled = setDockVisibility(!dockEnabled);
			sendResponse({ ok: true, enabled });
			return false;
		}

		if (type === 'SET_DOCK_VISIBILITY') {
			const enabled = setDockVisibility(Boolean(msg.enabled));
			sendResponse({ ok: true, enabled });
			return false;
		}

		if (type === 'USG_GET_STATUS') {
			refreshCapturedCuesFromVideo();
			const videoCues = capturedCues;
			const validCueCount = videoCues.filter((cue) => isValidSubtitleText(cue.text)).length;
			const validCollectedLineCount = collectedLines.filter((line) => isValidSubtitleText(line.text)).length;
			const bestCueCount = Math.max(validCueCount, validCollectedLineCount);
			sendResponse({
				ok: true,
				status: {
					lectureKey: getLectureKey(),
					courseSlug: getCourseSlug(),
					courseTitle: getCourseTitle(),
					lectureId: getLectureKey(),
					lectureTitle: getLectureTitle(),
					hasEnglish: bestCueCount > 0,
					hasNativeSpanish: false,
					importedCount: 0,
					prefetchMode: capturedEnVtt && validCueCount >= validCollectedLineCount && validCueCount > 0
						? 'network-vtt'
						: validCueCount >= validCollectedLineCount && validCueCount > 0
							? 'text-tracks'
							: 'dom-observer',
					prefetchedCueCount: bestCueCount,
					autoDownloaded: capturedEnVtt !== null && bestCueCount > 0,
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
						? `VTT capturado de red (${validCueCount} cues válidos)`
						: validCueCount >= validCollectedLineCount && validCueCount > 0
							? `${validCueCount} cues de textTracks`
							: validCollectedLineCount > 0
								? `${validCollectedLineCount} líneas capturadas del DOM`
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
					courseTitle: getCourseTitle(),
					lectureTitle: getLectureTitle()
				});
			}
			return false;
		}

		if (type === 'USG_IMPORT_ES_SRT') {
			const srtText = typeof msg.srtText === 'string'
				? msg.srtText
				: typeof (msg.payload as { srtText?: unknown } | undefined)?.srtText === 'string'
					? String((msg.payload as { srtText?: unknown }).srtText)
					: '';
			const parsed = parseTimedTextIntoCues(srtText);
			importedEsCues = parsed;
			scanForSubtitleChanges();
			sendResponse({ ok: true, importedCount: parsed.length, alreadyLoaded: false });
			return false;
		}

		if (type === 'USG_CLEAR_IMPORTED_FOR_LECTURE') {
			importedEsCues = [];
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
			syncUdemyRuntimeForUrl();
		}
	}, 1000);
}

// ── Bootstrap ──

function bootstrap() {
	injectNetworkBridge();
	window.addEventListener('usb:dock→cs', handleDockBridgeEvent as EventListener);
	syncUdemyRuntimeForUrl();
	setupChromeMessageHandler();
	watchUrlChanges();

	// Try to extract cues from video after a delay
	setTimeout(() => {
		refreshCapturedCuesFromVideo();
		sendLectureContextUpdate();
	}, 3000);

	onMessageFromSidebar((message) => {
		if (message.type === 'PING') {
			void sendToSidebar({ type: 'PONG', payload: buildLectureContextPayload() }).catch(() => undefined);
			window.setTimeout(sendLectureContextUpdate, 500);
			return;
		}

		if (message.type === 'REFRESH_CAPTURE') {
			refreshCapturedCuesFromVideo();
			scanForSubtitleChanges();
			window.setTimeout(() => {
				refreshCapturedCuesFromVideo();
				sendLectureContextUpdate();
			}, 800);
			return;
		}

		if (message.type === 'TOGGLE_DOCK_VISIBILITY') {
			setDockVisibility(!dockEnabled);
			return;
		}

		if (message.type === 'SET_DOCK_VISIBILITY') {
			const payload = message.payload as { enabled?: boolean } | undefined;
			setDockVisibility(Boolean(payload?.enabled));
			return;
		}

		if (message.type === 'OVERLAY_CONFIG_UPDATE') {
			const payload = message.payload as Partial<OverlayConfig> & {
				enabled?: boolean;
				show?: boolean;
				showOverlay?: boolean;
				textColor?: OverlayTone;
				syncOffset?: number | number[];
				customPos?: OverlayCustomPos;
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
				shadowStrength: typeof payload.shadowStrength === 'number' ? payload.shadowStrength : currentConfig.shadowStrength,
				customPos: payload.customPos === undefined ? currentConfig.customPos : readCustomPos(payload.customPos)
			};
			if (payload.customPos === null) {
				lastSyncedOverlayPosKey = '';
			}
			applyOverlayStyle();
			return;
		}

		if (message.type === 'AUTO_TRANSLATE_TOGGLE') {
			const payload = message.payload as { active?: boolean } | undefined;
			currentConfig = { ...currentConfig, autoTranslate: Boolean(payload?.active) };
			if (!currentConfig.autoTranslate) {
				if (pendingSubtitleEmitTimer != null) {
					window.clearTimeout(pendingSubtitleEmitTimer);
					pendingSubtitleEmitTimer = null;
				}
				pendingSubtitleText = '';
				updateOverlayText('');
			}
			applyOverlayStyle();
			return;
		}

		if (message.type === 'OVERLAY_RESET_POSITION') {
			currentConfig = { ...currentConfig, position: 'bottom', offsetMs: 0, customPos: null };
			lastSyncedOverlayPosKey = '';
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

		if (message.type === 'IMPORT_ES_SRT') {
			const payload = message.payload as { srtText?: string } | undefined;
			importedEsCues = parseTimedTextIntoCues(payload?.srtText ?? '');
			currentSubtitle = '';
			scanForSubtitleChanges();
			void sendToSidebar({
				type: 'IMPORT_ES_SRT_RESULT',
				payload: { importedCount: importedEsCues.length }
			}).catch(() => undefined);
			return;
		}

		if (message.type === 'CLEAR_IMPORTED_ES_SRT') {
			importedEsCues = [];
			currentSubtitle = '';
			return;
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
					courseTitle: getCourseTitle(),
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

		if (message.type === 'RUN_PIPELINE_TRANSLATION') {
			const payload = message.payload as { lectureKey?: unknown } | undefined;
			requestPipelineTranslation(typeof payload?.lectureKey === 'string' ? payload.lectureKey : undefined);
		}
	});
}

function runBootstrapOnce() {
	const globalWindow = window as unknown as Window & Record<string, unknown>;
	if (globalWindow[BOOTSTRAP_GUARD_KEY] === DOCK_BUILD_TAG) {
		cleanupStaleDockHosts();
		return;
	}

	globalWindow[BOOTSTRAP_GUARD_KEY] = DOCK_BUILD_TAG;
	bootstrap();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', runBootstrapOnce, { once: true });
} else {
	runBootstrapOnce();
}
