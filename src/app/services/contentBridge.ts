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
      sendMessage: (message: BridgeMessage) => void;
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
}

export interface BridgeMessage {
  type: BridgeMessageType;
  payload?: unknown;
}

const USB_TO_CONTENT_EVENT = "usb_to_content";
const USB_TO_SIDEBAR_EVENT = "usb_to_sidebar";

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

function addRuntimeListener(
  callback: (message: BridgeMessage) => void,
  withSendResponse: boolean
): (() => void) | null {
  const chromeApi = getChromeApi();
  if (!chromeApi?.runtime?.onMessage) return null;

  const listener = (
    msg: BridgeMessage,
    _sender?: unknown,
    sendResponse?: (r: unknown) => void
  ) => {
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
    const extensionPage = isExtensionPageContext();

    // In in-page mode (content script + Shadow DOM dock), local window events
    // are the primary path so the dock receives messages reliably.
    if (!extensionPage && hasWindowContext()) {
      window.dispatchEvent(new CustomEvent(USB_TO_SIDEBAR_EVENT, { detail: message }));
      // Mirror to runtime as best effort (for popup/background listeners).
      if (canUseRuntimeMessaging()) {
        const chromeApi = getChromeApi();
        chromeApi?.runtime?.sendMessage(message);
      }
      return;
    }

    if (canUseRuntimeMessaging()) {
      const chromeApi = getChromeApi();
      chromeApi?.runtime?.sendMessage(message);
      return;
    }
    if (hasWindowContext()) {
      window.dispatchEvent(new CustomEvent(USB_TO_SIDEBAR_EVENT, { detail: message }));
    }
  },

  // ── Sidebar: listen for messages FROM the content script ───────────────────
  onMessageFromContent(
    callback: (message: BridgeMessage) => void
  ): () => void {
    if (isExtensionPageContext()) {
      const cleanupRuntime = addRuntimeListener(callback, false);
      return () => cleanupRuntime?.();
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
    const cleanupWindow = addWindowListener(USB_TO_CONTENT_EVENT, callback);
    const cleanupRuntime = addRuntimeListener(callback, true);
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
