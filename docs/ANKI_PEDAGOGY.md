# Pedagogía Anki — Kinema (by Kivara)

## 0. Política de evidencia (REGLA PERMANENTE)

**Toda decisión pedagógica o de diseño de las tarjetas debe estar respaldada
por referencias verificadas en Scopus ANTES de implementarse**, usando la API
(key del propietario) con queries TITLE-ABS-KEY y resultados citables (DOI).
Las queries quedan documentadas en §5 y se amplían con cada feature nueva.
Decisiones sin referencia previa (p. ej. experimentos de color) se verifican
con Scopus ANTES de consolidarse — y se revierten si la evidencia no las
respalda.


Diseño basado en evidencia para las dos familias de mazos que genera la
extensión. Bibliografía consultada vía **Scopus API** (2026-09-28, API key del
usuario; queries en §5). Cada decisión de diseño apunta a al menos una
referencia.

---

## 1. Las dos familias de mazos NO son lo mismo

### 1.2 Vocabulario v2 — 1 palabra = 1 tarjeta completa (Fase 5.1)

`buildVocabModel(lang)` genera **una sola plantilla `Vocabulario`** (frente +
reverso): no hay segunda plantilla `Producir` ni selector «Tarjetas por
palabra». El hueco se crea por DOM sobre la oración, de forma segura (la
oración se inserta como texto, nunca como HTML ejecutable), y una palabra
produce **una tarjeta**, no dos.

- **Frente**: palabra objetivo + IPA *peek* + audio + oración con hueco cloze
  seguro por DOM (`span.cloze-gap`, la palabra se oculta con `[ ... ]`).
- **Reverso completo**: palabra, significado, traducción, colocación e imagen,
  además de la oración ya resuelta.
- **Colocación**: una combinación frecuente y natural con la palabra
  («memory leak») en el reverso. Evidencia: Boers et al., collocations en L2.
- **Audio con respaldo**: si el campo de archivo existe suena ese archivo;
  si no, la voz del sistema vía `{{tts}}` con el locale del idioma (en_US,
  fr_FR, de_DE, pt_BR, it_IT). Ya no hay selector: un solo comportamiento.
- **Note type por idioma**: «Kinema · Vocab · English», ID derivado del
  idioma (`kinema-vocab-v2|en`). Las notas viejas siguen en «Udemy Bridge
  Vocab» y funcionan; el registro impide reexportar esas palabras; si se
  vuelve a descargar un lote viejo, Anki lo omite por GUID (sin duplicados).
- Campos nuevos al FINAL (los 9 del pipeline de imágenes intactos):
  `nivel` (CEFR llega a la tarjeta), `colocacion`, `fuente`,
  `producir` — **conservado vacío solo por compatibilidad de esquema**; ya no
  genera una segunda tarjeta.

| | **Conceptos de lección** (`Courses`) | **Vocabulario de idiomas** (`Vocabulary`) |
|---|---|---|
| Objetivo | **Comprender, transferir y consolidar** lo visto en la lección | **Automatizar** el reconocimiento/recuerdo de unidades léxicas del idioma |
| Naturaleza cognitiva | Elaboración + práctica de recuperación con significado | Memoria asociativa (palabra↔significado) + contexto |
| Unidad | Una idea evaluable atómica (pregunta, código, caso, comparación) | Una palabra/frase (lema) con oración limpia |
| Repetición | Pocas por lección (3-8), alta calidad | Volumen diario moderado (15/día), alta frecuencia de contacto |
| Error típico a evitar | Tarjetas de sí/no, reconocimiento trivial, solapes | Palabras aisladas sin contexto, párrafos de subtítulo como oración |

### 1.1 Conceptos: por qué el diseño es "completo"

El note type **Udemy Bridge Concept** (dev-card: terminal bar, píldora de
lección, Prism) y el prompt de sesión generan **6 tipos de tarjeta**, cada uno
con un rol de aprendizaje:

| Tipo | Rol cognitivo | Evidencia |
|---|---|---|
| `concepto` | Recuperación activa con elaboración (el "por qué"/mecanismo, no el dato suelto) | La elaboración en la recuperación multiplica retención: Carpenter 2009 (DOI 10.1037/a0017021); esfuerzo de recuperación → mejor memoria: Pyc & Rawson 2009 (10.1016/j.jml.2009.01.004) |
| `codigo` | Predicción/producción con feedback inmediato (recuperación generativa, no relectura) | Practicar recuperación > releer: Adesope et al. 2017 meta-análisis (10.3102/0034654316689306); Dunlosky et al. 2013 (10.1177/1529100612453266) — utilidad "alta" |
| `comparacion` | Discriminación entre conceptos similares (interleaving dentro de la tarjeta) | Interleaving mejora discriminación y transferencia: Rohrer 2010 (10.1002/acp.1598); meta-análisis Brunmair & Richter 2019 (10.1037/bul0000209) |
| `proceso` | Encadenamiento de pasos (comprensión estructural, aplicable a labs) | Aprendizaje haciendo + explicando: Aleven & Koedinger 2002 (10.1016/S0364-0213(02)00061-7) |
| `entrevista` | Explicación oral estructurada (self-explanation elicitada) | Self-explanation: Chi et al. 1989 (10.1016/0364-0213(89)90002-5), 1994 (10.1016/0364-0213(94)90016-7); Dunlosky et al. 2013 la califica "moderada" y transversal |
| `aplicacion` | Transferencia a casos reales del dominio (cerca del "far transfer") | Spacing mejora formas diversas de aprendizaje, no solo memorización: Carpenter et al. 2012 (10.1007/s10648-012-9205-z) |

**Sí acepta código** (resaltado Prism: java, bash, sql, json, markup,
properties, light/dark) y **sí se diferencia por tipo y por objetivo**: el
prompt de sesión (`src/shared/prompts.ts::buildStudyPrompt`) recibe el
OBJETIVO del estudiante y lo usa para decidir enfoque, dificultad y mezcla de
tipos — p. ej. objetivo "entrevista senior Spring Boot" favorece
`entrevista`/`comparacion` con trade-offs; "hacking ético" o "Excel" adaptan
dominio, comandos y fórmulas (el prompt prohíbe asumir que el curso es de
programación y obliga a usar el lenguaje real del curso). La transcripción es
siempre la fuente de verdad.

**No cambió con esta ronda**: el prompt y el diseño de conceptos son los mismos
desde antes (verificado con `git diff` — cero líneas eliminadas). Lo que el
usuario vio "más simple" eran las tarjetas mínimas del fixture de QA; los
mazos demo (`scripts/qa-anki-samples.mjs`) muestran el diseño completo.

