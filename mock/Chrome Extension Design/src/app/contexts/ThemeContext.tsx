import React, { createContext, useContext, useState, useEffect } from "react";
import { THEME_CSS } from "../styles/sepia-overrides";

// ── Types ─────────────────────────────────────────────────────────────────────
export type DockTheme = "dark" | "sepia";

interface ThemeContextValue {
  theme:       DockTheme;
  isSepia:     boolean;
  toggleTheme: () => void;
  /** Devuelve `dark` cuando el tema es oscuro, `light` cuando es claro/sepia */
  t: (dark: string, light: string) => string;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:       "dark",
  isSepia:     false,
  toggleTheme: () => {},
  t:           (dark) => dark,
});

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

/** Paleta Light / Warm White — tokens de referencia */
export const SEPIA = {
  pageBg:      "#f8f7f6",
  headerBg:    "#f0efed",
  tabBarBg:    "#f2f1ef",
  cardBg:      "#ffffff",
  barBg:       "#e8e7e5",
  inputBg:     "#f2f1ef",
  footerBg:    "#f2f1ef",
  borderColor: "rgba(0,0,0,0.07)",
  textPrimary: "#1a1918",
  textMuted:   "#3d3a38",   // strengthened from #6e6b68 for better readability
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<DockTheme>("dark");
  const isSepia = theme === "sepia";

  const toggleTheme = () => setTheme(prev => (prev === "dark" ? "sepia" : "dark"));

  /** Devuelve la clase correcta según el tema activo */
  const t = (dark: string, light: string) => (isSepia ? light : dark);

  // ── Inyectar CSS de paleta en <head> de forma imperativa ─────────────────
  // Se inyecta UNA SOLA VEZ (al montar), pues el CSS define vars para AMBOS
  // temas mediante .usb-dock (dark) y .usb-dock.dock-sepia (light).
  // No necesitamos reinyectar al cambiar de tema — solo cambiar la clase
  // dock-sepia en el elemento raíz del dock activa el override automáticamente.
  useEffect(() => {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ThemeContext.Provider value={{ theme, isSepia, toggleTheme, t }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useDockTheme() {
  return useContext(ThemeContext);
}