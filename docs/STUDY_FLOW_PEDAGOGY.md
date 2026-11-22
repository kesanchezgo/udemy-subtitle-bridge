# Pedagogía del flujo de Study — decisiones y referencias

Cada decisión del rediseño del flujo de Study (flowVersion 2) está enlazada a una
referencia verificada por DOI. La verificación bibliográfica se hizo con
Crossref (2026-10-31, metadatos + citas) y la salida Scopus de
`scripts/scopus-refs.mjs` queda en `tmp/scopus-refs.json` al re-correrla.
Lo que no tiene respaldo directo está marcado como «preferencia de diseño».

## Referencias

| # | Referencia | DOI | Citas (Crossref 2026-10-31) |
|---|---|---|---|
| R1 | Hattie & Timperley 2007, «The Power of Feedback», *Review of Educational Research* 77(1) | 10.3102/003465430298487 | 9.873 |
| R2 | Shute 2008, «Focus on Formative Feedback», *Review of Educational Research* 78(1) | 10.3102/0034654307313795 | 3.396 |
| R3 | Deci, Koestner & Ryan 1999, «A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation», *Psychological Bulletin* 125(6) | 10.1037/0033-2909.125.6.627 | 4.667 |
| R4 | Metcalfe 2017, «Learning from Errors», *Annual Review of Psychology* 68 | 10.1146/annurev-psych-010416-044022 | 416 |
| R5 | Dunlosky & Rawson 2012, «Overconfidence produces underachievement», *Learning and Instruction* 22(4) | 10.1016/j.learninstruc.2011.08.003 | 524 |
| R6 | Karpicke & Blunt 2011, «Retrieval Practice Produces More Learning than Elaborative Studying with Concept Mapping», *Science* 331 | 10.1126/science.1199327 | 788 |
| R7 | Kalyuga 2007, «Expertise Reversal Effect and Its Implications for Learner-Tailored Instruction», *Educational Psychology Review* 19(4) | 10.1007/s10648-007-9054-3 | 878 |
| R8 | Sailer, Hense, Mayr & Mandl 2017, «How gamification motivates», *Computers in Human Behavior* 69 | 10.1016/j.chb.2016.12.033 | 1.655 |
| R9 | Butler & Winne 1995, «Feedback and Self-Regulated Learning: A Theoretical Synthesis», *Review of Educational Research* 65(3) | 10.3102/00346543065003245 | 2.056 |
| R10 | Carpenter, Wilford, Kornell & Mullaney 2013, «Appearances can be deceiving: instructor fluency increases perceptions of learning without increasing actual learning», *Psychonomic Bulletin & Review* 20(6) | 10.3758/s13423-013-0442-z | 96 (Crossref 2026-11-04) |
| R11 | Aleven, Stahl, Schworm, Fischer & Wallace 2003, «Help Seeking and Help Design in Interactive Learning Environments», *Review of Educational Research* 73(3) | 10.3102/00346543073003277 | 417 (Crossref 2026-11-04) |
| R12 | Szpunar, Khan & Schacter 2013, «Interpolated memory tests reduce mind wandering and improve learning of online lectures», *PNAS* 110(16) | 10.1073/pnas.1221764110 | 318 (Crossref 2026-11-04) |

R6 además ya figura en `docs/ANKI_PEDAGOGY.md` (verificado por DOI el 2026-10-29).

## Decisiones → referencia

### §1 Flujo de 4 pasos con carga mínima
- **Recordar es recuperar, idea por idea** (paso 1, flowVersion 3): cada idea
  clave llega como «Título — detalle». Bajo el encabezado «¿Puedes explicarlo
  sin mirar?», las pistas numeradas son preguntas concretas
  (`formatRecallPrompt` añade `¿…?` a los interrogativos que llegan sin signos,
  con el límite Unicode correcto para tildes). Se ve solo la pregunta (la
  pista) y dos botones del mismo peso, **«Lo recuerdo» / «Repasarlo»**; el
  detalle aparece al responder, así cada respuesta es un intento de recuerdo
  con corrección inmediata → **R6** (Karpicke & Blunt 2011) y **R4**. Una
  frase de instrucción: «Intenta responder cada pregunta sin mirar antes de
  elegir.»
  Las ideas sin responder cuentan como «Repasarlo». El recuerdo libre sigue
  (R6) pero es **opcional y plegado** («Escribir primero lo que recuerdo»):
  casi nadie lo usaba y bloqueaba la vista de las ideas. Sesiones antiguas
  (ideas sin título): la idea entera es la pista y no hay nada que ocultar.
- **El mínimo bloqueante es 1 toque de nivel + 1 respuesta** y la exportación
  deja de ser requisito para terminar: la carga extra sin valor pedagógico
  compite con la motivación → **R3** (recompensas exigidas minan la motivación
  intrínseca; el requisito de exportar es una exigencia externa sin función de
  aprendizaje). El piso de 3 min es **preferencia de diseño**.

### §1.2 Comprobación adaptativa
- **El tamaño de Comprobar sale de la lección y de tus marcas, no de un
  número fijo** (`services/checkPlan.ts`). La IA elige cuántas ideas clave
  tiene la lección dentro de un rango por densidad (`keyConceptRange`:
  2–3 corta · 3–4 breve · 4–5 normal · 5–7 densa) y escribe **una pregunta
  por idea + una de síntesis**. Comprobar pregunta: (1) una en el nivel que
  elegiste, sobre una idea que no tenías clara si la hay; (2) una por cada
  idea que no tenías clara y aún no salió; (3) confirmaciones de lo que
  dijiste saber (ver abajo). Resultado: si lo sabías todo, 1 pregunta; en
  una lección corta, como mucho 2; en una media, 3; en una densa, hasta 5.
  Recuperar lo que no salió es la práctica que más rinde → **R6**; confirmar
  lo que dijiste saber contrasta el autoinforme, que tiende a la
  sobreconfianza → **R5**.