### 1.2 Vocabulario: por qué lema + oración limpia + campos

- **Lema en minúsculas** ("run", no "ran"): una sola tarjeta por unidad
  léxica; las inflexiones se reconocen desde el lema (Nation 2008,
  10.1177/1362168808089921 — instrucción de vocabulario por unidades).
- **Oración limpia creada para la tarjeta** (8-14 palabras), NO la línea del
  subtítulo: aprendizaje con contexto sin el ruido del corpus; crear/procesar
  la oración añade "carga de involucramiento" (involvement load): Kim 2008?
  ver 10.1177/1362168808089922 (task effectiveness & word learning).
- **Del contenido real del curso** (los subtítulos que el estudiante ya vio):
  el aprendizaje incidental de vocabulario por input audiovisual está
  documentado (10.1017/S0272263117000407, visionado de L2) y la **frecuencia
  de exposición** predice retención (10.1017/S0272263199004039) — por eso el
  extractor prioriza palabras repetidas de la lección.
- **Filtro CEFR configurable** (B1+ por defecto): aprender vocabulario ya
  conocido es costo sin ganancia; el nivel objetivo es el mayor predictor de
  utilidad (marco común de referencia; meta-análisis de actividades
  intencionales 10.1111/modl.12671).
- **Campo `picture`** (lo completa el pipeline de imágenes): codificación
  dual verbal+visual (Paivio; 10.1007/BF01320076; superioridad de imagen
  10.1016/0010-0285(73)90032-7; multimedia 10.1037/0022-0663.86.3.389).
- **Campos de audio** (`word audio`/`sentence audio`): forma fonológica
  imprescindible en L2 (memoria fonológica de trabajo predice aprendizaje L2:
  10.1017/S0272263112000125); flashcards con audio superior a solo texto
  (Nakata 2011, 10.1080/09588221.2010.520675).
- **Traducción fiel y significado bilingüe**: el aprendizaje intencional
  palabra-traducción es efectivo (meta-análisis 10.1111/modl.12671) y el
  bilingüe ayuda a desambiguar (formato `English Cards` del usuario).
- **Oración creada/procesada (no copiada)**: procesar la palabra con
  involucramiento (crear contexto propio) mejora la retención léxica
  (involvement load: 10.1177/1362168808089922).
- **Dedup por lema + GUID `idioma|lema`**: cada lema vive en UNA tarjeta;
  re-exposiciones las gestiona el scheduler, no tarjetas duplicadas. Cuatro capas:
  1. **Antes de generar**: las palabras que ya tienes (de cualquier lección o
     curso del mismo idioma) y aparecen en la lección se pasan al prompt como
     «ya están en su mazo»: las candidatas son todas nuevas.
  2. **En el panel**: si alguna llega igual, va al final como «Ya en tu mazo ·
     ‹curso›» y no se puede marcar; al exportar se vuelve a leer el registro.
  3. **En Anki**: mismo idioma + lema = mismo GUID, aunque venga de otro curso
     o de otro equipo sin registro. Todas las notas de Kinema llevan una fecha
     de modificación fija y antigua (`KINEMA_NOTE_MOD`): Anki solo actualiza al
     reimportar si la del paquete es más nueva, así que **reimportar solo añade
     lo que falta y nunca pisa la imagen, el audio ni lo que editaste en Anki**
     (antes llevaban «ahora» y lo sobrescribían). Las plantillas sí se
     actualizan, para que lleguen sus arreglos.
  4. **En el video**: las que ya tienes y salen en la lección no ocupan hueco
     en la lista, pero el chip las muestra como «En tu mazo» (volver a verlas
     en contexto es repaso: la frecuencia de exposición predice la retención,
     ver arriba). En pausa, el chip de Udemy permite «+ Mazo» con los mismos
     estados que el panel (antes solo lo tenía el prototipo: en la extensión
     real no se podía marcar desde el video aunque la app lo decía).
- **Un mazo por idioma** (fase 2): `Kinema::Vocabulary::English`. Una palabra
  pertenece al idioma, no al curso: vive una sola vez (GUID por idioma y lema)
  y el curso, la lección, el CEFR y la plataforma van en etiquetas. Una sola
  cola diaria coherente (límite del preset). Se puede elegir un mazo propio
  (p. ej. «English Cards»: el pipeline de imagen y audio selecciona por mazo y
  campo vacío). **Fase 5.1: por idioma** (`vocabDecks`, clave = el idioma del
  mazo, «English»): un mazo tuyo para inglés ya no se lleva el francés. Se
  se elige en un menú (Ajustes → Anki → `Vocabulario · ‹Idioma›`) con «El de
  Kinema» y tus mazos reales de Anki. `inspectVocabDecks` ofrece el mazo
  oficial de Kinema — **incluidos los mazos de Kinema renombrados**, detectados
  por el tipo de nota `Kinema · Vocab · ‹Idioma›` — y únicamente tus mazos
  compatibles con los 9 campos base (`VOCAB_FIELDS_BASE`). Se excluyen
  `Default`, `Basic` y los mazos de cursos de programación (no compatibles).
  Sin Anki conectado, el menú solo trae el de Kinema (y el que ya tuvieras
  elegido). El mazo único de versiones
  anteriores (`vocabDeck`) se sigue leyendo para los idiomas sin elección
  propia; elegir para un idioma (también «El de Kinema» = `""`) manda solo en
  ese idioma (`ownVocabDeck` / `withVocabDeck`). «Ordenar lo antiguo» no toca
  el vocabulario del idioma que va a un mazo tuyo.
- **Lo «de Kinema», en Anki, son dos cosas**: el **diseño** de la tarjeta (el
  tipo de nota, «Kinema · Vocab · ‹idioma›»: pronunciación, ejemplo de la
  lección y audio; o la tarjeta de conceptos) y el **ritmo** (las opciones
  del mazo: «Kinema · Cursos», 20 nuevas al día; «Kinema · Vocabulario», 15).
  El mazo es solo el contenedor. Un mazo tuyo recibe el mismo diseño y
  conserva su ritmo (el importador no cambia las opciones de un mazo que ya
  existe). Ajustes → Anki lo dice en una frase, bajo «Dónde quedan tus
  tarjetas».
- **Con Anki conectado, Anki manda**: las palabras que ya están en tu mazo de
  idioma (y en los mazos compatibles que marques en Ajustes → Idiomas → «Lo
  que ya sabes») no se vuelven a proponer. Fase 5.1: esos mazos salen de la
  lista real de Anki filtrada por `inspectVocabDecks` (tipo de nota / 9 campos
  base, sin `Default` ni mazos de curso), no de un campo libre. `ankiKnownWords`
  busca también **por tipo de nota del idioma activo**
  (`Kinema · Vocab · ‹Idioma›`), así que reconoce las palabras aunque el mazo
  haya sido renombrado en Anki. Sin Anki, el registro local de siempre.
