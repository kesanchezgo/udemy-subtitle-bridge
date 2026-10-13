import { chromeStorage } from "./chromeStorage";
import { loadVocabConfig } from "./vocabularyService";
import { prepareVocabularyCandidates, updateVocabularySession, vocabularySessionKey } from "./vocabularySession";
import type { VocabularyWord } from "../../shared/prompts";

let prototypeWords: VocabularyWord[] | null = null;

export function prototypeVocabulary(targetLang: string): { words: VocabularyWord[]; partial: boolean } | null {
  const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime;
  return prototypeWords && targetLang === "en" && !runtime?.sendMessage ? { words: prototypeWords, partial: false } : null;
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
    const records = [
      { courseId: "prototype-java", lectureId: "jvm", courseName: course, lectureName: "What is Java & JVM?", ankiCardsCount: 3 },
      { courseId: "prototype-java", lectureId: "types", courseName: course, lectureName: "Types and variables", ankiCardsCount: 5 },
      { courseId: "prototype-react", lectureId: "hooks", courseName: "React & TypeScript Masterclass", lectureName: "Understanding React hooks", ankiCardsCount: 6 },
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
      const key = `usb_history_lecture::prototype-java::${ex.lectureId}`;
      const ankiCards = cards(ex.topic);
      localStorage.setItem(key, JSON.stringify({
        courseId: "prototype-java", lectureId: ex.lectureId, courseName: course, lectureName: ex.lectureName,
        startedAt: now - 7200000, updatedAt: now, exportedAt: ex.exportedAt, status: ex.status, confidence: ex.confidence,
        questions: [], ankiCards, ankiCardsCount: ankiCards.length,
      }));
    }
    localStorage.setItem("kinema_prototype_history_states_v1", "1");
  }
}
