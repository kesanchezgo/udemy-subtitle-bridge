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
   ESCALA TIPOGRÁFICA

   Los componentes usan tamaños fijos (text-[10px], etc.) para coincidir
   exactamente con el diseño. Dentro del Shadow DOM esos valores también deben
   seguir el tamaño de texto del navegador/SO, así que cada tamaño usado se
   redeclara como N × --usb-scale.

   --usb-scale lo mide el content script en la página (tamaño por defecto del
   navegador ÷ 16) y se publica en el host. Con el valor por defecto (16px)
   vale exactamente 1, así que el resultado es pixel a pixel el original.
════════════════════════════════════════════════════════════════ */

${[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32]
  .map(
    (px) =>
      `.usb-dock .text-\\[${px}px\\] { font-size: calc(${px}px * var(--usb-scale, 1)) !important; }`,
  )
  .join('\n')}

/* Espaciado, gaps y radios siguen el mismo factor para que el layout acompañe
   al texto en lugar de apretarlo. */
${[1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12]
  .map((n) => {
    const cls = String(n).replace('.', '\\.');
    const value = n * 4;
    return [
      `.usb-dock .p-\\[${cls}px\\] { padding: calc(${value}px * var(--usb-scale, 1)) !important; }`,
      `.usb-dock .px-\\[${cls}px\\] { padding-left: calc(${value}px * var(--usb-scale, 1)) !important; padding-right: calc(${value}px * var(--usb-scale, 1)) !important; }`,
      `.usb-dock .py-\\[${cls}px\\] { padding-top: calc(${value}px * var(--usb-scale, 1)) !important; padding-bottom: calc(${value}px * var(--usb-scale, 1)) !important; }`,
      `.usb-dock .gap-\\[${cls}px\\] { gap: calc(${value}px * var(--usb-scale, 1)) !important; }`,
    ].join('\n');
  })
  .join('\n')}

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
  --usb-warn-text:    #fcd34d;
}

.usb-dock.dock-sepia {
  /* ── Light theme (Udemy-native: cool grays + white elevated surfaces) ──
     Jerarquía por ELEVACIÓN, no solo color: página gris frío → tarjetas
     BLANCAS con borde visible + sombra suave (--usb-elev-1/2). */
  --usb-bg-0:         #e8ecf0;      /* bars / deepest       */
  --usb-bg-1:         #f1f4f7;      /* header               */
  --usb-bg-2:         #f4f6f9;      /* página principal     */
  --usb-bg-3:         #ffffff;      /* cards — pure white   */
  --usb-bg-4:         #eef1f5;      /* tabbar / inputs      */
  --usb-bg-5:         #ffffff;      /* footer / panels (blanco elevado) */

  --usb-fg:           #1c1d1f;      /* Udemy primary text   */
  --usb-fg-hi:        rgba(28,29,31,0.96);
  --usb-fg-mid:       rgba(28,29,31,0.72);
  --usb-fg-lo:        rgba(28,29,31,0.55);
  --usb-fg-dim:       rgba(28,29,31,0.34);

  --usb-border:       rgba(28,29,31,0.11);
  --usb-border-mid:   rgba(28,29,31,0.18);
  --usb-divider:      rgba(28,29,31,0.07);

  /* Brand accents — vibrant Udemy palette */
  --usb-accent:       #a435f0;       /* Udemy purple — primary CTA       */
  --usb-accent-2:     #8710d8;       /* darker for hover                  */
  --usb-accent-soft:  rgba(164,53,240,0.08);
  --usb-accent-ring:  rgba(164,53,240,0.30);

  --usb-input-bg:     #ffffff;
  --usb-placeholder:  rgba(28,29,31,0.38);
  --usb-scrollbar:    rgba(28,29,31,0.16);
  --usb-warn-text:    #92400e;

  /* Elevación (solo light): el dark la da la oscuridad, el light la necesita */
  --usb-elev-1: 0 1px 2px rgba(16,24,40,0.05), 0 2px 6px -1px rgba(16,24,40,0.07);
  --usb-elev-2: 0 2px 4px rgba(16,24,40,0.05), 0 10px 24px -8px rgba(16,24,40,0.14);
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
.usb-dock.dock-sepia [class*="bg-[#0a0a0c]"],
.usb-dock.dock-sepia [class*="bg-[#070809]"],
.usb-dock.dock-sepia [class*="bg-[#0f0f12]"] {
  background-color: var(--usb-bg-4) !important;
  background-image: none !important;
}

.usb-dock.dock-sepia [class*="bg-[#161718]"] {
  background-color: var(--usb-bg-5) !important;
  background-image: none !important;
}

/* Gradients → de regla general los quitamos para que el bg-color del
   elemento o padre se vea, EXCEPTO los hero cards con accent (violet/
   emerald/amber/sky) que abajo los reescribimos como un tinte real. */
.usb-dock.dock-sepia [class*="bg-gradient-"] {
  background-image: none !important;
}

/* Hero cards: bg-gradient-to-br/-b from-violet-X/Y to-violet-X/Y → tinte real */
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-violet-"]:not([class~="text-white"]) {
  background-image: linear-gradient(135deg, rgba(164,53,240,0.14) 0%, rgba(164,53,240,0.04) 100%) !important;
}
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-emerald-"]:not([class~="text-white"]) {
  background-image: linear-gradient(135deg, rgba(5,150,105,0.14) 0%, rgba(5,150,105,0.04) 100%) !important;
}
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-amber-"]:not([class~="text-white"]) {
  background-image: linear-gradient(135deg, rgba(245,158,11,0.16) 0%, rgba(245,158,11,0.04) 100%) !important;
}
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-sky-"]:not([class~="text-white"]) {
  background-image: linear-gradient(135deg, rgba(14,165,233,0.14) 0%, rgba(14,165,233,0.04) 100%) !important;
}
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-rose-"]:not([class~="text-white"]),
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-red-"]:not([class~="text-white"]) {
  background-image: linear-gradient(135deg, rgba(239,68,68,0.14) 0%, rgba(239,68,68,0.04) 100%) !important;
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

