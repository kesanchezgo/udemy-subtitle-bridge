## [1.5.0] — 2026-10-31

### Study · flujo flowVersion 2 (4 pasos, un solo modo)
- **4 pasos**: Recordar (nivel + recuerdo libre + conceptos, fusiona los
  antiguos 0 y 1) → Comprobar (adaptativo) → Aplicar (nunca bloquea) →
  Fijar (exportar + Terminar lección). Mínimo real: 1 toque de nivel +
  1 respuesta + Terminar (~3 min); el hero promete «~4–10 min» en vez de
  un falso «~8 min».
- **Comprobación adaptativa**: arranca en la dificultad declarada; correcta
  a la primera completa el paso con «Un reto más» opcional; fallar trae una
  pregunta de consolidación del nivel anterior (máx. 2 obligatorias).
  «Ir al desafío» ya no dispara «Evaluación saltada»; el toast queda solo
  para «Saltar», que ahora es un botón secundario con contraste AA.
- **Terminar lección**: exportar ya no es requisito. `finishedAt` marca el
  cierre; quien exporta solo a Obsidian sí puede terminar. Sin exportar,
  la lección aparece en «Tarjetas de contenido por descargar».
- **Resumen de cierre honesto**: una sola tarjeta con datos reales
  (recordadas, comprobación, práctica, calibración, tarjetas, próximo paso).
  Título según resultado — «Lección dominada» solo con todo correcto a la
  primera; nunca por defecto. Fuera «¡Comprensión verificada! La IA
  confirmó…», el cohete que rebota y «Lección dominada» incondicional.
- **Calibración honesta**: demostrado = dificultad más alta correcta a la
  primera (antes: ratio de correctas que ignoraba la dificultad).
- **Pantalla de objetivo compacta** para quien vuelve (objetivo + CTA
  «Empezar · ~4–10 min», curso y objetivo propio plegados). El indicador
  «Transcripción capturada · 248 líneas» (texto fijo) pasa a estado real vía
  bridge con reintentos; CTA bloqueado sin transcripción, con motivo.
- **Repasos pendientes visibles**: fila discreta con las tarjetas del curso
  pendientes (AnkiConnect, scope curso — `USG_ANKI_DUE` acepta
  `scope: lesson|course|all`). Muerto el «logro» por abrir Anki.

### Gamificación (§2)
- XP nuevo: `answer_submitted` 5 (≥20 car., 1/pregunta), `first_try_correct`
  10, `answer_improved` 10, `practice_attempted` 15, `practice_correct` +10
  (+20 si es reto de código correcto), `lesson_finished` 30, `export_done` 10
  (una vez por lección, Anki u Obsidian). Fuera XP por autodeclarar
  (`concept_ack`) y combos (`question_combo`); logro combo3 eliminado,
  s1 → «Primera lección terminada», c25/c100 cuentan aciertos a la primera.
- **Una celebración grande por lección**: el cierre, con nivel y logros DENTRO
  de la tarjeta (`mergeFollowUps`), sin overlays en cola por respuesta ni
  frases aleatorias. Confeti solo en cierre y subida de nivel. Fuera el
  shake al fallar y el destello al acertar; fuera los toasts de «+5 XP»,
  «Vas por buen camino…» y «Adaptando las preguntas a tu nivel…».
- «Reiniciar» pide confirmación antes de borrar. Panel de Progreso: sección
  «Aprendizaje» (lecciones semana/total, % aciertos a la primera de las
  últimas 20, puntos reforzados, repasos pendientes en Anki); «Estudiante
  Focado» → «Enfocado»; rangos con iconos del set propio (fuera emojis).

### Study → mazo (§3): tarjetas de refuerzo
- Las tarjetas del prompt llevan `conceptRefs` (como las preguntas); al
  llegar a Fijar se calculan los conceptos débiles (no marcados o cubiertos
  por fallos): las tarjetas existentes que los cubren reciben
  `kinema::reforzar` y van PRIMERO en la cola (`buildConceptSpec` ordena
  antes de asignar due); los conceptos débiles sin tarjeta generan como
  máximo 2 tarjetas de refuerzo desde la pregunta fallada
  (`kinema::origen::study`, GUID con prefijo `study:`).
- Vista previa con chip «Refuerzo» y «Quitar/Incluir» por tarjeta: solo se
  exporta lo que el estudiante acepta; la selección persiste en el historial
  y «Volver a descargar» la respeta.
- El aviso de reexportación compara el conjunto de GUIDs (`exportedGuids`) y
  solo avisa si el paquete cambió.

### Feedback de la IA (§4)
- Rúbrica explícita: veredicto sin «85% de comprensión» (precisión
  inventada), BIEN / FALTO / PARA RECORDAR, sin PROFUNDIZACIÓN (la pregunta
  nueva que nunca se podía responder), max_tokens 380 → 260. En la revisión
  de código, SIGUIENTE NIVEL solo con veredicto correcto y nivel
  clear/mastered (el nivel viaja en el contexto). Práctica oral con la misma
  rúbrica. «Sin conexión con la IA local» muestra el error real.

### Otros (§5, §6)
- Demo solo fuera de la extensión: sin detección, curso/lección/objetivo
  arrancan vacíos y el CTA explica qué falta (antes nombrarían el mazo con
  «Java In-Depth…»).
- Restauración v2: `questionsDone` explícito (nunca inferido de «una
  correcta»), `finishedAt`, cola reconstruida del historial; migración v1 →
  v2 en lectura (focusStep 5→4 pasos mapeado).
- **Seguridad**: eliminado el autosync de tarjetas a Supabase que enviaba el
  `userId` en la URL sin Authorization; se documenta el requisito del JWT
  para la edge function antes de reactivarlo.
- Obsidian y el historial reciben el cierre: «Lo que recordé sin mirar»
  (recallNotes), «Puntos a reforzar» (preguntas falladas con su respuesta,
  plegadas) y el resultado de la sesión en la nota.
- Guía de importación: frase honesta de FSRS («Comprueba que FSRS esté
  activado: Opciones del mazo → FSRS (Anki 23.10+)» — la prueba decisiva en
  perfil limpio queda pendiente, ver docs/STUDY_FLOW_PEDAGOGY.md),
  «Vocabulary → {idioma configurado}», fuera «tu sistema de imágenes».
- Contraste AA en lo tocado (nav, Saltar, Nv. X) con tokens del tema;
  generador: lista de estados sin «Paso 1–5» y barra indeterminada.

### Docs
- `docs/STUDY_FLOW_PEDAGOGY.md` (nuevo): cada decisión con su referencia
  DOI verificada (Hattie & Timperley 2007; Shute 2008; Deci, Koestner &
  Ryan 1999; Metcalfe 2017; Dunlosky & Rawson 2012; Karpicke & Blunt 2011;
  Kalyuga 2007; Sailer et al. 2017; Butler & Winne 1995).

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