- **La primera pregunta sale de tus respuestas FINALES de Recordar**: se
  elige al entrar en Comprobar (botón, «Siguiente» o la barra de pasos),
  no al tocar el nivel (antes se elegía cuando aún no había ninguna marca).
  El botón dice el tamaño real del plan: «Ponerme a prueba · 3 preguntas».
  Tras revisar la primera respuesta, Recordar queda registrado (cambiarlo
  desharía el plan en curso).
- **Confirmaciones con presupuesto, calibrado con tu historial**
  (`recallCue.ts`): 1 por defecto; +1 si la primera no salió a la primera
  (lo que dijiste saber no se sostuvo: se confirma OTRA idea que marcaste);
  0 si tus 3 últimas confirmaciones en otras lecciones salieron bien —pero
  nunca dos sesiones seguidas sin confirmar—. El resultado (`spotCheck`:
  ok / fail / skip) se guarda en el historial y en la nota. Sin bucles: la
  confianza solo se apoya en evidencia reciente → **R5**, **R9**.
- **Tope de fatiga de 5** (≈10 min de respuestas abiertas): solo actúa en
  lecciones densas con casi nada sabido. Si deja ideas sin preguntar, la
  primera pregunta lo dice y solo promete lo que es verdad: «…sus tarjetas
  irán primero en Anki» si esas ideas tienen tarjeta (siempre, salvo datos
  antiguos), si no «quedan anotadas en tu nota de la lección». El valor 5 es
  **preferencia de diseño**; la cobertura por ideas viene de R6.
- **Cada pregunta dice por qué se hace** («Sobre otra idea que no tenías
  clara», «Confirma una idea que dijiste saber», «La anterior no salió:
  confirmamos otra idea que dijiste saber»), se ve el tamaño («Pregunta 1
  de N») y siempre está «Terminar aquí».
- **Cada siguiente pregunta es sobre otra idea**, no la misma reformulada;
  primero la que cubre más ideas pendientes y, a igualdad, de dificultad más
  baja si fallaste y más alta si acertaste: el apoyo se ajusta a la pericia
  demostrada → **R7** (Kalyuga 2007).
- **Reintento tras el feedback**: el error seguido de corrección y reintentos
  es una oportunidad de aprendizaje, no un castigo → **R4** (Metcalfe 2017,
  errorful learning / hypercorrection).
- **Tras cada revisión, un solo bloque «¿Cómo sigues?»**, igual en Comprobar
  y Aplicar. Si acertaste y queda plan: «Siguiente pregunta (2 de N) · Sobre
  otra idea que no tenías clara». Si no acertaste: «Intentarlo de nuevo» (no
  borra lo escrito; al editarlo pasa a «Revisar de nuevo») y la alternativa
  («Siguiente pregunta · Lo que falló aquí va a Anki como refuerzo»,
  «Terminar y ver la respuesta esperada» o, en Aplicar, «Ver la solución ·
  Después ya no podrás revisar otro intento»). En la misma caja, «Tengo una
  duda» y «Terminar aquí». Acertar la última cierra el paso; fallar nunca lo
  cierra sin que el estudiante decida → **R4**.
- **Aplicar es una sola práctica** (resolver el ejercicio o explicarlo), con
  intentos ilimitados y sin bloquear: una segunda tarea en la misma sesión
  cansa más de lo que fija → **preferencia de diseño**. El prompt pide que
  el mismo caso integre 2-3 ideas y que no repita preguntas de Comprobar ni
  pida definiciones. Límite conocido: la práctica se genera con la lección,
  antes de Recordar, así que no apunta a TUS ideas no claras (ver P4).
- **Ejercicio estructurado para cualquier curso** (flowVersion 3,
  `practiceFormats.ts`): la IA elige UN formato según lo que enseña la
  lección —**Completar** (1-3 huecos en un código, fórmula, frase o
  procedimiento), **Ordenar** (pasos o líneas), **¿Qué pasa si…?** (predecir
  la salida o el resultado), **Encuentra el error** (la línea o el paso
  malo, con su corrección) o **Decidir** (el mejor enfoque para un caso)—.
  Código de 12 líneas como máximo y nunca «escribe la clase desde cero»: la
  carga extrínseca de producir un programa entero no es lo que se practica →
  **preferencia de diseño** coherente con **R7**. Se corrige al momento
  contra una clave (sin IA): respuestas equivalentes aceptadas (en texto sin
  mayúsculas, acentos ni espacios; en código, exacto salvo espacios y «;»
  final), se marca QUÉ hueco o paso falla sin chivar la respuesta, y el
  acierto trae su explicación breve → **R1**, **R4**. «Ver pista» (opciones
  o primeras letras; descarta una opción; acota el error a 3 líneas) resta
  bonus; «Ver la solución» cierra el intento. «Explicarlo» sigue siempre
  disponible y la IA solo revisa texto libre. Si el bloque estructurado
  falta o no se puede corregir sin la IA, Aplicar usa el ejercicio clásico
  (texto libre + revisión): las sesiones antiguas no cambian.
- **La respuesta esperada se ve al cerrar la pregunta** (en el repaso), no
  entre intentos; en Aplicar, «Ver la solución» cierra los intentos. Así
  «corregiste N» y «Práctica: correcta» no se inflan copiando → **R5**.
- **«Un reto más»** solo tras acertar y solo si hay una pregunta de nivel más
  alto; se puede dejar y cuenta en el resumen → **R7**.

### §1.3 Contrato de datos entre fases (auditoría)
Cada dato que se pide o se muestra tiene un consumidor. Si no lo tiene, sobra.

