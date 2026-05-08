# Udemy Subtitle Bridge — Guía de Implementación para Agente IA
> Instrucciones paso a paso para GPT-4.1-mini · Orden estricto · Patrones exactos

---

## ⚠️ INSTRUCCIONES CRÍTICAS PARA EL AGENTE

1. **LEER ESTE DOC COMPLETO** antes de escribir cualquier línea de código.
2. **SEGUIR EL ORDEN** de implementación exactamente como se indica. No saltar pasos.
3. **USAR LOS PROMPTS** del doc `04-PROMPTS-IA-LOCAL.md` sin modificarlos.
4. **REPLICAR EL DISEÑO** del doc `03-DISEÑO-UI-DETALLADO.md` con exactitud.
5. **USAR context7 MCP** antes de usar cualquier API de librería desconocida.
6. **VERIFICAR package.json** antes de instalar cualquier paquete.
7. **NO INVENTAR** interfaces de servicios. Usar exactamente las del doc `01-ARQUITECTURA-TECH.md`.

---

## MÓDULO 0 — Setup del Proyecto (Sprint 0)

### Prompt para el agente:
```
Crea el scaffold completo del proyecto de extensión Chrome. 
Usa Vite 5 + React 18 + TypeScript + Tailwind CSS v4 + @crxjs/vite-plugin.
Sigue EXACTAMENTE la estructura de archivos del doc 01-ARQUITECTURA-TECH.md, sección 2.
```

### Pasos detallados:

**0.1 Crear proyecto Vite:**
```bash
pnpm create vite@latest udemy-subtitle-bridge -- --template react-ts
cd udemy-subtitle-bridge
pnpm install
```

**0.2 Instalar dependencias de producción:**
```bash
pnpm add motion lucide-react @radix-ui/react-switch @radix-ui/react-slider
pnpm add sql.js jszip
pnpm add tailwind-merge class-variance-authority clsx
pnpm add react-router
```

**0.3 Instalar dependencias de desarrollo:**
```bash
pnpm add -D @crxjs/vite-plugin @tailwindcss/vite tailwindcss
pnpm add -D @types/chrome vitest @testing-library/react @testing-library/jest-dom
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

**0.4 Crear manifest.json** (copiar del doc `01-ARQUITECTURA-TECH.md`, sección 3).

**0.5 Configurar vite.config.ts** (copiar del doc `01-ARQUITECTURA-TECH.md`, sección 7).

**0.6 Verificación:** `pnpm build` debe generar `dist/` sin errores.

---

## MÓDULO 1 — Servicios Base (Sprint 0-1)

### Orden de implementación de servicios:
1. `chromeStorage.ts` (independiente, sin dependencias)
2. `debugStore.ts` (independiente, sin dependencias)
3. `contentBridge.ts` (independiente, sin dependencias)
4. `usePersistedState.ts` (depende de chromeStorage)
5. `localAI.ts` (depende de debugStore)
6. `ankiApkg.ts` (independiente, solo sql.js + jszip)

### 1.1 — `src/app/services/chromeStorage.ts`

**Instrucción al agente:**
```
Implementa chromeStorage.ts con el contrato exacto del doc 01, sección 4.2.
- En contexto de extensión Chrome: usa chrome.storage.sync
- En contexto de browser/preview: usa localStorage con prefijo "usb_"
- El prefijo en localStorage es "usb_" para todas las claves
- onChange debe funcionar en ambos contextos
```

**Patrón clave:**
```typescript
function isChromeStorage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome?.storage?.sync?.get === "function"
  );
}
```

---

### 1.2 — `src/app/services/debugStore.ts`

**Instrucción al agente:**
```
Implementa debugStore.ts como un singleton de clase.
- Mantiene últimas 15 peticiones (MAX_REQUESTS = 15)
- Mantiene últimas 60 entradas de caché (MAX_CACHE = 60)
- Sistema de suscripción reactivo (subscribe/notify)
- Calcula deltaMs entre tokens usando performance.now()
- getLatestStats() retorna stats de la petición más reciente completada
```

---

### 1.3 — `src/app/services/contentBridge.ts`

**Instrucción al agente:**
```
Implementa contentBridge.ts con el contrato exacto del doc 01, sección 4.1.
Exportar exactamente estos 4 métodos:
- sendToContent(message)
- sendToSidebar(message)
- onMessageFromContent(callback) → retorna función unsubscribe
- onMessageFromSidebar(callback) → retorna función unsubscribe

