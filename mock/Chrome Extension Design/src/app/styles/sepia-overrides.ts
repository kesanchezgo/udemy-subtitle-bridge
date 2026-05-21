/**
 * sepia-overrides.ts
 * ──────────────────
 * CSS inyectado en <head> para gestionar AMBOS temas del dock
 * usando CSS Custom Properties (paleta de tokens).
 *
 * Paleta de tokens:
 *   .usb-dock            → DARK theme vars (siempre activo)
 *   .usb-dock.dock-sepia → LIGHT / WARM WHITE theme vars (override)
 *
 * Overrides usan .usb-dock.dock-sepia (especificidad 0-2-0)
 * que gana sobre utilidades Tailwind (0-1-0) + !important para
 * garantía total incluso con @layer utilities de Tailwind v4.
 *
 * Scoped a .usb-dock → nunca toca el DOM de la página host.
 */

export const THEME_CSS = `

/* ════════════════════════════════════════════════════════════════
   PALETA DE TOKENS — CSS Custom Properties
   Cambiar aquí cambia todo el dock automáticamente.
════════════════════════════════════════════════════════════════ */

.usb-dock {
  /* ─── Dark theme (default) ─── */
  --usb-bg-0:         #0a0b0c;      /* bars / más profundo  */
  --usb-bg-1:         #121214;      /* header               */
  --usb-bg-2:         #1a1b1d;      /* página principal     */
  --usb-bg-3:         #141416;      /* cards                */
  --usb-bg-4:         #0c0c0f;      /* inputs / deepest     */
  --usb-bg-5:         #161718;      /* footer / misceláneos */

  --usb-fg:           #ffffff;
  --usb-fg-hi:        rgba(255,255,255,0.85);
  --usb-fg-mid:       rgba(255,255,255,0.55);
  --usb-fg-lo:        rgba(255,255,255,0.35);
  --usb-fg-dim:       rgba(255,255,255,0.18);

  --usb-border:       rgba(255,255,255,0.06);
  --usb-border-mid:   rgba(255,255,255,0.10);
  --usb-divider:      rgba(255,255,255,0.05);

  --usb-input-bg:     rgba(0,0,0,0.30);
  --usb-placeholder:  rgba(255,255,255,0.20);
  --usb-scrollbar:    rgba(255,255,255,0.10);
}

.usb-dock.dock-sepia {
  /* ─── Light / Warm White theme ─── */
  --usb-bg-0:         #e8e7e5;      /* bars / deepest       */
  --usb-bg-1:         #f0efed;      /* header               */
  --usb-bg-2:         #f8f7f6;      /* página principal     */
  --usb-bg-3:         #ffffff;      /* cards — pure white   */
  --usb-bg-4:         #f2f1ef;      /* tabbar / inputs      */
  --usb-bg-5:         #ebebea;      /* footer               */

  --usb-fg:           #1a1918;
  --usb-fg-hi:        rgba(26,25,24,0.90);
  /* Slightly stronger text — legible but still soft */
  --usb-fg-mid:       rgba(26,25,24,0.72);
  --usb-fg-lo:        rgba(26,25,24,0.54);
  --usb-fg-dim:       rgba(26,25,24,0.36);

  --usb-border:       rgba(0,0,0,0.07);
  --usb-border-mid:   rgba(0,0,0,0.12);
  --usb-divider:      rgba(0,0,0,0.06);

  --usb-input-bg:     rgba(0,0,0,0.04);
  --usb-placeholder:  rgba(26,25,24,0.32);
  --usb-scrollbar:    rgba(0,0,0,0.12);
}

/* ════════════════════════════════════════════════════════════════
   OVERRIDES — Activos solo en LIGHT / WARM WHITE
   Especificidad (0,2,0) + !important > Tailwind utilities (0,1,0)
════════════════════════════════════════════════════════════════ */

/* ── 1. Fondos hex oscuros → warm white ── */

.usb-dock.dock-sepia [class*="bg-[#1a1b1d]"],
.usb-dock.dock-sepia [class*="bg-[#1b1c1e]"],
.usb-dock.dock-sepia [class*="bg-[#1c1d1f]"],
.usb-dock.dock-sepia [class*="bg-[#18181b]"],
.usb-dock.dock-sepia [class*="bg-[#1d1e20]"] {
  background-color: var(--usb-bg-2) !important;
  background-image: none !important;
}

.usb-dock.dock-sepia [class*="bg-[#121214]"],
.usb-dock.dock-sepia [class*="bg-[#131315]"],
.usb-dock.dock-sepia [class*="bg-[#141416]"],
.usb-dock.dock-sepia [class*="bg-[#141417]"],
.usb-dock.dock-sepia [class*="bg-[#141418]"] {
  background-color: var(--usb-bg-3) !important;
  background-image: none !important;
}

.usb-dock.dock-sepia [class*="bg-[#0a0b0c]"],
.usb-dock.dock-sepia [class*="bg-[#0c0c0f]"],
.usb-dock.dock-sepia [class*="bg-[#0d0e0f]"],
.usb-dock.dock-sepia [class*="bg-[#0e0f10]"],
.usb-dock.dock-sepia [class*="bg-[#0f1012]"],
.usb-dock.dock-sepia [class*="bg-[#0a0a0c]"] {
  background-color: var(--usb-bg-4) !important;
  background-image: none !important;
}

.usb-dock.dock-sepia [class*="bg-[#161718]"] {
  background-color: var(--usb-bg-5) !important;
  background-image: none !important;
}

/* Gradients → quitar imagen, dejar que el bg-color del elemento o padre se vea */
.usb-dock.dock-sepia [class*="bg-gradient-"] {
  background-image: none !important;
}

/* White alpha backgrounds */
.usb-dock.dock-sepia [class*="bg-white/"]               { background-color: rgba(0,0,0,0.04) !important; }
.usb-dock.dock-sepia [class~="bg-white/3"]              { background-color: rgba(0,0,0,0.025) !important; }
.usb-dock.dock-sepia [class~="bg-white/5"]              { background-color: rgba(0,0,0,0.03) !important; }
.usb-dock.dock-sepia [class~="bg-white/8"],
.usb-dock.dock-sepia [class~="bg-white/10"]             { background-color: rgba(0,0,0,0.05) !important; }
.usb-dock.dock-sepia [class~="bg-white/12"],
.usb-dock.dock-sepia [class~="bg-white/15"]             { background-color: rgba(0,0,0,0.07) !important; }
.usb-dock.dock-sepia [class~="bg-white/20"],
.usb-dock.dock-sepia [class~="bg-white/25"]             { background-color: rgba(0,0,0,0.09) !important; }

/* Black alpha backgrounds (inputs / overlays) */
.usb-dock.dock-sepia [class*="bg-black/"]               { background-color: rgba(0,0,0,0.05) !important; }

/* Hover backgrounds */
.usb-dock.dock-sepia [class*="hover:bg-white/"]:hover   { background-color: rgba(0,0,0,0.07) !important; }
.usb-dock.dock-sepia [class*="hover:bg-black/"]:hover   { background-color: rgba(0,0,0,0.08) !important; }

/* ── 2. Texto ── */

.usb-dock.dock-sepia [class~="text-white"]              { color: var(--usb-fg)     !important; }
.usb-dock.dock-sepia [class*="text-white/"]             { color: var(--usb-fg-lo)  !important; }

.usb-dock.dock-sepia [class~="text-white/85"],
.usb-dock.dock-sepia [class~="text-white/80"],
.usb-dock.dock-sepia [class~="text-white/75"]           { color: var(--usb-fg-hi)  !important; }

.usb-dock.dock-sepia [class~="text-white/70"],
.usb-dock.dock-sepia [class~="text-white/65"],
.usb-dock.dock-sepia [class~="text-white/60"],
.usb-dock.dock-sepia [class~="text-white/55"],
.usb-dock.dock-sepia [class~="text-white/50"],
.usb-dock.dock-sepia [class~="text-white/45"]           { color: var(--usb-fg-mid) !important; }

.usb-dock.dock-sepia [class~="text-white/40"],
.usb-dock.dock-sepia [class~="text-white/38"],
.usb-dock.dock-sepia [class~="text-white/35"],
.usb-dock.dock-sepia [class~="text-white/30"],
.usb-dock.dock-sepia [class~="text-white/25"],
.usb-dock.dock-sepia [class~="text-white/22"]           { color: var(--usb-fg-lo)  !important; }

.usb-dock.dock-sepia [class~="text-white/20"],
.usb-dock.dock-sepia [class~="text-white/18"],
.usb-dock.dock-sepia [class~="text-white/16"],
.usb-dock.dock-sepia [class~="text-white/15"],
.usb-dock.dock-sepia [class~="text-white/14"],
.usb-dock.dock-sepia [class~="text-white/12"],
.usb-dock.dock-sepia [class~="text-white/10"]           { color: var(--usb-fg-dim) !important; }

.usb-dock.dock-sepia [class*="hover:text-white"]:hover  { color: var(--usb-fg)     !important; }

/* ── 3. Borders ── */

.usb-dock.dock-sepia [class*="border-white/"]           { border-color: var(--usb-border)     !important; }
.usb-dock.dock-sepia [class~="border-white/10"],
.usb-dock.dock-sepia [class~="border-white/12"],
.usb-dock.dock-sepia [class~="border-white/14"],
.usb-dock.dock-sepia [class~="border-white/15"],
.usb-dock.dock-sepia [class~="border-white/20"]         { border-color: var(--usb-border-mid) !important; }

.usb-dock.dock-sepia [class*="hover:border-white/"]:hover { border-color: var(--usb-border-mid) !important; }

/* ── 4. Dividers ── */

.usb-dock.dock-sepia [class*="divide-white/"] > :not([hidden]) ~ :not([hidden]) {
  border-color: var(--usb-divider) !important;
}

/* ── 5. Inputs & Textareas ── */

.usb-dock.dock-sepia input:not([type="range"]),
.usb-dock.dock-sepia textarea {
  background-color: var(--usb-input-bg) !important;
  border-color:     rgba(0,0,0,0.12) !important;
  color:            var(--usb-fg) !important;
  caret-color:      #4a4744 !important;
}

.usb-dock.dock-sepia input:not([type="range"])::placeholder,
.usb-dock.dock-sepia textarea::placeholder {
  color: var(--usb-placeholder) !important;
}

.usb-dock.dock-sepia input:not([type="range"]):focus,
.usb-dock.dock-sepia textarea:focus {
  border-color: rgba(0,0,0,0.22) !important;
  box-shadow:   0 0 0 2px rgba(0,0,0,0.06) !important;
  outline:      none !important;
}

/* ── 6. Scrollbars ── */

.usb-dock.dock-sepia ::-webkit-scrollbar-track        { background: transparent !important; }
.usb-dock.dock-sepia ::-webkit-scrollbar-thumb        {
  background-color: var(--usb-scrollbar) !important;
  border-radius: 3px !important;
}
.usb-dock.dock-sepia ::-webkit-scrollbar-thumb:hover  {
  background-color: rgba(0,0,0,0.22) !important;
}

/* ── 7. Slate / Ring utilities ── */

.usb-dock.dock-sepia [class*="bg-slate-"][class*="/"]     { background-color: rgba(0,0,0,0.04) !important; }
.usb-dock.dock-sepia [class*="border-slate-"][class*="/"] { border-color:      rgba(0,0,0,0.08) !important; }
.usb-dock.dock-sepia [class~="text-slate-400"]            { color: rgba(26,25,24,0.55) !important; }
.usb-dock.dock-sepia [class*="ring-white/"]               { --tw-ring-color: rgba(0,0,0,0.10) !important; }

/* ── 8. Hardcoded muted text (#6e6b68) → stronger warm gray ── */
/* Applied AFTER general overrides so it wins with higher specificity */

.usb-dock.dock-sepia [class~="text-[#6e6b68]"]          { color: #3d3a38 !important; }
.usb-dock.dock-sepia [class*="text-[#6e6b68]/"]         { color: rgba(61,58,56,0.75) !important; }

/* ── 9. Exception: solid colored buttons & gradient CTAs keep white text ──
   NOTE: These rules appear AFTER the text-white override above,
   so they win via cascade order (same specificity, later wins). */

/* Solid violet / emerald buttons */
.usb-dock.dock-sepia [class~="bg-violet-600"][class~="text-white"],
.usb-dock.dock-sepia [class~="bg-violet-700"][class~="text-white"],
.usb-dock.dock-sepia [class~="bg-violet-500"][class~="text-white"],
.usb-dock.dock-sepia [class~="bg-emerald-600"][class~="text-white"],
.usb-dock.dock-sepia [class~="bg-emerald-700"][class~="text-white"],
.usb-dock.dock-sepia [class~="bg-emerald-500"][class~="text-white"],
.usb-dock.dock-sepia [class~="bg-red-500"][class~="text-white"],
.usb-dock.dock-sepia [class~="bg-sky-500"][class~="text-white"]   { color: white !important; }

/* Gradient CTA buttons (from-violet + text-white) → solid violet bg + white text */
.usb-dock.dock-sepia [class*="from-violet-"][class~="text-white"] {
  background-color: #6d28d9 !important;
  color: white !important;
}

/* Gradient emerald CTA buttons */
.usb-dock.dock-sepia [class*="from-emerald-"][class~="text-white"] {
  background-color: #059669 !important;
  color: white !important;
}

/* ── 10. Syntax & Feedback colors (Light Mode Contrast) ── */
.usb-dock.dock-sepia [class*="text-amber-200"] { color: #d97706 !important; /* amber-600 */ }
.usb-dock.dock-sepia [class*="text-amber-300"] { color: #d97706 !important; /* amber-600 */ }
.usb-dock.dock-sepia [class*="text-amber-400"] { color: #d97706 !important; /* amber-600 */ }
.usb-dock.dock-sepia [class*="bg-amber-500"] { background-color: rgba(217, 119, 6, 0.08) !important; }
.usb-dock.dock-sepia [class*="border-amber-500"] { border-color: rgba(217, 119, 6, 0.2) !important; }

/* Emerald / Green for success states */
.usb-dock.dock-sepia [class*="text-emerald-200"] { color: #059669 !important; /* emerald-600 */ }
.usb-dock.dock-sepia [class*="text-emerald-300"] { color: #059669 !important; /* emerald-600 */ }
.usb-dock.dock-sepia [class*="text-emerald-400"] { color: #059669 !important; /* emerald-600 */ }
.usb-dock.dock-sepia [class*="bg-emerald-500"] { background-color: rgba(5, 150, 105, 0.08) !important; }
.usb-dock.dock-sepia [class*="border-emerald-500"] { border-color: rgba(5, 150, 105, 0.2) !important; }

/* Rose / Red for error states */
.usb-dock.dock-sepia [class*="text-rose-200"] { color: #e11d48 !important; /* rose-600 */ }
.usb-dock.dock-sepia [class*="text-rose-300"] { color: #e11d48 !important; /* rose-600 */ }
.usb-dock.dock-sepia [class*="text-rose-400"] { color: #e11d48 !important; /* rose-600 */ }
.usb-dock.dock-sepia [class*="text-red-200"] { color: #e11d48 !important; /* red-600 */ }
.usb-dock.dock-sepia [class*="text-red-300"] { color: #e11d48 !important; /* red-600 */ }
.usb-dock.dock-sepia [class*="bg-rose-500"] { background-color: rgba(225, 29, 72, 0.08) !important; }
.usb-dock.dock-sepia [class*="border-rose-500"] { border-color: rgba(225, 29, 72, 0.2) !important; }
.usb-dock.dock-sepia [class*="bg-red-500"] { background-color: rgba(225, 29, 72, 0.08) !important; }
.usb-dock.dock-sepia [class*="border-red-500"] { border-color: rgba(225, 29, 72, 0.2) !important; }

/* Sky / Blue for info states */
.usb-dock.dock-sepia [class*="text-sky-300"] { color: #0284c7 !important; /* sky-600 */ }
.usb-dock.dock-sepia [class*="bg-sky-500"] { background-color: rgba(2, 132, 199, 0.08) !important; }

/* Violet for excellent/evaluating states */
.usb-dock.dock-sepia [class*="text-violet-300"] { color: #7c3aed !important; /* violet-600 */ }
.usb-dock.dock-sepia [class*="bg-violet-500"] { background-color: rgba(124, 58, 237, 0.08) !important; }

/* Fuchsia for retry states */
.usb-dock.dock-sepia [class*="text-fuchsia-300"] { color: #c026d3 !important; /* fuchsia-600 */ }
.usb-dock.dock-sepia [class*="bg-fuchsia-500"] { background-color: rgba(192, 38, 211, 0.08) !important; }

/* Code syntax highlighting colors */
.usb-dock.dock-sepia [class*="text-green-400"] { color: #059669 !important; }
.usb-dock.dock-sepia [class*="text-yellow-300"] { color: #d97706 !important; }
.usb-dock.dock-sepia [class*="text-yellow-400"] { color: #d97706 !important; }
.usb-dock.dock-sepia [class*="text-blue-400"] { color: #2563eb !important; }
.usb-dock.dock-sepia [class*="text-pink-400"] { color: #db2777 !important; }
.usb-dock.dock-sepia [class*="text-purple-400"] { color: #9333ea !important; }

/* ════════════════════════════════════════════════════════════════
   SAFEGUARD — Light/Warm White bg classes para Tailwind v4 JIT
   Tailwind no puede escanear template literals.
   Estas reglas garantizan que los colores funcionen aunque Tailwind
   no genere el CSS para esas clases arbitrarias.
   Scoped a .usb-dock → no afecta la página host.
════════════════════════════════════════════════════════════════ */

/* Warm white backgrounds */
.usb-dock [class~="bg-[#f8f7f6]"]   { background-color: #f8f7f6; }  /* main page bg       */
.usb-dock [class~="bg-[#f0efed]"]   { background-color: #f0efed; }  /* header bg          */
.usb-dock [class~="bg-[#f2f1ef]"]   { background-color: #f2f1ef; }  /* tabbar / footer    */
.usb-dock [class~="bg-[#ebebea]"]   { background-color: #ebebea; }  /* collapsed / deep   */
.usb-dock [class~="bg-[#e8e7e5]"]   { background-color: #e8e7e5; }  /* deepest bar        */
.usb-dock [class*="bg-[#f8f7f6]/"]  { background-color: #f8f7f6; }  /* bg-[#f8f7f6]/98 etc */

/* Light-mode muted text safeguard */
.usb-dock [class~="text-[#6e6b68]"]  { color: #6e6b68; }
.usb-dock [class~="text-[#3d3a38]"]  { color: #3d3a38; }
`;

/** @deprecated Use THEME_CSS — kept for backward-compat */
export const SEPIA_CSS = THEME_CSS;