| Fase | Produce | Lo consume |
|---|---|---|
| Objetivo | objetivo, curso, lección | prompt (ángulo), revisión de IA, nota de Obsidian, práctica oral |
| Generación | ideas clave (2–7), una pregunta por idea + síntesis, práctica, tarjetas con `conceptRefs` | todas las fases; `conceptCoverage` detecta ideas sin pregunta o sin tarjeta |
| Recordar | nivel; «Lo recuerdo» / «Repasarlo» por idea (`recallMarks`: `"knew"` / `"unsure"`; «Lo recuerdo» = `checkedConceptIndexes`); pistas como preguntas (`formatRecallPrompt`); recuerdo libre opcional | nivel → pregunta de arranque, revisión de código, calibración · marcas → 1.ª pregunta y plan de Comprobar (y el nº del botón), refuerzo en Anki, resumen, historial, Obsidian («No me salieron sin mirar») · recuerdo → historial, Obsidian |
| Comprobar | respuestas, valoración, acierto a la primera, reto, confirmación de lo sabido (`spotCheck`) | fallos → sus tarjetas primero en Anki · aciertos → calibración, resumen, título · confirmación → presupuesto de confirmaciones de las próximas lecciones, nota · todo → historial |
| Aplicar | ejercicio estructurado (formato, respuesta, intentos, pista, solución vista) o clásico/explicación y su valoración | correcta → resumen, «Lección dominada», XP · sin acierto o con la solución vista → sus tarjetas de aplicación/código/entrevista van primero en Anki · todo → historial (restaura el tablero) y nota («Aplicación práctica» + cómo salió) · saltarla no refuerza nada |
| Fijar | mazo: una tarjeta real por idea como mínimo + refuerzo + dudas; mazo del curso a la vista | fase 5: al terminar llegan solas a Anki (el mismo .apkg, por AnkiConnect) o esperan a que responda; Obsidian (`anki_deck`), historial (`ankiDeck`, la espera y la Biblioteca van al mismo mazo); la caja dice cuántas ideas cubren (dato real) y de dónde sale el refuerzo |
| Idiomas (opcional) | palabras del idioma objetivo, hasta tu máximo por lección (3–20, 8 por defecto; menos si la lección es corta), desde el nivel CEFR mínimo, solo palabras que aparecen en la lección | tú eliges cuáles → llegan a Anki al terminar (su mazo de idioma); plantilla única `Vocabulario` (1 palabra = 1 tarjeta completa con hueco cloze seguro por DOM) |
| Obsidian (opcional) | nota de la lección con el mismo contenido y resultado que Study | conectado (Local REST API), al terminar: la nota, el índice del curso, el MOC del programa y (si se pide) la transcripción, de una vez; si no responde, espera |

Desconexiones encontradas y corregidas en esta auditoría:
- Comprobar no usaba las marcas de Recordar (solo desempataba la primera
  pregunta) y tenía un tope fijo de 3: ahora el plan sale de las marcas y del
  número de ideas de la lección.
- La IA generaba siempre 4 preguntas, una por nivel, sin garantizar que cada
  idea tuviera pregunta (un ejemplo del prompt dejaba una idea sin pregunta
  ni tarjeta): ahora una pregunta por idea + síntesis, una tarjeta por idea, y
  los ejemplos del prompt se verifican en el QA.
- Aplicar prometía «Lo que faltó va a Anki como refuerzo» sin que la práctica
  tocara el mazo: ahora sí, y el aviso solo aparece si hay tarjetas que reforzar.
- La explicación oral bien valorada contaba como «hecha», no como «correcta».
- La revisión de código en streaming no recibía el nivel declarado (sí lo
  recibía la de respaldo): el «siguiente nivel» de la revisión dependía de la vía.
- Una tarjeta de la lección cambiaba de GUID al pasar a ser de refuerzo:
  cambiar una marca o hacer la práctica tras exportar la duplicaba en Anki.
  Ahora el prefijo `study:` es solo para las tarjetas nuevas de refuerzo.
  Efecto único: al reexportar una lección exportada antes de este cambio,
  las tarjetas de IA que entonces eran de refuerzo pueden entrar una vez más.
- **El normalizador tiraba los `conceptRefs` de las tarjetas** (al generar y
  al restaurar): la IA decía qué idea cubría cada tarjeta, pero el refuerzo de
  lo no marcado/fallado y la cobertura de Fijar nunca lo veían; solo
  funcionaban las 2 tarjetas extra creadas desde preguntas. Al recargar
  aparecía además una tarjeta «nueva desde tu última exportación».
- La plantilla local (sin IA) no tenía `conceptRefs` en sus tarjetas y
  siempre planteaba la práctica oral «como en una entrevista».
- El historial contaba todas las preguntas generadas («5 preguntas») en vez
  de las respondidas.
- La etiqueta de Bloom («aplicar», «recordar») se confundía con los pasos;
  ahora dice qué pide la pregunta (definir, explicar, usar en un caso…). El
  nivel elegido en Recordar dice lo que de verdad hace: fija la primera pregunta.
- «Terminar aquí» solo aparecía tras revisar una respuesta; ahora también
  antes de responder, de la 2.ª pregunta en adelante.
- Textos de «video» en lecciones que también pueden ser artículos.
- El normalizador descartaba las preguntas de la IA si eran menos de 4
  (las cambiaba por las de la plantilla, desalineadas con las ideas) y no
  quitaba tarjetas con el mismo frente.

Desconexiones encontradas y corregidas en la fase 1 (flowVersion 3):
- **La primera pregunta de Comprobar ignoraba tus marcas**: se elegía al
  tocar el nivel, antes de marcar nada, y no se recalculaba. Ahora se elige
  al entrar en Comprobar con las marcas finales.
