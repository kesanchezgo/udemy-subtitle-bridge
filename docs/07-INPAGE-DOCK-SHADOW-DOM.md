# Udemy Subtitle Bridge — In-page Dock con Shadow DOM
> Arquitectura definitiva · Implementación completa · Guía de producción

---

## 1. ¿Por qué In-page Dock? (Decision Record)

### Problema con Chrome Side Panel

| Limitación Side Panel | Impacto en UX |
|---|---|
| Ocupa espacio del chrome del navegador (no de la página) | El video se encoge horizontalmente |
| Desaparece en modo pantalla completa | Caso de uso principal roto |
| El usuario "salta" entre el panel y el video | Rompe el flujo de aprendizaje |
| No puede posicionarse relativo al video | UX desconectada |
| No reacciona visualmente al progreso del video | Limitación técnica real |

### Ventajas del In-page Dock

| Feature | In-page Dock | Side Panel |
|---|---|---|
| Visible simultáneamente con el video | ✅ | ❌ |
| Funciona en fullscreen | ✅ | ❌ |
| CSS completamente aislado | ✅ (Shadow DOM) | ✅ (contexto separado) |
| Resizable por el usuario | ✅ | ❌ |
| Colapsable a pestaña vertical | ✅ | ❌ |
| Acceso síncrono al DOM de Udemy | ✅ | ❌ |
| Mismo proceso que el content script | ✅ | ❌ |
| No requiere permiso `sidePanel` | ✅ | ❌ |
| Funciona en Firefox (Manifest V2/V3) | ✅ | ❌ |

### Referente: Language Reactor (Netflix/YouTube)

Language Reactor es la extensión de referencia para este caso de uso (traducción en tiempo real mientras se ve video). Eligió **100% in-page injection** y tiene millones de usuarios. Su dock lateral es resizable, colapsable, y completamente aislado del DOM de las plataformas de video.

---

## 2. Arquitectura del In-page Dock

```
Chrome Extension
├── content_script.ts          ← Orquestador principal (inyectado en Udemy)
│   │
│   ├── ① SubtitleCapture      ← MutationObserver → detecta subtítulos EN
│   │    └── scheduleTranslation() → Local AI → renderOverlay(es)
│   │
│   ├── ② SubtitleOverlay      ← div absoluto sobre el video (draggable)
│   │    └── id="usb-subtitle-overlay" → position:absolute dentro del video
│   │
│   └── ③ initInPageDock()     ← Crea el Shadow DOM host + monta React
│        │
│        ├── host = <div id="usb-dock-host">  (en document.body)
│        │    └── #shadow-root (mode: "closed")
│        │         ├── <style> Tailwind CSS + dock base styles </style>
│        │         └── <div id="usb-dock-root">
│        │              └── <InPageDock />  ← React app completa
│        │
│        └── adjustUdemyLayout(width) → margen derecho del content col
│
├── background.ts              ← Service Worker (minimal en v1.1)
│   └── chrome.action.onClicked → muestra mini-popup explicativo
│
└── popup.html / popup.tsx     ← Mini popup 400×120px
     └── "El dock está activo en la página de Udemy"
```

### Diagrama de posición en el viewport

```
┌──────────────────────────────────────────────────────┬──────────────────┐
│  UDEMY NAVBAR (h-12, bg #1c1d1f, z-index alto)       │  NAVBAR continúa │
├────────────────────────────────────────────────────┬─┴──────────────────┤
│                                                    │░░░░░░░░░░░░░░░░░░░│
│   VIDEO PLAYER (16:9)                              │ [←] [Shadow DOM]  │
│                                                    │  Subtitle Bridge  │
│   ┌────────────────────────────────────────────┐   │ ┌───────────────┐ │
│   │                                            │   │ │  Study Agent  │ │
│   │  [subtítulo traducido superpuesto]         │   │ │  Captions     │ │
│   │                                            │   │ │  Overlay      │ │
│   └────────────────────────────────────────────┘   │ └───────────────┘ │
│                                                    │                   │
│   TABS: Overview | Q&A | Notes | Learning          │   ExtensionSidebar│
│                                                    │                   │
│ ◄─── margin-right ajustado dinámicamente ────────► │ ◄── width var. ─► │
└────────────────────────────────────────────────────┴───────────────────┘
         Udemy DOM normal                              Shadow Root aislado
                                                      position: fixed
                                                      right: 0, top: 48px
```

---

## 3. Shadow DOM — Implementación Detallada

### 3.1 Por qué Shadow DOM cerrado (`mode: "closed"`)

