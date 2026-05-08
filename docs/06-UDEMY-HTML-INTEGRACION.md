# Udemy Subtitle Bridge — Integración con el DOM de Udemy
> Selectores CSS reales · Arquitectura del player · Estrategia de inyección del overlay

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
          notifySidebar(text);
        }
      }
      
      // Estrategia 2: childList (el elemento aparece/desaparece)
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node instanceof HTMLElement) {
            // Buscar por data-purpose
            const captionEl = node.matches('[data-purpose="captions-cue-text"]')
              ? node
              : node.querySelector('[data-purpose="captions-cue-text"]');
            
            if (captionEl) {
              const text = captionEl.textContent?.trim();
              if (text && text !== currentSubtitle) {
                currentSubtitle = text;
                notifySidebar(text);
              }
            }
          }
        });
      }
    }
  });

  // Observar en el contenedor de captions si existe, sino en document.body
  const captionContainer = document.querySelector('.captions-display--captions-container--PqdGQ')
    ?? document.body;
  
  observer.observe(captionContainer, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: false,
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
      <source src="blob:https://www.udemy.com/..." type="">
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
           aria-valuenow="68"
           aria-valuemin="0"
           aria-valuemax="100">
      </div>
      
      <!-- Controles -->
      <div class="shaka-control-bar--control-bar-container--OfnMI"
           class="user-activity--hide-when-user-inactive--Oc6Cn">
        
        <button data-purpose="play-button">...</button>
        <button data-purpose="captions-dropdown-button">...</button>
        <button data-purpose="transcript-toggle">...</button>
        
      </div>
    </div>
    
    <!-- Captions overlay (AQUÍ se muestran los subtítulos de Udemy) -->
    <div class="captions-display--captions-container--PqdGQ">
      <div data-purpose="captions-cue-text">texto del subtitle</div>
    </div>
    
  </div>
</div>
```

### 2.2 Selectores estables del player

```typescript
const PLAYER_SELECTORS = {
  // Contenedor para inyectar el overlay (target de appendChild)
  videoWrapper: '[id^="shaka-video-container-"]',
  videoWrapperFallback: '.video-player--video-wrapper--fh4Nq',
  
  // El elemento <video> real
  videoElement: 'video.video-player--video-player--HiAnq',
  videoElementFallback: '.video-player--container--iXAND video',
  
  // Contenedor de captions (para MutationObserver)
  captionsContainer: '.captions-display--captions-container--PqdGQ',
  
  // Texto del caption activo
  captionText: '[data-purpose="captions-cue-text"]',
  
  // Progress bar
  progressBar: '[data-purpose="video-progress-bar"]',
  
  // Control bar (se oculta con user-inactive)
  controlBar: '[data-purpose="video-control-bar"]',
  
  // Botón de captions
  captionsButton: '[data-purpose="captions-dropdown-button"]',
};
```

---

## 3. Inyección del Overlay

### 3.1 Estrategia de inyección

```typescript
// En content_script.ts
function createAndInjectOverlay(): void {
  // 1. Encontrar el contenedor del video
  const videoWrapper = 
    document.querySelector<HTMLElement>('[id^="shaka-video-container-"]') ??
    document.querySelector<HTMLElement>('.video-player--video-wrapper--fh4Nq');
  
  if (!videoWrapper) {
    console.warn('[USB] Video wrapper no encontrado, reintentando en 1s...');
    setTimeout(createAndInjectOverlay, 1000);
    return;
  }

  // 2. Crear el overlay div
  overlayEl = document.createElement('div');
  overlayEl.id = 'usb-overlay';
  overlayEl.setAttribute('data-usb', 'true'); // para identificarlo
  
  // 3. Estilos base
  overlayEl.style.cssText = `
    position: fixed;
    bottom: 8%;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    pointer-events: auto;
    user-select: none;
    cursor: grab;
    max-width: 80%;
    text-align: center;
    transition: opacity 0.2s ease;
  `;
  
  // 4. Usar position: fixed (no absolute) para que funcione en fullscreen
  // Nota: cuando Udemy entra en fullscreen, el video usa el Fullscreen API
  // y los elementos con position:fixed dentro del fullscreen container
  // también se muestran en fullscreen.
  
  // 5. Inyectar en el wrapper del video
  videoWrapper.style.position = 'relative'; // asegurar contexto
  videoWrapper.appendChild(overlayEl);
  
  // 6. Hacer draggable
  makeDraggable(overlayEl);
}
```

### 3.2 Posición relativa al player

```typescript
// El overlay usa position:fixed con z-index máximo
// Esto funciona correctamente tanto en modo normal como en fullscreen

// ⚠️ TRAMPA COMÚN: No usar position:absolute relativo al wrapper
// porque el wrapper de Udemy tiene overflow:hidden en algunos layouts.
// position:fixed asegura visibilidad en todos los casos.

// Para el dragging, guardar el offset como % del viewport:
function makeDraggable(el: HTMLElement): void {
  let isDragging = false;
  let startX = 0, startY = 0;
  let elX = 0, elY = 0;

  el.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX - elX;
    startY = e.clientY - elY;
    el.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    elX = e.clientX - startX;
    elY = e.clientY - startY;
    el.style.transform = `translate(${elX}px, ${elY}px)`;
    el.style.left = '0';
    el.style.bottom = 'auto';
    el.style.top = '0';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    el.style.cursor = 'grab';
  });
}
```

---

## 4. Selectores de Navegación y Contexto

### 4.1 Información del curriculum

```typescript
const CURRICULUM_SELECTORS = {
  // Lección actualmente en reproducción
  currentLesson: 'li[aria-current="true"]',
  
  // Título de la lección actual
  currentLessonTitle: 'li[aria-current="true"] [data-purpose="item-title"]',
  
  // Contenedor de secciones del curriculum
  curriculumContainer: '[data-purpose="curriculum-section-container"]',
  
  // Heading de una sección
  sectionHeading: '[data-purpose="section-heading"]',
  
  // Botón siguiente lección
  nextLecture: '[data-purpose="go-to-next"]',
  
  // Botón lección anterior
  prevLecture: '[data-purpose="go-to-previous"]',
  
  // Nombre del curso (en el header de la lección)
  courseTitle: '.curriculum-item-view--course-title--s5jCa',
};