- **Ajustes sin Study** (fase 5.1): antes de entrar (o de «Continuar sin
  cuenta») Study no existe, y era quien dibujaba Anki e Idiomas: esas
  secciones decían «Inicia sesión o continúa sin cuenta». Ahora Ajustes las
  muestra por su cuenta (`SettingsSheet`: `StudySlot`), con una sola copia de
  la misma configuración (`usb_vocab_config`) que Study lee al montarse.
- **Límites conocidos**: sin Anki conectado, el registro de palabras exportadas
  es local (por navegador); en otro equipo pueden volver a proponerse, pero
  Anki no las duplica. Una palabra con otro sentido en otro curso no crea otra
  tarjeta: se queda con el primero.
- **15 nuevas/día** (preset): carga sostenible; el scheduling óptimo lo hace
  FSRS (ver §2), no el volumen diario.

## 2. Configuración de estudio (presets) — racional

### Orden de las nuevas y la verdad sobre FSRS (2026-10-29)

- **Orden de entrada = orden de estudio.** `newGatherPriority: 1` (posición
  ascendente) en los dos presets: Anki recorre los mazos de lección en orden
  alfabético con el valor 0, y eso rompía el orden en que estudiaste.
- **FSRS.** La marca `fsrs: true` del preset NO es como Anki activa FSRS: en
  Anki es un ajuste global de la colección, no viaja en el .apkg. La guía de
  importación lo dice: Activa FSRS en Opciones del mazo. `desiredRetention: 0.9`
  se queda.

- **Práctica de recuperación + espaciado** son las dos técnicas con mayor
  utilidad demostrada (Dunlosky et al. 2013; Cepeda et al. 2006 meta-análisis
  10.1037/0033-2909.132.3.354). Anki ya las implementa; el preset solo debe
  **no estorbarlas**.
- **FSRS** (lo activa el usuario una vez, para toda la colección,
  Anki 23.10+): el planificador FSRS optimiza intervalos contra retención
  objetivo 0.9
  (algoritmo: *A Stochastic Shortest Path Algorithm for Optimizing Spaced
  Repetition Scheduling*, KDD, 10.1145/3534678.3539081).
- **Pasos [1m, 10m]**: recuperaciones tempranas el mismo día de la lección
  (espaciado incipiente; 10.1037/0278-7393.33.4.704 — recuperar expandido vs
  igualmente espaciado).
- **Lapso conserva 30% del intervalo** (no 0%): un fallo no borra el progreso;
  el esfuerzo extra de recuperación en fallos produce más aprendizaje
  (Pyc & Rawson 2009, retrieval effort).
- **Leech con tag a los 8 lapsos** (no suspende): la tarjeta problemática se
  hace visible para reformularla (las tarjetas memorísticas fallidas deben
  rediseñarse, no ocultarse).
- **Retención objetivo 0.9** (Cursos) / 0.9 (Vocabulario): ajustable por el
  usuario en el preset; 0.9 es un compromiso estándar costo/beneficio para
  material profesional.
- **20 nuevas/día (Cursos) / 15 (Vocabulario)**: consolidar la lección de hoy
  sin saturar; la cola de nuevas es el único parámetro que conviene mantener
  bajo control manual.

## 3. Convivencia con la colección

Note types con nombres propios (`Udemy Bridge …`) y presets «Kinema ·
Cursos/Vocabulario» con IDs estables derivados de los nombres originales;
árbol de mazos bajo una raíz configurable; GUIDs por contenido (reimportar no duplica ni pisa,
no duplica); csum SHA-1 estándar de Anki. Nada del usuario se toca (verificado
en importaciones reales).

### 3.1 Estructura de mazos (fase 2, fija desde la fase 5 — `ankiDestination.ts`)

Una sola fuente decide dónde va cada tarjeta y cómo se cuentan sus repasos:
el envío al terminar, Fijar, la espera, la Biblioteca, la nota de Obsidian
(`anki_deck`), el badge, «Tu progreso» y «Ordenar lo antiguo».

| | Siempre (fase 5: sin opciones) | Tuyo, si lo eliges |
|---|---|---|
| Conceptos | `Kinema::Courses::‹curso›` — un mazo por curso | un mazo tuyo para ese curso («Cambiar» en Fijar o en la Biblioteca) |
| Vocabulario | `Kinema::Vocabulary::‹idioma›` — cada palabra, una vez | uno tuyo de Anki, por idioma (Ajustes → Anki → Palabras: el menú con tus mazos) |

**Etiquetas: lo que se cruza** (todas bajo `kinema::`, el separador jerárquico de Anki):

| Etiqueta | Qué es | Relación |
|---|---|---|
| `kinema::curso::‹curso›` | el curso | 1 por tarjeta (y el mazo) |
| `kinema::leccion::‹lección›` | la lección | 1 por tarjeta |
| `kinema::programa::‹programa›` | cada programa que sigues y que incluye el curso | N:M |
| `kinema::plataforma::‹sitio›` | udemy, datacamp o el nombre del sitio | 1 por tarjeta |
| `kinema::tipo::…`, `kinema::tema::…`, `kinema::reforzar`, `kinema::origen::…` | lo de siempre | — |

- **Por qué el mazo es el curso y no el programa (ni la lección)**: en Anki
  un mazo es un contenedor (una tarjeta vive en UN mazo, con UN preset) y el
  manual recomienda pocos mazos y etiquetas para clasificar. Un curso puede
  estar en varios programas y un programa tiene varios cursos (N:M): un árbol
  de mazos solo podría representarlo eligiendo uno o duplicando tarjetas, y
  dos tarjetas de la misma idea reparten su memoria. FSRS programa cada
  tarjeta por separado: agrupar en más mazos no mejora el recuerdo. Un
  submazo por lección llenaba el árbol (un curso de 48 h son cientos) sin
  aportar nada. Por eso «Por programa» y «Por lección» desaparecen.
- **Repasar un programa entero**: un mazo filtrado de Anki con
  `tag:kinema::programa::‹programa›`. El etiquetado sigue intacto; lo que se
  retiró de la UI de Ajustes → Anki fue el bloque informativo de comandos
  `tag:kinema::…` (el etiquetado interno no cambia).
  «Cómo buscarlas en Anki», plegado porque Kinema las pone solo;
  `programCardsQuery` lee también la etiqueta antigua).
