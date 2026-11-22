# Integración con Obsidian

> Manual de usuario (en el vault): `D:\Obsidian\Dev Courses\propuesta-integracion-udemy-obsidian.md`.
> Este documento es la vista de desarrollador: arquitectura, contrato de datos y pruebas.

## Arquitectura (fase 3: Obsidian conectado · fase 5: se guarda solo al terminar)

```
StudyAgentTab (Terminar lección · la espera) · Biblioteca · Ajustes
   │  saveLessonToObsidian(data, auto | append | replace)  ·  runObsidianQueue() (lo que esperaba)
   ▼
obsidianWriter.planLessonWrites()      ← QUÉ se escribe (una sola vez, igual en las dos rutas)
   │   nota de la lección · índice del curso · MOC del programa · transcripción (raw/)
   ├── Obsidian conectado ──► obsidianBridge ─ USG_OBSIDIAN_REST ─► background.ts
   │                          handleObsidianRest → obsidianRestOps + runVaultWrites
   │                          → plugin Local REST API (127.0.0.1:27123): todo de una vez
   │   Obsidian cerrado ──► la lección ESPERA (historial: syncPending.obsidian) y se guarda al volver
   └── Biblioteca sin conexión directa (respaldo) ──► obsidian://new (una URI por clic)
obsidianDestination  ← DÓNDE: carpeta del curso (registro + Ajustes), rutas y MOCs
obsidianSession      ← la nota rehecha desde el historial (Biblioteca)
```

- **Dos rutas, el mismo markdown**: `planLessonWrites` decide la lista de escrituras y sus reglas; los builders de `obsidianExport` generan el contenido. Una nota no cambia según cómo se guardó.
- **Reglas de no pisar** (iguales en las dos rutas):
  | Escritura | Modo | Qué hace si ya existe |
  |---|---|---|
  | Nota de la lección | `create` | No se escribe: el aviso ofrece **Añadir** (repaso al final) o **Reemplazar** |
  | «Repaso · fecha» | `append` | Se añade al final; lo que escribiste no se toca |
  | Reemplazar | `replace` | Solo con el clic explícito |
  | Índice del curso, transcripción | `createIfMissing` | Se deja como está (raw/ es inmutable) |
  | MOC del programa | `managed` | Solo se reescribe su bloque entre `%% kinema:auto:inicio %%` y `%% kinema:auto:fin %%`; un MOC antiguo sin marcas no se toca (sin conexión, «Actualizar MOC del programa» lo rehace, como en 1.9.6) |
