import React, { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon, ChevronDown, Check, Minus, Plus, type IconName } from "../icons";
import { Switch } from "../ui/switch";
import { useDockTheme } from "../../contexts/ThemeContext";

/**
 * Vocabulario único de Configuración. Toma el lenguaje de la pestaña Overlay:
 * kx-card, tile de icono violeta, título 13px bold, descripción 11px fg-mid,
 * Switch para opciones binarias y CTA kx-cta. Nada de tarjetas anidadas:
 * cada sección es un solo nivel y su cuerpo usa estas primitivas.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export function IconTile({ icon, size = "md" }: { icon: IconName; size?: "sm" | "md" }) {
  const { t } = useDockTheme();
  const box = size === "sm" ? "w-7 h-7 rounded-lg" : "w-9 h-9 rounded-xl";
  return (
    <span
      className={`${box} flex items-center justify-center shrink-0 border`}
      style={{
        background: "color-mix(in srgb, #6d4aff 12%, var(--usb-bg-3))",
        borderColor: "color-mix(in srgb, #6d4aff 26%, var(--usb-border))",
        color: t("#b7a6ff", "#5b37e8"),
      }}
    >
      <Icon name={icon} size={size === "sm" ? 14 : 17} weight="duotone" />
    </span>
  );
}

/** Sección plegable de primer nivel. Una por área: IA, Vocabulario, Obsidian, Caché. */
/** Abre una sección desde cualquier parte: window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "obsidian" } })). */
/** Acordeón exclusivo: una sola sección abierta; se recuerda la última. */
const ACCORDION_KEY = "kinema_settings_open_section";
const AccordionContext = createContext<{ openId: string | null; setOpenId: (id: string | null) => void } | null>(null);

export function SettingsAccordion({ defaultId, children }: { defaultId: string; children: React.ReactNode }) {
  const [openId, setOpenIdState] = useState<string | null>(() => {
    try { const saved = localStorage.getItem(ACCORDION_KEY); return saved === null ? defaultId : saved || null; } catch { return defaultId; }
  });
  const setOpenId = (id: string | null) => { setOpenIdState(id); try { localStorage.setItem(ACCORDION_KEY, id ?? ""); } catch { /* sin almacenamiento */ } };
  return <AccordionContext.Provider value={{ openId, setOpenId }}>{children}</AccordionContext.Provider>;
}

export function SettingsSection({
  icon, title, description, meta, defaultOpen = false, keepMounted = false, sectionId, children,
}: {
  sectionId?: string;
  icon: IconName;
  title: string;
  description: string;
  /** Resumen corto del estado actual (p. ej. "Local · 4 activas"). */
  meta?: React.ReactNode;
  defaultOpen?: boolean;
  /** Oculta sin desmontar (para destinos de portal o formularios con estado). */
  keepMounted?: boolean;
  children: React.ReactNode;
}) {
  const accordion = useContext(AccordionContext);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = accordion && sectionId ? accordion.openId === sectionId : localOpen;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (accordion && sectionId) accordion.setOpenId(value ? sectionId : null); else setLocalOpen(value);
  };
  const body = <div className="border-t border-[var(--usb-border)] px-4 py-4 space-y-4">{children}</div>;
  const bodyId = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!sectionId) return;
    const onOpen = (event: Event) => {
      if ((event as CustomEvent<{ section?: string }>).detail?.section !== sectionId) return;
      setOpen(true);
      setTimeout(() => ref.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 260);
    };
    window.addEventListener("usb:open-settings", onOpen);
    return () => window.removeEventListener("usb:open-settings", onOpen);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, accordion?.setOpenId]);
  return (
    <section ref={ref} className="kx-card kx-settings-section bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-2xl overflow-hidden" aria-label={title}>
      <button
        type="button"
        onClick={() => { const next = !open; setOpen(next); if (next) setTimeout(() => ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 240); }}
        aria-expanded={open}
        aria-controls={bodyId}
        className="w-full flex items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6d4aff]/70"
      >
        <IconTile icon={icon} />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-bold tracking-tight text-[var(--usb-fg)]">{title}</span>
          <span className="block text-[11px] leading-snug text-[var(--usb-fg-mid)] truncate">{description}</span>
        </span>
        {meta && <span className="shrink-0 text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-[var(--usb-accent-soft)] text-[var(--usb-fg)]">{meta}</span>}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-[var(--usb-fg-mid)]">
          <ChevronDown size={15} />
        </motion.span>
      </button>
      {keepMounted ? (
        <motion.div
          id={bodyId}
          initial={false}
          animate={open ? { height: "auto", opacity: 1, visibility: "visible" } : { height: 0, opacity: 0, transitionEnd: { visibility: "hidden" } }}
          transition={{ duration: 0.22, ease: EASE }}
          aria-hidden={!open}
          className="overflow-hidden"
        >
          {body}
        </motion.div>
      ) : (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={bodyId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="overflow-hidden"
            >
              {body}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </section>
  );
}

/** Subtítulo dentro de una sección (agrupa campos sin crear otra tarjeta). */
export function SettingsGroup({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--usb-fg-mid)]">{title}</h4>
        {aside}
      </div>
      {children}
    </div>
  );
}

