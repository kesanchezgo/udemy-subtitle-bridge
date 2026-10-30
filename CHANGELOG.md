## [1.4.1] — 2026-10-29

### Corrección crítica
- El .apkg de LECCIÓN (conceptos) no importaba en Anki real: los archivos de
  media de Prism se guardaban en el zip bajo su nombre real en vez de bajo su
  número («0», «1»…). Hallado importando en Anki Desktop (AnkiConnect).
  El empaquetado vive ahora en addApkgEntries (ankiApkgCore.ts, función pura
  compartida por la extensión y el QA). Verificado: conceptos + Prism
  importan sin error y los 2 archivos aparecen en collection.media.

## [1.4.0] — 2026-10-29

### Anki · Conceptos
- Prism embebido en el .apkg (`_kinema-prism-v1.*`): resaltado de código
  offline para 23 lenguajes (antes: CDN, solo java/markup/properties).
- El prompt usa el lenguaje REAL del curso; las clases desconocidas caen a
  `language-none`.
- Info mínima: comparación pregunta por UNA dimensión (tabla ≤3 filas como
  apoyo), proceso ≤4 pasos, entrevista máx. 1 por lección; el back abre
  respondiendo y luego el porqué.
- `newGatherPriority: 1`: las nuevas salen en el orden en que estudiaste.
- Tags jerárquicos `kinema::` (curso/lección/tipo/tema); fuera tags sueltos.
- La ruta del mazo del aviso incluye `::Courses::` (antes mentía).
- Fuera el export `.txt` (duplicaba sin GUID con otro note type); `.apkg` es
  el único camino. Aviso al reexportar una lección regenerada.
- FSRS: corrección documental — no viaja en el .apkg; activarlo en Opciones.

### Anki · Vocabulario v2
- Note type POR IDIOMA (`Kinema · Vocab · English`, ID por idioma).
- Dos tarjetas: «Reconocer» (palabra resaltada en contexto) y «Producir»
  (hueclo cloze, activada por defecto; interruptor en Ajustes).
- Audio con respaldo: archivo si existe, si no voz del sistema con el locale
  del idioma. Fuera el selector de audio.
- Campos nuevos al final: `nivel`, `colocacion`, `fuente`, `producir`.
- Tags `kinema::` jerárquicos; fuera `udemy-bridge` y tags sueltos.

### Obsidian
- Resumen generativo real (la relevancia pasa a línea aparte).
- Respuestas plegadas (callouts) para autoevaluación.
- Tarjetas como referencia plegada sin `#flashcards`; «Repasar también en
  Obsidian» (apagado) activa el formato del plugin.
- «Reemplazar nota» (`overwrite=true`); clipboard para URIs >30k (SRT antes
  de la primera URI); MOC por vault y con la carpeta configurada;
  frontmatter `anki_deck`/`lesson_url`/`concepts`; tags `kinema/*`;
  conceptos enlazables `[[wiki/conceptos/…]]`; errata «cruto»→«crudo».

### Fase 2 (parcial)
- `t` (minuto de la lección) en tarjetas y palabras: la Fuente enlaza a
  `?start=<seg>`; conceptos enlazables `conceptTerms`.
- Pendiente: recolección temporizada del transcript (insertar `[mm:ss]` en el
  prompt) — requiere su propia pasada de QA del pipeline de transcripción.

### General
- Auditoría de producción: cloze XSS/regex, auth local sin Supabase,
  PermissionPage con tema, animaciones finitas, WAR mínimo, focusable=false,
  logs con guarda DEV, permiso de host por service worker.
- Modelo de IA por defecto en QA: `qoder/qwen3.8-flash`.

## [1.1.1] and earlier

See git history.