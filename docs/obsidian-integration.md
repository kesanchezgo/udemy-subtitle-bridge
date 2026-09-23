# Integración con Obsidian

> Manual de usuario (en el vault): `D:\Obsidian\Dev Courses\propuesta-integracion-udemy-obsidian.md`.
> Este documento es la vista de desarrollador: arquitectura, contrato de datos y pruebas.

## Arquitectura

```
StudyAgentTab (dock, React en Shadow DOM)
   │  handleExportObsidian()
   ▼
src/app/services/obsidianExport.ts
   ├── buildSessionNoteMarkdown()  → nota de sesión (frontmatter + secciones)
   ├── buildCourseMocMarkdown()    → MOC del curso con query Dataview
   ├── buildScaffoldNotes()        → CLAUDE.md, index, log, plantillas (vault desde cero)
   └── buildObsidianNewUri()       → obsidian://new?vault=&file=&content=
   ▼
Obsidian (protocol handler registrado por la app de escritorio)
   └── crea la nota en <vault>/<path>, con subcarpetas
```

- **Transporte**: URI scheme nativo `obsidian://new` — no requiere plugins ni servidores. `encodeURIComponent` en cada parámetro (Obsidian espera `%20`, no `+`).
- **Fallbacks** en la UI: copiar al portapapeles (`navigator.clipboard`) y descarga `.md`.
- **MOC**: se crea una vez por curso; la lista de sesiones la mantiene una query Dataview (`WHERE course = "<slug>"`), así el MOC nunca se actualiza a mano. Los slugs ya creados se persisten en `obsidian_created_mocs`.
- **SRT crudo → raw/** (toggle `includeRawSrt`): tras la nota, la extensión pide el SRT EN al content script (`GET_EN_SRT` → `EN_SRT_RESULT`, timeout 5 s) y crea `raw/<plataforma>/<curso>/<curso>---<leccion>.md` con el SRT en un bloque ```srt — material inmutable para el destilado del agente. Si no hay SRT capturado, se omite con un aviso y el export no falla.
- **Multi-agente**: el scaffold genera `CLAUDE.md` **y** `AGENTS.md` (espejo) — Claude Code lee el primero; Codex/Cursor/Jules/ZCode leen el segundo.

## Almacenamiento

| Clave (chrome.storage.local / fallback localStorage) | Contenido |
|---|---|
| `obsidian_export_config` | `{ vaultName, sourcesFolder, mocsFolder, includeCards, autoExport, includeRawSrt }` |
| `obsidian_created_mocs` | `string[]` de slugs de curso con MOC ya creado |

## Convenciones del vault (contrato con CLAUDE.md / AGENTS.md)

- Sesiones: `wiki/fuentes/<curso-slug>---<leccion-slug>.md`
- MOCs: `cursos/<curso-slug>.md`
- Raw: `raw/<plataforma>/<curso-slug>/<curso-slug>---<leccion-slug>.md` (SRT EN envuelto en un bloque ```srt, frontmatter `type: raw-srt`)
- Slugs: kebab-case, sin tildes, minúsculas (`slugifyVault`).
- Frontmatter de sesión: `title, date, type: sesion, platform, course, lesson, objective, relevance_score, source_url, tags`.
- Tarjetas: sección `## Tarjetas Anki` con `#flashcards` y líneas `pregunta :: respuesta` (plugin Spaced Repetition). El `.apkg` con la plantilla dev-card sigue siendo el camino principal a Anki.

## UI (StudyAgentTab)

- Tarjeta **Obsidian** en el paso "No olvidar" (junto a los botones de export Anki):
  - **Exportar** — nota + MOC (si falta) vía URI.
  - **Copiar** / **.md** — respaldos.
  - **Configurar** — vault, carpetas, toggles, **Probar vault** (`obsidian://open`) y **Crear desde cero** (6 notas de scaffold, disparadas en secuencia con 900 ms de separación).
- **Auto-export**: si `autoExport` y hay vault configurado, tras generar la sesión se exporta sola (guard `obsidianAutoRef` para que las restauraciones del historial no re-exporten).

## Pruebas

```bash
node scripts/test-obsidian-export.mjs   # asserts sobre los builders puros (Node 24+, sin chrome)
npm run build                           # tsc + vite
```

## Limitaciones conocidas

- Obsidian debe estar instalado; la primera vez Chrome pide permiso para el protocolo `obsidian://`.
- Notas muy grandes por URI: límite práctico ~100 kB (una sesión típica son 5–10 kB).
- `obsidian://new` sobre un archivo existente crea un duplicado "nombre 1.md" — por eso el MOC se crea una sola vez por curso.
- **El destilado de conceptos NO corre en la extensión**: Chrome no le da acceso de lectura al vault. Corre del lado del agente — la skill `llm-wiki` del vault (Operación 7, "destilar las sesiones nuevas") o el AI-ASSISTANT con las tools de abajo. Siempre supervisado: propone, el usuario confirma.

## Contrato con AI-ASSISTANT (agente de escritorio, FastAPI en 127.0.0.1:8010)

El agente usa function-calling con un TOOLS_SPEC (ver `docs/TOOLS_SPEC.md` de ese proyecto). Para conectarlo al vault, añadir estas dos funciones a su spec — respetan el esquema de `CLAUDE.md` del vault y NO tocan `raw/`:

```json
[
  {
    "type": "function",
    "function": {
      "name": "search_learning_vault",
      "description": "Busca en el vault de aprendizaje (sesiones, conceptos, entidades, síntesis). Para responder '¿qué aprendí esta semana de X?', preparar quizzes y detectar conceptos sin página.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "Término o pregunta a buscar en el contenido de las notas" },
          "scope": { "type": "string", "enum": ["todo", "sesiones", "conceptos", "entidades", "sintesis", "cursos"], "description": "Carpeta wiki donde buscar" },
          "course": { "type": "string", "description": "Slug del curso para filtrar (opcional)" },
          "since_date": { "type": "string", "description": "Fecha ISO inicial (YYYY-MM-DD) opcional" }
        },
        "required": ["query"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "write_vault_note",
      "description": "Crea o actualiza una nota del vault siguiendo el esquema (concepto, entidad, síntesis o sesión). Nunca escribe en raw/. Registra la operación en log.md.",
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "Ruta relativa, ej: wiki/conceptos/jit-compilacion.md" },
          "markdown": { "type": "string", "description": "Contenido completo de la nota con frontmatter válido según CLAUDE.md" },
          "log_entry": { "type": "string", "description": "Detalle para el registro en log.md" }
        },
        "required": ["path", "markdown"]
      }
    }
  }
]
```

Notas de implementación para el backend del agente:
- Raíz del vault por defecto: `D:\Obsidian\Dev Courses` (hacerla configurable en `appsettings.json`).
- `search_learning_vault`: grep recursivo sobre `wiki/` + `cursos/` devolviendo ruta + extracto; opcional parseo de frontmatter (pyyaml) para filtrar por `course`/`date`.
- `write_vault_note`: validar que `path` empiece por `wiki/` o `cursos/` (jamás `raw/`), crear carpetas, y añadir la línea `## [YYYY-MM-DD] export | <log_entry>` a `log.md`.
- Con el plugin **Local REST API** de Obsidian estas dos herramientas se resuelven por HTTP sin acceso directo a disco (ventaja: Obsidian resuelve enlaces y actualiza el índice).
