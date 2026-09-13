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
  // Counts in-flight self writes so the matching onChange events can be
  // ignored. A plain boolean loses events when two sets happen back-to-back.
  const pendingSelfSets = useRef(0);
  // Once the user (or an external actor) has set a value, the async initial
  // load must not clobber it with a stale stored value.
  const touched = useRef(false);

  // ── Load persisted value on mount ─────────────────────────────────────────
  useEffect(() => {
    touched.current = false;
    pendingSelfSets.current = 0;

    chromeStorage.get([key]).then((data) => {
      if (touched.current) return;
      if (data[key] !== undefined) {
        setValueRaw(data[key] as T);
      }
    });

    // ── Listen for changes driven by *other* components / extension views ───
    return chromeStorage.onChange((changes) => {
      if (key in changes) {
        if (pendingSelfSets.current > 0) {
          // This change was triggered by us — skip to avoid duplicate render
          pendingSelfSets.current -= 1;
          return;
        }
        touched.current = true;
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
        touched.current = true;
        pendingSelfSets.current += 1;
        chromeStorage.set({ [key]: resolved });
        return resolved;
      });
    },
    [key]
  );

  return [value, setValue];
}