Exportar también: BridgeMessageType, OverlayConfig, BridgeMessage
```

---

### 1.4 — `src/app/hooks/usePersistedState.ts`

**Instrucción al agente:**
```
Implementa usePersistedState como un hook React que:
1. Al montar: lee el valor de chromeStorage.get([key])
2. Mientras carga: usa el defaultValue
3. Al hacer setState: guarda en chromeStorage.set()
4. Escucha cambios externos con chromeStorage.onChange()
5. La firma debe ser idéntica a useState: [value, setter]
6. El setter debe soportar función updater: setter(prev => newValue)
```

**Implementación de referencia:**
```typescript
export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = React.useState<T>(defaultValue);
  const initialized = React.useRef(false);

  // Carga inicial desde storage
  React.useEffect(() => {
    chromeStorage.get([key]).then((data) => {
      if (data[key] !== undefined) {
        setState(data[key] as T);
      }
      initialized.current = true;
    });

    // Escuchar cambios externos (otra pestaña, popup, etc.)
    return chromeStorage.onChange((changes) => {
      if (key in changes) {
        setState(changes[key] as T);
      }
    });
  }, [key]);

  const persistedSetState = React.useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === "function"
          ? (value as (p: T) => T)(prev)
          : value;
        if (initialized.current) {
          chromeStorage.set({ [key]: next });
        }
        return next;
      });
    },
    [key]
  );

  return [state, persistedSetState];
}
```

---

### 1.5 — `src/app/services/localAI.ts`

**Instrucción al agente:**
```
Implementa localAI.ts con estas funciones en este orden:
1. callLocalAI() — función privada, fetch no-streaming
2. parseRating() — función privada, extrae rating del texto
3. streamLocalAI() — función privada, SSE reader con buffer
4. translateLine() — traducción no-streaming (wrapper)
5. translateLineStream() — traducción streaming (wrapper)
6. buildTranslateMessages() — construye los mensajes para traducción
7. buildEvalQuestionMessages() — construye mensajes para evaluar preguntas
8. evaluateActiveAnswer() — no-streaming
9. evaluateActiveAnswerStream() — streaming
10. buildCodeReviewMessages() — construye mensajes para code review
11. evaluateCodeSolution() — no-streaming
12. evaluateCodeSolutionStream() — streaming
13. evaluateFeynman() — no-streaming

CRÍTICO para streamLocalAI():
- Usar buffer de líneas para manejar chunks TCP parciales:
  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split("\n")
  buffer = lines.pop() ?? ""  ← guarda la línea incompleta
- Líneas que empiezan con "data: " son eventos SSE
- Si el payload es "[DONE]", terminar el loop
- Ignorar líneas que no empiecen con "data: "
- Manejar JSON.parse que puede fallar en chunks malformados

CRÍTICO para debugStore:
- Importar debugStore con lazy import para evitar dependencias circulares:
  const { debugStore } = await import("./debugStore");
- Generar reqId como: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
- Llamar debugStore.startRequest() al inicio
- Llamar debugStore.addToken() en cada token
- Llamar debugStore.endRequest() al final o en catch

