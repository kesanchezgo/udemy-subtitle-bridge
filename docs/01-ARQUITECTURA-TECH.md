# Udemy Subtitle Bridge — Arquitectura Técnica
> Estructura de archivos · Servicios · Contratos de datos · Flujo de comunicación · Auth · Cloud Sync · Udemy DOM

---

## 1. Arquitectura General de la Extensión Chrome

Una extensión Chrome tiene 4 contextos de ejecución separados:

```
┌─────────────────────────────────────────────────────────────────┐
│  PÁGINA WEB (udemy.com/course/*)                                │
│  ┌─────────────────────────────────────────────┐               │
│  │  content_script.ts                           │               │
│  │  - MutationObserver → captura subtítulos EN  │               │
│  │  - Inyecta div overlay sobre el video        │               │
│  │  - Escucha mensajes del sidebar              │               │
│  └─────────────┬───────────────────────────────┘               │
└────────────────┼────────────────────────────────────────────────┘
                 │ chrome.tabs.sendMessage / chrome.runtime.sendMessage
                 │ (contentBridge.ts abstrae esto)
┌────────────────▼────────────────────────────────────────────────┐
│  SIDE PANEL (Chrome Side Panel API — sidebar.html → App.tsx)   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   AuthGuard.tsx (wraps everything)       │   │
│  │   - Guest mode / Email-Password / Google OAuth           │   │
│  │   - Local→Cloud migration on first login                 │   │
│  │   - Cloud→Local reverse sync on session restore          │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────┐ ┌──────────────────┐ ┌─────────────────┐ │
│  │ StudyAgentTab   │ │ TranslationPipeline│ │  DevTab         │ │
│  │ (Study Agent)   │ │ (Captions tab)    │ │  (Dev Panel)    │ │
│  └─────────────────┘ └──────────────────┘ └─────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   ExtensionSidebar.tsx                   │  │
│  │  (3 tabs: Study | Captions | Overlay + hidden Dev tab)   │  │
│  │  Header: Logo + AI badge + gear + User strip (if authed) │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│  SERVICE WORKER (background.ts)      │
│  - Registra content script           │
│  - Abre Side Panel al hacer click    │
│  - Relay opcional de mensajes        │
└──────────────────────────────────────┘
                 │
┌────────────────▼──────────────────────────────────┐
│  IA LOCAL EXTERNA                                 │
│  http://127.0.0.1:8010 (OpenAI-compatible API)   │
│  (LM Studio / Ollama / llama.cpp)                │
└───────────────────────────────────────────────────┘
                 │
┌────────────────▼──────────────────────────────────┐
│  SUPABASE BACKEND (Deno Edge Functions + KV)      │
│  - Auth (signup, signIn, OAuth)                   │
│  - Cloud sync de notas y progreso                 │
│  - KV store con prefijos por usuario              │
└───────────────────────────────────────────────────┘
```

---

## 2. Estructura de Archivos Completa

