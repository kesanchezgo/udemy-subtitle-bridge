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

**Veredicto (sin cambios respecto a v1.5.2)**: la frase de la guía del paso
4 se queda como está — es verdadera en ambos casos: «Comprueba que FSRS esté
activado: Opciones del mazo → FSRS (Anki 23.10+). Si ya lo estaba, no tienes
que hacer nada.»

**Causa de la guía falsa: opción de importación apagada por defecto.**
Corregido en v1.5.3: la guía indica activar «Importar cualquier
configuración del mazo» para recibir los presets (y aclara que, si no, estos
mazos usan el preset Default del usuario).