// Uso: obtener lección y sección actual
function getCurrentContext(): { lesson: string; section: string } {
  const lessonEl = document.querySelector('[aria-current="true"] [data-purpose="item-title"]');
  const sectionEl = document.querySelector('[aria-current="true"]')
    ?.closest('[data-purpose^="section-panel-"]')
    ?.querySelector('[data-purpose="section-heading"] button .ud-accordion-panel-title');
  
  return {
    lesson: lessonEl?.textContent?.trim() ?? 'Unknown',
    section: sectionEl?.textContent?.trim() ?? 'Unknown',
  };
}
```

### 4.2 Detectar si estamos en una página de curso

```typescript
// El contenedor principal del course-taking app
const COURSE_TAKING_SELECTOR = '.ud-app-loader.ud-component--course-taking--app';

function isCoursePage(): boolean {
  return !!document.querySelector(COURSE_TAKING_SELECTOR);
}

// La URL también es confiable:
function isCourseUrl(): boolean {
  return /^https:\/\/www\.udemy\.com\/course\/[^/]+\/learn/.test(window.location.href);
}
```

---

## 5. Layout de Udemy en Modo Lecture

### 5.1 Estructura del layout

```
┌─────────────────────────────────────────────────────────┐
│  NAVBAR (h-12, bg #1c1d1f)                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  .app--no-sidebar--oqmAw                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ .app--content-column--LnPGp                      │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │  VIDEO PLAYER (16:9)                       │  │  │
│  │  │  .curriculum-item-view--aspect-ratio-...   │  │  │
│  │  │                                            │  │  │
│  │  │  ← AQUÍ se inyecta el overlay USB →        │  │  │
│  │  │                                            │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │ TABS (Overview | Q&A | Notes | Learning)   │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                                                          │
                                               ┌──────────┴──────────┐
                                               │  CHROME SIDE PANEL  │
                                               │  (browser native,   │
                                               │   not in DOM)       │
                                               │                     │
                                               │  Subtitle Bridge    │
                                               │  Extension UI       │
                                               └─────────────────────┘
```

**⚠️ IMPORTANTE:**
- Udemy en modo lecture usa la clase `app--no-sidebar--oqmAw` → **NO tiene sidebar nativo**
- La extensión usa **Chrome Side Panel API** que es NATIVO del navegador, completamente fuera del DOM de Udemy
- Esto evita todos los conflictos de CSS, z-index y eventos de Udemy
- La comunicación sidebar↔content_script usa `chrome.runtime.sendMessage`

### 5.2 User Activity Classes (importantes para el overlay)

Udemy agrega/quita estas clases según la actividad del usuario:

```css
/* Se agrega cuando el usuario está inactivo (~3s sin movimiento de mouse) */
.user-activity--user-inactive--PtWPT
.user-activity--hide-when-user-inactive--Oc6Cn  /* aplica display:none */
```

El overlay de la extensión debe **ignorar** estas clases ya que vive fuera del DOM de Udemy. Solo necesitamos saber que la barra de controles (`data-purpose="video-controls"`) se oculta con inactividad.

---

## 6. Detección de Cambio de Lección

```typescript
// Udemy es una SPA — necesitamos detectar navegación sin recarga completa
function observeNavigation(): void {
  // Opción 1: Observar cambios en la URL
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      onLectureChange();
    }
  }).observe(document, { subtree: true, childList: true });
  
  // Opción 2: Observar el aria-current de las lecciones
  const curriculumEl = document.querySelector('[data-purpose="curriculum-section-container"]');
  if (curriculumEl) {
    new MutationObserver(() => {
      const current = document.querySelector('li[aria-current="true"] [data-purpose="item-title"]');
      const newLesson = current?.textContent?.trim() ?? '';
      if (newLesson !== currentLesson) {
        currentLesson = newLesson;
        onLectureChange();
      }
    }).observe(curriculumEl, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  }
}