```typescript
const shadow = host.attachShadow({ mode: "closed" });
//                                          ^^^^^^^^
// "closed" = la referencia al shadow root NO es accesible
// desde el DOM principal ni desde scripts externos.
// Udemy.com no puede acceder a nuestro estado interno.
// Esto protege contra ataques de inyección de scripts de terceros.
```

**Alternativa `"open"`:** Sería suficiente para CSS isolation, pero expone
`host.shadowRoot` al DOM principal. Para una extensión de seguridad, preferimos "closed".

### 3.2 Inyección de CSS en el Shadow Root

```typescript
// PROBLEMA: Tailwind CSS está en el documento principal,
// no en el Shadow Root. Los estilos no penetran el Shadow DOM.

// SOLUCIÓN 1 (recomendada): Inyectar el CSS como <link> en el shadow root
const linkEl = document.createElement("link");
linkEl.rel   = "stylesheet";
linkEl.href  = chrome.runtime.getURL("assets/tailwind.css");
shadow.appendChild(linkEl);

// SOLUCIÓN 2: Inyectar CSS como <style> inline
// (más lento pero funciona sin web_accessible_resources)
const styleEl = document.createElement("style");
styleEl.textContent = await fetch(chrome.runtime.getURL("assets/tailwind.css")).then(r => r.text());
shadow.appendChild(styleEl);

// NOTA: El CSS inyectado en el shadow root NO afecta al DOM principal.
// Los estilos de Udemy NO penetran el shadow root (excepto inherited props
// como font-family, color si no están reseteados con 'all: initial').
```

### 3.3 Reset de estilos heredados

```css
/* En el CSS del dock, siempre añadir al :host */
:host {
  all: initial;              /* Resetea TODOS los estilos heredados */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  color-scheme: dark;
  line-height: 1.5;
}

/* Tailwind preflight también se incluye en el shadow root */
```

### 3.4 React en Shadow Root

```typescript
// En producción, la inicialización del dock React:
import { createRoot } from "react-dom/client";
import { InPageDock } from "./components/InPageDock";

function initInPageDock(): void {
  const host   = document.createElement("div");
  host.id      = "usb-dock-host";
  
  const shadow = host.attachShadow({ mode: "closed" });
  
  // 1. Inyectar Tailwind CSS
  const linkEl = document.createElement("link");
  linkEl.rel   = "stylesheet";
  linkEl.href  = chrome.runtime.getURL("assets/tailwind.css");
  shadow.appendChild(linkEl);
  
  // 2. Crear mount point
  const mountEl = document.createElement("div");
  mountEl.id    = "usb-dock-root";
  shadow.appendChild(mountEl);
  
  document.body.appendChild(host);
  
  // 3. Montar React
  const root = createRoot(mountEl);
  root.render(
    <InPageDock
      onSessionResolved={(session) => {
        // Notificar al service worker si es necesario
        chrome.runtime.sendMessage({ type: "SESSION_CHANGED", payload: { userId: session?.user.id } });
      }}
      localAiConnected={true}
    />
  );
}
```

---

## 4. InPageDock Component — Especificación

### 4.1 Props

```typescript
interface InPageDockProps {
  onSessionResolved: (session: Session | null) => void;
  localAiConnected?: boolean;
}
```

### 4.2 Estado interno

```typescript
const [collapsed,   setCollapsed]   = useState(false);   // dock colapsado
const [width,       setWidth]       = useState(360);      // ancho en px
const [isResizing,  setIsResizing]  = useState(false);    // arrastrando handle
```

### 4.3 Resize handle

```
┌─────────────────────────────────┐
│ · · · · · ←drag handle (5px)   │  ← mousedown inicia resize
│           │                     │
│           │  dock content       │
│           │                     │
└───────────┴─────────────────────┘

Lógica:
  onMouseDown → captura startX, startWidth
  onMouseMove → newWidth = startWidth + (startX - currentX)
                 clamp(newWidth, MIN_WIDTH=300, MAX_WIDTH=560)
  onMouseUp   → persiste en chrome.storage.sync
```

### 4.4 Estado colapsado

```
Expandido:                    Colapsado:
┌──────────────────┐          ┌──┐
│ Shadow DOM│In-page│          │ ← │  ← click para expandir
│ [←]               │          │⚡ │
│                   │          │  │
│  ExtensionSidebar │          │S │
│  (Study/Captions/ │          │B │
│   Overlay tabs)   │          │  │
│                   │          │● │  ← dot AI status
└───────────────────┘          └──┘
   width: 300-560px              40px
```

### 4.5 Meta bar (cabecera del dock)

```
┌─────────────────────────────────────────────────────────────────┐
│ [🛡 Shadow DOM] [● In-page] [~ :8010]          [360px]  [→]    │
└─────────────────────────────────────────────────────────────────┘
  Badges informativos                           Width   Collapse
  (solo visibles en dev/debug mode en producción)
```