USA EXACTAMENTE LOS PROMPTS DEL DOC 04-PROMPTS-IA-LOCAL.md
```

---

### 1.6 — `src/app/services/ankiApkg.ts`

**Instrucción al agente:**
```
Implementa ankiApkg.ts que genera un archivo .apkg real (SQLite + ZIP).
El schema SQLite es el del doc 01, sección 4.5.
CRÍTICO:
- Inicializar sql.js con: await initSqlJs({ locateFile: () => sqlWasmUrl })
- Importar el WASM con: import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url"
- Separador de campos Anki: ASCII 31 (\x1f)
- deckId = Date.now() (precisión ms)
- modelId = Date.now() + 1
- noteId = nowSec * 1000 + i
- cardId = nowSec * 1000 + i + 100_000
- El modelo se llama "SubtitleBridge"
- 2 campos: "Front" y "Back"
- 1 template: "Card 1"
- La card tiene: type=0, queue=0, due=cards.length-i (reversed order)
- Después de INSERT: db.export() retorna Uint8Array del SQLite
- ZIP: collection.anki2 (el Uint8Array) + media ("{}" como string)
- ZIP: compression DEFLATE level 6
```

---

## MÓDULO 2 — Content Script (Sprint 1)

### 2.1 — `src/content_script.ts`

**Instrucción al agente:**
```
Implementa el content script que se inyecta en udemy.com/course/*.
Funcionalidades requeridas:
1. Detectar el contenedor del video player de Udemy
2. Crear el div overlay con id="usb-overlay" dentro del video container
3. Hacer el overlay arrastrable (drag con mousedown/mousemove/mouseup)
4. Iniciar MutationObserver sobre document.body (childList: true, subtree: true, characterData: true)
5. En el observer: detectar cambios en elementos que coincidan con los selectores de subtítulos
6. Enviar SUBTITLE_LINE_RECEIVED cuando el texto cambie
7. Escuchar mensajes del sidebar via contentBridge.onMessageFromSidebar()
8. Responder a PING con PONG
9. Responder a OVERLAY_CONFIG_UPDATE actualizando el estilo del overlay
10. Responder a AUTO_TRANSLATE_TOGGLE mostrando/ocultando el overlay
11. Responder a OVERLAY_RESET_POSITION reseteando la posición
12. Limpiar el observer al desmontar (cuando la página cambia)

SELECTORES de subtítulos de Udemy (probar en orden):
  '.ud-transcript-cue'
  '[data-purpose="transcript-cue-active"]'
  '.captions-display--captions-cue-text--ECkct'
  '.captions-display--captions-container--k9HXu span'

ESTILO base del overlay div:
  position: fixed (no absolute — para que funcione con fullscreen)
  bottom: 8%
  left: 50%
  transform: translateX(-50%)
  z-index: 2147483647 (máximo z-index)
  pointer-events: auto (para drag)
  user-select: none
  cursor: grab
```

---

## MÓDULO 3 — UI del Sidebar (Sprint 1-2)

### 3.1 — `src/app/components/ExtensionSidebar.tsx`

**Instrucción al agente:**
```
Implementa el shell principal del sidebar con las siguientes características:
ESTRUCTURA:
- Header (fijo en top): logo Zap + título "Subtitle Bridge" + badge puerto 8010 + gear icon
- Tab nav: 3 tabs (Study, Captions, Overlay) + 1 oculto (Dev)
- Content area: renderiza el tab activo

TABS:
- "study" (default) → <StudyAgentTab />
- "captions" → contenido inline en ExtensionSidebar (no componente separado)
- "overlay" → contenido inline en ExtensionSidebar
- "dev" → <DevTab /> (oculto, activado con triple-click en ⚙)

ACTIVACIÓN DEV MODE:
- Gear click ref: array de timestamps
- Filtrar timestamps de los últimos 1000ms
- Si hay >= 3 clicks en < 1000ms: toggle devMode

TAB ACTIVO:
- Usar Motion layoutId="activeTabBg" para animación de fondo
- defaultValue: "study"

ESTADO PERSISTIDO (usePersistedState):
- captions_auto_translate (boolean, default: true)
- overlay_show (boolean, default: true)
- overlay_font_size (number[], default: [24])
- overlay_opacity (number[], default: [85])
- overlay_position ("top"|"center"|"bottom", default: "bottom")
- overlay_text_color ("white"|"yellow"|"cyan", default: "white")
- overlay_shadow (number[], default: [60])
- overlay_sync_offset (number[], default: [0])

BRIDGE (useEffect al montar):
1. contentBridge.onMessageFromContent → escuchar PONG y SUBTITLE_LINE_RECEIVED
2. setTimeout 600ms → contentBridge.sendToContent({ type: "PING" })
3. Sync config overlay (debounced 280ms) al cambiar cualquier valor overlay
4. Sync auto-translate inmediato al cambiar

VER DOC 03-DISEÑO-UI-DETALLADO.md para todos los estilos visuales exactos.
```

---

### 3.2 — `src/app/components/TranslationPipeline.tsx`

**Instrucción al agente:**
```
Implementa TranslationPipeline como componente visual del pipeline EN→ES.
Props: { incomingLine: string | null, autoTranslate: boolean }

ESTADOS del pipeline:
- "idle" → esperando línea
- "capturing" → procesando nueva línea EN (180ms delay visual)
- "streaming" → IA generando tokens
- "done" → traducción completa

LÓGICA PRINCIPAL (useEffect en incomingLine + autoTranslate):
1. Si misma línea que la anterior, ignorar
2. Abortar stream anterior si existe (AbortController)
3. setStatus("capturing"), esperar 180ms
4. setStatus("streaming"), llamar translateLineStream()
5. En onToken: setCurrentEs(accumulated)
6. Si success: setStatus("done"), guardar latencia, setUsedAI(true)
7. Si falla: llamar mockStream() con FALLBACK[incomingLine] ?? incomingLine
8. Actualizar history (últimas 6 entradas)
9. Actualizar stats (total, aiCalls, totalMs)
10. debugStore.addCacheEntry()

MOCK STREAM (cuando IA no disponible):
- Animar la traducción palabra a palabra
- delay: 45 + Math.random() * 55 ms por palabra
- Respetar AbortSignal

FALLBACK TRANSLATIONS (hardcodeadas para demo offline):
- Mantener diccionario de las líneas de demo más comunes

DISEÑO: ver doc 03, sección 4.
```

---

### 3.3 — `src/app/components/StudyAgentTab.tsx`

**Instrucción al agente:**
```
Implementa StudyAgentTab.tsx. Es el componente más complejo del proyecto.
Leer el doc 03-DISEÑO-UI-DETALLADO.md completo antes de implementar.

FASES:
1. "objective" — selección de objetivo + configuración curso/lección
2. "generating" — animación de generación (5 steps, ~2200ms total)
3. "result" — contenido de estudio completo

FASE "objective" CONTIENE:
- Hero card: Brain icon + descripción pedagógica
- Grid 2x2: 4 objetivos preset (spring-senisenior, java-cert, personal-project, fullstack)
- Textarea: objetivo custom
- Botón "Refinar con IA" (simula 1200ms)
- Resultado refinado con checkmark
- Input: nombre del curso
- Input: nombre de la lección
- Botón "Generar sesión" (violeta, ancho completo)

FASE "generating" CONTIENE:
- 5 pasos animados que aparecen secuencialmente (400ms cada uno):
  "Analizando la transcripción…"
  "Identificando conceptos clave…"
  "Calibrando preguntas a tu objetivo…"
  "Generando escenario de aplicación real…"
  "Creando tarjetas Anki optimizadas…"
- Spinner en el step activo

FASE "result" CONTIENE (en scroll):
- ProgressStepper: 5 steps (Autocalibrar, Conceptos, Verificar, Aplicar, Anki)
- Card de relevancia: score + razón
- Grid de conceptos clave: checkboxes interactivos
- AUTOCALIBRACIÓN: 4 botones emoji (😕🤔👍🔥)
- PREGUNTAS ADAPTATIVAS: filtradas por confidence level
  - Solo mostrar preguntas cuya difficulty esté en QUESTIONS_FOR[confidence]
  - Una pregunta a la vez (currentQIdx)
  - Bloom badge + hint toggle + show answer toggle
  - Textarea para respuesta del estudiante
  - Botón "Evaluar con IA"
  - AIFeedback component (streaming)
  - Auto-avanzar si rating !== "wrong"
- DESAFÍO DE CÓDIGO/APLICACIÓN:
  - Solo visible si questionsComplete === true
  - Setup text + código del challenge (monospace)
  - Textarea o editor para la respuesta
  - Botón "Enviar para code review"
  - AIFeedback component (streaming)
- TARJETAS ANKI:
  - AnkiFlipPreview con las cards generadas
  - Botón "Exportar .txt" → 3 archivos
  - Botón "Exportar .apkg" → con progress feedback
  - Badge "Primera vez con este curso" → exporta también CSS y plantilla

SUB-COMPONENTES:
- StepHeader({ n, label, status, subLabel })
- AIFeedback({ fb, onRetry })
- AnkiFlipPreview({ cards })
- ProgressStepper({ steps })

FUNCIONES CLAVE:
- generateContent(objectiveId, custom, course, lesson) → StudyContent
  (En MVP: datos mock. En v2: llamar a IA local con el prompt del doc 04)
- handleEvalQuestion(idx) → evaluateActiveAnswerStream con fallback
- handleEvalApp() → evaluateCodeSolutionStream con fallback
- handleExport() → 3 archivos TXT
- handleExportApkg() → buildAnkiApkg + downloadApkg

PERSISTENCIA (usePersistedState):
- agent_selected_obj (default: "spring-senisenior")
- agent_custom_obj (default: "")
- agent_course_name (default: "Java In-Depth - Udemy")
- agent_lesson_name (default: "02 - JVM y Tipos de Datos")
```

---

### 3.4 — Sub-componentes del StudyAgent

**StepHeader:**
```
Props: { n: number; label: string; status: "pending"|"active"|"done"; subLabel?: string }
- status=done: círculo verde esmeralda con check ✓
- status=active: círculo violeta pulsante
- status=pending: círculo gris + Lock icon a la derecha
```

**AIFeedback:**
```
Props: { fb: FeedbackState; onRetry?: () => void }
- status=idle: null (no renderizar)
- status=loading: Loader2 animado + texto "IA local analizando…"
- status=streaming: borde violeta + texto línea a línea + cursor parpadeante
- status=done: borde coloreado según rating (verde=correct, ámbar=partial, rojo=wrong)
- status=error: borde rojo + botón "Reintentar"
Colores por línea de texto:
- Líneas que empiezan con ✅ → text-emerald-300
- Líneas que empiezan con ❌ → text-red-300
- Líneas que empiezan con ⚠️ → text-amber-300
- Líneas que empiezan con 💡 → text-sky-300
- Líneas que empiezan con 🎯 → text-violet-300
- Líneas que empiezan con 🔁 → text-fuchsia-300
- Líneas que empiezan con 🚀 → text-emerald-400
- Resto → text-white/80
```

**AnkiFlipPreview:**
```
Props: { cards: AnkiCard[] }
- Flip 3D con perspective: 1200px
- Motion animate rotateY: 0 (frente) / 180 (reverso)
- transition: spring, stiffness 260, damping 20, duration 0.4
- Frente: bg dark con texto de la pregunta
- Reverso: bg más oscuro con border coloreado según tipo de card
- Navegación: botones prev/next + dots indicator
- Dots: activo = w-6 h-1.5 violeta, inactivo = w-1.5 h-1.5 gris
```

**ProgressStepper:**
```
Props: { steps: { label: string; done: boolean; active: boolean }[] }
- 5 steps conectados por líneas horizontales
- Línea de conexión: Motion scaleX 0→1 cuando el step se completa
- Step done: círculo verde esmeralda con check
- Step active: círculo violeta pulsante
- Step pending: círculo gris
```

---

### 3.5 — `src/app/components/DevTab.tsx`

**Instrucción al agente:**
```
Implementa DevTab.tsx que muestra la telemetría SSE en tiempo real.
Props: ninguno (usa debugStore singleton directamente)

SUSCRIPCIÓN:
useEffect(() => {
  const unsub = debugStore.subscribe(() => forceRender(n => n + 1));
  return unsub;
}, []);

SECCIONES:
1. Header: punto ámbar animado + "Dev · Debug Panel" + badge "streaming" si hay activo
2. Stats strip: últimas stats de petición completada (6 métricas en grid 3x2)
3. Toggle "SSE Log | Cache"

SECCIÓN SSE:
- RequestCard por cada request en debugStore.requests
- Auto-expandir el request con status="streaming"
- Colapsable con animación height

RequestCard muestra:
- Estado (streaming=punto violeta, done=check verde, aborted=refresh ámbar, error=alert rojo)
- Pill de contexto (translate=azul, eval-question=violeta, eval-code=verde)
- Preview del texto acumulado (truncado a 45 chars)
- Total ms + número de tokens + chevron
- Expandido: grid 4 métricas + histograma de latencias + scroll de chunks SSE

LatencyBar:
- Barras de 1px de ancho
- Alto proporcional al máximo delta
- Color: verde<50ms, ámbar 50-150ms, rojo>150ms

SECCIÓN CACHE:
- CacheRow por cada entry en debugStore.cacheEntries
- Timestamp + latencia/mock badge + línea EN + línea ES
- Leyenda de colores al final
```

---

## MÓDULO 4 — Integración Final y App.tsx

### 4.1 — `src/app/App.tsx` (versión preview / Figma Make)

**En el prototipo de Figma Make**, App.tsx simula la página de Udemy con el sidebar embebido.
**En la extensión real**, App.tsx sería reemplazado por `ExtensionSidebar.tsx` como root directamente.

**Instrucción al agente:**
```
En el contexto de Figma Make (preview), App.tsx debe:
1. Renderizar la UI de Udemy: navbar, video player, curriculum
2. Simular el content script: enviar SUBTITLE_LINE_RECEIVED cada 3 segundos
3. Escuchar mensajes del sidebar via contentBridge
4. Actualizar el overlay del video según overlayConfig recibido
5. Mostrar el sidebar como panel lateral derecho (360px)
6. Levantar el estado de sesión con: const [appSession, setAppSession] = useState<Session | null | undefined>(undefined)

PATRÓN CRÍTICO — El div de 360px DEBE envolver al AuthGuard:

// ✅ CORRECTO
<div style={{ width: "360px" }}>
  <AuthGuard onSessionResolved={setAppSession}>
    {(session, requestLogin, signOut) => (
      <div className="flex flex-col h-full w-full">
        {/* tabs + ExtensionSidebar */}
      </div>
    )}
  </AuthGuard>
