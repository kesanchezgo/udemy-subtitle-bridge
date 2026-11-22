import { chromeStorage } from "./chromeStorage";
import { slugify } from "./historyService";
import { loadVocabConfig } from "./vocabularyService";
import { prepareVocabularyCandidates, updateVocabularySession, vocabularySessionKey } from "./vocabularySession";
import type { VocabularyWord } from "../../shared/prompts";

let prototypeWords: VocabularyWord[] | null = null;

export function prototypeVocabulary(targetLang: string): { words: VocabularyWord[]; partial: boolean } | null {
  const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime;
  return prototypeWords && targetLang === "en" && !runtime?.sendMessage ? { words: prototypeWords, partial: false } : null;
}

// ─── §5 Dudas: transcripción y respuestas de demostración (solo desarrollo) ──
// La vista previa no tiene transcripción real; las citas de cada respuesta
// están COPIADAS de esta transcripción, así que se verifican como las reales.
const PROTOTYPE_TRANSCRIPT = [
  "Java is a high-level, object-oriented programming language.",
  "It was developed by Sun Microsystems in 1995.",
  "The JVM, the Java Virtual Machine, is what makes this possible.",
  "Java code is not compiled directly into machine code for one operating system.",
  "Instead, javac compiles your source code into bytecode, which is stored in .class files.",
  "The JVM reads the bytecode and executes it on the actual machine.",
  "Every operating system has its own JVM, but all of them understand the same bytecode.",
  "That is why the same .class file can run on any platform that has a JVM installed.",
  "So the portability comes from the bytecode plus the JVM, not from the source code itself.",
  "At first, the JVM interprets the bytecode instruction by instruction.",
  "The JIT compiler watches which parts of the program run most often.",
  "It compiles those hot spots into native machine code while the program is running, so they run much faster.",
  "Java also manages memory for you.",
  "Objects live in an area of memory called the heap.",
  "The garbage collector finds objects that are no longer used and frees that memory automatically.",
  "The JDK is the development kit: it includes the compiler, javac, and other tools.",
  "The JRE is what you need to run Java programs, and it contains the JVM.",
].join(" ");

// Orden de más específica a más general: cada tema da una tarjeta distinta.
const PROTOTYPE_DOUBT_ANSWERS: { match: RegExp; answer: string }[] = [
  {
    match: /\bjit\b|just in time|codigo nativo|codigo maquina|hot ?spots?|rendimiento|rapid|lent/,
    answer: [
      "El **JIT** (compilador just-in-time) acelera la ejecución: al principio la JVM interpreta el bytecode, pero el JIT detecta las partes que más se ejecutan y las compila a **código máquina nativo** mientras el programa corre.",
      "CITA: «The JIT compiler watches which parts of the program run most often.»",
      "CITA: «It compiles those hot spots into native machine code while the program is running, so they run much faster.»",
      "TARJETA: ¿Qué hace el JIT dentro de la JVM? || Compila a código máquina las partes que más se ejecutan (hot spots) mientras el programa corre.",
    ].join("\n"),
  },
  {
    match: /memoria|garbage|recolector|basura|heap|liber/,
    answer: [
      "Java gestiona la memoria por ti: los objetos viven en el **heap** y el **recolector de basura** (garbage collector) busca los que ya no se usan y libera esa memoria automáticamente.",
      "CITA: «Objects live in an area of memory called the heap.»",
      "CITA: «The garbage collector finds objects that are no longer used and frees that memory automatically.»",
      "TARJETA: ¿Quién libera en Java la memoria de los objetos que ya no se usan? || El recolector de basura de la JVM, que los elimina del heap automáticamente.",
    ].join("\n"),
  },
  {
    match: /\bjdk\b|\bjre\b|kit|instalar/,
    answer: [
      "El **JDK** es el kit de desarrollo: incluye el compilador `javac` y otras herramientas. El **JRE** es lo que necesitas para ejecutar programas Java y contiene la **JVM**, que es la que ejecuta el bytecode.",
      "CITA: «The JDK is the development kit: it includes the compiler, javac, and other tools.»",
      "CITA: «The JRE is what you need to run Java programs, and it contains the JVM.»",
      "TARJETA: ¿Qué diferencia hay entre JDK y JRE? || El JDK trae las herramientas para desarrollar (como javac); el JRE es lo necesario para ejecutar e incluye la JVM.",
    ].join("\n"),
  },
  {
    match: /kotlin|python|javascript|typescript|android|spring|scala|\bc#|\brust\b/,
    answer: "FUERA DE LA LECCIÓN: esta lección no trata ese tema. Como orientación general, búscalo en la documentación oficial o en una lección posterior del curso; aquí se cubren Java, el bytecode, la JVM, el JIT y la gestión de memoria.",
  },
  {
    match: /bytecode|portab|plataforma|sistema operativo|\.class|javac|compil/,
    answer: [
      "La portabilidad no viene del código fuente, sino de la combinación **bytecode + JVM**: `javac` compila tu código a bytecode (archivos `.class`), que no depende de ningún sistema operativo, y cada sistema tiene su propia JVM que entiende ese mismo bytecode.",
      "CITA: «Instead, javac compiles your source code into bytecode, which is stored in .class files.»",
      "CITA: «So the portability comes from the bytecode plus the JVM, not from the source code itself.»",
      "TARJETA: ¿De dónde viene la portabilidad de Java? || Del bytecode (archivos .class) más una JVM por sistema operativo que lo ejecuta.",
    ].join("\n"),
  },
];

