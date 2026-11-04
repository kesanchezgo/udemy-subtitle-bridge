## [1.5.11] — 2026-11-04

- **Un solo vocabulario para los fallos de IA** (`describeProviderFailure` en `ai-providers`), que habla del proveedor REAL y de su endpoint: sin proveedor configurado, no responde, credencial rechazada (401/403), limitando (429), cuota agotada, saturado (5xx), contenido vacío (modelos de razonamiento) o respuesta cortada. Antes cada camino inventaba su texto y varios culpaban a **Gemini** aunque el camino sea el proveedor configurado.
- Aplicado en los cuatro sitios donde el mensaje mentía o era genérico: **objetivos** (generar/regenerar), **refinar objetivo**, **generar sesión** y **vocabulario** (proponer palabras).

## [1.5.10] — 2026-11-04

- **El dock conoce el estado REAL de la IA** (antes el badge «IA local · conectada» venía hardcodeado y el CTA se podía pulsar sin proveedor):
  - El service worker sondea el `/models` del proveedor CONFIGURADO — valga el tipo (OpenAI-compatible, Anthropic, Gemini, servidores locales tipo kivaroute/Ollama/LM Studio) — con sus cabeceras de autenticación y 1,8 s de timeout, cacheado 15 s e invalidado al cambiar la configuración.
  - El CTA distingue tres estados y lo dice: «Sin proveedor de IA: configúralo en Ajustes → Proveedor» / «Comprobando la IA…» / «El proveedor no responde (endpoint). Reintentando…». Solo se habilita con la IA lista.
  - Reintento automático: cada 5 s mientras no responde, cada 30 s cuando está lista. El botón se enciende solo en cuanto la IA aparece, sin recargar.
  - La pre-generación también espera: sin IA disponible no se gasta la llamada.
  - El badge del header refleja el mismo estado (se acabó el verde mentiroso).
- QA: los mocks responden `GET /v1/models` para que el sondeo no invente un «sin respuesta».

## [1.5.9] — 2026-11-04

- **El CTA dejaba de estar muerto sin explicación cuando el curso tiene objetivos heurísticos**: la condición exigía `!objectivesMock`, así que elegir una de esas tarjetas no habilitaba «Generar sesión de aprendizaje» (solo escribir un objetivo propio lo hacía). Un objetivo ELEGIDO cuenta ahora aunque la plantilla sea heurística — la sesión se genera con el proveedor configurado, no con Gemini. El aviso de «plantillas heurísticas» se mantiene.
- **El indicador de transcripción se rendía a los ~60 s**: si los subtítulos se capturaban más tarde (p. ej. tras reintentar desde Captions), Study seguía diciendo «Sin subtítulos en esta lección» y el CTA quedaba bloqueado para siempre. Ahora sondea sin rendirse mientras el paso es el de objetivo y re-evalúa en cuanto llegan cues (con freno de 2 s).

## [1.5.8] — 2026-11-03

- **Estado de pre-generación por lección** (fallo de 1.5.7): `preGenRef` sobrevivía al cambio de lección porque Study está siempre montado. Si una lección se ojeaba sin estudiarla, quedaba en `done` y no se volvía a pre-generar en toda la sesión; si quedaba en `running`, al pulsar Empezar en la lección siguiente se esperaba esa generación ajena. Ahora se reinicia al cambiar de lección y en Empezar solo se espera la generación de la lección y el objetivo actuales.
- **La clave de caché lleva curso + ID real de la lección** (era solo el nombre + objetivo): dos lecciones con el mismo nombre («Chapter Introduction», «Demo») podían servirse el mazo de la otra. Además se re-verifica curso y lección al consumir. Verificado con un par real de lecciones homónimas: el mazo de A quedó en caché con el ID de A (`..._4121106_...`) y B (mismo nombre, ID 4299336) generó y consumió el suyo.
- La comparación de objetivo al terminar la pre-generación lee el objetivo **actual** (ref), no la foto del arranque.
- **Modo de cronometraje humano en el arnés** (`QA_HUMAN_TIMING=1`): tiempo por paso (Recordar, Comprobar, Aplicar, Fijar) desde Empezar, esperas de IA medidas aparte (generación y evaluaciones), si se consumió el mazo pre-generado y el estado de la escalera. Y modo de cambio de lección (`QA_MULTI_LESSON=1`, con `QA_MULTI_WAIT_A=1` para la prueba fuerte).

