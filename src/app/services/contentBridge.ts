// ─── Content Script Bridge ────────────────────────────────────────────────────
// Abstracts Chrome's message-passing API so the same code works both
// inside a real Chrome extension and in this browser preview.

type ChromeApi = typeof globalThis & {
  chrome?: {
    tabs?: {
      query: (
        queryInfo: { active: boolean; currentWindow: boolean },
        cb: (tabs: Array<{ id?: number }>) => void
      ) => void;
      sendMessage: (tabId: number, message: BridgeMessage) => void;
    };
    runtime?: {
      sendMessage: (message: BridgeMessage, callback?: (response?: unknown) => void) => void;
      lastError?: unknown;
      onMessage?: {
        addListener: (listener: (...args: unknown[]) => unknown) => void;
        removeListener: (listener: (...args: unknown[]) => unknown) => void;
      };
    };
  };
};

export type BridgeMessageType = string;

export interface OverlayConfig {
  show: boolean;
  fontSize: number;
  opacity: number;
  position: "top" | "center" | "bottom";
  textColor: "white" | "yellow" | "cyan";
  shadowStrength: number;
  syncOffset: number;
  /** Chip de glosario sobre el video. El nombre REAL que envía
   *  ExtensionSidebar — antes se declaraba showGlossary y el interruptor no
   *  hacía nada en la extensión real (tsc no lo pillaba: payload sin tipar). */
  showGlossaryChip?: boolean;
  /** Posición libre arrastrada por el usuario (Captions → Posición libre). */
  customPos?: { x: number; y: number } | null;
}

export interface BridgeMessage {
  type: BridgeMessageType;
  payload?: unknown;
}

const USB_TO_CONTENT_EVENT = "usb_to_content";
const USB_TO_SIDEBAR_EVENT = "usb_to_sidebar";

// Message types handled by the content script's own chrome.runtime listener
// (setupChromeMessageHandler). The bridge's passive runtime listener must skip
// them so a single popup action is not processed twice.
const DEDICATED_HANDLER_TYPES = new Set<string>([
  "TOGGLE_DOCK_VISIBILITY",
  "SET_DOCK_VISIBILITY",
]);

function getChromeApi(): ChromeApi["chrome"] | undefined {
  const chromeApi = globalThis as ChromeApi;
  return chromeApi.chrome;
}

function hasWindowContext(): boolean {
  return typeof window !== "undefined" && typeof window.addEventListener === "function";
}

function isExtensionPageContext(): boolean {
  if (!hasWindowContext()) return false;
  const protocol = window.location?.protocol ?? "";
  return protocol === "chrome-extension:" || protocol === "moz-extension:";
}

function canUseTabsMessaging(): boolean {
  const chromeApi = getChromeApi();
  return isExtensionPageContext() && typeof chromeApi?.tabs?.query === "function";
}

function canUseRuntimeMessaging(): boolean {
  const chromeApi = getChromeApi();
  return typeof chromeApi?.runtime?.sendMessage === "function";
}

function safeRuntimeSendMessage(message: BridgeMessage): void {
  const chromeApi = getChromeApi();
  if (typeof chromeApi?.runtime?.sendMessage !== "function") return;
  try {
    chromeApi.runtime.sendMessage(message, () => {
      // Accessing lastError consumes benign errors such as extension reloads.
      void (chromeApi.runtime as { lastError?: unknown }).lastError;
    });
  } catch (_error) {
    // The Udemy page can keep an old content script alive after reloading the
    // extension. Ignore that stale context; the user can reload the tab.
  }
}

function addRuntimeListener(
  callback: (message: BridgeMessage) => void,
  withSendResponse: boolean,
  skipTypes?: Set<string>
): (() => void) | null {
  const chromeApi = getChromeApi();
  if (!chromeApi?.runtime?.onMessage) return null;

  const listener = (
    msg: BridgeMessage,
    _sender?: unknown,
    sendResponse?: (r: unknown) => void
  ) => {
    // Types owned by the content script's dedicated runtime handler are skipped
    // here so the same message is not processed (and, for toggles, applied) twice.
    if (skipTypes && msg && skipTypes.has(msg.type)) {
      return undefined;
    }
    callback(msg);
    if (withSendResponse && typeof sendResponse === "function") {
      sendResponse({ ok: true });
      return true;
    }
    return undefined;
  };

  chromeApi.runtime.onMessage.addListener(listener);
  return () => chromeApi.runtime.onMessage.removeListener(listener);
}

