# Udemy Subtitle Bridge — Integración con el DOM de Udemy
> Selectores CSS reales · Arquitectura del player · Estrategia de inyección del overlay y del dock

---

## ⚠️ NOTA CRÍTICA SOBRE CLASES CSS DE UDEMY

Udemy usa **CSS Modules con hashes** en sus clases (ej: `captions-display--captions-cue-text--TQ0DQ`). La parte del hash (`TQ0DQ`) **puede cambiar en cada deploy**.

**Estrategia correcta:**
1. Usar `data-purpose` attributes como selectores primarios (son estables)
2. Las clases CSS como fallback secundario
3. Múltiples selectores en orden de confiabilidad

---

## 1. Selectores de Subtítulos (CRÍTICO)

### 1.1 Selectores verificados del HTML real de Udemy (Mayo 2026)

```typescript
// ✅ MÁS CONFIABLE — data-purpose no cambia con deploys
const CAPTION_SELECTORS_PRIMARY = [
  '[data-purpose="captions-cue-text"]',
];

// ⚠️ CONFIABLE PERO CON HASH — puede cambiar en deploys
const CAPTION_SELECTORS_FALLBACK = [
  '.captions-display--captions-cue-text--TQ0DQ',  // hash actual: TQ0DQ
  '.captions-display--captions-cue-text--ECkct',  // hash anterior
  '.ud-transcript-cue',                           // selector legacy
];

// Selector combinado para el MutationObserver
const SUBTITLE_SELECTORS = [
  '[data-purpose="captions-cue-text"]',
  '.captions-display--captions-cue-text--TQ0DQ',
  '.captions-display--captions-cue-text--ECkct',
  '.ud-transcript-cue',
  '[data-purpose="transcript-cue-active"]',
];
```

### 1.2 Estructura HTML real del elemento de captions

```html
<!-- Contenedor de captions (siempre presente, incluso sin captions activos) -->
<div class="captions-display--captions-container--PqdGQ captions-display--user-inactive--jyzQn">
  
  <!-- Texto del caption activo (este div aparece/desaparece) -->
  <div class="captions-display--captions-cue-text--TQ0DQ"
       data-purpose="captions-cue-text"
       style="font-size: 1.56rem; opacity: 0.75;">
    a high level introduction to what Java is,
  </div>
  
</div>
```

### 1.3 Implementación robusta del MutationObserver

```typescript
// En content_script.ts
function findSubtitleElement(): HTMLElement | null {
  for (const selector of SUBTITLE_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}

function startObserver(): void {
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Estrategia 1: characterData (cambio de texto directo)
      if (mutation.type === 'characterData') {
        const text = mutation.target.textContent?.trim();
        if (text && text !== currentSubtitle) {
          currentSubtitle = text;
          scheduleTranslation(text);
        }
      }
      
      // Estrategia 2: childList (el elemento aparece/desaparece)
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node instanceof HTMLElement) {
            const captionEl = node.matches('[data-purpose="captions-cue-text"]')
              ? node
              : node.querySelector('[data-purpose="captions-cue-text"]');
            
            if (captionEl) {
              const text = captionEl.textContent?.trim();
              if (text && text !== currentSubtitle) {
                currentSubtitle = text;
                scheduleTranslation(text);
              }
            }
          }
        });
      }
    }
  });

  const captionContainer =
    document.querySelector('.captions-display--captions-container--PqdGQ') ??
    document.body;
  
  observer.observe(captionContainer, {
    childList:      true,
    subtree:        true,
    characterData:  true,
  });
}
```

---

## 2. Selectores del Video Player

### 2.1 Estructura HTML del player (Shaka Player)

```html
<!-- Contenedor principal del video player -->
<div class="video-player--container--iXAND udlite-in-udheavy">
  
  <!-- Wrapper con el ID dinámico del player -->
  <div class="video-player--video-wrapper--fh4Nq user-activity--user-inactive--PtWPT"
       id="shaka-video-container-{lectureId}">
    
    <!-- Elemento <video> real -->
    <video class="video-player--video-player--HiAnq"
           id="playerId__{lectureId}--39"
           preload="auto"
           controlslist="nodownload">
    </video>
    
    <!-- Control bar de Shaka -->
    <div id="playerId__{lectureId}--39shaka-mock-vjs-control-bar"
         class="shaka-control-bar--control-bar-wrapper--QAdFg"
         data-purpose="video-control-bar">
      
      <!-- Barra de progreso -->
      <div class="progress-bar--slider--z064U"
           role="slider"
           data-purpose="video-progress-bar"
           aria-label="Progress bar"
           aria-valuenow="68">
      </div>
      
      <button data-purpose="play-button">...</button>
      <button data-purpose="captions-dropdown-button">...</button>
      <button data-purpose="transcript-toggle">...</button>
    </div>
    
    <!-- Captions overlay (AQUÍ se muestran los subtítulos de Udemy) -->
    <div class="captions-display--captions-container--PqdGQ">
      <div data-purpose="captions-cue-text">texto del subtitle</div>
    </div>
    
    <!-- USB Subtitle Overlay (inyectado por el content script) -->
    <!-- <div id="usb-subtitle-overlay" data-usb="1"> ... </div> -->
    
  </div>
</div>
```

