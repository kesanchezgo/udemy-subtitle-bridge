# Kinema — Identidad y presentación
> Marca insignia de **Kivara** para cognición en tiempo real, subtítulos inteligentes y aprendizaje acelerado.

---

## 1. Fundamentos de la Marca
- **Nombre del producto:** **Kinema**. No alternar con “Kinema AI”, “Kivara AI” ni “Udemy Subtitle Bridge” en la interfaz o los mensajes.
- **Firma de marca:** **by Kivara**. Mantener esta escritura exacta; Kivara es la marca matriz, no el nombre de la extensión.
- **Etimología:** Fusión conceptual entre:
  1. **Kinēma** (griego: movimiento / flujo dinámico del video).
  2. **Mnēma** (griego: memoria profunda / retención y fijación cognitiva).
  3. **Kivara** (marca matriz: solidez fonética, tecnología de precisión).
- **Propuesta de Valor:** "Transforma cualquier clase técnica en inglés en retención y maestría instantánea en tu idioma nativo."

---

## 2. Logo, Firma y Colocación
- **Símbolo:** una **K** construida con tres trazos de extremos redondeados (tronco vertical + dos diagonales que parten del mismo punto del tronco) sobre una baldosa cuadrada de esquinas redondeadas (radio 14/48). Sin degradados: un solo violeta sólido más un acento tonal.
- **Paleta del símbolo:**
  | Elemento | Color |
  |---|---|
  | Baldosa | `#6d4aff` (token `--kinema-accent`) |
  | Tronco y diagonal inferior | `#ffffff` |
  | Diagonal superior (acento tonal) | `#d4c9ff` |
- **Geometría (viewBox 48×48, trazo 7, `round` caps):** tronco `(15.5,12.5)→(15.5,35.5)`; diagonal superior `(19,25)→(34,10.5)`; diagonal inferior `(21,24.5)→(35,38.5)`. Fuente maestra en `public/icons/kinema-icon.svg`.
- **Componentes:** `src/app/components/AppLogo.tsx` exporta `KinemaMark` (solo símbolo, escalable por clase) y `KinemaBrand` (símbolo + firma).
- **Firma completa:** símbolo de 46px, “Kinema” a 30px en negrita y debajo “by Kivara” a 13px con tracking 0.14em, precedido de un punto del color de acento. `aria-label`: “Kinema · by Kivara”. Mantener esa escritura exacta; Kivara es la marca matriz, no el nombre de la extensión.
- **Variante compacta (dock contraído):** símbolo de 38px arriba y, debajo, “Kinema · by Kivara” en vertical (`writing-mode: vertical-rl` girado 180°). El símbolo no se rota.
- **Colocación:** cabecera superior izquierda (`ExtensionSidebar`), pantalla de acceso (`AuthGuard`) y dock contraído (`InPageDock`) usan el mismo componente. El chip del mock en `App.tsx` usa solo `KinemaMark`.
- **Tipografía y tema:** familia de sistema (sin Google Fonts en el Shadow DOM). Tamaños, acento y colores de texto viven en `src/app/styles/sepia-overrides.ts` (`--kinema-name-size`, `--kinema-signature-size`, `--kinema-compact-size`, `--kinema-accent`, `--kinema-wordmark`, `--kinema-signature`) y respetan `--usb-scale`. Nombre casi blanco en oscuro y tinta oscura en claro/sepia; el violeta del símbolo es el mismo en ambos temas.
- **Nombres visibles:** Manifest y título del botón del navegador usan “Kinema — by Kivara”. Notificaciones, controles y exportaciones usan “Kinema”. No cambiar identificadores de almacenamiento por motivos de marca.
- **Historial:** esta versión sustituye las propuestas de monograma y la dirección puramente tipográfica anteriores.

### 2.1 Íconos de la extensión (Chrome)
Archivos en `public/icons/` (Vite los copia tal cual a `dist/icons/`):

| Archivo | Tamaño | Dónde lo usa Chrome |
|---|---|---|
| `icon16.png` | 16×16 | Barra de herramientas (1x), favicon de páginas de la extensión |
| `icon32.png` | 32×32 | Barra de herramientas en pantallas HiDPI (2x), menú de extensiones (puzzle) en Windows |
| `icon48.png` | 48×48 | Página `chrome://extensions` |
| `icon128.png` | 128×128 | Instalación y Chrome Web Store (ícono de la extensión) |
| `store-icon-128.png` | 128×128 | Ficha de la Chrome Web Store: 96×96 de arte con 16px de margen transparente, como recomienda Google |
| `icon512.png` | 512×512 | Fuente de alta resolución para pósters, redes o reescalados |
| `kinema-icon.svg` | vectorial | Fuente maestra |

