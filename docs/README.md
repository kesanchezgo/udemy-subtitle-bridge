# Udemy Subtitle Bridge — Índice de Documentación
> Guía completa para el ciclo de vida del proyecto · Uso con GPT-4.1-mini

---

## Documentos Disponibles

| # | Archivo                          | Audiencia        | Contenido                                                          |
|---|----------------------------------|------------------|--------------------------------------------------------------------|
| 0 | `00-PLAN-PROYECTO.md`            | Equipo / PM      | Ciclo de vida completo, fases, sprints, testing matrix, MCPs       |
| 1 | `01-ARQUITECTURA-TECH.md`        | Dev + Agente IA  | Estructura de archivos, manifest, servicios, contratos, build      |
| 2 | `02-IMPLEMENTACION-AGENTE.md`    | **Agente IA**    | Guía paso a paso para GPT-4.1-mini, patrones de código, checklist  |
| 3 | `03-DISEÑO-UI-DETALLADO.md`      | Dev + Agente IA  | Specs visuales exactas de todos los componentes para replicar      |
| 4 | `04-PROMPTS-IA-LOCAL.md`         | Dev + Agente IA  | Todos los prompts del sistema (traducción, estudio, evaluación)    |
| 5 | `05-MCP-HERRAMIENTAS.md`         | **Agente IA**    | MCPs disponibles, cuándo usar cada uno, protocolo del agente       |
| 6 | `06-AUDITORIA-PARIDAD-UI.md`     | Dev + Diseño     | Checklist 1:1 tab por tab con brechas priorizadas                  |

---

## Cómo usar estos docs con GPT-4.1-mini

### Contexto para cada tarea:

**Sprint 0 (Setup):**
```
Contexto a enviar: 00-PLAN-PROYECTO.md + 01-ARQUITECTURA-TECH.md (secciones 2, 3, 7)
```

**Sprint 1 (Content script + Translation Pipeline):**
```
Contexto a enviar: 01-ARQUITECTURA-TECH.md + 02-IMPLEMENTACION-AGENTE.md (módulos 1-3) + 04-PROMPTS-IA-LOCAL.md (prompt 1)
```

**Sprint 2 (Study Agent MVP):**
```
Contexto a enviar: 02-IMPLEMENTACION-AGENTE.md (módulo 3.3-3.4) + 03-DISEÑO-UI-DETALLADO.md (sección 6) + 04-PROMPTS-IA-LOCAL.md (prompts 2-3)
```

**Sprint 3 (Streaming + .apkg):**
```
Contexto a enviar: 02-IMPLEMENTACION-AGENTE.md (módulos 5-7) + 01-ARQUITECTURA-TECH.md (sección 4.5) + 04-PROMPTS-IA-LOCAL.md
```

**Sprint 4 (Dev Panel + UX):**
```
Contexto a enviar: 02-IMPLEMENTACION-AGENTE.md (módulo 3.5) + 03-DISEÑO-UI-DETALLADO.md (sección 8)
```

**Sprint 5 (Testing + Release):**
```
Contexto a enviar: 00-PLAN-PROYECTO.md (sección 5) + 05-MCP-HERRAMIENTAS.md
```

---

## Orden de lectura para el Agente IA

```
1. README.md          ← Este archivo
2. 00-PLAN-PROYECTO.md ← Entender el proyecto completo
3. 01-ARQUITECTURA-TECH.md ← Entender la estructura técnica
4. 02-IMPLEMENTACION-AGENTE.md ← Instrucciones de implementación
5. 03-DISEÑO-UI-DETALLADO.md ← Specs de diseño
6. 04-PROMPTS-IA-LOCAL.md ← Prompts exactos
7. 05-MCP-HERRAMIENTAS.md ← Herramientas disponibles
```

---

## Resumen del Proyecto

**Udemy Subtitle Bridge** es una extensión Chrome/Firefox que:
1. Captura subtítulos EN de Udemy con MutationObserver
2. Traduce al español vía IA local (SSE streaming, puerto 8010)
3. Superpone el subtítulo traducido sobre el video (overlay arrastrable)
4. Study Agent pedagógico: preguntas Bloom + evaluación IA + Anki export (.apkg nativo)

**Tech stack:** React 18 + TypeScript + Vite + @crxjs/vite-plugin + Tailwind v4 + Motion + sql.js + jszip

**IA local compatible:** LM Studio, Ollama, llama.cpp, Jan.ai (cualquier servidor OpenAI-compatible en 127.0.0.1:8010)

---

## Estado Actual (Mayo 2026)

- `DevTab` incluye ahora `request cards`, resumen por estado (`Done`, `Streaming`, `Err/Abort`) e histograma de latencias con promedio y `p95`.
- `TranslationPipeline` (tab `Captions`) incluye fila de estado en vivo con `Auto-translate`, contador `EN/ES`, pulso visual y timestamp relativo (`No signal / Ns ago`).
- `Captions` replica la estructura funcional 1:1 del diseño: tarjeta `Estado en vivo`, toggle visual `Auto EN -> ES`, bloque `Gestión SRT` con `Export EN` / `Import ES` y feedback de aplicación.
- `debugStore` quedó alineado al flujo SSE real: ciclo `startRequest/addToken/endRequest`, cálculo de `deltaMs` por token, `totalMs`, `tokensPerSec` y cache de traducciones para el panel `Dev`.
- Build validado en `dist/` y compilación TypeScript sin errores (`npm run typecheck`, `npm run build`).
