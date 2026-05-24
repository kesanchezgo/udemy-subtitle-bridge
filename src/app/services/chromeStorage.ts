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

function getChromeStorageArea(area: "sync" | "local" = "sync") {
  const chromeApi = globalThis as ChromeApi;
  return chromeApi.chrome?.storage?.[area] ?? null;
}

function getFallbackStorage() {
  return globalThis.localStorage;
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
      const rawValue = getFallbackStorage().getItem(key);
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
      getFallbackStorage().setItem(key, JSON.stringify(value));
    }
  },

  onChange(callback: (changes: Record<string, unknown>) => void): () => void {
    const chromeApi = globalThis as ChromeApi;
    const onChanged = chromeApi.chrome?.storage?.onChanged;
    if (!onChanged) {
      return () => {};
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
      const rawValue = getFallbackStorage().getItem(key);
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
      getFallbackStorage().setItem(key, JSON.stringify(value));
    }
  },

  onChange(callback: (changes: Record<string, unknown>) => void): () => void {
    const chromeApi = globalThis as ChromeApi;
    const onChanged = chromeApi.chrome?.storage?.onChanged;
    if (!onChanged) {
      return () => {};
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

  getFallbackStorage().removeItem(key);
}