- **La cobertura de Anki dependía de un tope de 2 tarjetas nuevas**: con 5-7
  ideas y el tope de 5 preguntas, una idea débil podía quedar sin tarjeta
  aunque la pantalla dijera «va a Anki». Ahora cada idea tiene al menos una
  tarjeta real desde la normalización (`cardCoverage.ts`) y el refuerzo
  solo marca y ordena (§3).
- **Fusionar tarjetas duplicadas perdía sus `conceptRefs`**: la segunda se
  descartaba con las ideas que cubría. Ahora la que queda las hereda.
- **Restaurar recortaba tarjetas de la lección**: un solo tope de 8 contaba
  también las de refuerzo. Ahora 8 de la IA y, aparte, las de Kinema.
- **Dos guardados seguidos de la misma lección se pisaban** (leer → fusionar
  → escribir sin orden: p. ej. «entrar en Comprobar» y «cambiar de paso»).
  `historyService` encola las escrituras por lección.
- **Las ideas en una sola frase no permitían recuperar**: se leían y se
  marcaban. Ahora «Título — detalle» (el prompt lo pide y los ejemplos del
  prompt se verifican en el QA).

### §1.3b Idiomas y Obsidian (auditoría)
- **Cuántas palabras**: un solo número, «Máximo por lección» (3–20; antes «Por lección»): la IA propone
  hasta ese máximo y, si la lección es corta, menos
  (`vocabularyCandidateTarget`: 6 · 10 · 15 · 20 según el volumen, sin
  relleno); el nivel CEFR mínimo filtra (y escribe la definición monolingüe
  para ese nivel). Antes eran dos números (6–20 propuestas y un máximo 3–20
  para exportar) que se contradecían en Ajustes.
- **1 palabra = 1 tarjeta completa** (fase 5.1): la plantilla única
  `Vocabulario` (`buildVocabModel(lang)`) muestra la oración con un hueco
  cloze seguro por DOM en el frente (palabra + IPA *peek* + audio) y el
  reverso completo con palabra, significado, traducción, colocación e imagen.
  Ya no hay selector «Tarjetas por palabra 1 | 2» ni segunda tarjeta de
  producción; el campo `producir` queda vacío solo por compatibilidad de
  esquema (ver ANKI_PEDAGOGY §1.2).
- **Lo que ya sabes** (fase 5.1): los mazos tuyos de Anki cuyas palabras no
  se proponen se añaden de la lista real de Anki (menú «Añadir otro mazo
  tuyo», no un campo libre), se quitan con ×, y Anki dice cuántas palabras
  cubren; el mazo de las palabras cuenta siempre.
- **Solo palabras de la lección**: la IA da el lema y los subtítulos la forma
  flexionada; la coincidencia exacta tiraba palabras reales («leaks»,
  «figured it out»). Una sola regla (`shared/vocabMatch.ts`) para el filtro,
  el chip del video y el panel: lema + flexiones regulares + la forma exacta
  vista (irregulares), nunca subcadenas.
- **Obsidian**: Chrome abre un solo protocolo externo por clic. Exportar
  abría índice + nota juntos y, en el primer export de cada curso, la nota
  se perdía; la estructura del vault (7 URIs en serie) creaba solo la
  primera. Ahora: la nota en el clic; índice y subtítulos como acciones del
  aviso; la estructura, en .zip. «Guardar automáticamente» pasa a «Terminar
  lección» (antes exportaba al generar, sin resultados y con un cierre
  obsoleto). La nota usa los nombres del flujo y su «Puntos a reforzar» es
  lo mismo que Anki refuerza.
- **Exportar otra vez no pisa**: si la lección ya tiene nota (en ese vault y
  carpeta), se AÑADE un «Repaso · fecha» al final (`append=true` de
  `obsidian://new`): el vault crece una nota por lección y la nota, un repaso
  por sesión; lo que escribiste no se toca. «Reemplazar» queda como opción.
- **¿Es `obsidian://` lo mejor?** Para cero configuración, sí: no exige
  plugins ni servidores. Límites: un clic por nota y Chrome pregunta «¿Abrir
  Obsidian?» la primera vez. **Fase 3 — Obsidian conectado (opcional)**: con el
  plugin Local REST API, una exportación escribe nota, índice del curso, MOC
  del programa y transcripción de una vez, sin diálogos, sabiendo qué existe
  en el vault; el MOC del programa solo actualiza su bloque entre marcas. Si
  Obsidian está cerrado, se vuelve a `obsidian://` con la MISMA nota (los dos
  caminos usan `planLessonWrites`). Se descartó File System Access API: pide
  elegir la carpeta en cada sesión del navegador y no actualiza los enlaces al
  mover notas (el renombrado del plugin sí).
- **Fase 5 — conectado, sin exportar**: exportar era un paso más que no
  aporta nada al aprendizaje (es mantenimiento, no recuperación) y que se
  olvidaba: lecciones estudiadas cuyas tarjetas nunca llegaban a Anki, sin
  repaso espaciado. Ahora se configura la conexión una vez (Anki: AnkiConnect;
  Obsidian: Local REST API) y «Terminar lección» lo envía todo: tarjetas y
  palabras a Anki, nota a Obsidian. Lo que no responde ESPERA (historial) y se
  envía solo al volver; nada se pierde. En Fijar no hay botones de exportar:
  una línea por destino dice qué pasará o qué pasó (`SyncStatus`). La
  estructura también es fija (un mazo y una carpeta por curso; el programa,
  N:M, en etiquetas, propiedades y un MOC): menos decisiones que no cambian la
  memoria. `obsidian://` queda solo como respaldo en la Biblioteca.