### 2.2 Selectores estables del player

```typescript
const PLAYER_SELECTORS = {
  // Para inyectar el subtitle overlay (target de appendChild)
  videoWrapper:           '[id^="shaka-video-container-"]',
  videoWrapperFallback:   '.video-player--video-wrapper--fh4Nq',
  
  // El elemento <video> real
  videoElement:           'video.video-player--video-player--HiAnq',
  videoElementFallback:   '.video-player--container--iXAND video',
  
  // Contenedor de captions (para MutationObserver)
  captionsContainer:      '.captions-display--captions-container--PqdGQ',
  
  // Texto del caption activo
  captionText:            '[data-purpose="captions-cue-text"]',
  
  // Controles
  progressBar:            '[data-purpose="video-progress-bar"]',
  controlBar:             '[data-purpose="video-control-bar"]',
  captionsButton:         '[data-purpose="captions-dropdown-button"]',
};
```

---

## 3. Inyección del Subtitle Overlay

### 3.1 Estrategia

El subtitle overlay usa `position: absolute` relativo al video wrapper:

```typescript
function getOrCreateOverlay(): HTMLElement {
  let el = document.getElementById("usb-subtitle-overlay");
  if (el) return el;
  
  el = document.createElement("div");
  el.id = "usb-subtitle-overlay";
  el.setAttribute("data-usb", "1");
  
  // El overlay es hijo directo del video wrapper
  const videoWrapper =
    document.querySelector<HTMLElement>('[id^="shaka-video-container-"]') ??
    document.querySelector<HTMLElement>('.video-player--video-wrapper--fh4Nq') ??
    document.body;
  
  videoWrapper.style.position = "relative"; // Asegurar contexto
  videoWrapper.appendChild(el);
  
  return el;
}
```

### 3.2 CSS del overlay

```css
/* position: absolute relativo al video wrapper */
/* (no fixed, para que funcione dentro del container normal) */

/* EXCEPTO en fullscreen — ahí usamos fixed: */
/* El video wrapper ES el elemento fullscreen, así que absolute funciona igualmente */
```

---

## 4. Inyección del In-page Dock (Shadow DOM)

### 4.1 Posición del dock en el DOM

```
document.body
└── ... (DOM de Udemy) ...
└── <div id="usb-dock-host">        ← Añadido al final de body
     └── #shadow-root (closed)      ← Shadow DOM completamente aislado
          ├── <style> CSS </style>
          └── <div id="usb-dock-root">
               └── <InPageDock />   ← React app
```

### 4.2 Ajuste del layout de Udemy para el dock

Cuando el dock está visible, necesitamos que el contenido de Udemy
no quede tapado. Lo hacemos ajustando el `margin-right`:

```typescript
// Selectores del contenedor de contenido (en orden de confiabilidad)
const CONTENT_COL_SELECTORS = [
  ".app--content-column--LnPGp",              // Con hash (puede cambiar)
  "[data-purpose='course-taking-container']", // data-purpose (estable si existe)
  ".ud-app-loader",                           // Fallback
];

function adjustUdemyLayout(width: number, collapsed: boolean): void {
  const effectiveWidth = collapsed ? 40 : width;
  
  for (const sel of CONTENT_COL_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el !== document.body) {
      el.style.marginRight = `${effectiveWidth}px`;
      el.style.transition  = "margin-right 0.3s cubic-bezier(0.4,0,0.2,1)";
      return; // Primer match gana
    }
  }
}
```

### 4.3 Posición fija del dock

```css
#usb-dock-root {
  position: fixed;
  top: 48px;                  /* Debajo del navbar de Udemy (h-12 = 48px) */
  right: 0;
  height: calc(100vh - 48px);
  width: var(--dock-width, 360px);
  z-index: 2147483646;        /* Justo debajo del overlay de subtítulos */
  
  /* El dock NUNCA tapa el navbar de Udemy */
  /* El subtitle overlay tiene z-index: 2147483647 (uno más) */
}
```

