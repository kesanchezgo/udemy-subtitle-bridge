# Udemy Subtitle Bridge — Arquitectura Técnica
> Estructura de archivos · Servicios · Contratos de datos · Flujo de comunicación · Auth · Cloud Sync · Udemy DOM

---

## 1. Arquitectura General de la Extensión Chrome (v1.1 — In-page Dock)

```
┌─────────────────────────────────────────────────────────────────────┐
│  PÁGINA WEB (udemy.com/course/*)                                    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  content_script.ts                                           │   │
│  │                                                              │   │
│  │  ① SubtitleCapture                                           │   │
│  │    MutationObserver → subtítulos EN → Local AI → overlay ES  │   │
│  │                                                              │   │
│  │  ② SubtitleOverlay                                           │   │
│  │    div absoluto sobre el video · draggable · configurable    │   │
│  │                                                              │   │
│  │  ③ initInPageDock()                                          │   │
│  │    Crea Shadow Root → monta React InPageDock                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  SHADOW ROOT (mode: "closed") — usb-dock-host                │   │
│  │  position: fixed · right: 0 · top: 48px · z-index: max-1    │   │
│  │                                                              │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │  InPageDock.tsx                                        │  │   │
│  │  │  ├── ResizeHandle (borde izquierdo, drag)              │  │   │
│  │  │  ├── MetaBar [Shadow DOM] [In-page] [:8010] [→]        │  │   │
│  │  │  └── AuthGuard.tsx (wraps everything)                  │  │   │
│  │  │       ├── Guest mode / Email-Password / Google OAuth   │  │   │
│  │  │       └── ExtensionSidebar.tsx                         │  │   │
│  │  │            ├── StudyAgentTab (Bloom + Feynman + Anki)  │  │   │
│  │  │            ├── CaptionsTab (TranslationPipeline)       │  │   │
│  │  │            └── OverlayTab (config del subtitle overlay)│  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                 │ chrome.runtime.sendMessage (legacy/background relay)
                 │ CustomEvents window: "usb:dock→cs" / "usb:cs→dock"
┌────────────────▼──────────────────────────────────────────────────┐
│  SERVICE WORKER (background.ts)                                   │
│  - chrome.action.onClicked → muestra mini popup informativo       │
│  - Relay de mensajes opcionales                                   │
└───────────────────────────────────────────────────────────────────┘
                 │
┌────────────────▼──────────────────────────────────────────────────┐
│  IA LOCAL EXTERNA                                                 │
│  http://127.0.0.1:8010 (OpenAI-compatible API)                   │
│  (LM Studio / Ollama / llama.cpp)                                 │
└───────────────────────────────────────────────────────────────────┘
                 │
┌────────────────▼──────────────────────────────────────────────────┐
│  SUPABASE BACKEND (Deno Edge Functions + KV)                      │
│  - Auth (signup, signIn, OAuth)                                   │
│  - Cloud sync de notas y progreso                                 │
└───────────────────────────────────────────────────────────────────┘
```

---

## 2. Estructura de Archivos Completa

