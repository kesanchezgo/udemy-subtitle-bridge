import { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import { motion } from 'motion/react';
import { Eye } from 'lucide-react';
import { usePersistedState } from '../hooks/usePersistedState';
import { contentBridge } from '../services/contentBridge';
import {
  BrainIcon,
  CheckIcon,
  FileDownIcon,
  FlipIcon,
  InfoIcon,
  PackageIcon,
  LoaderIcon,
  PlayIcon,
  RotateIcon,
  SendIcon,
  SparklesIcon,
  TargetIcon,
  WandIcon
} from './icons';

type StudyStage = 'objective' | 'generating' | 'result';
type GoalId = 'spring-senisenior' | 'java-cert' | 'personal-project' | 'fullstack' | 'custom';
type ConfidenceLevel = 'confused' | 'partial' | 'clear' | 'mastered';

type StudyPayload = {
  relevance?: { score: number; reason: string };
  keyConcepts?: string[];
  quickWin?: string;
  questions?: Array<{ q: string; bloomLevel?: string; hint?: string; answer?: string }>;
  application?: { isCode?: boolean; setup?: string; challenge?: string; solution?: string };
  interviewQ?: { q: string; idealAnswer?: string };
  nextAction?: string;
  ankiCards?: Array<{ front: string; back: string; tag?: string }>;
};

const GOALS = [
  {
    id: 'spring-senisenior',
    label: 'Entrevista Spring Boot',
    sublabel: 'Semi-Senior',
    accent: 'violet'
  },
  {
    id: 'java-cert',
    label: 'Certificación Java SE',
    sublabel: 'Oracle OCP',
    accent: 'amber'
  },
  {
    id: 'personal-project',
    label: 'Proyecto Personal',
    sublabel: 'App real',
    accent: 'emerald'
  },
  {
    id: 'fullstack',
    label: 'Full Stack Dev',
    sublabel: 'Java + React',
    accent: 'sky'
  }
] as const;

const STEPS = [
  'Analizando la transcripción…',
  'Identificando conceptos clave…',
  'Calibrando preguntas a tu objetivo…',
  'Generando escenario de aplicación real…',
  'Creando tarjetas Anki optimizadas…'
];

const CONFIDENCE_OPTIONS: Array<{
  id: ConfidenceLevel;
  emoji: string;
  label: string;
  description: string;
}> = [
  { id: 'confused', emoji: '😕', label: 'Confuso', description: 'No quedó claro' },
  { id: 'partial', emoji: '🤔', label: 'Más o menos', description: 'Algunos gaps' },
  { id: 'clear', emoji: '👍', label: 'Entendido', description: 'Lo capté bien' },
  { id: 'mastered', emoji: '🔥', label: 'Lo domino', description: 'Sin dudas' }
];

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  confused: 'usb-confidence-confused',
  partial: 'usb-confidence-partial',
  clear: 'usb-confidence-clear',
  mastered: 'usb-confidence-mastered'
};

const BLOOM_BY_CONFIDENCE: Record<ConfidenceLevel, string> = {
  confused: 'Recordar',
  partial: 'Comprender',
  clear: 'Aplicar',
  mastered: 'Analizar'
};

const DIFFICULTY_LABEL: Record<ConfidenceLevel, string> = {
  confused: 'Baja',
  partial: 'Media',
  clear: 'Alta',
  mastered: 'Avanzada'
};

const BLOOM_STYLE: Record<ConfidenceLevel, string> = {
  confused: 'border-red-500/20 bg-red-500/10 text-red-400',
  partial: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  clear: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  mastered: 'border-violet-500/20 bg-violet-500/10 text-violet-400',
};

const FLOW_STEPS = ['Mi nivel', 'Lo que vi', '¿Lo sé?', 'Practícalo', 'No olvidar'] as const;

const FALLBACK_QUESTION = {
  q: '¿Qué es la JVM y qué tiene que ver con Spring Boot? Explícalo en tus propias palabras, sin leer nada.',
  hint: 'Piensa en la JVM como la máquina que ejecuta bytecode y en Spring Boot como lo que arranca dentro de ella.',
  answer: 'La JVM es el motor de ejecución de Java. Spring Boot arranca dentro de la JVM: crea el ApplicationContext en el heap, escanea beans y levanta Tomcat. Si el heap se llena de objetos sin liberar, aparece OutOfMemoryError y la app puede caer.'
};

const FALLBACK_APPLICATION = {
  setup: 'Encuentra los 2 bugs de tipo en este código de producción:',
  challenge: `@Service
public class AuthService {
    @Value("\${app.admin.role}")
    private String adminRole;

    private int failedAttempts = 0;

    public boolean isAdmin(String role) {
        return role == adminRole;
    }

    public void registerFail() {
        failedAttempts++;
    }
}`,
  solution: 'Bug #1: failedAttempts++ no es atómico en un singleton compartido por todos los threads. Bug #2: == compara referencias y no valores para Strings. Usa AtomicInteger y .equals().'
};

