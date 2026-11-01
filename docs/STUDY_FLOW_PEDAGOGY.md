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

R6 además ya figura en `docs/ANKI_PEDAGOGY.md` (verificado por DOI el 2026-10-29).

## Decisiones → referencia

### §1 Flujo de 4 pasos con carga mínima
- **Recuerdo libre antes de ver los conceptos** (paso 1): la recuperación libre
  antes de re-estudiar mejora la comprensión posterior → **R6** (Karpicke &
  Blunt 2011).
- **El mínimo bloqueante es 1 toque de nivel + 1 respuesta** y la exportación
  deja de ser requisito para terminar: la carga extra sin valor pedagógico
  compite con la motivación → **R3** (recompensas exigidas minan la motivación
  intrínseca; el requisito de exportar es una exigencia externa sin función de
  aprendizaje). El piso de 3 min es **preferencia de diseño**.

### §1.2 Comprobación adaptativa
- **Empezar en la dificultad declarada, bajar a consolidar tras fallar,
  ofrecer «un reto más» tras acertar**: el apoyo debe ajustarse a la pericia
  demostrada; apoyo de más o de menos daña el aprendizaje (efecto de inversión
  de la pericia) → **R7** (Kalyuga 2007).
- **Reintento tras el feedback y pregunta de consolidación**: el error seguido
  de corrección y reintentos es una oportunidad de aprendizaje, no un castigo →
  **R4** (Metcalfe 2017, errorful learning / hypercorrection).

### §1.4 Cierre
- **Resumen con datos reales** (recordadas, aciertos, práctica, tarjetas):
  hacer visible el automonitoreo del progreso apoya la autorregulación →
  **R9** (Butler & Winne 1995).
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

### §3 Tarjetas de refuerzo
- **Convertir lo fallado en tarjetas de la lección (máx. 2), primero en la
  cola**: el error corregido es material de repaso valioso; convertirlo en
  ítem de repaso espaciado explota el efecto de hiper-corrección → **R4**
  (Metcalfe 2017). La restricción de máximo 2 es **preferencia de diseño**
  para acotar la carga del mazo.

### §4 Feedback de la IA
- **Veredicto discreto + BIEN / FALTÓ / PARA RECORDAR**, sin porcentajes ni
  preguntas nuevas dentro del feedback: el feedback efectivo es concreto,
  apunta a la tarea y al proceso, y no introduce demandas nuevas → **R1**
  (Hattie & Timperley 2007) y **R2** (Shute 2008: sin calificaciones
  numéricas, con rúbrica y guía específica).

## Resultado de la prueba FSRS (2026-11-01, decidida)

Prueba ejecutada con `scripts/qa-fsrs-clean-profile.py` sobre una colección
LIMPIA creada con el backend real de Anki (pylib 25.9.5, headless, sin tocar
la colección del usuario) y el importador real, con el `.apkg` de QA
(`tmp/qa-concept.apkg`, cuyo preset lleva `fsrs: true`):

- **El import NO trae el preset**: tras importar, la tabla de configs solo
  contiene `Default`; el mazo importado remapa `deck.conf → 1` y cae a 20
  nuevas/día de Default. Nuestro preset («Udemy Bridge · Cursos», 20/día,
  `fsrs: true`) no llega.
- **FSRS no se activa**: respondiendo las tarjetas importadas, ninguna
  almacena estado de memoria (`cards.data` sin `s`/`d`; `memory_state`
  ausente), mientras que en la colección del usuario (FSRS activo de verdad)
  las tarjetas de repaso sí lo tienen (p. ej. s=12.44, d=2.64).
- El `FSRS: true` que midió `qa-vocab-real` en su día era el preset que YA
  existía en esa colección de importaciones anteriores — exactamente la
  objeción de la revisión.
- Controles del experimento: con un preset puesto a mano (`fsrs: true` +
  `fsrsWeights/Params5/6` vacíos, réplica de lo que escribe la UI) respondido
  vía el flujo oficial de cola, el estado de memoria tampoco apareció; la
  receta exacta de activación manual en 25.9 necesita más de lo que serializa
  nuestro preset, y no afecta a la decisión.

**Veredicto**: la frase de la guía del paso 4 se queda como está — es
verdadera en ambos casos y es la que corresponde: «Comprueba que FSRS esté
activado: Opciones del mazo → FSRS (Anki 23.10+). Si ya lo estaba, no tienes
que hacer nada.» NO se vuelve a «queda activado automáticamente».

**Hallazgo de producto (nuevo, fuera de esta ronda)**: el importador de Anki
25.9 suelta las configs de mazo de los .apkg legacy — en una colección limpia
el usuario NO recibe nuestros presets (20/15 nuevas/día, pasos, retención,
FSRS). Los preset que sí hay en la colección del usuario vienen de rondas
anteriores. Si el onboarding de primera importación importa, los presets
deberían instalarse por otra vía (p. ej. `saveDeckConfig` + `saveDeck` vía
AnkiConnect en la primera exportación) — decisión de producto pendiente.
