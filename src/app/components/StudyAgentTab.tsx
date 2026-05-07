import { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import { motion } from 'motion/react';
import { Eye } from 'lucide-react';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  BrainIcon,
  CheckIcon,
  CircleIcon,
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

const FLOW_STEPS = ['Autocalibrar', 'Conceptos', 'Verificar', 'Aplicar', 'Anki'] as const;

const STUDY_QUESTION = {
  q: '¿Qué es la JVM y qué tiene que ver con Spring Boot? Explícalo en tus propias palabras, sin leer nada.',
  hint: 'Piensa en la JVM como la máquina que ejecuta bytecode y en Spring Boot como lo que arranca dentro de ella.',
  answer: 'La JVM es el motor de ejecución de Java. Spring Boot arranca dentro de la JVM: crea el ApplicationContext en el heap, escanea beans y levanta Tomcat. Si el heap se llena de objetos sin liberar, aparece OutOfMemoryError y la app puede caer.'
};

const STUDY_APPLICATION = {
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
    <div className="usb-study-step flex min-w-0 flex-1 flex-col items-center gap-1">
      <div className="flex w-full items-center">
        {index > 0 ? <div className={`h-px flex-1 ${status === 'pending' ? 'bg-white/5' : 'bg-gradient-to-r from-emerald-500/45 via-violet-500/45 to-emerald-400/65'}`} /> : null}
        <div
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] font-semibold transition-all ${
            status === 'done'
              ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-400'
              : status === 'active'
                ? 'border-violet-500/40 bg-violet-500/12 text-violet-300'
                : 'border-white/10 bg-white/5 text-white/22'
          }`}
        >
          {status === 'done' ? <CheckIcon className="h-2.5 w-2.5" /> : index + 1}
        </div>
        {index < FLOW_STEPS.length - 1 ? <div className={`h-px flex-1 ${status === 'pending' ? 'bg-white/5' : 'bg-gradient-to-r from-emerald-500/45 via-violet-500/45 to-emerald-400/65'}`} /> : null}
      </div>
      <span className={`mt-1 text-center text-[9px] uppercase tracking-[0.14em] ${status === 'done' ? 'text-emerald-400/70' : status === 'active' ? 'text-violet-300/90' : 'text-white/20'}`}>
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

  useEffect(() => {
    if (stage !== 'generating') {
      setGenerationStep(-1);
      return;
    }

    setGenerationStep(0);

    const stepTimers = STEPS.map((_, index) => window.setTimeout(() => setGenerationStep(index), index * 420));
    const timer = window.setTimeout(() => {
      setStage('result');
    }, STEPS.length * 420 + 180);

    return () => {
      stepTimers.forEach((stepTimer) => window.clearTimeout(stepTimer));
      window.clearTimeout(timer);
    };
  }, [stage]);

  const activeGoal = useMemo(() => GOALS.find((item) => item.id === goal) ?? GOALS[0], [goal]);
  const currentStep = useMemo(() => {
    if (!confidence) {
      return 1;
    }
    if (!evalAccumulated) {
      return 2;
    }
    if (!showSolution) {
      return 3;
    }
    if (!ankiFlipped) {
      return 4;
    }
    return 5;
  }, [confidence, evalAccumulated, showSolution, ankiFlipped]);

  const startGeneration = () => {
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
  };

  return (
    <div className="usb-study">
      <article className="usb-study-hero-card">
        <div className="usb-hero-logo">
          <BrainIcon className="usb-hero-icon" />
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="usb-hero-title">Tutor IA · Study Agent</div>
          <div className="usb-hero-desc">5–8 min por video. Preguntas adaptadas a tu nivel. Retención garantizada con Anki.</div>
        </div>
      </article>

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
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">IA local · calibrado a tu objetivo</div>
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

          <section className="usb-relevance-card">
            <InfoIcon className="usb-card-info" />
            <div className="usb-relevance-score">88<span>%</span></div>
            <p className="usb-relevance-text">Cimientos críticos. Spring Boot vive dentro de la JVM — sin esto, el resto del curso es memorizar sin entender.</p>
          </section>

          <section className="usb-result-card usb-confidence-card">
            <StepHeader index={2} label="¿Cómo te fue con este video?" status={confidence ? 'done' : 'active'} subtitle="Elige tu nivel para calibrar el siguiente paso del plan de estudio." />
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

          <section className="usb-result-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="usb-section-title">Lo que aprendiste</div>
                <p className="mt-1 text-[10px] leading-relaxed text-white/30">Asegura la base antes de pasar a las preguntas.</p>
              </div>
            </div>
            {['La JVM ejecuta Spring Boot y su ApplicationContext vive en el heap.', 'int nunca es null; Integer sí puede serlo y puede fallar en colecciones.', '== compara referencias; .equals() compara valores.'].map((concept) => (
              <label key={concept} className="usb-check-item">
                <span className="usb-check-box"><CheckIcon className="usb-check-mark" /></span>
                <span>{concept}</span>
              </label>
            ))}
          </section>

          <section className="usb-result-card usb-quiz-card">
            <StepHeader index={3} label="Verifica tu comprensión" status={confidence ? (evalAccumulated ? 'done' : 'active') : 'pending'} subtitle="Responde, mira la pista o revisa la respuesta si te trabas." />
            <div className="usb-quiz-badges">
              <div className="usb-bloom-badge">Bloom · {confidence ? BLOOM_BY_CONFIDENCE[confidence] : 'Aplicar'}</div>
              {confidence ? <div className={`usb-difficulty-badge ${CONFIDENCE_STYLES[confidence]}`}>{DIFFICULTY_LABEL[confidence]}</div> : null}
            </div>
            <p className="usb-question">{STUDY_QUESTION.q}</p>
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
                {STUDY_QUESTION.hint}
              </div>
            ) : null}
            {showQuestionAnswer ? (
              <div className="rounded-xl border border-white/6 bg-black/20 px-3 py-2.5 text-[10px] leading-relaxed text-violet-300/75">
                <span className="mr-1 text-emerald-300">🎯</span>
                {STUDY_QUESTION.answer}
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
                    const streamRes = await evaluateActiveAnswerStream(STUDY_QUESTION.q, STUDY_QUESTION.answer, studentAnswer || 'Sin respuesta', 'Aplicar', (_token, accumulated) => {
                      setEvalAccumulated(accumulated);
                    }, ctrl.signal);

                    if (ctrl.signal.aborted) {
                      return;
                    }

                    if (!streamRes.success || !streamRes.content.trim()) {
                      const fallback = await evaluateActiveAnswer(STUDY_QUESTION.q, STUDY_QUESTION.answer, studentAnswer || 'Sin respuesta', 'Aplicar');
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
              <button type="button" className="usb-small-btn usb-muted-btn">
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
            <StepHeader index={4} label="Aplícalo en código / situación real" status={showSolution ? 'done' : evalAccumulated ? 'active' : 'pending'} subtitle={STUDY_APPLICATION.setup} />
            <pre className="usb-code-block">{STUDY_APPLICATION.challenge}</pre>
            <textarea className="usb-answer-box usb-code-answer" placeholder="Escribe tu solución o explicación aquí…" />
            <div className="usb-card-actions">
              <button type="button" className="usb-small-btn">
                <CheckIcon className="usb-btn-icon" />
                Enviar para code review
              </button>
              <button type="button" className={`usb-small-btn usb-muted-btn ${showSolution ? 'is-active' : ''}`} onClick={() => setShowSolution((current) => !current)}>
                <FlipIcon className="usb-btn-icon" />
                {showSolution ? 'Ocultar solución' : 'Ver solución'}
              </button>
            </div>
            {showSolution ? (
              <div className="usb-solution-box">
                <div className="usb-solution-title">Solución</div>
                <p>{STUDY_APPLICATION.solution}</p>
              </div>
            ) : null}
          </section>

          <section className="usb-anki-strip">
            <div className="usb-anki-toprow">
              <span className="usb-anki-chip">1 de 4</span>
              <span className="usb-anki-chip usb-anki-chip-alt">Spring Boot</span>
            </div>
            <div className="usb-anki-stage" onClick={() => setAnkiFlipped((current) => !current)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setAnkiFlipped((current) => !current); } }}>
              <div className={`usb-anki-card ${ankiFlipped ? 'is-flipped' : ''}`}>
                <div className="usb-anki-front">
                  <span className="usb-anki-label">Flashcard</span>
                  <p>¿Qué pasa en el heap de la JVM cuando Spring Boot arranca?</p>
                  <span className="usb-anki-hint"><FlipIcon className="usb-btn-icon" /> Toca para voltear</span>
                </div>
                <div className="usb-anki-back">
                  <span className="usb-anki-label usb-anki-label-alt">Respuesta</span>
                  <p>Spring crea el ApplicationContext en el heap, instancia beans singleton y levanta Tomcat. Si el heap se llena, aparece OutOfMemoryError.</p>
                </div>
              </div>
            </div>
            <div className="usb-anki-dots" aria-hidden="true">
              <span className="is-active" />
              <span />
              <span />
            </div>
            <div className="usb-anki-actions">
              <button type="button" className="usb-small-btn">
                <FileDownIcon className="usb-btn-icon" />
                Exportar .txt
              </button>
              <button type="button" className="usb-small-btn usb-primary-btn">
                <PackageIcon className="usb-btn-icon" />
                Exportar .apkg
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}