- **N:M al día**: al enviar una lección, sus tarjetas llevan la etiqueta de
  cada programa con el que estudiaste el curso (`courseProgramSlugs`: las de
  su historial más el activo) y, con Anki conectado, las tarjetas que ya
  tenías de ese curso reciben la que les falte (`missingProgramTagQuery` +
  `addTags`: solo se AÑADE una etiqueta a notas de conceptos del curso; ni
  campos, ni mazos, ni repasos, ni vocabulario).
- **Un curso, un mazo**: la primera vez que un curso llega a Anki su mazo
  queda en un registro local. Aunque cambie el programa activo o la
  configuración, el curso no se reparte entre mazos. Cambiarlo es explícito
  («Cambiar») y, con Anki conectado, mueve lo ya importado con su historial.
- **Sin migración forzosa**: un curso fijado con una estructura anterior
  (`Kinema::Programs::‹programa›::‹curso›`) sigue en su mazo; los submazos por
  lección cuelgan de `Kinema::Courses::‹curso›` (estudiar el mazo del curso
  ya los incluye). «Ordenar lo antiguo» (Ajustes → Anki) es opcional: primero
  cuenta y solo cambia al confirmar —
  `…::Courses::‹curso›::‹lección›` y `…::Programs::‹programa›::‹curso›` →
  `…::Courses::‹curso›`, `…::Vocabulary::‹idioma›::‹curso›` →
  `…::Vocabulary::‹idioma›` (`changeDeck` conserva los repasos; solo se borran
  mazos comprobados vacíos justo antes, también los `Programs` intermedios), el
  registro pasa al mazo nuevo, y las etiquetas antiguas `kinema::track::…` y
  `kinema/platform::…` se renombran (`addTags` + `removeTags`). Anki deja el
  nombre antiguo, ya sin notas, en la lista de etiquetas hasta «Comprobar base
  de datos» (comprobado con el motor real); Kinema no lo borra por su cuenta
  porque esa limpieza afecta a todas las etiquetas sin usar de la colección.
- **Mazos del estudiante**: si eliges un mazo que no cuelga de la raíz, el
  .apkg solo declara ese mazo (ni raíz ni ramas de Kinema) y Kinema no le crea
  submazos. El importador de Anki no cambia la configuración de un mazo que ya
  existe; si no existía, se crea con el preset de Kinema. **Pendiente de
  verificar en Anki real** con `scripts/qa-anki-import-verify.mjs`.
- **Repasos por etiqueta**: badge, progreso e historial cuentan por tipo de
  nota + `kinema::curso` / `kinema::leccion` (y la ruta antigua, para tarjetas
  de versiones sin etiquetas), así la cifra es la misma con cualquier
  estructura y con mazos propios.

### 3.2 Llega solo a Anki (fase 5: sin exportar)

Lo único que hay que configurar es la conexión (Ajustes → Anki → Conexión:
AnkiConnect, una vez). Al pulsar «Terminar lección», las tarjetas aceptadas y
las palabras marcadas **llegan solas** a Anki: Kinema importa **el mismo
.apkg** de siempre (`storeMediaFile` + `importPackage`, y borra el archivo de
medios después) — mismos GUID, note types, CSS y presets, y la misma regla de
no pisar lo importado (`addNotes` crearía GUID al azar y duplicaría). La
confirmación es un dato de Anki: notas de la lección antes y después.

- **Si Anki no responde**, la lección queda **esperando** (`syncPending.anki`
  en el historial; las palabras, en `usb_vocab_waiting`) y se envía sola en
  cuanto Anki vuelva a responder: Kinema lo comprueba al abrir el panel, cada
  minuto mientras algo espera y al pulsar «Comprobar». Nunca pide un permiso
  nuevo por su cuenta (el diálogo de AnkiConnect solo sale al pulsar
  «Conectar»).
- **Después de terminar**, una tarjeta añadida («Añadir igualmente», volver a
  incluir una nueva) se envía sola; quitar una no la borra de Anki (se dice).
- **Solo lo que «Terminar lección» dejó esperando** se envía por su cuenta.
  Las lecciones terminadas antes de la fase 5 y nunca enviadas se ofrecen en
  la Biblioteca («Aún no están en Anki» → «Enviar a Anki (N)») y en Fijar
  («Enviar a Anki»): un clic, no una sorpresa.
- **Respaldo sin AnkiConnect**: solo en la Biblioteca, discreto («¿Sin
  AnkiConnect? Descargar los .apkg»): el mismo paquete como archivo. En Fijar
  no hay ningún botón de exportar ni de descargar.
- **Pendiente de verificar en Anki real**: que `importPackage` (importador
  legacy) trae los presets sin la opción «Importar cualquier configuración».

### 3.3 Biblioteca (Historial ampliado, `library.ts`)

No es una pantalla nueva: el Historial de Study se llama ahora Biblioteca y
ordena lo mismo como Programa (opcional, DataCamp) → Curso → Lección. No toma
decisiones pedagógicas nuevas (no cambia tarjetas, mazos ni presets); muestra
lo que ya decide §3.1 y los estados que calcula Anki.

- **Un curso, una fila, un mazo**: los registros se agrupan por curso. Un
  curso estudiado en varios programas aparece una sola vez, bajo el programa
  con más lecciones; los demás se dicen como «también en …» (son etiquetas
  `kinema::programa::…`, no copias). El mazo es el de Fijar: el del registro si
  ya está fijado o, si no, `Kinema::Courses::‹curso›`. «Cambiar» en la
  Biblioteca es el mismo control y la misma función que en Fijar.
- **Progreso del curso, solo si se conoce el temario** (`courseTotals.ts`): al
  abrir una lección, el content script lee el total de la plataforma (una vez
  por curso y semana) y la Biblioteca da «2 de 475 lecciones» y su porcentaje
  («<1%», redondeado hacia abajo: 100 % solo si está terminado). Campos
  verificados contra las APIs reales (2026-11): Udemy
  `api-2.0/courses/{slug}?fields[course]=num_published_lectures`
  (`num_lectures` incluye las no publicadas) y, en DataCamp, el outline que ya
  se descarga: ejercicios `VideoExercise` (cada vídeo es una lección de
  Kinema; `nb_exercises` no cuadra con la lista). Sin temario, o si no cuadra
  (más lecciones estudiadas que el total), **no hay porcentaje**: la fila dice
  «3 terminadas de 5 empezadas» y el anillo muestra «3/5» con la pista
  discontinua. Un porcentaje sobre lo empezado parecía del curso entero.
