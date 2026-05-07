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
StepHeader: n=2, "¿Cómo te fue con este video?"

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
StepHeader: n=3, "Verifica tu comprensión"

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

Controles (hint / ver respuesta):
  - Botones pequeños: text-[9px], border-white/8, px-2 py-1, rounded

Textarea respuesta:
  - h-[72px], resize-none, outline-none
  - bg-black/25, border-white/8, rounded-xl
  - placeholder: text-white/20, font-size 11px

Botón "Evaluar con IA":
  - h-9, rounded-xl, bg-violet-700, hover: bg-violet-600
  - disabled: opacity-25
  - Ícono Send: 11px

Botón "Continuar sin responder":
  - h-8, rounded-lg, text-[9px], text-white/22, border-white/6
  - hover: text-white/45
```

**Desafío de Aplicación:**
```
StepHeader: n=4, "Aplícalo en código / situación real"

Setup text: 11px, text-white/65, leading-relaxed

Bloque de código:
  bg-[#0a0a0c], border: white/8, rounded-xl, p-3
  font: monospace (JetBrains Mono si disponible), font-size 10px
  color: violet-300/70 (código principal)
  color: sky-300/50 (comentarios "#Bug")

Textarea para solución:
  - h-[88px], font-mono, font-size 10px
  - bg-black/30, border-white/8, rounded-xl
  - placeholder: "Escribe tu solución o explicación aquí…"
  - color: white/60

Botón "Enviar para code review":
  - bg-violet-700, hover: violet-600, h-9
  - Ícono: <Loader2 spin> o <Send 11px>

Toggle "Ver solución":
  - si showSolution: bg-white/6, text-white/65
  - Solución: bg-black/20, p-3, rounded-lg, font-mono 10px, text-emerald-300/70
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

## 7. Overlay Tab

### Preview frame:

```
border-radius: xl, overflow: hidden, border: white/8, bg-[#0a0a0c]
aspect-ratio: 16/9, position: relative

Fondo: bg-gradient-to-br from-slate-800 via-slate-900 to-[#0a0a0c]

Código ficticio:
  position: absolute, inset-0, flex items-center justify-center
  opacity: 0.20
  font-mono, 7px, text-emerald-400, leading-relaxed

Label "Preview": top-1.5 left-2
  text-white/20, 8px, bg-black/40, px-1.5 py-0.5, rounded
```

### Controles overlay:

**Toggle "Overlay activo":**
```
Container: flex, justify-between, p-3.5, rounded-xl, border, transition
  Activo: bg-white/4, border-white/10
  Inactivo: bg-white/2, border-white/6

Switch: Radix UI Switch
  data-[state=checked]: bg-violet-600
  scale: 0.82
```

**Sección desactivada cuando overlay off:**
```
opacity-25, pointer-events-none, transition-opacity duration-300
```

**Selector de posición (3 botones):**
```
Grid 3 columns, gap-2
Cada botón: flex-col, items-center, gap-1.5, py-2.5, rounded-lg, border
  Activo: bg-gradient-to-b from-violet-500/20 to-violet-500/10
          border-violet-400/40, text-violet-300
          shadow "0 0 10px rgba(139,92,246,0.15)"
          font-semibold
  Inactivo: bg-white/5, border-white/5, text-white/40
            hover: text-white/70 bg-white/10 border-white/10
  Ícono: 14px
  Label: 10px, tracking-wide
```

**Cards de sliders (font-size, opacity, shadow):**
```
Card: bg-gradient-to-b from-[#18181b] to-[#121214]
      border: white/5, rounded-xl, p-4, space-y-3.5

Header de la card:
  Label izquierda: ícono 10px + texto, text-white/50, 11px
  Badge valor: text-violet-400, 10px, font-mono
               bg-violet-500/10, border-violet-500/15, px-2 py-0.5, rounded

Slider Radix UI:
  Track: bg-white/10
  Range: bg-violet-500
  Thumb: border-violet-500, bg-white, h-3.5 w-3.5

Labels min/max:
  text-white/18, 9px, px-0.5
```

**Selector de color de texto (3 botones):**
```
Grid 3 columns, gap-2
Dot de color: w-2.5 h-2.5, rounded-full, shadow-sm
Activo: bg-white/10, border-white/30, text-white
        shadow "0 0 10px rgba(255,255,255,0.1)"
Inactivo: bg-white/5, border-white/5, text-white/40
```

**Reset de posición:**
```
Container: flex, justify-between, p-3, bg-white/3, border-white/7, rounded-xl
Título: 11px, font-weight 500, text-white/55
Desc: 10px, text-white/25
Botón reset: text-[9px], text-white/30, hover: text-amber-400
             border-white/8, px-2 py-1, rounded, flex items-center gap-1
             <RotateCcw 8px/> Reset
```

---

## 8. Dev Tab

### Request Card:

```
Container: border, rounded-xl, overflow-hidden, transition
  Expandido: bg-[#18181b], border-white/10, shadow-lg
  Colapsado: bg-[#121214], border-white/5, hover: border-white/10

Header button: px-4 py-2.5, flex items-center, gap-2.5

Status icon: 11px
  streaming: dot violeta pulsante (w-2 h-2, shadow "0 0 8px #8b5cf6")
  done: CheckCircle2 emerald-400
  aborted: RefreshCcw amber-400
  error: AlertCircle red-400

Pill de contexto (font-mono, 10px, border, rounded, px-2 py-0.5):
  translate: bg-sky-500/15, text-sky-400, border-sky-500/25
  eval-question: bg-violet-500/15, text-violet-400, border-violet-500/25
  eval-code: bg-emerald-500/15, text-emerald-400, border-emerald-500/25

Preview text: text-white/40, 11px, font-mono, truncate

Total ms: text-white/30, font-mono, 10px
Token count: text-white/30, 10px, bg-white/5, rounded-md, px-2 py-0.5
```

### Histograma LatencyBar:

```
Container: flex items-end, gap-px
Cada barra: w-1, rounded-sm, transition-all
  verde: #34d399 si <50ms
  ámbar: #fbbf24 si 50-150ms
  rojo: #f87171 si >150ms
Opacidad: 0.7 + (index / total) * 0.3 (más opaco lo más reciente)
```

---

## 9. Captions Tab

### Status Card:

```
Card genérica: bg-gradient-to-b from-[#18181b] to-[#121214]
               border: white/5, rounded-xl, p-4

Header: PlaySquare 11px violet-400 + "Estado en vivo" 11px font-weight 600
Botón Refresh: text-[9px], text-white/25, border-white/8, px-1.5 py-0.5, rounded

StatusRow:
  label: text-white/40, 11px
  status con ok=true: text-emerald-400, 11px, dot pulsante si pulse=true
  status con ok=false: text-red-400, 11px, AlertCircle 10px
  divider: divide-y divide-white/5
```

### Toggle Auto-translate:

```
Container: flex, justify-between, p-3.5, rounded-xl, border, transition
  Activo: bg-violet-600/10, border-violet-500/22
  Inactivo: bg-white/3, border-white/7

Ícono Sparkles: 11px, color violet-400 (activo) / white/30 (inactivo)
Título: "Auto EN → ES", 11px, font-weight 500
Desc: "Traducción en tiempo real · IA local", 10px, text-white/30

Switch: data-[state=checked]: bg-violet-600, scale-[0.82]
```

---

## 10. Animaciones Globales

### Glassmorphism del header:

```css
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
background: rgba(18, 18, 20, 0.80);
```

### Cursor parpadeante SSE:

```
width: 3px, height: 14-15px
bg: violet-400 / bg-violet-400
rounded-sm, align-middle
shadow: 0 0 8px #a78bfa
Motion animate: opacity [1, 0, 1]
transition: duration 0.5-0.55, repeat Infinity
```

### Ping dots (conexión activa):

```html
<!-- Ping animado para indicadores de conexión -->
<span class="relative flex h-1.5 w-1.5">
  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/>
  <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_5px_#10b981]"/>
</span>
```

### Transiciones de tabs (AnimatePresence mode="wait"):

```
initial: { opacity: 0 }
animate: { opacity: 1 }
exit: { opacity: 0 }
transition: { duration: 0.14 }
```

### Scrollbar custom:

```css
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.20); }
```

### Motion dots de streaming (3 puntos):

```typescript
{[0,1,2].map(i => (
  <motion.span key={i}
    className="w-1 h-1 rounded-full bg-violet-400"
    animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }}
  />
))}
```

---

## 11. Micro-componentes Reutilizables

### SectionLabel:

```typescript
function SectionLabel({ children }) {
  return (
    <p className="text-white/22 text-[9px] uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}
```

### Card:

```typescript
function Card({ children, className = "" }) {
  return (
    <div className={`bg-gradient-to-b from-[#18181b] to-[#121214] border border-white/5 shadow-sm rounded-xl p-4 ${className}`}>
      {children}
    </div>
  );
}
```

### StatusRow:

```typescript
function StatusRow({ label, status, ok, pulse }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-white/40 text-[11px]">{label}</span>
      <span className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-emerald-400" : "text-red-400"}`}>
        {pulse && ok ? <PingDot /> : ok ? <CheckCircle2 size={10}/> : <AlertCircle size={10}/>}
        {status}
      </span>
    </div>
  );
}
```
