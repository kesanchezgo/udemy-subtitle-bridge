// Medición de una sesión observada (persona real), sin DOM: recibe eventos con
// marcas de tiempo y devuelve la tabla por paso.
//
// Cada fila mide DESDE su marca hasta la siguiente (sin desplazamiento): la
// marca 'Recordar' se pone al pulsar Empezar y la última fila se cierra con la
// marca final ('__end__', al ver "Lección terminada").
//
// Las esperas de IA se acumulan por muestreo: mientras el indicador de carga de
// evaluación esté visible se suma el tiempo transcurrido. Así una pantalla con
// varios estados a la vez no arranca el cronómetro, y un veredicto viejo que
// siga en pantalla no lo cierra.

export function createObserverTimeline() {
  let startedAt = null;
  let current = null;
  let evalVisibleSince = null;
  const marks = [];
  const ai = {};

  const api = {
    /** Entra en un paso (la primera llamada fija el origen = Empezar). */
    enter(name, at) {
      if (startedAt === null) startedAt = at;
      marks.push({ name, at });
      current = name;
    },
    /** Suma una espera de IA conocida (p. ej. la generación tras Empezar). */
    addAi(ms, at) {
      if (!current || !(ms > 0)) return;
      ai[current] = (ai[current] ?? 0) + ms;
    },
    /** Muestreo del indicador de carga de evaluación. */
    evalLoading(visible, at) {
      if (visible && evalVisibleSince === null) {
        evalVisibleSince = at;
      } else if (!visible && evalVisibleSince !== null) {
        if (current) ai[current] = (ai[current] ?? 0) + (at - evalVisibleSince);
        evalVisibleSince = null;
      }
    },
    /** Cierra la sesión (Lección terminada). */
    finish(at) {
      if (evalVisibleSince !== null && current) {
        ai[current] = (ai[current] ?? 0) + (at - evalVisibleSince);
        evalVisibleSince = null;
      }
      marks.push({ name: '__end__', at });
    },
    summary() {
      const end = marks.find((m) => m.name === '__end__');
      const rows = [];
      for (let i = 0; i < marks.length; i += 1) {
        const m = marks[i];
        if (m.name === '__end__') break;
        const nextAt = marks[i + 1]?.at ?? m.at;
        const total = Math.max(0, nextAt - m.at);
        const wait = ai[m.name] ?? 0;
        rows.push({ name: m.name, total, ai: wait, human: Math.max(0, total - wait) });
      }
      const totalObserved = (end?.at ?? marks[marks.length - 1]?.at ?? 0) - (startedAt ?? 0);
      return { rows, total: Math.max(0, totalObserved), startedAt };
    },
  };
  return api;
}