```
udemy-subtitle-bridge/
├── public/
│   ├── manifest.json         ← Manifest V3 (Chrome) / V2 (Firefox build)
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── sidebar.html          ← HTML del Side Panel
│
├── src/
│   ├── app/                  ← Código de la UI (sidebar / side panel)
│   │   ├── App.tsx           ← Root component (en extensión real: sidebar puro)
│   │   │                       En el prototipo Figma Make: simula toda la página Udemy
│   │   │
│   │   ├── components/
│   │   │   ├── AuthGuard.tsx          ← Protección de auth + guest mode + cloud sync
│   │   │   ├── ExtensionSidebar.tsx   ← Shell principal con tabs
│   │   │   ├── StudyAgentTab.tsx      ← Agente de estudio pedagógico
│   │   │   ├── NotesTab.tsx           ← Apuntes con sync cloud
│   │   │   ├── LearningToolsTab.tsx   ← Herramientas de aprendizaje
│   │   │   ├── TranslationPipeline.tsx ← Pipeline visual EN→ES
│   │   │   ├── DevTab.tsx             ← Panel de debug (oculto)
│   │   │   ├── AppLogo.tsx            ← Logo SVG de la extensión
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
│   ├── background.ts          ← Service Worker
│   ├── styles/
│   │   ├── index.css
│   │   ├── theme.css          ← Tokens CSS custom
│   │   ├── tailwind.css
│   │   └── fonts.css
│   └── vite-env.d.ts
│
── supabase/
│   └── functions/
│       └── server/
│           ├── index.tsx      ← Servidor Hono (Deno) con todas las rutas
│           └── kv_store.tsx   ← Utilidades del KV store (NO MODIFICAR)
│
├── utils/
│   └── supabase/
│       └── info.tsx           ← projectId y publicAnonKey (NO MODIFICAR)
│
└── docs/
    ├── 00-PLAN-PROYECTO.md
    ├── 01-ARQUITECTURA-TECH.md    (este archivo)
    ├── 02-IMPLEMENTACION-AGENTE.md
    ├── 03-DISEÑO-UI-DETALLADO.md
    ├── 04-PROMPTS-IA-LOCAL.md
    ├── 05-MCP-HERRAMIENTAS.md
    └── 06-UDEMY-HTML-INTEGRACION.md  ← Selectores reales del DOM de Udemy
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
    "default_icon": { "48": "icon-48.png" }
  },
  "side_panel": {
    "default_path": "sidebar.html"
  },
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "sidePanel"
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

**NOTA IMPORTANTE — Chrome Side Panel vs Popup:**
En Chrome Manifest V3 se recomienda usar la **Side Panel API** (`sidePanel`) en lugar de `default_popup`. La extensión se abre como un panel lateral nativo del navegador, **separado del DOM de la página Udemy**. Esto significa:
- El sidebar React corre en su propio contexto aislado
- No hay problemas de z-index ni de CSS con Udemy
- La comunicación con el content script usa `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`
- El background service worker abre el panel con `chrome.sidePanel.open()`

---

## 4. Sistema de Autenticación (AuthGuard.tsx)

### 4.1 Flujo de autenticación

```
App.tsx                  AuthGuard.tsx              Supabase
   │                           │                        │
   ├── onSessionResolved ───►  │                        │
   │                           │── getSession() ──────► │
   │                           │◄── Session | null ───── │
   │                           │                        │
   │   [No session, no guest]  │                        │
   │◄── render auth form ──── │                        │
   │                           │                        │
   │   [User submits email+pw] │                        │
   │                           │── signInWithPassword ► │
   │                           │◄── Session ──────────── │
   │                           │                        │
   │   [First login]           │                        │
   │                           │── POST /migrate ──────► Server
   │                           │   (local→cloud)        │
   │                           │                        │
   │   [Session on mount]      │                        │
   │                           │── GET /migrate ───────► Server
   │                           │   (cloud→local)        │
   │◄── children(session, ──── │                        │
   │     requestLogin,         │                        │
   │     signOut)              │                        │
```

### 4.2 Props de AuthGuard

```typescript
interface AuthGuardProps {
  children: (
    session: Session | null,      // null = guest mode
    requestLogin: () => void,     // llama a esto para salir del guest mode
    signOut: () => void           // cierra sesión y limpia guest key
  ) => React.ReactNode;
  onSessionResolved?: (session: Session | null) => void;  // callback para App.tsx
}
```

### 4.3 Modos de acceso

| Modo | Descripción | Datos |
|------|-------------|-------|
| **Autenticado** | Email+password o Google OAuth | Cloud sync activo |
| **Invitado** | "Continuar sin cuenta" | Solo localStorage |
| **Sin sesión** | Muestra el formulario de auth | N/A |

### 4.4 Claves en localStorage

```
subtitle_bridge_guest_mode              → "true" si usuario eligió modo invitado
subtitle_bridge_migrated_<userId>       → "true" cuando se completó local→cloud
subtitle_bridge_reverse_synced_<userId> → "true" cuando se completó cloud→local
```

### 4.5 AuthGuard en App.tsx — Patrón correcto

**⚠️ CRÍTICO:** El contenedor de 360px DEBE envolver al `<AuthGuard>`, no estar dentro de sus hijos:

```tsx
// ✅ CORRECTO — AuthGuard vive DENTRO del contenedor fijo
<div className="flex flex-col shrink-0" style={{ width: "360px" }}>
  <AuthGuard onSessionResolved={setAppSession}>
    {(session, requestLogin, signOut) => (
      <div className="flex flex-col h-full w-full">
        {/* contenido del sidebar */}
      </div>
    )}
  </AuthGuard>
</div>

// ❌ INCORRECTO — el div 360px está dentro de los hijos, cuando AuthGuard
//   renderiza su propia pantalla de auth, no hay contenedor de ancho fijo
<AuthGuard>
  {(session, requestLogin, signOut) => (
    <div style={{ width: "360px" }}>
      ...
    </div>
  )}