- **Manifest:** `icons` (16, 32, 48, 128) y `action.default_icon` (16, 32, 48, 128) ya apuntan a estos archivos en `public/manifest.json`.
- **Formato:** PNG de 32 bits RGBA con esquinas transparentes. Chrome no admite SVG en `icons` ni en `action.default_icon`.
- **Regenerar:** `node scripts/generate-icons.mjs`. No tiene dependencias: rasteriza la geometría con supersampling 8×8 y escribe los PNG con `zlib`. Si cambia el diseño, editar a la vez la geometría del script, `kinema-icon.svg` y `AppLogo.tsx`.
- **Legibilidad a 16px:** el trazo equivale a ~2.3px, suficiente para que la K se lea; no añadir detalles finos al símbolo.
- **Probar:** `pnpm build`, abrir `chrome://extensions`, activar el modo desarrollador y cargar `dist/` con “Load unpacked”. Si el ícono no cambia, recargar la extensión y fijarla en la barra con el botón de puzzle.

---

## 3. Escala y Proporcionalidad respecto al Navegador
- **Ancho por defecto del Dock:** Aumentado de 500px a **540px** (rango dinámico de 380px a 720px), permitiendo respiración para el código y explicaciones técnicas extensas sin apretar el video.
- **Factor de Escala Tipográfica (calc con `--usb-scale`):** 
  - Se eliminaron fuentes de 7px y 8px en elementos críticos.
  - El piso mínimo de texto secundario se elevó a **9.5px – 11px**.
  - Títulos y etiquetas clave pasaron a **12px – 15px** con interlineado holgado.
  - El espaciado de padding y gaps se incrementó proporcionalmente un 12.5% para que los controles no se sientan compactados frente al viewport de 1080p / 1440p del navegador.

---

## 4. Sistema de Color y Tipografía (marca → interfaz)
Toda la interfaz deriva de la paleta del logo. Fuente única: `src/app/styles/sepia-overrides.ts`.

### 4.1 Escala violeta de marca
Centrada en el color del símbolo (`#6d4aff` = 600). Se declara como `--kinema-50…950` y se asigna a `--color-violet-*`, `--color-purple-*`, `--color-indigo-*` y `--color-fuchsia-*` de Tailwind v4 dentro de `.usb-dock`. Por eso cualquier clase `bg-violet-600`, `text-violet-400`, `ring-violet-500/30`, etc. ya usa la marca en ambos temas, sin tocar los componentes.

| Paso | Hex | Uso |
|---|---|---|
| 50 / 100 | `#f5f2ff` / `#ebe6ff` | Tintes de fondo en claro |
| 200 | `#d4c9ff` | Acento tonal del logo (diagonal superior) |
| 300 / 400 | `#b9a8ff` / `#9a83ff` | Texto de acento en oscuro |
| 500 | `#8463ff` | Hover en CTA, acento en oscuro |
| **600** | **`#6d4aff`** | **Baldosa del logo y CTA sólido** |
| 700 | `#5b37e8` | Hover/pulsado y texto de acento en claro (contraste ~6.6:1 sobre blanco) |
| 800–950 | `#4a2cc2` … `#221360` | Bordes, sombras y fondos profundos |

- **Tema oscuro:** acento `--usb-accent: #8463ff`, suave `rgba(109,74,255,.16)`.
- **Tema claro/sepia:** acento `--usb-accent: #6d4aff`, hover `#5b37e8`. Se eliminó el morado de Udemy (`#a435f0`) y el violeta genérico de Tailwind (`#7c3aed`).
- **Sin degradados bicolor:** los CTA son color sólido; el resplandor viene de una sombra del mismo color (`0 4px 14px rgba(109,74,255,.25)`). Las barras de `CelebrationOverlay` y el halo del Agente de estudio usan solo tonos del mismo color.
- **El mock de Udemy en `App.tsx` conserva su morado `#a435f0`** a propósito: representa la página de Udemy, no la marca.

### 4.2 Neutros con matiz de marca
Ni gris frío ni sepia cálido: todos los neutros llevan un matiz violeta sutil para que fondo, texto y logo compartan temperatura.