- **Idiomas sin duplicados**: ver `docs/ANKI_PEDAGOGY.md` §1.2 (cuatro capas:
  prompt, panel, GUID con fecha de modificación fija y chip del video). La
  misma fecha fija protege las tarjetas de la lección: reimportar solo añade.

### §1.4 Cierre
- **Resumen con datos reales** (recordadas, aciertos, práctica, tarjetas):
  hacer visible el automonitoreo del progreso apoya la autorregulación →
  **R9** (Butler & Winne 1995). Un bloque por paso con el nombre y color de la
  barra de pasos (Recordar · Comprobar · Aplicar), la calibración en una frase
  corta (solo si dice algo) y el «Próximo paso» destacado. Los minutos solo se
  muestran si son de esta sesión.
- **Al terminar, «Ir a la siguiente lección» justo debajo de «Lección
  terminada»**, como botón secundario (lo primero es que las tarjetas
  lleguen a Anki, arriba) y sin saltos de scroll: pulsa el «Siguiente» de Udemy (o el
  siguiente elemento del temario) y Study abre la lección nueva con el estado
  limpio. Si no encuentra el control de Udemy, lo dice. Si cambias de video
  con una sesión abierta, Study la oculta (no escribe en la lección
  equivocada) y ofrece «Estudiar esta lección». **Preferencia de diseño.**
- **Sin «bonus · llévalo al mundo real»** (quickWin): era una tarea genérica,
  sin verificación y repetida con el «Próximo paso»; se quitó de Study, de la
  nota de Obsidian y del prompt. La transferencia se trabaja en Aplicar, que sí
  se revisa → coherente con **R1** (feedback sobre la tarea) y la regla de no
  llenar Study de añadidos.

### §1.8 Tipos de lección de Udemy
- **Video** (subtítulos), **texto** (artículo: el texto del artículo es la
  lección; sin Q&A ni descripción del curso) y **otros** (cuestionario,
  ejercicio de código, práctica): para «otros» Study lo dice («Es un
  cuestionario o ejercicio: complétalo en Udemy») en vez de pedir subtítulos
  que no existen. Si no hay subtítulos, «Volver a comprobar» repite la
  detección. Los selectores de artículo y de «Siguiente» de Udemy están
  probados con DOM sintético, no en una sesión real: **pendiente de verificar
  en Udemy**.
- **Título según resultado, nunca «dominada» por defecto**: la elación no
  merecida sobreestima el estado real → **R5** (Dunlosky & Rawson 2012).

### §1.5 Pantalla de objetivo
- **Indicador real de transcripción y repaso pendiente visible**: el repaso
  espaciado es el componente de mayor impacto a largo plazo del flujo; mostrar
  el pendiente es automonitoreo → **R9**. El diseño de la fila discreta es
  **preferencia de diseño**.

### §1.6 Calibración honesta
- **Nivel demostrado = dificultad más alta respondida correcta a la primera**;
  mensajes de calibración con las 3 direcciones (precisa / sobre / bajo): el
  exceso de confianza produce bajo logro y menos retención → **R5**
  (Dunlosky & Rawson 2012).
- **Sin respuestas evaluadas no hay calibración**: con la Comprobación saltada
  no se dice «tu autoevaluación fue precisa» (no hay evidencia). Si nada salió
  a la primera, se dice tal cual, sin inventar un nivel «mostrado». El mensaje
  nombra el nivel elegido («Elegiste «Entendido»…») en lenguaje llano → **R5**.
- **«Lo recuerdo» = «lo recordé sin mirar»**, con su consecuencia real: lo que
  no recuerdas decide las preguntas de Comprobar y sus tarjetas van primero en
  Anki (`reinforcePlan`); lo que recuerdas se confirma con una pregunta. Ver el
  detalle tras responder permite corregirse («Repasarlo») sin castigo. No
  se premia marcarlo todo (sin XP por marcar) → automonitoreo honesto
  (**R9**, **R5**).

### §1.7 Avanzar y saltar: una sola regla
- **«Siguiente» se activa con lo mínimo del paso** y hace lo mismo que el
  botón de avance del paso: el nivel (Recordar, «Ponerme a prueba»), una
  respuesta o saltar (Comprobar, «Continuar a Aplicar»), un intento o saltar
  (Aplicar, «Continuar a Fijar»). Saltar es legítimo — la autonomía no se
  coacciona (**R3**) — pero es explícito y el resumen lo muestra tal cual
  («saltada», «pendiente») para no inflar el automonitoreo (**R9**, **R5**).
- **Un solo «Saltar este paso»** con el mismo texto, estilo y lugar en los
  pasos que lo admiten; nada de «de todas formas» ni controles sin efecto. Lo
  opcional dentro de un paso (reto extra, práctica oral, bonus) no lleva salto:
  se abre o no. Explicarlo en voz alta cuenta como práctica hecha.
- **Lo que el paso pide, a la vista**: al elegir el nivel, el selector se
  pliega y las ideas quedan en pantalla, con el recuerdo libre opcional
  encima (R6: recuperar es la actividad central de Recordar); el feedback de
  la última pregunta queda abierto en el repaso. La jerarquía visual es
  **preferencia de diseño**.
- **Saltar no es definitivo**: el aviso «Comprobación saltada» trae
  «Deshacer», el paso saltado muestra «Responder ahora» y el resumen de Fijar
  lleva «Responder» / «Hacerla» en cada fila pendiente. Respetar la autonomía
  (**R3**) incluye poder corregir un toque por error.
- **Aplicar ofrece dos formas de practicar, a la vista y antes del salto**:
  el ejercicio (estructurado: «Completar · Se corrige al momento», o el
  clásico) o explicarlo con tus palabras.
  Cualquiera cuenta como práctica hecha (también tras haberla saltado). Ya no
  hay una práctica oral plegada al fondo que se salta sin verla.