---

## 5. Layout de Udemy en Modo Lecture — Nueva Arquitectura

### 5.1 Estructura del layout actualizada

```
┌────────────────────────────────────────────────────────────────────────┐
│  NAVBAR (h-12, bg #1c1d1f)                                            │
├──────────────────────────────────────────────────┬─────────────────────┤
│                                                  │                     │
│  .app--content-column--LnPGp                     │  SHADOW ROOT        │
│  (margin-right ajustado dinámicamente)           │  #usb-dock-host     │
│                                                  │                     │
│  ┌────────────────────────────────────────────┐  │  ┌───────────────┐  │
│  │  VIDEO PLAYER (16:9, Shaka)                │  │  │ [▸handle]    │  │
│  │  [id^="shaka-video-container-"]            │  │  │ MetaBar      │  │
│  │                                            │  │  │              │  │
│  │  ← subtitle overlay (absoluto) →           │  │  │ Study Agent  │  │
│  │  <div id="usb-subtitle-overlay">           │  │  │ Captions     │  │
│  │                                            │  │  │ Overlay cfg  │  │
│  └────────────────────────────────────────────┘  │  │              │  │
│                                                  │  │ AuthGuard    │  │
│  TABS (Overview | Q&A | Notes | Learning)        │  └───────────────┘  │
│                                                  │  position: fixed    │
│  ◄────── margin-right: {dockWidth}px ──────────► │  right: 0           │
└──────────────────────────────────────────────────┴─────────────────────┘
         Udemy DOM ajustado                         Shadow DOM aislado
```

**DIFERENCIA CLAVE vs v1.0 (Chrome Side Panel):**
- v1.0: El side panel era EXTERNO al DOM de Udemy (Chrome nativo, fuera del tab)
- v1.1: El dock es INTERNO al DOM (Shadow Root en `document.body`), funciona en fullscreen

### 5.2 User Activity Classes (importantes para el overlay)

```css
/* Se agrega cuando el usuario está inactivo (~3s sin movimiento de mouse) */
.user-activity--user-inactive--PtWPT
.user-activity--hide-when-user-inactive--Oc6Cn  /* aplica display:none */
```

El overlay de subtítulos y el dock **ignoran** estas clases porque:
- El subtitle overlay vive dentro del video wrapper (donde estas clases se aplican)
  pero tiene `z-index: 2147483647` y no tiene estas clases
- El dock vive en el Shadow Root completamente aislado

---

## 6. Detección de Cambio de Lección

```typescript
// Udemy es una SPA — necesitamos detectar navegación sin recarga completa
function observeNavigation(): void {
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl     = location.href;
      lastCapture = "";    // Reset del subtítulo capturado
      customPos   = null;  // Reset de la posición custom del overlay
      
      // Re-renderizar overlay vacío
      const overlayEl = document.getElementById("usb-subtitle-overlay");
      if (overlayEl) overlayEl.style.cssText = buildContainerCSS();
      
      // Notificar al dock
      sendToDock({ type: "SUBTITLE_LINE_RECEIVED", payload: { en: "", ts: Date.now() } });
      
      // Re-verificar captions
      setTimeout(ensureCaptionsEnabled, 1500);
    }
  }).observe(document, { subtree: true, childList: true });
}
```

---

## 7. Activar Captions Automáticamente

```typescript
async function ensureCaptionsEnabled(): Promise<void> {
  const captionsBtn = document.querySelector<HTMLElement>(
    '[data-purpose="captions-dropdown-button"]'
  );
  if (!captionsBtn) return;
  
  const activeCaptionEl = document.querySelector('[data-purpose="captions-cue-text"]');
  if (activeCaptionEl) return; // Ya están activos
  
  captionsBtn.click();
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const captionsMenu = document.querySelector('[data-purpose="captions-dropdown-menu"]');
  if (!captionsMenu) { captionsBtn.click(); return; }
  
  const firstOption = captionsMenu.querySelector<HTMLElement>('button[role="menuitemradio"]');
  if (firstOption) firstOption.click();
  else captionsBtn.click();
}
```

---

## 8. Selectores de Udemy — Tabla de Referencia Completa