/* IMPORTANT: 0.18 black on white fails WCAG AA for body text.
   Hint copy and stepper labels need ≥0.55 alpha to be legible. */
.usb-dock.dock-sepia [class~="text-white/20"],
.usb-dock.dock-sepia [class~="text-white/18"],
.usb-dock.dock-sepia [class~="text-white/16"],
.usb-dock.dock-sepia [class~="text-white/15"],
.usb-dock.dock-sepia [class~="text-white/14"],
.usb-dock.dock-sepia [class~="text-white/12"],
.usb-dock.dock-sepia [class~="text-white/10"]           { color: rgba(28,29,31,0.62) !important; }
.usb-dock.dock-sepia [class~="text-white/8"],
.usb-dock.dock-sepia [class~="text-white/6"],
.usb-dock.dock-sepia [class~="text-white/5"]            { color: rgba(28,29,31,0.48) !important; }

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
  border-color:     rgba(28,29,31,0.16) !important;
  color:            var(--usb-fg) !important;
  caret-color:      #8710d8 !important;
  box-shadow:       var(--usb-elev-1);
}

.usb-dock.dock-sepia input:not([type="range"])::placeholder,
.usb-dock.dock-sepia textarea::placeholder {
  color: var(--usb-placeholder) !important;
}

.usb-dock.dock-sepia input:not([type="range"]):focus,
.usb-dock.dock-sepia textarea:focus {
  border-color: #a435f0 !important;
  box-shadow:   0 0 0 3px rgba(164,53,240,0.14) !important;
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

/* Gradient CTA buttons (from-violet + text-white) → vibrant Udemy purple */
.usb-dock.dock-sepia [class*="from-violet-"][class~="text-white"] {
  background-color: #a435f0 !important;
  background-image: linear-gradient(135deg, #a435f0 0%, #8710d8 100%) !important;
  color: white !important;
}

/* Gradient emerald CTA buttons — saturated success green */
.usb-dock.dock-sepia [class*="from-emerald-"][class~="text-white"] {
  background-color: #059669 !important;
  background-image: linear-gradient(135deg, #10b981 0%, #047857 100%) !important;
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

/* ── 11. VIBRANT accent tints — Udemy-style energy on white ───────────────
   Light mode shouldn't feel dead. Accents land at 0.14–0.20 alpha so the
   purple/emerald/amber sections of the UI actually carry color.

   IMPORTANT: use [class~="X"] (exact word match) NOT [class*="X"] (substring),
   otherwise hover:bg-violet-500 inside a class like "bg-violet-600 hover:bg-violet-500"
   gets captured and turns the solid CTA into a washed-out tint. */

.usb-dock.dock-sepia [class~="bg-violet-500"]   { background-color: rgba(164, 53, 240, 0.16) !important; }
.usb-dock.dock-sepia [class~="bg-violet-400"]   { background-color: rgba(164, 53, 240, 0.20) !important; }

.usb-dock.dock-sepia [class~="bg-emerald-500"]  { background-color: rgba(5, 150, 105, 0.16)  !important; }
.usb-dock.dock-sepia [class~="bg-emerald-400"]  { background-color: rgba(5, 150, 105, 0.20)  !important; }

.usb-dock.dock-sepia [class~="bg-amber-500"]    { background-color: rgba(245, 158, 11, 0.20) !important; }
.usb-dock.dock-sepia [class~="bg-amber-400"]    { background-color: rgba(245, 158, 11, 0.24) !important; }

.usb-dock.dock-sepia [class~="bg-sky-500"]      { background-color: rgba(14, 165, 233, 0.18) !important; }
.usb-dock.dock-sepia [class~="bg-sky-400"]      { background-color: rgba(14, 165, 233, 0.22) !important; }

.usb-dock.dock-sepia [class~="bg-rose-500"]     { background-color: rgba(244, 63, 94, 0.16)  !important; }
.usb-dock.dock-sepia [class~="bg-red-500"]      { background-color: rgba(239, 68, 68, 0.16)  !important; }

.usb-dock.dock-sepia [class~="bg-fuchsia-500"]  { background-color: rgba(217, 70, 239, 0.16) !important; }

/* Solid saturated CTAs (bg-X-600/700) — keep Tailwind's native color,
   just deepen it slightly to read as a vibrant button on white.
   These rules override the §9 generic text-white preservation. */
.usb-dock.dock-sepia [class~="bg-violet-600"]   { background-color: #7c3aed !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-violet-700"]   { background-color: #6d28d9 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-emerald-600"]  { background-color: #059669 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-emerald-700"]  { background-color: #047857 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-sky-600"]      { background-color: #0284c7 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-rose-600"],
.usb-dock.dock-sepia [class~="bg-red-600"]      { background-color: #dc2626 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-amber-600"]    { background-color: #d97706 !important; color: #ffffff !important; }

/* Hover states for solid CTAs — slightly darker on hover */
.usb-dock.dock-sepia [class~="hover:bg-violet-500"]:hover  { background-color: #8b5cf6 !important; }
.usb-dock.dock-sepia [class~="hover:bg-violet-600"]:hover  { background-color: #7c3aed !important; }
.usb-dock.dock-sepia [class~="hover:bg-emerald-500"]:hover { background-color: #10b981 !important; }
.usb-dock.dock-sepia [class~="hover:bg-emerald-600"]:hover { background-color: #059669 !important; }

/* Accent borders — punchy enough to feel like a real card edge */
.usb-dock.dock-sepia [class*="border-violet-500"],
.usb-dock.dock-sepia [class*="border-violet-400"],
.usb-dock.dock-sepia [class*="border-violet-600"] { border-color: rgba(164, 53, 240, 0.45) !important; }

.usb-dock.dock-sepia [class*="border-emerald-500"],
.usb-dock.dock-sepia [class*="border-emerald-400"] { border-color: rgba(5, 150, 105, 0.45) !important; }

.usb-dock.dock-sepia [class*="border-amber-500"],
.usb-dock.dock-sepia [class*="border-amber-400"]  { border-color: rgba(245, 158, 11, 0.50) !important; }

.usb-dock.dock-sepia [class*="border-sky-500"],
.usb-dock.dock-sepia [class*="border-sky-400"]    { border-color: rgba(14, 165, 233, 0.45) !important; }

.usb-dock.dock-sepia [class*="border-rose-500"],
.usb-dock.dock-sepia [class*="border-red-500"]    { border-color: rgba(239, 68, 68, 0.45) !important; }

.usb-dock.dock-sepia [class*="border-fuchsia-500"] { border-color: rgba(217, 70, 239, 0.45) !important; }

/* Vibrant accent text — Udemy purple + saturated companions */
.usb-dock.dock-sepia [class*="text-violet-300"],
.usb-dock.dock-sepia [class*="text-violet-400"],
.usb-dock.dock-sepia [class*="text-violet-500"] { color: #a435f0 !important; }
.usb-dock.dock-sepia [class*="text-violet-200"] { color: #b557f7 !important; }
.usb-dock.dock-sepia [class*="text-violet-600"] { color: #8710d8 !important; }
.usb-dock.dock-sepia [class*="text-emerald-300"],
.usb-dock.dock-sepia [class*="text-emerald-400"] { color: #059669 !important; }
.usb-dock.dock-sepia [class*="text-emerald-200"] { color: #10b981 !important; }
.usb-dock.dock-sepia [class*="text-emerald-500"] { color: #047857 !important; }
.usb-dock.dock-sepia [class*="text-amber-300"],
.usb-dock.dock-sepia [class*="text-amber-400"]  { color: #d97706 !important; }
.usb-dock.dock-sepia [class*="text-amber-200"]  { color: #f59e0b !important; }
.usb-dock.dock-sepia [class*="text-sky-300"],
.usb-dock.dock-sepia [class*="text-sky-400"],
.usb-dock.dock-sepia [class*="text-sky-500"]    { color: #0284c7 !important; }
.usb-dock.dock-sepia [class*="text-rose-300"],
.usb-dock.dock-sepia [class*="text-rose-400"],
.usb-dock.dock-sepia [class*="text-red-400"]    { color: #dc2626 !important; }
.usb-dock.dock-sepia [class*="text-fuchsia-300"],
.usb-dock.dock-sepia [class*="text-fuchsia-400"] { color: #c026d3 !important; }

/* Ring colors */
.usb-dock.dock-sepia [class*="ring-violet-500"]   { --tw-ring-color: rgba(124, 58, 237, 0.45) !important; }
.usb-dock.dock-sepia [class*="ring-emerald-500"]  { --tw-ring-color: rgba(5, 150, 105, 0.45)  !important; }
.usb-dock.dock-sepia [class*="ring-amber-500"]    { --tw-ring-color: rgba(217, 119, 6, 0.45)  !important; }
.usb-dock.dock-sepia [class*="ring-red-500"]      { --tw-ring-color: rgba(225, 29, 72, 0.45)  !important; }
.usb-dock.dock-sepia [class*="ring-sky-500"]      { --tw-ring-color: rgba(2, 132, 199, 0.45)  !important; }

/* ── 12. Glowy shadows — keep the color on accent CTAs/badges ───────────
   Generic dark drop shadows get softened, but colored glows on violet/
   emerald/amber elements stay tinted so the UI feels alive on white. */
.usb-dock.dock-sepia [class*="shadow-[0_8px_30px"] {
  box-shadow: 0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08) !important;
}

/* Generic colored glows → matching tinted halo */
.usb-dock.dock-sepia [class*="shadow-violet-"] {
  box-shadow: 0 4px 14px rgba(164, 53, 240, 0.28), 0 1px 3px rgba(0,0,0,0.06) !important;
}
.usb-dock.dock-sepia [class*="shadow-emerald-"] {
  box-shadow: 0 4px 14px rgba(5, 150, 105, 0.28), 0 1px 3px rgba(0,0,0,0.06) !important;
}
.usb-dock.dock-sepia [class*="shadow-amber-"] {
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.30), 0 1px 3px rgba(0,0,0,0.06) !important;
}
.usb-dock.dock-sepia [class*="shadow-sky-"] {
  box-shadow: 0 4px 14px rgba(14, 165, 233, 0.28), 0 1px 3px rgba(0,0,0,0.06) !important;
}
.usb-dock.dock-sepia [class*="shadow-red-"],
.usb-dock.dock-sepia [class*="shadow-rose-"] {
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.26), 0 1px 3px rgba(0,0,0,0.06) !important;
}

/* Gradient CTAs — full Udemy violet halo */
.usb-dock.dock-sepia [class*="from-violet-"][class~="text-white"] {
  box-shadow: 0 6px 18px rgba(164, 53, 240, 0.40), 0 2px 4px rgba(164, 53, 240, 0.20) !important;
}
.usb-dock.dock-sepia [class*="from-emerald-"][class~="text-white"] {
  box-shadow: 0 6px 18px rgba(5, 150, 105, 0.38), 0 2px 4px rgba(5, 150, 105, 0.20) !important;
}

/* ── 13. Arbitrary-value dark gradient stops → light surface ────────────
   Components hardcode from-[#18181b] to-[#121214] for cards. The
   bg-gradient image is cleared by the earlier rule (line ~115) but the
   ELEMENT then has no background — apply a neutral fallback. */
.usb-dock.dock-sepia [class*="from-[#18181b]"],
.usb-dock.dock-sepia [class*="from-[#1a1b1d]"],
.usb-dock.dock-sepia [class*="from-[#121214]"],
.usb-dock.dock-sepia [class*="from-[#141416]"],
.usb-dock.dock-sepia [class*="from-[#0a0a0c]"],
.usb-dock.dock-sepia [class*="from-[#0c0c0f]"],
.usb-dock.dock-sepia [class*="from-[#0a0b0c]"],
.usb-dock.dock-sepia [class*="to-[#121214]"],
.usb-dock.dock-sepia [class*="to-[#141416]"],
.usb-dock.dock-sepia [class*="to-[#0a0a0c]"] {
  background-color: var(--usb-bg-3) !important;
}

/* ── 14. Inline-style guard for the Udemy brand purple ──────────────────
   #a435f0 is used as solid bg in navbar pills/progress. Stays readable
   on white but is too saturated — tone it down slightly. */
.usb-dock.dock-sepia [class~="bg-[#a435f0]"],
.usb-dock.dock-sepia [style*="background-color: #a435f0"],
.usb-dock.dock-sepia [style*="background: #a435f0"] {
  background-color: #6d28d9 !important;
}

/* ── 15. Specific brand violet at very low opacity (kept invisible-ish) ──
   bg-violet-500/3, /5, /6, /7, /8 — used as ultra-soft section
   tints in Study cards. On white they vanish; nudge them up. */
.usb-dock.dock-sepia [class~="bg-violet-500/3"],
.usb-dock.dock-sepia [class~="bg-violet-500/5"],
.usb-dock.dock-sepia [class~="bg-violet-500/6"],
.usb-dock.dock-sepia [class~="bg-violet-500/7"],
.usb-dock.dock-sepia [class~="bg-violet-500/8"]    { background-color: rgba(124, 58, 237, 0.08) !important; }
.usb-dock.dock-sepia [class~="bg-violet-500/10"],
.usb-dock.dock-sepia [class~="bg-violet-500/12"],
.usb-dock.dock-sepia [class~="bg-violet-500/15"]   { background-color: rgba(124, 58, 237, 0.12) !important; }
.usb-dock.dock-sepia [class~="bg-violet-500/18"],
.usb-dock.dock-sepia [class~="bg-violet-500/20"],
.usb-dock.dock-sepia [class~="bg-violet-500/25"]   { background-color: rgba(124, 58, 237, 0.16) !important; }

/* Same pattern for emerald/amber/sky low-opacity tints */
.usb-dock.dock-sepia [class~="bg-emerald-500/5"],
.usb-dock.dock-sepia [class~="bg-emerald-500/6"],
.usb-dock.dock-sepia [class~="bg-emerald-500/8"]   { background-color: rgba(5, 150, 105, 0.08) !important; }
.usb-dock.dock-sepia [class~="bg-amber-500/5"],
.usb-dock.dock-sepia [class~="bg-amber-500/8"]     { background-color: rgba(217, 119, 6, 0.08) !important; }
.usb-dock.dock-sepia [class~="bg-sky-500/5"],
.usb-dock.dock-sepia [class~="bg-sky-500/6"],
.usb-dock.dock-sepia [class~="bg-sky-500/8"]       { background-color: rgba(2, 132, 199, 0.08) !important; }

/* ── 16. Code-block surfaces vs full-screen modal backdrops ─────────────
   bg-black/40 and bg-black/50 are used by inline code blocks and solution
   textareas — these need a LIGHT code surface, not a dim overlay.
   bg-black/60+ are real modal backdrops — keep them dim. */
.usb-dock.dock-sepia [class~="bg-black/40"],
.usb-dock.dock-sepia [class~="bg-black/45"],
.usb-dock.dock-sepia [class~="bg-black/50"] {
  background-color: #f6f8fa !important;       /* GitHub-style code surface */
  color: #1c1d1f !important;
}

/* Modal / drawer backdrops — stay dim */
.usb-dock.dock-sepia [class~="bg-black/60"],
.usb-dock.dock-sepia [class~="bg-black/65"],
.usb-dock.dock-sepia [class~="bg-black/70"],
.usb-dock.dock-sepia [class~="bg-black/75"],
.usb-dock.dock-sepia [class~="bg-black/80"] { background-color: rgba(0, 0, 0, 0.35) !important; }

/* Code block text — emerald-300/80 on dark was readable; on light, deepen */
.usb-dock.dock-sepia pre[class*="bg-black/"],
.usb-dock.dock-sepia code[class*="bg-black/"],
.usb-dock.dock-sepia [class*="bg-black/"] code,
.usb-dock.dock-sepia [class*="bg-black/"] pre { color: #0f172a !important; }

/* Solution textarea (bg-black/40 + border) — readable monospace input */
.usb-dock.dock-sepia textarea[class~="bg-black/40"],
.usb-dock.dock-sepia textarea[class~="bg-black/50"] {
  background-color: #f6f8fa !important;
  color: #1c1d1f !important;
  border-color: rgba(0,0,0,0.12) !important;
}
.usb-dock.dock-sepia textarea[class~="bg-black/40"]::placeholder,
.usb-dock.dock-sepia textarea[class~="bg-black/50"]::placeholder {
  color: rgba(28,29,31,0.40) !important;
}

/* ════════════════════════════════════════════════════════════════
   SAFEGUARD — Light/Warm White bg classes para Tailwind v4 JIT
   Tailwind no puede escanear template literals.
   Estas reglas garantizan que los colores funcionen aunque Tailwind
   no genere el CSS para esas clases arbitrarias.
   Scoped a .usb-dock → no afecta la página host.
════════════════════════════════════════════════════════════════ */

/* Cool-neutral white backgrounds (Udemy style) — components still hardcode
   the legacy cream hex values; remap them on the fly. */
.usb-dock [class~="bg-[#f8f7f6]"]   { background-color: #f4f6f9 !important; }  /* main page bg       */
.usb-dock [class~="bg-[#f0efed]"]   { background-color: #f1f4f7 !important; }  /* header bg          */
.usb-dock [class~="bg-[#f2f1ef]"]   { background-color: #f1f4f7 !important; }  /* tabbar / footer    */
.usb-dock [class~="bg-[#ebebea]"]   { background-color: #eef0f3 !important; }  /* collapsed / deep   */
.usb-dock [class~="bg-[#e8e7e5]"]   { background-color: #eceef1 !important; }  /* deepest bar        */
.usb-dock [class*="bg-[#f8f7f6]/"]  { background-color: #f4f6f9 !important; }  /* bg-[#f8f7f6]/98 etc */
.usb-dock [class*="bg-[#f0efed]/"]  { background-color: #f3f4f6 !important; }
.usb-dock [class*="bg-[#f2f1ef]/"]  { background-color: #f1f3f5 !important; }
.usb-dock [class~="bg-[#fbfaf9]"]   { background-color: #ffffff !important; }
.usb-dock [class~="bg-[#f5f4f2]"]   { background-color: #f1f3f5 !important; }
.usb-dock [class~="bg-[#ece9e6]"]   { background-color: #eceef1 !important; }

/* Borders that hardcoded warm-grey shades */
.usb-dock [class*="border-[#"][class*="000000]/"] { /* noop guard */ }

/* Legacy muted text safeguard — remap to cool neutral grays */
.usb-dock [class~="text-[#6e6b68]"]    { color: #6b7280 !important; }
.usb-dock [class*="text-[#6e6b68]/"]   { color: #6b7280 !important; }
.usb-dock [class~="text-[#3d3a38]"]    { color: #4b4d52 !important; }
.usb-dock [class*="text-[#3d3a38]/"]   { color: #4b4d52 !important; }
.usb-dock [class~="text-[#1a1918]"]    { color: #1c1d1f !important; }
.usb-dock [class*="text-[#1a1918]/"]   { color: #1c1d1f !important; }
.usb-dock [class~="text-[#4a4744]"]    { color: #3f4147 !important; }
.usb-dock [class~="text-[#5a5754]"]    { color: #555861 !important; }

/* ════════════════════════════════════════════════════════════════
   §17. Slate / dark named-color gradient stops on cards
   ExtensionSidebar uses from-slate-800 via-slate-900 to-[#0a0a0c]
   for badge headers. The image is killed elsewhere; ensure no
   residual color and provide a neutral fallback.
════════════════════════════════════════════════════════════════ */
.usb-dock.dock-sepia [class*="from-slate-7"],
.usb-dock.dock-sepia [class*="from-slate-8"],
.usb-dock.dock-sepia [class*="from-slate-9"],
.usb-dock.dock-sepia [class*="via-slate-7"],
.usb-dock.dock-sepia [class*="via-slate-8"],
.usb-dock.dock-sepia [class*="via-slate-9"],
.usb-dock.dock-sepia [class*="to-slate-7"],
.usb-dock.dock-sepia [class*="to-slate-8"],
.usb-dock.dock-sepia [class*="to-slate-9"],
.usb-dock.dock-sepia [class*="from-zinc-8"],
.usb-dock.dock-sepia [class*="from-zinc-9"],
.usb-dock.dock-sepia [class*="from-neutral-8"],
.usb-dock.dock-sepia [class*="from-neutral-9"],
.usb-dock.dock-sepia [class*="from-gray-8"],
.usb-dock.dock-sepia [class*="from-gray-9"] {
  background-image: none !important;
  background-color: var(--usb-bg-3) !important;
}

/* ════════════════════════════════════════════════════════════════
   §18. Celebration / Modal scrims with -950 gradient stops
   Without this, the dark scrim disappears and the page bleeds through.
   Replace with a soft frosted-white scrim so the celebration card pops.
════════════════════════════════════════════════════════════════ */
.usb-dock.dock-sepia [class*="from-violet-950"],
.usb-dock.dock-sepia [class*="from-slate-950"],
.usb-dock.dock-sepia [class*="from-emerald-950"],
.usb-dock.dock-sepia [class*="from-amber-950"],
.usb-dock.dock-sepia [class*="from-indigo-950"],
.usb-dock.dock-sepia [class*="from-fuchsia-950"],
.usb-dock.dock-sepia [class*="from-sky-950"],
.usb-dock.dock-sepia [class*="from-rose-950"],
.usb-dock.dock-sepia [class*="from-orange-950"],
.usb-dock.dock-sepia [class*="from-purple-950"],
.usb-dock.dock-sepia [class*="from-teal-950"],
.usb-dock.dock-sepia [class*="via-violet-950"],
.usb-dock.dock-sepia [class*="via-slate-950"],
.usb-dock.dock-sepia [class*="to-slate-950"],
.usb-dock.dock-sepia [class*="to-indigo-950"],
.usb-dock.dock-sepia [class*="to-violet-950"],
.usb-dock.dock-sepia [class*="to-emerald-950"],
.usb-dock.dock-sepia [class*="to-amber-950"],
.usb-dock.dock-sepia [class*="to-fuchsia-950"],
.usb-dock.dock-sepia [class*="to-sky-950"],
.usb-dock.dock-sepia [class*="to-orange-950"],
.usb-dock.dock-sepia [class*="to-purple-950"],
.usb-dock.dock-sepia [class*="to-teal-950"],
.usb-dock.dock-sepia [class*="to-rose-950"] {
  background-image: linear-gradient(135deg, rgba(247,249,250,0.88) 0%, rgba(255,255,255,0.92) 100%) !important;
  /* No backdrop-filter here: it forces GPU rasterization of the subtree and
     softens any text/icons inside. The opaque gradient already reads correctly. */
}

/* ════════════════════════════════════════════════════════════════
   §19. Stepper dots & low-alpha indicator chips
   bg-white/8 collapsed to 0.05 black → invisible. Boost to 0.12.
════════════════════════════════════════════════════════════════ */
.usb-dock.dock-sepia [class~="bg-white/8"],
.usb-dock.dock-sepia [class~="bg-white/6"]              { background-color: rgba(0,0,0,0.10) !important; }
.usb-dock.dock-sepia [class~="bg-white/25"]             { background-color: rgba(0,0,0,0.14) !important; }

/* ════════════════════════════════════════════════════════════════
   §20. Accent tints with /N opacity (bg-X-600/15, etc.)
   AuthGuard hero uses bg-violet-600/15 — render as readable tint.
════════════════════════════════════════════════════════════════ */
.usb-dock.dock-sepia [class*="bg-violet-600/"]    { background-color: rgba(164,53,240,0.10) !important; }
.usb-dock.dock-sepia [class*="bg-violet-700/"]    { background-color: rgba(135,16,216,0.10) !important; }
.usb-dock.dock-sepia [class*="bg-emerald-600/"]   { background-color: rgba(5,150,105,0.10)  !important; }
.usb-dock.dock-sepia [class*="bg-sky-600/"]       { background-color: rgba(2,132,199,0.10)  !important; }
.usb-dock.dock-sepia [class*="bg-amber-600/"]     { background-color: rgba(217,119,6,0.10)  !important; }
.usb-dock.dock-sepia [class*="bg-rose-600/"],
.usb-dock.dock-sepia [class*="bg-red-600/"]       { background-color: rgba(225,29,72,0.10)  !important; }

/* ════════════════════════════════════════════════════════════════
   §21. Opacity-suffixed text colors (e.g. text-amber-400/50)
   Tailwind's color-mix can wash these out; force solid accent.
════════════════════════════════════════════════════════════════ */
.usb-dock.dock-sepia [class*="text-amber-400/"]   { color: #d97706 !important; }
.usb-dock.dock-sepia [class*="text-emerald-400/"],
.usb-dock.dock-sepia [class*="text-emerald-300/"] { color: #059669 !important; }
.usb-dock.dock-sepia [class*="text-violet-400/"],
.usb-dock.dock-sepia [class*="text-violet-300/"]  { color: #a435f0 !important; }
.usb-dock.dock-sepia [class*="text-sky-400/"],
.usb-dock.dock-sepia [class*="text-sky-300/"]     { color: #0284c7 !important; }
.usb-dock.dock-sepia [class*="text-rose-400/"],
.usb-dock.dock-sepia [class*="text-rose-300/"]    { color: #dc2626 !important; }

/* ════════════════════════════════════════════════════════════════
   §22. Sparkle particles & decorative bg-white dots in celebrations
   Pure bg-white on light bg = invisible. Tint with brand purple.
════════════════════════════════════════════════════════════════ */
.usb-dock.dock-sepia [data-usb-sparkle],
.usb-dock.dock-sepia .usb-sparkle { background-color: #a435f0 !important; }

/* ════════════════════════════════════════════════════════════════
   §23. Custom scrollbars (mock 1:1 — App.tsx)
   Auto-hide style: invisible at rest, fades in on hover. Violet tint
   matches the brand accent and works in both dark and light themes.
   Scoped under .usb-dock so we never touch the host page's scrollbars.
════════════════════════════════════════════════════════════════ */
.usb-dock .custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.25s ease;
}
.usb-dock .custom-scrollbar:hover,
.usb-dock .custom-scrollbar:focus-within {
  scrollbar-color: rgba(139, 92, 246, 0.35) transparent;
}
.usb-dock .custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.usb-dock .custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.usb-dock .custom-scrollbar::-webkit-scrollbar-thumb {
  background: transparent;
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 999px;
  transition: background-color 0.2s ease;
}
.usb-dock .custom-scrollbar:hover::-webkit-scrollbar-thumb,
.usb-dock .custom-scrollbar:focus-within::-webkit-scrollbar-thumb {
  background-color: rgba(139, 92, 246, 0.35);
}
.usb-dock .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(139, 92, 246, 0.55) !important;
}
.usb-dock .custom-scrollbar::-webkit-scrollbar-thumb:active {
  background-color: rgba(139, 92, 246, 0.75) !important;
}
.usb-dock .custom-scrollbar::-webkit-scrollbar-corner {
  background: transparent;
}

/* Compact variant for tight surfaces (textareas, mini-lists) */
.usb-dock .custom-scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgba(139, 92, 246, 0.25) transparent;
}
.usb-dock .custom-scrollbar-thin::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.usb-dock .custom-scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.usb-dock .custom-scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: rgba(139, 92, 246, 0.25);
  border-radius: 999px;
  transition: background-color 0.2s ease;
}
.usb-dock .custom-scrollbar-thin:hover::-webkit-scrollbar-thumb {
  background-color: rgba(139, 92, 246, 0.45);
}
.usb-dock .custom-scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background-color: rgba(139, 92, 246, 0.65) !important;
}

/* Default scrollbar fallback for anything inside the dock that
   uses a generic overflow-y-auto without an explicit class. The
   thumb stays subtle and adapts to the active theme via vars. */
.usb-dock ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.usb-dock ::-webkit-scrollbar-track {
  background: transparent;
}
.usb-dock ::-webkit-scrollbar-thumb {
  background-color: var(--usb-scrollbar);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.usb-dock ::-webkit-scrollbar-thumb:hover {
  background-color: rgba(139, 92, 246, 0.45);
}
.usb-dock { scrollbar-width: thin; scrollbar-color: var(--usb-scrollbar) transparent; }

/* ════════════════════════════════════════════════════════════════
   §25. SCROLL BOUNDARY (ambos temas)
   El scroll dentro del dock NUNCA encadena a la página de Udemy:
   ni al llegar al fin del contenido ni sobre zonas no desplazables.
   (El guard JS del content script previene el default; esto cubre
   contenedores nativos y navegadores sin JS activo.)
════════════════════════════════════════════════════════════════ */
.usb-dock,
.usb-dock .custom-scrollbar,
.usb-dock .custom-scrollbar-thin {
  overscroll-behavior: contain;
}

/* ════════════════════════════════════════════════════════════════
   §24. LIGHT ELEVATION & SURFACES
   El dark tiene jerarquía por oscuridad; el light la necesita por
   ELEVACIÓN: página gris frío → superficies BLANCAS con borde fuerte
   y sombra suave en dos niveles (--usb-elev-1/-2).
════════════════════════════════════════════════════════════════ */

/* Superficies tipo tarjeta (familias white-alpha dark-first) → blanco elevado */
.usb-dock.dock-sepia [class*="bg-white/[0.015]"],
.usb-dock.dock-sepia [class*="bg-white/[0.02]"],
.usb-dock.dock-sepia [class*="bg-white/[0.03]"],
.usb-dock.dock-sepia [class*="bg-white/[0.04]"],
.usb-dock.dock-sepia [class~="bg-white/2"],
.usb-dock.dock-sepia [class~="bg-white/3"],
.usb-dock.dock-sepia [class~="bg-white/4"],
.usb-dock.dock-sepia [class~="bg-white/5"],
.usb-dock.dock-sepia [class~="bg-white/6"],
.usb-dock.dock-sepia [class~="bg-white/7"],
.usb-dock.dock-sepia [class~="bg-white/8"] {
  background-color: #ffffff !important;
  box-shadow: var(--usb-elev-1) !important;
}

/* Bordes de esas tarjetas: visibles de verdad en light */
.usb-dock.dock-sepia [class*="border-[var(--usb-border)]"] {
  border-color: var(--usb-border) !important;
}

/* Panel de IA/modelos: tarjeta blanca elevada flotando sobre la página */
.usb-dock.dock-sepia .usb-ai-panel {
  background-color: #ffffff !important;
  box-shadow: var(--usb-elev-2) !important;
}

/* Segmented control (Local/OpenAI/Claude/Gemini): track gris para que los
   segmentos activos/en repos se lean sobre blanco */
.usb-dock.dock-sepia [class*="rounded-[10px]"][class*="bg-[var(--usb-input-bg)]"] {
  background-color: #eef1f5 !important;
  box-shadow: none !important;
}

/* CTA violeta: sombra más ligera y honesta sobre fondo claro */
.usb-dock.dock-sepia [class*="from-violet"][class~="text-white"] {
  box-shadow: 0 4px 14px rgba(164,53,240,0.25), 0 1px 3px rgba(164,53,240,0.20) !important;
}

/* Header y tabbar: separación clara con la página */
.usb-dock.dock-sepia [class*="border-b"][class*="border-white/5"],
.usb-dock.dock-sepia [class*="border-b"][class*="border-white/6"] {
  border-bottom-color: var(--usb-border) !important;
}
`;

/** @deprecated Use THEME_CSS — kept for backward-compat */
export const SEPIA_CSS = THEME_CSS;