</div>

// ❌ INCORRECTO — el ancho 360px dentro de los hijos hace que el auth
// screen (que renderiza el AuthGuard directamente) no tenga contenedor
<AuthGuard>
  {(session, ...) => (
    <div style={{ width: "360px" }}>...</div>
  )}
</AuthGuard>

El Toaster:
<Toaster
  theme="dark"
  position="bottom-center"
  expand={false}
  gap={8}
  toastOptions={{
    style: {
      background: "rgba(17, 18, 24, 0.45)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      color: "#ffffff",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
    }
  }}
/>

Pasar session al sidebar y a NotesTab:
<ExtensionSidebar
  isOpen={true}
  onToggle={() => setContentTab("content")}
  session={session ?? undefined}
  onRequestLogin={session ? undefined : requestLogin}
  onSignOut={session ? signOut : undefined}
/>
<NotesTab courseName="..." lessonName="..." session={appSession ?? null} />
```

---

## MÓDULO 5 — Auth, Cloud Sync y NotesTab

### 5.1 — `src/app/components/AuthGuard.tsx`

**Instrucción al agente:**
```
AuthGuard es el guardián de autenticación. Envuelve toda la UI del sidebar.

MODOS DE ACCESO:
1. Autenticado (session !== null) → renderiza children(session, requestLogin, signOut)
2. Invitado (localStorage "subtitle_bridge_guest_mode" === "true") → children(null, ...)
3. Sin sesión → pantalla de login INLINE (ocupa el 100% del panel de 360px)

