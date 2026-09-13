type ChromeApi = typeof globalThis & {
  chrome?: {
    storage?: {
      sync?: {
        get: (keys: string[] | string, cb: (items: Record<string, unknown>) => void) => void;
        set: (items: Record<string, unknown>, cb?: () => void) => void;
        remove: (key: string | string[], cb?: () => void) => void;
      };
      local?: {
        get: (keys: string[] | string, cb: (items: Record<string, unknown>) => void) => void;
        set: (items: Record<string, unknown>, cb?: () => void) => void;
        remove: (key: string | string[], cb?: () => void) => void;
      };
      onChanged?: {
        addListener: (
          cb: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void
        ) => void;
        removeListener: (
          cb: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void
        ) => void;
      };
    };
  };
};

// localStorage fallback keys are namespaced per Chrome storage area so the
// sync and local backends never collide in preview/dev mode.
const FALLBACK_KEY_PREFIX: Record<"sync" | "local", string> = {
  sync: "usb_sync_",
  local: "usb_local_",
};

// Custom event used to fan out storage changes between components in preview
// mode, where chrome.storage.onChanged does not exist.
const FALLBACK_CHANGE_EVENT = "usb_storage_change";

function getChromeStorageArea(area: "sync" | "local" = "sync") {
  const chromeApi = globalThis as ChromeApi;
  return chromeApi.chrome?.storage?.[area] ?? null;
}

function getFallbackStorage() {
  return globalThis.localStorage;
}

function fallbackKey(area: "sync" | "local", key: string) {
  return FALLBACK_KEY_PREFIX[area] + key;
}

function emitFallbackChange(area: "sync" | "local", items: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(
    new CustomEvent(FALLBACK_CHANGE_EVENT, { detail: { areaName: area, changes: items } })
  );
}

function fallbackOnChange(
  area: "sync" | "local",
  callback: (changes: Record<string, unknown>) => void,
): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ areaName: string; changes: Record<string, unknown> }>).detail;
    if (!detail || detail.areaName !== area) return;
    callback(detail.changes);
  };

  window.addEventListener(FALLBACK_CHANGE_EVENT, handler);
  return () => window.removeEventListener(FALLBACK_CHANGE_EVENT, handler);
}

export const chromeStorage = {
  async get(keys: string[]): Promise<Record<string, unknown>> {
    const storage = getChromeStorageArea();
    if (storage) {
      try {
        return await new Promise<Record<string, unknown>>((resolve) => {
          storage.get(keys, (items: Record<string, unknown>) => resolve(items || {}));
        });
      } catch (_error) {
        return {};
      }
    }

    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const rawValue = getFallbackStorage().getItem(fallbackKey("sync", key));
      if (!rawValue) continue;
      try {
        out[key] = JSON.parse(rawValue);
      } catch {
        out[key] = rawValue;
      }
    }
    return out;
  },

  async set(items: Record<string, unknown>): Promise<void> {
    const storage = getChromeStorageArea();
    if (storage) {
      try {
        await new Promise<void>((resolve) => {
          storage.set(items, () => resolve());
        });
      } catch (_error) {
        // Old content scripts can survive an extension reload. Ignore writes from
        // that invalidated context so they don't surface as unhandled promises.
      }
      return;
    }

    for (const [key, value] of Object.entries(items)) {
      getFallbackStorage().setItem(fallbackKey("sync", key), JSON.stringify(value));
    }
    emitFallbackChange("sync", items);
  },

  onChange(callback: (changes: Record<string, unknown>) => void): () => void {
    const chromeApi = globalThis as ChromeApi;
    const onChanged = chromeApi.chrome?.storage?.onChanged;
    if (!onChanged) {
      return fallbackOnChange("sync", callback);
    }

    const listener = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      areaName: string
    ) => {
      if (areaName !== "sync") return;
      const normalized: Record<string, unknown> = {};
      for (const [key, change] of Object.entries(changes)) {
        normalized[key] = change?.newValue;
      }
      callback(normalized);
    };

    onChanged.addListener(listener);
    return () => onChanged.removeListener(listener);
  },
};

export const chromeLocalStorage = {
  async get(keys: string[]): Promise<Record<string, unknown>> {
    const storage = getChromeStorageArea("local");
    if (storage) {
      try {
        return await new Promise<Record<string, unknown>>((resolve) => {
          storage.get(keys, (items: Record<string, unknown>) => resolve(items || {}));
        });
      } catch (_error) {
        return {};
      }
    }

    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const rawValue = getFallbackStorage().getItem(fallbackKey("local", key));
      if (!rawValue) continue;
      try {
        out[key] = JSON.parse(rawValue);
      } catch {
        out[key] = rawValue;
      }
    }
    return out;
  },

  async set(items: Record<string, unknown>): Promise<void> {
    const storage = getChromeStorageArea("local");
    if (storage) {
      try {
        await new Promise<void>((resolve) => {
          storage.set(items, () => resolve());
        });
      } catch (_error) {
        // Old content scripts can survive an extension reload. Ignore writes from
        // that invalidated context so they don't surface as unhandled promises.
      }
      return;
    }

    for (const [key, value] of Object.entries(items)) {
      getFallbackStorage().setItem(fallbackKey("local", key), JSON.stringify(value));
    }
    emitFallbackChange("local", items);
  },

  onChange(callback: (changes: Record<string, unknown>) => void): () => void {
    const chromeApi = globalThis as ChromeApi;
    const onChanged = chromeApi.chrome?.storage?.onChanged;
    if (!onChanged) {
      return fallbackOnChange("local", callback);
    }

    const listener = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      areaName: string
    ) => {
      if (areaName !== "local") return;
      const normalized: Record<string, unknown> = {};
      for (const [key, change] of Object.entries(changes)) {
        normalized[key] = change?.newValue;
      }
      callback(normalized);
    };

    onChanged.addListener(listener);
    return () => onChanged.removeListener(listener);
  },
};

export async function readStorageValue<T>(key: string): Promise<T | undefined> {
  const data = await chromeStorage.get([key]);
  return data[key] as T | undefined;
}

export async function writeStorageValue<T>(key: string, value: T): Promise<void> {
  await chromeStorage.set({ [key]: value });
}

export async function removeStorageValue(key: string): Promise<void> {
  const storage = getChromeStorageArea();
  if (storage) {
    try {
      await new Promise<void>((resolve) => {
        storage.remove(key, () => resolve());
      });
    } catch (_error) {
      // See chromeStorage.set: stale content scripts after extension reload.
    }
    return;
  }

  getFallbackStorage().removeItem(fallbackKey("sync", key));
  emitFallbackChange("sync", { [key]: undefined });
}