function getFeedbackLineClass(line: string) {
  const normalized = line.trim();
  if (normalized.startsWith('✅')) return 'text-emerald-300';
  if (normalized.startsWith('❌')) return 'text-red-300';
  if (normalized.startsWith('⚠️')) return 'text-amber-300';
  if (normalized.startsWith('💡')) return 'text-sky-300';
  if (normalized.startsWith('🎯')) return 'text-violet-300';
  if (normalized.startsWith('🔁')) return 'text-fuchsia-300';
  if (normalized.startsWith('🚀')) return 'text-emerald-400';
  return 'text-white/80';
}

function StepConnectorLine({ filled }: { filled: boolean }) {
  return (
    <div className="relative mx-1 mb-4 h-px flex-1 overflow-hidden bg-white/5">
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-emerald-500/50 to-emerald-400/80 origin-left"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: filled ? 1 : 0 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      />
    </div>
  );
}

function StudyStepBadge({
  index,
  label,
  status,
}: {
  index: number;
  label: string;
  status: 'pending' | 'active' | 'done';
}) {
  return (
    <div className="usb-study-step relative flex min-w-0 flex-1 flex-col items-center gap-1">
      {status === 'active' ? (
        <motion.div
          layoutId="usb-study-active-glow"
          className="absolute top-0 h-8 w-8 rounded-full bg-violet-500/20 blur-xl pointer-events-none"
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        />
      ) : null}
      <div className="flex w-full items-center">
        {index > 0 ? <StepConnectorLine filled={status !== 'pending'} /> : null}
        <div
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] font-semibold transition-all ${
            status === 'done'
              ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
              : status === 'active'
                ? 'border-violet-500/40 bg-violet-500/12 text-violet-300 shadow-[0_0_8px_rgba(139,92,246,0.3)]'
                : 'border-white/10 bg-white/5 text-white/22'
          }`}
        >
          {status === 'done' ? <CheckIcon className="h-2.5 w-2.5" /> : index + 1}
        </div>
        {index < FLOW_STEPS.length - 1 ? <StepConnectorLine filled={status === 'done'} /> : null}
      </div>
      <span className={`mt-1 text-center text-[9px] uppercase tracking-[0.14em] ${status === 'done' ? 'text-emerald-400/70 font-medium' : status === 'active' ? 'text-violet-300/90 font-medium' : 'text-white/20'}`}>
        {label}
      </span>
    </div>
  );
}

function StepHeader({
  index,
  label,
  status,
  subtitle,
}: {
  index: number;
  label: string;
  status: 'pending' | 'active' | 'done';
  subtitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <div
          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] font-semibold ${
            status === 'done'
              ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-400'
              : status === 'active'
                ? 'border-violet-500/40 bg-violet-500/12 text-violet-300'
                : 'border-white/10 bg-white/5 text-white/22'
          }`}
        >
          {status === 'done' ? <CheckIcon className="h-2.5 w-2.5" /> : index}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/58">{label}</div>
          {subtitle ? <p className="mt-0.5 text-[10px] leading-relaxed text-white/30">{subtitle}</p> : null}
        </div>
      </div>
      {status === 'pending' ? <span className="rounded-full border border-white/8 bg-white/3 px-2 py-0.5 text-[8px] uppercase tracking-[0.16em] text-white/24">Bloqueado</span> : null}
    </div>
  );
}

interface ChromeApiSubset {
  runtime: {
    sendMessage: (message: Record<string, unknown>, callback: (response: Record<string, unknown>) => void) => void;
    lastError?: { message?: string };
  };
  tabs: {
    query: (queryInfo: Record<string, unknown>, callback: (tabs: { id?: number }[]) => void) => void;
    sendMessage: (tabId: number, message: Record<string, unknown>, callback: (response: Record<string, unknown>) => void) => void;
  };
}

function getChromeApi(): ChromeApiSubset | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeApiSubset }).chrome;
}

