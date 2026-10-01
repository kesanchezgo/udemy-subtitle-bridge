import React from "react";
import { motion } from "motion/react";
import { Settings2, X } from "../icons";

/**
 * Shared shell for the "No olvidar" export destinations (Anki vocabulary,
 * Obsidian…). Mirrors the step-card language used across StudyAgentTab:
 * tinted header row with an icon tile, 11px semibold title and a quiet
 * subtitle, then a padded body. Light theme is handled by sepia-overrides.
 */

/** Input / select surface shared by every export config field. */
export const exportFieldCls =
  "usb-field w-full h-7 text-[10px] rounded-lg bg-[var(--usb-bg-2)] border border-[var(--usb-border)] text-[var(--usb-fg-hi)] placeholder:text-[var(--usb-fg-lo)] px-2 outline-none focus:border-[#6d4aff]/60 transition-colors";

export const exportLabelCls = "text-[var(--usb-fg-lo)] text-[9px] mb-1 font-medium";

/** Secondary, neutral action (Copiar, .md, Probar vault…). */
export const exportGhostBtnCls =
  "h-8 rounded-xl bg-[var(--usb-bg-3)] hover:bg-[var(--usb-bg-2)] border border-[var(--usb-border)] hover:border-[var(--usb-border-mid)] text-[var(--usb-fg)] hover:text-[var(--usb-fg-hi)] text-[10.5px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shadow-2xs";

/** Primary action: violet CTA; pass --kx-btn inline for success / error states. */
export const exportPrimaryBtnCls =
  "kx-on-solid kx-cta h-9 rounded-xl text-[10.5px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100";

export function ExportModule({
  icon: Icon,
  title,
  subtitle,
  badge,
  configLabel = "Configurar",
  configOpen,
  onToggleConfig,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  configLabel?: string;
  configOpen?: boolean;
  onToggleConfig?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] overflow-hidden shadow-2xs transition-colors">
      <header className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--usb-border)] bg-[var(--usb-bg-2)]/40">
        <span className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 shadow-2xs text-[#6d4aff] border-[#6d4aff]/35 bg-[#6d4aff]/12">
          <Icon size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[var(--usb-fg-hi)] text-[11.5px] leading-tight truncate font-bold">{title}</p>
          {subtitle && <p className="text-[var(--usb-fg-lo)] text-[10px] leading-tight truncate mt-0.5 font-medium">{subtitle}</p>}
        </div>
        {badge}
        {onToggleConfig && (
          <button
            onClick={onToggleConfig}
            aria-expanded={configOpen}
            className={`h-6 px-2.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1 transition-colors shrink-0 ${
              configOpen
                ? "bg-[#6d4aff]/12 border-[#6d4aff]/35 text-[#6d4aff]"
                : "border-transparent text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-bg-2)]"
            }`}
          >
            {configOpen ? <X size={10} /> : <Settings2 size={10} />}
            {configOpen ? "Cerrar" : configLabel}
          </button>
        )}
      </header>
      <div className="p-3 space-y-2.5">{children}</div>
    </section>
  );
}

/** Animated expand/collapse for config panels — wrap in <AnimatePresence>. */
export function Collapse({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="space-y-2.5">{children}</div>
    </motion.div>
  );
}