function onLectureChange(): void {
  // Reset overlay position
  if (overlayEl) {
    overlayEl.style.transform = 'translateX(-50%)';
    overlayEl.style.left = '50%';
    overlayEl.style.bottom = '8%';
    overlayEl.style.top = 'auto';
  }
  // Reset subtitle state
  currentSubtitle = '';
  // Notificar al sidebar
  contentBridge.sendToSidebar({ type: 'SUBTITLE_LINE_RECEIVED', payload: { en: '', ts: Date.now() } });
}
```

---

## 7. Activar Captions Automáticamente

```typescript
// Para que el MutationObserver capture texto, los captions deben estar activados en Udemy.
// El content script puede activarlos automáticamente:

async function ensureCaptionsEnabled(): Promise<void> {
  const captionsBtn = document.querySelector<HTMLElement>(
    '[data-purpose="captions-dropdown-button"]'
  );
  
  if (!captionsBtn) return;
  
  // Verificar si ya hay captions activos
  const activeCaptionEl = document.querySelector('[data-purpose="captions-cue-text"]');
  if (activeCaptionEl) return; // ya están activos
  
  // Abrir el menú de captions
  captionsBtn.click();
  
  // Esperar a que el menú se abra
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Buscar el menú de captions
  const captionsMenu = document.querySelector('[data-purpose="captions-dropdown-menu"]');
  if (!captionsMenu) { captionsBtn.click(); return; } // cerrar si falla
  
  // Seleccionar el primer idioma disponible (generalmente "English [CC]" o "English [Auto]")
  const firstOption = captionsMenu.querySelector<HTMLElement>('button[role="menuitemradio"]');
  if (firstOption) {
    firstOption.click();
  } else {
    captionsBtn.click(); // cerrar menú
  }
}
```

---

## 8. Checklist de Integración con Udemy

### ✅ Content Script
- [ ] Detecta `.ud-app-loader.ud-component--course-taking--app` antes de inicializar
- [ ] Usa `[data-purpose="captions-cue-text"]` como selector primario de captions
- [ ] MutationObserver observa el contenedor `.captions-display--captions-container--PqdGQ` cuando existe
- [ ] Fallback a `document.body` si el contenedor no existe aún
- [ ] Overlay usa `position: fixed` con `z-index: 2147483647`
- [ ] Overlay se reinyecta al cambiar de lección (detectado via aria-current)
- [ ] PING/PONG handshake con el sidebar funciona
- [ ] Limpia el MutationObserver al desmontar (`observer.disconnect()`)
- [ ] No interfiere con la actividad de usuario de Udemy (no preventDefault en eventos del player)

### ✅ Overlay UX
- [ ] Draggable con mousedown/mousemove/mouseup
- [ ] Funciona en fullscreen (position:fixed)
- [ ] Se resetea al cambiar de lección
- [ ] Se muestra/oculta según `overlayConfig.show`
- [ ] Respeta font-size, opacity, color, shadow desde el sidebar

### ✅ Side Panel
- [ ] `background.ts` abre el side panel con `chrome.sidePanel.open()` al hacer click en el icono
- [ ] El sidebar React usa `chrome.runtime.sendMessage` para comunicarse (en producción)
- [ ] En el prototipo Figma Make, usa `window.dispatchEvent` via `contentBridge.ts`

---

## 9. Selectores de Udemy — Tabla de Referencia

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
| Siguiente lección | `[data-purpose="go-to-next"]` | — |
| Anterior lección | `[data-purpose="go-to-previous"]` | — |

---

## 10. Variables del Player (para feature de sync offset)

```typescript
// El progress bar de Udemy expone el tiempo actual via aria-valuetext
// Ejemplo: aria-valuetext="2:09 of 3:08"
function getCurrentVideoTime(): number | null {
  const progressBar = document.querySelector<HTMLElement>(
    '[data-purpose="video-progress-bar"]'
  );
  if (!progressBar) return null;
  
  const valueText = progressBar.getAttribute('aria-valuetext');
  // Formato: "2:09 of 3:08" → parsear 2:09 = 129 segundos
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
    contentBridge.sendToSidebar({
      type: 'VIDEO_TIME_UPDATE',
      payload: { currentTime: videoEl.currentTime, duration: videoEl.duration }
    });
  });
}
```
