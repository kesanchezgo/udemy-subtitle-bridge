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
   ESCALA TIPOGRÁFICA Y DE COMPONENTES
   Calibrada con multiplicador de escala base (1.12x) para asegurar
   que textos, iconos y controles estén proporcionados al estándar
   del navegador (14-16px) y nunca se sientan diminutos.
════════════════════════════════════════════════════════════════ */

${[7, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32]
  .map((px) => {
    const cls = String(px).replace('.', '\\.');
    // Escala monótona (nunca un tamaño menor produce un resultado mayor):
    // <=9 → 10.5 (piso legible) · 9.5–10.5 → +1.5 · 11–13.9 → +1.2 · >=14 → ×1.08
    const adjustedPx = px <= 9 ? 10.5 : px < 11 ? px + 1.5 : px < 14 ? px + 1.2 : px * 1.08;
    return `.usb-dock .text-\\[${cls}px\\] { font-size: calc(${adjustedPx.toFixed(1)}px * var(--usb-scale, 1)) !important; }`;
  })
  .join('\n')}

/* Espaciado, gaps y radios escalados para dar aire y jerarquía limpia */
${[1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12]
  .map((n) => {
    const cls = String(n).replace('.', '\\.');
    const value = n * 4.5; // Ligero incremento del espaciado interno
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
  --kinema-font:      -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --kinema-name-size: calc(30px * var(--usb-scale, 1));
  --kinema-signature-size: calc(13px * var(--usb-scale, 1));
  --kinema-compact-size: calc(20px * var(--usb-scale, 1));
  --kinema-accent:    #6d4aff;
  --kinema-accent-dot: calc(16px * var(--usb-scale, 1));
  --kinema-wordmark:  #f7f7f8;
  --kinema-signature: #aaa8ad;
  /* ─── Escala violeta de marca (centrada en el logo #6d4aff) ───
     Redefine las variables de Tailwind v4: todas las utilidades violet-*,
     purple-*, indigo-* y fuchsia-* heredan la marca en ambos temas. */
  --kinema-50:  #f5f2ff; --kinema-100: #ebe6ff; --kinema-200: #d4c9ff; --kinema-300: #b9a8ff;
  --kinema-400: #9a83ff; --kinema-500: #8463ff; --kinema-600: #6d4aff; --kinema-700: #5b37e8;
  --kinema-800: #4a2cc2; --kinema-900: #3a2399; --kinema-950: #221360;
  --color-violet-50: var(--kinema-50);
  --color-violet-100: var(--kinema-100);
  --color-violet-200: var(--kinema-200);
  --color-violet-300: var(--kinema-300);
  --color-violet-400: var(--kinema-400);
  --color-violet-500: var(--kinema-500);
  --color-violet-600: var(--kinema-600);
  --color-violet-700: var(--kinema-700);
  --color-violet-800: var(--kinema-800);
  --color-violet-900: var(--kinema-900);
  --color-violet-950: var(--kinema-950);
  --color-purple-50: var(--kinema-50);
  --color-purple-100: var(--kinema-100);
  --color-purple-200: var(--kinema-200);
  --color-purple-300: var(--kinema-300);
  --color-purple-400: var(--kinema-400);
  --color-purple-500: var(--kinema-500);
  --color-purple-600: var(--kinema-600);
  --color-purple-700: var(--kinema-700);
  --color-purple-800: var(--kinema-800);
  --color-purple-900: var(--kinema-900);
  --color-purple-950: var(--kinema-950);
  --color-indigo-50: var(--kinema-50);
  --color-indigo-100: var(--kinema-100);
  --color-indigo-200: var(--kinema-200);
  --color-indigo-300: var(--kinema-300);
  --color-indigo-400: var(--kinema-400);
  --color-indigo-500: var(--kinema-500);
  --color-indigo-600: var(--kinema-600);
  --color-indigo-700: var(--kinema-700);
  --color-indigo-800: var(--kinema-800);
  --color-indigo-900: var(--kinema-900);
  --color-indigo-950: var(--kinema-950);
  --color-fuchsia-50: var(--kinema-50);
  --color-fuchsia-100: var(--kinema-100);
  --color-fuchsia-200: var(--kinema-200);
  --color-fuchsia-300: var(--kinema-300);
  --color-fuchsia-400: var(--kinema-400);
  --color-fuchsia-500: var(--kinema-500);
  --color-fuchsia-600: var(--kinema-600);
  --color-fuchsia-700: var(--kinema-700);
  --color-fuchsia-800: var(--kinema-800);
  --color-fuchsia-900: var(--kinema-900);
  --color-fuchsia-950: var(--kinema-950);
  --font-sans: var(--kinema-font);
  --font-mono: "JetBrains Mono", "SF Mono", ui-monospace, "Cascadia Code", Consolas, monospace;
  /* ─── Dark theme (default) — neutros con matiz violeta sutil ─── */
  --usb-bg-0:         #0b0a10;      /* bars / más profundo  */
  --usb-bg-1:         #13121a;      /* header               */
  --usb-bg-2:         #1a1922;      /* página principal     */
  --usb-bg-3:         #15141c;      /* cards                */
  --usb-bg-4:         #0d0c12;      /* inputs / deepest     */
  --usb-bg-5:         #17161e;      /* footer / misceláneos */

  --usb-fg:           #ffffff;
  --usb-fg-hi:        rgba(255,255,255,0.95);
  --usb-fg-mid:       rgba(255,255,255,0.72);
  --usb-fg-lo:        rgba(255,255,255,0.52);
  --usb-fg-dim:       rgba(255,255,255,0.36);

  --usb-border:       rgba(255,255,255,0.10);
  --usb-border-mid:   rgba(255,255,255,0.16);
  --usb-divider:      rgba(255,255,255,0.08);

  --usb-input-bg:     rgba(0,0,0,0.30);
  --usb-placeholder:  rgba(255,255,255,0.42);
  --usb-scrollbar:    rgba(255,255,255,0.10);
  --usb-warn-text:    #fcd34d;

  --usb-accent:       #8463ff;
  --usb-accent-2:     #6d4aff;
  --usb-accent-soft:  rgba(109,74,255,0.16);
  --usb-accent-ring:  rgba(132,99,255,0.40);
}

.usb-dock.dock-sepia {
  --kinema-wordmark:  #1e1b2e;
  --kinema-signature: #6b667f;
  /* ── Light theme (neutros con matiz violeta + superficies blancas elevadas) ──
     Jerarquía por ELEVACIÓN, no solo color: página gris frío → tarjetas
     BLANCAS con borde visible + sombra suave (--usb-elev-1/2). */
  --usb-bg-0:         #eceef2;      /* bars / deepest       */
  --usb-bg-1:         #ffffff;      /* header               */
  --usb-bg-2:         #f6f7f9;      /* página principal     */
  --usb-bg-3:         #ffffff;      /* cards — pure white   */
  --usb-bg-4:         #eef0f4;      /* tabbar / inputs      */
  --usb-bg-5:         #ffffff;      /* footer / panels (blanco elevado) */

  --usb-fg:           #1e1b2e;      /* Udemy primary text   */
  --usb-fg-hi:        rgba(30,27,46,0.96);
  --usb-fg-mid:       rgba(30,27,46,0.72);
  --usb-fg-lo:        rgba(30,27,46,0.55);
  --usb-fg-dim:       rgba(30,27,46,0.34);

  --usb-border:       rgba(30,27,46,0.11);
  --usb-border-mid:   rgba(30,27,46,0.18);
  --usb-divider:      rgba(30,27,46,0.07);

  /* Acentos de marca Kinema */
  --usb-accent:       #6d4aff;       /* Violeta Kinema — CTA principal  */
  --usb-accent-2:     #5b37e8;       /* darker for hover                  */
  --usb-accent-soft:  rgba(109,74,255,0.08);
  --usb-accent-ring:  rgba(109,74,255,0.30);

  --usb-input-bg:     #ffffff;
  --usb-placeholder:  rgba(30,27,46,0.38);
  --usb-scrollbar:    rgba(30,27,46,0.16);
  --usb-warn-text:    #92400e;

  /* Elevación (solo light): el dark la da la oscuridad, el light la necesita */
  --usb-elev-1: 0 1px 2px rgba(30,27,46,0.05), 0 2px 6px -1px rgba(30,27,46,0.07);
  --usb-elev-2: 0 2px 4px rgba(30,27,46,0.05), 0 10px 24px -8px rgba(30,27,46,0.14);
}

/* ════════════════════════════════════════════════════════════════
   OVERRIDES — Activos solo en LIGHT / WARM WHITE
   Especificidad (0,2,0) + !important > Tailwind utilities (0,1,0)
════════════════════════════════════════════════════════════════ */

/* ── 1. Fondos hex oscuros → warm white ── */

.usb-dock.dock-sepia [class*="bg-[#1a1b1d]"],
.usb-dock.dock-sepia [class*="bg-[#1b1c1e]"],
.usb-dock.dock-sepia [class*="bg-[#1e1b2e]"],
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

/* Hero cards con acento → tinte plano (sin degradados) */
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-violet-"]:not([class~="text-white"]) {
  background-image: none !important;
  background-color: rgba(109,74,255,0.14) !important;
}
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-emerald-"]:not([class~="text-white"]) {
  background-image: none !important;
  background-color: rgba(5,150,105,0.14) !important;
}
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-amber-"]:not([class~="text-white"]) {
  background-image: none !important;
  background-color: rgba(245,158,11,0.16) !important;
}
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-sky-"]:not([class~="text-white"]) {
  background-image: none !important;
  background-color: rgba(14,165,233,0.14) !important;
}
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-rose-"]:not([class~="text-white"]),
.usb-dock.dock-sepia [class*="bg-gradient-"][class*="from-red-"]:not([class~="text-white"]) {
  background-image: none !important;
  background-color: rgba(239,68,68,0.14) !important;
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

/* Dark: jerarquía de texto monótona (más opacidad en el marcado = más contraste).
   Antes /45–/55 subían a .80 pero /60–/70 se quedaban en .60–.70 (invertido). */
.usb-dock:not(.dock-sepia) :is([class~="text-white/10"],[class~="text-white/12"],[class~="text-white/14"],[class~="text-white/15"],[class~="text-white/16"],[class~="text-white/18"],[class~="text-white/20"],[class~="text-white/22"],[class~="text-white/25"],[class~="text-white/28"]) { color: rgba(255,255,255,0.50) !important; }
.usb-dock:not(.dock-sepia) :is([class~="text-white/30"],[class~="text-white/32"],[class~="text-white/35"],[class~="text-white/38"],[class~="text-white/40"]) { color: rgba(255,255,255,0.60) !important; }
.usb-dock:not(.dock-sepia) :is([class~="text-white/45"],[class~="text-white/50"],[class~="text-white/55"]) { color: rgba(255,255,255,0.72) !important; }
.usb-dock:not(.dock-sepia) :is([class~="text-white/60"],[class~="text-white/62"],[class~="text-white/65"],[class~="text-white/68"],[class~="text-white/70"]) { color: rgba(255,255,255,0.82) !important; }
.usb-dock:not(.dock-sepia) :is([class~="text-white/72"],[class~="text-white/75"],[class~="text-white/80"],[class~="text-white/85"]) { color: rgba(255,255,255,0.92) !important; }

/* Dark: placeholder legible (antes white/20 ≈ 1.9:1) */
.usb-dock:not(.dock-sepia) input::placeholder,
.usb-dock:not(.dock-sepia) textarea::placeholder { color: var(--usb-placeholder) !important; }

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
  border-color:     rgba(30,27,46,0.16) !important;
  color:            var(--usb-fg) !important;
  caret-color:      #5b37e8 !important;
  box-shadow:       var(--usb-elev-1);
}

