# Udemy Subtitle Bridge — Índice de Documentación
> Guía completa para el ciclo de vida del proyecto · Uso con GPT-4.1-mini

---

## Documentos Disponibles

| # | Archivo                              | Audiencia        | Contenido                                                                      |
|---|--------------------------------------|------------------|--------------------------------------------------------------------------------|
| 0 | `00-PLAN-PROYECTO.md`                | Equipo / PM      | Ciclo de vida completo, fases, sprints, testing matrix, MCPs                   |
| 1 | `01-ARQUITECTURA-TECH.md`            | Dev + Agente IA  | Estructura de archivos, manifest, auth, cloud sync, servicios, contratos, build |
| 2 | `02-IMPLEMENTACION-AGENTE.md`        | **Agente IA**    | Guía paso a paso, patrones de código, auth module, checklist completo           |
| 3 | `03-DISEÑO-UI-DETALLADO.md`          | Dev + Agente IA  | Specs visuales exactas de todos los componentes para replicar                  |
| 4 | `04-PROMPTS-IA-LOCAL.md`             | Dev + Agente IA  | Todos los prompts del sistema (traducción, estudio, evaluación)                |
| 5 | `05-MCP-HERRAMIENTAS.md`             | **Agente IA**    | MCPs disponibles, cuándo usar cada uno, protocolo del agente                   |
| 6 | `06-UDEMY-HTML-INTEGRACION.md`       | Dev + Agente IA  | **Selectores DOM reales de Udemy, inyección del overlay, Side Panel API**      |

---

## Cómo usar estos docs con GPT-4.1-mini

### Contexto para cada tarea:

**Sprint 0 (Setup):**
```
Contexto a enviar: 00-PLAN-PROYECTO.md + 01-ARQUITECTURA-TECH.md (secciones 2, 3, 11)
```

**Sprint 1 (Content script + Translation Pipeline):**
```
Contexto a enviar: 01-ARQUITECTURA-TECH.md + 02-IMPLEMENTACION-AGENTE.md (módulos 1-3)
                 + 04-PROMPTS-IA-LOCAL.md (prompt 1)
                 + 06-UDEMY-HTML-INTEGRACION.md  ← LEER SIEMPRE para content_script.ts
```

**Sprint 2 (Study Agent MVP):**
```
Contexto a enviar: 02-IMPLEMENTACION-AGENTE.md (módulo 3.3-3.4) + 03-DISEÑO-UI-DETALLADO.md
                 + 04-PROMPTS-IA-LOCAL.md (prompts 2-3)
```

**Sprint 3 (Streaming + .apkg):**
```
Contexto a enviar: 02-IMPLEMENTACION-AGENTE.md (módulos 5-7) + 01-ARQUITECTURA-TECH.md (sección 4.5)
                 + 04-PROMPTS-IA-LOCAL.md
```

**Sprint 4 (Dev Panel + UX):**
```
Contexto a enviar: 02-IMPLEMENTACION-AGENTE.md (módulo 3.5) + 03-DISEÑO-UI-DETALLADO.md (sección 8)
```

**Sprint 5 (Auth + Cloud Sync):**
```
Contexto a enviar: 01-ARQUITECTURA-TECH.md (secciones 4-6) + 02-IMPLEMENTACION-AGENTE.md (módulo 5)
```

**Sprint 6 (Testing + Release):**
```
Contexto a enviar: 00-PLAN-PROYECTO.md (sección 5) + 05-MCP-HERRAMIENTAS.md
```

---

## Orden de lectura para el Agente IA

```
1. README.md                  ← Este archivo
2. 01-ARQUITECTURA-TECH.md    ← Estructura técnica completa (LEER SIEMPRE)
3. 06-UDEMY-HTML-INTEGRACION.md ← Selectores DOM reales (LEER para content_script)
4. 02-IMPLEMENTACION-AGENTE.md ← Instrucciones de implementación paso a paso
5. 03-DISEÑO-UI-DETALLADO.md  ← Specs de diseño visual
6. 04-PROMPTS-IA-LOCAL.md     ← Prompts exactos de IA
7. 05-MCP-HERRAMIENTAS.md     ← Herramientas disponibles
8. 00-PLAN-PROYECTO.md        ← Plan completo del proyecto
```

---

## Resumen del Proyecto

**Udemy Subtitle Bridge** es una extensión Chrome que:
1. **Captura** subtítulos EN de Udemy con `MutationObserver` usando `[data-purpose="captions-cue-text"]`
2. **Traduce** al español vía IA local (SSE streaming, puerto 8010)
3. **Superpone** el subtítulo traducido sobre el video (overlay `position:fixed`, arrastrable)
4. **Study Agent** pedagógico: preguntas Bloom + evaluación IA streaming + Anki export (.apkg nativo)
5. **Auth + Cloud Sync**: Supabase con email/Google OAuth, migración local↔cloud, modo invitado

**Tech stack:** React 18 + TypeScript + Vite + @crxjs/vite-plugin + Tailwind v4 + Motion + sql.js + jszip + Supabase

**IA local compatible:** LM Studio, Ollama, llama.cpp, Jan.ai (cualquier servidor OpenAI-compatible en `127.0.0.1:8010`)

**Backend:** Deno Edge Functions (Hono) en Supabase + KV Store con manifest pattern para cloud sync

---

## Decisiones Arquitectónicas Clave

| Decisión | Detalle |
|----------|---------|
| **Side Panel API** | La extensión usa la Chrome Side Panel API (nativa del navegador), NO inyección en el DOM de Udemy. Esto elimina conflictos de CSS y z-index. |
| **Content Script** | Solo para overlay + captura de subtítulos. Se comunica con el side panel via `chrome.runtime.sendMessage`. |
| **Auth inline** | El formulario de auth/login ocupa el panel de 360px completo (sin overlay, sin portal). El contenedor 360px SIEMPRE envuelve al `AuthGuard`. |
| **KV Manifest** | El cloud sync usa un "manifest" (lista de keys) para poder hacer reverse sync, ya que `getByPrefix()` del KV store solo retorna valores, no keys. |
| **Toaster position** | `bottom-center` con diseño glassmorphism, para no interferir con la interfaz principal. |
| **Selectores Udemy** | `[data-purpose="captions-cue-text"]` es el selector más estable. Los selectores con hash CSS pueden cambiar en cada deploy. |
| **Overlay position** | `position: fixed` con `z-index: 2147483647` para funcionar en fullscreen y con cualquier z-index de Udemy. |