- **Fijar: los destinos al mismo nivel**, sin plegar: tarjetas de la lección
  primero (regla de jerarquía), luego el mazo de idiomas (marcado «opcional»)
  y Obsidian. El resumen va por filas «qué · resultado» y el próximo paso
  depende del estado real (exportado o no), no de un texto genérico.

### §2 Gamificación
- **Eliminar XP por autodeclaración (`concept_ack`) y combos
  (`question_combo`)**; el XP premia el esfuerzo de aprendizaje (respuesta,
  mejora tras feedback, práctica, cierre, exportación): las recompensas
  extrínsecas tangibles por tareas interesantes reducen la motivación
  intrínseca; si se usan, deben premiar el desempeño y el progreso de
  información, no la conformidad → **R3** y **R8** (Sailer et al. 2017:
  los elementos que comunican progreso significativo motivan; las medallas
  por clic, no).
- **Una sola celebración grande por lección** con datos reales dentro, sin
  overlays en cola por respuesta → **R8**.
- **Confeti solo en cierre y subida de nivel, como mucho una vez por lección**
  → **preferencia de diseño** coherente con R3/R8.
- **«Nivel» significa una sola cosa: tu nivel de XP.** Lo que eliges en
  Recordar es «qué tan claro te quedó» (Confuso · Más o menos · Entendido ·
  Lo domino), con esas mismas palabras en Recordar, el resumen, la nota y el
  historial (antes: «Tu nivel», «el nivel que elegiste» y «Dominio 1–4»). La
  dificultad de las preguntas se dice «más difícil», no «nivel más alto».
- **Racha = días con actividad de estudio**, la misma regla que el
  calendario de «Constancia»: responder (aunque falles), practicar, terminar
  o exportar. Antes solo contaba al terminar o exportar, y «Responde una
  pregunta hoy y empieza tu racha» no era cierto. Se celebra una vez al día,
  al cerrar o exportar (sin overlays por respuesta, R8). Un día de descanso
  por semana no la rompe; «mejor racha» es la de siempre.
- **Cada cifra de «Tu progreso» se mueve y aparece una vez**: «Primer paso»
  se desbloquea al responder (no solo al acertar); «Corregidas tras revisar»
  sustituye a «Puntos reforzados», que nada incrementaba; la fila de cifras
  ya no repite las lecciones del bloque «Aprendizaje». Explicarlo en Aplicar
  da el mismo XP que resolver el caso (una práctica premiada por lección).
- **XP del ejercicio estructurado, igual para cualquier curso**: intentarlo
  (`practice_attempted`, una vez por lección); acertar (`practice_correct`)
  solo en los 2 primeros intentos y sin haber visto la solución —con 3
  opciones, probarlas todas no es saberlo—; bonus 20 a la primera sin pista,
  10 a la primera con pista, 0 después (antes el bonus de 20 solo existía
  para el código) → **R3**, **R8**.
- **Recargar no cambia el resultado ni regala XP**: el historial guarda si
  el primer intento fue correcto; al reabrir, lo ya revisado no vuelve a
  puntuar ni pasa de «a la primera» a «corregida».
- **Un solo sitio para los avisos**: abajo y centrados dentro del panel, en
  una sola pila (sonner). Ahí van los avisos de acción (exportar, guardar,
  deshacer…) y también las celebraciones (cierre, nivel, logros, racha), que
  antes tenían su propia capa arriba del panel. Antes los avisos tenían
  `position: fixed` y salían centrados en toda la pantalla —encima del vídeo
  y de los subtítulos— o dentro del panel según el estado del dock. Lo
  persistente (un estado, un error de un campo) se queda en su sitio, no es
  un aviso; el resultado pasajero de una acción (historial, caché) ya no usa
  franjas propias: es un aviso más.
- **Historial y progreso dicen lo mismo que Anki**: los repasos pendientes
  salen de AnkiConnect (por etiqueta, con cualquier estructura de mazos:
  `docs/ANKI_PEDAGOGY.md` §3.1) en «Tu progreso» y en
  el historial; sin AnkiConnect se dice, no se inventa (antes el canal del
  background se cerraba antes de responder y siempre salía «—», y «Abrir
  Anki» usaba `anki://`, que Anki de escritorio no registra, y celebraba un
  logro igual). El historial no habla de «5 pasos» (son 4) y separa
  «terminadas» de «en curso».

### §3 Tarjetas de refuerzo
- **Cada idea clave tiene al menos una tarjeta real** (`cardCoverage.ts`,
  al generar y al restaurar): si la IA deja una idea sin tarjeta, se crea
  desde la pregunta que la evalúa (frente = pregunta, dorso = su respuesta
  modelo; la de una sola idea antes que la de síntesis); si no hay pregunta
  y la idea trae «Título — detalle», desde la propia idea; si no hay nada
  fiable (datos antiguos), no se inventa y Fijar dice «Cubren N de M».
  Determinista: mismos IDs (`study-cobertura-*`) y el mismo GUID `study:`
  que las antiguas tarjetas de refuerzo de esa pregunta, así que reexportar
  una sesión antigua no duplica.
- **El refuerzo no añade volumen: marca y prioriza**: las tarjetas de lo
  que no sabías, lo fallado y la práctica que no salió van primero en la
  cola (`kinema::reforzar`): el error corregido es material de repaso
  valioso → **R4** (Metcalfe 2017). Crear una tarjeta nueva queda solo como
  red de seguridad para una idea sin ninguna (sin tope fijo: como mucho una
  por idea y desde una pregunta real). Antes eran «máx. 2 nuevas», lo que
  dejaba ideas fuera en lecciones largas.