CARACTERÍSTICAS:
- La pantalla de auth ocupa h-full w-full del contenedor padre
- NO usar portales ni overlays — el auth vive dentro del panel 360px
- Formulario: email+password + Google OAuth + "Continuar sin cuenta"
- Pestañas: "Iniciar sesión" | "Crear cuenta"
- Google OAuth: supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
- Signup: POST /signup al servidor (usa service role key, email_confirm: true)
- Luego auto-login con signInWithPassword

REVERSE SYNC (cloud → local) al montar con sesión existente:
const count = await reverseSyncFromCloud(session);
if (count > 0) toast.success(`⬇️ ${count} apuntes restaurados desde la nube`);

UPLOAD MIGRATION (local → cloud) al primer login:
- Detectar con: prevSessionRef: useRef<Session | null | "unset">
- Si wasGuest y ahora session → migrateLocalDataToCloud(session)
- Leer claves con prefijo "usb_notes_" de localStorage
- POST /migrate con { items: [{ key, value }] }

SIGNOUT:
const signOut = async () => {
  localStorage.removeItem('subtitle_bridge_guest_mode');
  setIsGuest(false);
  await supabase.auth.signOut();
  onSessionResolved?.(null);
};

FIRMA DEL children:
children: (session: Session | null, requestLogin: () => void, signOut: () => void) => React.ReactNode
```

### 5.2 — `src/app/components/NotesTab.tsx`

**Instrucción al agente:**
```
Props: { courseName: string; lessonName: string; session: Session | null }

