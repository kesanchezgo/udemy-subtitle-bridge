export type BridgeContext = 'content' | 'sidebar' | 'background';

export type BridgeMessage = {
  type: string;
  payload?: unknown;
  source?: BridgeContext;
  target?: BridgeContext;
};

const CONTENT_EVENT = 'usb_to_content';
const SIDEBAR_EVENT = 'usb_to_sidebar';

function getChromeApi() {
  return (globalThis as typeof globalThis & { chrome?: any }).chrome;
}

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

export async function sendToContent<TResponse = void>(message: BridgeMessage): Promise<TResponse> {
  const payload = { ...message, source: 'sidebar' as const, target: 'content' as const };
  const chromeApi = getChromeApi();

  if (chromeApi?.runtime?.sendMessage) {
    return await new Promise<TResponse>((resolve, reject) => {
      chromeApi.runtime.sendMessage(payload, (response: TResponse) => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          reject(new Error(error.message || 'Bridge message failed.'));
          return;
        }
        resolve(response);
      });
    });
  }

  dispatchFallback(CONTENT_EVENT, payload);
  return undefined as TResponse;
}

export async function sendToSidebar<TResponse = void>(message: BridgeMessage): Promise<TResponse> {
  const payload = { ...message, source: 'content' as const, target: 'sidebar' as const };
  const chromeApi = getChromeApi();

  if (chromeApi?.runtime?.sendMessage) {
    return await new Promise<TResponse>((resolve, reject) => {
      chromeApi.runtime.sendMessage(payload, (response: TResponse) => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          reject(new Error(error.message || 'Bridge message failed.'));
          return;
        }
        resolve(response);
      });
    });
  }

  dispatchFallback(SIDEBAR_EVENT, payload);
  return undefined as TResponse;
}

export function onMessageFromContent(handler: (message: BridgeMessage) => void) {
  const chromeApi = getChromeApi();
  if (chromeApi?.runtime?.onMessage) {
    const listener = (message: BridgeMessage) => {
      if (message?.source === 'content' || message?.target === 'sidebar') {
        handler(message);
      }
    };

    chromeApi.runtime.onMessage.addListener(listener);
    return () => chromeApi.runtime.onMessage.removeListener(listener);
  }

  return addFallbackListener(SIDEBAR_EVENT, handler);
}

export function onMessageFromSidebar(handler: (message: BridgeMessage) => void) {
  const chromeApi = getChromeApi();
  if (chromeApi?.runtime?.onMessage) {
    const listener = (message: BridgeMessage) => {
      if (message?.source === 'sidebar' || message?.target === 'content') {
        handler(message);
      }
    };

    chromeApi.runtime.onMessage.addListener(listener);
    return () => chromeApi.runtime.onMessage.removeListener(listener);
  }

  return addFallbackListener(CONTENT_EVENT, handler);
}

export const contentBridge = {
  sendToContent,
  sendToSidebar,
  onMessageFromContent,
  onMessageFromSidebar
};