```
udemy-subtitle-bridge/
├── public/
│   ├── manifest.json         ← Manifest V3 (Chrome) / V2 (Firefox build)
│   │                           IMPORTANTE: ya NO incluye "sidePanel" permission
│   │                           El dock es in-page, no Chrome Side Panel
│   ├── popup.html            ← Mini popup (400×120px) informativo
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
│
├── src/
│   ├── app/                  ← Código de la UI (dock + componentes React)
│   │   ├── App.tsx           ← Root component
│   │   │                       · En extensión real: se monta en Shadow Root via content_script
│   │   │                       · En prototipo Figma Make: simula toda la página Udemy
│   │   │
│   │   ├── components/
│   │   │   ├── InPageDock.tsx         ← ⭐ NUEVO: wrapper del dock (resize + collapse)
│   │   │   │                             Contiene AuthGuard + ExtensionSidebar
│   │   │   │                             Simula la inyección Shadow DOM en el prototipo
│   │   │   │
│   │   │   ├── AuthGuard.tsx          ← Protección de auth + guest mode + cloud sync
│   │   │   ├── ExtensionSidebar.tsx   ← Shell principal con tabs (Study/Captions/Overlay)
│   │   │   ├── StudyAgentTab.tsx      ← Agente de estudio pedagógico (Bloom + Feynman)
│   │   │   ├── NotesTab.tsx           ← Apuntes con sync cloud
│   │   │   ├── LearningToolsTab.tsx   ← Herramientas de aprendizaje
│   │   │   ├── TranslationPipeline.tsx ← Pipeline visual EN→ES con streaming
│   │   │   ├── DevTab.tsx             ← Panel de debug (oculto, triple-click ⚙)
│   │   │   ├── AppLogo.tsx            ← Logo SVG de la extensión
│   │   │   ├── CelebrationOverlay.tsx ← Confeti para celebraciones
│   │   │   └── figma/
│   │   │       └── ImageWithFallback.tsx ← img con fallback
│   │   │
│   │   ├── hooks/
│   │   │   ├── usePersistedState.ts   ← Estado persistido en chromeStorage
│   │   │   └── useHotkeys.ts          ← Atajos de teclado globales
│   │   │
│   │   └── services/
│   │       ├── localAI.ts       ← Traducción + evaluación IA con SSE streaming
│   │       ├── contentBridge.ts ← Abstracción chrome.runtime ↔ window events
│   │       ├── chromeStorage.ts ← Abstracción chrome.storage.sync ↔ localStorage
│   │       ├── debugStore.ts    ← Singleton para telemetría SSE (Dev Tab)
│   │       ├── ankiApkg.ts      ← Generador de .apkg (SQLite WASM + JSZip)
│   │       └── supabaseClient.ts ← Singleton createClient(SUPABASE_URL, ANON_KEY)
│   │
│   ├── content_script.ts      ← Inyectado en udemy.com/course/*
│   │                             Tres responsabilidades:
│   │                             ① Captura subtítulos (MutationObserver)
│   │                             ② Subtitle overlay (div sobre el video)
│   │                             ③ initInPageDock() — Shadow DOM + React mount
│   │
│   ├── background.ts          ← Service Worker (minimal)
│   ├── styles/
│   │   ├── index.css
│   │   ├── theme.css          ← Tokens CSS custom
│   │   ├── tailwind.css       ← También se inyecta en el Shadow Root
│   │   └── fonts.css
│   └── vite-env.d.ts
│
├── supabase/
│   └── functions/
│       └── server/
│           ├── index.tsx      ← Servidor Hono (Deno)
│           └── kv_store.tsx   ← KV store utilities
│
└── docs/
    ├── 00-PLAN-PROYECTO.md
    ├── 01-ARQUITECTURA-TECH.md    (este archivo)
    ├── 02-IMPLEMENTACION-AGENTE.md
    ├── 03-DISEÑO-UI-DETALLADO.md
    ├── 04-PROMPTS-IA-LOCAL.md
    ├── 05-MCP-HERRAMIENTAS.md
    ├── 06-UDEMY-HTML-INTEGRACION.md ← Selectores reales del DOM de Udemy
    └── 07-INPAGE-DOCK-SHADOW-DOM.md ← ⭐ NUEVO: guía completa del dock
```

---

## 3. manifest.json — v1.1.0

```json
{
  "manifest_version": 3,
  "name": "Udemy Subtitle Bridge",
  "version": "1.1.0",
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "tabs"
  ],
  "host_permissions": [
    "https://*.udemy.com/*",
    "http://127.0.0.1:8010/*"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": { "48": "icons/icon48.png" }
  },
  "content_scripts": [
    {
      "matches": ["https://*.udemy.com/course/*"],
      "js": ["assets/content_script.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["assets/*", "icons/*"],
      "matches": ["https://*.udemy.com/*"]
    }
  ]
}
```

