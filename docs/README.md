# Udemy Subtitle Bridge — Índice de Documentación
> Guía completa para el ciclo de vida del proyecto · Uso con GPT-4.1-mini

---

## Documentos Disponibles

### Vocabulario opcional

La configuración previa y el panel final comparten candidatas y selección por curso, lección e idioma. El chip selecciona para exportar; no guarda directamente en Anki. La configuración se abre desde el engranaje del encabezado: proveedor de IA, idiomas, mazo raíz de Anki, Obsidian y caché. Triple clic mantiene el acceso al modo Dev. No se añade configuración a Overlay, Study ni Captions. Study no muestra accesos, contadores ni resúmenes de vocabulario en la pantalla inicial. Las tarjetas de contenido pendientes de descarga se consultan desde el historial global, sin barras de «memoria» ni contadores de lecciones exportadas en Study. En el prototipo, `App.tsx` carga fixtures de vocabulario e historial automáticamente para validarlo: no hay botones ni modos de demo en la interfaz. La extensión no tiene `App.tsx`; en ella, la demo de Study solo existe en desarrollo. Idioma, nivel e idioma de explicación requieren actualizar las candidatas; cambiar límite, audio o mazo no requiere otra llamada a IA. La redescarga permite elegir entre los lotes exportados y conserva sus palabras y configuración de exportación. Los vencimientos desconocidos de Anki no se sustituyen por conteos ficticios.

Validación del prototipo (en el repo vive en `.mock/`, ignorado por git): `pnpm run build` y `pnpm run qa:local` (vocabulario y dudas; por separado, `pnpm run qa:vocabulary` y `pnpm run qa:doubts`). La suite de vocabulario usa Chromium y respuestas deterministas de IA; comprueba selección video/panel, persistencia, límites, duplicados, exportación `.apkg`, redescarga sin IA, respuestas atrasadas, temas y listas de 100 cursos. No certifica acceso autenticado a Udemy ni importación o vencimientos en Anki Desktop. Usa Chromium del sistema, `CHROMIUM_PATH` o el navegador instalado con `pnpm exec playwright install chromium`. En la extensión: `npm run typecheck`, `npm run build` y `npm run qa:full` (tabla «Automated QA» del README de la raíz).

| # | Archivo | Audiencia | Contenido |
|---|---------|-----------|-----------|
| 0 | `00-PLAN-PROYECTO.md` | Equipo / PM | Ciclo de vida completo, fases, sprints, testing matrix, MCPs |
| 1 | `01-ARQUITECTURA-TECH.md` | Dev + Agente IA | Estructura de archivos, manifest, auth, cloud sync, servicios, contratos, build |
| 2 | `02-IMPLEMENTACION-AGENTE.md` | **Agente IA** | Guía paso a paso, patrones de código, auth module, checklist completo |
| 3 | `03-DISEÑO-UI-DETALLADO.md` | Dev + Agente IA | Specs visuales exactas de todos los componentes |
| 4 | `04-PROMPTS-IA-LOCAL.md` | Dev + Agente IA | Todos los prompts del sistema (traducción, estudio, evaluación) |
| 5 | `05-MCP-HERRAMIENTAS.md` | **Agente IA** | MCPs disponibles, cuándo usar cada uno, protocolo del agente |
| 6 | `06-UDEMY-HTML-INTEGRACION.md` | Dev + Agente IA | **Selectores DOM reales de Udemy, overlay injection, in-page dock** |
| 7 | `07-INPAGE-DOCK-SHADOW-DOM.md` | Dev + Agente IA | **⭐ NUEVO: Guía completa Shadow DOM dock (resize, collapse, fullscreen)** |
| 8 | `06-AUDITORIA-PARIDAD-UI.md` | Dev | Auditoría de paridad 1:1 de la UI frente a `03-DISEÑO-UI-DETALLADO.md` |
| 9 | `STUDY_FLOW_PEDAGOGY.md` | Dev + Agente IA | Flujo de 4 pasos, gamificación, avisos y dudas: cada decisión con su referencia |
| 10 | `ANKI_PEDAGOGY.md` | Dev + Agente IA | Diseño de los dos mazos (conceptos y vocabulario) con bibliografía |
| 11 | `obsidian-integration.md` | Dev + Agente IA | Contrato del vault, formatos de nota y estructura (`CLAUDE.md` / `AGENTS.md`) |
| 12 | `ejemplo-nota-obsidian.md` | Dev / QA | Nota de sesión e índice del curso tal como llegan al vault |
| 13 | `KINEMA-BRAND.md` | Diseño | Identidad de Kinema by Kivara |
| 14 | `QA_HUMAN_SESSION.md` | QA | Sesión humana de tiempos A → B (solo en el repo de la extensión) |

---

## ⭐ Decisión Arquitectónica v1.1 — In-page Dock

**En la versión 1.1 se migró de Chrome Side Panel a In-page Dock con Shadow DOM.**

Ver el análisis completo en `07-INPAGE-DOCK-SHADOW-DOM.md`.

Razón principal: el dock in-page permite ver el **video y el panel simultáneamente**,
funciona en **fullscreen**, es **resizable** y **colapsable** — imposible con el Side Panel nativo.
El referente en este espacio (Language Reactor) eligió exactamente esta arquitectura.

---

## Cómo usar estos docs con GPT-4.1-mini

### Contexto para cada tarea:

**Sprint 0 (Setup):**
```
Contexto: 00-PLAN-PROYECTO.md + 01-ARQUITECTURA-TECH.md (secciones 2, 3, 10)
```

