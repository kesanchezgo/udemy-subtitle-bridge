// ─── Content Script Bridge ────────────────────────────────────────────────────
// Abstracts Chrome's message-passing API so the same code works both
// inside a real Chrome extension and in this browser preview.
//
// Extension context:
//   Sidebar  → chrome.tabs.sendMessage()   → content script
//   Content  → chrome.runtime.sendMessage() → sidebar/popup
//
// Preview context:
//   Uses custom window events:
//     "usb_to_content"  (sidebar → content sim in App.tsx)
//     "usb_to_sidebar"  (content sim → sidebar)

export type BridgeMessageType =
  | "PING"
  | "PONG"
  | "OVERLAY_CONFIG_UPDATE"
  | "AUTO_TRANSLATE_TOGGLE"
  | "SUBTITLE_LINE_RECEIVED"
  | "VIDEO_TIME_UPDATE"
  | "OVERLAY_RESET_POSITION";

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

function isChromeExtension(): boolean {
  return typeof chrome !== "undefined" && typeof chrome?.tabs?.query === "function";
}

function isChromeRuntime(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome?.runtime?.sendMessage === "function"
  );
}

export const contentBridge = {
  // ── Sidebar/popup → content script ─────────────────────────────────────────
  sendToContent(message: BridgeMessage): void {
    if (isChromeExtension()) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId != null) {
          chrome.tabs.sendMessage(tabId, message);
        }
      });
      return;
    }
    window.dispatchEvent(
      new CustomEvent("usb_to_content", { detail: message })
    );
  },

  // ── Content script → sidebar/popup ─────────────────────────────────────────
  sendToSidebar(message: BridgeMessage): void {
    if (isChromeRuntime()) {
      chrome.runtime.sendMessage(message);
      return;
    }
    window.dispatchEvent(
      new CustomEvent("usb_to_sidebar", { detail: message })
    );
  },

  // ── Sidebar: listen for messages FROM the content script ───────────────────
  onMessageFromContent(
    callback: (message: BridgeMessage) => void
  ): () => void {
    if (isChromeRuntime()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listener = (msg: BridgeMessage) => {
        callback(msg);
        return true;
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
    const handler = (e: Event) =>
      callback((e as CustomEvent<BridgeMessage>).detail);
    window.addEventListener("usb_to_sidebar", handler);
    return () => window.removeEventListener("usb_to_sidebar", handler);
  },

  // ── Content script: listen for messages FROM the sidebar ───────────────────
  onMessageFromSidebar(
    callback: (message: BridgeMessage) => void
  ): () => void {
    if (isChromeRuntime()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listener = (
        msg: BridgeMessage,
        _sender: unknown,
        sendResponse: (r: unknown) => void
      ) => {
        callback(msg);
        sendResponse({ ok: true });
        return true;
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
    const handler = (e: Event) =>
      callback((e as CustomEvent<BridgeMessage>).detail);
    window.addEventListener("usb_to_content", handler);
    return () => window.removeEventListener("usb_to_content", handler);
  },
};