- **Obsidian conectado** (plugin **Local REST API**, opcional): la URL tiene que ser de este ordenador (`127.0.0.1`, `localhost` o `[::1]`; `normalizeRestUrl`), la cubre el `host_permission` `http://127.0.0.1/*`, y cada operación comprueba antes que el plugin responde y acepta la clave. Por defecto el servidor HTTP del plugin (`Enable Non-encrypted (HTTP) Server`, puerto 27123): el HTTPS (27124) usa un certificado propio en el que Chrome no confía sin instalarlo.
- **Respaldo**: si Obsidian está cerrado o sin el plugin (`unreachable`), Kinema vuelve a `obsidian://` dentro del mismo clic con la misma nota y la misma carpeta (la URI abre Obsidian). Si la clave es incorrecta, se dice y no se escribe nada.
- **Una URI por clic** (sin conexión): Chrome bloquea un segundo protocolo externo hasta la siguiente interacción. Exportar abre SOLO la nota; el índice del curso, el MOC del programa y los subtítulos se ofrecen en el aviso, encadenados, cada uno con su clic. Las notas de más de 30 000 caracteres codificados viajan por el portapapeles (`clipboard=true`), también la transcripción.
- **MOCs**: el índice del curso se crea una vez por curso y vault; lo mantiene una query Dataview. Desde la fase 3 la query es `FROM "<lecciones>" OR #kinema/sesion WHERE course = "<slug>"`: encuentra las sesiones en la carpeta de lecciones (con sus subcarpetas por curso o programa) y en cualquier carpeta elegida a mano. El MOC del programa usa el mismo origen con `WHERE contains(programas, …) OR programa_slug = …`.
- **Transcripción → raw/** (`includeRawSrt`): se pide el SRT EN al content script (`GET_EN_SRT`, 5 s) antes de escribir, y va a `raw/<plataforma>/<curso>/<curso>---<leccion>.md`. **Corregido en la fase 3**: la plataforma es la de la lección (antes iba siempre a `raw/udemy/`, también en DataCamp). Conectado, se guarda sola (solo si no existe); sin conexión, «Guardar subtítulos» en el aviso.
- **Multi-agente**: el scaffold genera `CLAUDE.md` **y** `AGENTS.md` (espejo). Conectado, «Preparar el vault» (fase 5.1) los escribe en el vault una vez, solo lo que falte (`prepareVaultIfNeeded`, `createIfMissing`: un `CLAUDE.md` tuyo no se pisa); sin conexión, «Estructura (.zip)».

## Dónde van las notas (fuente única: `obsidianDestination`; fija desde la fase 5)

Como en Anki (el mazo es el curso; lo que se cruza va en etiquetas), la
carpeta es el contenedor y lo que se cruza va en propiedades, enlaces y MOCs:

| Qué | Dónde | Relación |
|---|---|---|
| Sesión (una por lección) | `<lecciones>/<curso>/<curso>---<leccion>.md` | 1 curso → N lecciones: carpeta |
| Índice del curso (MOC) | `<cursos>/<curso>.md` | enlazado desde cada sesión (`Curso: [[…]]`); Dataview por `#kinema/sesion` + `course` |
| MOC de cada programa | `<cursos>/moc-<programa>.md` | N:M: enlaza sus cursos (bloque gestionado); Dataview por `programas` / `programa_slug` |
| Transcripción | `raw/<plataforma>/<curso>/<curso>---<leccion>.md` | inmutable |

- **Por qué el programa no es una carpeta**: un curso puede estar en varios
  programas y un programa tiene varios cursos (N:M). Una carpeta por programa
  obligaría a elegir uno o a duplicar notas; por eso desaparecen «Todas
  juntas» y «Por programa». La sesión lleva `programas: [...]` (todos los que
  incluyen el curso, según la plataforma): el MOC de CUALQUIER programa la
  encuentra sin reescribir notas.
- **Propiedades para los datos, etiquetas para clasificar**: `course`,
  `platform`, `programa`, `programa_slug`, `programas`, `anki_deck` son
  propiedades (consultables con Dataview o Bases); las etiquetas, todas bajo
  `kinema/` (`kinema/sesion`, `kinema/curso/<curso>`, `kinema/plataforma/<id>`,
  `kinema/moc/curso`, `kinema/moc/programa`, `kinema/raw`) — antes la
  plataforma y el curso iban sueltos en la raíz de tus etiquetas (`udemy`,
  `curso`, `java-bootcamp`). Las notas ya escritas no se reescriben.
- **El nombre de la nota no cambia nunca** (`<curso>---<leccion>.md`, el contrato del `CLAUDE.md`): los enlaces por nombre siguen funcionando aunque la nota cambie de carpeta.
- **Registro por curso** (`obsidian_course_folders`, clave = `kinemaSlug(curso)`, la misma que el registro de mazos de Anki): la primera nota de un curso fija su carpeta y las siguientes van ahí aunque cambie el programa activo. Un curso nunca queda repartido.
- **De una estructura anterior a la de ahora** (`obsidianBridge.loadObsidianConfig`, una vez): si la configuración guardada era «Todas juntas» o «Por programa», antes de nada se fija la carpeta de cada curso que ya tiene notas — la de su última nota (`obsidianNotePath`) o la que le daba la estructura anterior (`legacyCourseFolder`) — y la configuración pasa a `course`. Nada se mueve; los cursos nuevos van a su carpeta.
- **«Cambiar»** (Fijar y Biblioteca, `ObsidianFolderPicker`, gemelo de `AnkiDeckPicker`): la carpeta de todo el curso. Conectado, puede mover las notas que ya existen con `MOVE` del plugin (usa el renombrado de Obsidian: **actualiza los enlaces**); nunca pisa un destino que exista; un plugin anterior a `MOVE` deja las notas donde estaban y se dice.
- **Cambiar la carpeta de lecciones en Ajustes** no mueve nada: los cursos que ya tienen notas se fijan en su carpeta actual (`freezeCourseFolders`).
- Nombres de carpeta nuevos con `folderSlug`: «C++» y «C#» no comparten carpeta. Las carpetas que ya usabas dan la misma ruta (`cleanVaultFolder` solo quita `..`, `.`, barras sobrantes y caracteres de control).

## Almacenamiento

| Clave (chrome.storage.local / fallback localStorage) | Contenido |
|---|---|
| `obsidian_export_config` | `{ vaultName, sourcesFolder, mocsFolder, includeCards, srFlashcards, includeRawSrt, noteLayout, restUrl, restApiKey, prepareVault, vaultPreparedAt }` (`noteLayout` es `course` desde la fase 5; `autoExport` se conserva y se ignora: conectado, se guarda siempre al terminar. Fase 5.1: `prepareVault` se enciende al pegar la clave por primera vez —sin el campo, en configs de antes, queda apagado— y `vaultPreparedAt` marca que ya se hizo) |
| `obsidian_course_folders` | `{ [kinemaSlug(curso)]: { folder, program?, at } }` — carpeta fijada de cada curso |
| `obsidian_created_mocs` | `string[]` de `vault|slug` de curso (y `program::<slug>`) con MOC ya creado |
| `obsidian_exported_notes` | `string[]` de `vault|ruta` de notas ya exportadas (las claves viejas `curso---lección` se siguen reconociendo) |
| Historial (`usb_history_lecture::…`) | `obsidianExportedAt`, **`obsidianNotePath`** (dónde está la nota; sigue a la nota si se mueve), **`platform`**, **`lessonUrl`**, `dcTrackSlug` (antes `writeLecture` no lo fusionaba y se perdía en cada guardado) y, fase 5, **`syncPending.obsidian`** (terminada cuando Obsidian no respondía: se guarda sola al volver) |

La clave del plugin se guarda en `chrome.storage.local` (como las llaves de IA) y solo viaja al service worker, que la usa contra `127.0.0.1`.

## Convenciones del vault (contrato con CLAUDE.md / AGENTS.md)

- Sesiones: `wiki/fuentes/<curso-slug>/<curso-slug>---<leccion-slug>.md` (las de versiones anteriores, donde estaban: ver arriba)
- MOCs: `cursos/<curso-slug>.md` y `cursos/moc-<programa-slug>.md`
- Raw: `raw/<plataforma>/<curso-slug>/<curso-slug>---<leccion-slug>.md` (SRT EN envuelto en un bloque ```srt, frontmatter `type: raw-srt`)
- Slugs: kebab-case, sin tildes, minúsculas (`slugifyVault`).
- Frontmatter de sesión: `title, date, type: sesion, platform, course, lesson, objective, relevance_score, lesson_url, anki_deck, programa, programa_slug, programas, concepts, tags` (la plantilla del scaffold usa el mismo esquema).
- Secciones de la nota, alineadas con Study: Resumen · Ideas clave · Preguntas para comprobarte (una por idea + síntesis, con lo que piden: definir, explicar, usar en un caso…) · Práctica oral · Aplicación práctica (el ejercicio tal como se vio, con su clave plegada) · Próximo paso · Resultado de la sesión · Lo que recordé sin mirar · Puntos a reforzar (ideas que no tenías claras, preguntas falladas y la práctica que no salió: lo mismo que Anki refuerza) · Dudas resueltas · Tarjetas.
- Tarjetas: las mismas que el mazo (las aceptadas, con las de refuerzo y de duda), como referencia plegada; con «Repasar también en Obsidian», formato multilínea del plugin Spaced Repetition bajo `#flashcards`. Anki (el .apkg que llega solo al terminar) sigue siendo el camino principal del repaso.
- Ideas que ya estaban en el mazo (fase 4, `deckConcepts.ts`): en «Ideas clave» la idea termina con `· _ya en tu mazo: [[<curso>---<lección>|Lección]]_` — enlace por nombre de fichero a la nota de la lección donde está su tarjeta, con su curso si es de otro (`(curso «Intro to SQL»)`; sin resolver si esa lección no tiene nota, a propósito), `de una sesión anterior de esta lección` si es la misma, y `· adelantada a hoy en Anki` si se pulsó «Repasar hoy en Anki». El resultado de la sesión añade `· N ideas ya estaban en tu mazo` a la línea de Tarjetas. La nota rehecha desde la Biblioteca lo lleva igual (sale del `studyContent.deckMatches` guardado).
- Bloque gestionado: en los MOC de programa, lo que va entre `%% kinema:auto:inicio … %%` y `%% kinema:auto:fin %%` lo reescribe Kinema; lo de fuera es del estudiante.

## UI

- **Fijar · Obsidian** (fase 5: sin exportar): el destino siempre a la vista (`ObsidianFolderPicker`: carpeta del curso, nombre de la nota, «Cambiar») y una línea de estado (`SyncStatus`) en lugar de botones:
  - Sin conexión directa: «Conecta tu vault (plugin Local REST API)…» → «Conectar» (Ajustes → Obsidian). Sin ella no hay guardado automático: obsidian:// abriría Obsidian en primer plano en cada lección y solo con la nota (sin índice ni MOC).
  - Conectado, antes de terminar: qué se guardará y dónde («Al terminar, se guardan solos la nota y el índice del curso en …/»), o que se añadirá el repaso si la nota ya existe.
  - Al terminar (`handleFinishLesson` → `saveLessonToObsidian(data, "auto")`): si la nota existe se añade el repaso; si no, se crea — todo de una vez, sin diálogos. El aviso dice lo que pasó de verdad y ofrece «Abrir».
  - Obsidian cerrado al terminar: **espera** (`syncPending.obsidian`) y se guarda sola cuando vuelve (al abrir el panel, cada minuto mientras algo espera o con «Comprobar»); las de otras lecciones, rehechas desde el historial (`runObsidianQueue`).
  - Con la nota en el vault: «Abrir en Obsidian» y «Reemplazar…» (ofrece Añadir o Reemplazar).
  - Ya sincronizado al terminar, los módulos se acortan: se oculta el texto previo de cobertura y la acción ancha «Volver a proponer palabras» se sustituye por una acción compacta inline **«Rehacer»** (`aria-label="Volver a proponer palabras"`).
- **Ajustes → Obsidian** (fase 5.1: el mismo lenguaje que el resto de Ajustes, en un solo nivel —grupos, filas `SettingRow`, `StatusPill`, pliegues; nada de tarjetas dentro de la sección— y **todo se guarda solo**, sin botón de guardar): **Vault y conexión** con `Nombre del vault` **primero** (tal como figura en Obsidian) y `Clave API` con la pista «Puerto 27123 por defecto»; el puerto personalizado queda plegado dentro de «Cómo conectar Obsidian». **Carpetas** («Dónde quedan tus notas»: carpeta por curso, índice, MOC de programa, «Cambiar carpetas») · **Nota** («Qué lleva la nota»: tarjetas, Spaced Repetition, subtítulos) · **Opciones adicionales** con `Estructura wiki inicial` como **acción puntual** (`Crear` si aún no se preparó / `Revisar` si ya está, y `.zip` para el respaldo sin plugin), no como interruptor ON/OFF. Sin «Organización», «Guardar al terminar» ni «Guardar preferencias».
- **Preparar el vault** (fase 5.1): con la conexión directa, crea una vez lo que falte de la estructura (índice, registro, plantillas, `CLAUDE.md`/`AGENTS.md`) con `createIfMissing`. Se hace al conectar desde Ajustes o, si Obsidian estaba cerrado, después de guardar la siguiente lección; queda la fecha (`vaultPreparedAt`) y no se repite. «Revisar otra vez» lo vuelve a comprobar a mano.
- **Biblioteca** (por curso): la carpeta con el mismo control que Fijar, «N de M lecciones en Obsidian» y, conectado, **lo que hay de verdad en el vault** (una petición por carpeta: `obsidianFoldersToCheck` + `courseVaultState`): «Comprobado en el vault» o «1 ya no está en el vault», índice creado o no, «Abrir índice» y **«Guardar las N notas que faltan»** (lecciones terminadas sin nota, o cuya nota ya no está). Por lección: «en Obsidian» / «no está en el vault», la ruta de la nota, «Abrir nota» y «Guardar nota» / «Guardar otra vez». Sin conexión directa, la Biblioteca es el único sitio con respaldo por obsidian://: desde el detalle de cada lección (una URI por clic).
- **Nota desde el historial** (`obsidianSession.sessionDataFromRecord`): mismas secciones con lo que el historial guarda — contenido, «Lo sabía» de Recordar, respuestas de Comprobar (y si salieron a la primera), práctica, dudas y tarjetas aceptadas. No se inventa lo que no se guarda: la calibración (es de la sesión) no aparece; sin `studyContent` no hay nota.

## Pruebas

```bash
node scripts/qa-obsidian-units.mjs   # plugin (vault falso con el contrato real), destino, escritura, MOC gestionado, nota desde el historial, Biblioteca
node scripts/qa-obsidian-flow.mjs    # prototipo con vault simulado: Terminar lección guarda solo, Reemplazar/añadir repaso, mover, Ajustes, Obsidian cerrado → espera → se guarda solo, Biblioteca
node scripts/qa-sync-flow.mjs        # fase 5: Anki y Obsidian cerrados al terminar → esperan → llegan solos; N:M de programas; cola de otras lecciones
node scripts/qa-doubts.mjs           # incluye la nota, una URI por export, el índice aparte y la estructura .zip
node scripts/qa-anki-flow.mjs        # la Biblioteca sin conexión directa (obsidian://open) sigue igual
node scripts/qa-deck-units.mjs && node scripts/qa-deck-flow.mjs   # fase 4: «ya en tu mazo» en Ideas clave y en el resultado
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

- Obsidian debe estar instalado; sin conexión directa, la primera vez Chrome pide permiso para el protocolo `obsidian://`.
- Notas muy grandes por URI: límite práctico ~100 kB (una sesión típica son 5–10 kB). Con la conexión directa no hay límite práctico.
- `obsidian://new` sobre un archivo existente crea un duplicado "nombre 1.md" — por eso, sin conexión, el MOC se crea una sola vez por curso. Con la conexión directa se sabe si existe y nunca pasa.
- La conexión directa sirve el vault **abierto** en Obsidian (cada vault tiene su instancia del plugin y su puerto): con otro vault abierto, Kinema escribe en ese. El nombre del vault de Ajustes solo se usa para `obsidian://`.
- Mover notas necesita una versión reciente del plugin (con el método `MOVE`; verificado con la 5.5.2); con una anterior, Kinema lo dice y las deja donde están.
- Notas exportadas antes de la fase 3 no guardaban su ruta: la Biblioteca las busca en la carpeta de lecciones (donde iban todas); si las moviste a mano, aparecen como «no está en el vault».
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