FEATURES:
1. Textarea con usePersistedState(`notes_${courseName}_${lessonName}`, "")
2. Auto-save a cloud debounced 1500ms via POST /progress (cuando session)
3. Tarjeta de cloud sync (solo visible con session):
   - GET /migrate → contar items con key.startsWith("notes_")
   - Mostrar: "X apuntes en la nube · Hace N min"
   - Estados: loading | synced | error | idle
   - Botón de refresh
4. Indicador de estado: "Sincronizado" (con sesión) | "Solo local" (sin sesión)
5. Export Markdown (.md) y Notion (misma función)

CLOUD NOTE COUNT:
const res = await fetch(`${API_BASE}/migrate`, { headers: { Authorization: `Bearer ${session.access_token}` } });
const data = await res.json();
const noteCount = data.items?.filter(i => i.key.startsWith("notes_")).length ?? 0;
```

---

## MÓDULO 6 — Checklist de Verificación por Feature

### ✅ Content Script
- [ ] Se inyecta en `https://www.udemy.com/course/*`
- [ ] Overlay visible sobre el video
- [ ] Overlay arrastrable (drag funcional)
- [ ] Responde a PING con PONG
- [ ] Captura cambios de subtítulos y envía SUBTITLE_LINE_RECEIVED
- [ ] Aplica overlayConfig recibido (fontSize, opacity, color, position)
- [ ] Auto-translate toggle muestra/oculta overlay
- [ ] Reset posición funciona