const PROTOTYPE_DOUBT_DEFAULT = [
  "La **JVM** (Java Virtual Machine) es el programa que lee el bytecode y lo ejecuta en la máquina real. Cada sistema operativo tiene su propia JVM, pero todas entienden el mismo bytecode; por eso el mismo `.class` corre en cualquier plataforma con una JVM instalada.",
  "CITA: «The JVM reads the bytecode and executes it on the actual machine.»",
  "CITA: «That is why the same .class file can run on any platform that has a JVM installed.»",
  "TARJETA: ¿Qué hace la JVM con el bytecode? || Lo lee y lo ejecuta en la máquina real; hay una JVM por sistema operativo y todas entienden el mismo bytecode.",
].join("\n");

/**
 * Sesión de estudio de demostración (vista previa, nunca con runtime de
 * extensión): la lección de la demo con ideas «Título — detalle» y un Aplicar
 * estructurado. La idea 3 no tiene tarjeta de la IA a propósito: Fijar la
 * cubre con la tarjeta de su pregunta (cardCoverage).
 */
export function prototypeStudyPayload(lesson: string): Record<string, unknown> | null {
  const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime;
  if (runtime?.sendMessage) return null;
  // Fase 4: una lección que repite ideas de otra ya exportada («Arquitectura de la JVM»).
  if (/\bjit\b|warm-?up|rendimiento/i.test(lesson)) return prototypeJitPayload();
  if (!/java|jvm/i.test(lesson)) return null;
  return {
    relevance: { score: 88, reason: "Explica cómo corre Java en cualquier plataforma: la base de cualquier entrevista backend." },
    summary: "javac traduce el código fuente a bytecode, un formato intermedio. La JVM de cada sistema lo ejecuta y el JIT compila en caliente lo que más se usa, por eso el mismo .class corre en todas partes y casi a velocidad nativa.",
    conceptTerms: ["bytecode", "JVM", "JIT"],
    keyConcepts: [
      "¿Qué genera javac al compilar? — javac compila el fuente a bytecode (.class), no a código nativo",
      "¿Quién lee y ejecuta el bytecode? — la JVM de cada plataforma lee y ejecuta el mismo bytecode",
      "¿Por qué Java logra velocidad casi nativa? — el JIT compila a nativo los hot spots mientras el programa corre",
      "¿Por qué un .class corre sin recompilar? — cada sistema tiene su propia JVM y todas entienden el mismo bytecode",
    ],
    questions: [
      { q: "¿Qué archivo genera javac a partir del código fuente?", bloom: "comprender", difficulty: "confused", conceptRefs: [0], hint: "No es un .exe", answer: "Un .class con bytecode, no código máquina." },
      { q: "¿Qué componente ejecuta el bytecode en cada sistema operativo?", bloom: "comprender", difficulty: "partial", conceptRefs: [1], hint: "Hay uno por plataforma", answer: "La JVM de esa plataforma." },
      { q: "Si Java interpreta bytecode, ¿por qué no es tan lento como un intérprete puro?", bloom: "analizar", difficulty: "clear", conceptRefs: [2], hint: "Algo se compila durante la ejecución", answer: "El JIT detecta los hot spots y los compila a nativo en caliente." },
      { q: "¿Por qué el mismo .class corre en Windows y en Linux sin recompilar?", bloom: "aplicar", difficulty: "partial", conceptRefs: [3], hint: "Lo específico de la plataforma es otra pieza", answer: "Porque cada sistema tiene su JVM y todas entienden el mismo bytecode." },
      { q: "Un compañero dice que Java es lento para todo. Evalúa esa afirmación.", bloom: "evaluar", difficulty: "mastered", conceptRefs: [1, 2, 3], hint: "Piensa en el warm-up", answer: "Tras el warm-up el JIT acerca el rendimiento a nativo; C++ gana en latencia predecible. Es una simplificación." },
    ],
    application: {
      isCode: true,
      setup: "Compilas App.java en tu laptop y quieres ejecutarlo en un servidor Linux con otra JVM.",
      challenge: "Completa los dos comandos que faltan para ejecutarlo en el servidor sin recompilar.",
      solution: "javac App.java genera App.class en la laptop; en el servidor basta java App, porque su JVM interpreta el mismo bytecode.",
      practice: {
        format: "completar",
        language: "bash",
        body: "[[1]] App.java        # en la laptop: genera App.class\nscp App.class servidor:~/\nssh servidor [[2]] App  # sin recompilar",
        blanks: [
          { accept: ["javac"], hint: "el compilador", options: ["javac", "java", "jar"] },
          { accept: ["java"], hint: "lanza la JVM", options: ["javac", "java", "jvm"] },
        ],
        explanation: "javac compila una vez a bytecode; en el servidor, java arranca su JVM, que interpreta ese mismo .class.",
      },
    },
    interviewQ: { q: "Explica en un minuto cómo Java es portable sin perder velocidad.", idealAnswer: "Bytecode para la portabilidad, JVM por plataforma y JIT para la velocidad tras el warm-up." },
    nextAction: "Ejecuta tu app con -XX:+PrintCompilation y mira qué métodos compila el JIT.",
    ankiCards: [
      { id: "card-001", type: "concepto", conceptRefs: [0], front: "¿Qué produce <code>javac</code> a partir del código fuente?", back: "<p><b>Bytecode</b> en archivos <code>.class</code>, no código nativo.</p>", tags: ["java", "compilacion"] },
      { id: "card-002", type: "concepto", conceptRefs: [1], front: "¿Qué hace la JVM de cada sistema con el bytecode?", back: "<p><b>Lo ejecuta</b> en la máquina real; hay una JVM por sistema y todas entienden el mismo bytecode.</p>", tags: ["java", "jvm"] },
      { id: "card-003", type: "comparacion", conceptRefs: [2], front: "¿Cuándo compila el JIT y qué gana con ello?", back: "<p><b>En runtime</b>, los hot spots: gana velocidad casi nativa tras el warm-up.</p>", tags: ["java", "rendimiento"] },
    ],
  };
}