---

## 5. Ajuste del Layout de Udemy

### 5.1 El problema

Cuando el dock aparece como `position: fixed`, cubre el contenido de Udemy.
Necesitamos ajustar el `margin-right` del área de contenido de Udemy para que
el video y las tabs "empujen" hacia la izquierda.

### 5.2 Implementación

```typescript
function adjustUdemyLayout(width: number, collapsed: boolean): void {
  const effectiveWidth = collapsed ? 40 : width;
  
  // Selector del contenedor de contenido de Udemy
  // (ver docs/06-UDEMY-HTML-INTEGRACION.md para selectores actualizados)
  const contentCol =
    document.querySelector<HTMLElement>(".app--content-column--LnPGp") ??
    document.querySelector<HTMLElement>("[data-purpose='course-taking-container']") ??
    document.body;
  
  if (contentCol !== document.body) {
    contentCol.style.marginRight = `${effectiveWidth}px`;
    contentCol.style.transition  = "margin-right 0.3s cubic-bezier(0.4,0,0.2,1)";
  }
}
```

### 5.3 Sincronización con resize

Cuando el usuario arrastra el handle de resize, `adjustUdemyLayout` se llama
en cada frame del mousemove para que el video se ajuste en tiempo real.

```typescript
// En el handler de resize del InPageDock
const handleMove = (e: MouseEvent) => {
  const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + (startX - e.clientX)));
  setWidth(newW);
  // Notificar al content_script para ajustar el layout de Udemy
  window.dispatchEvent(new CustomEvent("usb:dock→cs", {
    detail: { type: "DOCK_RESIZE", payload: { width: newW } }
  }));
};
```

---

## 6. Comunicación Dock ↔ Content Script

En producción, el dock vive en el Shadow Root y el content script en el
contexto principal. La comunicación usa `CustomEvents` a través de `window`:

```typescript
// Desde el dock al content script:
window.dispatchEvent(new CustomEvent("usb:dock→cs", {
  detail: { type: "OVERLAY_CONFIG_UPDATE", payload: { fontSize: 28 } }
}));

// Desde el content script al dock:
window.dispatchEvent(new CustomEvent("usb:cs→dock", {
  detail: { type: "SUBTITLE_LINE_RECEIVED", payload: { en: "...", es: "..." } }
}));
```

### Mapa de mensajes

| Evento | Dirección | Payload | Descripción |
|--------|-----------|---------|-------------|
| `OVERLAY_CONFIG_UPDATE` | dock → cs | `Partial<OverlayConfig>` | Usuario cambió config en Overlay tab |
| `AUTO_TRANSLATE_TOGGLE` | dock → cs | `{ active: boolean }` | Toggle de auto-traducción |
| `SUBTITLE_LINE_RECEIVED` | cs → dock | `{ en, es, latencyMs }` | Nueva traducción lista |
| `DOCK_COLLAPSE` | dock → cs | — | Dock se colapsó → ajustar margin |
| `DOCK_EXPAND` | dock → cs | — | Dock se expandió → ajustar margin |
| `DOCK_RESIZE` | dock → cs | `{ width: number }` | Usuario arrastra handle |
| `OVERLAY_RESET_POSITION` | dock → cs | — | Resetear posición del overlay |
| `PING` / `PONG` | bidireccional | — | Health check de conexión |

---

## 7. Configuración de Build (vite.config.ts)

```typescript
import { defineConfig }   from "vite";
import react              from "@vitejs/plugin-react";
import { crx }            from "@crxjs/vite-plugin";
import manifest           from "./manifest.json";
import tailwindcss        from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        // popup mini (ya no es el UI principal)
        popup: "popup.html",
        // El content_script incluye el dock React inline
        // (o se puede separar en un entry point de dock)
      },
    },
  },
  optimizeDeps: { exclude: ["sql.js"] },
  worker:       { format: "es" },
  assetsInclude: ["**/*.wasm"],
});
```

### Estrategia de bundle para el dock

**Opción A: Todo en un content_script.ts (simple)**
```typescript
// content_script.ts importa InPageDock y lo monta
// El bundle incluye React + todos los componentes
// Ventaja: Un solo archivo, fácil de configurar
// Desventaja: Bundle grande (~500KB) que se carga en TODAS las páginas de Udemy
```

**Opción B: Entry point separado para el dock (recomendado)**
```typescript
// content_script.ts: solo lógica de subtítulos (< 20KB)
// dock.tsx: React app del dock (lazy-loaded)

// En content_script.ts:
const script = document.createElement("script");
script.src   = chrome.runtime.getURL("assets/dock.js");
script.type  = "module";
document.head.appendChild(script);
```

---

## 8. Fullscreen Support