### ✅ TranslationPipeline
- [ ] Muestra pipeline visual de 3 pasos (Capturado / IA Local / Subtítulo Generado)
- [ ] Token a token: texto aparece progresivamente con cursor parpadeante
- [ ] Badge de latencia aparece al completar (⚡Xms para IA real, mock para fallback)
- [ ] Historial de últimas 5-6 líneas traducidas
- [ ] Stats bar: total líneas, avg ms, % IA

### ✅ Study Agent
- [ ] 4 objetivos preset con colores diferentes
- [ ] Textarea de objetivo custom
- [ ] "Refinar con IA" funciona (1200ms mock)
- [ ] Inputs de curso y lección persisten
- [ ] Animación de generación (5 steps)
- [ ] Relevance score visible
- [ ] 4 botones de autocalibración con emojis
- [ ] Preguntas filtradas por nivel de confianza
- [ ] Feedback IA streaming con cursor parpadeante
- [ ] Auto-avance al siguiente question
- [ ] Desafío de código visible después de questions
- [ ] AnkiFlipPreview con flip 3D funcional
- [ ] Export TXT genera 1 o 3 archivos según si es primera vez
- [ ] Export .apkg descarga archivo válido

### ✅ Dev Tab
- [ ] Oculto hasta triple-click en ⚙
- [ ] Gear se vuelve ámbar con dev mode activo
- [ ] Registra todas las peticiones SSE en tiempo real
- [ ] Histograma de latencias correcto
- [ ] Cache de traducciones actualizado
- [ ] Botón "Limpiar" funciona

### ✅ Overlay Tab
- [ ] Preview en mini-frame 16:9
- [ ] Subtítulo de preview rota cada 4s
- [ ] Toggle activo/desactivado
- [ ] Slider de tamaño: 12-48px
- [ ] Slider de opacidad: 0-100%
- [ ] 3 posiciones (Arriba/Centro/Abajo)
- [ ] 3 colores de texto
- [ ] Slider de sombra
- [ ] Reset de posición envía mensaje al content script
- [ ] Cambios se sincronizan al video en tiempo real (debounce 280ms)

### ✅ Auth + Cloud Sync
- [ ] Auth screen aparece dentro del panel de 360px (no fullscreen, no portal)
- [ ] "Continuar sin cuenta" guarda `subtitle_bridge_guest_mode = "true"` en localStorage
- [ ] Login con email+password funciona
- [ ] Google OAuth button visible (nota: requiere config en Supabase dashboard)
- [ ] Al primer login, se migran notas locales a la nube
- [ ] Al cargar con sesión existente, se restauran datos cloud a localStorage
- [ ] Banner "Sincronizar en la nube" aparece en el footer cuando hay sesión = null
- [ ] Header del sidebar muestra avatar + email + botón "Salir" cuando session activo
- [ ] El botón "Salir" llama a signOut() y vuelve a la pantalla de auth
- [ ] NotesTab muestra contador de notas en la nube con session