async function fetchTranscriptFromContentScript(): Promise<{ text: string; lectureTitle?: string; courseSlug?: string; lectureKey?: string } | null> {
  const chromeApi = getChromeApi();
  if (!chromeApi?.tabs?.query || !chromeApi?.tabs?.sendMessage) {
    // Sidebar context: use contentBridge
    return new Promise((resolve) => {
      const cleanup = contentBridge.onMessageFromContent((message) => {
        if (message.type === 'TRANSCRIPT_RESULT') {
          cleanup();
          const payload = message.payload as { text?: string; lectureTitle?: string; courseSlug?: string; lectureKey?: string } | undefined;
          if (payload?.text) {
            resolve({ text: payload.text, lectureTitle: payload.lectureTitle, courseSlug: payload.courseSlug, lectureKey: payload.lectureKey });
          } else {
            resolve(null);
          }
        }
      });

      contentBridge.sendToContent({ type: 'GET_TRANSCRIPT', payload: { maxChars: 22000 } }).catch(() => {
        cleanup();
        resolve(null);
      });

      setTimeout(() => { cleanup(); resolve(null); }, 8000);
    });
  }

  return new Promise((resolve) => {
    chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs: { id?: number }[]) => {
      const tabId = tabs?.[0]?.id;
      if (!tabId) {
        resolve(null);
        return;
      }

      chromeApi.tabs.sendMessage(tabId, { type: 'USG_GET_STUDY_TRANSCRIPT', maxChars: 22000 }, (response: { ok?: boolean; transcriptText?: string; lectureTitle?: string; courseSlug?: string; lectureKey?: string }) => {
        if (chromeApi.runtime.lastError || !response?.ok || !response.transcriptText) {
          resolve(null);
          return;
        }
        resolve({ text: response.transcriptText, lectureTitle: response.lectureTitle, courseSlug: response.courseSlug, lectureKey: response.lectureKey });
      });
    });
  });
}

async function requestLearningPanel(transcriptText: string, metadata: { courseSlug: string; lectureKey: string; lectureId: string }): Promise<StudyPayload | null> {
  const chromeApi = getChromeApi();
  if (!chromeApi?.runtime?.sendMessage) {
    return null;
  }

  return new Promise((resolve) => {
    chromeApi.runtime.sendMessage(
      {
        type: 'USG_GENERATE_LEARNING_PANEL',
        transcriptText,
        courseSlug: metadata.courseSlug,
        lectureKey: metadata.lectureKey,
        lectureId: metadata.lectureId
      },
      (response: { ok?: boolean; payload?: StudyPayload; error?: string }) => {
        if (chromeApi.runtime.lastError || !response?.ok) {
          resolve(null);
          return;
        }
        resolve(response.payload || null);
      }
    );
  });
}

