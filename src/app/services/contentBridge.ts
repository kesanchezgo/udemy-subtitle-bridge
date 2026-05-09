export type BridgeContext = 'content' | 'sidebar' | 'background';

export type OverlayPosition = 'top' | 'center' | 'bottom';

export type OverlayTextColor = 'white' | 'yellow' | 'cyan';

export type OverlayConfig = {
  show?: boolean;
  visible?: boolean;
  enabled?: boolean;
  autoTranslate?: boolean;
  showOverlay?: boolean;
  position?: OverlayPosition;
  tone?: OverlayTextColor;
  textColor?: OverlayTextColor;
  fontSize?: number;
  opacity?: number;
  shadowStrength?: number;
  offsetMs?: number;
  syncOffset?: number | number[];
};

export type BridgeMessage = {
  type: string;
  payload?: unknown;
  source?: BridgeContext;
  target?: BridgeContext;
};

const CONTENT_EVENT = 'usb_to_content';
const SIDEBAR_EVENT = 'usb_to_sidebar';

function isBrowserFallback() {
  return typeof window !== 'undefined' && typeof window.dispatchEvent === 'function';
}

function dispatchFallback(eventName: string, message: BridgeMessage) {
  if (!isBrowserFallback()) {
    return;
  }

  window.dispatchEvent(new CustomEvent(eventName, { detail: message }));
}

function addFallbackListener(eventName: string, handler: (message: BridgeMessage) => void) {
  if (!isBrowserFallback()) {
    return () => undefined;
  }

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<BridgeMessage>).detail;
    if (detail && typeof detail.type === 'string') {
      handler(detail);
    }
  };

  window.addEventListener(eventName, listener as EventListener);
  return () => window.removeEventListener(eventName, listener as EventListener);
}

async function postBridgeMessage<TResponse = void>(payload: BridgeMessage, fallbackEventName: string): Promise<TResponse | undefined> {
  dispatchFallback(fallbackEventName, payload);
  return undefined;
}

export async function sendToContent<TResponse = void>(message: BridgeMessage): Promise<TResponse> {
  const payload = { ...message, source: 'sidebar' as const, target: 'content' as const };
  return (await postBridgeMessage<TResponse>(payload, CONTENT_EVENT)) as TResponse;
}

export async function sendToSidebar<TResponse = void>(message: BridgeMessage): Promise<TResponse> {
  const payload = { ...message, source: 'content' as const, target: 'sidebar' as const };
  return (await postBridgeMessage<TResponse>(payload, SIDEBAR_EVENT)) as TResponse;
}

export function onMessageFromContent(handler: (message: BridgeMessage) => void) {
  return addFallbackListener(SIDEBAR_EVENT, handler);
}

export function onMessageFromSidebar(handler: (message: BridgeMessage) => void) {
  return addFallbackListener(CONTENT_EVENT, handler);
}

export const contentBridge = {
  sendToContent,
  sendToSidebar,
  onMessageFromContent,
  onMessageFromSidebar
};