- **Dos fuentes de cifras, sin mezclarlas**: las del historial (tarjetas
  aceptadas, refuerzo, dudas, exportadas) siempre están. Las de Anki (total,
  nuevas, para hoy, aprendiendo, reaprendiendo) solo aparecen si Anki
  responde. Sin Anki se dice que las cifras son del historial, nunca «0
  pendientes». Si una búsqueda no se pudo hacer, se muestra «Anki no
  respondió» y no una cifra.
- **Mismas búsquedas que los repasos pendientes** (`kinemaCardsQuery`, por
  tipo de nota + `kinema::curso`/`kinema::leccion`, más la ruta antigua),
  **solo conceptos**: `kinemaCardsQuery` excluye en lección y curso los tipos
  de nota de vocabulario (`Kinema · Vocab · *`, `Udemy Bridge Vocab`), que
  también llevan `kinema::curso` y se colaban por las cláusulas de mazo si
  compartían mazo con el curso. Vale para la Biblioteca, el badge, los repasos
  pendientes y «Cambiar» (que ya no movería vocabulario).
- **Estados de Anki, verificados con su motor** (paquete `anki` 26.9.4, el
  mismo código que usa AnkiConnect en `findCards`;
  `scripts/qa-anki-real-search.mjs`, estados creados respondiendo con el
  planificador): `is:new`, `is:learn` e `is:review` van por el **tipo** de
  tarjeta e **incluyen suspendidas y enterradas**; `is:due` las excluye.
  Aprendiendo = `is:learn -is:review` (tipo aprendizaje, intradía y entre
  días); reaprendiendo = `is:learn is:review` (tipo reaprendizaje: olvidadas
  en un repaso). El desglose (nuevas, aprendiendo, reaprendiendo) cuenta solo
  las **activas** (`-is:suspended -is:buried`), como la pantalla de mazos de
  Anki; el total las incluye y las suspendidas se dicen aparte.
- **Etiquetas sin colisiones**: `kinemaSlug` conserva «+» (`plus`) y el «#»
  pegado a una letra (`sharp`). Antes «C++», «C#» y «C» daban la misma
  etiqueta y la misma clave de registro: se mezclaban sus repasos y «Cambiar»
  podía mover tarjetas de un curso a otro (lo destapó la verificación con el
  motor real). Lo ya exportado se sigue encontrando por el mazo del curso, y
  el registro de mazos lee la clave antigua si no hay una nueva. Queda una
  arista conocida: las tarjetas de «C++» o «C#» exportadas antes del cambio
  llevan la etiqueta antigua (`c-…`), así que también cuentan en un curso «C»
  si lo tienes.
- **Solo lectura**: la Biblioteca solo hace `findCards` (hasta 120 búsquedas
  por consulta y 40 lecciones por curso) y `guiBrowse` («Abrir en Anki»,
  «Repasar hoy», «Ver en Anki»). Lo único que modifica es «Cambiar» el mazo, y
  solo al confirmarlo. (El otro cambio en tarjetas ya importadas, «Repasar hoy
  en Anki» de §3.4, vive en Fijar y también es solo al pulsarlo.)
- **Obsidian** (fase 3, `docs/obsidian-integration.md`): la carpeta del curso
  con el mismo control que Fijar (registro único, `obsidianDestination`),
  cuántas lecciones tienen nota y, con Obsidian conectado (plugin Local REST
  API), lo que hay DE VERDAD en el vault: notas que ya no están, índice del
  curso creado o no, y «Guardar las N notas que faltan» (rehechas desde el
  historial). Sin conexión, abrir la nota o el índice con `obsidian://open`.

### 3.4 Ideas que ya están en tu mazo (fase 4, `deckConcepts.ts`)

El GUID de una tarjeta de conceptos es `curso|lección|[study:|duda:]frente`:
la misma idea estudiada en otra lección del curso (un repaso, una introducción
que adelanta temas), la misma lección estudiada otra vez o un curso del mismo
programa entraba en Anki como otra nota. Dos tarjetas de la misma idea reparten su memoria en dos
calendarios y la duplican en la cola. Es el mismo principio que el
vocabulario (§1.2, «cada lema vive en UNA tarjeta; las re-exposiciones las
gestiona el planificador»), aplicado a conceptos. **No introduce un efecto
nuevo**: se apoya en referencias ya verificadas — espaciado (Cepeda et al.
2006), FSRS programa por tarjeta (Ye & Li 2022) y recuperar en la sesión lo
que no salió (Karpicke & Blunt 2011; Metcalfe 2017 en STUDY_FLOW R4/R6).

- **Identidad, sin similitud léxica.** Con las 26 tarjetas reales del repo
  (CHANGELOG 1.9.5/1.9.6) ningún par llega al 40 % de Jaccard y los pares
  legítimos están entre el 10 y el 23 %: un umbral léxico no sirve. Cuenta
  como «ya en tu mazo», por este orden:
  1. el **mismo frente** (`frontKey`) que una tarjeta del mazo — o que la
     pregunta de UNA idea, que sería el frente de su tarjeta de cobertura;
  2. el **mismo título de idea** («Título — detalle», la pista que la nombra;
     al menos 8 caracteres normalizados: «Usos» no identifica nada);
  3. la **IA**, que recibe la lista del mazo con ids (`m1…m40`) y devuelve
     `inDeck: [{ idea, ref }]`; solo se aceptan ids de la lista enviada, cada
     id una vez. Un id inventado no cuenta.
- **Alcance: más cautela cuanto más lejos.**

  | La tarjeta que ya tienes es de… | mismo frente | mismo título | IA |
  |---|---|---|---|
  | esta lección (una sesión anterior) | sí | sí | sí |
  | otra lección de este curso | sí | sí | sí |
  | otro curso del programa activo (DataCamp, `kinema::programa` —o `kinema::track` en notas antiguas— o un curso del programa) | sí | sí | sí |
  | otro curso tuyo sin relación | no | no | sí |

  Entre cursos sin relación una pregunta corta o un título («¿Qué es un
  hook?») puede ser otra cosa en otro dominio: ahí solo decide la IA, que ve de
  qué curso es cada tarjeta («— curso «Intro to SQL»») y tiene instrucciones de
  contarla solo si la respuesta vale en el mismo sentido. A igualdad, gana la
  más cercana (esta lección, luego el curso, luego el programa) y la más
  reciente. `conceptTerms`, el código de los frentes, `kinema::tema` y las
  etiquetas de la IA **solo** deciden qué tarjetas se le enseñan a la IA
  cuando no caben todas (primero esta lección, luego el curso y su programa y
  las que comparten un nombre canónico con la transcripción, luego las
  recientes; de otros cursos, solo las que comparten algún nombre canónico);
  nunca si dos tarjetas son la misma.