/**
 * Fase 4 · demo de «ideas que ya estaban en tu mazo». Escribe en «Datos del
 * curso» una lección como «JIT y rendimiento en caliente»: dos de sus cuatro
 * ideas ya están en la lección exportada «Arquitectura de la JVM» (sembrada en
 * el historial): una con el MISMO frente y otra con el MISMO título de idea.
 * Las otras dos son nuevas y llevan su tarjeta.
 */
function prototypeJitPayload(): Record<string, unknown> {
  return {
    relevance: { score: 84, reason: "Explica por qué Java gana velocidad mientras corre: clave para medir y defender el rendimiento." },
    summary: "La JVM arranca interpretando y observa qué código se ejecuta más. A ese código caliente el JIT lo compila a nativo, por eso la app mejora tras el warm-up. Medir sin calentar compara cosas que no corren igual en producción.",
    conceptTerms: ["JIT", "hot spot", "warm-up"],
    keyConcepts: [
      "Qué es un hot spot — código que se ejecuta tanto que al JIT le compensa compilarlo a nativo",
      "Por qué mejora con el tiempo — al arrancar la JVM interpreta; tras el warm-up el JIT ya optimizó lo caliente",
      "Interpretar o compilar — la JVM empieza interpretando y solo compila lo que compensa el coste de compilar",
      "Cómo medir el rendimiento — un benchmark serio descarta las primeras iteraciones de calentamiento",
    ],
    questions: [
      { q: "¿Qué convierte un método en un hot spot para el JIT?", bloom: "comprender", difficulty: "confused", conceptRefs: [0], hint: "Piensa en cuántas veces se ejecuta", answer: "Que se ejecuta tantas veces que compilarlo a nativo compensa." },
      { q: "¿Por qué la misma app va más lenta al arrancar que a los cinco minutos?", bloom: "comprender", difficulty: "partial", conceptRefs: [1], hint: "Al principio aún no hay nada compilado", answer: "Al arrancar interpreta; con el uso, el JIT compila lo caliente a nativo." },
      { q: "¿Por qué la JVM no compila todo a nativo desde el principio?", bloom: "analizar", difficulty: "clear", conceptRefs: [2], hint: "Compilar también cuesta", answer: "Compilar cuesta tiempo y memoria: solo compensa con el código que más se ejecuta." },
      { q: "Mides un método una sola vez nada más arrancar. ¿Qué falla en esa medición?", bloom: "aplicar", difficulty: "partial", conceptRefs: [3], hint: "¿Ya pasó el JIT por ahí?", answer: "Mides la versión interpretada: hay que calentar antes y medir después." },
      { q: "Tu jefe quiere desactivar el JIT para que el arranque sea predecible. Evalúa la propuesta.", bloom: "evaluar", difficulty: "mastered", conceptRefs: [0, 2, 3], hint: "¿Qué se pierde tras el warm-up?", answer: "El arranque cambia poco y se pierde la velocidad casi nativa del código caliente: mejor medir tras calentar." },
    ],
    application: {
      isCode: false,
      setup: "Comparas dos versiones de un método que ordena listas con un benchmark casero.",
      challenge: "Elige cómo medir para que la comparación sea justa.",
      solution: "Ejecutar cada versión muchas veces sin medir (calentar) y medir después: así las dos ya pasaron por el JIT, como en producción.",
      practice: {
        format: "decidir",
        body: "Vas a comparar dos versiones de un método que ordena listas de 10.000 elementos.",
        options: ["Medir la primera llamada de cada versión", "Ejecutar cada versión miles de veces sin medir y medir después", "Medir las dos con el JIT desactivado"],
        answerIndex: 1,
        explanation: "Tras calentar, las dos versiones ya están compiladas por el JIT: comparas lo que de verdad corre en producción.",
      },
    },
    interviewQ: { q: "Explica en un minuto por qué Java gana velocidad con el tiempo.", idealAnswer: "Interpreta al arrancar, detecta los hot spots y el JIT los compila a nativo; tras el warm-up corre casi a velocidad nativa." },
    nextAction: "Mide un método de tu proyecto antes y después de calentarlo y compara los tiempos.",
    ankiCards: [
      // Mismo frente que una tarjeta de «Arquitectura de la JVM»: es la misma tarjeta.
      { id: "card-001", type: "concepto", conceptRefs: [1], front: "¿Por qué una app Java va más rápida tras unos minutos (warm-up)?", back: "<p><b>Porque el JIT ya compiló a nativo lo que más se ejecuta.</b> Al arrancar, la JVM solo interpreta.</p>", tags: ["java", "jit"] },
      { id: "card-002", type: "comparacion", conceptRefs: [2], front: "¿Por qué la JVM interpreta al principio en vez de compilarlo todo a nativo?", back: "<p><b>Compilar cuesta</b> tiempo y memoria: solo compensa con el código caliente.</p>", tags: ["java", "jit"] },
      { id: "card-003", type: "aplicacion", conceptRefs: [3], front: "¿Qué hay que hacer antes de medir el rendimiento de un método Java?", back: "<p><b>Calentarlo</b>: ejecutarlo muchas veces sin medir para que el JIT lo compile.</p>", tags: ["java", "rendimiento"] },
    ],
  };
}

