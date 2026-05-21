# Udemy Subtitle Bridge — Diseño UI/UX Detallado
> Specs visuales completas para replicación exacta en cualquier entorno

---

## 1. Sistema de Diseño Base

### 1.1 Paleta de Colores

```css
/* Fondos principales */
--bg-deepest:   #0a0a0c   /* Fondo más oscuro (cards reverso, zonas de código) */
--bg-deep:      #0d0e0f   /* Historial, cache entries */
--bg-dark:      #121214   /* Tab nav, header, pipeline steps */
--bg-main:      #1a1b1d   /* Fondo principal del sidebar */
--bg-elevated:  #18181b   /* Cards, request cards expandidas */
--bg-udemy:     #1c1d1f   /* Color exacto del navbar/sidebar de Udemy */

/* Violeta (color principal del producto) */
--violet-50:   rgba(139, 92, 246, 0.05)
--violet-10:   rgba(139, 92, 246, 0.10)
--violet-15:   rgba(139, 92, 246, 0.15)
--violet-20:   rgba(139, 92, 246, 0.20)
--violet-30:   rgba(139, 92, 246, 0.30)
--violet-solid: #8b5cf6
--violet-400:  #a78bfa
--violet-300:  #c4b5fd
--violet-600:  #7c3aed

/* Esmeralda (éxito, conexión activa) */
--emerald-400: #34d399
--emerald-500: #10b981
--glow-emerald: rgba(16, 185, 129, 0.15)

/* Ámbar (advertencia, dev mode) */
--amber-400: #fbbf24
--glow-amber: rgba(245, 158, 11, 0.20)

/* Cielo (captura EN, info) */
--sky-400: #38bdf8
--sky-500: #0ea5e9

/* Rojo (error, wrong rating) */
--red-400: #f87171

/* Blancos/Grises (texto con opacidades) */
--text-primary:   rgba(255,255,255, 0.85)
--text-secondary: rgba(255,255,255, 0.55)
--text-tertiary:  rgba(255,255,255, 0.40)
--text-muted:     rgba(255,255,255, 0.28)
--text-faint:     rgba(255,255,255, 0.22)
--text-ghost:     rgba(255,255,255, 0.15)

/* Borders */
--border-bright:  rgba(255,255,255, 0.14)
--border-normal:  rgba(255,255,255, 0.10)
--border-subtle:  rgba(255,255,255, 0.07)
--border-faint:   rgba(255,255,255, 0.05)

/* Colores de texto para subtítulos en overlay */
--subtitle-white:  #ffffff
--subtitle-yellow: #fde047
--subtitle-cyan:   #67e8f9
```

### 1.2 Tipografía

```css
/* Familia principal: System stack (no cargar fuente externa en extensión) */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

/* Escalas usadas en el sidebar (todo en rem equivalente) */
--text-2xs:  9px   /* Labels, sectiones, timestamps */
--text-xs:  10px   /* Badges, stats, meta-información */
--text-sm:  11px   /* Texto secundario, descripciones */
--text-base: 12px  /* Texto de preguntas, conceptos, feedback */
--text-md:  13px   /* Traducciones ES generadas */

/* Font weights usados */
--weight-normal:   400  /* Texto regular */
--weight-medium:   500  /* Labels, botones secundarios */
--weight-semibold: 600  /* Títulos, tab labels activos, sección headers */

/* Letter spacing especial */
--tracking-section: 0.06em  /* Para labels de sección en mayúsculas */
--tracking-wide:    0.04em  /* Para badges y pills */
```

### 1.3 Border Radius

```
--radius-sm:  6px   /* Badges, pills pequeñas */
--radius-md:  8px   /* Botones, inputs pequeños */
--radius-lg:  10px  /* Código, historial */
--radius-xl:  12px  /* Cards principales */
--radius-2xl: 16px  /* Preview frame */
--radius-full: 9999px /* Badges redondeados, dots, pings */
```

### 1.4 Espaciado

El sidebar tiene un ancho fijo de **360px** en el prototipo.
Padding interno de contenido: **12px (p-3)** en la mayoría de áreas.
Gap entre secciones dentro de una tab: **12px (space-y-3)**.

---

## 2. Layout General del Sidebar

```
┌─────────────────────── 360px ───────────────────────┐
│ HEADER (sticky, 56px aprox)                         │
│  [Zap icon] Subtitle Bridge    [port badge] [gear]  │
│  Logo 32×32px • bg-violet gradient • glow           │
├─────────────────────────────────────────────────────┤
│ TAB NAV (40px, 4 tabs)                              │
│  [Study] [Captions] [Overlay] [Dev?]                │
│  Tab activo: bg white/10 + border white/10          │
│  Indicador activo: violeta tab bg (Motion layoutId) │
├─────────────────────────────────────────────────────┤
│ CONTENT AREA (flex-1, overflow-y-auto)              │
│  Padding: p-3                                        │
│  Scrollbar custom: 4px, thumb white/12              │
└─────────────────────────────────────────────────────┘
```