function addWindowListener(
  eventName: string,
  callback: (message: BridgeMessage) => void
): (() => void) | null {
  if (!hasWindowContext()) return null;
  const handler = (e: Event) => callback((e as CustomEvent<BridgeMessage>).detail);
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}

export const contentBridge = {
  // ── Sidebar/popup → content script ─────────────────────────────────────────
  async sendToContent(message: BridgeMessage): Promise<void> {
    if (canUseTabsMessaging()) {
      const chromeApi = getChromeApi();
      chromeApi?.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId != null) {
          chromeApi?.tabs?.sendMessage(tabId, message);
        }
      });
      return;
    }
    if (hasWindowContext()) {
      window.dispatchEvent(new CustomEvent(USB_TO_CONTENT_EVENT, { detail: message }));
    }
  },

  // ── Content script → sidebar/popup ─────────────────────────────────────────
  async sendToSidebar(message: BridgeMessage): Promise<void> {
    // El dock in-page vive en el MISMO contexto que el content script, y
    // chrome.runtime.sendMessage NUNCA hace eco al contexto emisor: sin el
    // evento de ventana, mensajes como LECTURE_CONTEXT_UPDATE no llegan nunca
    // al dock. Por eso la entrega por window es incondicional (cuando existe),
    // y el runtime queda como mirror para oyentes en otros contextos (popup).
    if (hasWindowContext()) {
      window.dispatchEvent(new CustomEvent(USB_TO_SIDEBAR_EVENT, { detail: message }));
    }

    if (isExtensionPageContext() && canUseRuntimeMessaging()) {
      safeRuntimeSendMessage(message);
    }
  },

  // ── Sidebar: listen for messages FROM the content script ───────────────────
  onMessageFromContent(
    callback: (message: BridgeMessage) => void
  ): () => void {
    // Suscribir AMBOS canales cuando existen: el runtime entrega mensajes de
    // otros contextos (popup/background), el evento de ventana entrega los del
    // content script en la misma página (el emisor no se auto-escucha por
    // runtime). No hay duplicados: el emisor queda excluido del runtime.
    if (isExtensionPageContext()) {
      const cleanupRuntime = addRuntimeListener(callback, false);
      const cleanupWindow = addWindowListener(USB_TO_SIDEBAR_EVENT, callback);
      return () => {
        cleanupRuntime?.();
        cleanupWindow?.();
      };
    }
    const cleanupWindow = addWindowListener(USB_TO_SIDEBAR_EVENT, callback);
    return () => cleanupWindow?.();
  },

  // ── Content script: listen for messages FROM the sidebar ───────────────────
  onMessageFromSidebar(
    callback: (message: BridgeMessage) => void
  ): () => void {
    if (isExtensionPageContext()) {
      const cleanupRuntime = addRuntimeListener(callback, true);
      return () => cleanupRuntime?.();
    }

    // On web page context we support BOTH:
    // - window events (in-page dock <-> content script)
    // - runtime messages (popup/background -> content script via tabs.sendMessage)
    //
    // The runtime listener is passive (no sendResponse) and skips the visibility
    // toggles, which setupChromeMessageHandler() already owns; otherwise those
    // toggles would be applied twice and race each other.
    const cleanupWindow = addWindowListener(USB_TO_CONTENT_EVENT, callback);
    const cleanupRuntime = addRuntimeListener(callback, false, DEDICATED_HANDLER_TYPES);
    return () => {
      cleanupWindow?.();
      cleanupRuntime?.();
    };
  },
};

export const sendToContent = (message: BridgeMessage) => contentBridge.sendToContent(message);
export const sendToSidebar = (message: BridgeMessage) => contentBridge.sendToSidebar(message);
export const onMessageFromContent = (callback: (message: BridgeMessage) => void) =>
  contentBridge.onMessageFromContent(callback);
export const onMessageFromSidebar = (callback: (message: BridgeMessage) => void) =>
  contentBridge.onMessageFromSidebar(callback);