- **La misma lección estudiada otra vez también cuenta.** El mismo frente puede
  llevar otro GUID (una tarjeta de cobertura lleva `study:`, una de duda
  `duda:`), así que volver a exportarla podía duplicarla; si es la misma nota,
  dejarla fuera no cambia nada en Anki. Fijar lo dice: «de una sesión anterior
  de esta lección». **No es duplicado** una tarjeta que además cubre una idea
  nueva (p. ej. la de síntesis): se queda.
- **Fuente**: con Anki conectado, el mazo real (`findNotes` + `notesInfo`, solo
  lectura, hasta 1500 notas por búsqueda, las más recientes primero): las del
  curso (la misma búsqueda que los repasos y la Biblioteca,
  `kinemaCardsQuery('course')`) y las demás notas de conceptos de Kinema
  (`otherCoursesConceptsQuery`: `note:"Udemy Bridge Concept"
  -tag:kinema::curso::<este curso>`; con el motor real de Anki no confunde un
  curso cuyo nombre empieza igual). Las dos lecturas van por separado y con
  8 s de margen: si la de los demás cursos falla, la del curso sigue valiendo;
  si la del curso falla, se usa el historial. El historial aporta títulos de
  idea, `conceptTerms` y el nombre de cada curso. Sin Anki (o si no responde),
  lo exportado según el historial de este navegador (las aceptadas y, si
  consta, solo las que llevó la última exportación). Fijar dice cuál.
- **Se decide al generar y se guarda** (`studyContent.deckMatches`): al
  restaurar no se recalcula (tras exportar, las tarjetas de la propia lección
  ya estarían en el mazo y todo parecería repetido).
- **En la sesión se trabajan igual** (Recordar y Comprobar, sin cambios). En
  Fijar cuentan como cubiertas («Cubren las 4 ideas clave… 2 de ellas, con las
  tarjetas que ya tenías en tu mazo»), su tarjeta de hoy queda fuera del
  paquete (`inDeck`) y el bloque «2 ideas ya estaban en tu mazo» dice cuál es
  la que ya tienes, de qué lección y, si es de otro curso, de cuál. **«Añadir igualmente»** la incluye (es una
  decisión del estudiante: entra como tarjeta nueva, con su refuerzo si no
  salió). Ninguna tarjeta nueva de refuerzo se crea para una idea que ya está.
  Si no queda ninguna tarjeta, a Anki no llega un paquete vacío (ni cuenta
  como enviado): Fijar dice que lo de hoy ya estaba en tu mazo —o, si se
  quitaron a mano, que no hay tarjetas para Anki—. Las cifras de pendientes
  (Biblioteca, aviso de la barra y «Aún no están en Anki») cuentan solo las
  tarjetas aceptadas, con la misma regla (`library.isPendingExport`); enviar
  (o, sin AnkiConnect, descargar) desde la Biblioteca lleva el enlace y la
  plataforma de ESA lección, no los de la página abierta.
- **«Repasar hoy en Anki» (lo único que toca tarjetas que ya están en Anki)**:
  - solo con Anki conectado y solo para ideas que ya están en el mazo y **hoy
    no salieron** («No del todo» —o sin responder— en Recordar, o falladas en
    Comprobar);
  - **nunca automático**: solo al pulsarlo; el botón dice cuántas cambian
    («Repasar hoy en Anki (2)») y el aviso confirma cuáles;
  - `setDueDate` con `"0"` **sin «!»**. Verificado con el motor de Anki 26.9.4
    (`scripts/qa-deck-real-anki.mjs`, estados puestos respondiendo con el
    planificador, con FSRS y sin él): la tarjeta sigue en repaso y conserva su
    historial; **sin FSRS conserva el intervalo** tal cual; **con FSRS conserva
    su memoria** (estabilidad y dificultad) y el intervalo pasa a los días
    reales desde el último repaso (1 si fue ayer; ni 0 ni el programado). El próximo
    intervalo sale de la respuesta real del repaso adelantado. Con «!» el
    intervalo se reiniciaría: por eso no se usa;
  - solo tarjetas de conceptos de Kinema **en repaso y activas** que aún no
    tocan hoy: `nid:<nota> note:"Udemy Bridge Concept" is:review -is:learn
    -is:suspended -is:buried -is:due` (se comprueba justo antes de cambiar).
    Sobre `is:review -is:suspended -is:buried` se añaden `-is:learn` (las de
    reaprendizaje son `is:review` e `is:learn` a la vez: ya vuelven en minutos
    u horas) y `-is:due` (las que ya tocan hoy no ganan nada);
  - las **nuevas** («aún no tiene calendario que adelantar»), las que están en
    **aprendizaje** («vuelve en minutos u horas»), las **suspendidas o
    enterradas** («Kinema no la reactiva»), las que **ya tocan hoy** y las que no
    son notas de conceptos de Kinema (p. ej. una tuya en el mazo del curso) no
    se tocan, y cada fila dice por qué;
  - **sin etiquetas de refuerzo** en notas existentes: no cambiarían nada
    (`kinema::reforzar` solo ordena las nuevas al importar).
  El estado se lee antes (`findCards`, solo lectura) y queda en el historial
  (`rescheduledAt`) y en la nota de Obsidian («adelantada a hoy en Anki»).
- **Biblioteca**: «N ideas ya estaban en tu mazo al estudiarlas» por curso, «N
  ya en tu mazo» por lección y, en su detalle, cuáles y de qué lección. Sigue
  siendo de solo lectura.
- **Límites conocidos**: entre cursos sin relación solo cuenta lo que la IA
  reconoce, y solo se le enseñan las tarjetas que comparten un nombre canónico
  con la lección (si no lo reconoce, se crea su tarjeta, como antes: el error
  posible es una tarjeta de más, no una idea sin tarjeta); el programa solo
  existe en DataCamp con un programa activo (Udemy no tiene programas); sin
  Anki, el historial es de este navegador y guarda la última sesión de cada
  lección; la IA solo ve hasta 40 tarjetas del mazo (con un curso enorme, una
  idea repetida de una lección antigua y sin términos en común puede
  escaparse: entonces se crea su tarjeta, como antes). Las búsquedas de estado y `setDueDate "0"` están
  verificadas con el motor real (`scripts/qa-deck-real-anki.mjs`); la
  interfaz, con un AnkiConnect simulado que usa las mismas operaciones del
  service worker (`scripts/qa-deck-flow.mjs`). **Pendiente en Anki de
  escritorio**: la misma prueba a mano con AnkiConnect (ver INSTRUCCIONES).

## 4. Bibliografía (Scopus)