</AuthGuard>
```

---

## 5. Sistema de Notificaciones (Toaster / Sonner)

### 5.1 Posicionamiento

Para este prototipo (simulación de Udemy + sidebar), el Toaster usa:

```tsx
<Toaster
  theme="dark"
  position="bottom-center"      // centrado horizontalmente, abajo
  expand={false}
  gap={8}
  toastOptions={{
    duration: 3500,
    style: {
      background: "rgba(17, 18, 24, 0.45)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      color: "#ffffff",
      borderRadius: "16px",
      padding: "14px 18px",
      fontSize: "13.5px",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 0 20px rgba(139, 92, 246, 0.05)",
      maxWidth: "360px",
    },
  }}
/>
```

**Razonamiento UX:** `bottom-center` es el estándar para apps de productividad y plataformas de e-learning. Aparece en el centro de la pantalla sin bloquear la UI del video ni del sidebar, y es familiar para el usuario.

### 5.2 Sistema de Celebraciones — `CelebrationOverlay.tsx`

Un sistema separado y más impactante para momentos clave. Se activa con la función global `celebrate()`:

```typescript
// Importar desde cualquier componente
import { celebrate } from "./CelebrationOverlay";

// Llamar cuando ocurre un evento importante
celebrate({
  type: "session_complete",
  title: "¡Lección Dominada! 🏆",
  subtitle: "Has completado todos los pasos de esta sesión de estudio",
  icon: "🎓",
});
```

**Tipos de celebración (`CelebrationType`):**

| Tipo | Tamaño | Confetti | Cuándo |
|------|--------|----------|--------|
| `session_complete` | Grande | ✅ | Todos los pasos de estudio completados |
| `question_correct` | Pequeño | ❌ | Pregunta respondida correctamente |
| `cloud_synced` | Pequeño | ❌ | Datos sincronizados a/desde la nube |
| `login_welcome` | Grande | ❌ | Usuario inicia sesión exitosamente |
| `export_done` | Grande | ✅ | Export TXT de tarjetas Anki completado |
| `anki_export` | Grande | ✅ | Paquete .apkg generado exitosamente |
| `streak` | Grande | ✅ | Racha diaria de estudio |

**Características visuales:**
- **Estrictamente SOLO efecto de confeti** sin recuadros ni cards visuales adicionales
- Confetti explosión doble (izquierda + derecha) para tipos con confetti
- Segunda ola de confetti 800ms después para eventos importantes como `session_complete`
- `pointer-events: none` — no bloquea la interacción del usuario
- Sistema minimalista y elegante que no interfiere con el contenido

**Arquitectura (Event-based):**
```typescript
// 1. Función global que despacha un CustomEvent
export function celebrate(config: CelebrationConfig): void {
  window.dispatchEvent(new CustomEvent("usb:celebrate", { detail: config }));
}

// 2. CelebrationOverlay.tsx escucha el evento
window.addEventListener("usb:celebrate", handler);

// 3. CelebrationOverlay se renderiza en App.tsx
<CelebrationOverlay />  // junto al <Toaster />
```

**Patrón de responsabilidad:**
- Toasts (`sonner`) → feedback rápido de acciones menores (shortcut activado, notas exportadas, errores)
- `celebrate()` → feedback impactante para logros y momentos de motivación

### 5.3 Mapa completo de feedback

| Evento | Mecanismo | Config |
|--------|-----------|--------|
| App iniciada | `toast.success` | "Subtitle Bridge activado 🚀" |
| Video pausado/reanudado | `toast` | Con icono ⏸️/▶️ |
| Shortcut Alt+C | `toast.success` | "Captura guardada 📸" |
| Pregunta correcta | `celebrate()` | `question_correct` con elogio aleatorio |
| Lección dominada | `celebrate()` | `session_complete` + confetti |
| Export TXT Anki | `celebrate()` | `export_done` + confetti |
| Export .apkg Anki | `celebrate()` | `anki_export` + confetti |
| Login exitoso | `celebrate()` | `login_welcome` |
| Datos cloud → local | `celebrate()` | `cloud_synced` |
| Datos local → cloud | `celebrate()` | `cloud_synced` |
| Respuesta parcial | `toast.info` | "Vas por buen camino 💡" |
| Export notas .md | `toast.success` | "Notes exported as Markdown 📥" |
| Error .apkg | `toast.error` | Mensaje de error descriptivo |

---

## 6. Cloud Sync — Contratos del Backend

### 6.1 Servidor Hono (supabase/functions/server/index.tsx)

URL base: `https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/signup` | publicAnonKey | Crea usuario con `auth.admin.createUser` |
| GET | `/anki?userId=X` | publicAnonKey | Obtiene tarjetas Anki del usuario |
| POST | `/anki?userId=X` | publicAnonKey | Guarda tarjetas Anki |
| DELETE | `/anki/:id?userId=X` | publicAnonKey | Elimina tarjeta Anki |
| GET | `/progress?userId=X` | publicAnonKey | Obtiene progreso del usuario |
| POST | `/progress?userId=X` | publicAnonKey | Guarda progreso del usuario |
| POST | `/migrate` | access_token | Upload local→cloud (con manifest) |
| GET | `/migrate` | access_token | Download cloud→local (via manifest) |

### 6.2 Patrón del KV Store para Cloud Sync

```
Clave                              Valor
────────────────────────────────────────────────────────────
cloud_<userId>__manifest           string[]  ← lista de keys del usuario
cloud_<userId>_notes_<course>_<lesson>  objeto de nota
user_progress_<userId>             objeto de progreso
anki_<userId>_<cardId>             objeto AnkiCard
```

**⚠️ IMPORTANTE — Por qué el manifest:**
El KV store de Supabase tiene `getByPrefix()` que retorna solo **valores**, no keys. Para poder hacer el reverse sync (cloud→local), necesitamos saber las keys. Por eso se mantiene un **manifest** separado que lista todas las keys del usuario.

### 6.3 Flujo de migración local→cloud (POST /migrate)

```typescript
// El cuerpo del request:
{ items: [{ key: "notes_JavaCourse_Lesson1", value: { text: "..." } }, ...] }

