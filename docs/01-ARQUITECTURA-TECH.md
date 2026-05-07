# Udemy Subtitle Bridge — Arquitectura Técnica
> Estructura de archivos · Servicios · Contratos de datos · Flujo de comunicación

---

## 1. Arquitectura General de la Extensión Chrome

Una extensión Chrome tiene 4 contextos de ejecución separados:

```
┌─────────────────────────────────────────────────────────────────┐
│  PÁGINA WEB (udemy.com/course/*)                                │
│  ┌─────────────────────────────────────────────┐               │
│  │  content_script.ts                           │               │
│  │  - MutationObserver → captura subtítulos EN │               │
│  │  - Inyecta div overlay sobre el video       │               │
│  │  - Escucha mensajes del sidebar             │               │
│  └─────────────┬───────────────────────────────┘               │
└────────────────┼────────────────────────────────────────────────┘
                 │ chrome.tabs.sendMessage / chrome.runtime.sendMessage
                 │ (contentBridge.ts abstrae esto)
┌────────────────▼────────────────────────────────────────────────┐
│  SIDEBAR / POPUP (sidebar.html → App.tsx)                      │
│  ┌─────────────────┐ ┌──────────────────┐ ┌─────────────────┐ │
│  │ StudyAgentTab   │ │ TranslationPipeline│ │  DevTab         │ │
│  │ (Study Agent)   │ │ (Captions tab)    │ │  (Dev Panel)    │ │
│  └─────────────────┘ └──────────────────┘ └─────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   ExtensionSidebar.tsx                   │  │
│  │  (3 tabs: Study | Captions | Overlay + hidden Dev tab)   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│  SERVICE WORKER (background.ts)      │
│  - Registra content script           │
│  - Maneja eventos de instalación     │
│  - Relay opcional de mensajes        │
└──────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│  IA LOCAL EXTERNA                    │
│  http://127.0.0.1:8010               │
│  OpenAI-compatible API               │
│  (LM Studio / Ollama / llama.cpp)    │
└──────────────────────────────────────┘
```

---

## 2. Estructura de Archivos Completa

```
udemy-subtitle-bridge/
├── public/
│   ├── manifest.json         ← Manifest V3 (Chrome) / V2 (Firefox build)
│   ├── icon-16.png           ��� Íconos de la extensión
│   ├── icon-48.png
│   ├── icon-128.png
│   └── sidebar.html          ← HTML de la sidebar/popup
│
├── src/
│   ├── app/                  ← Código de la UI (sidebar)
│   │   ├── App.tsx           ← Root component (en extensión real: sidebar puro)
│   │   ├── routes.tsx        ← React Router (solo si se necesitan sub-rutas)
│   │   │
│   │   ├── components/
│   │   │   ├── ExtensionSidebar.tsx   ← Shell principal con tabs
│   │   │   ├── StudyAgentTab.tsx      ← Agente de estudio pedagógico
│   │   │   ├── TranslationPipeline.tsx ← Pipeline visual EN→ES
│   │   │   ├── DevTab.tsx             ← Panel de debug (oculto)
│   │   │   └── figma/
│   │   │       └── ImageWithFallback.tsx ← Wrapper de img con fallback
│   │   │
│   │   ├── hooks/
│   │   │   └── usePersistedState.ts   ← Estado persistido en chromeStorage
│   │   │
│   │   └── services/
│   │       ├── localAI.ts       ← Traducción + evaluación IA con SSE streaming
│   │       ├── contentBridge.ts ← Abstracción chrome.runtime ↔ window events
│   │       ├── chromeStorage.ts ← Abstracción chrome.storage.sync ↔ localStorage
│   │       ├── debugStore.ts    ← Singleton para telemetría SSE (Dev Tab)
│   │       └── ankiApkg.ts      ← Generador de .apkg (SQLite WASM + JSZip)
│   │
│   ├── content_script.ts      ← Inyectado en udemy.com/course/*
│   │                            Captura subtítulos, inyecta overlay
│   │
│   ├── background.ts           ← Service Worker (registra scripts, relay mensajes)
│   │
│   ├── styles/
│   │   ├── index.css           ← Import de Tailwind
│   │   ├── theme.css           ← Tokens CSS custom (colores, tipografía)
│   │   ├── tailwind.css        ← Config Tailwind v4
│   │   └── fonts.css           ← Import de Google Fonts
│   │
│   └── vite-env.d.ts           ← Types para variables de entorno Vite
│
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   │   ├── localAI.test.ts
│   │   │   ├── contentBridge.test.ts
│   │   │   ├── chromeStorage.test.ts
│   │   │   ├── debugStore.test.ts
│   │   │   └── ankiApkg.test.ts
│   │   └── hooks/
│   │       └── usePersistedState.test.ts
│   ├── component/
│   │   ├── TranslationPipeline.test.tsx
│   │   ├── StudyAgentTab.test.tsx
│   │   └── DevTab.test.tsx
│   └── e2e/
│       ├── subtitle-capture.spec.ts
│       ├── study-agent.spec.ts
│       └── anki-export.spec.ts
│
├── vite.config.ts             ← Vite + @crxjs/vite-plugin + Tailwind
├── manifest.json              ← Fuente de verdad del manifest (copiado a public/)
├── package.json
├── tsconfig.json
├── .eslintrc.json
└── .github/
    └── workflows/
        └── ci.yml             ← Lint + Build + Tests en cada push
```