---

## 3. Header del Sidebar

### Especificación exacta:

```
Fondo: bg-[#121214]/80 + backdrop-blur-md
Border bottom: border-white/5
Padding: px-4 py-3

Logo container (32×32px):
  - bg: gradient-to-br from-violet-500 to-indigo-700
  - border-radius: 12px (rounded-xl)
  - border: 1px solid white/10
  - shadow: 0 0 15px rgba(139,92,246,0.3) ← halo palpitante

Ícono: <Zap size={15} /> en blanco
  - drop-shadow-md (sombra de texto)

Título: "Subtitle Bridge"
  - font-size: 12px, font-weight: 600
  - color: white, tracking: wide

Subtítulo: "EN → ES · AI Local"
  - font-size: 9px, font-weight: 500 (medium)
  - color: white/40
  - texto uppercase + tracking: widest
  - mt-1

Badge de puerto "8010":
  - bg: emerald-500/10
  - border: emerald-500/20
  - border-radius: full
  - padding: px-2.5 py-1
  - Dot pulsante: 6×6px, bg-emerald-500, shadow "0 0 5px #10b981"
  - Texto: "8010", color emerald-400, text-[10px], font-medium

Gear button (⚙):
  - Normal: text-white/30, hover: text-white + bg-white/10
  - Dev mode activo: text-amber-400 + bg-amber-500/10 + border-amber-500/30
    + shadow "0 0 10px rgba(245,158,11,0.2)"
  - Ícono gira lento en dev mode: animate-spin-slow (8s)
```

---

## 4. Tab Navigation

```
Container: bg-[#121214], padding p-1.5, gap-1, border-b border-white/5

Cada tab:
  - flex-1, flex-col items-center, gap-1.5, py-2.5, rounded-lg
  - font-size: 10px, letter-spacing: wide

Tab inactivo:
  - color: white/40
  - hover: text-white/70 + bg-white/5

Tab activo:
  - color: white
  - Fondo animado: Motion layoutId="activeTabBg"
    - bg-white/10, border: 1px solid white/10, rounded-lg
    - transition: spring, stiffness 400, damping 30

Ícono del tab activo: color violeta-400
Label del tab activo: font-weight 600

Ping dot (en Study tab cuando no está activo):
  - w-1.5 h-1.5 rounded-full bg-violet-500
  - shadow: "0 0 5px #8b5cf6"
  - absolute top-1.5 right-2
```

---

## 5. TranslationPipeline

### Container principal:

```
bg: gradient-to-b from-[#121214] to-[#0a0a0c]
border: 1px solid white/10
border-radius: xl (12px)
overflow: hidden
shadow-lg
position: relative
```

### Línea vertical conectora:

```
position: absolute, left: 24px, top: 24px, bottom: 24px
width: 1px
bg: gradient-to-b from-sky-500/20 via-violet-500/20 to-emerald-500/20
pointer-events: none
```

### Step 1 — "Capturado · Udemy":

```
Container: px-4 py-3, position: relative z-10

Dot indicador (16×16px):
  - Normal: border-white/10 + bg-[#121214]
  - Activo: border-sky-500/50 + dot interior bg-sky-400
  - Animación capturando: scale 1→1.3→1 + glow sky (1.5s loop)

Label: "CAPTURADO · UDEMY"
  - Normal: text-white/20
  - Activo: text-sky-400
  - font-size: 10px, font-semibold, uppercase, tracking-widest

Texto EN:
  - color: white/80
  - font-size: 12px, leading-relaxed, font-medium
  - Animación entrada: x -4 → 0 con opacity 0 → 1

Placeholder: "Esperando subtítulo…"
  - color: white/20, italic
```

### Step 2 — "IA Local":

```
Container: px-4 py-2
  - Streaming: bg-violet-500/5 + backdrop-blur-sm + border-y border-violet-500/10
  - Idle: border-y border-white/5 + bg-white/2

Dot con Radio icon (8px):
  - Normal: border-white/10, icon: white/20
  - Streaming: border-violet-500/50, icon: violet-400

Label:
  - Streaming: "IA Local · Procesando..." text-violet-300
  - Idle: "IA Local (Offline/Idle)" text-white/20
  - font-size: 10px, font-semibold, tracking-wide

Badge de latencia (cuando done):
  - Real AI: bg-white/5 + border-emerald-500/20 + text-emerald-400 "⚡Xms"
  - Mock: bg-white/5 + border-amber-500/20 + text-amber-400 "<WifiOff/> mock"
  - Scale in: Motion initial scale 0.8 → 1
```

### Step 3 — "Subtítulo Generado":

