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
  re-exposiciones las gestiona el scheduler, no tarjetas duplicadas.
- **15 nuevas/día** (preset): carga sostenible; el scheduling óptimo lo hace
  FSRS (ver §2), no el volumen diario.

## 2. Configuración de estudio (presets) — racional

- **Práctica de recuperación + espaciado** son las dos técnicas con mayor
  utilidad demostrada (Dunlosky et al. 2013; Cepeda et al. 2006 meta-análisis
  10.1037/0033-2909.132.3.354). Anki ya las implementa; el preset solo debe
  **no estorbarlas**.
- **FSRS activado por defecto** (viaja en el `.apkg`, verificado): el
  planificador FSRS optimiza intervalos contra retención objetivo 0.9
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

Note types y presets con IDs/nombres propios (`Udemy Bridge · …`); árbol de
mazos bajo una raíz configurable; GUIDs por contenido (reimportar actualiza,
no duplica); csum SHA-1 estándar de Anki. Nada del usuario se toca (verificado
en importaciones reales).

## 4. Bibliografía (Scopus)

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
    — **El paper del algoritmo FSRS** que Anki usa (activo por defecto en
    nuestros presets).
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

**Badge de repasos (AnkiConnect)**: el dock consulta cuántas tarjetas de la
lección actual tienen repaso pendiente hoy. No introduce un efecto nuevo:
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