- **Lo que ya está en el mazo no se duplica** (fase 4, `deckConcepts.ts`;
  detalle en `docs/ANKI_PEDAGOGY.md` §3.4): una idea de la lección que ya tiene
  tarjeta en el mazo (mismo frente o mismo título de idea en esta lección, su
  curso o su programa; o la IA con un id de la lista que se le envió, la única
  que puede decidirlo con tarjetas de otros cursos) **se practica igual** en
  Recordar y Comprobar — recuperarla hoy sigue siendo la práctica que más rinde
  (**R6**) — pero no crea otra tarjeta: cuenta como cubierta, su tarjeta de hoy
  queda fuera del paquete y Fijar lo dice («2 ideas ya estaban en tu mazo», con
  la tarjeta que ya tienes y su lección) y deja **añadirla igualmente**. Si hoy
  no salió y Anki está conectado, «Repasar hoy en Anki» pone para hoy la que ya
  tienes — solo al pulsarlo y solo si está en repaso (lo corregido vuelve
  pronto al repaso espaciado → **R4**); si es nueva o está en aprendizaje, se
  dice por qué no se toca. Sin XP ni celebración por esto (§2). Recordar y
  Comprobar no cambian: el aviso no aparece antes de responder, para no
  inclinar el «Lo recuerdo» (**R5**) → **preferencia de diseño**.
- **Después de importar, Anki manda**: reimportar solo añade lo que falta y
  no pisa notas ya importadas (`KINEMA_NOTE_MOD`). Si una tarjeta pasa a ser
  de refuerzo después de importarla, en Anki conserva sus etiquetas; las
  nuevas (de refuerzo o de duda) entran con las suyas. Se elige no pisar lo
  que el estudiante editó en Anki antes que mantener al día una etiqueta.


### §4 Revisión de Kinema
- **Veredicto discreto + BIEN / FALTÓ / PARA RECORDAR**, sin porcentajes ni
  preguntas nuevas dentro del feedback: el feedback efectivo es concreto,
  apunta a la tarea y al proceso, y no introduce demandas nuevas → **R1**
  (Hattie & Timperley 2007) y **R2** (Shute 2008: sin calificaciones
  numéricas, con rúbrica y guía específica).
- **Se muestra por secciones legibles** («Lo que está bien», «Lo que faltó»,
  «Para recordar»; en la práctica «Qué mejorar» y «Para ir más allá»), sin
  las etiquetas crudas del modelo. Quien revisa es **Kinema**: «la IA» solo
  se nombra como proveedor que se configura en Ajustes. Si la revisión falla,
  la respuesta se conserva y se reintenta con el mismo botón.
- La revisión de ejemplo del prototipo se marca «Demo» y depende de la
  respuesta (misma respuesta, mismo veredicto); en la extensión no existe:
  sin proveedor de IA se muestra el error.

### §5 Dudas sobre la lección
Uso real: la lección se estudia **una vez**, justo después del video, y a lo
aprendido se vuelve con Anki, no reabriendo Study. Por eso la duda se
resuelve en la misma sesión y lo que perdura es su tarjeta (no hay chat ni
historial de dudas).
- **La duda aparece al intentar, no al mirar**: un video fluido da la
  sensación de entender sin que se entienda más (**R10**); las lagunas reales
  salen al recuperar lo visto (**R6**, **R12**). Por eso no hay «marcar dudas
  durante el video» (se descartó: invisible si es solo un atajo, y una frase
  de subtítulos no es un concepto): la duda se pregunta en Study.
- **Ayuda contextual y después del intento** (**R11**: la ayuda a demanda
  funciona cuando está en el punto de necesidad y tras intentarlo; ofrecida
  antes se abusa de ella o se evita): en Recordar, «Duda» en cada idea
  clave tras responderla (cuando ya viste su detalle); en Comprobar y Aplicar, «Tengo una duda» tras el
  feedback, anclada a esa pregunta o desafío (el error seguido de corrección
  es oportunidad de aprendizaje → **R4**). Nunca en el camino mínimo (§1), ni
  en la práctica oral, ni con la lección terminada.
- **Respuesta acotada a la lección**: solo la transcripción; las citas se
  verifican literalmente contra ella; si no la cubre, «Fuera de la lección»
  sin citas ni tarjeta; sin preguntas al estudiante ni calificaciones (mismo
  criterio que §4 → **R1**, **R2**). Sin minutos inventados
  (`TIMED_TRANSCRIPT = false`). La verificación literal es **preferencia de
  diseño** (trazabilidad). Sin IA: fragmentos de la lección marcados como
  «Local», sin tarjeta.
- **Hilo corto: 1 pregunta + 2 repreguntas** → **preferencia de diseño** para
  mantener la carga baja (§1).
- **La duda resuelta puede volverse tarjeta** (opcional, máx. 2 por lección
  —3 si tiene 6 o más ideas, `doubtCardLimit`—, primeras en la cola,
  `kinema::reforzar` + `kinema::origen::duda`): como en §3, lo corregido pasa
  al repaso espaciado → **R4**. El tope (2/3) y la
  unicidad del frente (mismo frente = mismo GUID: una nota pisaría a la otra)
  son **preferencia de diseño**. En Fijar, antes de terminar, se ofrecen por
  última vez las respuestas con tarjeta sin guardar; «Quitar» en la vista
  previa la saca del mazo y libera su hueco.
- **Sin XP ni celebración por preguntar** → §2 (**R3**, **R8**).
- **Solo con la sesión abierta y de la clase que se está viendo**: la
  respuesta se apoya en la transcripción del video abierto y se guarda en SU
  lección → **preferencia de diseño**.
- **Obsidian**: «Dudas resueltas» plegadas, con el mismo patrón que «Puntos a
  reforzar».