```
Dot:
  - Done: border-emerald-500/50 + dot bg-emerald-400 + pulse glow
  - Streaming: border-violet-400/50 + dot bg-violet-400
  - Idle: border-white/10 + dot bg-white/20

Label:
  - Streaming: "Traduciendo..." text-violet-300
  - Done: "Subtítulo Generado" text-emerald-400
  - Idle: "Subtítulo Generado" text-white/20
  - uppercase, tracking-widest, font-semibold

Texto ES:
  - Streaming: text-violet-300/80, font-size 13px
  - Done: text-violet-200, font-size 13px
  - Cursor parpadeante: 3×15px, bg-violet-400, rounded-sm, translate-y: -1px
    animate opacity 1→0→1 (0.5s loop)

Skeleton (durante capturing):
  - h-3.5, bg-white/10, rounded, w-3/5
  - opacity pulse 0.2→0.5→0.2 (1.5s loop)
```

### Stats bar (encima del pipeline):

```
Label izquierda: "Pipeline EN → ES"
  - text-white/22, 9px, uppercase, tracking-widest
  - Dot violeta parpadeante cuando isLive

Estadísticas (derecha):
  - Total líneas: <TrendingUp size={8} /> text-white/28
  - Avg ms: <Zap size={8} /> text-violet-400/55
  - % IA: <Database size={8} /> text-emerald-400/55
  - font-size: 9px
```

### Historial de traducciones:

```
Container: bg-[#0d0e0f], border-white/7, rounded-xl

Cada entry:
  - layout: grid (EN + ES / badge latencia)
  - EN: text-white/22, 9px, truncate
  - ES: text-white/58, 10px, truncate
  - Badge: ⚡Xms (emerald/50) o mock (amber/45), 9px
  - separator: border-b border-white/4
  - entrada: Motion x -4 → 0
```

---

## 6. Study Agent Tab

### 6.1 Fase "Objetivo"

**Hero card:**
```
bg: gradient-to-br from-violet-600/12 to-violet-600/3
border: violet-500/15
border-radius: xl
padding: p-3.5

Logo: 24×24px, bg-violet-600/25, border-violet-500/30, rounded-lg
Ícono Brain: 13px, text-violet-400
Título: "Tutor IA · Study Agent", 11px, font-weight 600, text-white/70
Descripción: "5-8 min por video...", 10px, text-white/30, leading-relaxed
```

**Grid de objetivos (2×2):**
```
Cada card:
  - padding: p-3, rounded-xl, text-left
  - Activo: bg-gradient-to-br (colores específicos) + border colored
  - Inactivo: bg-white/3, border-white/7, hover: bg-white/5 border-white/12

Colores por objetivo:
  spring-senisenior: from-violet-600/20 to-violet-600/5, border-violet-500/30, text-violet-300
  java-cert:         from-amber-600/20 to-amber-600/5, border-amber-500/30, text-amber-300
  personal-project:  from-emerald-600/20 to-emerald-600/5, border-emerald-500/30, text-emerald-300
  fullstack:         from-sky-600/20 to-sky-600/5, border-sky-500/30, text-sky-300

Emoji: text-sm (1em aprox), mb-1.5
Título: 11px, font-weight 600, leading-tight
Subtítulo: 9px, mt-0.5, color de acento cuando activo / white/28 cuando inactivo
CheckCircle2: 10px, color de acento, absolute top-2 right-2 (solo cuando activo)
```

**Textarea objetivo custom:**
```
height: 44px, font-size: 11px, rounded-lg
bg: black/25, border: white/8
color: white/65, placeholder: white/16
focus: border-violet-500/30
resize: none, outline: none, leading-relaxed
```

**Botón "Refinar con IA":**
```
height: 28px, rounded-lg
bg: white/4, border: white/8
color: white/40, hover: text-white/65 + bg-white/6
font-size: 11px
Ícono Sparkles: 10px, text-violet-400
AnimatePresence para enter/exit
```

**Resultado refinado:**
```
bg: violet-500/8, border: violet-500/18
rounded-xl, p-2.5
Check: 9px, text-violet-400
Texto: 11px, text-violet-300/80, leading-relaxed
```

**Inputs de curso/lección:**
```
Label: <Target size={9}/> ó <BookOpen size={9}/>  + texto, 10px, text-white/25
Input: h-8, px-2.5, font-size 11px
bg: black/20, border: white/8, rounded-lg
color: white/65, placeholder: white/15
focus: border-violet-500/25
```

**Botón "Generar sesión de estudio":**
```
height: 40px, rounded-xl
bg: violet-700 (activo) / white/5 (desactivado)
hover: violet-600
color: white
font-size: 12px, font-weight 600
Ícono Wand2: 14px
disabled: opacity-30, cursor-not-allowed
```

---

### 6.2 Fase "Generating"

```
Container: flex-1, flex-col, items-center, justify-center, p-6

Spinner exterior: w-12 h-12, border-2 border-violet-500/20
  + border-t-violet-400, animate-spin
Inner content: texto central "Analizando…"

Steps list (mt-6):
Cada step:
  - flex, items-center, gap-2
  - Completado: check circle emerald (10px)
  - Activo: Loader2 violet animate-spin (10px)
  - Pendiente: circle gray (10px)
  - Texto: 10px, text-white/60 (completado) / text-violet-300 (activo) / text-white/20 (pendiente)
  - AnimatePresence: cada step entra con opacity 0 → 1, y 4 → 0
```

