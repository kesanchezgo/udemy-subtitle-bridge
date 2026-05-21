// ─── usePersistedState ────────────────────────────────────────────────────────
// Drop-in replacement for useState that also persists the value to
// Chrome Storage (or localStorage in preview mode).
//
// Usage:
//   const [fontSize, setFontSize] = usePersistedState("overlay_font_size", [24]);
//
// On mount the stored value is loaded asynchronously.
// Every `set` call updates both React state AND the storage layer.

import { useState, useEffect, useCallback, useRef } from "react";
import { chromeStorage } from "../services/chromeStorage";

type Setter<T> = (value: T | ((prev: T) => T)) => void;

export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, Setter<T>] {
  const [value, setValueRaw] = useState<T>(defaultValue);
  // Track whether the current set was triggered by ourselves to avoid
  // an extra re-render from the storage change event.
  const selfSet = useRef(false);

  // ── Load persisted value on mount ─────────────────────────────────────────
  useEffect(() => {
    chromeStorage.get([key]).then((data) => {
      if (data[key] !== undefined) {
        setValueRaw(data[key] as T);
      }
    });

    // ── Listen for changes driven by *other* components / extension views ───
    return chromeStorage.onChange((changes) => {
      if (key in changes) {
        if (selfSet.current) {
          // This change was triggered by us — skip to avoid duplicate render
          selfSet.current = false;
          return;
        }
        setValueRaw(changes[key] as T);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // ── Setter — updates state AND persists ───────────────────────────────────
  const setValue: Setter<T> = useCallback(
    (newVal) => {
      setValueRaw((prev) => {
        const resolved =
          typeof newVal === "function"
            ? (newVal as (p: T) => T)(prev)
            : newVal;
        selfSet.current = true;
        chromeStorage.set({ [key]: resolved });
        return resolved;
      });
    },
    [key]
  );

  return [value, setValue];
}