export function StudyAgentTab() {
  const [goal, setGoal] = usePersistedState<GoalId>('usg.study.goal', GOALS[0].id);
  const [objective, setObjective] = usePersistedState('usg.study.objective', 'Entrevista Spring Boot semi-senior');
  const [courseName, setCourseName] = usePersistedState<string>('agent_course_name', 'Java In-Depth - Udemy');
  const [lessonName, setLessonName] = usePersistedState<string>('agent_lesson_name', '02 - JVM y Tipos de Datos');
  const [stage, setStage] = useState<StudyStage>('objective');
  const [generationStep, setGenerationStep] = useState(-1);
  const [refined, setRefined] = useState(false);
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [studentAnswer, setStudentAnswer] = useState('');
  const [evalStreaming, setEvalStreaming] = useState(false);
  const [evalAccumulated, setEvalAccumulated] = useState('');
  const evalAbortRef = useRef<AbortController | null>(null);
  const [evalRating, setEvalRating] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showQuestionAnswer, setShowQuestionAnswer] = useState(false);
  const [ankiFlipped, setAnkiFlipped] = useState(false);
  const [currentAnkiIndex, setCurrentAnkiIndex] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [codeAnswer, setCodeAnswer] = useState('');
  const [codeReviewStreaming, setCodeReviewStreaming] = useState(false);
  const [codeReviewAccumulated, setCodeReviewAccumulated] = useState('');
  const [codeReviewRating, setCodeReviewRating] = useState<string | null>(null);
  const codeReviewAbortRef = useRef<AbortController | null>(null);

  const [studyData, setStudyData] = useState<StudyPayload | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const activeQuestion = useMemo(() => {
    if (studyData?.questions?.length) {
      return studyData.questions[currentQuestionIndex] || studyData.questions[0];
    }
    return FALLBACK_QUESTION;
  }, [studyData, currentQuestionIndex]);

  const activeApplication = useMemo(() => {
    if (studyData?.application?.challenge) {
      return studyData.application;
    }
    return FALLBACK_APPLICATION;
  }, [studyData]);

  const activeAnkiCards = useMemo(() => {
    if (studyData?.ankiCards?.length) {
      return studyData.ankiCards;
    }
    return [{ front: '¿Qué pasa en el heap de la JVM cuando Spring Boot arranca?', back: 'Spring crea el ApplicationContext en el heap, instancia beans singleton y levanta Tomcat. Si el heap se llena, aparece OutOfMemoryError.', tag: 'Spring Boot' }];
  }, [studyData]);

  const activeAnkiCard = activeAnkiCards[currentAnkiIndex] || activeAnkiCards[0];

  useEffect(() => {
    if (stage !== 'generating') {
      setGenerationStep(-1);
      return;
    }

    setGenerationStep(0);

    const stepTimers = STEPS.map((_, index) => window.setTimeout(() => setGenerationStep(index), index * 420));

    return () => {
      stepTimers.forEach((stepTimer) => window.clearTimeout(stepTimer));
    };
  }, [stage]);

  const activeGoal = useMemo(() => GOALS.find((item) => item.id === goal) ?? GOALS[0], [goal]);
  const currentStep = useMemo(() => {
    // Step 1: Conceptos — always done once we reach result phase
    // Step 2: Calibrar — done when confidence is selected
    if (!confidence) return 2;
    // Step 3: Verificar — done when evaluation answer is received
    if (!evalAccumulated) return 3;
    // Step 4: Aplicar — done when code review received or solution viewed
    if (!codeReviewAccumulated && !showSolution) return 4;
    // Step 5: Anki
    return 5;
  }, [confidence, evalAccumulated, codeReviewAccumulated, showSolution]);

  const startGeneration = async () => {
    setStage('generating');
    setGenerationStep(0);
    setRefined(false);
    setConfidence(null);
    setStudentAnswer('');
    setEvalStreaming(false);
    setEvalAccumulated('');
    setEvalRating(null);
    setShowSolution(false);
    setShowHint(false);
    setShowQuestionAnswer(false);
    setAnkiFlipped(false);
    setGenerationError(null);
    setStudyData(null);
    setCurrentQuestionIndex(0);
    setCurrentAnkiIndex(0);
    setCodeAnswer('');
    setCodeReviewStreaming(false);
    setCodeReviewAccumulated('');
    setCodeReviewRating(null);

    try {
      const transcript = await fetchTranscriptFromContentScript();

      if (transcript?.text) {
        if (transcript.lectureTitle && transcript.lectureTitle !== lessonName) {
          setLessonName(transcript.lectureTitle);
        }
        if (transcript.courseSlug && transcript.courseSlug !== courseName) {
          setCourseName(transcript.courseSlug);
        }

        const panel = await requestLearningPanel(transcript.text, {
          courseSlug: transcript.courseSlug || courseName,
          lectureKey: transcript.lectureKey || '',
          lectureId: transcript.lectureKey || ''
        });

        if (panel) {
          setStudyData(panel);
        } else {
          setGenerationError('No se pudo generar el panel de aprendizaje. Se usarán preguntas de ejemplo.');
        }
      } else {
        setGenerationError('No hay transcripción disponible. Reproduce el video con subtítulos en inglés activados. Se usarán preguntas de ejemplo.');
      }
    } catch (_error) {
      setGenerationError('Error al obtener transcripción. Se usarán preguntas de ejemplo.');
    }

    setStage('result');
  };

  return (
    <div className="usb-study flex-1 min-h-0 overflow-y-auto pr-1 pb-3">
      <article className="usb-study-hero-card">
        <div className="usb-hero-logo">
          <BrainIcon className="usb-hero-icon" />
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="usb-hero-title">Tutor IA · Study Agent</div>
          <div className="usb-hero-desc">5–8 min por video. Preguntas adaptadas a tu nivel. Retención garantizada con Anki.</div>
        </div>
      </article>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2.5">
        <span className="flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-violet-300">
          <SparklesIcon className="h-3 w-3" />
          Sesión activa
        </span>
        <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-white/55">
          Objetivo · {activeGoal.label}
        </span>
        <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-white/55">
          Curso · {courseName}
        </span>
        <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-white/55">
          Clase · {lessonName}
        </span>
      </div>

      {stage === 'objective' ? (
        <>
          <div className="usb-goal-grid">
            {GOALS.map((item) => {
              const isActive = item.id === goal;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`usb-goal-card usb-accent-${item.accent} ${isActive ? 'is-active' : ''}`}
                  onClick={() => setGoal(item.id)}
                >
                  <span className="usb-goal-emoji">{item.id === 'spring-senisenior' ? '🚀' : item.id === 'java-cert' ? '🏆' : item.id === 'personal-project' ? '🛠' : '⚡'}</span>
                  <strong className="usb-goal-title">{item.label}</strong>
                  <span className="usb-goal-small">{item.sublabel}</span>
                  {isActive ? <CheckIcon className="usb-goal-check" /> : null}
                </button>
              );
            })}
          </div>

          <textarea
            className="usb-custom-objective"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="Ej. Conseguir trabajo en fintech como Java dev en 3 meses…"
          />

          <button type="button" className="usb-refine-btn" onClick={() => setRefined((current) => !current)}>
            <SparklesIcon className="usb-btn-icon" />
            {refined ? 'Objetivo refinado' : 'Refinar con IA'}
          </button>

          {refined ? (
            <div className="usb-refined-box">
              <CheckIcon className="usb-refined-icon" />
              <p>Objetivo refinado para <strong>{activeGoal.label}</strong>: {objective}</p>
            </div>
          ) : null}

          <div className="usb-course-inputs">
            <label>
              <TargetIcon className="usb-label-icon" />
              Datos del curso
            </label>
            <input className="usb-input" value={courseName} onChange={(event) => setCourseName(event.target.value)} />

            <label>
              <BrainIcon className="usb-label-icon" />
              Nombre del video/clase actual
            </label>
            <input className="usb-input" value={lessonName} onChange={(event) => setLessonName(event.target.value)} />
          </div>

          <button type="button" className="usb-generate-btn" onClick={startGeneration}>
            <WandIcon className="usb-btn-icon" />
            Generar sesión de aprendizaje
          </button>
        </>
      ) : null}

      {stage === 'generating' ? (
        <div className="usb-generating-shell">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="usb-spinner" />
            <div className="usb-generating-title">Preparando tu sesión…</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">IA local + Gemini · calibrado a tu objetivo</div>
          </div>
          <div className="flex w-full flex-col gap-2.5">
            {STEPS.map((step, index) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: index * 0.04 }}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${generationStep === index ? 'border-violet-500/20 bg-violet-500/5' : generationStep > index ? 'border-emerald-500/12 bg-emerald-500/5' : 'border-white/5 bg-white/2'}`}
              >
                <div className={`grid h-5 w-5 place-items-center rounded-full border text-[9px] font-semibold ${generationStep > index ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-400' : generationStep === index ? 'border-violet-500/40 bg-violet-500/12 text-violet-300' : 'border-white/10 bg-white/5 text-white/22'}`}>
                  {generationStep > index ? <CheckIcon className="h-2.5 w-2.5" /> : generationStep === index ? <LoaderIcon className="h-2.5 w-2.5 animate-spin" /> : index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${generationStep > index ? 'text-emerald-400/80' : generationStep === index ? 'text-violet-300' : 'text-white/28'}`}>
                    {step}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-white/24">
                    {index === 0 ? 'Detectando lo importante de la transcripción' : index === 1 ? 'Priorizando conceptos que sí importan' : index === 2 ? 'Ajustando la dificultad a tu nivel' : index === 3 ? 'Preparando el reto práctico' : 'Armando tarjetas para repasar después'}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ) : null}

      {stage === 'result' ? (
        <div className="usb-study-result">
          <div className="usb-progress-stepper flex w-full items-start gap-0">
            {FLOW_STEPS.map((label, index) => {
              const stepNumber = index + 1;
              const status = stepNumber < currentStep ? 'done' : stepNumber === currentStep ? 'active' : 'pending';
              return <StudyStepBadge key={label} index={index} label={label} status={status} />;
            })}
          </div>

          {generationError ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[10px] leading-relaxed text-amber-300/80">
              <span className="mr-1">⚠️</span> {generationError}
            </div>
          ) : null}

          <section className="usb-relevance-card">
            <InfoIcon className="usb-card-info" />
            <div className="usb-relevance-score">{studyData?.relevance?.score ?? 88}<span>%</span></div>
            <p className="usb-relevance-text">{studyData?.relevance?.reason || 'Cimientos críticos. Spring Boot vive dentro de la JVM — sin esto, el resto del curso es memorizar sin entender.'}</p>
          </section>

          <section className="usb-result-card">
            <StepHeader index={1} label="Lo que vi" status="done" subtitle="Asegura la base antes de pasar a las preguntas." />
            {(studyData?.keyConcepts || ['La JVM ejecuta Spring Boot y su ApplicationContext vive en el heap.', 'int nunca es null; Integer sí puede serlo y puede fallar en colecciones.', '== compara referencias; .equals() compara valores.']).map((concept) => (
              <label key={concept} className="usb-check-item">
                <span className="usb-check-box"><CheckIcon className="usb-check-mark" /></span>
                <span>{concept}</span>
              </label>
            ))}
          </section>

          <section className="usb-result-card usb-confidence-card">
            <StepHeader index={2} label="Mi nivel" status={currentStep > 2 ? 'done' : currentStep === 2 ? 'active' : 'pending'} subtitle="Elige tu nivel para calibrar el siguiente paso del plan de estudio." />
            <div className="usb-confidence-grid">
              {CONFIDENCE_OPTIONS.map((item) => {
                const isActive = confidence === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`usb-confidence-card-btn ${CONFIDENCE_STYLES[item.id]} ${isActive ? 'is-active' : ''}`}
                    onClick={() => setConfidence(item.id)}
                  >
                    <span className="usb-confidence-emoji">{item.emoji}</span>
                    <strong className="usb-confidence-label">{item.label}</strong>
                    <span className="usb-confidence-desc">{item.description}</span>
                  </button>
                );
              })}
            </div>
            {confidence ? (
              <div className="usb-confidence-status">
                <CheckIcon className="usb-confidence-status-icon" />
                <span>Calibración actual: <strong>{CONFIDENCE_OPTIONS.find((item) => item.id === confidence)?.label}</strong>.</span>
              </div>
            ) : null}
          </section>

          <section className="usb-result-card usb-quiz-card">
            <StepHeader index={3} label="¿Lo sé?" status={currentStep > 3 ? 'done' : currentStep === 3 ? 'active' : 'pending'} subtitle="Responde, mira la pista o revisa la respuesta si te trabas." />
            <div className="usb-quiz-badges">
              <div className={`usb-bloom-badge ${confidence ? BLOOM_STYLE[confidence] : 'border-white/10 bg-white/5 text-white/40'}`}>Bloom · {confidence ? BLOOM_BY_CONFIDENCE[confidence] : (activeQuestion as { bloomLevel?: string }).bloomLevel || 'Aplicar'}</div>
              {confidence ? <div className={`usb-difficulty-badge ${CONFIDENCE_STYLES[confidence]}`}>{DIFFICULTY_LABEL[confidence]}</div> : null}
            </div>
            {studyData?.questions && studyData.questions.length > 1 ? (
              <div className="flex gap-1 mb-2">
                {studyData.questions.map((_, qIdx) => (
                  <button
                    key={qIdx}
                    type="button"
                    className={`rounded-full border px-2 py-0.5 text-[8px] ${qIdx === currentQuestionIndex ? 'border-violet-500/40 bg-violet-500/12 text-violet-300' : 'border-white/10 bg-white/5 text-white/30'}`}
                    onClick={() => setCurrentQuestionIndex(qIdx)}
                  >
                    P{qIdx + 1}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="usb-question">{activeQuestion.q}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="usb-small-btn" onClick={() => setShowHint((current) => !current)}>
                <InfoIcon className="usb-btn-icon" />
                {showHint ? 'Ocultar pista' : 'Pista'}
              </button>
              <button type="button" className="usb-small-btn usb-muted-btn" onClick={() => setShowQuestionAnswer((current) => !current)}>
                <Eye className="usb-btn-icon" />
                {showQuestionAnswer ? 'Ocultar respuesta' : 'Ver respuesta'}
              </button>
            </div>
            {showHint ? (
              <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 text-[10px] leading-relaxed text-white/42">
                <span className="mr-1 text-sky-300">💡</span>
                {activeQuestion.hint || 'Piensa en los conceptos clave del video y cómo se relacionan entre sí.'}
              </div>
            ) : null}
            {showQuestionAnswer ? (
              <div className="rounded-xl border border-white/6 bg-black/20 px-3 py-2.5 text-[10px] leading-relaxed text-violet-300/75">
                <span className="mr-1 text-emerald-300">🎯</span>
                {activeQuestion.answer || 'Respuesta no disponible.'}
              </div>
            ) : null}
            <textarea className="usb-answer-box" placeholder="Escribe tu respuesta aquí…" value={studentAnswer} onChange={(e) => setStudentAnswer(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="usb-small-btn"
                onClick={async () => {
                  if (evalStreaming) {
                    evalAbortRef.current?.abort();
                    return;
                  }

                  setEvalAccumulated('');
                  setEvalRating(null);
                  setEvalStreaming(true);
                  const ctrl = new AbortController();
                  evalAbortRef.current = ctrl;

                  try {
                    const { evaluateActiveAnswerStream, evaluateActiveAnswer } = await import('../services/localAI');
                    const bloomLevel = confidence ? BLOOM_BY_CONFIDENCE[confidence] : (activeQuestion as { bloomLevel?: string }).bloomLevel || 'Aplicar';
                    const streamRes = await evaluateActiveAnswerStream(activeQuestion.q, activeQuestion.answer || '', studentAnswer || 'Sin respuesta', bloomLevel, (_token, accumulated) => {
                      setEvalAccumulated(accumulated);
                    }, ctrl.signal);

                    if (ctrl.signal.aborted) {
                      return;
                    }

                    if (!streamRes.success || !streamRes.content.trim()) {
                      const fallback = await evaluateActiveAnswer(activeQuestion.q, activeQuestion.answer || '', studentAnswer || 'Sin respuesta', bloomLevel);
                      setEvalAccumulated(fallback.content || 'No disponible');
                      setEvalRating(fallback.rating);
                    } else {
                      setEvalAccumulated(streamRes.content);
                      setEvalRating(streamRes.rating);
                    }
                  } catch (err) {
                    if (ctrl.signal.aborted) {
                      return;
                    }

                    setEvalAccumulated('Error al evaluar con IA');
                  } finally {
                    setEvalStreaming(false);
                    evalAbortRef.current = null;
                  }
                }}
              >
                {evalStreaming ? <LoaderIcon className="usb-btn-icon is-spinning" /> : <SendIcon className="usb-btn-icon" />}
                {evalStreaming ? 'Cancel' : 'Evaluar con IA'}
              </button>
              <button type="button" className="usb-small-btn usb-muted-btn" onClick={() => { setEvalAccumulated('Pregunta omitida por el estudiante.'); setEvalRating('unknown'); }}>
                <PlayIcon className="usb-btn-icon" />
                Continuar sin responder
              </button>
              </div>
            {evalAccumulated ? (
              <div className={`rounded-xl border p-3 ${evalStreaming ? 'border-violet-500/20 bg-violet-500/5' : 'border-white/7 bg-black/20'}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="usb-section-title">Resultado IA</div>
                  {evalRating ? <div className={`rounded-full border px-2 py-0.5 text-[8px] uppercase tracking-[0.14em] ${evalRating === 'correct' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : evalRating === 'partial' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>Rating: {evalRating}</div> : null}
                </div>
                <div className="space-y-1.5">
                  {evalAccumulated.split('\n').filter(Boolean).map((line) => (
                    <p key={line} className={`text-[11px] leading-relaxed ${getFeedbackLineClass(line)}`}>
                      {line}
                    </p>
                  ))}
                  {evalStreaming ? <div className="inline-flex items-center gap-1 text-[10px] text-violet-300"><span className="h-3 w-[3px] rounded-full bg-violet-400 animate-pulse" />analizando…</div> : null}
                </div>
              </div>
            ) : null}
          </section>

          <section className="usb-result-card usb-code-card">
            <StepHeader index={4} label="Practícalo" status={currentStep > 4 ? 'done' : currentStep === 4 ? 'active' : 'pending'} subtitle={activeApplication.setup} />
            <pre className="usb-code-block">{activeApplication.challenge}</pre>
            <textarea className="usb-answer-box usb-code-answer" placeholder="Escribe tu solución o explicación aquí…" value={codeAnswer} onChange={(e) => setCodeAnswer(e.target.value)} />
            <div className="usb-card-actions">
              <button
                type="button"
                className="usb-small-btn"
                onClick={async () => {
                  if (codeReviewStreaming) {
                    codeReviewAbortRef.current?.abort();
                    return;
                  }

                  setCodeReviewAccumulated('');
                  setCodeReviewRating(null);
                  setCodeReviewStreaming(true);
                  const ctrl = new AbortController();
                  codeReviewAbortRef.current = ctrl;

                  try {
                    const { evaluateCodeSolutionStream, evaluateCodeSolution } = await import('../services/localAI');
                    const streamRes = await evaluateCodeSolutionStream(
                      activeApplication.setup || 'Desafío de código',
                      activeApplication.solution || '',
                      codeAnswer || 'Sin respuesta',
                      (_token, accumulated) => { setCodeReviewAccumulated(accumulated); },
                      ctrl.signal
                    );

                    if (ctrl.signal.aborted) return;

                    if (!streamRes.success || !streamRes.content.trim()) {
                      const fallback = await evaluateCodeSolution(
                        activeApplication.setup || 'Desafío de código',
                        activeApplication.solution || '',
                        codeAnswer || 'Sin respuesta'
                      );
                      setCodeReviewAccumulated(fallback.content || 'No disponible');
                      setCodeReviewRating(fallback.rating);
                    } else {
                      setCodeReviewAccumulated(streamRes.content);
                      setCodeReviewRating(streamRes.rating);
                    }
                  } catch (_err) {
                    if (ctrl.signal.aborted) return;
                    setCodeReviewAccumulated('Error al evaluar con IA');
                  } finally {
                    setCodeReviewStreaming(false);
                    codeReviewAbortRef.current = null;
                  }
                }}
              >
                {codeReviewStreaming ? <LoaderIcon className="usb-btn-icon is-spinning" /> : <CheckIcon className="usb-btn-icon" />}
                {codeReviewStreaming ? 'Cancel' : 'Enviar para code review'}
              </button>
              <button type="button" className={`usb-small-btn usb-muted-btn ${showSolution ? 'is-active' : ''}`} onClick={() => setShowSolution((current) => !current)}>
                <FlipIcon className="usb-btn-icon" />
                {showSolution ? 'Ocultar solución' : 'Ver solución'}
              </button>
            </div>
            {codeReviewAccumulated ? (
              <div className={`rounded-xl border p-3 ${codeReviewStreaming ? 'border-violet-500/20 bg-violet-500/5' : 'border-white/7 bg-black/20'}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="usb-section-title">Code Review IA</div>
                  {codeReviewRating ? <div className={`rounded-full border px-2 py-0.5 text-[8px] uppercase tracking-[0.14em] ${codeReviewRating === 'correct' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : codeReviewRating === 'partial' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>Rating: {codeReviewRating}</div> : null}
                </div>
                <div className="space-y-1.5">
                  {codeReviewAccumulated.split('\n').filter(Boolean).map((line) => (
                    <p key={line} className={`text-[11px] leading-relaxed ${getFeedbackLineClass(line)}`}>
                      {line}
                    </p>
                  ))}
                  {codeReviewStreaming ? <div className="inline-flex items-center gap-1 text-[10px] text-violet-300"><span className="h-3 w-[3px] rounded-full bg-violet-400 animate-pulse" />analizando…</div> : null}
                </div>
              </div>
            ) : null}
            {showSolution ? (
              <div className="usb-solution-box">
                <div className="usb-solution-title">Solución</div>
                <p>{activeApplication.solution}</p>
              </div>
            ) : null}
          </section>

          <section className="usb-anki-strip">
            <div className="mb-2.5">
              <StepHeader
                index={5}
                label="No olvidar"
                status={currentStep === 5 ? 'active' : 'pending'}
                subtitle="Repasa las tarjetas y exporta el paquete final para fijarlo en memoria."
              />
            </div>
            <div className="usb-anki-toprow">
              <span className="usb-anki-chip">{currentAnkiIndex + 1} de {activeAnkiCards.length}</span>
              <span className="usb-anki-chip usb-anki-chip-alt">{activeAnkiCard.tag || 'Spring Boot'}</span>
            </div>
            <div className="usb-anki-stage" onClick={() => setAnkiFlipped((current) => !current)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setAnkiFlipped((current) => !current); } }}>
              <div className={`usb-anki-card ${ankiFlipped ? 'is-flipped' : ''}`}>
                <div className="usb-anki-front">
                  <span className="usb-anki-label">Flashcard</span>
                  <p>{activeAnkiCard.front}</p>
                  <span className="usb-anki-hint"><FlipIcon className="usb-btn-icon" /> Toca para voltear</span>
                </div>
                <div className="usb-anki-back">
                  <span className="usb-anki-label usb-anki-label-alt">Respuesta</span>
                  <p>{activeAnkiCard.back}</p>
                </div>
              </div>
            </div>
            <div className="usb-anki-dots" aria-hidden="true">
              {activeAnkiCards.map((_, dotIdx) => (
                <span
                  key={dotIdx}
                  className={dotIdx === currentAnkiIndex ? 'is-active' : ''}
                  onClick={() => { setCurrentAnkiIndex(dotIdx); setAnkiFlipped(false); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setCurrentAnkiIndex(dotIdx); setAnkiFlipped(false); } }}
                />
              ))}
            </div>
            <div className="usb-anki-actions">
              <button
                type="button"
                className="usb-small-btn"
                onClick={() => {
                  const cards = activeAnkiCards;
                  const text = cards.map((c, i) => `Card ${i + 1}\nQ: ${c.front}\nA: ${c.back}\nTag: ${c.tag || 'general'}\n`).join('\n');
                  const blob = new Blob([text], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'anki-cards.txt';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <FileDownIcon className="usb-btn-icon" />
                Exportar .txt
              </button>
              <button
                type="button"
                className="usb-small-btn usb-primary-btn"
                onClick={async () => {
                  const cards = activeAnkiCards;
                  try {
                    const { buildAnkiApkg, downloadApkg } = await import('../services/ankiApkg');
                    const apkgData = await buildAnkiApkg(
                      cards.map(c => ({ front: c.front, back: c.back, tags: [c.tag || 'SubtitleBridge'] })),
                      `SubtitleBridge - ${courseName}`,
                      '.card { font-family: -apple-system, sans-serif; font-size: 16px; text-align: center; padding: 20px; }',
                      '{{Front}}',
                      '{{FrontSide}}<hr id=answer>{{Back}}'
                    );
                    downloadApkg(apkgData, `subtitle-bridge-${Date.now()}.apkg`);
                  } catch (_err) {
                    // silently fail
                  }
                }}
              >
                <PackageIcon className="usb-btn-icon" />
                Exportar .apkg
              </button>
            </div>
          </section>

          <button type="button" className="usb-small-btn usb-muted-btn mt-3" onClick={() => { setStage('objective'); setStudyData(null); setGenerationError(null); }}>
            <RotateIcon className="usb-btn-icon" />
            Nueva sesión
          </button>
        </div>
      ) : null}
    </div>
  );
}