/** Demo de dudas para la vista previa (nunca con runtime de extensión). */
export function prototypeDoubtDemo(): { transcript: string; answerFor: (question: string) => string } | null {
  const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime;
  if (runtime?.sendMessage) return null;
  return {
    transcript: PROTOTYPE_TRANSCRIPT,
    answerFor: (question: string) => {
      const text = question.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      return PROTOTYPE_DOUBT_ANSWERS.find((item) => item.match.test(text))?.answer ?? PROTOTYPE_DOUBT_DEFAULT;
    },
  };
}

export async function initializePrototypeData(): Promise<void> {
  const saved = await chromeStorage.get(["agent_course_name", "agent_lesson_name"]);
  const course = String(saved.agent_course_name || "Java In-Depth: Become a Complete Java Engineer!");
  const lesson = String(saved.agent_lesson_name || "What is Java & JVM?");
  const config = await loadVocabConfig();
  if (config.targetLang === "en") {
    const candidates = prepareVocabularyCandidates([
      { word: "object-oriented", level: "B2", pos: "adjective", meaning: "orientado a objetos", phonetic: "/ˌɒbdʒekt ˈɔːrientɪd/", monolingual: "Organized around objects that combine data and behavior.", sentence: "Java is an object-oriented programming language.", sentenceTranslation: "Java es un lenguaje de programación orientado a objetos." },
      { word: "virtual machine", level: "C1", pos: "noun", meaning: "máquina virtual", phonetic: "/ˌvɜːtʃuəl məˈʃiːn/", monolingual: "Software that simulates a computer and runs programs independently of the underlying operating system.", sentence: "A virtual machine executes bytecode.", sentenceTranslation: "Una máquina virtual ejecuta bytecode." },
      { word: "execution", level: "B2", pos: "noun", meaning: "ejecución", phonetic: "/ˌeksɪˈkjuːʃən/", monolingual: "The process of running the instructions of a computer program.", sentence: "Execution starts in the main method.", sentenceTranslation: "La ejecución comienza en el método main." },
    ], config);
    prototypeWords = candidates;
    await updateVocabularySession(vocabularySessionKey(course, lesson, config.targetLang), previous => previous && !previous.demo && previous.candidates.length ? previous : { course, lesson, config, candidates, selected: [], demo: false, exports: previous?.exports ?? [] });
  }
  if (!localStorage.getItem("kinema_prototype_history_seeded")) {
    // Mismos ids que historyService (slugify del nombre): así el curso de la demo
    // no aparece dos veces (antes «prototype-java» y el real eran dos cursos).
    // La lección abierta en la demo («What is Java & JVM?») la crea el propio estudio.
    const records = [
      { courseId: slugify(course), lectureId: slugify("Types and variables"), courseName: course, lectureName: "Types and variables", ankiCardsCount: 5 },
      { courseId: slugify("React & TypeScript Masterclass"), lectureId: slugify("Understanding React hooks"), courseName: "React & TypeScript Masterclass", lectureName: "Understanding React hooks", ankiCardsCount: 6 },
    ];
    for (const record of records) {
      const key = `usb_history_lecture::${record.courseId}::${record.lectureId}`;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ ...record, startedAt: Date.now() - 86400000, updatedAt: Date.now(), exportedAt: Date.now(), status: "completed", questions: [] }));
    }
    localStorage.setItem("kinema_prototype_history_seeded", "1");
  }
  // Ejemplos de los tres estados de Anki en el historial (con tarjetas reales para poder descargarlas).
  if (!localStorage.getItem("kinema_prototype_history_states_v1")) {
    const cards = (topic: string) => [
      { front: `¿Qué es ${topic}?`, back: `Definición breve de ${topic}.`, tags: ["kinema"], type: "concepto" },
      { front: `¿Para qué sirve ${topic}?`, back: `Uso principal de ${topic} en Java.`, tags: ["kinema"], type: "aplicacion" },
      { front: `Error común con ${topic}`, back: `Confundirlo con un concepto cercano.`, tags: ["kinema"], type: "entrevista" },
      { front: `Ejemplo de ${topic}`, back: `Un fragmento mínimo que lo muestra.`, tags: ["kinema"], type: "codigo" },
    ];
    const now = Date.now();
    const examples = [
      { lectureId: "operators", lectureName: "Operators & Expressions", status: "completed", confidence: "clear", exportedAt: undefined, topic: "un operador" },
      { lectureId: "control-flow", lectureName: "Control flow: if & switch", status: "completed", confidence: "mastered", exportedAt: now - 3600000, topic: "switch" },
      { lectureId: "loops", lectureName: "Loops: for & while", status: "in_progress", confidence: "partial", exportedAt: undefined, topic: "un bucle" },
    ];
    for (const ex of examples) {
      const lectureId = slugify(ex.lectureName);
      const key = `usb_history_lecture::${slugify(course)}::${lectureId}`;
      const ankiCards = cards(ex.topic);
      localStorage.setItem(key, JSON.stringify({
        courseId: slugify(course), lectureId, courseName: course, lectureName: ex.lectureName,
        startedAt: now - 7200000, updatedAt: now, exportedAt: ex.exportedAt, status: ex.status, confidence: ex.confidence,
        questions: [], ankiCards, ankiCardsCount: ankiCards.length,
      }));
    }
    localStorage.setItem("kinema_prototype_history_states_v1", "1");
  }
  // Fase 4: una lección ya exportada cuyas ideas repite «JIT y rendimiento en
  // caliente» (demo de «ideas que ya estaban en tu mazo»). Exportada y a medias:
  // no cambia la lección de la demo ni pide nota de Obsidian.
  if (!localStorage.getItem("kinema_prototype_history_deck_v1")) {
    const now = Date.now();
    const lectureName = "Arquitectura de la JVM";
    const key = `usb_history_lecture::${slugify(course)}::${slugify(lectureName)}`;
    const keyConcepts = [
      "Qué es un hot spot — un método que se ejecuta tantas veces que el JIT lo compila a código nativo",
      "Para qué sirve el warm-up — la JVM ejecuta un rato antes de que el JIT optimice lo que más se usa",
      "Qué guarda el heap — los objetos creados con new viven en el heap y los libera el recolector",
    ];
    const ankiCards = [
      { id: "card-001", type: "concepto", conceptRefs: [0], tags: ["java", "jit"], isHtml: true, front: "¿Qué es un <em>hot spot</em> para el JIT?", back: "<p><b>Un método que se ejecuta muchas veces</b>: el JIT lo compila a nativo y reutiliza el resultado.</p>" },
      { id: "card-002", type: "concepto", conceptRefs: [1], tags: ["java", "jit"], isHtml: true, front: "¿Por qué una app Java va más rápida tras unos minutos (warm-up)?", back: "<p><b>Porque el JIT ya compiló a nativo lo que más se ejecuta.</b> Al arrancar, la JVM solo interpreta.</p>" },
      { id: "card-003", type: "concepto", conceptRefs: [2], tags: ["java", "memoria"], isHtml: true, front: "¿Dónde viven los objetos creados con <code>new</code>?", back: "<p><b>En el heap</b>; el recolector de basura los libera cuando nadie los referencia.</p>" },
    ];
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      courseId: slugify(course), lectureId: slugify(lectureName), courseName: course, lectureName,
      startedAt: now - 2 * 86400000, updatedAt: now - 2 * 86400000, exportedAt: now - 2 * 86400000,
      status: "in_progress", confidence: "partial", questions: [], ankiCards, ankiCardsCount: ankiCards.length,
      ankiDeck: `Kinema::Courses::${course}`,
      studyContent: {
        relevance: { score: 80, reason: "Base del rendimiento de Java." }, keyConcepts, conceptTerms: ["JIT", "heap", "hot spot"],
        questions: [
          { q: "¿Qué es un hot spot para el JIT?", bloom: "comprender", difficulty: "confused", conceptRefs: [0], hint: "Cuántas veces se ejecuta", answer: "Un método que se ejecuta tantas veces que el JIT lo compila a nativo." },
          { q: "¿Para qué necesita la JVM un warm-up?", bloom: "comprender", difficulty: "partial", conceptRefs: [1], hint: "El JIT aún no actuó", answer: "Para que el JIT detecte y compile lo que más se usa." },
          { q: "¿Dónde viven los objetos creados con new y quién los libera?", bloom: "comprender", difficulty: "partial", conceptRefs: [2], hint: "Memoria gestionada", answer: "En el heap; los libera el recolector de basura." },
          { q: "¿Por qué una prueba de rendimiento de 1 segundo engaña en Java?", bloom: "analizar", difficulty: "mastered", conceptRefs: [0, 1], hint: "Warm-up", answer: "Mide sobre todo código interpretado: el JIT aún no compiló los hot spots." },
        ],
        application: { isCode: false, setup: "Tu servicio tarda más en la primera petición.", challenge: "Explica por qué la primera petición es más lenta.", solution: "La JVM aún interpreta; tras el warm-up el JIT compila los hot spots." },
        interviewQ: null, nextAction: "Mira con -XX:+PrintCompilation qué compila el JIT al arrancar tu app.", ankiCards,
      },
    }));
    localStorage.setItem("kinema_prototype_history_deck_v1", "1");
  }
}