export const fieldCls =
  "kx-field w-full h-9 rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-3 text-[12px] font-medium text-[var(--usb-fg-hi)] placeholder:text-[var(--usb-fg-mid)] outline-none transition-colors focus:border-[#6d4aff]/60 focus:ring-2 focus:ring-[#6d4aff]/20 disabled:opacity-50";

/** Área de texto con la misma piel que fieldCls. */
export const textareaCls =
  "kx-field w-full rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-3 py-2.5 text-[12px] leading-relaxed font-medium text-[var(--usb-fg-hi)] placeholder:text-[var(--usb-fg-mid)] resize-none outline-none transition-colors focus:border-[#6d4aff]/60 focus:ring-2 focus:ring-[#6d4aff]/20 disabled:opacity-50";

export const selectCls =
  fieldCls + " appearance-none pr-8 cursor-pointer bg-no-repeat bg-[right_0.7rem_center] bg-[length:12px] " +
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a849c' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]";

/** Etiqueta + control + ayuda opcional. Siempre la misma escala tipográfica. */
export function Field({ label, hint, children, className = "" }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <span className="text-[11.5px] font-semibold text-[var(--usb-fg-mid)]">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">{hint}</span>}
    </label>
  );
}

/** Opción binaria: mismo patrón que los toggles de Overlay. */
export function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-semibold text-[var(--usb-fg)]">{label}</p>
        {description && <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="data-[state=checked]:bg-violet-600 scale-[0.9] shrink-0" />
    </div>
  );
}

/** Botones: una altura (h-10), un radio (rounded-xl), una escala de texto. */
const btnBase = "h-10 px-4 rounded-xl text-[12px] font-bold inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70";
export const primaryBtnCls = `kx-on-solid kx-cta ${btnBase}`;
export const secondaryBtnCls = `${btnBase} border border-[var(--usb-border)] bg-[var(--usb-bg-3)] text-[var(--usb-fg)] hover:border-[#6d4aff]/45 hover:text-[var(--usb-fg-hi)]`;
export const dangerBtnCls = `${btnBase} kx-danger-btn border border-rose-500/35 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15`;

/** Aviso en línea (éxito / atención / informativo). */
export function Notice({ tone = "info", icon, children }: { tone?: "info" | "ok" | "warn"; icon: IconName; children: React.ReactNode }) {
  const hue = tone === "ok" ? "#059669" : tone === "warn" ? "#d97706" : "#6d4aff";
  return (
    <div
      role={tone === "info" ? undefined : "status"}
      className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--usb-fg-hi)]"
      style={{ background: `color-mix(in srgb, ${hue} 9%, var(--usb-bg-3))`, borderColor: `color-mix(in srgb, ${hue} 32%, var(--usb-border))` }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: hue }}><Icon name={icon} size={13} weight="duotone" /></span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Control segmentado (mismo kx-seg que las pestañas del dock). */