---

## 3. manifest.json — Configuración Completa

```json
{
  "manifest_version": 3,
  "name": "Udemy Subtitle Bridge",
  "version": "1.0.0",
  "description": "Traduce subtítulos de Udemy al español con IA local. Study Agent con Anki.",
  "icons": {
    "16":  "icon-16.png",
    "48":  "icon-48.png",
    "128": "icon-128.png"
  },
  "action": {
    "default_popup": "sidebar.html",
    "default_icon": { "48": "icon-48.png" }
  },
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://www.udemy.com/*",
    "http://127.0.0.1:8010/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://www.udemy.com/course/*"],
      "js": ["src/content_script.ts"],
      "run_at": "document_idle"
    }
  ],
  "background": {
    "service_worker": "src/background.ts",
    "type": "module"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

**IMPORTANTE sobre CSP:**
- `wasm-unsafe-eval` es necesario para que `sql.js` pueda ejecutar el WASM de SQLite.
- Chrome Web Store permite esto si se justifica correctamente en el Privacy Policy.

---

## 4. Contratos de Servicios

### 4.1 `contentBridge.ts`

**Tipos exportados:**
```typescript
// Todos los mensajes posibles entre sidebar y content script
type BridgeMessageType =
  | "PING"                    // Sidebar → Content: ¿estás ahí?
  | "PONG"                    // Content → Sidebar: sí, activo
  | "OVERLAY_CONFIG_UPDATE"   // Sidebar → Content: nueva config del overlay
  | "AUTO_TRANSLATE_TOGGLE"   // Sidebar → Content: activar/desactivar traducción
  | "SUBTITLE_LINE_RECEIVED"  // Content → Sidebar: nueva línea EN capturada
  | "VIDEO_TIME_UPDATE"       // Content → Sidebar: timestamp actual del video
  | "OVERLAY_RESET_POSITION"; // Sidebar → Content: resetear posición del overlay

interface OverlayConfig {
  show: boolean;              // Mostrar u ocultar overlay
  fontSize: number;           // Tamaño de fuente en px (12-48)
  opacity: number;            // Opacidad del fondo (0-100)
  position: "top" | "center" | "bottom"; // Posición vertical
  textColor: "white" | "yellow" | "cyan"; // Color del texto
  shadowStrength: number;     // Intensidad de sombra (0-100)
  syncOffset: number;         // Offset de sincronización en ms (-2000 a +2000)
}

interface BridgeMessage {
  type: BridgeMessageType;
  payload?: unknown;          // Payload específico según el tipo
}
```

**API pública:**
```typescript
contentBridge.sendToContent(message: BridgeMessage): void
contentBridge.sendToSidebar(message: BridgeMessage): void
contentBridge.onMessageFromContent(cb: (msg: BridgeMessage) => void): () => void
contentBridge.onMessageFromSidebar(cb: (msg: BridgeMessage) => void): () => void
```

**Comportamiento en extensión real:** usa `chrome.tabs.sendMessage` / `chrome.runtime.sendMessage`.
**Comportamiento en preview (Figma Make / browser):** usa `window.dispatchEvent` con `CustomEvent`.

---

### 4.2 `chromeStorage.ts`

**API pública:**
```typescript
chromeStorage.get(keys: string[]): Promise<Record<string, unknown>>
chromeStorage.set(items: Record<string, unknown>): Promise<void>
chromeStorage.onChange(cb: (changes: Record<string, unknown>) => void): () => void
```

**Todas las claves usadas (prefijo `usb_` en localStorage):**

| Clave                     | Tipo              | Defecto          | Descripción                           |
|---------------------------|-------------------|------------------|---------------------------------------|
| `captions_auto_translate` | boolean           | `true`           | Toggle de auto-traducción             |
| `overlay_show`            | boolean           | `true`           | Overlay visible                       |
| `overlay_font_size`       | number[]          | `[24]`           | Tamaño de fuente [min, max, step=2]   |
| `overlay_opacity`         | number[]          | `[85]`           | Opacidad del fondo [0-100]            |
| `overlay_sync_offset`     | number[]          | `[0]`            | Sync offset [-2000, +2000]            |
| `overlay_position`        | string            | `"bottom"`       | top / center / bottom                 |
| `overlay_text_color`      | string            | `"white"`        | white / yellow / cyan                 |
| `overlay_shadow`          | number[]          | `[60]`           | Sombra del texto [0-100]              |
| `agent_selected_obj`      | string            | `"spring-senisenior"` | Objetivo de estudio preseleccionado |
| `agent_custom_obj`        | string            | `""`             | Objetivo custom escrito por el usuario|
| `agent_course_name`       | string            | `"Java In-Depth"` | Nombre del curso                     |
| `agent_lesson_name`       | string            | `"02 - JVM"`     | Nombre de la lección actual           |

---

### 4.3 `localAI.ts`

**Configuración:**
```typescript
const LOCAL_AI_URL = "http://127.0.0.1:8010";
// Modelo: "local-model" (nombre genérico compatible con todos los servidores locales)
```

**Funciones exportadas:**

```typescript
// Traducción (no-streaming)
translateLine(en: string): Promise<AIResponse>