---

### 6.3 Fase "Result"

**ProgressStepper:**
```
Container: flex, items-center, gap-0, w-full, mb-2

Nombres de los 5 steps (v1.4):
  0 → Mi nivel
  1 → Lo que vi
  2 → ¿Lo sé?
  3 → Practícalo
  4 → No olvidar

Cada step circle (20×20px):
  - Done: bg emerald/20, border emerald/30, shadow glow esmeralda
    ícono: Check 10px strokeWidth=3 text-emerald-400
  - Active: bg violet/20, border violet/40, shadow glow violeta
    texto: número, 9px, font-semibold, text-violet-300
  - Pending: bg-white/5, border-white/10
    texto: número, 9px, text-white/20

Label del step:
  - 9px, whitespace-nowrap, text-center
  - Done: text-emerald-400/70 font-medium
  - Active: text-violet-300/90 font-medium
  - Pending: text-white/20

Línea de conexión entre steps:
  - flex-1, mx-1, mb-4, h-px, bg-white/5, relative, overflow-hidden
  - Motion div dentro: scaleX 0→1 cuando step.done=true
    bg: gradient-to-r from-emerald-500/50 to-emerald-400/80, origin-left
    transition: duration 0.6, ease easeInOut
```

**Card de Relevancia:**
```
bg: gradient-to-b from-[#18181b] to-[#121214]
border: white/5, rounded-xl, p-4

Score: texto grande (28-32px), font-weight 700, text-violet-400
Porcentaje "%": 14px, self-end, text-violet-400/60
Razón: 11px, leading-relaxed, text-white/60

Ícono Info: absolute top-3 right-3, 12px, text-white/15
  tooltip al hover: "Score de relevancia respecto a tu objetivo"
```

**Conceptos Clave:**
```
StepHeader: n=1, label="Conceptos clave del video", status={done/active/pending}

Lista de conceptos:
Cada item: flex, items-start, gap-2, py-1.5
  Checkbox custom (18×18px):
    - Unchecked: border-white/10, bg-white/3, rounded-md
    - Checked: bg-violet-600/30, border-violet-400/40, ícono Check violet-400
  Texto: 11px, text-white/70, leading-relaxed
```

**Autocalibración:**
```
StepHeader: n=2, "¿Cómo llegaste al video?"

Hint text (si confidence !== null):
  bg: white/3, border: white/6, rounded-lg, p-2.5
  Ícono Info: 10px, text-white/30
  Texto: 10px, text-white/45, leading-relaxed

Grid 2×2 de botones de confianza:
Cada botón (sin seleccionar):
  - bg-white/3, border-white/7, rounded-xl, py-3
  - hover: bg-white/5 border-white/12
  - emoji: text-xl (20px)
  - label: 11px, font-weight 600, text-white/70
  - desc: 9px, text-white/28

Botón seleccionado:
  - bg según nivel + border según nivel + ring shadow
  confused:  bg-red-500/10, border-red-500/25, shadow "ring-red-500/40"
  partial:   bg-amber-500/10, border-amber-500/25, shadow "ring-amber-500/40"
  clear:     bg-emerald-500/10, border-emerald-500/25
  mastered:  bg-violet-500/10, border-violet-500/25
  - label_c: colores correspondientes (text-red-400 / text-amber-400 / etc.)
```

