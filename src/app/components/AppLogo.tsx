import React from "react";
import { motion } from "motion/react";
import { useDockTheme } from "../contexts/ThemeContext";

/**
 * AppLogo v6 — "Signal"
 *
 * Diseño minimalista premium. Un solo arco, dos líneas limpias, un nodo focal.
 * Filosofía: cada elemento justifica su existencia.
 *
 * Cambios respecto a v5:
 * ✓ Arco único (eliminado el arco interior).
 * ✓ Sin flecha en la línea EN — la partícula indica dirección.
 * ✓ Sin líneas contextuales secundarias.
 * ✓ Paleta más profunda y sofisticada (índigo oscuro → violeta → cielo).
 * ✓ Nodo ligeramente más pequeño y refinado.
 * ✓ Partícula con curva de aceleración cúbica (más orgánica).
 * ✓ Contenedor con iluminación ambiental más contenida.
 * ✓ Proporción del icono aumentada al 70% (más presencia).
 */
export function AppLogo({
  className = "",
  size = 24,
  iconOnly = false,
}: {
  className?: string;
  size?: number;
  iconOnly?: boolean;
}) {
  const uid = React.useId().replace(/:/g, "u");
  const shouldAnimate = !iconOnly && size >= 24;

  // useDockTheme uses useContext with a default value — always safe, returns dark defaults
  // when rendered outside ThemeProvider (e.g. in App.tsx mock preview).
  const { isSepia } = useDockTheme();

  // EN subtitle line: white on dark bg, warm dark on light bg
  const enLineColor  = isSepia ? "#3d3a38" : "#EFF6FF";
  const enLineOpacity = isSepia ? 0.70 : 0.82;
  // Paragraph indicators
  const parLineColor = isSepia ? "#3d3a38" : "#EFF6FF";
  const parLineOpacity1 = isSepia ? 0.22 : 0.18;
  // Node core: white on dark, violet on light
  const nodeCoreColor = isSepia ? "#7c3aed" : "#FFFFFF";
  // Particle start color
  const particleStart = isSepia ? "#4a4744" : "#EFF6FF";

  const icon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={iconOnly ? className : "relative z-10 w-full h-full"}
      style={iconOnly ? { width: size, height: size, display: "block" } : { display: "block" }}
    >
      <defs>
        {/* Arco: índigo profundo → violeta → cielo */}
        <linearGradient id={`${uid}-arc`} x1="3.5" y1="2.5" x2="20.5" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#4C1D95" />
          <stop offset="45%"  stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>

        {/* Línea ES: violeta suave → cian */}
        <linearGradient id={`${uid}-es`} x1="14" y1="15" x2="22.5" y2="15" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>

        {/* Halo del nodo IA */}
        <radialGradient id={`${uid}-glow`} cx="12" cy="15" r="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#A78BFA" stopOpacity="0.95" />
          <stop offset="55%"  stopColor="#7C3AED" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7C3AED" stopOpacity="0"    />
        </radialGradient>
      </defs>

      {/* ── ARCO ÚNICO ── */}
      <path
        d="M 3.5 21 C 3.5 9 7.5 2.5 12 2.5 C 16.5 2.5 20.5 9 20.5 21"
        stroke={`url(#${uid}-arc)`}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── LÍNEAS DE SUBTÍTULO ── */}
      {/* EN — color adapta al tema */}
      <line
        x1="1.5" y1="15" x2="9.8" y2="15"
        stroke={enLineColor} strokeWidth="1.4" strokeLinecap="round" opacity={enLineOpacity}
      />
      {/* ES — degradado violeta → cian */}
      <line
        x1="14.2" y1="15" x2="22.5" y2="15"
        stroke={`url(#${uid}-es)`} strokeWidth="1.4" strokeLinecap="round"
      />

      {/* Indicadores de párrafo */}
      <line x1="2.5" y1="18.5" x2="7.5"  y2="18.5" stroke={parLineColor} strokeWidth="1" strokeLinecap="round" opacity={parLineOpacity1}/>
      <line x1="16.5" y1="18.5" x2="21.5" y2="18.5" stroke={`url(#${uid}-es)`}  strokeWidth="1" strokeLinecap="round" opacity="0.22"/>

      {/* ── NODO IA ── */}
      {/* Halo pulsante */}
      <motion.circle
        cx="12" cy="15" r="3"
        fill={`url(#${uid}-glow)`}
        initial={{ r: 3, opacity: 0.75 }}
        animate={shouldAnimate
          ? { r: [3, 4.2, 3], opacity: [0.55, 1, 0.55] }
          : { r: 3.2, opacity: 0.75 }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Núcleo — blanco en dark, violeta en light */}
      <motion.circle
        cx="12" cy="15" r="1.35" fill={nodeCoreColor}
        initial={{ r: 1.35, opacity: 0.92 }}
        animate={shouldAnimate
          ? { r: [1.35, 1.6, 1.35], opacity: [0.88, 1, 0.88] }
          : { r: 1.35, opacity: 0.92 }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── PARTÍCULA DE TRADUCCIÓN ── */}
      {shouldAnimate && (
        <motion.circle
          cy="15" r="1.1" cx="1.5"
          initial={{ cx: 1.5, opacity: 0, r: 1.1, fill: particleStart }}
          animate={{
            cx:      [1.5, 12, 22.5],
            opacity: [0, 1, 0],
            fill:    [particleStart, "#A78BFA", "#22D3EE"],
          }}
          transition={{
            duration: 3.8,
            repeat: Infinity,
            ease: [0.4, 0, 0.2, 1],
            times: [0, 0.44, 1],
          }}
        />
      )}
    </svg>
  );

  if (iconOnly) return icon;

  /* ══════════════════════════════════════════════
     CONTENEDOR — adapta al tema activo
  ═══════════════════════════════════════════════ */
  const containerStyle: React.CSSProperties = isSepia
    ? {
        width:  size,
        height: size,
        borderRadius: Math.max(7, size * 0.2),
        background: "linear-gradient(150deg, rgba(237,233,254,0.96) 0%, rgba(255,255,255,0.98) 50%, rgba(224,242,254,0.95) 100%)",
        boxShadow: [
          "0 3px 14px rgba(76, 29, 149, 0.14)",
          "0 1px 3px rgba(0,0,0,0.07)",
          "inset 0 1px 0 rgba(255,255,255,0.95)",
        ].join(", "),
      }
    : {
        width:  size,
        height: size,
        borderRadius: Math.max(7, size * 0.2),
        background: "linear-gradient(150deg, #0D0720 0%, #07070F 50%, #030E17 100%)",
        boxShadow: [
          "0 4px 18px rgba(76, 29, 149, 0.22)",
          "0 1px 3px rgba(0,0,0,0.5)",
          "inset 0 1px 0 rgba(255,255,255,0.055)",
        ].join(", "),
      };

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 overflow-hidden ${className}`}
      style={containerStyle}
    >
      {/* Halo ambiental violeta (superior-izquierda) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isSepia
            ? "radial-gradient(ellipse 80% 55% at 30% 20%, rgba(109,40,217,0.12) 0%, transparent 100%)"
            : "radial-gradient(ellipse 80% 55% at 30% 20%, rgba(109,40,217,0.22) 0%, transparent 100%)",
        }}
      />

      {/* Halo ambiental cian (inferior-derecha) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isSepia
            ? "radial-gradient(ellipse 65% 55% at 78% 85%, rgba(8,145,178,0.10) 0%, transparent 100%)"
            : "radial-gradient(ellipse 65% 55% at 78% 85%, rgba(8,145,178,0.16) 0%, transparent 100%)",
        }}
      />

      {/* Borde degradado de 1px */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{
          padding: "1px",
          background: isSepia
            ? "linear-gradient(150deg, rgba(109,40,217,0.40) 0%, rgba(14,165,233,0.06) 45%, rgba(14,165,233,0.35) 100%)"
            : "linear-gradient(150deg, rgba(109,40,217,0.65) 0%, rgba(14,165,233,0.04) 45%, rgba(14,165,233,0.55) 100%)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />

      {/* Destello especular */}
      <div
        className="absolute top-0 inset-x-3 h-px pointer-events-none"
        style={{
          background: isSepia
            ? "linear-gradient(90deg, transparent 0%, rgba(109,40,217,0.25) 50%, transparent 100%)"
            : "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
        }}
      />

      {/* Contenedor del icono — 70% del área */}
      <div className="relative flex items-center justify-center w-[70%] h-[70%]">
        {icon}
      </div>
    </div>
  );
}