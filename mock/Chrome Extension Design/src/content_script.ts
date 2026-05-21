// ═══════════════════════════════════════════════════════════════════════════════
// Udemy Subtitle Bridge — Content Script  (Manifest V3 · Chrome Extension)
// ───────────────────────────────────────────────────────────────────────────────
// Arquitectura: In-page Dock con Shadow DOM (migrado de Chrome Side Panel)
//
// Dos responsabilidades principales:
//   1. SUBTITLE OVERLAY  → captura subtítulos EN → traduce → superpone ES
//   2. IN-PAGE DOCK      → inyecta el panel React de la extensión en un
//                          Shadow Root aislado, posicionado como dock derecho
//
// Pipeline completo:
//   MutationObserver → debounce → cache lookup → local AI API → DOM overlay
//
// Comunicación dock ↔ content_script:
//   → CustomEvent "usb:dock→cs"   (dock envía al content script)
//   ← CustomEvent "usb:cs→dock"   (content script envía al dock)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────────────────────
interface OverlayConfig {
  show:           boolean;
  fontSize:       number;
  opacity:        number;
  position:       "top" | "center" | "bottom";
  textColor:      "white" | "yellow" | "cyan";
  shadowStrength: number;
  syncOffset:     number;
}

type MessageType =
  | "PING"
  | "PONG"
  | "OVERLAY_CONFIG_UPDATE"
  | "AUTO_TRANSLATE_TOGGLE"
  | "SUBTITLE_LINE_RECEIVED"
  | "OVERLAY_RESET_POSITION"
  | "DOCK_READY"
  | "DOCK_COLLAPSE"
  | "DOCK_EXPAND"
  | "DOCK_RESIZE";