**Preguntas Adaptativas:**
```
StepHeader: n=3, "¿Cuánto retuviste?" (paso "¿Lo sé?")

Badge de Bloom:
  - inline, 8px, border, rounded, px-1.5 py-0.5
  - Colores por nivel (ver función BLOOM_STYLE en StudyAgentTab.tsx)

Badge de dificultad:
  - confused: bg-red-500/10 text-red-400
  - partial: bg-amber-500/10 text-amber-400
  - clear: bg-emerald-500/10 text-emerald-400
  - mastered: bg-violet-500/10 text-violet-400
  - 8px, rounded, px-1.5 py-0.5

Texto de la pregunta:
  - 12px, font-weight 600, text-white/85, leading-relaxed

Toggle de pista (encima del textarea):
  - Botón completo: flex items-center, border, rounded-lg, px-2.5 py-1.5
  - Activo: bg-amber-500/8, border-amber-500/20, text-amber-300/80
  - Inactivo: bg-white/3, border-white/7, text-white/28
  - Ícono Sparkles 9px (amber) + texto "Ver pista" / "Ocultar pista" + ChevronDown
  ⚠️ El hint NO aparece en el strip de AIFeedback — solo en este toggle

Textarea respuesta:
  - h-[80px], resize-none, outline-none
  - bg-black/35, border-white/8, rounded-xl
  - placeholder: text-white/18, font-size 11px
  - Borde coloreado según rating tras evaluación

Botón "Evaluar":
  - rounded-lg, bg-violet-600, hover: bg-violet-500
  - disabled: opacity-40, bg-white/8
  - Ícono Wifi: 10px

Strip de AIFeedback (acciones contextuales — solo wrong/partial):
  "Siguiente paso" label + botones:
  - rating=wrong: <RotateCcw/> "Reintentar"  (limpia textarea)
  - onShowModel:  <BookOpen/>  "Ver respuesta"
  ⚠️ "Ver pista" fue ELIMINADO del strip

QUESTION DOTS (v1.2 — rating-aware):
  Header de la card de preguntas: dos filas
  Fila 1: StepHeader izquierda + dots derecha
  Fila 2: barra de progreso (h-2px, gradient violet)

  Cada dot (Motion animate width/height con spring stiffness 400, damping 28):
    - Respondido correcto/excellent: w-3.5 h-1.5, bg-emerald-400
        shadow: "0 0 6px rgba(52,211,153,0.7)"
    - Respondido partial:            w-3.5 h-1.5, bg-amber-400
        shadow: "0 0 6px rgba(251,191,36,0.7)"
    - Respondido wrong:              w-3.5 h-1.5, bg-red-400
        shadow: "0 0 6px rgba(248,113,113,0.6)"
    - Respondido (unknown/default):  w-3.5 h-1.5, bg-emerald-400 (glow)
    - Actual (isCurrent, no done):   w-3.5 h-1.5, bg-violet-400
        shadow: "0 0 8px rgba(167,139,250,0.7)"
    - Pendiente:                     w-1.5 h-1.5, bg-white/15
  Gap entre dots: 1.5 (gap-1.5)

  Barra de progreso debajo de fila 1:
    h-[2px], bg-white/5, rounded-full, overflow-hidden
    Motion div interior:
      width: (done_count / total) * 100%  → "100%" si questionsComplete
      bg: gradient-to-r from-violet-500 to-violet-400
      transition: duration 0.5, ease easeOut
```

**Desafío de Aplicación (paso "Practícalo"):**
```
StepHeader: n=4, "Escribe código real" (subLabel: "desafío práctico")

Setup text: 11px, text-white/50, leading-relaxed
  - En card violet-500/7 con emoji 📋

Bloque de código del challenge:
  bg-black/50, border: white/6, rounded-xl, p-3
  font: monospace, font-size 10px
  color: emerald-300/80
  whitespace-pre-wrap, overflow-x-auto

Textarea para solución:
  - h-[90px], font-mono, font-size 10px
  - bg-black/40, border-white/8, rounded-xl
  - placeholder: "// Tu solución aquí…"
  - color: emerald-300/80

Botón "Revisar con IA":
  - bg-violet-600, hover: violet-500, rounded-lg
  - Ícono: <Loader2 spin> o <Send 10px>

Toggle "Ver solución":
  - si showSolution: bg-white/5, border-white/12, text-white/55
  - Solución: bg-emerald-500/5, border-emerald-500/12, rounded-xl
    pre: font-mono 10px, text-emerald-300/75

QuickWin "Llévalo al mundo real · bonus" (AQUÍ — no en paso 1):
  - bg-gradient-to-br from-amber-500/6, border-amber-500/18
  - Header: <Zap/> amber + "LLÉVALO AL MUNDO REAL · BONUS" + "~2 min"
  - Cuerpo: texto content.quickWin, text-white/60, 11px
  - shimmer sweep animado

Botón "🎯 Fíjalo en memoria →" / "Continuar de todas formas →":
  - Aparece (AnimatePresence) cuando appFeedback.status === "done"
  - rating correct/excellent: bg-violet-600, text-white
  - rating other: border-white/10, text-white/40 (tenue)
  ⚠️ Este botón es la ÚNICA forma de avanzar al paso 4 — no hay auto-avance
```

**Preview Tarjetas Anki:**
```
Container de flip (perspective: 1200px):
  - cursor: pointer, select-none

Motion div (la card):
  animate: { rotateY: flipped ? 180 : 0 }
  transition: type spring, stiffness 260, damping 20, duration 0.4
  style: transformStyle: preserve-3d

Frente:
  bg: gradient-to-b from-[#18181b] to-[#121214]
  border: white/10
  rounded-xl, p-4, min-h-[100px]
  hover: border-white/20 (group-hover)
  backfaceVisibility: hidden

  Texto frente: text-white/80, 12px, leading-relaxed, font-medium
  
  Flip hint (bottom):
  - FlipHorizontal 11px + "Toca para voltear"
  - text-white/30, group-hover: text-white/60
  - border-t border-white/5, mt-3, pt-3
  
  Glass sheen (hover overlay):
  bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent
  opacity-0 group-hover:opacity-100

Reverso:
  bg: gradient-to-b from-[#121214] to-[#0a0a0c]
  borderColor: ${meta.accent}66 (color del tipo con 40% opacity)
  boxShadow: inset 0 0 40px ${meta.accent}10, 0 8px 30px rgba(0,0,0,0.6)
  backfaceVisibility: hidden
  transform: rotateY(180deg)

  Línea superior brillante:
  inset 0 1px 0 ${meta.accent}33

Navegación de cards:
  Prev/Next: w-8 h-8, bg-white/5, hover: bg-white/10
    border: transparent, hover: border-white/10
    text-white/40, hover: text-white/80
    rounded-lg, ícono 14px

  Dots: flex, gap-2, items-center
    Activo: w-6 h-1.5 rounded-full bg-violet-400 shadow "0 0 8px #a78bfa"
    Inactivo: w-1.5 h-1.5 rounded-full bg-white/20 hover:bg-white/40
```