### ✅ Notificaciones (Toaster)
- [ ] Toaster en position="bottom-center" con diseño glassmorphism
- [ ] Aparece centrado en la parte inferior, sin recuadros de tarjetas para celebraciones (solo confeti)
- [ ] Toast de bienvenida al cargar la app (800ms delay)
- [ ] Toast de sync exitoso al migrar datos
- [ ] Toast de reverse sync al restaurar datos cloud

---

## MÓDULO 7 — Anki Card HTML Builder

### Templates exactos (crítico para .apkg y TXT)

```typescript
// Construcción del frente de la tarjeta
function buildCardFront(card: AnkiCard): string {
  const m = CARD_META[card.type];
  const a = m.accent; // color hex del tipo
  return `
    <div class="header-bar">
      <div class="header-dot red"></div>
      <div class="header-dot yellow"></div>
      <div class="header-dot green"></div>
      <div class="type-pill" style="background:${a}18;color:${a};border:1px solid ${a}38">
        ${m.icon} ${m.label}
      </div>
    </div>
    <div id="qa">${toPrism(card.front)}</div>
  `;
}

// Construcción del reverso
function buildCardBack(card: AnkiCard): string {
  return `<div class="answer">${toPrism(card.back)}</div>`;
}

// Conversión de bloques de código para Prism.js
function toPrism(html: string, lang = "java"): string {
  return html
    .replace(/<pre[^>]*><code[^>]*>/gi,
      `<pre class="language-${lang}" data-lang="${lang.toUpperCase()}"><code class="language-${lang}">`)
    .replace(/<\/code><\/pre>/gi, "</code></pre>")
    .replace(/<pre[^>]*>/gi,
      `<pre class="language-${lang}" data-lang="${lang.toUpperCase()}"><code class="language-${lang}">`)
    .replace(/<\/pre>/gi, "</code></pre>");
}
```

### Tipos de tarjetas (CARD_META)

| Tipo          | Icono | Color texto      | Accent hex |
|---------------|-------|------------------|------------|
| `concepto`    | 🎯    | text-violet-400  | #a78bfa    |
| `codigo`      | 💻    | text-emerald-400 | #86efac    |
| `entrevista`  | 💼    | text-sky-400     | #93c5fd    |
| `comparacion` | 🔄    | text-amber-400   | #fcd34d    |
| `proceso`     | 📋    | text-fuchsia-400 | #e879f9    |

---

## MÓDULO 8 — Manejo de Errores y Edge Cases

### 8.1 IA Local no disponible
```typescript
// TranslationPipeline: si la IA falla, usar mockStream
// En el badge: mostrar <WifiOff size={8} />mock en lugar de ⚡Xms
// En el Status card de Captions: mostrar "No disponible" con color rojo
```

### 8.2 Content script no conectado
```typescript
// ExtensionSidebar: mostrar estado "Esperando…" hasta recibir PONG
// Timeout de PING: 600ms después del mount
// Si no hay PONG en 5 segundos, mostrar badge de error
```

### 8.3 sql.js WASM no carga
```typescript
// ankiApkg: envolver en try/catch con mensaje claro
// onProgress?.("Error al cargar SQLite WASM — verifica la CSP")
// En StudyAgentTab: mostrar error y ofrecer fallback a .txt export
```

### 8.4 Export .apkg con 0 tarjetas
```typescript
// Validar antes de llamar buildAnkiApkg:
if (cards.length === 0) {
  setApkgStatus("error");
  setApkgProgress("No hay tarjetas para exportar");
  return;
}
```

### 8.5 Udemy cambia selectores CSS
```typescript
// Probar selectores en orden, usar el primero que devuelva un elemento
function findSubtitleElement(): Element | null {
  const selectors = [
    '.ud-transcript-cue',
    '[data-purpose="transcript-cue-active"]',
    '.captions-display--captions-cue-text--ECkct',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}
```