interface BridgeMessage {
  type:     MessageType;
  payload?: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const LOCAL_AI_URL     = "http://127.0.0.1:8010";
const OVERLAY_ID       = "usb-subtitle-overlay";
const HANDLE_ID        = "usb-drag-handle";
const TEXT_ID          = "usb-subtitle-text";
const DOCK_HOST_ID     = "usb-dock-host";
const DOCK_ROOT_ID     = "usb-dock-root";
const DEBOUNCE_MS      = 150;
const MAX_CACHE        = 500;
const STORAGE_POS_KEY  = "overlay_custom_pos";
const DOCK_WIDTH_KEY   = "dock_width";
const DOCK_COLLAPSED_KEY = "dock_collapsed";

// ── Udemy subtitle DOM selectors (orden de confiabilidad) ─────────────────────
// Ver docs/06-UDEMY-HTML-INTEGRACION.md para contexto completo
const SUBTITLE_SELECTORS = [
  "[data-purpose='captions-cue-text']",           // ✅ Más estable (data-purpose)
  ".captions-display--captions-cue-text--TQ0DQ",  // ⚠️ Hash puede cambiar
  ".captions-display--captions-cue-text--ECkct",  // Hash anterior conocido
  ".vjs-text-track-cue span",                     // Fallback legacy
];

// ── Selectores del player para inyección del overlay ─────────────────────────
const VIDEO_WRAPPER_SELECTORS = [
  "[id^='shaka-video-container-']",               // ✅ Más confiable
  ".video-player--video-wrapper--fh4Nq",          // Fallback con hash
  "[data-purpose='course-video-player']",         // data-purpose estable
];

// ── Udemy layout selector — para posicionar el dock ──────────────────────────
// El dock se añade como hijo de .ud-app-loader o de document.body
const COURSE_APP_SELECTOR = ".ud-app-loader.ud-component--course-taking--app";

// ── Runtime config ────────────────────────────────────────────────────────────
let config: OverlayConfig = {
  show:           true,
  fontSize:       24,
  opacity:        85,
  position:       "bottom",
  textColor:      "white",
  shadowStrength: 60,
  syncOffset:     0,
};
let autoTranslate = true;

// ── Custom drag position (percentages 0–100 relative to video container) ──────
let customPos: { x: number; y: number } | null = null;

// Load saved drag position on init
chrome.storage.sync.get([STORAGE_POS_KEY], (result) => {
  if (result[STORAGE_POS_KEY]) {
    customPos = result[STORAGE_POS_KEY] as { x: number; y: number };
  }
});

// ── Translation cache ─────────────────────────────────────────────────────────
const cache = new Map<string, string>();

function cacheSet(en: string, es: string): void {
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(en, es);
}

// ── Local AI translate ────────────────────────────────────────────────────────
async function translateEN(en: string): Promise<string> {
  const trimmed = en.trim();
  if (!trimmed) return "";
  if (cache.has(trimmed)) return cache.get(trimmed)!;

  try {
    const res = await fetch(`${LOCAL_AI_URL}/v1/chat/completions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "local-model",
        messages: [
          {
            role:    "system",
            content:
              "Eres un traductor técnico de inglés a español especializado en cursos de programación. " +
              "Traduce de forma natural y precisa preservando términos técnicos en inglés (JVM, heap, thread…). " +
              "Responde ÚNICAMENTE con la traducción, sin comillas ni explicaciones.",
          },
          { role: "user", content: trimmed },
        ],
        temperature: 0.1,
        max_tokens:  150,
        stream:      false,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const es: string = data.choices?.[0]?.message?.content?.trim() ?? trimmed;
    cacheSet(trimmed, es);
    return es;
  } catch {
    return trimmed;
  }
}

// ── CSS helpers ───────────────────────────────────────────────────────────────
const TEXT_COLOR_MAP: Record<string, string> = {
  white:  "#ffffff",
  yellow: "#fde047",
  cyan:   "#67e8f9",
};

function buildContainerCSS(): string {
  if (customPos !== null) {
    return `
      position: absolute;
      left: ${customPos.x}%;
      top: ${customPos.y}%;
      transform: translateX(-50%);
      z-index: 2147483647;
      display: flex;
      justify-content: center;
      pointer-events: none;
    `;
  }

  const pos: Record<string, string> = {
    top:    "top: 24px; bottom: auto; transform: none;",
    center: "top: 50%; bottom: auto; transform: translateY(-50%);",
    bottom: "bottom: 48px; top: auto; transform: none;",
  };
  return `
    position: absolute;
    left: 0; right: 0;
    z-index: 2147483647;
    display: flex;
    justify-content: center;
    padding: 0 24px;
    pointer-events: none;
    transition: top 0.3s ease, bottom 0.3s ease;
    ${pos[config.position] ?? pos.bottom}
  `;
}

function buildSubtitleHTML(text: string): string {
  if (!text) return "";
  const color  = TEXT_COLOR_MAP[config.textColor] ?? "#ffffff";
  const shadow = config.shadowStrength > 0
    ? `0 1px ${Math.round(config.shadowStrength / 20)}px rgba(0,0,0,${config.shadowStrength / 100})`
    : "none";
  return `<span style="
    display: inline-block;
    background: rgba(0,0,0,${config.opacity / 100});
    color: ${color};
    font-size: ${config.fontSize}px;
    line-height: 1.45;
    padding: 4px 14px 5px;
    border-radius: 4px;
    text-shadow: ${shadow};
    transition: all 0.3s ease;
  ">${text}</span>`;
}

// ── Drag handle HTML ──────────────────────────────────────────────────────────
const DRAG_HANDLE_HTML = `
  <svg width="16" height="10" viewBox="0 0 16 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="16" height="2" rx="1" fill="rgba(255,255,255,0.55)"/>
    <rect x="0" y="4" width="16" height="2" rx="1" fill="rgba(255,255,255,0.55)"/>
    <rect x="0" y="8" width="16" height="2" rx="1" fill="rgba(255,255,255,0.55)"/>
  </svg>
`;

// ── Drag state ────────────────────────────────────────────────────────────────
let isDragging   = false;
let dragStartX   = 0;
let dragStartY   = 0;
let dragStartPxX = 0;
let dragStartPxY = 0;

function setupOverlayDrag(handle: HTMLElement, overlay: HTMLElement): void {
  handle.addEventListener("pointerdown", (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;

    const container = overlay.parentElement;
    if (!container) return;

    const cRect = container.getBoundingClientRect();
    const oRect = overlay.getBoundingClientRect();

    dragStartPxX = oRect.left + oRect.width / 2 - cRect.left;
    dragStartPxY = oRect.top - cRect.top;
    dragStartX   = e.clientX;
    dragStartY   = e.clientY;

    handle.style.cursor = "grabbing";
    handle.setPointerCapture(e.pointerId);
  }, { passive: false });

  handle.addEventListener("pointermove", (e: PointerEvent) => {
    if (!isDragging) return;
    const container = overlay.parentElement;
    if (!container) return;

    const cRect = container.getBoundingClientRect();
    const dx    = e.clientX - dragStartX;
    const dy    = e.clientY - dragStartY;

    const newPxX = dragStartPxX + dx;
    const newPxY = dragStartPxY + dy;

    const newX = Math.max(8, Math.min(92, (newPxX / cRect.width)  * 100));
    const newY = Math.max(3, Math.min(90, (newPxY / cRect.height) * 100));

    customPos = { x: newX, y: newY };
    overlay.style.cssText = buildContainerCSS();
  });

  handle.addEventListener("pointerup", () => {
    if (!isDragging) return;
    isDragging         = false;
    handle.style.cursor = "grab";
    if (customPos) {
      chrome.storage.sync.set({ [STORAGE_POS_KEY]: customPos });
    }
  });

  handle.addEventListener("pointercancel", () => {
    isDragging          = false;
    handle.style.cursor = "grab";
  });
}

// ── Overlay DOM management ────────────────────────────────────────────────────
function getVideoWrapper(): HTMLElement {
  for (const sel of VIDEO_WRAPPER_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  // Ultimate fallback: el elemento <video> más cercano
  return document.querySelector("video")?.closest<HTMLElement>("[class*='video']") ?? document.body;
}

function getOrCreateOverlay(): HTMLElement {
  let el = document.getElementById(OVERLAY_ID);
  if (el) return el;

  el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.setAttribute("data-usb", "1");

  const textEl = document.createElement("div");
  textEl.id    = TEXT_ID;
  el.appendChild(textEl);

  const handle = document.createElement("div");
  handle.id    = HANDLE_ID;
  handle.innerHTML = DRAG_HANDLE_HTML;
  handle.style.cssText = `
    position: absolute;
    top: -18px;
    left: 50%;
    transform: translateX(-50%);
    width: 28px;
    height: 14px;
    background: rgba(0,0,0,0.55);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 4px;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    opacity: 0;
    transition: opacity 0.2s ease;
    z-index: 2147483648;
    user-select: none;
  `;
  el.appendChild(handle);

  el.addEventListener("mouseenter", () => { handle.style.opacity = "1"; });
  el.addEventListener("mouseleave", () => { if (!isDragging) handle.style.opacity = "0"; });

  const container = getVideoWrapper();
  (container as HTMLElement).style.position = "relative";
  container.appendChild(el);

  setupOverlayDrag(handle, el);
  return el;
}

function renderOverlay(text: string): void {
  const el = getOrCreateOverlay();
  el.style.cssText = buildContainerCSS();

  const textEl = el.querySelector<HTMLElement>(`#${TEXT_ID}`);
  if (!textEl) return;

  if (config.show && autoTranslate && text) {
    textEl.innerHTML = buildSubtitleHTML(text);
  } else {
    textEl.innerHTML = "";
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// IN-PAGE DOCK — Shadow DOM Injection
// ══════════════════════════════════════════════════════════════════════════════
//
// Arquitectura del dock (producción real):
//
//  document.body
//  └── <div id="usb-dock-host">                      ← host element
//       └── #shadow-root (mode: "closed")             ← Shadow Root aislado
//            ├── <style>...tailwind + dock styles...</style>
//            └── <div id="usb-dock-root">             ← React mount point
//                 └── <InPageDock />                  ← Componente React
//
// Propiedades clave:
//   - position: fixed → funciona en fullscreen y en cualquier layout
//   - z-index: 2147483646 → justo debajo del overlay de subtítulos
//   - Shadow DOM cerrado → CSS de Udemy no entra, nuestro CSS no sale
//   - ResizeObserver → ajusta el margen derecho del video wrapper
//
// ─────────────────────────────────────────────────────────────────────────────

// CSS mínimo para el dock (en producción se inyectaría el bundle de Tailwind)
const DOCK_BASE_CSS = `
  :host {
    all: initial;
  }
  *, *::before, *::after {
    box-sizing: border-box;
  }
  #${DOCK_ROOT_ID} {
    position: fixed;
    top: 48px;          /* Justo debajo del navbar de Udemy (h-12 = 48px) */
    right: 0;
    height: calc(100vh - 48px);
    width: var(--dock-width, 360px);
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  #${DOCK_ROOT_ID}.collapsed {
    width: 40px;
  }
  /* Ajuste del layout de Udemy para hacer sitio al dock */
  .usb-layout-adjusted {
    margin-right: var(--dock-width, 360px) !important;
    transition: margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
`;

// Estado del dock
let dockWidth     = 360;
let dockCollapsed = false;
let dockShadowRoot: ShadowRoot | null = null;

// Cargar estado guardado del dock
chrome.storage.sync.get([DOCK_WIDTH_KEY, DOCK_COLLAPSED_KEY], (result) => {
  if (result[DOCK_WIDTH_KEY])   dockWidth     = result[DOCK_WIDTH_KEY]   as number;
  if (result[DOCK_COLLAPSED_KEY]) dockCollapsed = result[DOCK_COLLAPSED_KEY] as boolean;
});

/**
 * Ajusta el margen derecho del área de contenido de Udemy para que el
 * dock no tape el video. Se aplica al contenedor principal del layout.
 */
function adjustUdemyLayout(width: number, collapsed: boolean): void {
  const effectiveWidth = collapsed ? 40 : width;

  // Selector del contenedor de contenido de Udemy
  const contentCol =
    document.querySelector<HTMLElement>(".app--content-column--LnPGp") ??
    document.querySelector<HTMLElement>(".ud-app-loader") ??
    document.body;

  if (contentCol && contentCol !== document.body) {
    contentCol.style.marginRight = `${effectiveWidth}px`;
    contentCol.style.transition  = "margin-right 0.3s cubic-bezier(0.4,0,0.2,1)";
  }

  // Actualizar la variable CSS en el host del dock
  const host = document.getElementById(DOCK_HOST_ID);
  if (host) {
    host.style.setProperty("--dock-width", `${effectiveWidth}px`);
  }
}

/**
 * Crea el host element con Shadow DOM y monta el dock React.
 * En producción, esta función es el punto de entrada del dock.
 */
function initInPageDock(): void {
  // Evitar doble inicialización
  if (document.getElementById(DOCK_HOST_ID)) return;

  // 1. Crear el elemento host
  const host = document.createElement("div");
  host.id = DOCK_HOST_ID;
  host.setAttribute("data-usb", "1");
  host.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    z-index: 2147483646;
    pointer-events: none;
  `;

  // 2. Crear el Shadow Root (modo "closed" para máximo aislamiento)
  const shadow = host.attachShadow({ mode: "closed" });
  dockShadowRoot = shadow;

  // 3. Inyectar CSS base en el Shadow Root
  const styleEl     = document.createElement("style");
  styleEl.textContent = DOCK_BASE_CSS;
  shadow.appendChild(styleEl);

  // 4. Crear el punto de montaje React
  const mountPoint   = document.createElement("div");
  mountPoint.id      = DOCK_ROOT_ID;
  if (dockCollapsed) mountPoint.classList.add("collapsed");
  shadow.appendChild(mountPoint);

  // 5. Insertar en el DOM
  document.body.appendChild(host);

  // 6. Ajustar layout de Udemy
  adjustUdemyLayout(dockWidth, dockCollapsed);

  // 7. Montar React app en el Shadow Root
  // En producción:
  //   import { createRoot } from "react-dom/client";
  //   import { InPageDock } from "./components/InPageDock";
  //   const root = createRoot(mountPoint);
  //   root.render(<InPageDock ... />);
  //
  // NOTA: El bundle de Tailwind también se inyecta en el Shadow Root:
  //   const tailwindEl = document.createElement("link");
  //   tailwindEl.rel = "stylesheet";
  //   tailwindEl.href = chrome.runtime.getURL("assets/tailwind.css");
  //   shadow.insertBefore(tailwindEl, mountPoint);

  console.info("[USB Dock] Shadow DOM dock inyectado. Mount point listo.", {
    dockWidth,
    dockCollapsed,
    shadowMode: "closed",
  });
}

// ── Escuchar mensajes del dock (CustomEvents del Shadow Root) ─────────────────
window.addEventListener("usb:dock→cs", (e: Event) => {
  const msg = (e as CustomEvent<BridgeMessage>).detail;

  if (msg.type === "DOCK_COLLAPSE") {
    dockCollapsed = true;
    adjustUdemyLayout(dockWidth, true);
    chrome.storage.sync.set({ [DOCK_COLLAPSED_KEY]: true });
  }

  if (msg.type === "DOCK_EXPAND") {
    dockCollapsed = false;
    adjustUdemyLayout(dockWidth, false);
    chrome.storage.sync.set({ [DOCK_COLLAPSED_KEY]: false });
  }

  if (msg.type === "DOCK_RESIZE") {
    const { width } = (msg.payload ?? {}) as { width?: number };
    if (width && width >= 300 && width <= 560) {
      dockWidth = width;
      adjustUdemyLayout(dockWidth, dockCollapsed);
      chrome.storage.sync.set({ [DOCK_WIDTH_KEY]: dockWidth });
    }
  }

  if (msg.type === "OVERLAY_CONFIG_UPDATE") {
    config = { ...config, ...(msg.payload as Partial<OverlayConfig>) };
    renderOverlay(lastCapture);
    chrome.runtime.sendMessage(msg satisfies BridgeMessage);
  }

  if (msg.type === "AUTO_TRANSLATE_TOGGLE") {
    const p = msg.payload as { active: boolean };
    autoTranslate = p.active;
    if (!autoTranslate) {
      const textEl = document.querySelector<HTMLElement>(`#${TEXT_ID}`);
      if (textEl) textEl.innerHTML = "";
    }
    chrome.runtime.sendMessage(msg satisfies BridgeMessage);
  }
});

// ── Enviar mensajes al dock desde el content script ──────────────────────────
function sendToDock(msg: BridgeMessage): void {
  window.dispatchEvent(new CustomEvent("usb:cs→dock", { detail: msg }));
}

// ── Debounced translation pipeline ───────────────────────────────────────────
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastCapture = "";

function scheduleTranslation(en: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);

  const delay = DEBOUNCE_MS + Math.max(0, config.syncOffset);
  debounceTimer = setTimeout(async () => {
    if (!autoTranslate || !config.show) return;
    const es = await translateEN(en);
    renderOverlay(es);

    // Notificar al dock (React) con la traducción
    sendToDock({
      type:    "SUBTITLE_LINE_RECEIVED",
      payload: { en, es, latencyMs: 0 },
    });

    // También al service worker (para logging)
    chrome.runtime.sendMessage({
      type:    "SUBTITLE_LINE_RECEIVED",
      payload: { en, es, latencyMs: 0 },
    } satisfies BridgeMessage);
  }, delay);
}

// ── MutationObserver — captura subtítulos ─────────────────────────────────────
function findSubtitleEl(): Element | null {
  for (const sel of SUBTITLE_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function startObserver(): MutationObserver {
  const root     = findSubtitleEl()?.parentElement ?? document.body;
  const observer = new MutationObserver(() => {
    const el   = findSubtitleEl();
    if (!el) return;
    const text = el.textContent?.trim() ?? "";
    if (!text || text === lastCapture) return;
    lastCapture = text;
    scheduleTranslation(text);
  });

  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return observer;
}

// ── Detectar cambio de lección (Udemy es SPA) ─────────────────────────────────
function observeNavigation(): void {
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl     = location.href;
      lastCapture = "";
      // Reset overlay position al cambiar de lección
      customPos = null;
      const overlayEl = document.getElementById(OVERLAY_ID);
      if (overlayEl) overlayEl.style.cssText = buildContainerCSS();
      // Notificar al dock
      sendToDock({ type: "SUBTITLE_LINE_RECEIVED", payload: { en: "", ts: Date.now() } });
    }
  }).observe(document, { subtree: true, childList: true });
}

// ── Activar captions automáticamente si no están activos ─────────────────────
async function ensureCaptionsEnabled(): Promise<void> {
  const captionsBtn = document.querySelector<HTMLElement>(
    "[data-purpose='captions-dropdown-button']"
  );
  if (!captionsBtn) return;

  const activeCaptionEl = document.querySelector("[data-purpose='captions-cue-text']");
  if (activeCaptionEl) return; // Ya activos

  captionsBtn.click();
  await new Promise(resolve => setTimeout(resolve, 300));

  const captionsMenu = document.querySelector("[data-purpose='captions-dropdown-menu']");
  if (!captionsMenu) { captionsBtn.click(); return; }

  const firstOption = captionsMenu.querySelector<HTMLElement>("button[role='menuitemradio']");
  if (firstOption) firstOption.click();
  else captionsBtn.click();
}

// ── chrome.runtime message listener ──────────────────────────────────────────
// Mensajes desde el service worker o desde la popup (compatibilidad)
chrome.runtime.onMessage.addListener(
  (msg: BridgeMessage, _sender, sendResponse) => {
    switch (msg.type) {
      case "PING":
        sendResponse({ type: "PONG" });
        break;

      case "OVERLAY_CONFIG_UPDATE":
        config = { ...config, ...(msg.payload as Partial<OverlayConfig>) };
        renderOverlay(lastCapture);
        sendToDock(msg); // Reenviar al dock
        sendResponse({ ok: true });
        break;

      case "AUTO_TRANSLATE_TOGGLE": {
        const p      = msg.payload as { active: boolean };
        autoTranslate = p.active;
        if (!autoTranslate) {
          const textEl = document.querySelector<HTMLElement>(`#${TEXT_ID}`);
          if (textEl) textEl.innerHTML = "";
        }
        sendToDock(msg);
        sendResponse({ ok: true });
        break;
      }

      case "OVERLAY_RESET_POSITION":
        customPos = null;
        chrome.storage.sync.remove(STORAGE_POS_KEY);
        renderOverlay(lastCapture);
        sendResponse({ ok: true });
        break;
    }
    return true;
  }
);

// ── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  // 1. Arrancar el MutationObserver para subtítulos
  let observer = startObserver();

  // 2. Inicializar el In-page Dock con Shadow DOM
  //    (en producción, espera a que el layout de Udemy esté disponible)
  const dockInitTimeout = setTimeout(() => {
    initInPageDock();
    ensureCaptionsEnabled();
    observeNavigation();
  }, 800); // Espera a que Udemy haya hidratado su React app

  // 3. Re-conectar el observer si Udemy navega a otra lección
  let reattachTimer: ReturnType<typeof setInterval> | null = null;
  reattachTimer = setInterval(() => {
    const newRoot = findSubtitleEl()?.parentElement;
    if (
      newRoot &&
      !newRoot.isEqualNode(
        document.querySelector(`#${OVERLAY_ID}`)?.parentElement ?? null
      )
    ) {
      observer.disconnect();
      observer = startObserver();
    }
  }, 2500);

  // 4. Cleanup
  window.addEventListener("beforeunload", () => {
    observer.disconnect();
    if (reattachTimer) clearInterval(reattachTimer);
    clearTimeout(dockInitTimeout);
    // Restaurar el margen de Udemy
    adjustUdemyLayout(0, true);
  });
})();