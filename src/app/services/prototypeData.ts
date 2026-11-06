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
}
