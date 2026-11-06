// Prueba automática del observador: reloj falso + línea de tiempo conocida y
// tabla esperada comprobada. Valida la medición sin gastar 20 minutos de sesión.
//
// Escenario (el de la contrarrevisión): 3:30 de vídeo antes de Empezar, 80 s de
// generación, dos evaluaciones de 20 s, una revisión de 17 s y 30 s en Fijar.
//   Recordar   90 s (IA 80)      -> 80 de generación + 10 humanos
//   Comprobar 170 s (IA 40)      -> dos evaluaciones de 20 s
//   Aplicar   120 s (IA 17)
//   Fijar      30 s (IA 0)
//   TOTAL     410 s desde Empezar (el vídeo previo no cuenta)

import { readFileSync } from 'node:fs';
import { createObserverTimeline, EVAL_LOADING } from './observer-timeline.mjs';

let fails = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fails += 1;
};

// ── Escenario con reloj virtual ───────────────────────────────────────────────
const T = createObserverTimeline();
const BASE = 1_000_000;

// Empezar a los 210 s de vídeo (3:30): el origen de la medición.
T.enter('Recordar', BASE + 0);
// Generación: 80 s (espera de IA conocida del paso en curso).
T.addAi(80_000, BASE + 80_000);
// La persona elige nivel y lee: hasta los 90 s.
T.enter('Comprobar', BASE + 90_000);
// Dos evaluaciones de 20 s, muestreadas como el observador real.
T.evalLoading(true, BASE + 95_000);
T.evalLoading(false, BASE + 115_000);
T.evalLoading(true, BASE + 140_000);
T.evalLoading(false, BASE + 160_000);
// «Analizando la transcripción» (pantalla de generación) NO debe arrancar el
// cronómetro: se comprueba abajo con un muestreo espurio ya cubierto por el
// patrón del observador; aquí basta con que el indicador real funcione.
T.enter('Aplicar', BASE + 260_000);
T.evalLoading(true, BASE + 270_000);
T.evalLoading(false, BASE + 287_000);
T.enter('Fijar', BASE + 380_000);
T.finish(BASE + 410_000);

const { rows, total } = T.summary();
const expected = [
  { name: 'Recordar', total: 90_000, ai: 80_000 },
  { name: 'Comprobar', total: 170_000, ai: 40_000 },
  { name: 'Aplicar', total: 120_000, ai: 17_000 },
  { name: 'Fijar', total: 30_000, ai: 0 },
];

console.log('Tabla medida (segundos reales / esperados):');
for (let i = 0; i < expected.length; i += 1) {
  const got = rows[i] ?? { name: '(falta)', total: 0, ai: 0 };
  const exp = expected[i];
  console.log(
    `  ${exp.name.padEnd(10)} ${String(got.total / 1000).padStart(4)}s / ${String(exp.total / 1000).padStart(4)}s` +
    `   IA ${String(got.ai / 1000).padStart(4)}s / ${String(exp.ai / 1000).padStart(4)}s` +
    `   humano ${String(got.human / 1000).padStart(4)}s`,
  );
}

check('hay exactamente cuatro pasos', rows.length === 4, JSON.stringify(rows.map((r) => r.name)));
for (let i = 0; i < expected.length; i += 1) {
  const exp = expected[i];
  const got = rows[i];
  check(`${exp.name}: duración ${exp.total / 1000}s`, got?.total === exp.total, `medido ${got?.total}`);
  check(`${exp.name}: espera IA ${exp.ai / 1000}s`, got?.ai === exp.ai, `medido ${got?.ai}`);
  check(`${exp.name}: humano ${(exp.total - exp.ai) / 1000}s`, got?.human === exp.total - exp.ai, `medido ${got?.human}`);
}
check('TOTAL 410 s desde Empezar (sin el vídeo previo)', total === 410_000, `medido ${total}`);

// ── Casos de borde del muestreo ───────────────────────────────────────────────
const B = createObserverTimeline();
B.enter('Recordar', 0);
B.enter('Comprobar', 50_000);
B.evalLoading(true, 60_000);      // arranca
B.evalLoading(true, 70_000);      // sigue visible: no reinicia
B.evalLoading(false, 80_000);     // suma 20 s
B.finish(100_000);
const edge = B.summary();
check('el muestreo no reinicia mientras sigue visible', edge.rows[1]?.ai === 20_000, `medido ${edge.rows[1]?.ai}`);
check('un veredicto previo en pantalla no cierra la medición', edge.rows[1]?.human === 30_000, `humano ${edge.rows[1]?.human}`);

const C = createObserverTimeline();
C.enter('Recordar', 0);
C.evalLoading(true, 10_000);
C.finish(40_000);                 // cierra con el indicador visible
check('fin con indicador visible cierra la medición', C.summary().rows[0]?.ai === 30_000, `medido ${C.summary().rows[0]?.ai}`);

// ── Detección de los textos REALES de la app ──────────────────────────────────
// No basta con probar la aritmética con true/false decididos: si un texto de la
// interfaz cambia, las esperas se irían a cero sin avisar. Se leen los literales
// de StudyAgentTab.tsx y se comprueba cuáles coinciden con el patrón.
const UI_SOURCE = 'src/app/components/StudyAgentTab.tsx';
const source = readFileSync(UI_SOURCE, 'utf8');
const ELLIPSIS = '\u2026';

const EVAL_TEXTS = [
  `Leyendo tu respuesta${ELLIPSIS}`,             // cargador 0 - 1.6 s
  `Comparando con la lecci${'\u00f3'}n${ELLIPSIS}`,     // cargador 1.6 - 3.2 s
  `Preparando tu revisi${'\u00f3'}n${ELLIPSIS}`,        // cargador desde 3.2 s
];
const GENERATION_TEXT = `Analizando la transcripci${'\u00f3'}n${ELLIPSIS}`;

console.log('\nDetección contra los textos reales de la app:');
for (const text of EVAL_TEXTS) {
  const inSource = source.includes(text);
  check(`«${text}» existe en la app`, inSource, 'el texto cambió: actualiza el patrón');
  check(`«${text}» cuenta como espera de IA`, EVAL_LOADING.test(text), 'no lo detecta');
}
const genInSource = source.includes(GENERATION_TEXT);
check(`«${GENERATION_TEXT}» existe en la app (pantalla de generación)`, genInSource, 'el texto cambió');
check(`«${GENERATION_TEXT}» NO cuenta como espera de evaluación`, !EVAL_LOADING.test(GENERATION_TEXT), 'lo detecta por error');
// El cargador de evaluación dice «Preparando tu revisión...» y la generación
// «Preparando tu sesión»: casi el mismo arranque, y confundirlos cargaría a
// Recordar la espera de la generación dos veces.
const SESSION_TEXT = 'Preparando tu sesión';
check(`«${SESSION_TEXT}» existe en la app (generación)`, source.includes(SESSION_TEXT), 'el texto cambió');
check(`«${SESSION_TEXT}» NO cuenta como espera de evaluación`, !EVAL_LOADING.test(SESSION_TEXT), 'lo detecta por error');

console.log(fails === 0 ? '\n✅ OBSERVADOR OK (medición validada con reloj virtual)' : `\n❌ ${fails} fallos`);
process.exit(fails === 0 ? 0 : 1);