**Export Anki:**
```
Badge contador: "1 de N", bg-white/5, rounded-full, border-white/5
Badge tipo card: color del tipo, bg-white/5, rounded-full

Botones export:
Fila 1:
  - "Exportar .txt": bg-white/4, hover: bg-white/7, border-white/8
    ícono: <FileDown 12px>
    Si isFirstExport: badge "+ CSS + Plantilla" (9px, text-amber-400/70)
  - "Exportar .apkg": bg-violet-700/80, hover: violet-700
    ícono: <Package 12px> o <Loader2 spin>
    text: "Exportar .apkg" / "Generando…" / "¡Listo! ✓"
    Barra de progreso al exportar: motion width 0→100%, bg-violet-400, h-0.5

Guide collapsible (después de exportar):
  bg-black/20, border: white/6, rounded-xl
  Botón header: flex justify-between, text-[10px], text-white/35
  Contenido: texto de instrucciones para setup en Anki
  Ícono ChevronDown/Up: 11px, text-white/25
```

---

### 6.4 Focus Navigator (v1.4 — nombres cálidos + scroll robusto)

> Reemplaza el scroll libre por una **navegación secuencial de 1 paso a la vez**.  
> El estudiante sólo ve el paso en el que está; el resto está oculto. Esto reduce la carga cognitiva y fuerza completar cada etapa antes de pasar a la siguiente.

#### Nombres de los pasos (v1.4 — nombres cálidos)

| focusStep | Nombre en UI  | Descripción técnica                       |
|-----------|---------------|-------------------------------------------|
| 0         | Mi nivel      | Autocalibración de confianza (4 botones)  |
| 1         | Lo que vi     | Checkboxes de conceptos clave             |
| 2         | ¿Lo sé?       | Preguntas adaptativas por nivel           |
| 3         | Practícalo    | Desafío de código + code review IA        |
| 4         | No olvidar    | Entrevista + exportar tarjetas Anki       |

#### Arquitectura de estado

```typescript
// En StudyAgentTab.tsx
const [focusStep, setFocusStep] = useState(0);   // 0-4 paso visible
const [focusDir,  setFocusDir]  = useState(1);    // +1 hacia adelante, -1 hacia atrás

// Unlock gates: el paso N se habilita cuando su condición es true
const stepUnlocked = [
  true,                   // 0 — Mi nivel       (siempre disponible)
  confidence !== null,    // 1 — Lo que vi
  confidence !== null,    // 2 — ¿Lo sé?
  questionsComplete,      // 3 — Practícalo
  showApply,              // 4 — No olvidar  (showApply = confidence !== null && questionsComplete)
] as const;

// ⚠️ CRÍTICO — scrollTop = 0 ANTES del re-render para que AnimatePresence
//              no empuje el contenido nuevo hacia abajo
const goToStep = (target: number) => {
  if (target < 0 || target > 4) return;
  if (!stepUnlocked[target]) return;
  if (scrollRef.current) scrollRef.current.scrollTop = 0; // síncrono, antes de setState
  setFocusDir(target > focusStep ? 1 : -1);
  setFocusStep(target);
};
```

#### Auto-avance automático

```typescript
// Mi nivel → Lo que vi (automático al seleccionar confianza)
useEffect(() => {
  if (confidence && focusStep === 0) { setFocusDir(1); setFocusStep(1); }
}, [confidence]);

// ¿Lo sé? → Practícalo (automático al completar preguntas) + sonido victoria
useEffect(() => {
  if (questionsComplete && focusStep <= 2) { setFocusDir(1); setFocusStep(3); }
}, [questionsComplete]);

// ⚠️ Practícalo → No olvidar: NO es automático.
// El usuario lee el feedback de la IA y avanza manualmente con
// "🎯 Fíjalo en memoria →" o "Continuar de todas formas →"
// sessionComplete SOLO activa el banner "¡Sesión completada!" — no navega.

// Scroll a top — triple-disparo para vencer el timing de AnimatePresence:
// 1. Inmediato (síncrono vía scrollTop)
// 2. Doble requestAnimationFrame (post-paint del nuevo contenido)
// 3. setTimeout 350ms (post-animación spring ~300ms)
useEffect(() => {
  if (scrollRef.current) scrollRef.current.scrollTop = 0;
  const raf = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
  });
  const t = setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, 350);
  return () => { cancelAnimationFrame(raf); clearTimeout(t); };
}, [focusStep]);
```