| Token | Oscuro | Claro |
|---|---|---|
| `--usb-bg-0` (barras) | `#0b0a10` | `#e9e7f2` |
| `--usb-bg-1` (cabecera) | `#13121a` | `#f2f0f8` |
| `--usb-bg-2` (página) | `#1a1922` | `#f5f4fa` |
| `--usb-bg-3` (tarjetas) | `#15141c` | `#ffffff` |
| `--usb-bg-4` (inputs) | `#0d0c12` | `#eeedf6` |
| Texto principal | `#ffffff` | `#1e1b2e` |
| Texto medio / suave | blanco 72% / 52% | `#4a4660` / `#6b667f` |

- Los fondos fijos en hex de los componentes (`bg-[#121214]`, `bg-[#0f1012]`…) se remapean en CSS al equivalente con matiz, solo cuando la clase es exacta; las variantes con alpha (`bg-[#121214]/80`) no se tocan.
- Los grises cálidos antiguos (`#3d3a38`, `#6e6b68`, `#f0efed`…) siguen existiendo en las clases, pero el tema claro los traduce a los neutros de esta tabla.
- **Colores semánticos** (no son de marca, no cambiar): `emerald` éxito/guardado, `amber` aviso, `red/rose` error, `sky` información/numeración SRT.

### 4.3 Tipografía
- **UI y marca:** una sola familia de sistema, `--kinema-font` (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`), también asignada a `--font-sans`. No se cargan fuentes remotas: el Shadow DOM no las aplica de forma fiable y aumentaría la latencia en Udemy.
- **Monoespaciada** (`font-mono`, timestamps, SRT, código): `--font-mono` = `"JetBrains Mono", "SF Mono", ui-monospace, "Cascadia Code", Consolas`.
- **Marca:** “Kinema” en negrita (700) con `tracking-tight`; “by Kivara” en peso 500 con tracking 0.14em. El contraste jerárquico viene del tamaño y el peso, no de otra familia.
- **Si más adelante se quiere una fuente propia:** empaquetarla en `public/fonts/`, declararla con `@font-face` dentro de `THEME_CSS` (se inyecta en `<head>`, no en el Shadow DOM), exponerla en `web_accessible_resources` y cambiar solo `--kinema-font`.

### 4.4 Reglas de consistencia
1. Un color nuevo de acento se añade a la escala `--kinema-*`, nunca como hex suelto en un componente.
2. CTA: `bg-violet-600` + texto blanco; hover `bg-violet-500`. Sin `bg-gradient-*` en botones.
3. Texto de acento: `text-violet-300/400` en oscuro; el tema claro lo oscurece solo a `#5b37e8` para cumplir contraste AA.
4. Nuevas superficies: usar `--usb-bg-*` y `--usb-fg-*`; si se usa hex fijo, registrarlo en los overrides de ambos temas.
5. Iconos: NUNCA emojis ni Lucide. Usar solo el set propio `components/icons.tsx` (rejilla 24px, trazo 1.75, puntas redondas, acento a .42).
6. Contraste mínimo: texto secundario oscuro ≥ 0.48 de opacidad blanca; claro ≥ `#6b667f` sobre `#f5f4fa` (≥ 4.5:1).

---

## 5. Filosofía de Color & Contraste (histórico)
- **Prohibición de degradados bicolor:** vigente. Sí se permiten sombras y efectos tonales de un solo color.
- **Estados de éxito / guardado:** `Emerald-600` sólido.
- **Contraste modo oscuro:** texto con opacidad mínima de 0.48 para etiquetas secundarias y 0.72–0.95 para cuerpo y títulos.

## 6. Rediseño v2 "Precisión cinematográfica"
- **Dirección:** tinta violeta en oscuro, papel lavanda en claro; acento `#6d4aff` y `#d4c9ff`.
- **Tipografía:** display serif cursiva (Newsreader; fallback Georgia) para titulares (`.kx-display`), Instrument Sans para UI, mono para claquetas (`.kx-slate`). Las fuentes web pueden bloquearse por la CSP de Udemy dentro del Shadow DOM; los fallbacks están definidos.
- **Motivo:** marcas de encuadre en esquinas (`FrameMarks`, `.kx-frame`) en tarjetas hero, preview de video y pantalla de acceso.
- **Navegación:** control segmentado (`.kx-seg`) con iconos propios; el historial abre con el evento `usb:open-history`.
- **Política:** sin emojis en UI, prompts ni servicios (los prompts piden nombres de icono semánticos; el emoji heredado se traduce con `resolveIconName`). Sin degradados bicolor.
- **Capa de estilos:** la sección §27 de `sepia-overrides.ts` define tokens v2 y gana por orden.