**NOTA IMPORTANTE — v1.1.0 vs v1.0.0:**
- ✅ **ELIMINADO**: `"sidePanel"` permission — ya no usamos Chrome Side Panel API
- ✅ **ELIMINADO**: `"side_panel": { "default_path": "sidebar.html" }`
- ✅ **MANTENIDO**: Todos los demás permisos (`storage`, `activeTab`, `scripting`, `tabs`)
- ✅ **NUEVO**: El dock in-page no requiere permisos adicionales
- ✅ **NUEVO**: `popup.html` es un mini popup informativo (no el UI principal)

---

## 4. Sistema de Autenticación (AuthGuard.tsx)

### 4.1 Posición en la arquitectura

**⚠️ CRÍTICO — AuthGuard vive DENTRO del InPageDock:**

```tsx
// ✅ CORRECTO v1.1 — AuthGuard dentro del Shadow Root, dentro de InPageDock
// InPageDock.tsx:
<div style={{ width: dockWidth }}>  {/* InPageDock controla el ancho */}
  <AuthGuard onSessionResolved={onSessionResolved}>
    {(session, requestLogin, signOut) => (
      <ExtensionSidebar session={session} ... />
    )}
  </AuthGuard>
</div>

// ❌ INCORRECTO — AuthGuard fuera del contenedor de ancho fijo
// Cuando AuthGuard renderiza su pantalla de login, no habría contenedor
```

### 4.2 Flujo de autenticación (sin cambios desde v1.0)

```
App carga (Shadow Root)
   │
   ├── [Guest en localStorage] → skip auth, render children(null, ...)
   │
   ├── [Session existente] → reverseSyncFromCloud() → children(session, ...)
   │        └── GET /migrate → { items } → escribe en localStorage
   │
   └── [Sin sesión, sin guest] → muestra auth screen (llena el InPageDock)
            ├── [Google OAuth / Email+Password]
            │        └── [Primera vez] → migrateLocalDataToCloud()
            └── [Continuar sin cuenta] → children(null, ...)
```

---

## 5. Sistema de Notificaciones

### 5.1 Toast (Sonner) — sin cambios

```tsx
<Toaster theme="dark" position="bottom-center" />
```

Los toasts aparecen en el **DOM principal** (no en el Shadow Root) porque:
- Son notificaciones globales visibles sobre toda la página
- No necesitan aislamiento CSS del dock
- El `<Toaster>` se monta en `App.tsx` (prototipo) o en el DOM principal (producción)

### 5.2 CelebrationOverlay (confeti) — sin cambios

El overlay de celebración también vive en el DOM principal, con `pointer-events: none`.

---

## 6. Cloud Sync — Contratos del Backend (sin cambios desde v1.0)

Ver sección completa en versión anterior. Los endpoints no cambian.

URL base: `https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/signup` | Crea usuario |
| GET/POST | `/anki?userId=X` | Tarjetas Anki |
| GET/POST | `/progress?userId=X` | Progreso |
| POST | `/migrate` | Local → cloud |
| GET | `/migrate` | Cloud → local |

---

## 7. Contratos de Servicios Internos (sin cambios desde v1.0)

### 7.1 `contentBridge.ts` — actualizado para in-page

```typescript
// En producción (extensión real), usa CustomEvents en lugar de chrome.runtime:
type BridgeMessageType =
  | "PING" | "PONG"
  | "OVERLAY_CONFIG_UPDATE"
  | "AUTO_TRANSLATE_TOGGLE"
  | "SUBTITLE_LINE_RECEIVED"
  | "VIDEO_TIME_UPDATE"
  | "OVERLAY_RESET_POSITION"
  | "DOCK_READY"           // ← NUEVO: dock ha terminado de montar
  | "DOCK_COLLAPSE"        // ← NUEVO: dock colapsado por el usuario
  | "DOCK_EXPAND"          // ← NUEVO: dock expandido por el usuario
  | "DOCK_RESIZE";         // ← NUEVO: usuario arrastra el resize handle

// Canal dock → content_script:  CustomEvent "usb:dock→cs"
// Canal content_script → dock:  CustomEvent "usb:cs→dock"
```