#### Barra de puntos (dots de progreso)

```
Container: flex items-center gap-2, w-full

Cada dot:
  - Activo (isCurrent): w-6 h-2, bg-violet-500, rounded-full
    shadow: "0 0 8px rgba(139,92,246,0.5)"
  - Completado (done):  w-2 h-2, bg-emerald-400/65, rounded-full
    hover: bg-emerald-400, cursor-pointer (clicable)
  - Desbloqueado (unlocked, !done, !current): w-2 h-2, bg-white/25
    hover: bg-white/45, cursor-pointer
  - Bloqueado:          w-2 h-2, bg-white/8, cursor-not-allowed
  - transition-all duration-300

Contador: "X / 5" — text-[10px], text-white/30, font-mono tabular-nums
```

#### Barra Anterior / Siguiente

```
Container: flex items-center justify-between

Botón Anterior:
  - flex items-center gap-1, px-2.5 py-1.5, rounded-lg, text-[10px]
  - Habilitado: text-white/50, hover:bg-white/8, cursor-pointer
  - Deshabilitado: text-white/15, cursor-not-allowed
  - <ChevronLeft size={12}/> Anterior

Label del paso (centro):
  - text-[10px], text-white/50, font-weight: 600
  - Muestra steps[focusStep].label

Botón Siguiente:
  - flex items-center gap-1, px-2.5 py-1.5, rounded-lg, text-[10px]
  - Habilitado: text-violet-400, hover:bg-violet-500/10, cursor-pointer
  - Deshabilitado: text-white/15, cursor-not-allowed
  - title (tooltip): "Completa este paso primero" si !canGoNext && focusStep < 4
  - Siguiente <ChevronRight size={12}/>
```

#### Animación de slide entre pasos

```typescript
// AnimatePresence custom={focusDir} mode="wait"
<motion.div
  key={focusStep}
  custom={focusDir}
  variants={{
    enter:  (d: number) => ({ x: d >= 0 ? 56 : -56, opacity: 0, scale: 0.98 }),
    center: (_d: number) => ({ x: 0, opacity: 1, scale: 1 }),
    exit:   (d: number) => ({ x: d >= 0 ? -56 : 56, opacity: 0, scale: 0.98 }),
  }}
  initial="enter" animate="center" exit="exit"
  transition={{ type: "spring", stiffness: 380, damping: 34 }}
>
  {/* Paso visible según focusStep */}
</motion.div>
```

**Mapeo focusStep → contenido:**

| focusStep | Nombre UI     | Contenido mostrado                       | Condición de visibilidad |
|-----------|---------------|------------------------------------------|--------------------------| 
| 0         | Mi nivel      | Autocalibración (4 botones emoji)        | siempre |
| 1         | Lo que vi     | Conceptos clave (checkboxes)             | `confidence !== null` |
| 2         | ¿Lo sé?       | Preguntas adaptativas                    | `confidence !== null && visibleQuestions.length > 0` |
| 3         | Practícalo    | Desafío de código + QuickWin bonus       | `showApply` (questionsComplete) |
| 4         | No olvidar    | Entrevista + Anki                        | siempre (Anki bloqueado visualmente si !showApply) |

**Posición en el DOM de la fase "result":**

```
<sticky header>
  ProgressStepper (lineal) — Mi nivel / Lo que vi / ¿Lo sé? / Practícalo / No olvidar
</sticky header>
<div p-3 space-y-3>
  [sessionComplete banner]         ← AnimatePresence (sessionComplete && !allStepsComplete)
                                     Banner motivacional SOLAMENTE — NO navega al paso 4
  [relevance bar mini]             ← siempre visible
  [dots de progreso]               ← siempre visible
  [botones Anterior / Label / Siguiente]  ← siempre visible
  <AnimatePresence mode="wait">    ← 1 paso a la vez
    <motion.div key={focusStep}>
      {focusStep === 0 && <MiNivelStep />}
      {focusStep === 1 && <LoQueViStep />}
      {focusStep === 2 && <LoSéStep />}
      {focusStep === 3 && <PractíaloStep />}
      {focusStep === 4 && <NoOlvidarStep />}
    </motion.div>
  </AnimatePresence>
  [Grand completion banner]        ← AnimatePresence (allStepsComplete)
</div>
```

---

### 6.5 UX Motivacional por Paso (v1.3)

> Cada paso tiene: intro de contexto + mejoras visuales de aliento + feedback post-acción.  
> Objetivo: el estudiante siente que aprende y progresa, no que rellena formularios.

#### Constantes añadidas en `StudyAgentTab.tsx`

