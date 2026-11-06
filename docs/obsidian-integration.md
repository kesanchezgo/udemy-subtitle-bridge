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
- **Cómo crece el vault**: una nota por lección (`wiki/fuentes/`), un índice por curso (`cursos/`) y, si lo activas, los subtítulos en `raw/`. Exportar otra vez una lección que ya tiene nota (en ese vault y carpeta) **añade** un «## Repaso · fecha» al final (`append=true`) con el resultado, lo que recordaste, los puntos a reforzar y las dudas de esa sesión: lo que escribiste no se toca. «Reemplazar» rehace la nota entera (y borra tus cambios). Nunca se crean «nombre 1.md».
- **Una URI por clic**: Chrome bloquea un segundo protocolo externo hasta la siguiente interacción del usuario (protección «flooded with requests» del manejador de protocolos externos). Exportar abre SOLO la nota de la lección; el índice del curso (MOC) y los subtítulos se ofrecen después en el aviso como acciones propias, encadenadas, cada una con su clic. Antes se abrían MOC + nota en el mismo clic y, en el primer export de cada curso, la nota se perdía.
- **Fallbacks** en la UI: copiar al portapapeles (`navigator.clipboard`) y descarga `.md`.
- **MOC**: se ofrece una vez por curso y vault («Crear índice del curso» en el aviso del export); la lista de sesiones la mantiene una query Dataview (`WHERE course = "<slug>"`), así el MOC nunca se actualiza a mano. Se marca creado (`obsidian_created_mocs`) solo cuando el usuario lo abre; si no, se vuelve a ofrecer en el siguiente export.
- **Subtítulos → raw/** (toggle `includeRawSrt`, «Subtítulos originales»): antes de abrir la nota, la extensión pide el SRT EN al content script (`GET_EN_SRT` → `EN_SRT_RESULT`, timeout 5 s); tras la nota, el aviso ofrece «Guardar subtítulos», que crea `raw/<plataforma>/<curso>/<curso>---<leccion>.md` con el SRT en un bloque ```srt. Si no hay SRT capturado, se avisa y el export no falla.
- **Multi-agente**: el scaffold genera `CLAUDE.md` **y** `AGENTS.md` (espejo) — Claude Code lee el primero; Codex/Cursor/Jules/ZCode leen el segundo.

## Almacenamiento

| Clave (chrome.storage.local / fallback localStorage) | Contenido |
|---|---|
| `obsidian_export_config` | `{ vaultName, sourcesFolder, mocsFolder, includeCards, autoExport, includeRawSrt }` |
| `obsidian_created_mocs` | `string[]` de `vault|slug` de curso con MOC ya creado |
| `obsidian_exported_notes` | `string[]` de `vault|ruta` de notas ya exportadas (las claves viejas `curso---lección` se siguen reconociendo) |

## Convenciones del vault (contrato con CLAUDE.md / AGENTS.md)

- Sesiones: `wiki/fuentes/<curso-slug>---<leccion-slug>.md`
- MOCs: `cursos/<curso-slug>.md`
- Raw: `raw/<plataforma>/<curso-slug>/<curso-slug>---<leccion-slug>.md` (SRT EN envuelto en un bloque ```srt, frontmatter `type: raw-srt`)
- Slugs: kebab-case, sin tildes, minúsculas (`slugifyVault`).
- Frontmatter de sesión: `title, date, type: sesion, platform, course, lesson, objective, relevance_score, lesson_url, anki_deck, concepts, tags` (la plantilla del scaffold usa el mismo esquema).
- Secciones de la nota, alineadas con Study: Resumen · Ideas clave · Preguntas para comprobarte (una por idea + síntesis, con lo que piden: definir, explicar, usar en un caso…) · Práctica oral · Aplicación práctica · Próximo paso · Resultado de la sesión · Lo que recordé sin mirar · Puntos a reforzar (ideas no marcadas, preguntas falladas y la práctica que no salió: lo mismo que Anki refuerza) · Dudas resueltas · Tarjetas.
- Tarjetas: las mismas que el mazo (las aceptadas, con las de refuerzo y de duda), como referencia plegada; con «Repasar también en Obsidian», formato multilínea del plugin Spaced Repetition bajo `#flashcards`. El `.apkg` sigue siendo el camino principal a Anki.

## UI (StudyAgentTab)

- Tarjeta **Obsidian** en el paso "No olvidar" (junto a los botones de export Anki):
  - **Exportar** — la nota vía URI; el aviso ofrece después el índice del curso y los subtítulos.
  - **Copiar** / **.md** — respaldos.
  - **Ajustar** — vault, carpetas, toggles, **Probar vault** (`obsidian://open`) y **Estructura (.zip)**: CLAUDE.md, AGENTS.md, index, log, plantillas y las carpetas configuradas, para descomprimir dentro del vault (7 URIs seguidas no funcionaban y `obsidian://new` no crea carpetas vacías).
- **Guardar automáticamente**: al pulsar «Terminar lección» (con la sesión completa y dentro de ese clic); si la lección ya tenía nota, le añade el repaso. Antes se exportaba al generar la sesión: la nota salía sin recuerdo ni resultados, el export final chocaba con «ya exportada» y, por un cierre obsoleto, a veces no exportaba nada.

## Pruebas

```bash
node scripts/qa-doubts.mjs   # incluye la nota, una URI por export, el índice aparte y la estructura .zip
npm run build
```

## Cambios 1.4.0 (2026-10-29)

- **La nota sirve para autoevaluarse**: las respuestas van PLEGADAS — cada
  pregunta de calibración es un callout `> [!question]-` con pista y respuesta
  dentro; la estructura ideal de la práctica oral y la solución de la
  aplicación también van plegadas. Recuperación antes que relectura
  (Karpicke & Blunt 2011, DOI 10.1126/science.1199327).
- **Resumen real**: sección «Resumen» con la síntesis generativa del prompt
  (con palabras propias); la relevancia pasa a línea aparte. En historial
  viejo sin summary, la sección se llama «Relevancia» como antes.
- **Tarjetas de la lección**: por defecto van como referencia PLEGADA
  (`> [!example]-`), bien formateadas con el conversor nuevo (bloques de
  código cercados con su lenguaje, tablas Markdown, listas) y SIN
  `#flashcards`. El interruptor «Repasar también en Obsidian» (apagado por
  defecto) activa el formato multilínea del plugin Spaced Repetition bajo
  `#flashcards`.
- **Reemplazar nota**: el segundo export ofrece «Reemplazar nota»
  (`overwrite=true`) — pisa también lo que hayas escrito en esa nota. «Copiar»
  y «.md» siguen como respaldos.
- **Notas largas por clipboard**: si la URI pasa de 30 000 caracteres (SRT
  crudo de una lección larga), el markdown va al portapapeles y se abre
  `obsidian://new?…&clipboard=true`. El SRT se pide antes de la primera URI.
- **MOC por vault**: el índice del curso se crea una vez POR VAULT (clave
  `vault|slug`); antes era una vez en total. Las entradas viejas se asignan
  al vault actual.
- **MOC con tu carpeta**: la consulta Dataview usa la carpeta configurada
  (antes iba fija a `wiki/fuentes`).
- **Frontmatter nuevo**: `anki_deck` (ruta real del mazo), `lesson_url`,
  `concepts`. Tags anidados: `kinema/sesion`, `kinema/curso/<slug>`.
- **Conceptos enlazables**: línea `Conceptos: [[wiki/conceptos/x|x]]` y
  `concepts:` en el frontmatter — los enlaces sin resolver son intencionados
  (el destilado del vault crea esas páginas).

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