// Traducción (streaming SSE) ← USO PRINCIPAL
translateLineStream(
  en: string,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; content: string }>

// Evaluación de respuesta a pregunta (no-streaming)
evaluateActiveAnswer(
  question: string, expectedAnswer: string,
  studentAnswer: string, bloomLevel: string
): Promise<AIResponse>

// Evaluación de respuesta a pregunta (streaming) ← USO PRINCIPAL
evaluateActiveAnswerStream(
  question: string, expectedAnswer: string,
  studentAnswer: string, bloomLevel: string,
  onToken: (token: string, accumulated: string) => void
): Promise<{ success: boolean; content: string; rating: AIRating }>

// Code review (no-streaming)
evaluateCodeSolution(
  challengeTitle: string, expectedSolution: string, studentCode: string
): Promise<AIResponse>

// Code review (streaming) ← USO PRINCIPAL
evaluateCodeSolutionStream(
  challengeTitle: string, expectedSolution: string, studentCode: string,
  onToken: (token: string, accumulated: string) => void
): Promise<{ success: boolean; content: string; rating: AIRating }>

// Evaluación Feynman (no-streaming)
evaluateFeynman(
  topic: string, modelAnswer: string, studentAnswer: string
): Promise<AIResponse>

// Función interna core SSE (NO exportar en versión de producción simplificada)
streamLocalAI(
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal,
  debugContext?: string
): Promise<{ success: boolean; content: string; error?: string }>
```

**Tipos:**
```typescript
type AIRating = "correct" | "partial" | "wrong" | "unknown";

interface AIResponse {
  success: boolean;
  content: string;
  rating: AIRating;
  error?: string;
}

interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
```

**Lógica de parseRating:**
```
El contenido de la IA se parsea buscando estas cadenas (case-insensitive):
- "correct" si contiene: "[CORRECTO]", "COMPRENSION: PROFUNDA"
- "partial" si contiene: "[PARCIAL]", "COMPRENSION: SOLIDA"
- "wrong"   si contiene: "[INCORRECTO]", "COMPRENSION: BASICA"
- Fallback: contar emojis ✅ vs ❌ — el que más haya determina el rating
- Default: "unknown"
```

---

### 4.4 `debugStore.ts`

**Singleton reactivo** que recopila toda la telemetría de las peticiones SSE.

```typescript
// Tipos
interface SSEToken {
  token: string;
  accumulated: string;
  deltaMs: number;      // ms desde el token anterior
  timestamp: number;    // performance.now()
}

interface DebugRequest {
  id: string;
  context: "translate" | "eval-question" | "eval-code" | "unknown";
  startTs: number;
  tokens: SSEToken[];
  totalMs?: number;
  status: "streaming" | "done" | "error" | "aborted";
}

interface CacheEntry {
  en: string;
  es: string;
  latencyMs: number;
  usedAI: boolean;
  timestamp: number;
}