### 4.1 Referencias de las decisiones de 2026-10-29 (verificadas por DOI)

Consultadas vía Scopus API (queries en §5, bloque «Fase 1 — decisiones nuevas»).
Salida completa: `tmp/scopus-refs.json`.

- **Receptivo vs productivo** (Reconocer + Producir): «THREE DIMENSIONS of
  VOCABULARY DEVELOPMENT», Studies in Second Language Acquisition, 1999,
  DOI 10.1017/S0272263199002089 (362 citas). Henriksen: las dimensiones
  receptiva y productiva son parciales y separadas — dominar una no implica
  la otra, de ahí las dos tarjetas.
- **Colocaciones en L2** (campo colocacion): «Formulaic sequences in second
  language teaching: Principle and practice», Applied Linguistics, 2000,
  DOI 10.1093/applin/21.4.463 (383 citas); y «Collocations in Corpus-Based
  Language Learning Research…», Language Learning, 2017,
  DOI 10.1111/lang.12225 (392 citas).
- **Aprendizaje generativo** (summary con palabras propias en Obsidian):
  Fiorella & Mayer, «Eight Ways to Promote Generative Learning»,
  Educational Psychology Review, 2016, DOI 10.1007/s10648-015-9348-9
  (751 citas). Resumir es una de las ocho estrategias generativas.
- **Recuperación > relectura** (respuestas plegadas en Obsidian): Karpicke
  & Blunt, «Retrieval practice produces more learning than elaborative
  studying with concept mapping», Science, 2011, DOI 10.1126/science.1199327
  (855 citas).
- **Información mínima / carga cognitiva** (comparación por una dimensión,
  proceso ≤4 pasos): Sweller, «Cognitive load theory, learning difficulty,
  and instructional design», Learning and Instruction, 1994,
  DOI 10.1016/0959-4752(94)90003-5 (2987 citas); y «Element interactivity
  and intrinsic, extraneous, and germane cognitive load»,
  Educational Psychology Review, 2010, DOI 10.1007/s10648-010-9128-5
  (1678 citas).

Consultada 2026-09-28 vía Scopus API (queries §5), ordenada por citas:

1. **Dunlosky, Rawson, Marsh, Nathan & Willingham (2013)** — "Improving
   students' learning with effective learning techniques" — *Psychological
   Science in the Public Interest*. DOI: [10.1177/1529100612453266](https://doi.org/10.1177/1529100612453266)
   — La revisión canónica: práctica de recuperación y práctica distribuida
   = utilidad "alta"; base de TODO el diseño.
2. **Cepeda, Pashler, Vul, Wixted & Rohrer (2006)** — "Distributed practice in
   verbal recall tasks: A review and quantitative synthesis" — *Psychological
   Bulletin*. DOI: [10.1037/0033-2909.132.3.354](https://doi.org/10.1037/0033-2909.132.3.354)
   — Meta-análisis del espaciado.
3. **Paivio (2008)** — *Mental Representations: A Dual Coding Approach*. DOI:
   [10.1093/acprof:oso/9780195066661.001.0001](https://doi.org/10.1093/acprof:oso/9780195066661.001.0001)
   — Codificación dual → justifica el campo `picture` en vocabulario.
4. **Chi, Bassok, Lewis, Reimann & Glaser (1989)** — "Self-explanations: How
   students study and use examples in learning to solve problems" — *Cognitive
   Science*. DOI: [10.1016/0364-0213(89)90002-5](https://doi.org/10.1016/0364-0213(89)90002-5)
   — Justifica las tarjetas `entrevista` (explicar en voz alta).
5. **Nation, I.S.P. (2008)** — "Instructed second language vocabulary
   learning" — *Language Teaching Research*. DOI:
   [10.1177/1362168808089921](https://doi.org/10.1177/1362168808089921)
   — Principios de enseñanza de vocabulario L2 (unidades, repetición,
   atención al significado).
6. **Clark & Paivio (1991)** — "Dual coding theory and education" —
   *Educational Psychology Review*. DOI:
   [10.1007/BF01320076](https://doi.org/10.1007/BF01320076)
7. **Rohrer (2010)** — "The effects of interleaved practice" — *Applied
   Cognitive Psychology*. DOI: [10.1002/acp.1598](https://doi.org/10.1002/acp.1598)
   — Justifica tarjetas `comparacion` y mezcla de tipos.
8. **Brunmair & Richter (2019)** — "Similarity Matters: A Meta-Analysis of
   Interleaved Learning and Its Moderators" — *Psychological Bulletin*. DOI:
   [10.1037/bul0000209](https://doi.org/10.1037/bul0000209)
9. **Carpenter (2009)** — "Cue Strength as a Moderator of the Testing Effect:
   The Benefits of Elaborative Retrieval" — *JEP:LMC*. DOI:
   [10.1037/a0017021](https://doi.org/10.1037/a0017021)
   — Respuestas elaboradas ("por qué", mecanismo) > respuestas mínimas.
10. **Pyc & Rawson (2009)** — "Testing the retrieval effort hypothesis…" —
    *Journal of Memory and Language*. DOI:
    [10.1016/j.jml.2009.01.004](https://doi.org/10.1016/j.jml.2009.01.004)
    — Justifica dificultades deseables (lapso 30%, no regalar la respuesta).
11. **Adesope, Trevisan & Sundararajan (2017)** — "Rethinking the Use of
    Tests: A Meta-Analysis of Practice Testing" — *Review of Educational
    Research*. DOI: [10.3102/0034654316689306](https://doi.org/10.3102/0034654316689306)
12. **Carpenter, Cepeda, Rohrer, Kang & Pashler (2012)** — "Using Spacing to
    Enhance Diverse Forms of Learning" — *Educational Psychology Review*.
    DOI: [10.1007/s10648-012-9205-z](https://doi.org/10.1007/s10648-012-9205-z)
    — El espaciado sirve para aprendizaje con transferencia, no solo memoria.
13. **Ye & Li (2022)** — "A Stochastic Shortest Path Algorithm for Optimizing
    Spaced Repetition Scheduling" — *KDD*. DOI:
    [10.1145/3534678.3539081](https://doi.org/10.1145/3534678.3539081)
    — **El paper del algoritmo FSRS** que Anki usa (el usuario lo activa en
    Opciones del mazo).
14. **Nakata (2011)** — "Computer-assisted second language vocabulary
    learning in a paired-associate paradigm: A critical investigation of
    flashcard software" — *Computer Assisted Language Learning*. DOI:
    [10.1080/09588221.2010.520675](https://doi.org/10.1080/09588221.2010.520675)
    — Diseño de flashcards L2: espaciado creciente, audio, contexto.
15. **Schmitt (2008)** / revisión de vocabulario instruido — *Language
    Teaching Research* (ver 5) y **Webb & Nation** línea incidental:
    - "Incidental vocabulary acquisition through viewing L2 television" —
      *SSLLT*. DOI: [10.1017/S0272263117000407](https://doi.org/10.1017/S0272263117000407)
      — Aprender vocabulario del contenido audiovisual real (nuestra premisa).
    - "The effect of exposure frequency on … incidental vocabulary acquisition
      and retention through reading" — *SSLLT*. DOI:
      [10.1017/S0272263199004039](https://doi.org/10.1017/S0272263199004039)
      — Frecuencia de exposición → prioriza palabras repetidas de la lección.
16. **Hulstijn & Laufer (2001-línea)** — involvement load: "Task effectiveness
    and word learning in a second language: The involvement load hypothesis on
    trial" — *Language Teaching Research*. DOI:
    [10.1177/1362168808089922](https://doi.org/10.1177/1362168808089922)
    — Procesar/crear la oración mejora la retención léxica.
17. — "The roles of phonological short-term memory and working memory in L2
    grammar and vocabulary learning" — *Studies in Second Language
    Acquisition*. DOI: [10.1017/S0272263112000125](https://doi.org/10.1017/S0272263112000125)
    — Justifica el audio obligatorio en vocabulario.
18. **Mayer, Bove & otros (1994/1996)** — "For Whom Is a Picture Worth a
    Thousand Words?" — *Journal of Educational Psychology*. DOI:
    [10.1037/0022-0663.86.3.389](https://doi.org/10.1037/0022-0663.86.3.389)
    — Palabra + imagen > palabra sola (multimedia learning).
19. **Paivio & Csapo (1973)** — "Picture superiority in free recall" —
    *Cognitive Psychology*. DOI:
    [10.1016/0010-0285(73)90032-7](https://doi.org/10.1016/0010-0285(73)90032-7)
20. **McDaniel, Anderson, Derbish & Morrisette (2011)** — "Test-Enhanced
    Learning in the Classroom" — *JEP: Applied*. DOI:
    [10.1037/a0026252](https://doi.org/10.1037/a0026252)
    — Quizzing en aula real → mejoras de largo plazo (ecología de cursos).

> Nota: algunas obras canónicas (Bjork & Bjork "desirable difficulties",
> Roediger & Karpicke 2006) no salieron en el top por citas de estas queries
> concretas; sus hallazgos están representados por 8, 10 y 12. La lista usa
> EXCLUSIVAMENTE resultados reales de Scopus con DOI verificable.

## 6. Color por tipo de tarjeta (señalización)

La píldora de tipo de cada tarjeta de concepto usa un color por tipo
(concepto=violeta, código=verde, entrevista=azul, comparación=ámbar,
proceso=rosa, aplicación=verde azulado; variantes claro/oscuro con contraste
AA medido). Base de investigación (Scopus, 2026-09-29):

- **Principio de señalización**: las señales visuales que destacan la
  ESTRUCTURA del material mejoran el aprendizaje — dos meta-análisis lo
  confirman (Richter, Scheiter & Eitel 2016, 10.1016/j.edurev.2015.12.003;
  Xie et al. 2020, 10.1007/s11423-020-09748-7).
- **Color-codificación con significado**: el eye-tracking de Ozcelik et al.
  (2009, 10.1016/j.compedu.2009.03.002) muestra que el color reduce la
  búsqueda visual y mejora el aprendizaje CUANDO codifica información
  relevante (aquí: qué tipo de práctica toca — oral, predecir código,
  comparar), no cuando es decorativo.
- **Condiciones aplicadas**: color consistente por tipo (mismo color siempre),
  aplicación sutil (solo la píldora; el resto de la tarjeta idéntica — evitar
  sobrecarga), y el texto del tipo sigue legible (la señal es redundante con
  la etiqueta textual, doble canal).
- **Reversal por expertise**: la señal ayuda más a quien está aprendiendo;
  no perjudica al avanzado (10.1007/s11251-019-09492-3).

Conclusión: píldora coloreada por tipo = señalización significativa y
consistente, dentro de lo que la literatura respalda; el resto de la tarjeta
permanece idéntico para no fragmentar la atención.

## 5. Queries Scopus usadas (2026-09-28)

`TITLE-ABS-KEY` con `sort=citedby-count`, count=6, sobre:
`"retrieval practice" AND "testing effect"` · `"distributed practice" AND
spacing` · `"spaced repetition" AND scheduling AND memory` · `"interleaved
practice"` · `flashcard* AND vocabulary AND "second language"` · `"dual
coding" AND picture*` · `"desirable difficulties"` · `"elaborative
interrogation" OR "self-explanation" OR "practice testing"` · `"incidental
vocabulary" AND reading AND acquisition` · `vocabulary AND "sentence" AND L2
AND learning`.

## 7. Features pedagógicas del ecosistema

**Tarjetas de duda (Study §5, `docs/STUDY_FLOW_PEDAGOGY.md`)**: una duda
resuelta en la sesión puede guardarse como tarjeta `concepto` (diseño y
evidencia de §1.1), de refuerzo y con origen `kinema::origen::duda`; máx. 2
por lección (3 si tiene 6 o más ideas) y sin frentes repetidos. La duda se pregunta en Study tras
intentar (R10–R12 de STUDY_FLOW, verificadas por DOI en Crossref; pendiente
confirmarlas en Scopus según §0).

**Badge de repasos (AnkiConnect)**: el dock consulta cuántas tarjetas de la
lección actual tienen repaso pendiente hoy (por etiqueta: ver §3.1). No introduce un efecto nuevo:
operacionaliza el espaciado ya evidenciado (Cepeda et al. 2006; Dunlosky et
al. 2013 — §1) reduciendo la fricción de adherencia al calendario.

**Glosario resaltado durante el video**: las palabras exportadas de la
lección aparecen como chip (palabra + IPA + definición monolingüe en pausa)
bajo el subtítulo cuando su cue está activa. Base (Scopus 2026-09-29):
- Meta-análisis de glosas hipertexto en L2: efecto positivo en adquisición
  de vocabulario — 10.1080/09588221.2010.523285.
- Glosas L1 en subtítulos de videojuegos: 10.1080/10494820.2020.1863233.
- Técnicas de enhancement durante video: 10.1080/09588221.2017.1375960.
- Anotaciones multimedia e incidencia incidental: 10.1007/s11251-007-9016-7.
La re-exposición incidental en el momento temporal correcto (la cue donde la
palabra aparece) combina la señal espacial con el contexto original.