```typescript
// Coach bubble post-selección de confianza (personalizada por nivel)
const COACH_BUBBLE: Record<ConfidenceLevel, { emoji, title, tip }> = {
  confused:  { emoji: "💪", title: "¡La honestidad es el primer paso real!", tip: "Cada experto que conoces pasó exactamente por aquí..." },
  partial:   { emoji: "🎯", title: "Ya tienes la base.",                      tip: "Solo necesitas conectar los puntos..." },
  clear:     { emoji: "⚡", title: "Buen nivel de comprensión.",              tip: "Ahora viene la prueba real: aplicarlo sin mirar..." },
  mastered:  { emoji: "🔥", title: "¡Nivel alto, vamos a confirmarlo!",      tip: "Te espera un análisis en profundidad..." },
};

// Tiempo de sesión
const sessionStartRef = useRef<number>(Date.now()); // para calcular tiempo en Grand Banner
```

#### Paso 0 — Mi nivel (Autocalibración)
```
Micro-intro (encima de la card):
  emoji 🧭 + "Sé honesto — esta respuesta calibra todo lo que sigue."
  text-white/35, text-[11px]

Mejoras al botón seleccionado:
  - Shimmer sweep: gradient skewed animado (x: -100% → 200%, 1.8s loop)
  - CheckCircle2 aparece con scale 0→1 (spring)
  - Emoji bounce: scale 1→1.2→1

Coach Bubble post-selección (AnimatePresence, delay 0.15s):
  - emoji + título bold + tip más suave
  - Separado con border-t border-white/6

CTA inline "Lo que vi →" al fondo de la card (cuando confidence !== null)
```

#### Paso 1 — Lo que vi (Conceptos)
```
Micro-intro: 📌 + "Marca solo los que realmente entendiste."

Progress counter (badge animado): "X/N"
  - bg-white/5 → bg-emerald-500/12 cuando isReady (≥2 marcados)

Cuando isReady: banner "¡Base sólida!" con CTA inline "Verificar mi comprensión →"
  - bg-gradient-to-r from-emerald-600/15 to-emerald-600/5
  - Shimmer verde
  - Botón emerald en el fondo del banner
```

#### Paso 2 — ¿Lo sé? (Preguntas)
```
Preguntas una a la vez (currentQIdx)
Hint toggle: "Ver pista" / "Ocultar pista" (encima del textarea, no en strip de IA)
Model answer toggle: "Respuesta modelo" (debajo del feedback IA)

Cuando questionsComplete: VerifyDoneReview (resumen con botón "Ir al desafío →")
Escape hatch: "Saltar al desafío práctico" (texto muy sutil, text-white/15)
```

#### Paso 3 — Practícalo (Código)
```
Micro-intro: 🛠️ + "El código imperfecto que escribas ahora vale más..."

Setup en card violet con emoji 📋
Challenge en <pre> monospace emerald
Textarea monospace para solución
Botón "Revisar con IA" → feedback streaming
Toggle "Ver solución" → solution ref en card emerald

QuickWin "Llévalo al mundo real · bonus":
  ⚠️ Ubicado en este paso (no en Lo que vi)
  bg-amber-500/6, border-amber-500/18, shimmer ámbar lento (3.5s)
  Texto content.quickWin

Botón CTA al paso 4 (aparece cuando appFeedback.status === "done"):
  ⚠️ ÚNICO punto de avance al paso 4 — NO hay auto-avance
  - Correcto: "🎯 Fíjalo en memoria →" (violeta sólido)
  - Incompleto: "Continuar de todas formas →" (tenue, borde sutil)
```

#### Paso 4 — No olvidar (Anki + Entrevista)
```
Achievement summary al top:
  - emoji 🏁 + "¡Llegaste al último paso!"
  - Stats inline: conceptos marcados, X/N preguntas correctas, tiempo sesión

Pregunta de entrevista (si content.interviewQ):
  - Card sky: header con Star icon + "Pregunta de entrevista"
  - Toggle "Estructura de respuesta ideal" (ChevronDown)

Próximo paso concreto (si showApply):
  - Card violet + ArrowRight icon + content.nextAction

Tarjetas Anki:
  - Header: Repeat2 icon + "Fíjalo en memoria" + contador tarjetas
  - AnkiFlipPreview (flip 3D)
  - Info sobre archivos (primera vez vs. actualización)
  - Botones grid: [.txt] [.apkg]
  - Guía de importación collapsible
```

#### Completion Flow
```
allStepsComplete = steps.every(s => s.done)
  = confidence + conceptsDone + questionsComplete + appFeedback.done + ankiExported

Al hacerse true:
1. celebrate({ type: "session_complete", ... })
2. Confetti lateral (3s, colores violeta/emerald/amarillo)
3. Chord musical triunfal (C4-E4-G4-C5, stagger 50ms)
4. scrollToBottom() → muestra Grand Banner

⚠️ BUG CONOCIDO Y CORREGIDO: El useEffect de allStepsComplete existía duplicado
   (causaba chord doble). La versión correcta tiene UN SOLO useEffect.

Grand Banner:
  - Borde animado gradient (violeta/emerald)
  - 🏆 animado (scale + rotate loop)
  - "¡Sesión 100% completada!"
  - Stats finales: conceptos / correctas / tiempo
  - "Esperando siguiente video…" (Loader2 spin + texto uppercase tracking)
```