Una de las ventajas clave del dock in-page es que funciona en fullscreen.

```typescript
// El dock usa position: fixed — funciona dentro del fullscreen container

// Cuando Udemy entra en fullscreen (Fullscreen API):
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) {
    // El dock y el overlay siguen visibles en fullscreen
    // porque están en el mismo contenedor fullscreen
    console.info("[USB] Fullscreen activo — dock y overlay visibles");
  }
});

// NOTA IMPORTANTE:
// Los elementos position:fixed dentro del fullscreen container
// son renderizados dentro del fullscreen → siguen visibles.
// Esto NO ocurría con el Side Panel (que es externo al tab).
```

---

## 9. Performance

### 9.1 Impacto en el rendimiento de Udemy

| Operación | Costo | Mitigación |
|-----------|-------|------------|
| Shadow Root creation | ~1ms (one-time) | Lazy init 800ms después del load |
| React mount | ~50ms (one-time) | Dock se monta fuera del critical path |
| CSS injection | ~5ms (one-time) | Link tag, no bloquea el render |
| MutationObserver | Muy bajo | Solo observa el caption container |
| adjustUdemyLayout en resize | ~0.5ms/frame | Throttled via requestAnimationFrame |

### 9.2 Memory footprint

```
React + ReactDOM:     ~140KB (gzip: ~45KB)
Tailwind CSS:         ~20KB (purged, gzip: ~5KB)
Extension components: ~80KB (gzip: ~25KB)
Total bundle dock:    ~240KB (gzip: ~75KB)
```

### 9.3 CPU del content script

El `MutationObserver` de subtítulos tiene un costo mínimo porque:
1. Solo observa el subtree del `captions-container` (no el documento completo)
2. Filtra repeticiones con `lastCapture`
3. Tiene debounce de 150ms + syncOffset

---

## 10. Seguridad del Shadow DOM

### 10.1 Aislamiento CSS bidireccional

```
Udemy DOM ←── CSS isolation ──→ Shadow Root
   ↓                                   ↓
Estilos de Udemy NO                Nuestros estilos NO
entran en el dock                  afectan a Udemy
```

### 10.2 JavaScript isolation

El Shadow Root en modo `"closed"` garantiza:
- `document.getElementById("usb-dock-root")` desde Udemy → `null`
- Scripts de analytics de Udemy no pueden leer el contenido del dock
- Los tokens de auth de Supabase no son accesibles desde el DOM principal

### 10.3 XSS prevention

```typescript
// ✅ CORRECTO: Usar React (escapa automáticamente)
<span>{subtitleText}</span>

// ❌ INCORRECTO: innerHTML con contenido externo
element.innerHTML = subtitleText; // Vulnerable a XSS si el texto viene de la IA

// REGLA: Solo usar innerHTML para HTML estático controlado (como el DRAG_HANDLE_HTML)
```

---

## 11. Checklist de Integración In-page Dock

### ✅ Shadow DOM
- [ ] `mode: "closed"` para máximo aislamiento
- [ ] CSS Tailwind inyectado como `<link>` en el shadow root
- [ ] `all: initial` en `:host` para resetear herencia de Udemy
- [ ] React montado en el shadow mount point
- [ ] CustomEvents para comunicación dock ↔ content_script

### ✅ Layout Adjustment
- [ ] `adjustUdemyLayout()` se llama al init con el width guardado
- [ ] Se actualiza en tiempo real durante el resize
- [ ] Se actualiza al collapse/expand
- [ ] Se resetea a 0 en `beforeunload`

### ✅ Resize
- [ ] Handle de resize en el borde izquierdo del dock
- [ ] `MIN_WIDTH = 300px`, `MAX_WIDTH = 560px`
- [ ] Ancho guardado en `chrome.storage.sync` al soltar
- [ ] Ancho restaurado en la siguiente visita

### ✅ Collapse
- [ ] Animación spring al collapse/expand
- [ ] Estado guardado en `chrome.storage.sync`
- [ ] Botón de collapse en la meta bar del dock
- [ ] Pestaña vertical con logo y etiqueta cuando colapsado
- [ ] Click en la pestaña para expandir

### ✅ Fullscreen
- [ ] Dock visible en modo fullscreen de Udemy
- [ ] Overlay de subtítulos visible en fullscreen
- [ ] Ambos usan `position: fixed` (no `absolute`)

### ✅ SPA Navigation
- [ ] `observeNavigation()` detecta cambios de URL (Udemy es React SPA)
- [ ] Al cambiar de lección: resetear `lastCapture`, `customPos`
- [ ] Reinyectar overlay si fue removido del DOM
- [ ] El dock NO se reinicia al cambiar de lección (persiste entre lecciones)