**Sprint 1 (Content script + In-page Dock + Translation Pipeline):**
```
Contexto: 01-ARQUITECTURA-TECH.md
        + 07-INPAGE-DOCK-SHADOW-DOM.md   ← NUEVO: Shadow DOM dock
        + 06-UDEMY-HTML-INTEGRACION.md   ← LEER SIEMPRE para content_script.ts
        + 04-PROMPTS-IA-LOCAL.md (prompt 1)
```

**Sprint 2 (Study Agent MVP):**
```
Contexto: 02-IMPLEMENTACION-AGENTE.md (módulo 3.3-3.4)
        + 03-DISEÑO-UI-DETALLADO.md
        + 04-PROMPTS-IA-LOCAL.md (prompts 2-3)
```

**Sprint 3 (Streaming + .apkg):**
```
Contexto: 02-IMPLEMENTACION-AGENTE.md (módulos 5-7)
        + 01-ARQUITECTURA-TECH.md (sección 4.5)
        + 04-PROMPTS-IA-LOCAL.md
```

**Sprint 4 (Dev Panel + UX + Resize/Collapse):**
```
Contexto: 02-IMPLEMENTACION-AGENTE.md (módulo 3.5)
        + 03-DISEÑO-UI-DETALLADO.md (sección 8)
        + 07-INPAGE-DOCK-SHADOW-DOM.md (sección 4: InPageDock specs)
```

**Sprint 5 (Auth + Cloud Sync):**
```
Contexto: 01-ARQUITECTURA-TECH.md (secciones 4-6)
        + 02-IMPLEMENTACION-AGENTE.md (módulo 5)
```

**Sprint 6 (Testing + Release):**
```
Contexto: 00-PLAN-PROYECTO.md (sección 5)
        + 05-MCP-HERRAMIENTAS.md
```

---

## Orden de lectura para el Agente IA

```
1. README.md                       ← Este archivo
2. 01-ARQUITECTURA-TECH.md         ← Estructura técnica completa (LEER SIEMPRE)
3. 07-INPAGE-DOCK-SHADOW-DOM.md    ← ⭐ NUEVO: Guía completa del dock (LEER para dock/CS)
4. 06-UDEMY-HTML-INTEGRACION.md    ← Selectores DOM reales (LEER para content_script)
5. 02-IMPLEMENTACION-AGENTE.md     ← Instrucciones de implementación paso a paso
6. 03-DISEÑO-UI-DETALLADO.md       ← Specs de diseño visual
7. 04-PROMPTS-IA-LOCAL.md          ← Prompts exactos de IA
8. 05-MCP-HERRAMIENTAS.md          ← Herramientas disponibles
9. 00-PLAN-PROYECTO.md             ← Plan completo del proyecto
```

---

## Resumen del Proyecto

**Udemy Subtitle Bridge** es una extensión Chrome que:
1. **Captura** subtítulos EN de Udemy con `MutationObserver` usando `[data-purpose="captions-cue-text"]`
2. **Traduce** al español vía IA local (SSE streaming, puerto 8010)
3. **Superpone** el subtítulo traducido sobre el video (overlay `position:absolute`, arrastrable)
4. **In-page Dock** con Shadow DOM: panel lateral resizable (300-560px) y colapsable con toda la UI
5. **Study Agent** pedagógico: preguntas Bloom + evaluación IA streaming + Anki export (.apkg nativo)
6. **Auth + Cloud Sync**: Supabase con email/Google OAuth, migración local↔cloud, modo invitado

**Tech stack:** React 18 + TypeScript + Vite + @crxjs/vite-plugin + Tailwind v4 + Motion + sql.js + jszip + Supabase

**IA local compatible:** LM Studio, Ollama, llama.cpp, Jan.ai (cualquier servidor OpenAI-compatible en `127.0.0.1:8010`)

**Backend:** Deno Edge Functions (Hono) en Supabase + KV Store con manifest pattern para cloud sync

---

## Decisiones Arquitectónicas Clave

| Decisión | Detalle |
|----------|---------|
| **⭐ In-page Dock (v1.1)** | Migrado desde Chrome Side Panel. El dock vive en un Shadow Root inyectado en `document.body`. CSS isolation bidireccional. Funciona en fullscreen. Resizable 300-560px. Colapsable a pestaña vertical de 40px. |
| **Shadow DOM mode: "closed"** | Máximo aislamiento. Los estilos de Udemy no entran, los nuestros no salen. El `host.shadowRoot` no es accesible desde el DOM principal. |
| **Content Script roles** | Tres responsabilidades: ① captura subtítulos (MutationObserver), ② subtitle overlay (div sobre el video), ③ initInPageDock() (Shadow DOM + React mount). |
| **Comunicación dock ↔ CS** | CustomEvents en `window`: `"usb:dock→cs"` (dock envía) / `"usb:cs→dock"` (CS envía). Sin `chrome.runtime.sendMessage` entre ellos (mismo proceso). |
| **Auth inline en InPageDock** | `AuthGuard` vive DENTRO de `InPageDock`. El contenedor de ancho variable (resize) siempre envuelve al `AuthGuard`. Ver `01-ARQUITECTURA-TECH.md` sección 4. |
| **KV Manifest** | Cloud sync usa "manifest" (lista de keys) para poder hacer reverse sync, ya que `getByPrefix()` del KV retorna solo valores, no keys. |
| **Toaster position** | `bottom-center` con diseño glassmorphism, montado en el DOM principal (no en el Shadow Root). |
| **Overlay position** | `position: absolute` relativo al video wrapper. `z-index: 2147483647`. Funciona en fullscreen porque el video wrapper ES el elemento fullscreen. |
| **Selectores Udemy** | `[data-purpose="captions-cue-text"]` es el selector más estable. Los selectores con hash CSS pueden cambiar en cada deploy. Siempre múltiples fallbacks. |