### 7.2 `InPageDock.tsx` — props públicas

```typescript
interface InPageDockProps {
  onSessionResolved: (session: Session | null) => void;
  // Elevado a App.tsx para que NotesTab y LearningToolsTab compartan la sesión

  localAiConnected?: boolean;
  // Muestra el badge ":8010" en verde o gris en la meta bar del dock
}
```

---

## 8. ExtensionSidebar.tsx — Props (sin cambios)

```typescript
interface ExtensionSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  session?: Session;
  onRequestLogin?: () => void;
  onSignOut?: () => void;
}
```

---

## 9. Flujo de Datos Completo

### 9.1 Flujo de Traducción (actualizado)

```
Udemy Video ──► MutationObserver (content_script.ts)
                      │
              scheduleTranslation(en)
                      │
              translateEN() → Local AI → es
                      │
              ┌───────┴────────────────────────────┐
              │                                    │
       renderOverlay(es)              sendToDock({ SUBTITLE_LINE_RECEIVED })
              │                                    │
    SubtitleOverlay div               CustomEvent "usb:cs→dock"
    sobre el video                              │
                                    InPageDock → ExtensionSidebar
                                    TranslationPipeline.tsx
                                    setCurrentEs(es)
```

### 9.2 Flujo de Config del Overlay

```
Usuario mueve slider en OverlayTab
      │
ExtensionSidebar → contentBridge.sendToContent(OVERLAY_CONFIG_UPDATE)
      │
CustomEvent "usb:dock→cs"
      │
content_script.ts recibe → config = { ...config, ...payload }
      │
renderOverlay(lastCapture) → DOM actualizado
```

---

## 10. Configuración de Build — vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react            from '@vitejs/plugin-react';
import { crx }          from '@crxjs/vite-plugin';
import manifest         from './manifest.json';
import tailwindcss      from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: { popup: 'popup.html' },
    },
  },
  // content_script.ts es un entry point automático via crx() plugin
  optimizeDeps: { exclude: ['sql.js'] },
  worker:       { format: 'es' },
  assetsInclude: ['**/*.wasm'],
});
```

---

## 11. Seguridad

1. **Shadow DOM closed**: `mode: "closed"` → el contenido del dock no es accesible desde el DOM principal.
2. **CSP**: Solo `'self'` + `'wasm-unsafe-eval'` para sql.js WASM.
3. **SUPABASE_SERVICE_ROLE_KEY**: Solo en el servidor Deno. NUNCA en el frontend.
4. **Tokens de auth**: Se envían en `Authorization: Bearer <access_token>`.
5. **IA local**: Solo `127.0.0.1` — no sale a internet.
6. **Permisos mínimos**: `storage`, `activeTab`, `scripting`, `tabs` — sin `sidePanel`.
7. **Sin innerHTML con datos externos**: Todo el HTML dinámico pasa por React (escaping automático).

---

## 12. Comparativa Arquitecturas v1.0 vs v1.1

| Aspecto | v1.0 Chrome Side Panel | v1.1 In-page Dock |
|---------|------------------------|-------------------|
| Posición | Chrome nativo (fuera del DOM) | Inyectado en el DOM de Udemy |
| CSS isolation | Contexto separado | Shadow DOM `mode: "closed"` |
| Fullscreen | ❌ Desaparece | ✅ Permanece visible |
| Video + Panel simultáneo | ❌ Solo con ventana dividida | ✅ Nativo |
| Resize por usuario | ❌ Fijo | ✅ 300–560px |
| Collapse | ❌ No | ✅ Pestaña vertical |
| Permiso adicional | `sidePanel` | Ninguno adicional |
| Firefox compatible | ❌ Chrome-only API | ✅ Shadow DOM estándar |
| Comunicación con CS | `chrome.runtime.sendMessage` | `CustomEvents` en `window` |
| Complejidad de setup | Baja | Media (Shadow DOM init) |
| UX aprendizaje | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