.usb-dock.dock-sepia input:not([type="range"])::placeholder,
.usb-dock.dock-sepia textarea::placeholder {
  color: var(--usb-placeholder) !important;
}

.usb-dock.dock-sepia input:not([type="range"]):focus,
.usb-dock.dock-sepia textarea:focus {
  border-color: #6d4aff !important;
  box-shadow:   0 0 0 3px rgba(109,74,255,0.14) !important;
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

.usb-dock.dock-sepia [class~="text-[#6e6b68]"]          { color: #4a4660 !important; }
.usb-dock.dock-sepia [class*="text-[#6e6b68]/"]         { color: rgba(74,70,96,0.75) !important; }

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
  background-color: #6d4aff !important;
  background-image: none !important;
  color: white !important;
}

/* Gradient emerald CTA buttons — saturated success green */
.usb-dock.dock-sepia [class*="from-emerald-"][class~="text-white"] {
  background-color: #047857 !important;
  background-image: none !important;
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
.usb-dock.dock-sepia [class*="text-violet-300"] { color: #5b37e8 !important; }
.usb-dock.dock-sepia [class*="bg-violet-500"] { background-color: rgba(109, 74, 255, 0.08) !important; }

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

.usb-dock.dock-sepia [class~="bg-violet-500"]   { background-color: rgba(109, 74, 255, 0.16) !important; }
.usb-dock.dock-sepia [class~="bg-violet-400"]   { background-color: rgba(109, 74, 255, 0.20) !important; }

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
.usb-dock.dock-sepia [class~="bg-violet-600"]   { background-color: #6d4aff !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-violet-700"]   { background-color: #5b37e8 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-emerald-600"]  { background-color: #059669 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-emerald-700"]  { background-color: #047857 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-sky-600"]      { background-color: #0284c7 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-rose-600"],
.usb-dock.dock-sepia [class~="bg-red-600"]      { background-color: #dc2626 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="bg-amber-600"]    { background-color: #d97706 !important; color: #ffffff !important; }

/* Hover states for solid CTAs — slightly darker on hover */
.usb-dock.dock-sepia [class~="hover:bg-violet-500"]:hover  { background-color: #8463ff !important; }
.usb-dock.dock-sepia [class~="hover:bg-violet-600"]:hover  { background-color: #6d4aff !important; }
.usb-dock.dock-sepia [class~="hover:bg-emerald-500"]:hover { background-color: #10b981 !important; }
.usb-dock.dock-sepia [class~="hover:bg-emerald-600"]:hover { background-color: #059669 !important; }

/* Accent borders — punchy enough to feel like a real card edge */
.usb-dock.dock-sepia [class*="border-violet-500"],
.usb-dock.dock-sepia [class*="border-violet-400"],
.usb-dock.dock-sepia [class*="border-violet-600"] { border-color: rgba(109, 74, 255, 0.45) !important; }

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
.usb-dock.dock-sepia [class*="text-violet-500"] { color: #5b37e8 !important; }
.usb-dock.dock-sepia [class*="text-violet-200"] { color: #8463ff !important; }
.usb-dock.dock-sepia [class*="text-violet-600"] { color: #4a2cc2 !important; }
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
.usb-dock.dock-sepia [class*="ring-violet-500"]   { --tw-ring-color: rgba(109, 74, 255, 0.45) !important; }
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
  box-shadow: 0 4px 14px rgba(109, 74, 255, 0.28), 0 1px 3px rgba(0,0,0,0.06) !important;
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
  box-shadow: 0 6px 18px rgba(109, 74, 255, 0.40), 0 2px 4px rgba(109, 74, 255, 0.20) !important;
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
   #6d4aff is used as solid bg in navbar pills/progress. Stays readable
   on white but is too saturated — tone it down slightly. */
.usb-dock.dock-sepia [class~="bg-[#6d4aff]"],
.usb-dock.dock-sepia [style*="background-color: #6d4aff"],
.usb-dock.dock-sepia [style*="background: #6d4aff"] {
  background-color: #5b37e8 !important;
}

/* ── 15. Specific brand violet at very low opacity (kept invisible-ish) ──
   bg-violet-500/3, /5, /6, /7, /8 — used as ultra-soft section
   tints in Study cards. On white they vanish; nudge them up. */
.usb-dock.dock-sepia [class~="bg-violet-500/3"],
.usb-dock.dock-sepia [class~="bg-violet-500/5"],
.usb-dock.dock-sepia [class~="bg-violet-500/6"],
.usb-dock.dock-sepia [class~="bg-violet-500/7"],
.usb-dock.dock-sepia [class~="bg-violet-500/8"]    { background-color: rgba(109, 74, 255, 0.08) !important; }
.usb-dock.dock-sepia [class~="bg-violet-500/10"],
.usb-dock.dock-sepia [class~="bg-violet-500/12"],
.usb-dock.dock-sepia [class~="bg-violet-500/15"]   { background-color: rgba(109, 74, 255, 0.12) !important; }
.usb-dock.dock-sepia [class~="bg-violet-500/18"],
.usb-dock.dock-sepia [class~="bg-violet-500/20"],
.usb-dock.dock-sepia [class~="bg-violet-500/25"]   { background-color: rgba(109, 74, 255, 0.16) !important; }

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
  color: #1e1b2e !important;
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
  color: #1e1b2e !important;
  border-color: rgba(0,0,0,0.12) !important;
}
.usb-dock.dock-sepia textarea[class~="bg-black/40"]::placeholder,
.usb-dock.dock-sepia textarea[class~="bg-black/50"]::placeholder {
  color: rgba(30,27,46,0.40) !important;
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
.usb-dock [class~="bg-[#f6f7f9]"]   { background-color: #f6f7f9 !important; }  /* main page bg       */
.usb-dock [class~="bg-[#eef0f4]"]   { background-color: #ffffff !important; }  /* header bg          */
.usb-dock [class~="bg-[#eef0f4]"]   { background-color: #ffffff !important; }  /* tabbar / footer    */
.usb-dock [class~="bg-[#ebebea]"]   { background-color: #eef0f3 !important; }  /* collapsed / deep   */
.usb-dock [class~="bg-[#e8e7e5]"]   { background-color: #eceef1 !important; }  /* deepest bar        */
.usb-dock [class*="bg-[#f6f7f9]/"]  { background-color: #f6f7f9 !important; }  /* bg-[#f6f7f9]/98 etc */
.usb-dock [class*="bg-[#eef0f4]/"]  { background-color: #f3f2f8 !important; }
.usb-dock [class*="bg-[#eef0f4]/"]  { background-color: #f1f0f7 !important; }
.usb-dock [class~="bg-[#fbfaf9]"]   { background-color: #ffffff !important; }
.usb-dock [class~="bg-[#f5f4f2]"]   { background-color: #f1f0f7 !important; }
.usb-dock [class~="bg-[#ece9e6]"]   { background-color: #eceef1 !important; }

/* Borders that hardcoded warm-grey shades */
.usb-dock [class*="border-[#"][class*="000000]/"] { /* noop guard */ }

/* Legacy muted text safeguard — remap to cool neutral grays */
.usb-dock [class~="text-[#6e6b68]"]    { color: #6b667f !important; }
.usb-dock [class*="text-[#6e6b68]/"]   { color: #6b667f !important; }
.usb-dock [class~="text-[#4a4660]"]    { color: #4a4660 !important; }
.usb-dock [class*="text-[#4a4660]/"]   { color: #4a4660 !important; }
.usb-dock [class~="text-[#1a1918]"]    { color: #1e1b2e !important; }
.usb-dock [class*="text-[#1a1918]/"]   { color: #1e1b2e !important; }
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
  background-image: none !important;
  background-color: #f6f7f9 !important;
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
.usb-dock.dock-sepia [class*="bg-violet-600/"]    { background-color: rgba(109,74,255,0.10) !important; }
.usb-dock.dock-sepia [class*="bg-violet-700/"]    { background-color: rgba(91,55,232,0.10) !important; }
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
.usb-dock.dock-sepia [class*="text-violet-300/"]  { color: #5b37e8 !important; }
.usb-dock.dock-sepia [class*="text-sky-400/"],
.usb-dock.dock-sepia [class*="text-sky-300/"]     { color: #0284c7 !important; }
.usb-dock.dock-sepia [class*="text-rose-400/"],
.usb-dock.dock-sepia [class*="text-rose-300/"]    { color: #dc2626 !important; }

/* ════════════════════════════════════════════════════════════════
   §22. Sparkle particles & decorative bg-white dots in celebrations
   Pure bg-white on light bg = invisible. Tint with brand purple.
════════════════════════════════════════════════════════════════ */
.usb-dock.dock-sepia [data-usb-sparkle],
.usb-dock.dock-sepia .usb-sparkle { background-color: #6d4aff !important; }

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
  scrollbar-color: rgba(132, 99, 255, 0.35) transparent;
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
  background-color: rgba(132, 99, 255, 0.35);
}
.usb-dock .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(132, 99, 255, 0.55) !important;
}
.usb-dock .custom-scrollbar::-webkit-scrollbar-thumb:active {
  background-color: rgba(132, 99, 255, 0.75) !important;
}
.usb-dock .custom-scrollbar::-webkit-scrollbar-corner {
  background: transparent;
}

/* Compact variant for tight surfaces (textareas, mini-lists) */
.usb-dock .custom-scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgba(132, 99, 255, 0.25) transparent;
}
.usb-dock .custom-scrollbar-thin::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.usb-dock .custom-scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.usb-dock .custom-scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: rgba(132, 99, 255, 0.25);
  border-radius: 999px;
  transition: background-color 0.2s ease;
}
.usb-dock .custom-scrollbar-thin:hover::-webkit-scrollbar-thumb {
  background-color: rgba(132, 99, 255, 0.45);
}
.usb-dock .custom-scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background-color: rgba(132, 99, 255, 0.65) !important;
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
  background-color: rgba(132, 99, 255, 0.45);
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
.usb-dock [class*="overflow-y-auto"],
.usb-dock [class*="overflow-auto"],
.usb-dock [class*="overflow-x-auto"],
.usb-dock [class*="overflow-y-scroll"],
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

.usb-dock.dock-sepia select.kx-field,
.usb-dock.dock-sepia select.kx-field:focus {
  color-scheme: light;
}

/* Panel de IA/modelos: tarjeta blanca elevada flotando sobre la página */
.usb-dock.dock-sepia .usb-ai-panel {
  background-color: #ffffff !important;
  box-shadow: var(--usb-elev-2) !important;
}

/* Interruptores: el estado manda (los botones primarios no deben pintarlos). */
.usb-dock button[role="switch"][data-state="unchecked"] { background-color: color-mix(in srgb, var(--usb-fg) 30%, transparent) !important; box-shadow: none !important; }
.usb-dock button[role="switch"][data-state="checked"] { background-color: #6d4aff !important; box-shadow: none !important; }

/* Segmented control (Local/OpenAI/Claude/Gemini): track gris para que los
   segmentos activos/en repos se lean sobre blanco */
.usb-dock.dock-sepia [class*="rounded-[10px]"][class*="bg-[var(--usb-input-bg)]"] {
  background-color: #eef0f4 !important;
  box-shadow: none !important;
}

/* CTA violeta: sombra más ligera y honesta sobre fondo claro */
.usb-dock.dock-sepia [class*="from-violet"][class~="text-white"] {
  box-shadow: 0 4px 14px rgba(109,74,255,0.25), 0 1px 3px rgba(109,74,255,0.20) !important;
}

/* Header y tabbar: separación clara con la página */
.usb-dock.dock-sepia [class*="border-b"][class*="border-white/5"],
.usb-dock.dock-sepia [class*="border-b"][class*="border-white/6"] {
  border-bottom-color: var(--usb-border) !important;
}

/* ════════════════════════════════════════════════════════════════
   17. CONTRASTE LIGHT — auditoría 2026-09 (código, solución, verdes,
   selects y módulos de exportación). Va al final para ganar por orden.
════════════════════════════════════════════════════════════════ */

/* Texto principal con alfa intermedio (cuerpo de solución, próximo paso,
   bloque de aplicación) caía en el fallback fg-lo: subirlo a fg-hi/mid. */
.usb-dock.dock-sepia [class~="text-white/72"],
.usb-dock.dock-sepia [class~="text-white/68"],
.usb-dock.dock-sepia [class~="text-white/62"]           { color: var(--usb-fg-hi)  !important; }
.usb-dock.dock-sepia [class~="text-white/32"],
.usb-dock.dock-sepia [class~="text-white/28"]           { color: var(--usb-fg-lo)  !important; }

/* Superficies de código: bloque de aplicación (bg-black/35), textarea de
   solución (bg-black/35) e inputs de objetivo (bg-black/25) → superficie
   tipo GitHub con borde visible, no un gris al 5 %. */
.usb-dock.dock-sepia div[class~="bg-black/35"],
.usb-dock.dock-sepia pre[class~="bg-black/35"],
.usb-dock.dock-sepia div[class~="bg-black/30"] {
  background-color: #f6f8fa !important;
  border-color: rgba(30,27,46,0.12) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.8) !important;
}
.usb-dock.dock-sepia textarea[class~="bg-black/35"],
.usb-dock.dock-sepia textarea[class~="bg-black/25"],
.usb-dock.dock-sepia input[class~="bg-black/25"],
.usb-dock.dock-sepia input[class~="bg-black/30"],
.usb-dock.dock-sepia select[class~="bg-black/25"],
.usb-dock.dock-sepia select[class~="bg-black/30"] {
  background-color: #ffffff !important;
  color: #1e1b2e !important;
  border-color: rgba(30,27,46,0.18) !important;
}
.usb-dock.dock-sepia textarea[class~="bg-black/35"] { background-color: #f6f8fa !important; }
.usb-dock.dock-sepia textarea[class*="bg-black/"]:focus,
.usb-dock.dock-sepia input[class*="bg-black/"]:focus,
.usb-dock.dock-sepia select[class*="bg-black/"]:focus {
  border-color: #6d4aff !important;
  box-shadow: 0 0 0 3px rgba(109,74,255,0.14) !important;
}
.usb-dock.dock-sepia textarea[class*="bg-black/"]::placeholder,
.usb-dock.dock-sepia input[class*="bg-black/"]::placeholder { color: rgba(30,27,46,0.42) !important; }

/* Código en verde (emerald-300/80 → emerald-600 daba 3.6:1 en 11px mono).
   Emerald-800 sobre #f6f8fa ≈ 7.4:1. */
.usb-dock.dock-sepia [class~="font-mono"][class*="text-emerald-300"],
.usb-dock.dock-sepia [class*="bg-black/"] [class*="text-emerald-300"] { color: #065f46 !important; }

/* Verdes de texto sobre tintes: emerald-600 (#059669) no llega a AA en
   10–11px. Emerald-700 (#047857) ≈ 5.2:1 sobre blanco. */
.usb-dock.dock-sepia [class*="text-emerald-300"],
.usb-dock.dock-sepia [class*="text-emerald-400"]        { color: #047857 !important; }

/* CTA "Verificar mi comprensión" y demás botones verdes sólidos: blanco sobre
   #059669 = 3.8:1 y el hover emerald-500 = 2.5:1. Se oscurecen un tono. */
.usb-dock.dock-sepia [class~="bg-emerald-600"],
.usb-dock.dock-sepia [class~="bg-emerald-700"]          { background-color: #047857 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="hover:bg-emerald-500"]:hover,
.usb-dock.dock-sepia [class~="hover:bg-emerald-600"]:hover { background-color: #065f46 !important; }
.usb-dock.dock-sepia [class~="bg-sky-700"]              { background-color: #0369a1 !important; color: #ffffff !important; }
.usb-dock.dock-sepia [class~="hover:bg-sky-600"]:hover  { background-color: #075985 !important; }

/* Bordes de tinte suave (/12–/25): la regla genérica los subía a 45 % y
   las tarjetas de estado parecían alertas. Tinte coherente con el fondo. */
.usb-dock.dock-sepia [class~="border-emerald-500/15"],
.usb-dock.dock-sepia [class~="border-emerald-500/16"],
.usb-dock.dock-sepia [class~="border-emerald-500/20"],
.usb-dock.dock-sepia [class~="border-emerald-500/22"],
.usb-dock.dock-sepia [class~="border-emerald-500/25"]   { border-color: rgba(4,120,87,0.26) !important; }
.usb-dock.dock-sepia [class~="border-violet-500/12"],
.usb-dock.dock-sepia [class~="border-violet-500/15"],
.usb-dock.dock-sepia [class~="border-violet-500/16"],
.usb-dock.dock-sepia [class~="border-violet-500/18"],
.usb-dock.dock-sepia [class~="border-violet-500/20"],
.usb-dock.dock-sepia [class~="border-violet-500/22"],
.usb-dock.dock-sepia [class~="border-violet-500/25"]    { border-color: rgba(109,74,255,0.24) !important; }
.usb-dock.dock-sepia [class~="border-sky-500/12"],
.usb-dock.dock-sepia [class~="border-sky-500/15"],
.usb-dock.dock-sepia [class~="border-sky-500/18"],
.usb-dock.dock-sepia [class~="border-sky-500/20"],
.usb-dock.dock-sepia [class~="border-sky-500/25"]       { border-color: rgba(3,105,161,0.24) !important; }
.usb-dock.dock-sepia [class~="bg-sky-500/6"]            { background-color: rgba(3,105,161,0.05) !important; }
.usb-dock.dock-sepia [class~="bg-sky-500/12"]           { background-color: rgba(3,105,161,0.10) !important; }

/* Desplegables nativos: las <option> heredaban el fondo oscuro del SO. */
.usb-dock select option { background-color: var(--usb-bg-3); color: var(--usb-fg); }

/* ── 18. Texto light-only heredado del sepia cálido (#4a4660 / #6e6b68) ──
   Historial, Caché, Sidebar y Dock los usan en la rama light de t(). Se
   reencauzan a los tokens cool-neutral; el tramo /30–/40 sube a ≥4.5:1. */
.usb-dock.dock-sepia [class~="text-[#4a4660]/80"],
.usb-dock.dock-sepia [class~="text-[#2c2a28]"] { color: var(--usb-fg-hi) !important; }
.usb-dock.dock-sepia [class~="text-[#4a4660]/70"],
.usb-dock.dock-sepia [class~="text-[#4a4660]/65"],
.usb-dock.dock-sepia [class~="text-[#4a4660]/60"],
.usb-dock.dock-sepia [class~="text-[#4a4660]/55"] { color: var(--usb-fg-mid) !important; }
.usb-dock.dock-sepia [class~="text-[#4a4660]/50"],
.usb-dock.dock-sepia [class~="text-[#4a4660]/45"],
.usb-dock.dock-sepia [class~="text-[#6e6b68]/55"],
.usb-dock.dock-sepia [class~="text-[#6e6b68]/50"] { color: var(--usb-fg-lo) !important; }
.usb-dock.dock-sepia [class~="text-[#4a4660]/40"],
.usb-dock.dock-sepia [class~="text-[#4a4660]/38"],
.usb-dock.dock-sepia [class~="text-[#4a4660]/35"],
.usb-dock.dock-sepia [class~="text-[#4a4660]/30"],
.usb-dock.dock-sepia [class~="text-[#6e6b68]/40"] { color: rgba(30,27,46,0.55) !important; }
.usb-dock.dock-sepia [class~="bg-[#9c9894]"]    { background-color: rgba(30,27,46,0.40) !important; }
.usb-dock.dock-sepia [class~="bg-[#9c9894]/60"] { background-color: rgba(30,27,46,0.24) !important; }

/* ── 19. Estados ámbar/naranja sin mapear (badge "Mock" del panel de
   proveedores, icono de celebración): 400/500 sobre blanco ≈ 2:1. */
.usb-dock.dock-sepia [class*="text-amber-500"]  { color: #b45309 !important; }
.usb-dock.dock-sepia [class*="text-orange-400"] { color: #c2410c !important; }

/* ── Fondos oscuros fijos → neutros con matiz de marca (solo clase exacta, conserva las variantes con alpha) ── */
.usb-dock:not(.dock-sepia) [class~="bg-[#1a1b1d]"] { background-color: #1a1922 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#1b1c1e]"] { background-color: #1b1a23 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#1c1d1f]"] { background-color: #1d1c25 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#18181b]"] { background-color: #1a1922 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#1d1e20]"] { background-color: #1e1d26 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#121214]"] { background-color: #13121a !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#131315]"] { background-color: #14131b !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#141416]"] { background-color: #15141c !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#141417]"] { background-color: #15141d !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#141418]"] { background-color: #15141d !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#0a0b0c]"] { background-color: #0b0a10 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#0c0c0f]"] { background-color: #0d0c12 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#0d0e0f]"] { background-color: #0e0d13 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#0e0f10]"] { background-color: #0e0d14 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#0f1012]"] { background-color: #100f16 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#0a0a0c]"] { background-color: #0b0a10 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#070809]"] { background-color: #08070c !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#0f0f12]"] { background-color: #100f15 !important; }
.usb-dock:not(.dock-sepia) [class~="bg-[#161718]"] { background-color: #17161e !important; }

/* ════════════════════════════════════════════════════════════════
   §26. REFINAMIENTO 2026-09 (al final para ganar por orden)
════════════════════════════════════════════════════════════════ */

/* Puntos de estado SÓLIDOS. Las reglas "bg-X-500 → tinte" de arriba estaban
   convirtiendo los indicadores (h-1.5/h-2, rounded-full) en manchas difusas
   sobre fondo claro. Los halos animados (animate-ping) siguen siendo tinte. */
${[
  ['violet', '#6d4aff'], ['emerald', '#10b981'], ['amber', '#f59e0b'],
  ['sky', '#0ea5e9'], ['rose', '#f43f5e'], ['red', '#ef4444'],
]
  .map(([name, hex]) => {
    const sizes = ['h-1', 'h-1.5', 'h-2', 'h-[4px]', 'h-[5px]', 'h-[6px]', 'h-[7px]', 'h-[8px]']
      .map((h) => `[class~="${h}"]`)
      .join(',');
    return [400, 500]
      .map(
        (n) =>
          `.usb-dock.dock-sepia [class~="rounded-full"][class~="bg-${name}-${n}"]:is(${sizes}):not([class~="animate-ping"]) { background-color: ${hex} !important; }`,
      )
      .join('\n');
  })
  .join('\n')}
.usb-dock.dock-sepia [class~="animate-ping"][class*="bg-"] { opacity: 0.35; }

/* Avisos ámbar: texto oscuro sobre tinte cálido (≥ 6:1) en vez de naranja
   medio sobre rosado. */
.usb-dock.dock-sepia [class*="text-amber-200"],
.usb-dock.dock-sepia [class*="text-amber-300"] { color: #92400e !important; }
.usb-dock.dock-sepia [class*="text-amber-400"] { color: #b45309 !important; }
.usb-dock.dock-sepia [class*="bg-amber-500/"]  { background-color: rgba(217,119,6,0.09) !important; }
.usb-dock.dock-sepia [class*="border-amber-500/"] { border-color: rgba(180,83,9,0.28) !important; }

/* Superficie de video (preview del overlay): oscura en ambos temas, porque
   representa el reproductor, no la interfaz. */
.usb-dock.dock-sepia .usb-video-surface {
  background-color: #15131f !important;
  border-color: rgba(30,27,46,0.30) !important;
}
.usb-dock.dock-sepia .usb-video-surface [class*="text-white/"] { color: rgba(255,255,255,0.66) !important; }
.usb-dock.dock-sepia .usb-video-surface [class*="bg-black/"]   { background-color: rgba(0,0,0,0.55) !important; }

/* Pestañas: acento subrayado de marca (no cae en las reglas de tinte) */
.usb-dock .usb-tab-underline { background-color: var(--usb-accent); }

/* Enfoque visible y consistente con la marca para teclado */
.usb-dock :is(button, [role="button"], a, summary):focus-visible {
  outline: 2px solid var(--usb-accent);
  outline-offset: 2px;
}

/* Movimiento reducido: sin pings ni shimmers */
@media (prefers-reduced-motion: reduce) {
  .usb-dock .animate-ping, .usb-dock .animate-pulse { animation: none !important; }
}

/* ════════════════════════════════════════════════════════════════
   §27. KINEMA v2 — "PRECISIÓN CINEMATOGRÁFICA" (al final: gana por orden)
   Tinta violeta (oscuro) y papel lavanda (claro). Serif display para
   títulos, sans para UI, mono para "claquetas" (etiquetas técnicas).
   Bordes de 1px, radios contenidos, sombras de un solo tono.
════════════════════════════════════════════════════════════════ */

.usb-dock {
  --kinema-font:    "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --kinema-display: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --kinema-mono:    "JetBrains Mono", "SF Mono", ui-monospace, "Cascadia Code", Consolas, monospace;
  --font-mono: var(--kinema-mono);

  --usb-bg-0: #08070d;
  --usb-bg-1: #0d0b15;
  --usb-bg-2: #110f1a;
  --usb-bg-3: #171426;
  --usb-bg-4: #0a0910;
  --usb-bg-5: #141220;
  --usb-border:     rgba(212,201,255,0.10);
  --usb-border-mid: rgba(212,201,255,0.18);
  --usb-divider:    rgba(212,201,255,0.07);
  --usb-fg-mid: rgba(236,232,255,0.74);
  --usb-fg-lo:  rgba(236,232,255,0.56);
  --usb-fg-dim: rgba(236,232,255,0.38);
  --kx-mark: rgba(212,201,255,0.55);
  --kx-glow: rgba(109,74,255,0.16);
  font-family: var(--kinema-font);
}
.usb-dock.dock-sepia {
  --usb-bg-0: #eceef2;
  --usb-bg-1: #ffffff;
  --usb-bg-2: #f6f7f9;
  --usb-bg-3: #ffffff;
  --usb-bg-4: #eef0f4;
  --usb-bg-5: #ffffff;
  --usb-border:     rgba(20,22,35,0.09);
  --usb-border-mid: rgba(20,22,35,0.16);
  --usb-divider:    rgba(20,22,35,0.06);
  --kx-mark: rgba(91,55,232,0.55);
  --kx-glow: rgba(109,74,255,0.10);
}

/* Fondos hex oscuros (dark) → tinta de marca por capas */
.usb-dock:not(.dock-sepia) [class*="bg-[#1a1b1d]"],
.usb-dock:not(.dock-sepia) [class*="bg-[#18181b]"],
.usb-dock:not(.dock-sepia) [class*="bg-[#161718]"] { background-color: var(--usb-bg-2) !important; }
.usb-dock:not(.dock-sepia) [class*="bg-[#121214]"],
.usb-dock:not(.dock-sepia) [class*="bg-[#141416]"],
.usb-dock:not(.dock-sepia) [class*="bg-[#0f1012]"] { background-color: var(--usb-bg-1) !important; }
.usb-dock:not(.dock-sepia) [class*="bg-[#0d0e0f]"],
.usb-dock:not(.dock-sepia) [class*="bg-[#0a0b0c]"] { background-color: var(--usb-bg-0) !important; }
.usb-dock:not(.dock-sepia) [class*="bg-[#16161a]"] { background-color: var(--usb-bg-3) !important; }
.usb-dock:not(.dock-sepia) [class*="bg-[#101013]"] { background-color: var(--usb-bg-4) !important; }

/* Radios precisos, bordes de pelo */
.usb-dock .rounded-2xl { border-radius: 14px !important; }
.usb-dock .rounded-xl  { border-radius: 10px !important; }
.usb-dock .rounded-lg  { border-radius: 8px !important; }
.usb-dock .rounded-md  { border-radius: 6px !important; }

/* Tipografía de sistema de marca */
.usb-dock .kx-display {
  font-family: var(--kinema-font);
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
}
/* Color por defecto de kx-slate, theme-aware y con especificidad cero
   (:where) para no vencer los text-* explícitos de cada componente. */
.usb-dock :where(.kx-slate):not([class*="text-"]) { color: var(--usb-fg-mid); }
.usb-dock .kx-slate {
  font-family: var(--kinema-mono);
  font-size: calc(10px * var(--usb-scale, 1));
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1;
}
.usb-dock .kx-num {
  font-family: var(--kinema-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

/* Marcas de encuadre (viewfinder) — esquinas en L */
.usb-dock .kx-frame { position: relative; }
.usb-dock .kx-fm {
  position: absolute;
  width: 11px; height: 11px;
  pointer-events: none;
  border: 0 solid var(--kx-mark);
}
.usb-dock .kx-fm-tl { top: 6px;    left: 6px;  border-top-width: 1.5px;    border-left-width: 1.5px; }
.usb-dock .kx-fm-tr { top: 6px;    right: 6px; border-top-width: 1.5px;    border-right-width: 1.5px; }
.usb-dock .kx-fm-bl { bottom: 6px; left: 6px;  border-bottom-width: 1.5px; border-left-width: 1.5px; }
.usb-dock .kx-fm-br { bottom: 6px; right: 6px; border-bottom-width: 1.5px; border-right-width: 1.5px; }

/* Superficie hero: velo de un solo tono sobre la tarjeta */
.usb-dock .kx-hero {
  background-image: none !important;
  background-color: var(--kx-glow) !important;
}

/* Control segmentado de pestañas */
.usb-dock .kx-seg {
  display: flex; gap: 2px; padding: 3px;
  border-radius: 11px;
  background: var(--usb-bg-4);
  box-shadow: inset 0 0 0 1px var(--usb-border);
}
.usb-dock .kx-seg-pill {
  position: absolute; inset: 0; border-radius: 8px;
  background: var(--usb-bg-3);
  box-shadow: 0 0 0 1px var(--usb-border-mid), 0 4px 10px -4px rgba(8,7,13,0.55);
}
.usb-dock.dock-sepia .kx-seg-pill {
  background: #fff;
  box-shadow: 0 0 0 1px var(--usb-border-mid), 0 4px 10px -4px rgba(20,22,35,0.12);
}

/* Botones primarios: sólido de marca + sombra de un solo tono (sin degradado) */
.usb-dock button[class*="bg-violet-600"]:not([role="switch"]),
.usb-dock button[class*="bg-violet-500 "]:not([role="switch"]) {
  background-image: none !important;
  box-shadow: 0 6px 16px -6px rgba(109,74,255,0.65), inset 0 0 0 1px rgba(212,201,255,0.22);
}
.usb-dock button:focus-visible { outline: 2px solid var(--usb-accent-ring); outline-offset: 2px; }


/* ════════════════════════════════════════════════════════════════
   §28. CONTRASTE WCAG AA — tema claro (auditado con medición real)
   Cada texto ≥ 4.5:1 (≥ 3:1 si es grande). Gana por orden de aparición.
════════════════════════════════════════════════════════════════ */

.usb-dock.dock-sepia {
  --usb-fg-mid:      rgba(30,27,46,0.84);
  --usb-fg-lo:       rgba(30,27,46,0.68);
  --usb-fg-dim:      rgba(30,27,46,0.52);
  --usb-placeholder: rgba(30,27,46,0.52);
  --kinema-signature: #5a5570;
}

/* Acento de marca legible sobre papel lavanda (≥ 5:1) */
.usb-dock.dock-sepia [class*="text-violet-"],
.usb-dock.dock-sepia [class*="text-purple-"],
.usb-dock.dock-sepia [class*="text-indigo-"] { color: #4f2fd6 !important; }
.usb-dock.dock-sepia [class*="text-[#6b667f]"],
.usb-dock.dock-sepia [class*="text-[#6e6b68]"] { color: #5a5570 !important; }
.usb-dock.dock-sepia [class*="text-[#4a4660]"] { color: #46425b !important; }

/* Estados: verde/rojo/ámbar profundos sobre superficies claras */
.usb-dock.dock-sepia [class*="text-emerald-"] { color: #047857 !important; }
.usb-dock.dock-sepia [class*="text-rose-"],
.usb-dock.dock-sepia [class*="text-red-"]     { color: #be123c !important; }
.usb-dock.dock-sepia [class*="text-sky-"]     { color: #075985 !important; }

/* Superficies que permanecen oscuras en tema claro (monitor de video):
   devolver tonos claros, el resto del dock usa tonos profundos. */
.usb-dock.dock-sepia .usb-video-surface [class*="text-emerald-"] { color: #6ee7b7 !important; }
.usb-dock.dock-sepia .usb-video-surface [class*="text-violet-"]  { color: #c4b5fd !important; }
.usb-dock.dock-sepia .usb-video-surface [class*="text-white/"]   { color: rgba(255,255,255,0.78) !important; }
.usb-dock.dock-sepia .usb-video-surface { color: rgba(255,255,255,0.92); }

/* Oscuro: estados con luminosidad suficiente */
.usb-dock:not(.dock-sepia) [class*="text-rose-400"],
.usb-dock:not(.dock-sepia) [class*="text-red-400"] { color: #fda4af !important; }

/* ════════════════════════════════════════════════════════════════
   §29. PULIDO — radios, movimiento y feedback táctil (gana por orden)
════════════════════════════════════════════════════════════════ */
.usb-dock {
  --usb-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --usb-dur: 180ms;
}
.usb-dock .rounded-xl { border-radius: 14px; }
.usb-dock .rounded-lg { border-radius: 10px; }
.usb-dock .rounded-2xl { border-radius: 18px; }

.usb-dock .transition-all,
.usb-dock .transition {
  transition-property: color, background-color, border-color, box-shadow, opacity, transform;
  transition-timing-function: var(--usb-ease);
  transition-duration: var(--usb-dur);
}

.usb-dock button:not(:disabled):active,
.usb-dock [role="button"]:active { transform: scale(0.97); }
.usb-dock button { transition-timing-function: var(--usb-ease); }
.usb-dock .rounded-xl.border:is(button, [role="button"]):not(:disabled):hover {
  box-shadow: var(--usb-elev-2);
}
.usb-dock svg { transition: color var(--usb-dur) var(--usb-ease), opacity var(--usb-dur) var(--usb-ease); }

@keyframes usb-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.usb-dock [role="dialog"], .usb-dock [role="menu"] { animation: usb-rise 240ms var(--usb-ease) both; }

@media (prefers-reduced-motion: reduce) {
  .usb-dock *, .usb-dock *::before, .usb-dock *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
  .usb-dock button:not(:disabled):active { transform: none; }
}

/* ════════════════════════════════════════════════════════════════
   §30. REVISIÓN TEMA CLARO — monitor, deshabilitados, raíl
════════════════════════════════════════════════════════════════ */
/* Monitor de salida: tinta violeta profunda en lugar de negro puro */
.usb-dock.dock-sepia .usb-video-surface {
  background-color: #1f1a3d !important;
  border-color: rgba(109,74,255,0.35) !important;
}
.usb-dock.dock-sepia .usb-video-surface > div:first-child { background-color: transparent !important; }
.usb-dock.dock-sepia .usb-video-surface [class*="text-violet-"] { color: #d4c9ff !important; }

/* Botones primarios deshabilitados: neutros y legibles, no lila lavado */
.usb-dock.usb-dock button:disabled[class*="bg-violet-"]:not([role="switch"]) {
  background-color: var(--usb-bg-4) !important;
  color: var(--usb-fg-lo) !important;
  opacity: 1 !important;
  box-shadow: none !important;
  border: 1px solid var(--usb-border) !important;
}

/* ════════════════════════════════════════════════════════════════
   §31. TEMA CLARO v3 "PAPEL" — neutro, aireado, violeta solo en acción
   Lienzo gris frío, cabecera y tarjetas blancas, tinta casi negra.
   El violeta se reserva a: CTA, selección, foco y datos vivos.
════════════════════════════════════════════════════════════════ */
.usb-dock.dock-sepia {
  --usb-bg-0: #eceef2;
  --usb-bg-1: #ffffff;
  --usb-bg-2: #f6f7f9;
  --usb-bg-3: #ffffff;
  --usb-bg-4: #eef0f4;
  --usb-bg-5: #ffffff;

  --usb-fg:     #14151f;
  --usb-fg-hi:  rgba(20,21,31,0.96);
  --usb-fg-mid: rgba(20,21,31,0.74);
  --usb-fg-lo:  rgba(20,21,31,0.68);
  --usb-fg-dim: rgba(20,21,31,0.38);

  --usb-border:     rgba(20,22,35,0.09);
  --usb-border-mid: rgba(20,22,35,0.16);
  --usb-divider:    rgba(20,22,35,0.06);

  --usb-accent:       #5b3df0;
  --usb-accent-2:     #4a2ed8;
  --usb-accent-soft:  rgba(91,61,240,0.07);
  --usb-accent-ring:  rgba(91,61,240,0.32);

  --usb-elev-1: 0 1px 0 rgba(20,22,35,0.03), 0 1px 3px rgba(20,22,35,0.06);
  --usb-elev-2: 0 1px 2px rgba(20,22,35,0.05), 0 12px 28px -12px rgba(20,22,35,0.18);
  --kx-mark: rgba(91,61,240,0.45);
  --kx-glow: rgba(91,61,240,0.05);
  --kinema-wordmark: #14151f;
  --kinema-signature: #6a6d7c;
}

/* Tintes violeta: sutiles. Selección = tinte 6 % + borde violeta */
.usb-dock.dock-sepia [class*="bg-violet-500/"],
.usb-dock.dock-sepia [class*="bg-violet-600/"],
.usb-dock.dock-sepia [class*="bg-violet-400/"] { background-color: rgba(91,61,240,0.06) !important; }
.usb-dock.dock-sepia [class*="border-violet-500/"],
.usb-dock.dock-sepia [class*="border-violet-400/"] { border-color: rgba(91,61,240,0.24) !important; }

/* Pestañas: pista neutra, píldora blanca flotante */
.usb-dock.dock-sepia .kx-seg { background: #eef0f4; box-shadow: none; padding: 3px; border-radius: 12px; }
.usb-dock.dock-sepia .kx-seg-pill {
  background: #fff; border-radius: 9px;
  box-shadow: 0 0 0 1px rgba(20,22,35,0.06), 0 2px 6px -1px rgba(20,22,35,0.12);
}

/* Tarjetas: borde de pelo + elevación suave, sin tinte */
.usb-dock.dock-sepia .rounded-xl.border[class*="bg-white"],
.usb-dock.dock-sepia .rounded-xl.border[class*="bg-[#fff"] { box-shadow: var(--usb-elev-1); }

/* Botón primario claro: sólido, sombra neutra */
.usb-dock.dock-sepia button[class*="bg-violet-600"]:not(:disabled):not([role="switch"]) {
  background-color: #5b3df0 !important;
  box-shadow: 0 1px 2px rgba(20,22,35,0.2), 0 6px 14px -6px rgba(91,61,240,0.55), inset 0 1px 0 rgba(255,255,255,0.18) !important;
}
.usb-dock.dock-sepia button[class*="bg-violet-600"]:not(:disabled):not([role="switch"]):hover { background-color: #4a2ed8 !important; }

/* Monitor: tinta neutra oscura, no violeta saturado */
.usb-dock.dock-sepia .usb-video-surface { background-color: #181a26 !important; border-color: rgba(20,22,35,0.25) !important; }

.usb-dock.dock-sepia .kx-sync {
  background-color: #fff !important;
  border-color: var(--usb-border) !important;
  box-shadow: var(--usb-elev-1);
}
.usb-dock.dock-sepia .kx-sync:hover { box-shadow: var(--usb-elev-2); border-color: rgba(91,61,240,0.30) !important; }
.usb-dock.dock-sepia .kx-sync > div:first-child > div:first-child {
  background-color: rgba(91,61,240,0.08) !important; border-color: transparent !important; color: #5b3df0;
}

/* Botones secundarios: blancos con borde y elevación (no rellenos grises) */
.usb-dock.dock-sepia button.border:is(.rounded-xl, .rounded-lg):not([class*="bg-violet"]):not([class*="bg-emerald"]):not([class*="bg-amber"]):not([class*="bg-rose"]):not([class*="bg-red"]):not(.kx-sync):not(.kx-seg *):not(.kx-choice) {
  background-color: #fff !important;
  border-color: var(--usb-border-mid) !important;
  color: var(--usb-fg) !important;
  box-shadow: var(--usb-elev-1);
}
.usb-dock.dock-sepia button.border:is(.rounded-xl, .rounded-lg):not([class*="bg-violet"]):not(:disabled):not(.kx-sync):not(.kx-choice):hover {
  border-color: rgba(91,61,240,0.45) !important;
  box-shadow: var(--usb-elev-2);
}

/* §32 Segunda pasada: escala tipográfica, tracking y superficies */
.usb-dock [class*="text-[9px]"] { font-size: 10.5px !important; }
.usb-dock [class*="text-[10px]"] { font-size: 11.5px !important; }
.usb-dock [class*="text-[11px]"] { font-size: 12.5px !important; }
.usb-dock [class*="text-[12px]"] { font-size: 13px !important; }
.usb-dock [class*="uppercase"][class*="tracking-"] { letter-spacing: 0.08em !important; }
.usb-dock { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-feature-settings: "cv11", "ss01"; }
.usb-dock .kx-display { letter-spacing: -0.025em; line-height: 1.12; }
.usb-dock.dock-sepia [class*="rounded-2xl"].border { box-shadow: var(--usb-elev-1); }
.usb-dock button.border:is(.rounded-xl,.rounded-lg) { transition: box-shadow var(--usb-dur) var(--usb-ease), border-color var(--usb-dur) var(--usb-ease), transform var(--usb-dur) var(--usb-ease); }
.usb-dock button.border:is(.rounded-xl,.rounded-lg):not(:disabled):hover { transform: translateY(-1px); }

/* §33 Luz: profundidad en capas, vidrio y acabados */
.usb-dock.dock-sepia {
  --usb-elev-1: 0 0 0 1px rgba(20,22,35,0.04), 0 1px 2px rgba(20,22,35,0.05), 0 4px 12px -4px rgba(20,22,35,0.06);
  --usb-elev-2: 0 0 0 1px rgba(91,61,240,0.10), 0 2px 4px rgba(20,22,35,0.05), 0 12px 28px -8px rgba(20,22,35,0.14);
}
.usb-dock.dock-sepia [class*="rounded-2xl"].border,
.usb-dock.dock-sepia [class*="rounded-xl"].border:not(button):not(input):not(textarea) {
  border-color: rgba(20,22,35,0.07) !important;
}
.usb-dock.dock-sepia input, .usb-dock.dock-sepia textarea {
  box-shadow: inset 0 1px 2px rgba(20,22,35,0.04);
  transition: box-shadow var(--usb-dur) var(--usb-ease), border-color var(--usb-dur) var(--usb-ease);
}
.usb-dock.dock-sepia input:focus, .usb-dock.dock-sepia textarea:focus {
  outline: none !important;
  border-color: rgba(91,61,240,0.55) !important;
  box-shadow: 0 0 0 4px rgba(91,61,240,0.12), inset 0 1px 2px rgba(20,22,35,0.03);
}
.usb-dock.dock-sepia ::selection { background: rgba(91,61,240,0.18); }
.usb-dock.dock-sepia ::-webkit-scrollbar { width: 8px; }
.usb-dock.dock-sepia ::-webkit-scrollbar-thumb { background: rgba(20,22,35,0.14); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
.usb-dock.dock-sepia ::-webkit-scrollbar-thumb:hover { background: rgba(20,22,35,0.26); background-clip: content-box; border: 2px solid transparent; }

/* Primario: brillo que barre al pasar el cursor (monocromo, sin degradado de dos tonos) */
.usb-dock button[class*="bg-violet-600"]:not(:disabled):not(.absolute):not(.fixed):not(.sticky) { position: relative; overflow: hidden; isolation: isolate; }
.usb-dock button[class*="bg-violet-600"]:not(:disabled):not(.absolute):not(.fixed):not(.sticky)::after {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%);
  transform: translateX(-120%); transition: transform 0.7s var(--usb-ease);
}
.usb-dock button[class*="bg-violet-600"]:not(:disabled):not(.absolute):not(.fixed):not(.sticky):hover::after { transform: translateX(120%); }

/* Entrada escalonada del contenido de cada pestaña */
@keyframes usb-stagger { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: none; } }
.usb-dock .overflow-y-auto > * { animation: usb-stagger .55s var(--usb-ease) backwards; }
.usb-dock .overflow-y-auto > *:nth-child(2) { animation-delay: 50ms; }
.usb-dock .overflow-y-auto > *:nth-child(3) { animation-delay: 100ms; }
.usb-dock .overflow-y-auto > *:nth-child(4) { animation-delay: 150ms; }
.usb-dock .overflow-y-auto > *:nth-child(5) { animation-delay: 200ms; }
.usb-dock .overflow-y-auto > *:nth-child(n+6) { animation-delay: 250ms; }

/* Punto de estado: latido suave */
@keyframes usb-breathe { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.45); } 50% { box-shadow: 0 0 0 5px rgba(16,185,129,0); } }
.usb-dock .bg-emerald-400.rounded-full.h-2 { animation: usb-breathe 2.4s ease-in-out infinite; }

/* Foco visible con anillo animado */
@keyframes usb-ring { from { box-shadow: 0 0 0 0 rgba(109,74,255,0.5); } to { box-shadow: 0 0 0 4px rgba(109,74,255,0.22); } }
.usb-dock button:focus-visible, .usb-dock [role=tab]:focus-visible { outline: none; animation: usb-ring .25s var(--usb-ease) forwards; }

@media (prefers-reduced-motion: reduce) {
  .usb-dock .overflow-y-auto > *, .usb-dock .bg-emerald-400.rounded-full.h-2 { animation: none !important; }
  .usb-dock button[class*="bg-violet-600"]::after { display: none; }
}

/* Selección tipo tarjeta (aria-pressed) */
.usb-dock.dock-sepia.dock-sepia button.border[aria-pressed="true"]:is(.rounded-xl,.rounded-lg):not(.x):not(.y):not(.z):not(.w):not(.v):not(.u) {
  border-color: var(--usb-accent) !important;
  box-shadow: 0 0 0 3px var(--usb-accent-soft), var(--usb-elev-1) !important;
}

/* ════════════════════════════════════════════════════════════════
   VIDA — color, profundidad y movimiento (ambos temas)
════════════════════════════════════════════════════════════════ */
@keyframes kx-float { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-6px) rotate(8deg); } }
@keyframes kx-twinkle { 0%,100% { opacity: .35; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.1); } }
@keyframes kx-ring-pulse { 0% { transform: scale(.9); opacity: .55; } 100% { transform: scale(1.35); opacity: 0; } }
@keyframes kx-live { 0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,.55); } 50% { box-shadow: 0 0 0 5px rgba(255,255,255,0); } }
@keyframes kx-sweep { from { transform: translateX(-120%) skewX(-18deg); } to { transform: translateX(380%) skewX(-18deg); } }

/* Resplandor ambiental detrás del contenido - eliminado para limpieza visual absoluta */
.usb-dock .flex-1.overflow-hidden.relative.min-h-0 {
  background-image: none !important;
}
.usb-dock.dock-sepia .flex-1.overflow-hidden.relative.min-h-0 {
  background-image: none !important;
}

/* Hero sólido de marca */
.usb-dock .kx-hero-solid {
  background: #6d4aff !important;
  box-shadow: 0 10px 22px -12px rgba(109,74,255,0.55), inset 0 1px 0 rgba(255,255,255,0.2) !important;
  isolation: isolate;
}
.usb-dock .kx-hero-solid::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 28%;
  background: rgba(255,255,255,0.10); pointer-events: none; z-index: 0;
  transform: translateX(-120%) skewX(-18deg); animation: kx-sweep 5.5s ease-in-out 1.2s infinite;
}
.usb-dock .kx-hero-solid .kx-hero-t1 { color: #fff !important; }
.usb-dock .kx-hero-solid .kx-hero-t2 { color: #e4dcff !important; }
.usb-dock .kx-hero-solid .kx-hero-chip {
  background: rgba(255,255,255,0.16) !important; color: #fff !important;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.22);
}
.usb-dock .kx-hero-solid .kx-hero-chip * { color: inherit !important; }
.usb-dock .kx-live-dot { width: 6px; height: 6px; border-radius: 999px; background: #86efac; animation: kx-live 2s ease-in-out infinite; }
.usb-dock .kx-ring {
  position: absolute; border-radius: 999px; border: 1.5px solid rgba(255,255,255,0.22); pointer-events: none; z-index: 0;
}
.usb-dock .kx-ring-1 { width: 150px; height: 150px; right: -44px; top: -56px; }
.usb-dock .kx-ring-2 { width: 96px; height: 96px; right: -14px; top: -26px; border-color: rgba(255,255,255,0.32); animation: kx-ring-pulse 3.6s ease-out infinite; }
.usb-dock .kx-spark { position: absolute; z-index: 0; color: #e4dcff !important; pointer-events: none; }
.usb-dock .kx-spark-a { right: 26px; top: 46px; animation: kx-float 4.2s ease-in-out infinite; }
.usb-dock .kx-spark-b { right: 74px; top: 74px; animation: kx-twinkle 2.6s ease-in-out infinite; }
.usb-dock .kx-spark-c { right: 16px; top: 88px; animation: kx-twinkle 3.2s ease-in-out .8s infinite; }
.usb-dock .kx-hero-solid > .relative { z-index: 1; }

/* Pestaña activa: violeta sólido */
.usb-dock .kx-seg .kx-seg-pill,
.usb-dock.dock-sepia .kx-seg .kx-seg-pill {
  background: #6d4aff !important; border-radius: 9px;
  box-shadow: 0 3px 8px -3px rgba(109,74,255,0.55), inset 0 1px 0 rgba(255,255,255,0.22) !important;
}
.usb-dock .kx-seg .kx-tab-on, .usb-dock.dock-sepia .kx-seg .kx-tab-on { color: #fff !important; }

/* Etiquetas de sección con color de marca */
.usb-dock p.uppercase[class*="tracking-"]:not(.kx-step-eyebrow) { color: var(--usb-accent) !important; font-weight: 700; }

/* Campos: foco con halo de marca */
.usb-dock input:not([type=checkbox]):not([type=range]), .usb-dock textarea { transition: border-color .2s, box-shadow .2s, background-color .2s; }
.usb-dock input:not([type=checkbox]):not([type=range]):focus, .usb-dock textarea:focus {
  border-color: var(--usb-accent) !important; box-shadow: 0 0 0 3px var(--usb-accent-soft), 0 6px 16px -8px var(--usb-accent-ring) !important; outline: none;
}

/* Botones y tarjetas: respuesta táctil */
.usb-dock button { transition: transform .18s var(--usb-ease), box-shadow .2s, background-color .2s, border-color .2s, color .2s; }
.usb-dock button:not(:disabled):active { transform: scale(.97); }
.usb-dock button.border:is(.rounded-xl,.rounded-lg):not(:disabled):not(.kx-sync):not(.kx-choice):hover {
  transform: translateY(-2px); border-color: var(--usb-accent-ring) !important;
  box-shadow: 0 10px 22px -12px var(--usb-accent-ring) !important;
}
.usb-dock button:hover > svg { transform: scale(1.08) rotate(-3deg); transition: transform .25s var(--usb-ease); }

@media (prefers-reduced-motion: reduce) {
  .usb-dock .kx-hero-solid::after, .usb-dock .kx-ring-2, .usb-dock .kx-spark, .usb-dock .kx-live-dot { animation: none !important; }
}

/* ════════════════════════════════════════════════════════════════
   COLOR POR PASO — cada paso del flujo de estudio tiene su tono
════════════════════════════════════════════════════════════════ */
@keyframes kx-pop { 0% { transform: scale(.85) rotate(-6deg); opacity: 0; } 60% { transform: scale(1.06) rotate(2deg); opacity: 1; } 100% { transform: none; } }
@keyframes kx-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }

.usb-dock .kx-step-banner {
  background-color: color-mix(in srgb, var(--kx-step, #7c5cff) 14%, var(--usb-bg-3)) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--kx-step, #7c5cff) 30%, transparent), 0 1px 2px rgba(20,18,40,.06);
  transition: background-color .35s, box-shadow .35s;
}
.usb-dock .kx-step-bignum {
  position: absolute; right: 10px; top: -14px; font-size: 76px; line-height: 1; font-weight: 900; letter-spacing: -0.06em;
  color: var(--kx-step, #7c5cff); opacity: .14; pointer-events: none; user-select: none;
}
.usb-dock .kx-step-tile {
  background: var(--kx-step, #7c5cff) !important; color: #fff !important;
  box-shadow: 0 4px 10px -4px color-mix(in srgb, var(--kx-step, #7c5cff) 70%, transparent), inset 0 1px 0 rgba(255,255,255,.3);
  animation: kx-pop .5s var(--usb-ease) both, kx-bob 3.4s ease-in-out .6s infinite;
}
.usb-dock .kx-step-tile * { color: #fff !important; }
.usb-dock .kx-step-eyebrow { color: var(--kx-ink, var(--usb-accent)) !important; }
.usb-dock .kx-step-title { color: var(--usb-fg) !important; }
.usb-dock .kx-step-sub { color: var(--usb-fg-mid) !important; }
.usb-dock .kx-next { color: var(--kx-ink, var(--usb-accent)) !important; font-weight: 700; }
.usb-dock .kx-next:hover { background: color-mix(in srgb, var(--kx-step, #7c5cff) 14%, transparent) !important; }
.usb-dock .kx-step-num {
  background: color-mix(in srgb, var(--kx-step, #7c5cff) 20%, transparent) !important;
  border-color: color-mix(in srgb, var(--kx-step, #7c5cff) 55%, transparent) !important;
  color: var(--kx-ink, var(--usb-accent)) !important;
}

@media (prefers-reduced-motion: reduce) {
  .usb-dock .kx-step-tile { animation: none !important; }
}

.usb-dock .kx-check-off { border: 1.5px solid color-mix(in srgb, var(--kx-step, #0ea5e9) 70%, transparent) !important; background: color-mix(in srgb, var(--kx-step, #0ea5e9) 8%, transparent); }
.usb-dock .kx-check-on { background: #10b981 !important; border-color: #10b981 !important; color: #fff !important; box-shadow: 0 4px 10px -3px rgba(16,185,129,.6); }
.usb-dock .kx-check-on *, .usb-dock .kx-on-solid, .usb-dock .kx-on-solid * { color: #fff !important; }
.usb-dock .kx-gen-tile { background: #6d4aff !important; color: #fff !important; box-shadow: 0 8px 18px -8px rgba(109,74,255,.6), inset 0 1px 0 rgba(255,255,255,.3); animation: kx-bob 2.2s ease-in-out infinite; }
.usb-dock .kx-gen-tile * { color: #fff !important; }

/* ── CONTRASTE: ajustes de auditoría (AA) ── */
.usb-dock .kx-solid-btn { background: #6d4aff !important; box-shadow: 0 4px 10px -4px rgba(109,74,255,.5); }
.usb-dock .kx-solid-btn:hover { background: #5b38f0 !important; }
.usb-dock .kx-hero-solid .kx-hero-chip { background: rgba(24,10,96,0.30) !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18); }
.usb-dock .kx-hero-solid .kx-hero-t2 { color: #f4f0ff !important; }
.usb-dock.dock-sepia [class*="text-slate-400"] { color: rgba(26,25,24,0.70) !important; }
.usb-dock.dock-sepia [class*="text-sky-400"] { color: #0369a1 !important; }

/* ── FLUJO DE ESTUDIO: rediseño de tarjetas ── */
.usb-dock .kx-card { position: relative; box-shadow: 0 1px 2px rgba(0,0,0,.10), 0 8px 20px -14px rgba(0,0,0,.35); }
.usb-dock.dock-sepia .kx-card { box-shadow: 0 1px 2px rgba(60,40,10,.06), 0 10px 22px -16px rgba(60,40,10,.22); }
.usb-dock .kx-card::before { content: ""; position: absolute; left: 14px; right: 14px; top: 0; height: 3px; border-radius: 0 0 4px 4px; background: var(--kx-step, #6d4aff); opacity: .9; pointer-events: none; }
.usb-dock .kx-card-flat { background: var(--usb-bg-3); box-shadow: inset 0 0 0 1px var(--usb-border); }
.usb-dock .kx-cta, .usb-dock.dock-sepia .kx-cta { background: var(--kx-btn, #6d4aff) !important; color: #fff !important; font-weight: 700; box-shadow: 0 6px 14px -8px var(--kx-btn, #6d4aff); }
.usb-dock .kx-cta:hover { filter: brightness(1.08); }
.usb-dock .kx-cta, .usb-dock.dock-sepia .kx-cta, .usb-dock .kx-cta *, .usb-dock.dock-sepia .kx-cta * { color: #fff !important; }
.usb-dock.dock-sepia .kx-step-solid {
  background: var(--usb-bg-3, #ffffff) !important;
  border: 1px solid var(--usb-border, rgba(0,0,0,0.1)) !important;
  box-shadow: 0 4px 12px -4px rgba(0,0,0,0.06) !important;
}
.usb-dock.dock-sepia .kx-step-solid * {
  color: var(--usb-fg-hi, #1a1918) !important;
}
.usb-dock.dock-sepia .kx-step-solid [class*="text-emerald"] {
  color: #059669 !important;
}
.usb-dock.dock-sepia .kx-step-solid [class*="text-violet"] {
  color: #6d4aff !important;
}
.usb-dock.dock-sepia .kx-step-solid [class*="text-white/"] {
  color: var(--usb-fg-lo, #71717a) !important;
}
.usb-dock .kx-step-solid {
  background: var(--usb-accent, #6d4aff) !important;
  box-shadow: 0 10px 22px -14px var(--usb-accent, #6d4aff), inset 0 1px 0 rgba(255,255,255,.2);
}
.usb-dock .kx-step-solid, .usb-dock .kx-step-solid * { color: #fff !important; }
.usb-dock .kx-step-count { background: color-mix(in srgb, var(--kx-step, #6d4aff) 14%, transparent); color: var(--kx-ink, var(--usb-accent)) !important; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--kx-step, #6d4aff) 30%, transparent); }
.usb-dock .kx-nav-btn:not(:disabled):hover { background: color-mix(in srgb, var(--kx-step, #6d4aff) 12%, transparent) !important; }
.usb-dock .kx-row-on { background: color-mix(in srgb, var(--kx-step, #6d4aff) 10%, transparent) !important; border-color: color-mix(in srgb, var(--kx-step, #6d4aff) 45%, transparent) !important; }
.usb-dock .kx-row { transition: background-color .2s, border-color .2s, transform .18s var(--usb-ease); }


/* ── PANTALLA DE OBJETIVO + CARGA: color ── */
@keyframes kx-orbit { to { transform: rotate(360deg); } }
.usb-dock .kx-orbit { animation: kx-orbit 9s linear infinite; }
.usb-dock .kx-orbit-ring { border: 1.5px dashed color-mix(in srgb, var(--usb-accent) 35%, transparent); }
.usb-dock .kx-obj-tile, .usb-dock.dock-sepia .kx-obj-tile {
  background: color-mix(in srgb, var(--kx-step, var(--usb-accent)) 10%, var(--usb-bg-3)) !important;
  box-shadow: none !important;
  border: 1px solid color-mix(in srgb, var(--kx-step, var(--usb-accent)) 22%, var(--usb-border)) !important;
  color: var(--kx-ink, var(--usb-accent)) !important;
}
.usb-dock .kx-obj-tile *, .usb-dock.dock-sepia .kx-obj-tile * { color: var(--kx-ink, var(--usb-accent)) !important; }
.usb-dock .kx-obj-sub { color: var(--usb-fg-lo) !important; }
.usb-dock .kx-obj[data-on="1"] {
  background: color-mix(in srgb, var(--kx-step, var(--usb-accent)) 8%, var(--usb-bg-3)) !important;
  border-color: var(--kx-step, var(--usb-accent)) !important;
  box-shadow: 0 4px 14px -6px color-mix(in srgb, var(--kx-step, var(--usb-accent)) 40%, transparent) !important;
  transform: none !important;
}
.usb-dock .kx-obj[data-on="1"] .kx-obj-tile { 
  background: color-mix(in srgb, var(--kx-step, var(--usb-accent)) 18%, var(--usb-bg-3)) !important; 
  border-color: var(--kx-step, var(--usb-accent)) !important;
  color: var(--kx-ink, var(--usb-accent)) !important; 
}
.usb-dock .kx-obj[data-on="1"] .kx-obj-tile * { color: var(--kx-ink, var(--usb-accent)) !important; }
.usb-dock .kx-obj-check, .usb-dock.dock-sepia .kx-obj-check { background: var(--kx-step, var(--usb-accent)) !important; }
.usb-dock .kx-obj-check, .usb-dock .kx-obj-check *, .usb-dock.dock-sepia .kx-obj-check * { color: #fff !important; }
.usb-dock .kx-field:focus { border-color: var(--usb-accent) !important; }
.usb-dock .kx-ok-strip { background: color-mix(in srgb, #10b981 11%, var(--usb-bg-3)); box-shadow: inset 0 0 0 1px color-mix(in srgb, #10b981 34%, transparent); }
.usb-dock .kx-ok-tile { background: #059669; }
.usb-dock .kx-ok-tile, .usb-dock .kx-ok-tile *, .usb-dock.dock-sepia .kx-ok-tile, .usb-dock.dock-sepia .kx-ok-tile * { color: #fff !important; }
.usb-dock .kx-ok-pill { background: color-mix(in srgb, #10b981 18%, transparent); color: #34d399 !important; }
.usb-dock.dock-sepia .kx-ok-pill { color: #047857 !important; }
.usb-dock .kx-gen-cta, .usb-dock.dock-sepia .kx-gen-cta { background: #6d4aff !important; color: #fff !important; box-shadow: 0 12px 24px -12px rgba(109,74,255,.85), inset 0 1px 0 rgba(255,255,255,.25); }
.usb-dock .kx-gen-cta *, .usb-dock.dock-sepia .kx-gen-cta * { color: #fff !important; }
.usb-dock .kx-gen-cta:hover:not(:disabled) { background: #5b38f0 !important; }
.usb-dock .kx-gen-cta:disabled, .usb-dock.dock-sepia .kx-gen-cta:disabled { background: var(--usb-bg-4, rgba(128,128,128,.18)) !important; box-shadow: none; }
.usb-dock .kx-gen-cta:disabled, .usb-dock .kx-gen-cta:disabled *, .usb-dock.dock-sepia .kx-gen-cta:disabled, .usb-dock.dock-sepia .kx-gen-cta:disabled * { color: var(--usb-fg-lo) !important; }
.usb-dock .kx-gen-row { background: var(--usb-bg-3); box-shadow: inset 0 0 0 1px var(--usb-border); color: var(--usb-fg-mid); transition: background-color .4s, box-shadow .4s; }
.usb-dock .kx-gen-row .kx-gen-ico { background: color-mix(in srgb, var(--kx-step) 14%, transparent); color: var(--kx-ink); }
.usb-dock .kx-gen-row[data-st="now"] { background: color-mix(in srgb, var(--kx-step) 13%, var(--usb-bg-3)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--kx-step) 55%, transparent); color: var(--usb-fg); }
.usb-dock .kx-gen-row[data-st="done"] { color: var(--usb-fg); }
.usb-dock .kx-gen-row[data-st="done"] .kx-gen-ico { background: var(--kx-btn); }
.usb-dock .kx-gen-row[data-st="done"] .kx-gen-ico, .usb-dock .kx-gen-row[data-st="done"] .kx-gen-ico *, .usb-dock.dock-sepia .kx-gen-row[data-st="done"] .kx-gen-ico * { color: #fff !important; }
.usb-dock .kx-gen-row .kx-gen-ico *, .usb-dock.dock-sepia .kx-gen-row .kx-gen-ico * { color: inherit !important; }
@media (prefers-reduced-motion: reduce) { .usb-dock .kx-orbit { animation: none; } }


/* ── ESTUDIO: escala tipográfica, radios y contraste consistentes ── */
.usb-dock .kx-study [class*="text-[8px]"], .usb-dock .kx-study [class*="text-[9px]"] { font-size: 10.5px !important; }
.usb-dock .kx-study [class*="text-[9.5px]"] { font-size: 11px !important; }
.usb-dock .kx-study [class*="text-[10px]"]:not(.kx-step-eyebrow):not(.kx-step-count) { font-size: 11px !important; }
.usb-dock .kx-study [class*="text-[11px]"] { font-size: 12px !important; }
.usb-dock .kx-study [class*="text-[12px]"]:not(.kx-hero-t2) { font-size: 13px !important; }
.usb-dock .kx-study .kx-hero-solid [class*="text-["] { font-size: revert-layer; }
.usb-dock .kx-study .rounded-xl { border-radius: 14px; }
.usb-dock .kx-study .rounded-lg { border-radius: 11px; }
.usb-dock .kx-study input:not([type=checkbox]):not([type=range]), .usb-dock .kx-study textarea { line-height: 1.5; }
.usb-dock .kx-study .kx-card-flat, .usb-dock .kx-study .kx-card { border-radius: 16px; }
/* contraste mínimo del texto atenuado en oscuro */
.usb-dock:not(.dock-sepia) .kx-study [class*=" text-white/1"]:not(input):not(textarea), .usb-dock:not(.dock-sepia) .kx-study [class^="text-white/1"]:not(input):not(textarea), .usb-dock:not(.dock-sepia) .kx-study [class*=" text-white/2"]:not(input):not(textarea), .usb-dock:not(.dock-sepia) .kx-study [class^="text-white/2"]:not(input):not(textarea) { color: rgba(255,255,255,.52) !important; }
.usb-dock:not(.dock-sepia) .kx-study [class*=" text-white/3"]:not(input):not(textarea), .usb-dock:not(.dock-sepia) .kx-study [class^="text-white/3"]:not(input):not(textarea) { color: rgba(255,255,255,.62) !important; }
.usb-dock:not(.dock-sepia) .kx-study [class*=" text-white/4"]:not(input):not(textarea), .usb-dock:not(.dock-sepia) .kx-study [class^="text-white/4"]:not(input):not(textarea) { color: rgba(255,255,255,.70) !important; }


/* ── RESPONSIVE: medida de lectura estándar (contenido centrado, máx. 640px) ── */
.usb-dock .kx-page > *, .usb-dock .kx-study > :not(.sticky) { width: 100%; max-width: 640px; margin-left: auto; margin-right: auto; }
.usb-dock .kx-study.p-4 > * { max-width: 608px; }
.usb-dock .kx-study > .sticky > * { max-width: 608px; margin-left: auto; margin-right: auto; }
.usb-dock .kx-study.flex.flex-col { align-items: center; }
.usb-dock .kx-study.flex.flex-col > * { max-width: 420px; }

/* ── ELEGANCIA: jerarquía, superficies y ritmo ── */
.usb-dock .kx-study { letter-spacing: -0.003em; }
.usb-dock .kx-study h1, .usb-dock .kx-study h2, .usb-dock .kx-study h3,
.usb-dock .kx-study .kx-step-title, .usb-dock .kx-study .kx-hero-t1 { letter-spacing: -0.02em; }
.usb-dock .kx-card, .usb-dock .kx-card-flat { border-color: color-mix(in srgb, var(--usb-border) 70%, transparent) !important; }
.usb-dock .kx-study .kx-card { background: var(--usb-bg-3); }
.usb-dock .kx-card::before { left: 22px; right: 22px; height: 2px; opacity: .75; }
.usb-dock .kx-step-banner { border-radius: 20px; padding: 14px 16px; }
.usb-dock .kx-step-banner .kx-step-title { font-size: 15.5px !important; }
.usb-dock .kx-step-tile { border-radius: 16px; }
.usb-dock .kx-hero-solid { border-radius: 22px !important; }
.usb-dock .kx-obj { border-radius: 18px !important; }
.usb-dock .kx-gen-cta, .usb-dock .kx-cta { border-radius: 16px !important; letter-spacing: 0; }
.usb-dock .kx-cta { box-shadow: 0 10px 20px -12px var(--kx-btn, #6d4aff), inset 0 1px 0 rgba(255,255,255,.18); }
.usb-dock .kx-study input:not([type=checkbox]):not([type=range]), .usb-dock .kx-study textarea { border-radius: 14px; background: var(--usb-bg-3) !important; }
.usb-dock .kx-study .kx-card input, .usb-dock .kx-study .kx-card textarea { background: color-mix(in srgb, var(--usb-fg) 4%, transparent) !important; }
.usb-dock .kx-study .kx-row { border-radius: 14px; }
.usb-dock .kx-study [class*="uppercase"][class*="tracking-"] { letter-spacing: 0.1em; }
@media (min-width: 0px) { .usb-dock .kx-study .grid-cols-5 { gap: 10px; } }


/* ── STUDY v3: stepper de nodos sobrio, consistente y elegante ── */
.usb-dock .kx-node-line {
  position: absolute;
  top: 13px;
  right: 50%;
  width: 100%;
  height: 2px;
  border-radius: 2px;
  background: var(--usb-border, rgba(128,128,128,.2));
  z-index: 0;
  transition: background-color .3s;
}
.usb-dock .kx-node-line[data-on="1"] {
  background: var(--usb-accent, #6d4aff);
}
.usb-dock .kx-node {
  transition: transform .25s var(--usb-ease), background-color .25s, border-color .25s, box-shadow .25s;
}
.usb-dock .kx-node[data-st="todo"] {
  background: var(--usb-bg-3);
  color: var(--usb-fg-lo) !important;
  border: 1.5px solid var(--usb-border);
}
.usb-dock .kx-node[data-st="todo"] * {
  color: var(--usb-fg-lo) !important;
}
.usb-dock .kx-node[data-st="done"] {
  background: var(--usb-bg-3);
  border: 1.5px solid var(--usb-accent, #6d4aff);
  color: var(--usb-accent, #6d4aff) !important;
}
.usb-dock .kx-node[data-st="done"] * {
  color: var(--usb-accent, #6d4aff) !important;
}
.usb-dock .kx-node[data-st="cur"] {
  background: var(--usb-accent, #6d4aff);
  color: #fff !important;
  border: 1.5px solid var(--usb-accent, #6d4aff);
  transform: scale(1.1);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--usb-accent, #6d4aff) 24%, transparent);
}
.usb-dock .kx-node[data-st="cur"] * {
  color: #fff !important;
}

.usb-dock .kx-step-bignum { display: none; }
.usb-dock .kx-step-banner, .usb-dock.dock-sepia .kx-step-banner {
  background-color: color-mix(in srgb, var(--kx-step, #7c5cff) 9%, var(--usb-bg-3)) !important;
  box-shadow: none !important; border-radius: 22px; padding: 16px;
}
.usb-dock .kx-step-tile { width: 48px; height: 48px; border-radius: 16px; animation: kx-pop .5s var(--usb-ease) both; }
.usb-dock .kx-step-banner .kx-step-title { font-size: 16px !important; font-weight: 800; }
.usb-dock .kx-step-banner .kx-step-sub { font-size: 12.5px !important; }

.usb-dock .kx-card::before { display: none; }
.usb-dock .kx-card, .usb-dock.dock-sepia .kx-card {
  border: none !important; border-radius: 22px;
  box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 12px 28px -20px rgba(0,0,0,.5);
}
.usb-dock.dock-sepia .kx-card { box-shadow: 0 0 0 1px rgba(40,30,80,.06), 0 14px 30px -22px rgba(60,40,140,.35); }
.usb-dock .kx-row { border-radius: 16px !important; }
.usb-dock .kx-obj { border-radius: 20px !important; }
.usb-dock .kx-card-flat { border-radius: 16px; box-shadow: none; }
.usb-dock .kx-study .kx-card-flat { background: color-mix(in srgb, var(--usb-fg) 4%, transparent); }


/* CAPTIONS — consistencia con Study */
.usb-dock .kx-chip { background: color-mix(in srgb, var(--usb-fg) 7%, transparent); color: var(--usb-fg-mid); font-weight: 600; transition: background .15s, color .15s; }
.usb-dock .kx-chip:hover:not(:disabled) { background: var(--usb-accent-soft); color: var(--usb-fg); }
.usb-dock .kx-tile-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 76px; border-radius: 20px; background: var(--usb-bg-3); color: var(--usb-fg); font-size: 12px; font-weight: 600; box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 12px 28px -20px rgba(0,0,0,.5); transition: transform .15s, background .15s; }
.usb-dock.dock-sepia .kx-tile-btn { background: #fff; box-shadow: 0 0 0 1px rgba(40,30,80,.06), 0 14px 30px -22px rgba(60,40,140,.35); }
.usb-dock .kx-tile-btn svg { color: var(--usb-accent); }
.usb-dock .kx-tile-btn:hover { transform: translateY(-1px); background: var(--usb-accent-soft); }
.usb-dock.dock-sepia .kx-tile-btn:hover { background: color-mix(in srgb, #6d4aff 7%, #fff); }
.usb-dock .kx-toggle[data-on="1"] { background: color-mix(in srgb, #6d4aff 12%, var(--usb-bg-3)); }
.usb-dock.dock-sepia .kx-toggle[data-on="1"] { background: color-mix(in srgb, #6d4aff 8%, #fff); }
.usb-dock .kx-cap { letter-spacing: -0.003em; }
.usb-dock .kx-cap .kx-slate { font-family: inherit; text-transform: none; letter-spacing: 0; font-size: 12px; font-weight: 700; }
.usb-dock .kx-cap [class*="text-[9px]"] { font-size: 10.5px !important; }
.usb-dock .kx-cap [class*="text-[10px]"]:not(.kx-slate) { font-size: 11px !important; }
.usb-dock .kx-cap [class*="text-[11px]"]:not(textarea) { font-size: 12px !important; }
.usb-dock .kx-cap .rounded-lg { border-radius: 12px; }
.usb-dock .kx-cap .kx-card { border-radius: 20px; }


/* OVERLAY */
.usb-dock .kx-tile-btn[data-on="1"], .usb-dock.dock-sepia .kx-tile-btn[data-on="1"] { background: #6d4aff !important; box-shadow: 0 8px 18px -10px #6d4aff; }
.usb-dock .kx-tile-btn.kx-choice { box-shadow: none; transform: none !important; }
.usb-dock.dock-sepia .kx-tile-btn.kx-choice { background: #fff; border-color: rgba(21,22,28,.12) !important; }
.usb-dock .kx-tile-btn[data-on="1"], .usb-dock .kx-tile-btn[data-on="1"] *, .usb-dock.dock-sepia .kx-tile-btn[data-on="1"], .usb-dock.dock-sepia .kx-tile-btn[data-on="1"] * { color: #fff !important; }
.usb-dock .kx-ov-top > * { max-width: 608px; margin-left: auto; margin-right: auto; }
.usb-dock .kx-ov-top .rounded-xl { border-radius: 16px; }

/* HISTORIAL / DEV — mosaicos planos dentro de tarjetas */
.usb-dock .kx-cap .kx-card .kx-card-flat { background: color-mix(in srgb, var(--usb-fg) 5%, transparent); box-shadow: none; }

/* ── Notifications (sonner) — same card language as the rest of the dock ── */
.usb-dock [data-sonner-toaster] { --width: 344px; font-family: inherit; }
.usb-dock [data-sonner-toast] {
  --tone: #6d4aff;
  position: relative; overflow: hidden; align-items: center; gap: 12px;
  padding: 12px 14px !important; border-radius: 16px !important;
  background: var(--usb-bg-3) !important; border: 1px solid var(--usb-border) !important;
  box-shadow: 0 1px 2px rgba(0,0,0,.10), 0 14px 28px -14px rgba(0,0,0,.45) !important;
  color: var(--usb-fg-hi) !important;
}
.usb-dock.dock-sepia [data-sonner-toast] { box-shadow: 0 1px 2px rgba(60,40,10,.06), 0 14px 28px -16px rgba(60,40,10,.28) !important; }
.usb-dock [data-sonner-toast][data-type="success"] { --tone: #059669; }
.usb-dock [data-sonner-toast][data-type="warning"] { --tone: #d97706; }
.usb-dock [data-sonner-toast][data-type="error"] { --tone: #e11d48; }
.usb-dock [data-sonner-toast]::before {
  content: ""; position: absolute; left: 14px; right: 14px; top: 0; height: 2px;
  border-radius: 0 0 4px 4px; background: var(--tone); opacity: .85; pointer-events: none;
}
.usb-dock [data-sonner-toast] [data-icon] {
  width: 32px !important; height: 32px !important; margin: 0 !important; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; border-radius: 12px;
  background: color-mix(in srgb, var(--tone) 18%, var(--usb-bg-3));
  border: 1px solid color-mix(in srgb, var(--tone) 40%, var(--usb-border));
  color: var(--tone);
}
.usb-dock [data-sonner-toast] [data-icon] > div { display: flex; padding: 0 !important; background: none !important; border: 0 !important; box-shadow: none !important; }
.usb-dock [data-sonner-toast] [data-icon] svg { width: 17px !important; height: 17px !important; color: inherit !important; animation: none !important; }
.usb-dock [data-sonner-toast] [data-title] { font-size: 12.5px; font-weight: 700; letter-spacing: -0.01em; color: var(--usb-fg-hi) !important; line-height: 1.3; }
.usb-dock [data-sonner-toast] [data-description] { font-size: 11.5px; font-weight: 500; line-height: 1.4; color: var(--usb-fg-mid) !important; }
.usb-dock [data-sonner-toast] [data-close-button] { background: var(--usb-bg-2); border-color: var(--usb-border); color: var(--usb-fg-mid); }
.usb-dock .kx-celebrate-tile svg { color: inherit !important; }
`;

/** @deprecated Use THEME_CSS — kept for backward-compat */
export const SEPIA_CSS = THEME_CSS;