## [1.5.7] — 2026-11-03

- **Pre-generación del mazo durante el vídeo (opción A)**, con las cuatro condiciones acordadas:
  1. Solo con un objetivo del curso: el último usado en el curso (historial) o uno de los objetivos derivados del curso. Nunca un texto libre global que pueda venir de otro curso (es el bug que señaló la revisión: `agent_custom_obj` sobrevive al cambio de curso).
  2. Si el objetivo cambia, la pre-generación se descarta (se compara el objetivo al terminar) y al pulsar Empezar se genera como siempre.
  3. El mazo pre-generado vive solo en caché (`usb_cache_...` con TTL de 2 días): sin entrada de historial ni XP hasta que el estudiante abre Study.
  4. Arranca en los últimos ~3 min de lección, o al momento si dura menos; las lecciones que solo se ojean no gastan llamadas.
  Al pulsar Empezar, si hay una pre-generación en curso para el mismo objetivo se espera ESA llamada (sin duplicar) y se consume del caché. Medido: generación en el CTA **2 s** frente a 107-151 s de la ruta normal.
- **Reloj del vídeo en el dock**: la duración viaja en el payload de cada cue y el dock emite `usb:video-progress`, que decide la ventana de pre-generación.
- **Telemetría del escalón de generación** (`usg_study_generation_stats`): qué peldaño produjo cada mazo (8192 con razonamiento / 16384 sin él). Primeros datos: 4 mazos por el primer peldaño y 3 escalados — el razonamiento se mantiene en el primer intento, como se acordó.
- **Traducción bajo carga medida**: con una generación de mazo en curso, una línea tarda 1.8-2.3 s (media 2.0 s), igual que en reposo — el proveedor gratuito no serializa.
- **QA real**: `QA_REAL_PROXY`, `QA_COLD_SW`, `QA_KEEP_CACHE`, `QA_KEEP_HISTORY`, `QA_PICK_CARD`, `QA_SEED_COURSE_OBJECTIVE`, `QA_VERBOSE`; el perfil limpia cookies antes de inyectar la sesión (tokens rotados duplicados rompían la API).

## [1.5.6] — 2026-11-03

- **Vista previa sin extensión reparada** (regresión de 1.5.5): `proxyChat` y `streamProviderViaPort` delegaban siempre en el service worker y sin extensión lanzaban «sin runtime», un error que la cadena de respaldo no reconoce como fallo de conexión — Comprobar y los subtítulos traducidos caían. Ahora, sin runtime de extensión, ambos vuelven al fetch directo (la evaluación, su versión en streaming y `translateLine` llegan al mock). `qa:local` cubre las tres rutas.
- **Carrera del allowlist al despertar el SW**: al reanudarse tras ~30 s de inactividad la config aún no estaba cargada y el relay rechazaba el proveedor real (solo permitía 8010). La promesa de `initAiProviderConfig()` se guarda al arrancar y ambos handlers la esperan antes de validar la URL. Verificado con `QA_COLD_SW=1` (35 s de suspensión antes de evaluar).
- **Contraste del monitor de video en claro**: `text-white` exacto y los ámbar del chip de vocabulario sobre `.usb-video-surface` (la única superficie oscura dentro del dock claro) con tonos legibles (18.3:1 y 12.7:1); `qa-contrast-sepia` los mide y falla si desaparecen.
- **Reintentos de generación**: la escalera pasa de 8192 → 16384 sin razonamiento (se elimina el peldaño intermedio con razonamiento, el más lento y el que menos desatasca); la espera de la prueba admite generaciones largas (600 s).
- **QA**: `qa-local` portado a ESM y actualizado a la marca actual (Kinema) con 6 bloques; los tiempos por paso del informe ya no mezclan la generación con Comprobar.

## [1.5.5] — 2026-11-03