export function Segmented<T extends string>({ value, onChange, options, layoutId }: { value: T; onChange: (value: T) => void; options: { id: T; label: string; icon?: IconName; badge?: number | null }[]; layoutId: string }) {
  return (
    <div className="kx-seg" role="tablist">
      {options.map(option => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] transition-colors ${active ? "kx-tab-on font-semibold" : "font-medium text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)]"}`}
          >
            {active && <motion.span layoutId={layoutId} className="kx-seg-pill" transition={{ type: "spring", stiffness: 460, damping: 36 }} />}
            {option.icon && <span className="relative flex"><Icon name={option.icon} size={14} /></span>}
            <span className="relative">{option.label}</span>
            {option.badge ? <span className="relative text-[10.5px] tabular-nums px-1.5 rounded-full bg-white/25 font-semibold">{option.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Opción única entre pocas alternativas (idiomas, nivel, audio…). Sustituye al
 * <select> nativo: todas las opciones visibles, mismo tile que "Motor principal".
 * Teclado: flechas para moverse, como un radiogroup nativo.
 */
export function ChoiceGroup<T extends string>({ label, value, onChange, options, columns = 3, disabled = false }: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string; hint?: string }[];
  columns?: 2 | 3 | 4 | 6;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.findIndex(option => option.id === value);
  const move = (index: number) => {
    const next = (index + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };
  const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 6: "grid-cols-6" }[columns];
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className={`grid ${cols} gap-1.5`}>
      {options.map((option, index) => {
        const on = option.id === value;
        return (
          <button
            key={option.id}
            ref={node => { refs.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (current < 0 && index === 0) ? 0 : -1}
            disabled={disabled}
            data-on={on ? "1" : "0"}
            onClick={() => onChange(option.id)}
            onKeyDown={event => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(index + 1); }
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(index - 1); }
            }}
            className="kx-tile-btn kx-choice border border-[var(--usb-border)] !h-auto min-h-9 !gap-0 px-2 py-2 !rounded-xl !text-[12px] font-semibold disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
          >
            <span className="truncate max-w-full">{option.label}</span>
            {option.hint && <span className="text-[10.5px] font-medium opacity-80 truncate max-w-full">{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Número acotado con botones − / + (el input sigue siendo editable). */
/** Lista de ajustes en filas: etiqueta a la izquierda, control compacto a la derecha. */
export function RowList({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] divide-y divide-[var(--usb-border)]">{children}</div>;
}

export function SettingRow({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 min-h-[52px]">
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-[var(--usb-fg)]">{label}</p>
        {hint && <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Selector compacto propio (no <select> nativo): botón + lista desplegable accesible. */
export function Picker<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: { id: T; label: string; hint?: string }[] }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find(option => option.id === value);
  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex(option => option.id === value)));
    requestAnimationFrame(() => list.current?.focus());
    const away = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away, true);
    return () => document.removeEventListener("mousedown", away, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const choose = (index: number) => { onChange(options[index].id); setOpen(false); root.current?.querySelector("button")?.focus(); };
  return (
    <div ref={root} className="relative">
      <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}
        className="kx-picker h-8 pl-3 pr-2 rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--usb-fg-hi)] hover:border-[#6d4aff]/45 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
        {current?.label ?? value}
        <ChevronDown size={13} className={`text-[var(--usb-fg-mid)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul ref={list} id={id} role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={`${id}-${active}`}
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14, ease: EASE }}
            onKeyDown={event => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive(i => (i + 1) % options.length); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive(i => (i - 1 + options.length) % options.length); }
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(active); }
              if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); setOpen(false); root.current?.querySelector("button")?.focus(); }
            }}
            className="kx-picker-menu absolute right-0 top-[calc(100%+4px)] z-30 min-w-[176px] p-1 rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] shadow-[0_16px_36px_-18px_rgba(0,0,0,.55)] outline-none">
            {options.map((option, index) => {
              const on = option.id === value;
              return (
                <li key={option.id} id={`${id}-${index}`} role="option" aria-selected={on} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-[12px] ${index === active ? "bg-[var(--usb-accent-soft)]" : ""} ${on ? "font-bold text-[var(--usb-fg-hi)]" : "font-medium text-[var(--usb-fg)]"}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block">{option.label}</span>
                    {option.hint && <span className="block text-[10.5px] font-medium text-[var(--usb-fg-mid)]">{option.hint}</span>}
                  </span>
                  {on && <Check size={13} className="text-[#8b6dff] shrink-0" />}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Escala corta (p. ej. niveles CEFR) como segmentos pequeños en línea. */
export function MiniScale<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: T[] }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (index: number) => { const next = (index + options.length) % options.length; onChange(options[next]); refs.current[next]?.focus(); };
  return (
    <div role="radiogroup" aria-label={label} className="kx-scale inline-flex p-0.5 rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)]">
      {options.map((option, index) => {
        const on = option === value;
        return <button key={option} ref={node => { refs.current[index] = node; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-on={on ? "1" : "0"}
          onClick={() => onChange(option)}
          onKeyDown={event => { if (event.key === "ArrowRight") { event.preventDefault(); move(index + 1); } if (event.key === "ArrowLeft") { event.preventDefault(); move(index - 1); } }}
          className="kx-scale-btn h-7 w-[30px] rounded-md text-[11px] font-bold tabular-nums text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">{option}</button>;
      })}
    </div>
  );
}

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const stepBtn = "w-8 h-8 shrink-0 flex items-center justify-center text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] disabled:opacity-35 disabled:cursor-not-allowed transition-colors";
  return (
    <div className="kx-field inline-flex items-center w-[104px] h-8 rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] focus-within:border-[#6d4aff]/60 focus-within:ring-2 focus-within:ring-[#6d4aff]/20">
      <button type="button" className={stepBtn} aria-label="Disminuir" disabled={value <= min} onClick={() => onChange(clamp(value - 1))}><Minus size={13} /></button>
      <input aria-label={label} type="number" min={min} max={max} value={value} onChange={event => onChange(clamp(Number(event.target.value) || min))}
        className="kx-stepper-input min-w-0 flex-1 bg-transparent text-center text-[12.5px] font-bold tabular-nums text-[var(--usb-fg-hi)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      <button type="button" className={stepBtn} aria-label="Aumentar" disabled={value >= max} onClick={() => onChange(clamp(value + 1))}><Plus size={13} /></button>
    </div>
  );
}
