import React, { createContext, useContext, useState, useEffect } from "react";
import { THEME_CSS } from "../styles/sepia-overrides";

// ── Types ─────────────────────────────────────────────────────────────────────
export type DockTheme = "dark" | "sepia";

interface ThemeContextValue {
  theme:       DockTheme;
  isSepia:     boolean;
  isDark:      boolean;
  toggleTheme: () => void;
  /** Devuelve `dark` cuando el tema es oscuro, `light` cuando es claro/sepia */
  t: (dark: string, light: string) => string;
}

const THEME_STORAGE_KEY = "usb_dock_theme";

const ThemeContext = createContext<ThemeContextValue>({
  theme:       "dark",
  isSepia:     false,
  isDark:      true,
  toggleTheme: () => {},
  t:           (dark) => dark,
});

/** True when the OS/browser reports a light colour-scheme preference. */
function systemPrefersLight(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false;
  }
}

/**
 * Initial theme: a stored choice wins; with none, the OS preference decides.
 * This used to always boot dark, so a light-mode user got a dark dock until
 * they toggled it themselves.
 */
function resolveInitialTheme(): DockTheme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "sepia") return stored;
  } catch {
    /* private mode / storage disabled — fall through to the OS preference */
  }
  return systemPrefersLight() ? "sepia" : "dark";
}

// ── Paletas exportadas (para uso directo en componentes) ──────────────────────
/** Paleta Dark — tokens de referencia */
export const DARK = {
  pageBg:      "#1a1b1d",
  headerBg:    "#121214",
  cardBg:      "#141416",
  barBg:       "#0a0b0c",
  inputBg:     "#0c0c0f",
  textPrimary: "#ffffff",
  textMuted:   "rgba(255,255,255,0.4)",
  border:      "rgba(255,255,255,0.06)",
} as const;

/** Paleta Light / Pure White — Udemy-style cool neutral */
export const SEPIA = {
  pageBg:      "#f6f7f9",
  headerBg:    "#f3f4f6",
  tabBarBg:    "#f1f3f5",
  cardBg:      "#ffffff",
  barBg:       "#eceef1",
  inputBg:     "#f1f3f5",
  footerBg:    "#f1f3f5",
  borderColor: "rgba(0,0,0,0.08)",
  textPrimary: "#1c1d1f",
  textMuted:   "#4b4d52",
} as const;

// ── CSS vars — clases Tailwind que referencian las variables de paleta ────────
/** Helpers para usar CSS vars directamente en Tailwind (sin t()) */
export const TV = {
  bgPage:   "bg-[var(--usb-bg-2)]",
  bgHeader: "bg-[var(--usb-bg-1)]",
  bgCard:   "bg-[var(--usb-bg-3)]",
  bgBar:    "bg-[var(--usb-bg-0)]",
  bgInput:  "bg-[var(--usb-bg-4)]",
  fgBase:   "text-[var(--usb-fg)]",
  fgMid:    "text-[var(--usb-fg-mid)]",
  fgLo:     "text-[var(--usb-fg-lo)]",
  border:   "border-[var(--usb-border)]",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
const STYLE_ID = "usb-theme-css";

export function ThemeProvider({
  children,
  injectGlobalCss = true,
}: {
  children: React.ReactNode;
  injectGlobalCss?: boolean;
}) {
  const [theme, setTheme] = useState<DockTheme>(() => resolveInitialTheme());
  const isSepia = theme === "sepia";
  const isDark = theme === "dark";

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: DockTheme = prev === "dark" ? "sepia" : "dark";
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  };

  // Keep following the OS while the user has made no explicit choice; once they
  // toggle, the stored value takes over and this stops applying.
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch { /* ignore */ }
    if (stored === "dark" || stored === "sepia") return;

    let mq: MediaQueryList;
    try {
      mq = matchMedia("(prefers-color-scheme: light)");
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setTheme(e.matches ? "sepia" : "dark");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /** Devuelve la clase correcta según el tema activo */
  const t = (dark: string, light: string) => (isSepia ? light : dark);

  // ── Inyectar CSS de paleta en <head> de forma imperativa ─────────────────
  // Se inyecta UNA SOLA VEZ (al montar), pues el CSS define vars para AMBOS
  // temas mediante .usb-dock (dark) y .usb-dock.dock-sepia (light).
  // No necesitamos reinyectar al cambiar de tema — solo cambiar la clase
  // dock-sepia en el elemento raíz del dock activa el override automáticamente.
  useEffect(() => {
    if (!injectGlobalCss) {
      return;
    }

    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      // Insertar al FINAL de <head> para tener la última palabra en el cascade
      document.head.appendChild(el);
    }
    el.textContent = THEME_CSS;

    return () => {
      // No remover al desmontar — se reutiliza si el componente remonta
    };
  }, [injectGlobalCss]);

  return (
    <ThemeContext.Provider value={{ theme, isSepia, isDark, toggleTheme, t }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useDockTheme() {
  return useContext(ThemeContext);
}