- **Streaming IA por el SW**: `streamConfiguredProvider` usaba `fetch` directo desde el content script, que Chromium bloquea por Private Network Access en páginas https; la evaluación quedaba colgada sin error. Ahora va por un Port del runtime (`USG_PROXY_STREAM`). La generación y la evaluación no-streaming ya usaban `USG_PROXY_CHAT`; la IA local integrada (8010) también pasa por el relay en vez de fetchear desde la página.
- **Allowlist del relay**: `USG_PROXY_CHAT`/`USG_PROXY_STREAM` solo fetchean el proveedor configurado o el servidor local bundled, nunca una URL arbitraria.
- **Modelos reasoning**: el veredicto llegaba vacío porque el razonamiento consumía los 260 tokens de las evaluaciones (medido: 203 de reasoning, 0 de content). Presupuestos: evaluaciones 2000, traducción 800, objetivos 1500/800; la generación escala 8192 → 16384 → 16384 con razonamiento desactivado. Errores del proveedor ya no se disfrazan de «no hay keys de Gemini».
- **Traducción con reasoning desactivado** (`enable_thinking`/`thinking`/`reasoning_effort`, con reintento sin esos campos ante 400): medido 6.4 s/línea con razonamiento frente a 1.8 s sin él — los subtítulos se desincronizaban.
- **Carrera de configuración**: el panel de Ajustes (`keepMounted`) guardaba el snapshot previo al primer `initAiProviderConfig` (default 8010) pisando el config persistido; ahora el global se sincroniza con `chrome.storage.onChanged` y el panel relee al abrirse. Se retiró el guardado previo a la validación de `ApiKeysPanel` (la validación ya corre en el SW; guardar antes marcaba «activo» un endpoint caído).
- **Endpoint real en la UI**: el pie y el tooltip del dock muestran el `baseUrl` configurado (antes 8010 fijo); el health check sondea primero el proveedor local configurado.
- **Contraste claro**: `text-amber-700`/`text-emerald-700` (DevTab) mapeados a los tokens AA.
- **QA**: matriz de timing real (lecciones de 2 y 15 min × flujo mínimo y completo) con caché limpiada y proxy real; el loop de Comprobar espera el veredicto asentado antes de pulsar; clicks con reintento en las suites.

## [1.5.4] — 2026-11-01

- Aviso único tras el primer export .apkg: activar «Importar cualquier configuración del mazo» (con acceso a la guía).
- QA/docs: veredicto FSRS medido, etiquetas sin la clave inerte del preset y nombres reales de los presets.

## [1.5.3] — 2026-11-01

- La guía de importación indica activar «Importar cualquier configuración del mazo» para recibir los presets (antes prometía que se configuraban solos).
- Docs: FSRS es un ajuste de toda la colección; ningún .apkg lo activa.

## [1.5.2] — 2026-11-01

- El foco vuelve a «Reiniciar» al cancelar la confirmación (Cancelar, Escape y el temporizador de 5 s comparten `closeResetConfirm`; si el foco seguía en el grupo, se restaura — quien navega con teclado no pierde su sitio).

## [1.5.1] — 2026-11-01

- Contraste AA en claro: paleta semántica con tokens (`--usb-ok/err/info/retry/accent-text`) en claro y oscuro; los textos de estado (ámbar, esmeralda, rosa/rojo, sky, fucsia, violet-200) usan el token de su familia en vez de tonos 600 que no llegaban a 4.5:1. Fondos y bordes intactos.
- El chip «Nivel N» de la tarjeta de cierre usa `--usb-fg-hi` (solo el icono conserva el acento).
- «Respuesta modelo» del paso Comprobar con tokens del tema (antes text-white/25 en oscuro).
- El indicador de subtítulos dice «Vista previa sin extensión · Se usará una sesión de ejemplo» fuera del runtime y la píldora «N líneas» solo aparece con subtítulos reales.
- Eliminada la barra en bucle de «Preparando tu sesión» (sin animaciones infinitas; el chip «Generando…» y el spinner del paso activo bastan).
- La confirmación de «Reiniciar» ocurre dentro del dock («¿Borrar respuestas? · Sí, reiniciar · Cancelar», se revierte sola a los 5 s, Escape cancela) en vez del diálogo nativo.

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