// El servidor:
// 1. Valida el access_token con supabase.auth.getUser()
// 2. Guarda cada item en KV: kv.set(`cloud_${userId}_${key}`, value)
// 3. Actualiza el manifest: kv.set(`cloud_${userId}__manifest`, [...existentes, ...nuevas])
// 4. Retorna: { success: true, migrated: N }
```

### 6.4 Flujo de reverse sync cloud→local (GET /migrate)

```typescript
// El servidor:
// 1. Valida el access_token
// 2. Lee el manifest: kv.get(`cloud_${userId}__manifest`) → string[]
// 3. Para cada key en manifest: kv.get(`cloud_${userId}_${key}`)
// 4. Retorna: { success: true, items: [{ key, value }, ...], count: N }

// El cliente (AuthGuard.tsx):
// 1. Escribe cada item en localStorage con prefijo "usb_"
// 2. Marca como done: localStorage.setItem(`subtitle_bridge_reverse_synced_${userId}`, "true")
```

---

## 7. Contratos de Servicios Internos

### 7.1 `contentBridge.ts`

```typescript
type BridgeMessageType =
  | "PING"
  | "PONG"
  | "OVERLAY_CONFIG_UPDATE"
  | "AUTO_TRANSLATE_TOGGLE"
  | "SUBTITLE_LINE_RECEIVED"
  | "VIDEO_TIME_UPDATE"
  | "OVERLAY_RESET_POSITION";

interface OverlayConfig {
  show: boolean;
  fontSize: number;           // 12-48px
  opacity: number;            // 0-100 (fondo del overlay)
  position: "top" | "center" | "bottom";
  textColor: "white" | "yellow" | "cyan";
  shadowStrength: number;     // 0-100
  syncOffset: number;         // -2000 a +2000 ms
}

// API pública
contentBridge.sendToContent(message: BridgeMessage): void
contentBridge.sendToSidebar(message: BridgeMessage): void
contentBridge.onMessageFromContent(cb: (msg: BridgeMessage) => void): () => void
contentBridge.onMessageFromSidebar(cb: (msg: BridgeMessage) => void): () => void
```

### 7.2 `chromeStorage.ts`

```typescript
chromeStorage.get(keys: string[]): Promise<Record<string, unknown>>
chromeStorage.set(items: Record<string, unknown>): Promise<void>
chromeStorage.onChange(cb: (changes: Record<string, unknown>) => void): () => void
```

**Prefijo en localStorage: `usb_`**

| Clave | Tipo | Default |
|-------|------|---------|
| `captions_auto_translate` | boolean | `true` |
| `overlay_show` | boolean | `true` |
| `overlay_font_size` | number[] | `[24]` |
| `overlay_opacity` | number[] | `[85]` |
| `overlay_position` | string | `"bottom"` |
| `overlay_text_color` | string | `"white"` |
| `overlay_shadow` | number[] | `[60]` |
| `overlay_sync_offset` | number[] | `[0]` |
| `notes_<course>_<lesson>` | string | `""` |

### 7.3 `localAI.ts`

```typescript
// Funciones exportadas
translateLine(en: string): Promise<AIResponse>
translateLineStream(en: string, onToken: (token: string, acc: string) => void, signal?: AbortSignal): Promise<{ success: boolean; content: string }>
evaluateActiveAnswer(question, expectedAnswer, studentAnswer, bloomLevel): Promise<AIResponse>
evaluateActiveAnswerStream(question, expectedAnswer, studentAnswer, bloomLevel, onToken): Promise<{ success: boolean; content: string; rating: AIRating }>
evaluateCodeSolution(title, expectedSolution, studentCode): Promise<AIResponse>
evaluateCodeSolutionStream(title, expectedSolution, studentCode, onToken): Promise<{ success: boolean; content: string; rating: AIRating }>
evaluateFeynman(topic, modelAnswer, studentAnswer): Promise<AIResponse>