| Elemento | Selector Estable | Selector con Hash (puede cambiar) |
|----------|-----------------|-----------------------------------|
| Texto de caption | `[data-purpose="captions-cue-text"]` | `.captions-display--captions-cue-text--TQ0DQ` |
| Container captions | — | `.captions-display--captions-container--PqdGQ` |
| Video wrapper | `[id^="shaka-video-container-"]` | `.video-player--video-wrapper--fh4Nq` |
| Elemento video | `video[id^="playerId__"]` | `video.video-player--video-player--HiAnq` |
| Progress bar | `[data-purpose="video-progress-bar"]` | `.progress-bar--slider--z064U` |
| Control bar | `[data-purpose="video-control-bar"]` | `.shaka-control-bar--control-bar-wrapper--QAdFg` |
| Botón play | `[data-purpose="play-button"]` | — |
| Botón captions | `[data-purpose="captions-dropdown-button"]` | — |
| Botón transcript | `[data-purpose="transcript-toggle"]` | — |
| Lección actual | `li[aria-current="true"]` | `.curriculum-item-link--is-current--2mKk4` |
| Título lección | `[data-purpose="item-title"]` | — |
| Secciones | `[data-purpose="curriculum-section-container"]` | — |
| App course-taking | `.ud-app-loader.ud-component--course-taking--app` | — |
| Columna de contenido | — | `.app--content-column--LnPGp` ⚠️ |
| Siguiente lección | `[data-purpose="go-to-next"]` | — |
| Anterior lección | `[data-purpose="go-to-previous"]` | — |

**⚠️ `.app--content-column--LnPGp`** es el selector que usamos para ajustar el `margin-right` del contenido de Udemy cuando el dock está visible. Es un selector con hash, por lo que debemos tener múltiples fallbacks.

---

## 9. Tiempo del Video (para sync offset)

```typescript
// El progress bar de Udemy expone el tiempo actual via aria-valuetext
// Ejemplo: aria-valuetext="2:09 of 3:08"
function getCurrentVideoTime(): number | null {
  const progressBar = document.querySelector<HTMLElement>(
    '[data-purpose="video-progress-bar"]'
  );
  if (!progressBar) return null;
  
  const valueText = progressBar.getAttribute('aria-valuetext');
  if (!valueText) return null;
  
  const match = valueText.match(/^(\d+):(\d+)/);
  if (!match) return null;
  
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

// Alternativa: escuchar el elemento <video> directamente
function attachVideoTimeListener(): void {
  const videoEl = document.querySelector<HTMLVideoElement>('video[id^="playerId__"]');
  if (!videoEl) return;
  
  videoEl.addEventListener('timeupdate', () => {
    sendToDock({
      type:    'VIDEO_TIME_UPDATE',
      payload: { currentTime: videoEl.currentTime, duration: videoEl.duration }
    });
  });
}
```

---

## 10. Checklist de Integración con Udemy

### ✅ Content Script — Subtitle Capture
- [ ] Detecta `.ud-app-loader.ud-component--course-taking--app` antes de inicializar
- [ ] Usa `[data-purpose="captions-cue-text"]` como selector primario
- [ ] MutationObserver observa `.captions-display--captions-container--PqdGQ`
- [ ] Fallback a `document.body` si el contenedor no existe aún
- [ ] Limpia el MutationObserver al desmontar (`observer.disconnect()`)
- [ ] No interfiere con la actividad de usuario de Udemy

### ✅ Subtitle Overlay
- [ ] Inyectado como hijo del `[id^="shaka-video-container-"]`
- [ ] `position: absolute` relativo al video wrapper
- [ ] `z-index: 2147483647` (máximo)
- [ ] Draggable con pointerdown/pointermove/pointerup
- [ ] Se resetea al cambiar de lección
- [ ] Respeta font-size, opacity, color, shadow desde el dock

### ✅ In-page Dock
- [ ] Host element añadido a `document.body`
- [ ] `attachShadow({ mode: "closed" })`
- [ ] CSS Tailwind inyectado en el Shadow Root
- [ ] React montado en el Shadow Root
- [ ] `position: fixed`, `top: 48px`, `right: 0` (debajo del navbar)
- [ ] `adjustUdemyLayout()` llamado al init y al resize/collapse
- [ ] Dock NO se reinicia al cambiar de lección (persiste)
- [ ] CustomEvents para comunicación con content_script

### ✅ Fullscreen
- [ ] Subtitle overlay visible en fullscreen (`position: absolute` dentro del wrapper)
- [ ] Dock visible en fullscreen (`position: fixed` en el viewport)
- [ ] Ambos tienen `z-index` suficientemente alto