// API pública
debugStore.startRequest(id: string, context: string): void
debugStore.addToken(id: string, token: string, accumulated: string): void
debugStore.endRequest(id: string, success: boolean, aborted?: boolean): void
debugStore.addCacheEntry(entry: CacheEntry): void
debugStore.subscribe(fn: () => void): () => void  // retorna unsubscribe
debugStore.clear(): void
debugStore.getLatestStats(): { avgDeltaMs, minDeltaMs, maxDeltaMs, tokenCount, totalMs, tokensPerSec } | null
```

**Límites:**
- `MAX_REQUESTS = 15` — mantiene las últimas 15 peticiones.
- `MAX_CACHE = 60` — mantiene las últimas 60 traducciones en caché.

---

### 4.5 `ankiApkg.ts`

**Schema SQLite Anki 2.0 (version 11):**

El archivo `.apkg` es un ZIP con:
- `collection.anki2` — base SQLite con tablas: `col`, `notes`, `cards`, `revlog`, `graves`
- `media` — JSON `{}` (sin archivos multimedia)

**Tablas clave:**
- `col` — 1 fila: configuración global, modelos (note types), decks, dconf
- `notes` — 1 fila por tarjeta: guid, fields (front\x1fback), tags
- `cards` — 1 fila por nota: vincula nota con deck, scheduling data

**API pública:**
```typescript
interface AnkiCardData {
  front: string;   // HTML del frente (con CSS de Prism.js)
  back: string;    // HTML del reverso
  tags: string[];  // Tags de la tarjeta
}

// Construye el .apkg completo y retorna el Uint8Array
buildAnkiApkg(
  cards: AnkiCardData[],
  deckName: string,        // formato: "Curso::Lección"
  modelCss: string,        // CSS completo para las tarjetas
  frontTemplate: string,   // Template HTML del frente
  backTemplate: string,    // Template HTML del reverso
  onProgress?: (msg: string) => void
): Promise<Uint8Array>

// Descarga el .apkg en el navegador
downloadApkg(data: Uint8Array, filename: string): void
```

---

### 4.6 `usePersistedState.ts`

```typescript
// Hook custom que usa chromeStorage para persistir state entre sesiones
function usePersistedState<T>(
  key: string,       // clave en chromeStorage
  defaultValue: T    // valor por defecto si no existe en storage
): [T, (value: T | ((prev: T) => T)) => void]
```

**Comportamiento:**
1. En mount: lee el valor de `chromeStorage.get([key])`.
2. Al hacer setState: llama `chromeStorage.set({ [key]: newValue })`.
3. Escucha cambios externos con `chromeStorage.onChange()` para sincronizar entre tabs.

---

## 5. Flujo de Datos Completo

### 5.1 Flujo de Traducción (Subtitle Pipeline)

```
Udemy Video ──► MutationObserver ──► content_script.ts
                                          │
                              sendToSidebar("SUBTITLE_LINE_RECEIVED", { en, ts })
                                          │
                              ExtensionSidebar.tsx (onMessageFromContent)
                                          │
                              setCurrentEnLine(en)
                                          │
                              TranslationPipeline.tsx
                                   │          │
                       translateLineStream()  mockStream() (fallback)
                                   │
                              localAI.ts
                                   │
                         SSE stream a 127.0.0.1:8010
                                   │
                         token a token ──► setCurrentEs(acc)
                                   │
                         debugStore.addToken()
                                   │
                         Done ──► debugStore.addCacheEntry()
                                          │
                        sendToContent("OVERLAY_CONFIG_UPDATE")
                                          │
                              content_script.ts
                                   │
                         overlay div actualizado con nueva traducción ES
```

### 5.2 Flujo del Study Agent

```
Usuario selecciona objetivo
        │
handleGenerate()
        │
generateContent() [mock síncrono en MVP]
o
generateStudyContentFromAI() [versión con IA local]
        │
StudyContent {
  relevance, keyConcepts, quickWin,
  questions[], application, interviewQ,
  ankiCards[]
}
        │
setContent() ──► renderizar "result" phase
        │
Usuario selecciona confianza (confused/partial/clear/mastered)
        │
visibleQuestions = filter questions by QUESTIONS_FOR[confidence]
        │
Usuario escribe respuesta ──► handleEvalQuestion()
        │
evaluateActiveAnswerStream() ──► streaming feedback
        │
setQuestionFeedbacks ──► AIFeedback component con cursor parpadeante
        │
Si rating !== "wrong" ──► auto-avanzar al siguiente question
        │
Todas respondidas ──► questionsComplete = true
        │
Desafío de código ──► handleEvalApp()
        │
evaluateCodeSolutionStream() ──► code review streaming
        │
sessionComplete = true
        │