R10–R12 verificadas por DOI en Crossref (2026-11-04, metadatos + citas). Según
la regla permanente de `docs/ANKI_PEDAGOGY.md` §0, queda confirmarlas también
en Scopus con la API del propietario (queries `TITLE-ABS-KEY("help seeking"
AND "interactive learning environments")` y `TITLE-ABS-KEY("instructor
fluency" AND learning)`).

## Pendiente (decidido dejarlo para después)

### P1 · Recursos de la lección (código y archivos adjuntos)
- **Qué:** listar en Study los recursos que Udemy adjunta a la lección
  (archivos, código fuente, enlaces) y, si hay código, leerlo para que
  Aplicar parta del código real («extiende este método del proyecto»,
  «encuentra el fallo en esta versión») y la revisión de Kinema lo compare.
- **Cómo:** con la sesión del estudiante en la página de Udemy (sin servidor
  propio); los .zip se abren en el dock (JSZip ya está en el proyecto). Solo
  texto de código; nada se sube a ningún sitio salvo al proveedor de IA que
  el estudiante ya configuró.
- **Bloqueo:** necesita un curso real con recursos para verificar el acceso a
  los adjuntos; desde el prototipo no se puede probar.

### P2 · Proyecto de portafolio según el objetivo
- **Qué:** al terminar una **sección** (no cada lección), Kinema propone un
  mini-proyecto que junta lo visto con el código del curso y el objetivo del
  estudiante. El estudiante pega su código o el enlace al repositorio y Kinema
  lo revisa con el mismo patrón («¿Cómo sigues?»). Sustituye al antiguo
  «bonus · llévalo al mundo real» con algo que sí se comprueba.
- **Depende de:** P1 (el código del curso) y de saber dónde termina una
  sección en el temario de Udemy.

### P4 · Práctica dirigida a las ideas no dominadas
Generar (o ajustar) la práctica de Aplicar después de Comprobar, con las
ideas no marcadas y las preguntas falladas como entrada, para que la
transferencia ejercite justo lo que no salió. Coste: una llamada más a la IA
por lección y espera visible al entrar en Aplicar. Hoy la práctica es la
misma para todos y su resultado sí alimenta el refuerzo en Anki. Con el
ejercicio estructurado, una variante barata sería elegir entre 2 ejercicios
generados el que toque una idea no clara (sin llamada extra).

### P5 · Escribir en el vault sin URIs (opcional)
Elegir la carpeta del vault una vez (File System Access API, permiso
persistente de Chrome) y escribir los .md directamente: sin diálogo de
Chrome y sin un clic por nota. El crecimiento sin pisar ya está resuelto con
`append`; esto solo quitaría fricción. Alternativa para usuarios avanzados:
el plugin Local REST API de Obsidian.

### P3 · Verificar en Udemy real
- Lección de texto (artículo): que se lea el texto y no el Q&A.
- Cuestionario o ejercicio: que aparezca «Lección sin video ni texto».
- «Ir a la siguiente lección»: que pulse el «Siguiente» de Udemy o el
  siguiente elemento del temario, y que Study abra la lección nueva.

## Resultado de la prueba FSRS (2026-11-01, corregida en v1.5.3)

Prueba ejecutada con `scripts/qa-fsrs-clean-profile.py` sobre colecciones
LIMPIAS creadas con el backend real de Anki (pylib 25.9.5, headless, sin
tocar la colección del usuario) y el importador real. Verificada contra el
código fuente de Anki 25.09 (ankitects/anki, tag 25.09.2). Tres
conclusiones:

1. **FSRS es un ajuste de toda la colección, no del preset.**
   `rslib/src/config/bool.rs → BoolKey::Fsrs` (clave `"fsrs"` en la tabla
   `config`); solo se cambia con UpdateDeckConfigs
   (`rslib/src/deckconfig/update.rs` L211–213, `req.fsrs`). El `fsrs: true`
   de nuestro preset es una clave que Anki ignora: ningún .apkg activa FSRS.
2. **El importador SÍ trae los presets — si el usuario activa la opción.**
   `ImportAnkiPackageOptions.with_deck_configs` («Importar cualquier
   configuración del mazo»), apagada por defecto y recordada en la clave
   `withDeckConfigs` de la colección (`apkg/import/mod.rs` L64, L87–88;
   `gather.rs` L62–65; si está apagada, `reset_decks` asigna Default).
   Medido: A1 sin opciones → preset NO creado y `deck.conf → 1`; A2 con
   `with_deck_configs=True` → preset «Kinema · Cursos» creado (20 nuevas/día)
   y el mazo apuntando a él.
3. **El interruptor real de colección funciona como se esperaba** (control
   válido): `col.get_config('fsrs')` False → respondida una tarjeta nueva,
   `memory_state` ausente; `col.set_config('fsrs', True)` → `memory_state`
   presente (stability 8.30, difficulty 1.0); False de nuevo → ausente.

Contexto de la colección del usuario (copia de solo lectura):
`withDeckConfigs: true` (la opción se activó alguna vez y Anki la recuerda)
y `fsrs: true`. El `importPackage` de AnkiConnect usa el importador legacy
`AnkiPackageImporter`, que copia presets — por eso en las suites de QA los
presets «sí llegaban».

**Veredicto**: la frase de la guía del paso 4 se queda como está — es
verdadera en ambos casos: «Comprueba que FSRS esté activado: Opciones del
mazo → FSRS (Anki 23.10+). Ese interruptor vale para toda tu colección; si
ya lo estaba, no tienes que hacer nada.»

v1.5.4: aviso único tras el primer export para activar la opción de
importación.

**Causa de la guía falsa: opción de importación apagada por defecto.**
Corregido en v1.5.3: la guía indica activar «Importar cualquier
configuración del mazo» para recibir los presets (y aclara que, si no, estos
mazos usan el preset Default del usuario).