type AIRating = "correct" | "partial" | "wrong" | "unknown";
interface AIResponse { success: boolean; content: string; rating: AIRating; error?: string; }
```

### 7.4 `usePersistedState.ts`

```typescript
function usePersistedState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void]
```

### 7.5 `ankiApkg.ts`

```typescript
interface AnkiCardData { front: string; back: string; tags: string[]; }
buildAnkiApkg(cards: AnkiCardData[], deckName: string, modelCss: string, frontTemplate: string, backTemplate: string, onProgress?: (msg: string) => void): Promise<Uint8Array>
downloadApkg(data: Uint8Array, filename: string): void
```

---

## 8. ExtensionSidebar.tsx — Props

```typescript
interface ExtensionSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  session?: Session;            // Session de Supabase (undefined = guest)
  onRequestLogin?: () => void;  // Callback para mostrar el banner de sync
  onSignOut?: () => void;       // Callback para cerrar sesión
}
```

**Header del sidebar (cuando `session` está activo):**
- Strip debajo del logo con: avatar (inicial del email, gradiente violeta), email truncado, indicador de sync pulsante, botón "Salir"
- Animado con `AnimatePresence` (entra/sale con height animation)

**Banner de sync (cuando `!session && onRequestLogin`):**
- Footer del sidebar con botón "Sincronizar en la nube → Login"
- Solo visible en modo invitado

---

## 9. NotesTab.tsx — Props y Features

```typescript
interface NotesTabProps {
  courseName: string;
  lessonName: string;
  session: Session | null;
}
```

**Features:**
- Textarea con autoguardado en `usePersistedState`
- Cuando hay sesión: tarjeta "X apuntes en la nube" con refresh
- Auto-save a cloud debounced (1500ms) via `POST /progress`
- Export Markdown (.md) y Notion

---

## 10. Flujo de Datos Completo

### 10.1 Flujo de Traducción

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
                              localAI.ts → SSE → 127.0.0.1:8010
                                   │
                          token a token ──► setCurrentEs(acc)
                                   │
                          Done ──► debugStore.addCacheEntry()
                                          │
                         sendToContent("OVERLAY_CONFIG_UPDATE")
                                          │
                              content_script.ts
                                   │
                          overlay div actualizado con nueva traducción ES
```

### 10.2 Flujo Auth → Cloud Sync

```
App carga
   │
   ├── [Guest en localStorage] → skip auth, render children(null, ...)
   │
   ├── [Session existente] → reverseSyncFromCloud() → children(session, ...)
   │        │
   │        └── GET /migrate → { items } → escribe en localStorage
   │
   └── [Sin sesión, sin guest] → muestra auth screen inline (360px panel)
            │
            ├── [Google OAuth / Email+Password]
            │        │
            │        └── onAuthStateChange → session detectada
            │                 │
            │                 └── [Primera vez] → migrateLocalDataToCloud()
            │                          │
            │                          └── POST /migrate → KV store
            │
            └── [Continuar sin cuenta] → setIsGuest(true) → children(null, ...)
```

---

## 11. Configuración de Build — vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  build: {
    rollupOptions: { input: { sidebar: 'sidebar.html' } },
  },
  optimizeDeps: { exclude: ['sql.js'] },
  worker: { format: 'es' },
  assetsInclude: ['**/*.wasm'],
});
```

---

## 12. Seguridad

1. **CSP**: Solo `'self'` + `'wasm-unsafe-eval'` para sql.js WASM.
2. **SUPABASE_SERVICE_ROLE_KEY**: Solo en el servidor Deno. NUNCA en el frontend.
3. **Tokens de auth**: Se envían en `Authorization: Bearer <access_token>`, nunca en URL.
4. **IA local**: Solo `127.0.0.1` — no sale a internet.
5. **Permisos mínimos**: `storage`, `activeTab`, `scripting`, `sidePanel`.
6. **No datos sensibles en logs**: debugStore solo loguea timing, no contenido de subtítulos.