handleExport() ──► 3 archivos TXT
o
handleExportApkg() ──► buildAnkiApkg() ──► .apkg download
```

---

## 6. content_script.ts — Arquitectura Interna

```typescript
// Selector CSS del elemento de subtítulos de Udemy
// NOTA: Udemy puede cambiar estas clases. Mantener múltiples selectores.
const SUBTITLE_SELECTORS = [
  '.ud-transcript-cue',                    // Selector principal 2024
  '[data-purpose="transcript-cue-active"]', // Alternativo
  '.captions-display--captions-cue-text--ECkct', // Clase generada
];

// State interno del content script
let currentSubtitle = "";
let overlayEl: HTMLDivElement | null = null;
let overlayConfig: OverlayConfig = { /* defaults */ };
let observer: MutationObserver | null = null;

// 1. Al cargar el video, crear el overlay div
function createOverlay(): void {
  overlayEl = document.createElement('div');
  overlayEl.id = 'usb-overlay';
  overlayEl.style.cssText = `
    position: absolute;
    bottom: 10%;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    pointer-events: none;
    max-width: 80%;
    text-align: center;
  `;
  // Agregar al contenedor del video
  videoContainer.appendChild(overlayEl);
  makeDraggable(overlayEl); // drag con mouse/touch
}

// 2. Observar cambios de subtítulos
function startObserver(): void {
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target as HTMLElement;
      const newText = target.textContent?.trim();
      if (newText && newText !== currentSubtitle) {
        currentSubtitle = newText;
        contentBridge.sendToSidebar({
          type: "SUBTITLE_LINE_RECEIVED",
          payload: { en: newText, ts: Date.now() }
        });
      }
    }
  });
  // Observar el elemento de subtítulos o el documento completo como fallback
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

// 3. Escuchar mensajes del sidebar
contentBridge.onMessageFromSidebar((msg) => {
  if (msg.type === "PING") {
    contentBridge.sendToSidebar({ type: "PONG" });
  }
  if (msg.type === "OVERLAY_CONFIG_UPDATE") {
    overlayConfig = { ...overlayConfig, ...(msg.payload as Partial<OverlayConfig>) };
    updateOverlayStyle();
  }
  if (msg.type === "AUTO_TRANSLATE_TOGGLE") {
    const { active } = msg.payload as { active: boolean };
    if (overlayEl) overlayEl.style.display = active ? 'block' : 'none';
  }
  if (msg.type === "OVERLAY_RESET_POSITION") {
    if (overlayEl) {
      overlayEl.style.transform = 'translateX(-50%)';
      overlayEl.style.bottom = '10%';
      overlayEl.style.left = '50%';
    }
  }
});

// 4. Actualizar overlay con nueva traducción
export function updateOverlayText(es: string): void {
  if (!overlayEl) return;
  overlayEl.innerHTML = `
    <span style="
      background: rgba(0,0,0,${overlayConfig.opacity / 100});
      color: ${overlayConfig.textColor === 'white' ? '#fff' : overlayConfig.textColor === 'yellow' ? '#fde047' : '#67e8f9'};
      font-size: ${overlayConfig.fontSize}px;
      padding: 4px 12px;
      border-radius: 4px;
      display: inline-block;
    ">${es}</span>
  `;
}
```

---

## 7. Configuración de Build — vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      input: {
        sidebar: 'sidebar.html',
      },
    },
  },
  // Necesario para sql.js WASM
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  worker: {
    format: 'es',
  },
  // Permite importar .wasm como URL
  assetsInclude: ['**/*.wasm'],
});
```

---

## 8. TypeScript Config

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitAny": true,
    "skipLibCheck": true,
    "types": ["chrome", "vite/client"]
  },
  "include": ["src", "tests"]
}
```

**Nota:** Instalar `@types/chrome` para tener tipos de la API de extensiones.

---

## 9. CI/CD — GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm tsc --noEmit    # TypeScript check
      - run: pnpm lint            # ESLint
      - run: pnpm test            # Vitest
      - run: pnpm build           # Build de producción
      - uses: actions/upload-artifact@v4
        with:
          name: extension-dist
          path: dist/
```

---

## 10. Consideraciones de Seguridad

1. **CSP de la extensión**: Solo `'self'` para scripts. El WASM necesita `'wasm-unsafe-eval'`.
2. **No hay almacenamiento de datos de usuario**: Solo configuración (overlay, objetivo de estudio). No se recopilan subtítulos del usuario.
3. **IA local**: La comunicación es `127.0.0.1` únicamente — no sale a internet.
4. **Permisos mínimos**: Solo `storage`, `activeTab`, `scripting`. Sin `tabs`, sin `webRequest`.
5. **Content Security Policy en host_permissions**: Solo `udemy.com` y `127.0.0.1:8010`.
6. **Sin datos sensibles en logs**: El debugStore no loguea datos de usuario, solo telemetría de timing.
