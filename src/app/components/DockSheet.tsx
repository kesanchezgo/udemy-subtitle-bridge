import React, { createContext, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "./icons";
import { useDockTheme } from "../contexts/ThemeContext";

/**
 * Hoja a pantalla completa del dock (debajo del header de 41px).
 * Una sola cáscara para Nivel (ProgressPanel) y Configuración: misma
 * superficie, cabecera fija, animación, Esc y botón de cierre.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/** Nodo del dock donde se proyectan las hojas; lo provee InPageDock. */
export const DockSheetHostContext = createContext<HTMLElement | null>(null);

export function DockSheet({
  open = true,
  keepMounted = false,
  eyebrow,
  title,
  ariaLabel,
  closeLabel = "Cerrar",
  onClose,
  children,
}: {
  /** Con keepMounted, controla visibilidad sin desmontar (estado de formularios, portales). */
  open?: boolean;
  keepMounted?: boolean;
  eyebrow: string;
  title: React.ReactNode;
  ariaLabel: string;
  closeLabel?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const host = useContext(DockSheetHostContext);
  const { t } = useDockTheme();

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  // El fondo de la hoja aparece opaco al instante (z superior) y solo el contenido se desliza:
  // al cambiar entre hojas (Nivel ⇄ Configuración) nunca se ve el dock a través de ambas.
  const hidden = { opacity: 0, zIndex: 40, transition: { duration: 0.18, ease: EASE }, transitionEnd: { visibility: "hidden" as const } };
  const shown = { opacity: 1, zIndex: 41, visibility: "visible" as const, transition: { duration: 0 } };
  const sheet = (
    <motion.section
      initial={keepMounted ? false : { opacity: 0, zIndex: 41 }}
      animate={open ? shown : hidden}
      exit={hidden}
      aria-label={ariaLabel}
      aria-hidden={!open}
      className={`kx-page kx-sheet absolute inset-x-0 top-[41px] bottom-0 overflow-y-auto overscroll-contain bg-[var(--usb-bg-2)] border-t border-[var(--usb-border)] custom-scrollbar ${open ? "" : "pointer-events-none"}`}
    >
      <motion.div
        className="kx-cap px-4 py-5 space-y-4"
        initial={keepMounted ? false : { opacity: 0, y: 6 }}
        animate={open ? { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } } : { opacity: 0, y: 6, transition: { delay: 0.18, duration: 0 } }}
      >
        <div className="sticky top-0 z-10 -mx-4 -mt-5 px-4 pt-5 pb-3 flex items-center gap-3 backdrop-blur-md bg-[color-mix(in_srgb,var(--usb-bg-2)_88%,transparent)]">
          <div className="min-w-0 flex-1">
            <span className="kx-slate block" style={{ color: t("#b7a6ff", "#5b37e8") }}>{eyebrow}</span>
            <h3 className="mt-1 text-[16px] font-extrabold tracking-tight leading-tight text-[var(--usb-fg-hi)] truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.section>
  );

  return host ? createPortal(sheet, host) : sheet;
}
