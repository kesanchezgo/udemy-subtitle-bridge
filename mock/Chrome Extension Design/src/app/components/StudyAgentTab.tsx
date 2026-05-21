import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Target, Sparkles, Wand2, Check, Edit3, ArrowRight, Brain,
  CheckCircle2, Circle, RotateCcw, X, Zap, FlipHorizontal,
  ChevronLeft, ChevronRight, Info, FileDown, FolderPlus,
  FolderSync, Send, Loader2, Wifi, WifiOff, Star, BookOpen,
  Repeat2, Lock, ChevronDown, Package, Rocket, Diamond, Flame, Download, FastForward
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { evaluateActiveAnswer, evaluateCodeSolution, evaluateActiveAnswerStream, evaluateCodeSolutionStream, type AIRating } from "../services/localAI";
import { buildAnkiApkg, downloadApkg } from "../services/ankiApkg";
import { projectId } from "../../../utils/supabase/info";
import { usePersistedState } from "../hooks/usePersistedState";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { celebrate } from "./CelebrationOverlay";

import { Session } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "objective" | "generating" | "result";
type ConfidenceLevel = "confused" | "partial" | "clear" | "mastered";
type CardType = "concepto" | "codigo" | "entrevista" | "comparacion" | "proceso";

interface FeedbackState {
  status: "idle" | "loading" | "streaming" | "done" | "error";
  content: string;
  rating: AIRating;
  isMock?: boolean;
}
const IDLE_FB: FeedbackState = { status: "idle", content: "", rating: "unknown" };

interface AnkiCard {
  id: string;
  type: CardType;
  front: string;
  back: string;
  tags: string[];
}

interface StudyContent {
  relevance: { score: number; reason: string };
  keyConcepts: string[];
  quickWin: string;
  questions: { q: string; bloom: string; difficulty: ConfidenceLevel; hint: string; answer: string }[];
  application: { setup: string; challenge: string; solution: string; isCode: boolean };
  interviewQ: { q: string; idealAnswer: string } | null;
  nextAction: string;
  ankiCards: AnkiCard[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PRESET_OBJECTIVES = [
  { id: "spring-senisenior", icon: "🚀", title: "Entrevista Spring Boot", sub: "Semi-Senior", color: "from-violet-600/20 to-violet-600/5", border: "border-violet-500/30", accent: "text-violet-300" },
  { id: "java-cert",         icon: "🏆", title: "Certificación Java SE",  sub: "Oracle OCP",  color: "from-amber-600/20 to-amber-600/5",  border: "border-amber-500/30",  accent: "text-amber-300"  },
  { id: "personal-project",  icon: "🛠️", title: "Proyecto Personal",      sub: "App real",   color: "from-emerald-600/20 to-emerald-600/5", border: "border-emerald-500/30", accent: "text-emerald-300" },
  { id: "fullstack",         icon: "⚡", title: "Full Stack Dev",          sub: "Java + React", color: "from-sky-600/20 to-sky-600/5",    border: "border-sky-500/30",    accent: "text-sky-300"    },
];

const CONFIDENCE = [
  { id: "confused" as ConfidenceLevel,  emoji: "😕", label: "Confuso",       desc: "No quedó claro",    ring: "ring-red-500/40",     bg: "bg-red-500/10",     border: "border-red-500/25",     label_c: "text-red-400"     },
  { id: "partial"  as ConfidenceLevel,  emoji: "🤔", label: "Más o menos",  desc: "Algunos gaps",      ring: "ring-amber-500/40",   bg: "bg-amber-500/10",   border: "border-amber-500/25",   label_c: "text-amber-400"   },
  { id: "clear"    as ConfidenceLevel,  emoji: "👍", label: "Entendido",    desc: "Lo capté bien",     ring: "ring-emerald-500/40", bg: "bg-emerald-500/10", border: "border-emerald-500/25", label_c: "text-emerald-400" },
  { id: "mastered" as ConfidenceLevel,  emoji: "🔥", label: "Lo domino",    desc: "Sin dudas",         ring: "ring-violet-500/40",  bg: "bg-violet-500/10",  border: "border-violet-500/25",  label_c: "text-violet-400"  },
];

const CONFIDENCE_HINT: Record<ConfidenceLevel, string> = {
  confused:  "Sin problema — empezamos desde los fundamentos. El 80% de los expertos también lo vivió así al inicio.",
  partial:   "Normal en el primer intento. Vamos a cerrar esos gaps con preguntas muy concretas.",
  clear:     "Bien. Ahora lo comprobamos con preguntas de aplicación real para solidificar.",
  mastered:  "Perfecto. Te espera un desafío de análisis profundo para confirmar el dominio.",
};

// Coach bubble post-selection (motivational, personalized per level)
const COACH_BUBBLE: Record<ConfidenceLevel, { emoji: string; title: string; tip: string }> = {
  confused:  { emoji: "💪", title: "¡La honestidad es el primer paso real!", tip: "Cada experto que conoces pasó exactamente por aquí. Las preguntas están calibradas para tu nivel — sin saltos abruptos." },
  partial:   { emoji: "🎯", title: "Ya tienes la base.", tip: "Solo necesitas conectar los puntos. Las preguntas cerrarán exactamente los gaps que detectaste." },
  clear:     { emoji: "⚡", title: "Buen nivel de comprensión.", tip: "Ahora viene la prueba real: aplicarlo sin mirar. Eso es lo que separa entender de dominar." },
  mastered:  { emoji: "🔥", title: "¡Nivel alto, vamos a confirmarlo!", tip: "Te espera un análisis en profundidad. Demuestra que no solo sabes — sabes por qué funciona." },
};



const CARD_META: Record<CardType, { label: string; icon: string; color: string; accent: string }> = {
  concepto:    { label: "Concepto",    icon: "🎯", color: "text-violet-400",  accent: "#a78bfa" },
  codigo:      { label: "Código",      icon: "💻", color: "text-emerald-400", accent: "#86efac" },
  entrevista:  { label: "Entrevista",  icon: "💼", color: "text-sky-400",     accent: "#93c5fd" },
  comparacion: { label: "Comparación", icon: "🔄", color: "text-amber-400",   accent: "#fcd34d" },
  proceso:     { label: "Proceso",     icon: "📋", color: "text-fuchsia-400", accent: "#e879f9" },
};

const QUESTIONS_FOR: Record<ConfidenceLevel, ConfidenceLevel[]> = {
  confused: ["confused"],
  partial:  ["confused", "partial"],
  clear:    ["partial", "clear"],
  mastered: ["clear", "mastered"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function BLOOM_STYLE(l: string) {
  return ({
    recordar:   "bg-slate-500/10 border-slate-500/20 text-slate-400",
    comprender: "bg-sky-500/10 border-sky-500/20 text-sky-400",
    aplicar:    "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    analizar:   "bg-violet-500/10 border-violet-500/20 text-violet-400",
    evaluar:    "bg-amber-500/10 border-amber-500/20 text-amber-400",
    crear:      "bg-rose-500/10 border-rose-500/20 text-rose-400",
  } as Record<string, string>)[l] ?? "bg-sky-500/10 border-sky-500/20 text-sky-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Step header with number circle + status
function StepHeader({
  n, label, status, subLabel
}: { n: number; label: string; status: "pending" | "active" | "done"; subLabel?: string }) {
  return (
    <motion.div 
      initial={status === "active" ? { opacity: 0, x: -10 } : false} 
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3 mb-4"
    >
      <motion.div 
        animate={status === "active" ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 shadow-sm ${
        status === "done"    ? "bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]" :
        status === "active"  ? "bg-gradient-to-br from-violet-500/30 to-violet-500/10 border border-violet-400/40 text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.2)]" :
                               "bg-white/5 border border-white/10 text-white/20"
      }`}>
        <AnimatePresence mode="wait">
          {status === "done"
            ? <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={12} strokeWidth={3} /></motion.div>
            : <motion.span key="num" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[10px] font-semibold leading-none">{n}</motion.span>
          }
        </AnimatePresence>
      </motion.div>
      <div className="flex flex-col min-w-0">
        <span className={`text-[12px] tracking-wide transition-colors ${status === "pending" ? "text-white/30" : "text-white/85"}`} style={{ fontWeight: 600 }}>{label}</span>
        {subLabel && <span className={`text-[10px] mt-0.5 transition-colors ${status === "pending" ? "text-white/20" : "text-white/40"}`}>{subLabel}</span>}
      </div>
      {status === "pending" && <Lock size={11} className="text-white/10 ml-auto shrink-0" />}
    </motion.div>
  );
}

// ── AI Analyzing Loader — own component so hooks are valid (no early-return conflict) ──
function AIAnalyzingLoader() {
  const STEPS = [
    { label: "Leyendo tu respuesta…",             icon: "📖" },
    { label: "Comparando con los conceptos…",     icon: "🧠" },
    { label: "Generando feedback personalizado…",  icon: "✍️" },
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-violet-500/18 bg-violet-500/5 overflow-hidden"
    >
      <div className="h-[2px] bg-violet-500/8 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-transparent via-violet-400 to-transparent"
          style={{ width: "50%" }}
          initial={{ x: "-100%" }}
          animate={{ x: "300%" }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/18 flex items-center justify-center shrink-0">
          <AnimatePresence mode="wait">
            <motion.span key={step}
              initial={{ scale: 0.4, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0, rotate: 10 }}
              transition={{ duration: 0.22 }}
              className="text-[15px]"
            >{STEPS[step].icon}</motion.span>
          </AnimatePresence>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <AnimatePresence mode="wait">
            <motion.p key={step}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
              className="text-violet-300/80 text-[11px]" style={{ fontWeight: 500 }}
            >{STEPS[step].label}</motion.p>
          </AnimatePresence>
          <div className="flex gap-1 items-center">
            {STEPS.map((_, i) => (
              <motion.div key={i}
                animate={{ width: i === step ? 20 : i < step ? 14 : 6, opacity: i <= step ? 1 : 0.2 }}
                transition={{ duration: 0.3 }}
                className={`h-[2px] rounded-full ${i < step ? "bg-violet-400/55" : i === step ? "bg-violet-400" : "bg-white/12"}`}
              />
            ))}
          </div>
        </div>
        <span className="text-white/14 text-[9px] font-mono tracking-wider shrink-0">IA local</span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Feedback v2.0 — verdict hero + structured content + contextual actions
// ─────────────────────────────────────────────────────────────────────────────
function AIFeedback({
  fb, onRetry, onShowHint, onShowModel, onClearAnswer,
}: {
  fb: FeedbackState;
  onRetry?: () => void;
  onShowHint?: () => void;
  onShowModel?: () => void;
  onClearAnswer?: () => void;
}) {
  if (fb.status === "idle") return null;
  if (fb.status === "loading") return <AIAnalyzingLoader />;

  // ── Error ────────────────────────────────────────────────────────────────
  if (fb.status === "error") return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="border border-red-500/18 bg-red-500/5 rounded-xl overflow-hidden"
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="w-8 h-8 rounded-xl bg-red-500/12 border border-red-500/20 flex items-center justify-center shrink-0">
          <WifiOff size={12} className="text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-red-300/85 text-[11px]" style={{ fontWeight: 600 }}>Sin conexión con la IA local</p>
          <p className="text-red-300/45 text-[10px] mt-0.5 leading-relaxed">{fb.content}</p>
        </div>
      </div>
      {onRetry && (
        <div className="px-3.5 pb-3">
          <button onClick={onRetry}
            className="w-full flex items-center justify-center gap-1.5 text-[10px] text-red-300/70 hover:text-red-300 border border-red-500/18 hover:border-red-500/30 py-1.5 rounded-lg transition-all">
            <Loader2 size={9} />Reintentar conexión
          </button>
        </div>
      )}
    </motion.div>
  );

  // (second error block removed — duplicate dead code, handled above)

  const isStreaming = fb.status === "streaming";
  const rating = fb.rating ?? "unknown";

  // ── Verdict config ────────────────────────────────────────────────────────
  const VERDICT = {
    correct:   { heroText: "text-emerald-300", heroBg: "bg-emerald-500/10", heroBorder: "border-emerald-500/20", heroIconBg: "bg-emerald-500/18 border-emerald-500/30", icon: "✅", label: "Correcto",    sublabel: "Tu comprensión está en el camino correcto.", ring: "border-emerald-500/22 shadow-[0_0_24px_rgba(16,185,129,0.07)]",   cardBg: "bg-gradient-to-b from-emerald-500/5 to-transparent" },
    excellent: { heroText: "text-violet-300",  heroBg: "bg-violet-500/10",  heroBorder: "border-violet-500/20",  heroIconBg: "bg-violet-500/18 border-violet-500/30",  icon: "🎯", label: "Excelente",   sublabel: "Dominas este concepto. Respuesta completa.",       ring: "border-violet-500/22 shadow-[0_0_24px_rgba(139,92,246,0.09)]", cardBg: "bg-gradient-to-b from-violet-500/5 to-transparent"  },
    partial:   { heroText: "text-amber-300",   heroBg: "bg-amber-500/8",    heroBorder: "border-amber-500/18",   heroIconBg: "bg-amber-500/15 border-amber-500/28",    icon: "⚡", label: "Parcial",     sublabel: "Vas bien — hay algunos gaps por cerrar.",          ring: "border-amber-500/20 shadow-[0_0_24px_rgba(245,158,11,0.07)]", cardBg: "bg-gradient-to-b from-amber-500/5 to-transparent"   },
    wrong:     { heroText: "text-rose-300",    heroBg: "bg-rose-500/7",     heroBorder: "border-rose-500/16",    heroIconBg: "bg-rose-500/14 border-rose-500/25",      icon: "💬", label: "Revisemos",   sublabel: "Todavía no llegaste. La IA te explica por qué.",  ring: "border-rose-500/18 shadow-[0_0_24px_rgba(239,68,68,0.05)]",   cardBg: "bg-gradient-to-b from-rose-500/4 to-transparent"    },
    unknown:   { heroText: "text-violet-300",  heroBg: "bg-violet-500/7",   heroBorder: "border-violet-500/15",  heroIconBg: "bg-violet-500/14 border-violet-500/25",  icon: "✦", label: "Evaluando…",  sublabel: "",                                                  ring: "border-violet-500/15",                                         cardBg: "bg-gradient-to-b from-violet-500/4 to-transparent"  },
  } as const;
  const v = VERDICT[isStreaming ? "unknown" : (rating as keyof typeof VERDICT)] ?? VERDICT.unknown;

  // ── Sound effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (fb.status !== "done") return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      if (rating === "correct" || rating === "excellent") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.07, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
        osc.start(); osc.stop(ctx.currentTime + 0.38);
      } else if (rating === "partial") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.07, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
      } else if (rating === "wrong") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(260, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(210, ctx.currentTime + 0.28);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.start(); osc.stop(ctx.currentTime + 0.28);
      }
    } catch (_) {}
  }, [fb.status, rating]);

  // ── Per-line parser ───────────────────────────────────────────────────────
  type LineMeta = { text: string; color: string; bg: string; border: string; highlight: boolean; isFirst: boolean };
  const rawLines = fb.content.split("\n").filter(Boolean);
  const parseLine = (l: string, idx: number): LineMeta => {
    const isFirst = idx === 0;
    if (l.startsWith("✅")) return { text: l, color: isFirst ? "text-emerald-200" : "text-emerald-300/85", bg: isFirst ? "bg-emerald-500/12" : "bg-emerald-500/7",  border: "border-l-emerald-500/55", highlight: true, isFirst };
    if (l.startsWith("❌")) return { text: l, color: isFirst ? "text-red-200"     : "text-red-300/85",     bg: isFirst ? "bg-red-500/10"     : "bg-red-500/6",      border: "border-l-red-500/55",     highlight: true, isFirst };
    if (l.startsWith("⚠️"))return { text: l, color: isFirst ? "text-amber-200"   : "text-amber-300/85",   bg: isFirst ? "bg-amber-500/12"   : "bg-amber-500/7",    border: "border-l-amber-500/55",   highlight: true, isFirst };
    if (l.startsWith("💡")) return { text: l, color: "text-sky-300/85",    bg: "bg-sky-500/7",      border: "border-l-sky-500/50",    highlight: true, isFirst };
    if (l.startsWith("🎯")) return { text: l, color: "text-violet-300/85", bg: "bg-violet-500/7",   border: "border-l-violet-500/50", highlight: true, isFirst };
    if (l.startsWith("🔁")) return { text: l, color: "text-fuchsia-300/85",bg: "bg-fuchsia-500/7",  border: "border-l-fuchsia-500/50",highlight: true, isFirst };
    if (l.startsWith("🚀")) return { text: l, color: "text-emerald-400/85",bg: "bg-emerald-500/7",  border: "border-l-emerald-400/50",highlight: true, isFirst };
    return { text: l, color: "text-white/50", bg: "", border: "", highlight: false, isFirst };
  };

  const isLast = (i: number) => i === rawLines.length - 1;
  const cursor = (
    <motion.span
      className="inline-block ml-[2px] w-[2px] h-[12px] bg-violet-400 rounded-sm align-middle"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.5, repeat: Infinity }}
    />
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className={`rounded-xl border overflow-hidden ${v.ring}`}
    >
      {/* ── Streaming top bar ── */}
      {isStreaming && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-violet-500/8 border-b border-violet-500/15">
          <Loader2 size={9} className="text-violet-400 animate-spin shrink-0" />
          <span className="text-violet-400/65 text-[9px] uppercase tracking-widest flex-1" style={{ fontWeight: 700 }}>
            IA evaluando tu respuesta
          </span>
          <span className="flex gap-[3px] items-center shrink-0">
            {[0,1,2].map(i => (
              <motion.div key={i} className="w-[3px] h-[3px] rounded-full bg-violet-400/70"
                animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
                transition={{ duration: 0.55, repeat: Infinity, delay: i * 0.18 }} />
            ))}
          </span>
        </div>
      )}

      {/* ── Verdict Hero Band (done only) ── */}
      {!isStreaming && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26 }}
          className={`flex items-center gap-3 px-3.5 py-3 ${v.heroBg} border-b ${v.heroBorder}`}
        >
          <motion.div
            initial={{ scale: 0, rotate: -18 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 20, delay: 0.06 }}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${v.heroIconBg}`}
          >
            <span className="text-[20px]">{v.icon}</span>
          </motion.div>
          <div className="flex-1 min-w-0">
            <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className={`text-[14px] ${v.heroText}`} style={{ fontWeight: 700, letterSpacing: "-0.01em" }}
            >{v.label}</motion.p>
            {v.sublabel && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
                className="text-white/32 text-[10px] mt-0.5 leading-snug"
              >{v.sublabel}</motion.p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-white/14 text-[8px] font-mono tracking-wider uppercase">IA local</span>
            {fb.isMock && (
              <span className="flex items-center gap-0.5 bg-amber-500/8 border border-amber-500/18 rounded px-1.5 py-0.5 text-[7px] text-amber-400/60">
                <WifiOff size={6} />demo
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Content lines ── */}
      <div className={`px-3 py-3 space-y-1.5 ${v.cardBg}`}>
        {rawLines.map((l, i) => {
          const m = parseLine(l, i);
          return (
            <motion.div key={i}
              initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.16, delay: isStreaming ? 0 : i * 0.05, ease: "easeOut" }}
            >
              {m.highlight ? (
                <div className={`border-l-[3px] rounded-r-xl px-2.5 ${m.isFirst ? "py-2" : "py-1.5"} ${m.bg} ${m.border}`}>
                  <p className={`leading-relaxed ${m.color} ${m.isFirst ? "text-[12px]" : "text-[11px]"}`}
                    style={m.isFirst ? { fontWeight: 500 } : {}}>
                    {m.text}{isStreaming && isLast(i) && cursor}
                  </p>
                </div>
              ) : (
                <p className={`text-[10px] leading-relaxed px-1.5 ${m.color}`}>
                  {m.text}{isStreaming && isLast(i) && cursor}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ── Contextual action strip ── */}
      {!isStreaming && (rating === "wrong" || rating === "partial") && (
        <motion.div
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          transition={{ delay: 0.32, duration: 0.22 }}
          className="border-t border-white/6 px-3 py-2.5 flex items-center gap-2"
        >
          <span className="text-white/20 text-[9px] uppercase tracking-wider shrink-0" style={{ fontWeight: 600 }}>
            Siguiente paso
          </span>
          <div className="flex gap-1.5 ml-auto flex-wrap justify-end">
            {rating === "wrong" && onClearAnswer && (
              <button onClick={onClearAnswer}
                className="flex items-center gap-1.5 text-[9px] border border-white/10 text-white/35 hover:text-white/60 hover:border-white/22 px-2.5 py-1 rounded-lg transition-all">
                <RotateCcw size={8}/> Reintentar
              </button>
            )}
            {onShowModel && (
              <button onClick={onShowModel}
                className="flex items-center gap-1.5 text-[9px] border border-sky-500/20 bg-sky-500/5 text-sky-300/65 hover:text-sky-300 hover:border-sky-500/38 px-2.5 py-1 rounded-lg transition-all">
                <BookOpen size={8}/> Ver respuesta
              </button>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// Anki card flip preview
function AnkiFlipPreview({ cards }: { cards: AnkiCard[] }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[idx];
  const meta = CARD_META[card.type];
  const strip = (h: string) =>
    h.replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, "[ código ]").replace(/<[^>]+>/g, "")
     .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").trim().slice(0, 200);
  const go = (d: 1|-1) => { setFlipped(false); setTimeout(() => setIdx(i => (i+d+cards.length)%cards.length), 130); };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] font-medium tracking-wide">
        <span className="text-white/30 bg-white/5 px-2 py-0.5 rounded-full border border-white/5 shadow-inner">
          {idx+1} de {cards.length}
        </span>
        <motion.span 
          key={card.type}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`${meta.color} flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded-full border border-[${meta.accent}22] shadow-[0_0_10px_${meta.accent}15]`}
        >
          <span className="drop-shadow-md">{meta.icon}</span> {meta.label}
        </motion.span>
      </div>
      <div className="relative cursor-pointer select-none group" style={{ perspective:"1200px" }} onClick={() => setFlipped(v => !v)}>
        <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 20 }} style={{ transformStyle:"preserve-3d" }}>
          {/* Front */}
          <div className="bg-gradient-to-b from-[#18181b] to-[#121214] border border-white/10 rounded-xl p-4 min-h-[100px] flex flex-col justify-between shadow-[0_8px_30px_rgba(0,0,0,0.4)] group-hover:border-white/20 transition-colors" style={{ backfaceVisibility:"hidden" }}>
            <p className="text-white/80 text-[12px] leading-relaxed font-medium">{strip(card.front)}</p>
            <div className="flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-white/5">
              <FlipHorizontal size={11} className="text-white/30 group-hover:text-white/60 transition-colors" />
              <span className="text-white/30 text-[10px] tracking-wide font-medium group-hover:text-white/60 transition-colors">Toca para voltear</span>
            </div>
            <div className="absolute inset-0 rounded-xl pointer-events-none bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {/* Back */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#121214] to-[#0a0a0c] rounded-xl p-4 overflow-auto shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
            style={{ backfaceVisibility:"hidden", transform:"rotateY(180deg)", borderWidth:1, borderStyle:"solid", borderColor: meta.accent+"66", boxShadow: `inset 0 0 40px ${meta.accent}10, 0 8px 30px rgba(0,0,0,0.6)` }}>
            <p className="text-white/80 text-[12px] leading-relaxed">{strip(card.back)}</p>
            <div className="absolute inset-0 pointer-events-none rounded-xl" style={{ boxShadow: `inset 0 1px 0 ${meta.accent}33` }}/>
          </div>
        </motion.div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <button onClick={() => go(-1)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 text-white/40 hover:text-white/80 flex items-center justify-center transition-all shadow-sm"><ChevronLeft size={14}/></button>
        <div className="flex gap-2 items-center">
          {cards.map((_,i) => (
            <button key={i} onClick={() => { setFlipped(false); setIdx(i); }}
              className={`rounded-full transition-all duration-300 ${i===idx ? "w-6 h-1.5 bg-violet-400 shadow-[0_0_8px_#a78bfa]" : "w-1.5 h-1.5 bg-white/20 hover:bg-white/40"}`}/>
          ))}
        </div>
        <button onClick={() => go(1)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 text-white/40 hover:text-white/80 flex items-center justify-center transition-all shadow-sm"><ChevronRight size={14}/></button>
      </div>
    </div>
  );
}

// Progress stepper
function ProgressStepper({ steps }: { steps: { label: string; done: boolean; active: boolean }[] }) {
  return (
    <div className="flex items-center gap-0 w-full mb-2">
      {steps.map((s, i) => (
        <React.Fragment key={s.label}>
          <div className="flex flex-col items-center gap-1.5 flex-1 group relative">
            {s.active && (
              <motion.div 
                layoutId="activeStepGlow"
                className="absolute top-0 w-8 h-8 rounded-full bg-violet-500/20 blur-xl pointer-events-none"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <motion.div 
              animate={s.active ? { scale: [1, 1.05, 1], y: [0, -2, 0] } : { scale: 1, y: 0 }}
              transition={{ duration: 2, repeat: s.active ? Infinity : 0, ease: "easeInOut" }}
              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-500 shadow-sm z-10 relative ${
              s.done ? "bg-gradient-to-b from-emerald-400/20 to-emerald-500/10 border border-emerald-400/30 shadow-[0_0_10px_rgba(52,211,153,0.15)]" : 
              s.active ? "bg-gradient-to-b from-violet-400/20 to-violet-500/10 border border-violet-400/40 shadow-[0_0_12px_rgba(139,92,246,0.2)]" : 
              "bg-white/5 border border-white/10"
            }`}>
              <AnimatePresence mode="wait">
                {s.done
                  ? <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={10} className="text-emerald-400" strokeWidth={3}/></motion.div>
                  : <motion.span key="num" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`text-[9px] font-semibold leading-none ${s.active ? "text-violet-300" : "text-white/20"}`}>{i+1}</motion.span>
                }
              </AnimatePresence>
            </motion.div>
            <span className={`text-[9px] leading-none tracking-wide text-center whitespace-nowrap transition-colors relative z-10 ${
              s.done ? "text-emerald-400/70 font-medium" : 
              s.active ? "text-violet-300/90 font-medium" : 
              "text-white/20 group-hover:text-white/30"
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 mx-1 mb-4 h-px relative overflow-hidden bg-white/5">
               <motion.div 
                 initial={{ scaleX: 0 }} 
                 animate={{ scaleX: s.done ? 1 : 0 }} 
                 className="absolute inset-0 bg-gradient-to-r from-emerald-500/50 to-emerald-400/80 origin-left"
                 transition={{ duration: 0.6, ease: "easeInOut" }}
               />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Anki builders ────────────────────────────────────────────────────────────
function toPrism(html: string, lang = "java"): string {
  return html
    .replace(/<pre[^>]*><code[^>]*>/gi, `<pre class="language-${lang}" data-lang="${lang.toUpperCase()}"><code class="language-${lang}">`)
    .replace(/<\/code><\/pre>/gi, "</code></pre>")
    .replace(/<pre[^>]*>/gi, `<pre class="language-${lang}" data-lang="${lang.toUpperCase()}"><code class="language-${lang}">`)
    .replace(/<\/pre>/gi, "</code></pre>");
}
function buildCardFront(card: AnkiCard): string {
  const m = CARD_META[card.type]; const a = m.accent;
  return `<div class="header-bar"><div class="header-dot red"></div><div class="header-dot yellow"></div><div class="header-dot green"></div><div class="type-pill" style="background:${a}18;color:${a};border:1px solid ${a}38">${m.icon} ${m.label}</div></div><div id="qa">${toPrism(card.front)}</div>`;
}
function buildCardBack(card: AnkiCard): string {
  return `<div class="answer">${toPrism(card.back)}</div>`;
}
const FRONT_TEMPLATE = `<div class="header-bar">
  <div class="header-dot red"></div>
  <div class="header-dot yellow"></div>
  <div class="header-dot green"></div>
  <div class="context-pill">{{Tags}}</div>
</div>
<div id="qa">{{Front}}</div>
<link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-java.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markup.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-properties.min.js"></script>
<script>
  var pill=document.querySelector('.context-pill,.type-pill');
  if(pill&&pill.innerText)pill.innerText=pill.innerText.replace(/_/g,' ').trim();
  document.querySelectorAll('#qa code').forEach(el=>{el.innerHTML=el.innerHTML.replace(/<br\\s*\\/?>/gi,'\\n');});
  setTimeout(function(){if(window.Prism)window.Prism.highlightAll();},50);
</script>`;
const BACK_TEMPLATE = `<link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-java.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markup.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-properties.min.js"></script>
{{FrontSide}}
<hr id="answer">
<div class="answer">{{Back}}</div>
{{#ImageBack}}<div class="image-container">{{ImageBack}}</div>{{/ImageBack}}
<script>
  document.querySelectorAll('.answer code').forEach(el=>{el.innerHTML=el.innerHTML.replace(/<br\\s*\\/?>/gi,'\\n');});
  setTimeout(function(){if(window.Prism)window.Prism.highlightAll();},50);
</script>`;
const ANKI_CSS = `@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
.card{font-family:'Inter',-apple-system,sans-serif;font-size:17px;line-height:1.6;color:#d1d5db;background-color:#1e1e2e;text-align:left;padding:22px;border-radius:18px;box-shadow:0 12px 40px -10px rgba(0,0,0,.65);animation:fadeIn .25s ease-out}
.card.nightMode,.nightMode .card{background-color:#1e1e2e;color:#d1d5db}
.header-bar{display:flex;align-items:center;gap:7px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.06)}
.header-dot{width:11px;height:11px;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.header-dot.red{background:#ff5f56}.header-dot.yellow{background:#ffbd2e}.header-dot.green{background:#27c93f}
.type-pill,.context-pill{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:.72em;font-weight:600;padding:3px 10px;border-radius:6px;text-transform:uppercase;letter-spacing:.4px;box-shadow:0 2px 6px rgba(0,0,0,.2)}
#qa{font-family:'Poppins',sans-serif;font-weight:600;font-size:22px;text-align:center;color:#a78bfa;margin-bottom:18px;line-height:1.45;letter-spacing:-.4px;text-shadow:0 0 20px rgba(167,139,250,.12)}
hr#answer{border:none;height:1px;background:linear-gradient(90deg,transparent,rgba(167,139,250,.25) 50%,transparent);margin:22px 0}
.answer{font-family:'Inter',sans-serif;color:#e4e4e7;font-size:16px;line-height:1.75}
pre{position:relative;background-color:#1a1b26!important;color:#f8f8f2;border-radius:10px;padding:0!important;font-size:.88em;font-family:"JetBrains Mono","Fira Code",monospace!important;display:block;overflow-x:auto;margin:14px 0 18px;box-shadow:0 6px 18px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.06)}
pre::before{content:attr(data-lang);display:block;position:sticky;left:0;top:0;width:100%;background:#16171f;color:#a78bfa;font-family:'Poppins',sans-serif;font-size:.75em;font-weight:600;padding:7px 16px;border-radius:10px 10px 0 0;text-transform:uppercase;border-bottom:1px solid #2d2e3f;z-index:10;letter-spacing:.5px}
pre>code{display:inline-block;min-width:100%;padding:14px 16px 16px;box-sizing:border-box}
p>code,li>code,td>code{background-color:#2c2c3e;color:#c4b5fd;padding:2px 6px;border-radius:5px;font-size:.88em;font-family:"JetBrains Mono",monospace!important;border:1px solid rgba(196,181,253,.15)}
table{border-collapse:collapse;width:100%;margin:12px 0;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.25)}
th{background:#2a2a3d;color:#a78bfa;font-family:'Poppins',sans-serif;font-weight:600;font-size:.85em;padding:9px 14px;text-align:left;border-bottom:2px solid rgba(167,139,250,.2)}
td{border:1px solid rgba(255,255,255,.06);padding:8px 14px;font-size:.9em;color:#c9cad4;background:rgba(255,255,255,.02)}
tr:nth-child(even) td{background:rgba(255,255,255,.035)}
blockquote{border-left:3px solid #a78bfa;background:rgba(167,139,250,.07);padding:10px 14px;margin:12px 0;border-radius:6px;font-style:italic;color:#c4b5fd}
.tip-box{background:rgba(134,239,172,.07);border-left:3px solid #86efac;border-radius:6px;padding:10px 14px;margin:12px 0;color:#a7f3d0;font-size:.92em}
.warning-box{background:rgba(252,211,77,.07);border-left:3px solid #fcd34d;border-radius:6px;padding:10px 14px;margin:12px 0;color:#fde68a;font-size:.92em}
.concept-box{background:rgba(147,197,253,.07);border-left:3px solid #93c5fd;border-radius:6px;padding:10px 14px;margin:12px 0;color:#bae6fd;font-size:.92em}
.interview-box{background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.2);border-radius:8px;padding:12px 14px;margin:12px 0}
.interview-box .label{color:#a78bfa;font-family:'Poppins',sans-serif;font-size:.78em;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
details{background:rgba(0,0,0,.2);border-radius:8px;padding:8px 12px;margin-top:14px;border:1px solid rgba(255,255,255,.05)}
summary{cursor:pointer;font-weight:600;color:#c792ea;outline:none;font-family:'Poppins',sans-serif;font-size:.9em;list-style:none}
summary::after{content:" ↓";font-size:.8em;opacity:.6}
details[open] summary::after{content:" ↑"}
details[open] summary{margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:5px}
mark{background:rgba(252,211,77,.2);color:#fde68a;padding:0 3px;border-radius:3px}
b,strong{color:#c4b5fd}
em{color:#94a3b8;font-style:italic}
ul{padding-left:20px;margin:8px 0}
li{margin-bottom:5px}
ul>li::marker,ol>li::marker{color:#a78bfa;font-weight:600}
.image-container{margin:18px auto;padding:12px;background:#1a1b26;border-radius:10px;text-align:center;border:1px solid rgba(255,255,255,.05)}
.image-container img{max-width:100%;height:auto;border-radius:7px}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@media screen and (max-width:768px){.card{padding:15px;font-size:15px;border-radius:14px}#qa{font-size:18px}pre{font-size:.82em!important}p>code,li>code{word-break:break-word}table{font-size:.83em}}`;

function buildAnkiTxt(cards: AnkiCard[], course: string, lesson: string): string {
  let out = `#separator:Tab\n#html:true\n#deck:${course}::${lesson}\n#notetype:Basic\n\n`;
  cards.forEach(c => { out += `${buildCardFront(c).replace(/\t/g,"  ")}\t${buildCardBack(c).replace(/\t/g,"  ")}\t${c.tags.join(" ")}\n`; });
  return out;
}
function buildTemplateGuide(course: string, lesson: string): string {
  const safe = lesson.replace(/[^a-z0-9]/gi,"_");
  return `╔══════════════════════════════════════════════════════════════════════╗
  SUBTITLE BRIDGE — PLANTILLA ANKI  (setup único, hazlo UNA sola vez)
  Curso: ${course}
╚═════════════════════════════════════��════════════════════════════════╝

Recibiste 3 archivos. Esto es exactamente qué hacer con cada uno:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 📄 ARCHIVO 1 — ${safe}_tarjetas.txt  → Las tarjetas en sí
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. En Anki: Archivo → Importar
  2. Selecciona el archivo "_tarjetas.txt"
  3. Configura: Separador = Tabulador | HTML = activado
  4. Deck destino = ${course}::${lesson}
  5. Clic en "Importar"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━���━━━━━━━━━━━━━━━━━━━━━━━
 �� ARCHIVO 2 — anki-card-styles.css  → Estilo visual
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Abre "anki-card-styles.css" con cualquier editor de texto
  2. Selecciona todo (Ctrl+A) y cópialo
  3. En Anki: Herramientas → Tipos de notas → Basic → Styling
  4. Selecciona todo el texto del editor (Ctrl+A) y pega el CSS
  5. Clic en "Guardar"
  ⚠ Sin este paso las tarjetas se verán sin el diseño visual

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 📋 ARCHIVO 3 — PLANTILLA-ANKI.txt (este archivo) → Plantillas
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. En Anki: Herramientas → Tipos de notas → Basic → Tarjetas
  2. Pestaña "Plantilla del anverso (Front)":
     Selecciona todo → pega el bloque FRONT al final de este archivo
  3. Pestaña "Plantilla del reverso (Back)":
     Selecciona todo → pega el bloque BACK al final de este archivo
  4. Clic en "Guardar"
  ⚠ Sin este paso el resaltado de código (Prism.js) no funcionará

  ✅ Listo. Las exportaciones futuras solo incluyen el archivo de tarjetas.

══════════════════════════════════════════════════════════════════════

▼▼▼ PLANTILLA FRONT — copiar todo hasta "FIN FRONT" ▼▼▼

${FRONT_TEMPLATE}

▲▲▲ FIN FRONT ▲▲▲

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▼▼▼ PLANTILLA BACK — copiar todo hasta "FIN BACK" ▼▼▼

${BACK_TEMPLATE}

▲▲▲ FIN BACK ▲▲▲
`;
}
function downloadFile(content: string, name: string, mime = "text/plain;charset=utf-8") {
  const b = new Blob([content], { type: mime }); const u = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
}

// ── .apkg async export helper ──────────────────────────────────────────────────
async function exportApkgFile(
  cards: AnkiCard[],
  courseName: string,
  lessonName: string,
  onProgress: (msg: string) => void,
): Promise<void> {
  const safe = lessonName.replace(/[^a-z0-9]/gi, "_");
  const deckName = `${courseName}::${lessonName}`;
  const data = await buildAnkiApkg(
    cards.map(c => ({ front: buildCardFront(c), back: buildCardBack(c), tags: c.tags })),
    deckName,
    ANKI_CSS,
    FRONT_TEMPLATE,
    BACK_TEMPLATE,
    onProgress,
  );
  downloadApkg(data, `${safe}.apkg`);
}

// ─── Mock content ────────────────────────────────────────────��────────────────
function generateContent(objectiveId: string, custom: string, course: string, lesson: string): StudyContent {
  const isSp = objectiveId.includes("spring") || custom.toLowerCase().includes("spring");
  const isInterview = objectiveId.includes("spring") || objectiveId.includes("cert");
  const tags = [course.toLowerCase().replace(/[^a-z0-9]+/g,"-"), lesson.toLowerCase().replace(/[^a-z0-9]+/g,"-"), isSp ? "spring-boot" : "java"];
  return {
    relevance: { score: isSp ? 88 : 74, reason: isSp ? "Cimientos críticos. Spring Boot vive dentro de la JVM — sin esto, el resto del curso es memorizar sin entender." : "Alta. Estos fundamentos aparecerán en CADA clase del curso. Entenderlos hoy multiplica lo que aprendas mañana." },
    keyConcepts: isSp ? [
      "La JVM ejecuta Spring Boot: el ApplicationContext vive en el heap. Si el heap se llena → OutOfMemoryError.",
      "int (primitivo) nunca es null. Integer (wrapper) sí puede serlo. Con @Value: int falla rápido si la propiedad no existe.",
      "== compara referencias en memoria, .equals() compara valores. Con @Value Strings, == siempre falla en producción.",
    ] : [
      "La JVM convierte bytecode (.class) a código nativo. El mismo .jar funciona en Windows, Mac y Linux sin recompilar.",
      "int vive en el stack (nunca null). Integer vive en el heap (puede ser null, necesario para colecciones genéricas).",
      "== compara si son el mismo objeto en memoria. .equals() compara contenido. Para Strings: usa siempre .equals().",
    ],
    quickWin: isSp ? "Abre tu último PR y busca cualquier if con == comparando Strings. Cámbialo a .equals() ahora mismo." : "En tu próximo snippet Java, usa int en lugar de Integer cuando el valor no puede ser null.",
    questions: [
      { difficulty: "confused" as ConfidenceLevel, bloom: "comprender", q: isSp ? "¿Qué es la JVM y qué tiene que ver con Spring Boot? Explícalo en tus propias palabras, sin leer nada." : "¿Cuál es la diferencia entre compilar y ejecutar un programa Java? ¿Qué produce cada paso?", hint: isSp ? "Piensa: ¿dónde viven los objetos de Spring en memoria? ¿Qué pasa si ese espacio se llena?" : "Hay dos herramientas separadas: javac y java. ¿Qué hace cada una y qué archivo produce?", answer: isSp ? "La JVM es el motor de ejecución de Java. Spring Boot arranca dentro de la JVM: crea el ApplicationContext en el heap, escanea beans y levanta Tomcat. Si el heap se llena de objetos sin liberar → OutOfMemoryError → app caída." : "Compilar (javac): convierte .java → bytecode (.class). Detecta errores de sintaxis y tipos. Ejecutar (java): la JVM carga el .class, el JIT lo optimiza a código máquina del SO y lo corre. El bytecode es portátil; el código máquina no." },
      { difficulty: "partial" as ConfidenceLevel, bloom: "aplicar", q: isSp ? "@Value(\"${app.timeout}\") private int timeout; — la propiedad no existe en application.properties. ¿Qué pasa y cómo lo corriges?" : "¿En qué situación concreta preferirías usar Integer en vez de int? Da al menos 2 ejemplos reales.", hint: isSp ? "int no puede ser null. ¿Qué hace Spring cuando intenta asignarle null a un primitivo al arrancar?" : "Piensa en colecciones como ArrayList<> o métodos que devuelven null si no encuentran nada.", answer: isSp ? "Con int: Spring lanza BeanCreationException al arrancar (no puede asignar null a primitivo). Bueno, falla rápido. Con Integer: asigna null silenciosamente y el NPE aparece más tarde. Fix: @Value(\"${app.timeout:30}\") para int con default." : "Usas Integer cuando: (1) el valor puede ser null (campo opcional de BD), (2) necesitas usarlo en List<Integer> o Map<String,Integer>, (3) el tipo retorno de un método que puede no encontrar el valor. Usas int cuando el valor siempre existe (velocidad 5x)." },
      { difficulty: "clear" as ConfidenceLevel, bloom: "analizar", q: isSp ? "¿Por qué este método siempre retorna false en producción?\n\n@Value(\"${app.role}\") private String role;\npublic boolean check(String r) { return r == role; }" : "El GC libera objetos automáticamente, pero sigues teniendo un memory leak. ¿Cómo es posible? Da un ejemplo.", hint: isSp ? "Piensa: ¿dónde vive el String que inyecta @Value vs. el String Pool de la JVM?" : "El GC solo libera objetos SIN referencias activas. Memory leak = referencia activa que nadie limpia.", answer: isSp ? "@Value inyecta el String desde el heap (no del String Pool). == compara referencias de memoria, no valores. role y r apuntan a objetos distintos en el heap aunque el texto sea igual → false siempre. Fix: return role.equals(r);" : "El GC no puede liberar objetos con referencias activas aunque nunca los uses. Ejemplo: List estática que acumula objetos en cada request sin limpiarla. La List mantiene referencias → GC no puede actuar → heap crece → OutOfMemoryError." },
      { difficulty: "mastered" as ConfidenceLevel, bloom: "evaluar", q: isSp ? "@Service singleton con private int count = 0 y trackLogin() { count++; }. Tu app tiene 50 usuarios concurrentes. Identifica el bug y corrígelo correctamente." : "Integer.valueOf(200) == Integer.valueOf(200) es false. ¿Por qué? ¿Qué rango sí daría true? ¿Qué implica para código de producción?", hint: isSp ? "Bean singleton = una instancia compartida entre TODOS los threads. ¿Qué pasa con count++ cuando 2 threads la ejecutan al mismo tiempo?" : "La JVM tiene una optimización de cache para ciertos valores Integer frecuentes.", answer: isSp ? "Race condition: count++ no es atómica. Con 50 threads simultáneos, varios leen el mismo valor, lo incrementan y el resultado es incorrecto. Fix correcto: private final AtomicInteger count = new AtomicInteger(0); y count.incrementAndGet();" : "La JVM cachea Integer.valueOf() para -128 a 127 (spec Java). Fuera de ese rango, cada autoboxing crea un nuevo objeto en el heap → == compara referencias distintas → false. Implicación: NUNCA uses == para comparar Integer. Siempre .equals() o desempaqueta a int primero." },
    ],
    application: {
      isCode: true,
      setup: isSp ? "Estás en code review de un PR. El código pasa todos los tests locales pero falla en producción de forma intermitente. Identifica los 2 bugs:" : "Encuentra los 2 bugs de tipo relacionados con lo que aprendiste hoy:",
      challenge: isSp
        ? `@Service\npublic class AuthService {\n    @Value("\${app.admin.role}")\n    private String adminRole;\n\n    private int failedAttempts = 0; // Bug #1\n\n    public boolean isAdmin(String role) {\n        return role == adminRole;   // Bug #2\n    }\n\n    public void registerFail() {\n        failedAttempts++;\n    }\n}`
        : `public class TypeDemo {\n    public static void main(String[] args) {\n        // Bug #1\n        Integer x = 200, y = 200;\n        System.out.println(x == y);\n\n        // Bug #2\n        List<Integer> nums = Arrays.asList(1, null, 3);\n        int total = nums.stream()\n                        .mapToInt(Integer::intValue)\n                        .sum();\n    }\n}`,
      solution: isSp
        ? "Bug #1: failedAttempts es estado mutable en singleton compartido entre threads → race condition. Fix: private final AtomicInteger failedAttempts = new AtomicInteger(0);\nBug #2: == compara referencias, no valores. Fix: return adminRole.equals(role);"
        : "Bug #1: Integer cache va de -128 a 127. Con 200, == compara objetos distintos del heap → false. Fix: x.equals(y).\nBug #2: mapToInt hace unboxing de Integer a int. Si el Integer es null → NullPointerException. Fix: .filter(Objects::nonNull).mapToInt(Integer::intValue).sum();",
    },
    interviewQ: isInterview ? {
      q: isSp ? "¿Qué diferencia real hay entre @Component, @Service y @Repository en Spring? ¿Cuándo importa esa diferencia?" : "¿Cuál es la diferencia entre int e Integer en Java y por qué es importante para el examen OCP?",
      idealAnswer: isSp ? "Las tres registran un bean en el IoC. La diferencia real está en @Repository: activa Exception Translation automática (SQLException → DataAccessException). Esto desacopla el código de la BD concreta. @Service es semántico: comunica intención al equipo. Respuesta que demuestra nivel senior." : "int es primitivo (stack, default 0, nunca null). Integer es objeto wrapper (heap, puede ser null). El examen pregunta: autoboxing/unboxing, NPE al desempaquetar null, Integer cache -128/127, y que Collections solo aceptan objetos. El cache es pregunta frecuente.",
    } : null,
    nextAction: isSp ? "Crea un Spring Boot project, reproduce el Bug #2 del desafío y verifica que con .equals() funciona en producción (no en test)." : "Escribe 5 líneas que demuestren la diferencia entre int e Integer con null y con colecciones.",
    ankiCards: isSp ? [
      { id:"a1", type:"concepto" as CardType, front:"¿Qué pasa en el heap de la JVM cuando Spring Boot arranca?", back:`<b>Arranque de Spring Boot en la JVM:</b><ol><li>JVM carga el classpath</li><li>Spring crea el <b>ApplicationContext</b> en el <b>heap</b></li><li>Component Scan: detecta @Service, @Repository, etc.</li><li>Instancia beans singleton</li><li>Tomcat embebido arranca</li></ol><div class="tip-box">💡 OutOfMemoryError = heap lleno. Ajuste: <code>-Xmx512m</code></div>`, tags },
      { id:"a2", type:"codigo" as CardType, front:`¿Por qué este código siempre retorna false en producción?<br><br><pre>@Value("\${app.role}")\nprivate String role;\n\nreturn userRole == role;</pre>`, back:`<b>Bug:</b> <code>==</code> compara referencias, no valores.<br><br><code>@Value</code> inyecta un String desde el <b>heap</b> (no del String Pool), siempre objeto distinto.<br><br><b>Fix:</b><pre>return role.equals(userRole);</pre><div class="warning-box">⚠️ Regla: nunca <code>==</code> con Strings de @Value</div>`, tags },
      { id:"a3", type:"comparacion" as CardType, front:"int vs Integer en @Value de Spring Boot — ¿cuándo usar cada uno?", back:`<table><tr><th>int</th><th>Integer</th></tr><tr><td>Primitivo</td><td>Objeto wrapper</td></tr><tr><td>Nunca null</td><td>Puede ser null</td></tr><tr><td>Propiedad faltante → <b>BeanCreationException</b> (falla rápido ✅)</td><td>Propiedad faltante → <b>null silencioso</b> ⚠️</td></tr></table>`, tags },
      { id:"a4", type:"entrevista" as CardType, front:"¿Qué hace @Repository diferente a @Component en Spring?", back:`<div class="interview-box"><div class="label">Respuesta de nivel senior</div>Ambas registran un bean. La diferencia real:<br><br><b>@Repository activa Exception Translation:</b><br><code>SQLException</code> (JDBC) → <code>DataAccessException</code> (Spring)<br><br>Resultado: tu código de negocio no se acopla a la BD concreta.</div>`, tags },
      { id:"a5", type:"concepto" as CardType, front:"¿Por qué un bean @Singleton con estado mutable es peligroso en Spring?", back:`Los beans singleton son <b>compartidos entre todos los threads</b>.<br><br>Estado mutable (<code>int count</code>) + múltiples threads = <b>race condition</b> → resultado incorrecto.<br><br><b>Fix:</b><pre>// Mal:\nprivate int count = 0;\n\n// Bien:\nprivate final AtomicInteger count =\n    new AtomicInteger(0);</pre>`, tags },
      { id:"a6", type:"codigo" as CardType, front:`¿Cuál es el output y por qué?<br><br><pre>Integer a = 127, b = 127;\nSystem.out.println(a == b);\n\nInteger c = 200, d = 200;\nSystem.out.println(c == d);</pre>`, back:`<code>a == b</code> → <b>true</b> (JVM cachea Integer -128 a 127)<br><code>c == d</code> → <b>false</b> (200 crea objetos nuevos en el heap)<br><br><div class="warning-box">���️ Siempre <code>.equals()</code> para comparar Integer</div>`, tags },
    ] : [
      { id:"b1", type:"concepto" as CardType, front:"¿Qué es la JVM y por qué hace que Java sea especial?", back:`<b>JVM = Java Virtual Machine</b><br><br>Traduce bytecode a código máquina del SO actual.<br><br><b>Ciclo:</b><pre>MiClase.java → javac → MiClase.class\n             → JVM  → ejecuta</pre><div class="concept-box">🌐 "Write Once, Run Anywhere" — mismo .class en Windows, Linux y Mac.</div>`, tags },
      { id:"b2", type:"comparacion" as CardType, front:"¿Cuál es la diferencia clave entre int e Integer en Java?", back:`<table><tr><th>Aspecto</th><th>int</th><th>Integer</th></tr><tr><td>Tipo</td><td>Primitivo</td><td>Objeto</td></tr><tr><td>Memoria</td><td>Stack</td><td>Heap</td></tr><tr><td>Default</td><td>0</td><td>null</td></tr><tr><td>¿Null?</td><td>❌</td><td>✅</td></tr><tr><td>En List&lt;&gt;</td><td>❌</td><td>✅</td></tr><tr><td>Performance</td><td>⚡ 5x más rápido</td><td>Normal</td></tr></table>`, tags },
      { id:"b3", type:"codigo" as CardType, front:`¿Cuál es el output y por qué?<br><br><pre>String a = "hola";\nString b = new String("hola");\nSystem.out.println(a == b);\nSystem.out.println(a.equals(b));</pre>`, back:`<code>a == b</code> → <b>false</b> (<code>new String()</code> crea objeto nuevo en el heap)<br><code>a.equals(b)</code> → <b>true</b> (mismo contenido)<br><br><div class="warning-box">⚠️ Siempre <code>.equals()</code> para comparar Strings</div>`, tags },
      { id:"b4", type:"concepto" as CardType, front:"¿Qué es el Garbage Collector y cuándo NO puede liberar memoria?", back:`El GC libera objetos del <b>heap</b> sin referencias activas.<br><br><b>Cuándo NO actúa (memory leak):</b><ul><li>Lista estática que crece sin límite</li><li>Listeners registrados pero nunca removidos</li><li>Cache que acumula sin expirar</li></ul><div class="warning-box">⚠️ <code>System.gc()</code> solo es sugerencia</div>`, tags },
      { id:"b5", type:"proceso" as CardType, front:"¿Cuáles son los 3 pasos del ciclo de vida de un programa Java?", back:`<ol><li><b>Escritura:</b> código fuente <code>.java</code></li><li><b>Compilación:</b> <code>javac</code> → bytecode <code>.class</code></li><li><b>Ejecución:</b> JVM carga el <code>.class</code>, JIT compila a código nativo y ejecuta</li></ol><div class="tip-box">💡 El bytecode es portable. El JIT lo optimiza para CADA plataforma.</div>`, tags },
    ],
  };
}

// ─── VerifyDoneReview — shown in step 2 when questionsComplete ───────────────
function VerifyDoneReview({
  questions, answers, feedbacks, onGoApply,
}: {
  questions: { q: string; answer: string }[];
  answers: Record<number, string>;
  feedbacks: Record<number, FeedbackState>;
  onGoApply: () => void;
}) {
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);
  const correctCount = Object.values(feedbacks).filter(f => f?.rating === "correct" || f?.rating === "excellent").length;
  const total = questions.length;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      {/* Compact success badge */}
      <div className="flex items-center gap-2.5 bg-emerald-500/8 border border-emerald-500/18 rounded-xl px-3 py-2.5">
        <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-emerald-300/90 text-[11px]" style={{ fontWeight: 600 }}>
            Verificación completada · {correctCount}/{total} correctas
          </p>
          <p className="text-white/28 text-[9px] mt-0.5">Toca cada pregunta para revisar tu respuesta y el feedback.</p>
        </div>
        <button onClick={onGoApply}
          className="shrink-0 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] px-2.5 py-1.5 rounded-lg transition-all"
          style={{ fontWeight: 600 }}>
          Practícalo <ArrowRight size={9}/>
        </button>
      </div>
      {/* Answers review list */}
      <div className="space-y-1.5">
        {questions.map((q, i) => {
          const fb = feedbacks[i];
          const ratingColor = !fb ? "text-white/20" :
            fb.rating === "correct" || fb.rating === "excellent" ? "text-emerald-400" :
            fb.rating === "partial" ? "text-amber-400" :
            fb.rating === "wrong" ? "text-rose-400" : "text-white/20";
          const ratingDot = !fb ? "bg-white/10" :
            fb.rating === "correct" || fb.rating === "excellent" ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" :
            fb.rating === "partial" ? "bg-amber-400" :
            fb.rating === "wrong" ? "bg-rose-400" : "bg-white/10";
          const isOpen = openIdx === i;
          return (
            <div key={i} className="border border-white/6 rounded-xl overflow-hidden">
              <button onClick={() => setOpenIdx(isOpen ? null : i)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-white/3 transition-colors">
                <div className={`mt-[3px] w-2 h-2 rounded-full shrink-0 ${ratingDot}`} />
                <p className={`text-[10px] leading-snug flex-1 ${ratingColor !== "text-white/20" ? "text-white/60" : "text-white/35"}`}>
                  {q.q.slice(0, 88)}{q.q.length > 88 ? "…" : ""}
                </p>
                <ChevronDown size={9} className={`text-white/20 shrink-0 mt-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`}/>
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="border-t border-white/5 px-3 py-2.5 space-y-2.5 bg-black/15">
                      {answers[i] && (
                        <div>
                          <p className="text-white/20 text-[8px] uppercase tracking-widest mb-1">Tu respuesta</p>
                          <p className="text-white/50 text-[10px] leading-relaxed">{answers[i]}</p>
                        </div>
                      )}
                      {fb?.content && (
                        <div className="border-t border-white/5 pt-2">
                          <p className="text-white/20 text-[8px] uppercase tracking-widest mb-1">Feedback IA</p>
                          <p className={`text-[10px] leading-relaxed ${ratingColor}`}>{fb.content.split("\n").filter(Boolean)[0]}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function StudyAgentTab({ session }: { session?: Session }) {
  const [phase, setPhase]             = useState<Phase>("objective");
  // Persisted: objective, course and lesson survive tab reloads
  const [selectedObj, setSelectedObj] = usePersistedState("agent_selected_obj", "spring-senisenior");
  const [customObj, setCustomObj]     = usePersistedState<string>("agent_custom_obj", "");
  const [refinedObj, setRefinedObj]   = useState("");
  const [isRefining, setIsRefining]   = useState(false);
  const [courseName, setCourseName]   = usePersistedState<string>("agent_course_name", "Java In-Depth - Udemy");
  const [lessonName, setLessonName]   = usePersistedState<string>("agent_lesson_name", "02 - JVM y Tipos de Datos");
  const [genStep, setGenStep]         = useState(0);

  const [content, setContent]                       = useState<StudyContent | null>(null);
  const [confidence, setConfidence]                 = useState<ConfidenceLevel | null>(null);
  const [conceptsChecked, setConceptsChecked]       = useState<Record<number, boolean>>({});
  const [appAnswer, setAppAnswer]                   = useState("");
  const [appFeedback, setAppFeedback]               = useState<FeedbackState>(IDLE_FB);
  const [showAppSolution, setShowAppSolution]       = useState(false);
  const [exportedCourses, setExportedCourses]       = useState<Set<string>>(new Set());
  const [ankiExported, setAnkiExported]             = useState(false);
  const [showAnkiGuide, setShowAnkiGuide]           = useState(false);
  const [apkgStatus, setApkgStatus]                 = useState<"idle" | "loading" | "done" | "error">("idle");
  const [apkgProgress, setApkgProgress]             = useState("");
  const [showHint, setShowHint]                     = useState(false);
  const [showModelAnswer, setShowModelAnswer]       = useState(false);
  const [questionAnswers, setQuestionAnswers]       = useState<Record<number, string>>({});
  const [questionFeedbacks, setQuestionFeedbacks]   = useState<Record<number, FeedbackState>>({});
  const [currentQIdx, setCurrentQIdx]               = useState(0);
  const [questionsComplete, setQuestionsComplete]   = useState(false);
  const [sessionComplete, setSessionComplete]       = useState(false);
  const [showInterviewAnswer, setShowInterviewAnswer] = useState(false);

  // ── Focus navigator state (1 paso a la vez) ────────────────────────────────
  const [focusStep, setFocusStep] = useState(0);
  const [focusDir,  setFocusDir]  = useState(1);

  // ── Session timing ────────────────────────────────────────────────────────
  const sessionStartRef = useRef<number>(Date.now());

  // Scroll refs
  const scrollRef      = useRef<HTMLDivElement>(null);
  const conceptsRef    = useRef<HTMLDivElement>(null);
  const questionsRef   = useRef<HTMLDivElement>(null);
  const applyRef       = useRef<HTMLDivElement>(null);
  const ankiRef        = useRef<HTMLDivElement>(null);

  const scrollTo = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }
    }, 150);
  }, []);

  // Sound helpers
  const playSound = useCallback((type: "pop" | "success" | "chord") => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "pop") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.15); // C6
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === "chord") {
        [261.63, 329.63, 392.00, 523.25].forEach((freq, i) => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = "sine";
          osc2.frequency.value = freq;
          gain2.gain.setValueAtTime(0, ctx.currentTime);
          gain2.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.1);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
          osc2.start(ctx.currentTime + (i * 0.05));
          osc2.stop(ctx.currentTime + 1.6);
        });
      }
    } catch (e) {}
  }, []);

  // ── Auto-advance focus navigator when steps complete ─────────────────────
  useEffect(() => {
    if (confidence && focusStep === 0) { setFocusDir(1); setFocusStep(1); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confidence]);

  useEffect(() => {
    if (questionsComplete && focusStep <= 2) {
      setFocusDir(1);
      setFocusStep(3);
      // Victory sound
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
      } catch (e) {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsComplete]);

  // NO auto-advance step 3→4: el usuario lee el feedback y decide cuándo continuar

  // Scroll to top — scrollTop=0 es síncrono + doble disparo post-AnimatePresence
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      });
    });
    const t = setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, 350);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [focusStep]);

  // (smart scroll replaced by focus navigator — step auto-advance above)

  // Add sound on phase transitions to keep it interesting
  useEffect(() => {
    if (phase === "result") {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } catch(e) {}
    }
  }, [phase]);

  const GEN_STEPS = [
    "Analizando la transcripción…",
    "Identificando conceptos clave…",
    "Calibrando preguntas a tu objetivo…",
    "Generando escenario de aplicación real…",
    "Creando tarjetas Anki optimizadas…",
  ];

  const handleGenerate = () => {
    setPhase("generating"); setGenStep(0);
    sessionStartRef.current = Date.now();
    const iv = setInterval(() => setGenStep(p => p >= GEN_STEPS.length - 1 ? p : p + 1), 400);
    setTimeout(() => {
      clearInterval(iv);
      const newContent = generateContent(selectedObj, customObj, courseName, lessonName);
      setContent(newContent);
      setPhase("result");
      
      // Auto-save Anki cards to Supabase if logged in
      if (session?.user && newContent.ankiCards.length > 0) {
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c/anki?userId=${session.user.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newContent.ankiCards)
        }).catch(err => console.error("Failed to sync Anki cards", err));
      }

      toast("¡Material de estudio listo!", {
        description: "Analizamos el video y preparamos tu plan de dominio.",
        icon: <Rocket className="text-violet-400" size={18} />
      });
      scrollToBottom();
    }, 2200);
  };

  const handleRefine = () => {
    if (!customObj.trim()) return;
    setIsRefining(true);
    setTimeout(() => {
      const lo = customObj.toLowerCase();
      setRefinedObj(lo.includes("spring") ? "Aprobar entrevista Spring Boot semi-senior: IoC, DI, JPA, REST, testing" : lo.includes("cert") ? "Aprobar Oracle Certified Professional Java SE Developer" : `Dominar "${customObj}" para aplicarlo en producción`);
      setIsRefining(false);
    }, 1200);
  };

  const handleReset = () => {
    setPhase("objective"); setContent(null); setConfidence(null);
    setConceptsChecked({}); setAppAnswer(""); setAppFeedback(IDLE_FB);
    setShowAppSolution(false); setQuestionAnswers({}); setQuestionFeedbacks({});
    setCurrentQIdx(0); setQuestionsComplete(false); setSessionComplete(false);
    setAnkiExported(false); setShowAnkiGuide(false); setShowHint(false);
    setShowModelAnswer(false); setShowInterviewAnswer(false);
    setApkgStatus("idle"); setApkgProgress("");
    setFocusStep(0); setFocusDir(1);
    sessionStartRef.current = Date.now();
    toast("Sesión reiniciada", { icon: <RotateCcw className="text-violet-400" size={18} /> });
  };

  // BUG FIX: reset question state when confidence changes
  const handleConfidenceChange = (c: ConfidenceLevel) => {
    setConfidence(c);
    setCurrentQIdx(0);
    setQuestionsComplete(false);
    setQuestionAnswers({});          // ← was missing
    setQuestionFeedbacks({});        // ← was missing
    setShowHint(false);
    toast.info("Adaptando las preguntas a tu nivel...", {
      icon: (
        <div className="p-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.2)]">
          <Brain className="text-blue-400 w-4 h-4" />
        </div>
      )
    });
    setShowModelAnswer(false);
    setAppAnswer("");
    setAppFeedback(IDLE_FB);
    setShowAppSolution(false);
    setSessionComplete(false);
  };

  const visibleQuestions = content && confidence ? content.questions.filter(q => QUESTIONS_FOR[confidence].includes(q.difficulty)) : [];

  const handleEvalQuestion = async (idx: number) => {
    if (!content || !visibleQuestions[idx]) return;
    const userAns = questionAnswers[idx] || "";
    if (!userAns.trim()) return;
    setQuestionFeedbacks(p => ({ ...p, [idx]: { status: "loading", content: "", rating: "unknown" } }));
    const q = visibleQuestions[idx];

    // Attempt streaming evaluation first
    const res = await evaluateActiveAnswerStream(
      q.q, q.answer, userAns, q.bloom,
      (_, accumulated) => {
        setQuestionFeedbacks(p => ({
          ...p,
          [idx]: { status: "streaming", content: accumulated, rating: "unknown", isMock: p[idx]?.isMock },
        }));
      }
    );

    // If streaming failed or returned nothing, fall back to non-streaming
    if (!res.success || !res.content.trim()) {
      const fallback = await evaluateActiveAnswer(q.q, q.answer, userAns, q.bloom);
      const fb: FeedbackState = { status: fallback.success ? "done" : "error", content: fallback.success ? fallback.content : (fallback.error ?? "Error"), rating: fallback.rating, isMock: fallback.isMock };
      setQuestionFeedbacks(p => ({ ...p, [idx]: fb }));
      // No auto-advance on fallback path either
      setTimeout(() => scrollToBottom(), 120);
      return;
    }

    const fb: FeedbackState = { status: "done", content: res.content, rating: res.rating, isMock: res.isMock };
    setQuestionFeedbacks(p => ({ ...p, [idx]: fb }));
    
    if (res.rating === "correct" || res.rating === "excellent") {
      const praises = [
        { title: "¡Excelente deducción!", subtitle: "Tu razonamiento es sólido", icon: <Target className="text-violet-400" /> },
        { title: "¡Impecable!", subtitle: "Eso es dominio real del tema", icon: <Zap className="text-amber-400" /> },
        { title: "¡Muy bien respondido!", subtitle: "Bloom diría que vas a nivel 4", icon: <Rocket className="text-sky-400" /> },
        { title: "¡Exacto! Sigue así", subtitle: "Cada respuesta correcta es progreso real", icon: <Sparkles className="text-emerald-400" /> },
        { title: "¡Brillante!", subtitle: "Respuesta correcta al 100%", icon: <Diamond className="text-fuchsia-400" /> },
      ];
      const pick = praises[Math.floor(Math.random() * praises.length)];
      celebrate({ type: "question_correct", title: pick.title, subtitle: pick.subtitle, icon: pick.icon });
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } catch(e){}
    } else if (res.rating === "partial") {
      toast.info("Vas por buen camino, veamos el detalle.", {
        icon: (
          <div className="p-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <Sparkles className="text-amber-400 w-4 h-4" />
          </div>
        )
      });
    }

    // NO auto-advance — the user reads the feedback and clicks "Siguiente" manually
    setTimeout(() => scrollToBottom(), 120);
  };

  const handleEvalApp = async () => {
    if (!content || !appAnswer.trim()) return;
    setAppFeedback({ status: "loading", content: "", rating: "unknown" });

    // Attempt streaming code review first
    const res = await evaluateCodeSolutionStream(
      content.application.setup, content.application.solution, appAnswer,
      (_, accumulated) => {
        setAppFeedback(prev => ({ status: "streaming", content: accumulated, rating: "unknown", isMock: prev.isMock }));
      }
    );

    if (!res.success || !res.content.trim()) {
      const fallback = await evaluateCodeSolution(content.application.setup, content.application.solution, appAnswer);
      const fb: FeedbackState = { status: fallback.success ? "done" : "error", content: fallback.success ? fallback.content : (fallback.error ?? "Error"), rating: fallback.rating, isMock: fallback.isMock };
      setAppFeedback(fb);
      if (fallback.success && (fallback.rating === "correct" || fallback.rating === "excellent")) {
        confetti({ particleCount: 70, spread: 80, origin: { y: 0.7 }, colors: ["#8b5cf6", "#10b981", "#38bdf8", "#fcd34d"] });
      }
      if (fallback.success && !sessionComplete) setTimeout(() => setSessionComplete(true), 800);
      return;
    }

    setAppFeedback({ status: "done", content: res.content, rating: res.rating, isMock: res.isMock });
    
    if (res.rating === "correct" || res.rating === "excellent") {
      celebrate({ type: "export_done", title: "¡Código brillante!", subtitle: "Tu solución es correcta. Sesión completada con éxito.", icon: <Flame className="text-orange-400" /> });
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(659.25, ctx.currentTime);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch(e){}
    } else if (res.rating === "partial") {
      toast.info("Buena aproximación, revisemos el feedback.", {
        icon: (
          <div className="p-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <Wand2 className="text-amber-400 w-4 h-4" />
          </div>
        )
      });
    }

    if (!sessionComplete) setSessionComplete(true);
  };

  const handleForceComplete = () => { 
    setQuestionsComplete(true); 
    setShowHint(false); 
    setShowModelAnswer(false); 
    toast("Evaluación saltada", { icon: <FastForward className="text-violet-400" size={18} /> });
  };

  const handleExport = () => {
    if (!content) return;
    const isFirst = !exportedCourses.has(courseName);
    const safe = (s: string) => s.replace(/[^a-z0-9]/gi, "_");
    downloadFile(buildAnkiTxt(content.ankiCards, courseName, lessonName), `${safe(lessonName)}_tarjetas.txt`);
    if (isFirst) {
      setTimeout(() => downloadFile(ANKI_CSS, "anki-card-styles.css", "text/css"), 300);
      setTimeout(() => downloadFile(buildTemplateGuide(courseName, lessonName), "PLANTILLA-ANKI.txt"), 600);
    }
    setExportedCourses(prev => new Set([...prev, courseName]));
    setAnkiExported(true);
    celebrate({ type: "export_done", title: "¡Tarjetas exportadas!", subtitle: "Archivo TXT listo para importar en Anki", icon: <Download className="text-emerald-400" /> });
  };

  const handleExportApkg = async () => {
    if (!content || apkgStatus === "loading") return;
    setApkgStatus("loading");
    setApkgProgress("Iniciando…");
    try {
      await exportApkgFile(content.ankiCards, courseName, lessonName, setApkgProgress);
      setApkgStatus("done");
      setAnkiExported(true);
      celebrate({ type: "anki_export", title: "¡Paquete Anki listo!", subtitle: "Ábrelo en Anki Desktop para importar tus tarjetas", icon: <Package className="text-violet-400" /> });
      setTimeout(() => setApkgStatus("idle"), 4000);
    } catch (err) {
      console.error("[apkg export]", err);
      setApkgStatus("error");
      setApkgProgress("Error al generar el .apkg. Revisa la consola.");
      toast.error("Hubo un error al generar el paquete .apkg", {
        icon: (
          <div className="p-1.5 rounded-full bg-red-500/10 border border-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.2)]">
            <X className="text-red-400 w-4 h-4" />
          </div>
        )
      });
      setTimeout(() => setApkgStatus("idle"), 5000);
    }
  };

  const isFirstExport = !exportedCourses.has(courseName);
  // BUG FIX: only show apply if questionsComplete (not allQsAnswered with wrong ratings)
  const showApply = confidence !== null && questionsComplete;

  // ── Focus navigator helpers ───────────────────────────────────────────────
  const stepUnlocked = [
    true,                    // 0 Autocalibrar
    confidence !== null,      // 1 Conceptos
    confidence !== null,      // 2 Verificar
    questionsComplete,        // 3 Aplicar
    showApply,               // 4 Anki + Entrevista
  ] as const;

  const canGoNext = focusStep < 4 && stepUnlocked[focusStep + 1 as 0|1|2|3|4];
  const canGoPrev = focusStep > 0;

  const goToStep = (target: number) => {
    if (target < 0 || target > 4) return;
    if (!stepUnlocked[target as 0|1|2|3|4]) return;
    // Reset scroll ANTES del re-render — evita que AnimatePresence empuje hacia abajo
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setFocusDir(target > focusStep ? 1 : -1);
    setFocusStep(target);
  };

  // BUG FIX: once questionsComplete, conceptsDone is locked true (prevents unmark on back-nav)
  const conceptsMarkedCount = Object.values(conceptsChecked).filter(Boolean).length;
  const conceptsDone = questionsComplete || conceptsMarkedCount >= 2;

  // Stepper state
  const steps = [
    { label: "Mi nivel",    done: confidence !== null,  active: confidence === null },
    { label: "Lo que vi",   done: conceptsDone,         active: confidence !== null && !conceptsDone },
    { label: "¿Lo sé?",    done: questionsComplete,    active: confidence !== null && !questionsComplete },
    { label: "Practícalo", done: appFeedback.status === "done", active: showApply && appFeedback.status !== "done" },
    { label: "No olvidar", done: ankiExported,         active: showApply },
  ];

  const allStepsComplete = steps.every(s => s.done);

  // Trigger confetti and toast when all steps complete
  useEffect(() => {
    if (allStepsComplete) {
      setTimeout(() => {
        celebrate({
          type: "session_complete",
          title: "¡Lección Dominada! 🏆",
          subtitle: "Has completado todos los pasos de esta sesión de estudio",
          icon: "🎓",
        });
        const duration = 3000;
        const end = Date.now() + duration;

        const frame = () => {
          confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#8b5cf6', '#10b981', '#fde047']
          });
          confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#8b5cf6', '#10b981', '#fde047']
          });

          if (Date.now() < end) {
            requestAnimationFrame(frame);
          }
        };
        frame();
        
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          // Triumphant chord
          [261.63, 329.63, 392.00, 523.25].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
            osc.start(ctx.currentTime + (i * 0.05));
            osc.stop(ctx.currentTime + 1.6);
          });
        } catch (e) {}

        // Auto-scroll to the bottom a bit after it renders
        setTimeout(() => scrollToBottom(), 300);
      }, 500);
    }
  }, [allStepsComplete, scrollToBottom]);

  // duplicate allStepsComplete effect removed — first useEffect above handles chord + scroll

  // ── Render ────────────────────────────────────────��─────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <AnimatePresence mode="wait">

        {/* ══ OBJECTIVE ══ */}
        {phase === "objective" && (
          <motion.div key="obj" initial={{ opacity: 0, y: 10, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(2px)" }} transition={{ duration: 0.3 }}
            className="flex-1 overflow-y-auto custom-scrollbar p-3.5 space-y-4">

            {/* Hero header */}
            <div className="bg-gradient-to-br from-violet-600/12 to-violet-600/3 border border-violet-500/15 rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-lg bg-violet-600/25 border border-violet-500/30 flex items-center justify-center">
                  <Brain size={13} className="text-violet-400"/>
                </div>
                <span className="text-white/70 text-[11px]" style={{ fontWeight: 600 }}>Tutor IA · Study Agent</span>
              </div>
              <p className="text-white/30 text-[10px] leading-relaxed">5–8 min por video. Preguntas adaptadas a tu nivel. Retención garantizada con Anki.</p>
            </div>

            {/* Objectives */}
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1"><Target size={9}/>¿Para qué estudias esto?</p>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_OBJECTIVES.map(obj => {
                  const active = selectedObj === obj.id;
                  return (
                    <button key={obj.id} onClick={() => { setSelectedObj(obj.id); setCustomObj(""); setRefinedObj(""); }}
                      className={`relative text-left p-3 rounded-xl border transition-all overflow-hidden ${active ? `bg-gradient-to-br ${obj.color} ${obj.border}` : "bg-white/3 border-white/7 hover:bg-white/5 hover:border-white/12"}`}>
                      {active && <div className="absolute top-2 right-2"><CheckCircle2 size={10} className={obj.accent}/></div>}
                      <span className="text-[12px] block mb-1.5 drop-shadow-md">{obj.icon}</span>
                      <p className={`text-[11px] leading-tight ${active ? "text-white/85" : "text-white/60"}`} style={{ fontWeight: 600 }}>{obj.title}</p>
                      <p className={`text-[9px] mt-0.5 ${active ? obj.accent : "text-white/28"}`}>{obj.sub}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom objective */}
            <div className="space-y-2">
              <p className="text-white/25 text-[10px] flex items-center gap-1"><Edit3 size={9}/>O escribe tu propio objetivo:</p>
              <textarea value={customObj}
                onChange={e => { setCustomObj(e.target.value); if (e.target.value.trim()) setSelectedObj("custom"); else setSelectedObj("spring-senisenior"); setRefinedObj(""); }}
                placeholder="Ej: Conseguir trabajo en fintech como Java dev en 3 meses…"
                className="w-full h-[44px] text-[11px] rounded-lg bg-black/25 border border-white/8 text-white/65 placeholder:text-white/16 p-2.5 resize-none outline-none focus:border-violet-500/30 transition-colors leading-relaxed"/>
              <AnimatePresence>
                {customObj.trim() && !refinedObj && (
                  <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={handleRefine} disabled={isRefining}
                    className="w-full h-7 rounded-lg bg-white/4 border border-white/8 text-white/40 hover:text-white/65 hover:bg-white/6 text-[11px] flex items-center justify-center gap-1.5 transition-all">
                    {isRefining ? <><Loader2 size={10} className="animate-spin"/>Refinando…</> : <><Sparkles size={10} className="text-violet-400"/>Refinar con IA</>}
                  </motion.button>
                )}
                {refinedObj && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="bg-violet-500/8 border border-violet-500/18 rounded-lg p-2.5 flex gap-2 items-start">
                    <p className="text-violet-300/70 text-[11px] leading-relaxed flex-1">{refinedObj}</p>
                    <button onClick={() => setRefinedObj("")} className="text-white/25 hover:text-white/50 shrink-0 mt-0.5"><X size={10}/></button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Course info */}
            <div className="space-y-1.5">
              <p className="text-white/20 text-[9px] uppercase tracking-wider">Datos del curso</p>
              <input value={courseName} onChange={e => setCourseName(e.target.value)} placeholder="Nombre del curso (para mazo Anki)"
                className="w-full h-8 text-[11px] rounded-lg bg-black/25 border border-white/7 text-white/60 placeholder:text-white/18 px-2.5 outline-none focus:border-violet-500/25 transition-colors"/>
              <input value={lessonName} onChange={e => setLessonName(e.target.value)} placeholder="Nombre del video/clase actual"
                className="w-full h-8 text-[11px] rounded-lg bg-black/25 border border-white/7 text-white/60 placeholder:text-white/18 px-2.5 outline-none focus:border-violet-500/25 transition-colors"/>
            </div>

            {/* Transcript indicator */}
            <div className="flex items-center gap-2.5 bg-emerald-500/6 border border-emerald-500/12 rounded-lg px-3 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"/>
              <span className="text-white/35 text-[11px]">Transcripción capturada</span>
              <span className="text-emerald-400 text-[11px] font-mono ml-auto">248 líneas</span>
            </div>

            {/* Generate CTA */}
            <button onClick={handleGenerate}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-700 to-violet-600 hover:from-violet-600 hover:to-violet-500 text-white text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-900/25 active:scale-[0.98]">
              <Wand2 size={13}/>Generar sesión de aprendizaje
              <ArrowRight size={13}/>
            </button>
          </motion.div>
        )}

        {/* ══ GENERATING ══ */}
        {phase === "generating" && (
          <motion.div key="gen" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
            {/* Pulsing brain */}
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-violet-500/15 animate-ping" style={{ animationDuration:"1.8s" }}/>
              <div className="absolute inset-[-6px] rounded-2xl bg-violet-500/8 animate-ping" style={{ animationDuration:"2.4s", animationDelay:"0.3s" }}/>
              <div className="relative w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
                <Brain size={24} className="text-violet-400"/>
              </div>
            </div>
            <div className="text-center">
              <p className="text-white/75 text-sm" style={{ fontWeight: 600 }}>Preparando tu sesión…</p>
              <p className="text-white/25 text-[11px] mt-0.5">IA local · calibrado a tu objetivo</p>
            </div>
            <div className="w-full space-y-2">
              {GEN_STEPS.map((s, i) => (
                <motion.div key={s} initial={{ opacity: 0.3 }} animate={{ opacity: i <= genStep ? 1 : 0.3 }} className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-all ${i < genStep ? "bg-emerald-500/15 border-emerald-500/30" : i === genStep ? "bg-violet-500/15 border-violet-500/30 animate-pulse" : "bg-white/4 border-white/8"}`}>
                    {i < genStep ? <Check size={8} className="text-emerald-400"/> : i === genStep ? <Loader2 size={8} className="text-violet-400 animate-spin"/> : <Circle size={6} className="text-white/15"/>}
                  </div>
                  <span className={`text-[11px] ${i <= genStep ? "text-white/65" : "text-white/20"}`}>{s}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ══ RESULT ══ */}
        {phase === "result" && content && (
          <motion.div key="result" initial={{ opacity: 0, y: 15, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.4, ease: "easeOut" }}
            ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">

            {/* Sticky header */}
            <div className="sticky top-0 z-20 bg-[#1c1d1f]/95 backdrop-blur-sm border-b border-white/6 px-3.5 py-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <BookOpen size={10} className="text-violet-400 shrink-0"/>
                  <span className="text-white/50 text-[10px] truncate" style={{ fontWeight: 500 }}>{lessonName}</span>
                </div>
                <button onClick={handleReset} className="flex items-center gap-1 text-[9px] text-white/20 hover:text-violet-400 transition-colors shrink-0 ml-2">
                  <RotateCcw size={8}/>Reiniciar
                </button>
              </div>
              <ProgressStepper steps={steps}/>
            </div>

            <div className="p-3 space-y-3">

              {/* Session complete banner */}
              <AnimatePresence>
                {sessionComplete && !allStepsComplete && (
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -6 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="bg-gradient-to-r from-emerald-600/15 to-violet-600/15 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3 relative overflow-hidden">
                    <motion.div 
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12"
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    />
                    <motion.span 
                      animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                      className="text-2xl shrink-0 relative z-10"
                    >
                      🎓
                    </motion.span>
                    <div className="relative z-10">
                      <p className="text-white/80 text-[11px]" style={{ fontWeight: 600 }}>¡Sesión completada!</p>
                      <p className="text-white/35 text-[10px] mt-0.5">Practicaste activamente. Exporta las tarjetas para no perder lo aprendido.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Relevance bar ── */}
              <div className="flex items-center gap-2 bg-white/3 border border-white/6 rounded-lg px-3 py-2">
                <div className="h-1 flex-1 bg-white/6 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${content.relevance.score}%` }}
                    transition={{ duration: 1, delay: 0.4, ease: "easeOut" }} className="h-full bg-emerald-500 rounded-full"/>
                </div>
                <span className="text-emerald-400 text-[10px] font-mono shrink-0">{content.relevance.score}%</span>
                <span className="text-white/20 text-[9px] shrink-0">relevancia</span>
              </div>

              {/* ── FOCUS NAV: dots ── */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 flex-1">
                  {steps.map((s, i) => {
                    const unlocked = stepUnlocked[i as 0|1|2|3|4];
                    const isCurrent = i === focusStep;
                    return (
                      <button key={i} onClick={() => goToStep(i)} disabled={!unlocked} title={s.label}
                        className={`rounded-full transition-all duration-300 outline-none ${isCurrent ? "w-6 h-2 bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" : s.done ? "w-2 h-2 bg-emerald-400/65 hover:bg-emerald-400 cursor-pointer" : unlocked ? "w-2 h-2 bg-white/25 hover:bg-white/45 cursor-pointer" : "w-2 h-2 bg-white/8 cursor-not-allowed"}`}
                      />
                    );
                  })}
                </div>
                <span className="text-[10px] text-white/30 font-mono tabular-nums shrink-0">{focusStep + 1} / 5</span>
              </div>

              {/* ── FOCUS NAV: label + prev/next ── */}
              <div className="flex items-center justify-between">
                <button onClick={() => goToStep(focusStep - 1)} disabled={!canGoPrev}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all ${canGoPrev ? "text-white/50 hover:bg-white/8 cursor-pointer" : "text-white/15 cursor-not-allowed"}`}>
                  <ChevronLeft size={12} /> Anterior
                </button>
                <p className="text-white/50 text-[10px]" style={{ fontWeight: 600 }}>{steps[focusStep]?.label}</p>
                <button onClick={() => goToStep(focusStep + 1)} disabled={!canGoNext}
                  title={!canGoNext && focusStep < 4 ? "Completa este paso primero" : ""}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] transition-all ${canGoNext ? "text-violet-400 hover:bg-violet-500/10 cursor-pointer" : "text-white/15 cursor-not-allowed"}`}>
                  Siguiente <ChevronRight size={12} />
                </button>
              </div>

              {/* ── FOCUS NAV: animated step ── */}
              <AnimatePresence custom={focusDir} mode="wait">
              <motion.div key={focusStep} custom={focusDir}
                variants={{
                  enter:  (d: number) => ({ x: d >= 0 ? 56 : -56, opacity: 0, scale: 0.98 }),
                  center: (_d: number) => ({ x: 0, opacity: 1, scale: 1 }),
                  exit:   (d: number) => ({ x: d >= 0 ? -56 : 56, opacity: 0, scale: 0.98 }),
                }}
                initial="enter" animate="center" exit="exit"
                transition={{ type: "spring", stiffness: 380, damping: 34 }}>

              {/* ── Step 0: Confidence ── */}
              {focusStep === 0 && (
              <div className="space-y-2.5">
                {/* Intro micro-copy */}
                <div className="flex items-start gap-2 px-1 pb-1">
                  <span className="text-[13px] shrink-0 mt-0.5">🧭</span>
                  <p className="text-white/35 text-[11px] leading-relaxed">Sé honesto — calibra todo lo que sigue. No hay respuesta incorrecta ni buena ni mala.</p>
                </div>

                <div className="bg-[#131315] border border-white/7 rounded-xl p-3.5">
                  <StepHeader n={1} label="¿Cómo llegaste al video?" subLabel="mi nivel" status={confidence ? "done" : "active"}/>
                  <div className="grid grid-cols-2 gap-2">
                    {CONFIDENCE.map(c => (
                      <motion.button
                        key={c.id}
                        onClick={() => handleConfidenceChange(c.id)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        className={`relative flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all overflow-hidden ${
                          confidence === c.id
                            ? `${c.bg} ${c.border} shadow-[0_0_18px_rgba(0,0,0,0.3)] ring-1 ${c.ring}`
                            : "bg-white/3 border-white/7 hover:bg-white/6 hover:border-white/14"
                        }`}>
                        {/* Shimmer on selected */}
                        {confidence === c.id && (
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 pointer-events-none"
                            animate={{ x: ["-100%", "200%"] }}
                            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 3 }}
                          />
                        )}
                        <motion.span
                          animate={confidence === c.id ? { scale: [1, 1.2, 1] } : {}}
                          transition={{ duration: 0.4 }}
                          className="text-xl leading-none shrink-0 relative z-10"
                        >{c.emoji}</motion.span>
                        <div className="relative z-10">
                          <p className={`text-[11px] leading-none transition-colors ${confidence === c.id ? c.label_c : "text-white/60"}`} style={{ fontWeight: 600 }}>{c.label}</p>
                          <p className="text-white/22 text-[9px] mt-0.5">{c.desc}</p>
                        </div>
                        {confidence === c.id && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-2 right-2 z-10">
                            <CheckCircle2 size={10} className={c.label_c} />
                          </motion.div>
                        )}
                      </motion.button>
                    ))}
                  </div>

                  {/* Coach bubble — appears after selection */}
                  <AnimatePresence>
                    {confidence && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 380, damping: 28, delay: 0.15 }}
                        className="mt-3 pt-3 border-t border-white/6 flex items-start gap-2.5"
                      >
                        <motion.span
                          animate={{ rotate: [0, -8, 8, -4, 0] }}
                          transition={{ duration: 0.5, delay: 0.3 }}
                          className="text-[18px] shrink-0 leading-none mt-0.5"
                        >{COACH_BUBBLE[confidence].emoji}</motion.span>
                        <div>
                          <p className="text-white/75 text-[11px] leading-none mb-1" style={{ fontWeight: 600 }}>{COACH_BUBBLE[confidence].title}</p>
                          <p className="text-white/38 text-[10px] leading-relaxed">{COACH_BUBBLE[confidence].tip}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              )}

              {/* ── Step 1: Key concepts ── */}
              {focusStep === 1 && confidence && (() => {
                const checkedCount = Object.values(conceptsChecked).filter(Boolean).length;
                const total = content.keyConcepts.length;
                const isReady = checkedCount >= 2;
                const isLocked = questionsComplete; // lock once questions are done
                return (
                <div ref={conceptsRef} className="space-y-2.5">
                  {/* Intro */}
                  <div className="flex items-start gap-2 px-1 pb-1">
                    <span className="text-[13px] shrink-0 mt-0.5">📌</span>
                    <p className="text-white/35 text-[11px] leading-relaxed">Marca solo los que realmente entendiste. Sin presión — es para calibrar, no para calificar.</p>
                  </div>

                  <div className="bg-[#131315] border border-white/7 rounded-xl overflow-hidden">
                    {/* Header with live counter */}
                    <div className="flex items-center justify-between px-3.5 pt-3.5 pb-1">
                      <StepHeader n={2} label="Lo que aprendiste" subLabel={isLocked ? "registrado ✓" : "marca los que te quedaron"} status={isReady ? "done" : "active"}/>
                      <motion.div
                        key={checkedCount}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`shrink-0 ml-2 mb-3.5 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-all ${
                          isReady
                            ? "bg-emerald-500/12 border-emerald-500/25 text-emerald-400"
                            : "bg-white/5 border-white/8 text-white/30"
                        }`}
                      >
                        {checkedCount}/{total}
                      </motion.div>
                    </div>

                    {/* Concept list */}
                    <div className="px-3.5 pb-3 space-y-1.5">
                      {content.keyConcepts.map((c, i) => (
                        <motion.button
                          key={i}
                          onClick={() => !isLocked && setConceptsChecked(p => ({ ...p, [i]: !p[i] }))}
                          whileHover={isLocked ? {} : { x: 2 }}
                          whileTap={isLocked ? {} : { scale: 0.98 }}
                          className={`w-full flex items-start gap-2.5 text-left rounded-lg px-2 py-1.5 transition-all group ${
                            isLocked ? "cursor-default" :
                            conceptsChecked[i] ? "bg-emerald-500/5" : "hover:bg-white/3"
                          }`}
                        >
                          <div className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                            conceptsChecked[i]
                              ? "bg-emerald-500/20 border-emerald-500/40 shadow-[0_0_8px_rgba(52,211,153,0.2)]"
                              : isLocked ? "border-white/8" : "border-white/12 group-hover:border-white/25"
                          }`}>
                            <AnimatePresence mode="wait">
                              {conceptsChecked[i] && (
                                <motion.div key="c" initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
                                  <Check size={9} className="text-emerald-400" strokeWidth={3}/>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <p className={`text-[11px] leading-relaxed transition-all ${
                            conceptsChecked[i] ? "text-white/30 line-through decoration-white/20" : "text-white/70 group-hover:text-white/85"
                          }`}>{c}</p>
                        </motion.button>
                      ))}
                    </div>

                    {/* "¡Listo para continuar!" CTA */}
                    <AnimatePresence>
                      {isReady && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mx-3 mb-3 bg-gradient-to-r from-emerald-600/15 to-emerald-600/5 border border-emerald-500/20 rounded-xl overflow-hidden relative">
                            <motion.div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/8 to-transparent skew-x-12 pointer-events-none"
                              animate={{ x: ["-100%", "200%"] }}
                              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                            />
                            <div className="flex items-center gap-2.5 p-2.5 relative z-10">
                              <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, delay: 0.2 }} className="text-[16px] shrink-0">✅</motion.span>
                              <div className="flex-1 min-w-0">
                                <p className="text-emerald-300/90 text-[11px]" style={{ fontWeight: 600 }}>¡Base sólida!</p>
                                <p className="text-white/35 text-[10px]">Confirma tu comprensión con preguntas reales.</p>
                              </div>
                            </div>
                            {/* CTA inline — no más scroll para buscar el botón */}
                            <button
                              onClick={() => goToStep(2)}
                              className="relative z-10 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 transition-colors py-2 text-white text-[10px]"
                              style={{ fontWeight: 600 }}
                            >
                              Verificar mi comprensión <ArrowRight size={11} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>

                  {/* Quick Win removido de aquí — aparece en "Practícalo" (paso 3) */}
                </div>
                );
              })()}

              {/* ── Step 2: Questions ── */}
              {focusStep === 2 && confidence && visibleQuestions.length > 0 && (() => {
                const doneCount = Object.values(questionFeedbacks).filter(f => f?.status === "done").length;
                return (
                <div ref={questionsRef} className="space-y-2.5">
                  {/* Intro */}
                  <div className="flex items-start gap-2 px-1 pb-1">
                    <p className="text-white/35 text-[11px] leading-relaxed">
                      {questionsComplete
                        ? "Toca cada pregunta para revisar tu respuesta y el feedback de la IA."
                        : "Escribe con tus propias palabras. Lo que recuerdes ahora es lo que realmente retiene tu cerebro."}
                    </p>
                  </div>

                {/* Review mode — when questionsComplete, show the summary instead of the card */}
                {questionsComplete && (
                  <VerifyDoneReview
                    questions={visibleQuestions}
                    answers={questionAnswers}
                    feedbacks={questionFeedbacks}
                    onGoApply={() => goToStep(3)}
                  />
                )}
                <div className={`bg-[#131315] border border-white/7 rounded-xl overflow-hidden ${questionsComplete ? "hidden" : ""}`}>
                    <div className="px-3.5 pt-3.5 pb-2.5 border-b border-white/5">
                      <div className="flex items-center justify-between">
                        <StepHeader n={3} label="¿Cuánto retuviste?" status={questionsComplete ? "done" : "active"}/>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2 pb-3.5">
                          {visibleQuestions.map((_, i) => {
                              const fb = questionFeedbacks[i];
                              const isDone = fb?.status === "done";
                              const isCurrent = i === currentQIdx && !questionsComplete;
                              const rating = fb?.rating;
                              const dotColor = isDone
                                ? rating === "correct" || rating === "excellent"
                                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
                                  : rating === "partial"
                                    ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]"
                                    : rating === "wrong"
                                      ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]"
                                      : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
                                : isCurrent
                                  ? "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.7)]"
                                  : "bg-white/15";
                              return (
                                <motion.div key={i}
                                  animate={{ width: (isDone || isCurrent) ? 14 : 6, height: 6 }}
                                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                                  className={`rounded-full ${dotColor} transition-shadow duration-300`}
                                />
                              );
                            })}
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="h-[2px] w-full bg-white/5 rounded-full overflow-hidden -mt-1">
                        <motion.div
                          className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: questionsComplete ? "100%" : `${(doneCount / Math.max(visibleQuestions.length, 1)) * 100}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </div>
                    </div>

                    <div className="p-3.5">
                      {questionsComplete ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4 space-y-2 relative">
                          <div className="hidden">���</div>
                          <p className="text-emerald-400 text-[13px] relative z-10 pt-3" style={{ fontWeight: 600 }}>¡Comprensión verificada!</p>
                          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none animate-[spin_15s_linear_infinite]" />
                          <div className="text-4xl drop-shadow-[0_0_15px_rgba(52,211,153,0.3)] relative z-10 animate-[bounce_2s_ease-in-out_infinite] mt-2">🚀</div>
                          <p className="text-white/40 text-[10px] relative z-10 pt-1">La IA confirmó que captaste los conceptos clave. Continúa con el desafío práctico.</p>
                        </motion.div>
                      ) : (
                        <>
                          {visibleQuestions.map((q, i) => i !== currentQIdx ? null : (
                            <motion.div key={`q-${i}-${confidence}`} initial={{ opacity: 0, x: 12, scale: 0.99 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: "spring", stiffness: 360, damping: 28 }} className="space-y-3">


                              {/* Question header: number + bloom */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-white/22 text-[10px] font-mono">{i+1} <span className="text-white/12">/</span> {visibleQuestions.length}</span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md border ${BLOOM_STYLE(q.bloom)}`}>{q.bloom}</span>
                                </div>
                              </div>

                              {/* Question text — prominent */}
                              <p className="text-white/85 text-[12px] leading-relaxed whitespace-pre-line">{q.q}</p>

                              {/* Hint — collapsible callout */}
                              <button onClick={() => setShowHint(v => !v)}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                                  showHint
                                    ? "bg-amber-500/8 border-amber-500/20 text-amber-300/80"
                                    : "bg-white/3 border-white/7 text-white/28 hover:text-white/50 hover:border-white/14"
                                }`}>
                                <Sparkles size={9} className="shrink-0 text-amber-400/60" />
                                <span className="text-[10px] flex-1">{showHint ? "Ocultar pista" : "Ver pista"}</span>
                                <ChevronDown size={9} className={`shrink-0 transition-transform ${showHint ? "rotate-180" : ""}`} />
                              </button>
                              <AnimatePresence>
                                {showHint && (
                                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden -mt-1">
                                    <div className="bg-amber-500/6 border border-amber-500/14 rounded-xl px-3 py-2.5 text-[11px] text-amber-300/70 leading-relaxed">
                                      {q.hint}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* Answer textarea — reacts to rating */}
                              {(() => {
                                const qfb = questionFeedbacks[i];
                                const ratingBorder =
                                  qfb?.status === "done" && (qfb.rating === "correct" || qfb.rating === "excellent")
                                    ? "border-emerald-500/30 shadow-[0_0_14px_rgba(16,185,129,0.06)]"
                                    : qfb?.status === "done" && qfb.rating === "partial"
                                    ? "border-amber-500/25"
                                    : qfb?.status === "done" && qfb.rating === "wrong"
                                    ? "border-rose-500/22"
                                    : "border-white/8 focus:border-violet-500/35";
                                return (
                                  <div className="relative">
                                    <textarea value={questionAnswers[i] || ""}
                                      onChange={e => setQuestionAnswers(p => ({ ...p, [i]: e.target.value }))}
                                      placeholder="Escribe tu respuesta con tus propias palabras…"
                                      className={`w-full h-[80px] text-[11px] rounded-xl bg-black/35 border px-3 py-2.5 resize-none outline-none transition-all leading-relaxed text-white/72 placeholder:text-white/18 ${ratingBorder}`}/>
                                    {(questionAnswers[i]?.length ?? 0) > 0 && (
                                      <span className="absolute bottom-2 right-2.5 text-[9px] text-white/18 font-mono pointer-events-none">
                                        {questionAnswers[i].length}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Action row */}
                              <div className="flex items-center gap-2">
                                <button onClick={() => handleEvalQuestion(i)}
                                  disabled={!questionAnswers[i]?.trim() || questionFeedbacks[i]?.status === "loading"}
                                  className={`flex items-center gap-1.5 text-[10px] text-white px-3 py-1.5 rounded-lg transition-all ${
                                    questionAnswers[i]?.trim()
                                      ? "bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-900/30"
                                      : "bg-white/8 opacity-40 cursor-not-allowed"
                                  }`}>
                                  {questionFeedbacks[i]?.status === "loading"
                                    ? <><Loader2 size={10} className="animate-spin"/>Analizando…</>
                                    : <><Wifi size={10}/>Evaluar</>}
                                </button>

                                {/* Siguiente / Continuar — appears after feedback */}
                                {questionFeedbacks[i]?.status === "done" && (() => {
                                  const isLast = i >= visibleQuestions.length - 1;
                                  const isGood = questionFeedbacks[i]?.rating === "correct" || questionFeedbacks[i]?.rating === "excellent";
                                  return (
                                    <motion.button
                                      initial={{ opacity: 0, scale: 0.9, x: -6 }}
                                      animate={{ opacity: 1, scale: 1, x: 0 }}
                                      transition={{ type: "spring", stiffness: 400, damping: 24, delay: 0.15 }}
                                      onClick={() => isLast ? handleForceComplete() : (setCurrentQIdx(i+1), setShowHint(false), setShowModelAnswer(false))}
                                      className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg transition-all ml-auto ${
                                        isGood
                                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30"
                                          : "border border-violet-500/25 bg-violet-500/8 text-violet-300/80 hover:text-violet-200 hover:border-violet-500/40"
                                      }`}
                                    >
                                      {isLast
                                        ? <>{isGood ? "✅" : "→"} Ir al desafío <ArrowRight size={9}/></>
                                        : <>{isGood ? "✅" : "→"} Siguiente <ArrowRight size={9}/></>
                                      }
                                    </motion.button>
                                  );
                                })()}
                              </div>

                              {/* AI Feedback */}
                              <AIFeedback
                                fb={questionFeedbacks[i] || IDLE_FB}
                                onRetry={() => handleEvalQuestion(i)}
                                onShowHint={() => setShowHint(true)}
                                onShowModel={() => setShowModelAnswer(true)}
                                onClearAnswer={() => setQuestionAnswers(p => ({ ...p, [i]: "" }))}
                              />

                              {/* Model answer — collapsible */}
                              {questionFeedbacks[i]?.status === "done" && (
                                <>
                                  <button onClick={() => setShowModelAnswer(v => !v)}
                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                                      showModelAnswer
                                        ? "bg-white/5 border-white/10 text-white/55"
                                        : "border-white/6 text-white/25 hover:text-white/45 hover:border-white/12"
                                    }`}>
                                    <span className="text-[10px] flex-1">Respuesta modelo</span>
                                    <ChevronDown size={9} className={`shrink-0 transition-transform text-white/30 ${showModelAnswer ? "rotate-180" : ""}`}/>
                                  </button>
                                  <AnimatePresence>
                                    {showModelAnswer && (
                                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden -mt-1">
                                        <div className="bg-white/3 border border-white/8 rounded-xl px-3 py-2.5 text-[11px] text-white/50 leading-relaxed whitespace-pre-line">
                                          {q.answer}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </>
                              )}
                            </motion.div>
                          ))}
                          {/* Escape hatch — always visible, not a trap */}
                          {!questionsComplete && (
                            <button onClick={handleForceComplete} className="mt-1 w-full text-[9px] text-white/15 hover:text-white/38 transition-colors py-1 flex items-center justify-center gap-1">
                              <FastForward size={8}/>Saltar al desafío práctico
                            </button>
                          )}
                        </>
                      )}
                    </div>
                </div>
                </div>
                );
              })()}

              {/* ── Step 3: Apply ── */}
              {focusStep === 3 && (
                showApply ? (
                <div className="space-y-2.5">
                  {/* Intro motivational */}
                  <div className="flex items-start gap-2 px-1 pb-1">
                    <span className="text-[13px] shrink-0 mt-0.5">🛠️</span>
                    <p className="text-white/35 text-[11px] leading-relaxed">El código imperfecto que escribas ahora vale más que la solución perfecta que copiaste. Intenta, equivócate, aprende.</p>
                  </div>

                  <div ref={applyRef} className="bg-[#131315] border border-white/7 rounded-xl overflow-hidden">
                    <div className="px-3.5 pt-3.5 pb-2">
                      <StepHeader n={4} label="Escribe código real" subLabel="desafío práctico" status={appFeedback.status === "done" ? "done" : "active"}/>
                    </div>

                    {/* Setup context */}
                    <div className="mx-3.5 mb-2.5 bg-violet-500/7 border border-violet-500/14 rounded-xl p-2.5 flex items-start gap-2">
                      <span className="text-[12px] shrink-0">📋</span>
                      <p className="text-white/50 text-[11px] leading-relaxed">{content.application.setup}</p>
                    </div>

                    {/* Code block */}
                    <pre className="mx-3.5 mb-3 bg-black/50 border border-white/6 rounded-xl p-3 text-[10px] text-emerald-300/80 overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap shadow-inner">{content.application.challenge}</pre>

                    <div className="px-3.5 pb-3.5 space-y-2.5">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Wifi size={9} className="text-violet-400/50"/>
                        <p className="text-white/28 text-[10px]">
                          {content.application.isCode ? "Escribe tu implementación — la IA la revisará:" : "Escribe tu respuesta — la IA la revisará:"}
                        </p>
                      </div>
                      <div className="relative">
                        <textarea value={appAnswer} onChange={e => setAppAnswer(e.target.value)}
                          placeholder={content.application.isCode ? "// Tu solución aquí…" : "Tu respuesta aquí…"}
                          className={`w-full h-[90px] text-[11px] rounded-xl bg-black/40 border px-3 py-2.5 resize-none outline-none transition-all leading-relaxed font-mono shadow-inner text-emerald-300/80 placeholder:text-white/14 ${
                            appFeedback.status === "done" && (appFeedback.rating === "correct" || appFeedback.rating === "excellent")
                              ? "border-emerald-500/30 shadow-[0_0_14px_rgba(16,185,129,0.06)]"
                              : appFeedback.status === "done" && appFeedback.rating === "partial"
                              ? "border-amber-500/25"
                              : appFeedback.status === "done" && appFeedback.rating === "wrong"
                              ? "border-rose-500/22"
                              : "border-white/8 focus:border-violet-500/30"
                          }`}/>
                        {appAnswer.length > 0 && (
                          <span className="absolute bottom-2 right-2.5 text-[9px] text-white/18 font-mono pointer-events-none">{appAnswer.length}</span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={handleEvalApp} disabled={!appAnswer.trim() || appFeedback.status === "loading"}
                          className={`flex items-center gap-1.5 text-[10px] text-white px-3 py-1.5 rounded-lg transition-all ${
                            appAnswer.trim()
                              ? "bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-900/30"
                              : "bg-white/8 opacity-40 cursor-not-allowed"
                          }`}>
                          {appFeedback.status === "loading" ? <><Loader2 size={10} className="animate-spin"/>Revisando…</> : <><Send size={10}/>Revisar con IA</>}
                        </button>
                        <button onClick={() => setShowAppSolution(v => !v)}
                          className={`flex items-center gap-1.5 text-[10px] border px-2.5 py-1.5 rounded-lg transition-all ${showAppSolution ? "bg-white/5 border-white/12 text-white/55" : "border-white/7 text-white/25 hover:text-white/45 hover:border-white/14"}`}>
                          <ChevronDown size={9} className={`transition-transform ${showAppSolution ? "rotate-180" : ""}`}/>
                          {showAppSolution ? "Ocultar" : "Ver"} solución
                        </button>
                      </div>
                      <AIFeedback
                        fb={appFeedback}
                        onRetry={handleEvalApp}
                        onClearAnswer={() => setAppAnswer("")}
                        onShowModel={() => setShowAppSolution(true)}
                      />
                      <AnimatePresence>
                        {showAppSolution && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-emerald-500/5 border border-emerald-500/12 rounded-xl overflow-hidden">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-emerald-500/10">
                                <span className="text-[9px] text-emerald-400/60 uppercase tracking-wider" style={{ fontWeight: 600 }}>Solución de referencia</span>
                              </div>
                              <pre className="p-2.5 text-[10px] text-emerald-300/75 overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap">{content.application.solution}</pre>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Quick Win — Acción inmediata (aquí sí tiene sentido: ya practicaste, ahora aplícalo en el mundo real) */}
                      {content.quickWin && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                          className="relative overflow-hidden rounded-xl border border-amber-500/18 bg-gradient-to-br from-amber-500/6 to-transparent"
                        >
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/4 to-transparent skew-x-12 pointer-events-none"
                            animate={{ x: ["-100%", "250%"] }}
                            transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 7 }}
                          />
                          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 border-b border-amber-500/10 relative z-10">
                            <Zap size={10} className="text-amber-400 shrink-0" />
                            <span className="text-amber-400/75 text-[9px] uppercase tracking-widest" style={{ fontWeight: 700 }}>Llévalo al mundo real · bonus</span>
                            <span className="text-white/18 text-[9px] ml-auto">~2 min</span>
                          </div>
                          <div className="px-3 py-2.5 relative z-10">
                            <p className="text-white/35 text-[9px] mb-1.5">Ya practicaste el concepto. Ahora aplícalo en un proyecto real.</p>
                            <p className="text-white/60 text-[11px] leading-relaxed">{content.quickWin}</p>
                          </div>
                        </motion.div>
                      )}

                      {/* Ir a Anki — appears once evaluation is done */}
                      <AnimatePresence>
                        {appFeedback.status === "done" && (
                          <motion.button
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4, type: "spring", stiffness: 380, damping: 26 }}
                            onClick={() => goToStep(4)}
                            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-[10px] transition-all ${
                              appFeedback.rating === "correct" || appFeedback.rating === "excellent"
                                ? "bg-violet-600 hover:bg-violet-500 border-violet-500/40 text-white shadow-md shadow-violet-900/30"
                                : "border-white/10 text-white/40 hover:text-white/65 hover:border-white/20"
                            }`}
                          >
                            {appFeedback.rating === "correct" || appFeedback.rating === "excellent"
                              ? <>🎯 Fíjalo en memoria <ArrowRight size={10}/></>
                              : <>Continuar de todas formas <ArrowRight size={10}/></>
                            }
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
                ) : (
                  <div className="bg-[#131315] border border-white/5 rounded-xl p-3.5 opacity-35">
                    <StepHeader n={4} label="Escribe código real" subLabel="desafío práctico" status="pending"/>
                    <div className="h-10 bg-white/3 rounded-lg flex items-center justify-center">
                      <Lock size={11} className="text-white/18 mr-1.5"/>
                      <span className="text-white/18 text-[10px]">Completa las preguntas primero</span>
                    </div>
                  </div>
                )
              )}

              {/* ── Step 4: Interview + Next action + Anki ── */}
              {focusStep === 4 && (() => {
                const correctCount = Object.values(questionFeedbacks).filter(f => f?.rating === "correct" || f?.rating === "excellent").length;
                const totalQ = visibleQuestions.length;
                const elapsedMin = Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 60000));
                return (
              <div className="space-y-2.5">
                {/* Session achievement summary */}
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 340, damping: 28 }}
                  className="bg-gradient-to-r from-emerald-600/10 via-violet-600/10 to-emerald-600/10 border border-white/8 rounded-xl p-3 flex items-center gap-3 relative overflow-hidden"
                >
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/3 to-transparent skew-x-12"
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 4 }}
                  />
                  <motion.span animate={{ rotate: [0, -8, 8, 0] }} transition={{ duration: 0.6, delay: 0.3 }} className="text-2xl relative z-10">🏁</motion.span>
                  <div className="flex-1 relative z-10">
                    <p className="text-white/80 text-[11px]" style={{ fontWeight: 600 }}>¡Llegaste al último paso!</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-emerald-400/80 text-[10px] flex items-center gap-1"><Check size={8} strokeWidth={3}/>{Object.values(conceptsChecked).filter(Boolean).length} conceptos</span>
                      {totalQ > 0 && <span className="text-violet-400/80 text-[10px] flex items-center gap-1"><Check size={8} strokeWidth={3}/>{correctCount}/{totalQ} preguntas</span>}
                      <span className="text-white/25 text-[10px]">~{elapsedMin} min</span>
                    </div>
                  </div>
                </motion.div>

              {content.interviewQ && (
                <div className="bg-[#131315] border border-sky-500/18 rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-sky-500/6 border-b border-sky-500/12">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/12 border border-sky-500/22 flex items-center justify-center shrink-0">
                      <Star size={11} className="text-sky-400"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sky-300/90 text-[11px]" style={{ fontWeight: 600 }}>Pregunta de entrevista</p>
                      <p className="text-white/25 text-[9px]">Practica tu respuesta en voz alta</p>
                    </div>
                  </div>
                  <div className="px-3.5 py-3 space-y-2.5">
                    <p className="text-white/75 text-[12px] leading-relaxed">{content.interviewQ.q}</p>
                    <button onClick={() => setShowInterviewAnswer(v => !v)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                        showInterviewAnswer
                          ? "bg-sky-500/8 border-sky-500/20 text-sky-300/80"
                          : "border-white/7 text-white/28 hover:text-white/50 hover:border-white/14"
                      }`}>
                      <span className="text-[10px] flex-1">Estructura de respuesta ideal</span>
                      <ChevronDown size={9} className={`shrink-0 transition-transform text-white/30 ${showInterviewAnswer ? "rotate-180" : ""}`}/>
                    </button>
                    <AnimatePresence>
                      {showInterviewAnswer && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden -mt-1">
                          <div className="bg-sky-500/5 border border-sky-500/12 rounded-xl px-3 py-2.5 text-[11px] text-white/50 leading-relaxed">{content.interviewQ.idealAnswer}</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {showApply && focusStep === 4 && (
                <div className="relative overflow-hidden rounded-xl border border-violet-500/18 bg-gradient-to-br from-violet-500/8 to-violet-500/3">
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 border-b border-violet-500/10">
                    <ArrowRight size={10} className="text-violet-400 shrink-0"/>
                    <span className="text-violet-400/70 text-[9px] uppercase tracking-widest" style={{ fontWeight: 700 }}>Próximo paso concreto</span>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-white/62 text-[11px] leading-relaxed">{content.nextAction}</p>
                  </div>
                </div>
              )}

              {/* ── Step 4 Anki ── */}
              {focusStep === 4 && confidence && (
                  <div ref={ankiRef} className={`rounded-xl border overflow-hidden transition-all duration-500 ${showApply ? "border-violet-500/22" : "border-white/7 opacity-60"}`}>
                    <div className={`px-3.5 py-2.5 flex items-center justify-between border-b transition-all ${showApply ? "bg-violet-500/8 border-violet-500/15" : "bg-white/3 border-white/6"}`}>
                      <div className="flex items-center gap-2">
                        <Repeat2 size={12} className={showApply ? "text-violet-400" : "text-white/30"}/>
                        <span className={`text-[11px] ${showApply ? "text-violet-300" : "text-white/40"}`} style={{ fontWeight: 600 }}>Fíjalo en memoria</span>
                        {!showApply && <Lock size={9} className="text-white/18"/>}
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${showApply ? "text-violet-400/70 bg-violet-500/10 border-violet-500/20" : "text-white/20 bg-white/4 border-white/8"}`}>{content.ankiCards.length} tarjetas</span>
                    </div>
                    <div className="p-3 space-y-3">
                      <p className="text-white/28 text-[11px] leading-relaxed">
                        {showApply ? "Exporta ahora estas tarjetas. Anki las programa automáticamente para que las repases justo antes de olvidarlas — así el conocimiento dura meses." : "Disponible una vez que completes el desafío práctico."}
                      </p>
                      <AnkiFlipPreview cards={content.ankiCards}/>

                      {/* File info */}
                      {isFirstExport ? (
                        <div className="bg-amber-500/7 border border-amber-500/16 rounded-xl p-2.5 space-y-2">
                          <div className="flex items-center gap-1.5">
                            <FolderPlus size={11} className="text-amber-400 shrink-0"/>
                            <p className="text-amber-300/80 text-[11px]" style={{ fontWeight: 500 }}>Primera exportación — se descargan 3 archivos</p>
                          </div>
                          <div className="space-y-1.5 pl-1 border-t border-amber-500/10 pt-1.5">
                            {[
                              { icon:"📄", name:`${lessonName.replace(/[^a-z0-9]/gi,"_")}_tarjetas.txt`, desc:"→ Archivo → Importar en Anki" },
                              { icon:"🎨", name:"anki-card-styles.css",  desc:"→ Tipos de notas → Basic → Styling" },
                              { icon:"📋", name:"PLANTILLA-ANKI.txt",    desc:"→ Tipos de notas → Basic → Tarjetas" },
                            ].map(f => (
                              <div key={f.name} className="flex items-start gap-1.5">
                                <span className="text-[10px] shrink-0 mt-0.5">{f.icon}</span>
                                <p className="text-[10px] text-white/30"><span className="text-amber-300/60 font-mono">{f.name}</span><span className="text-white/22"> {f.desc}</span></p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-emerald-500/7 border border-emerald-500/16 rounded-xl p-2.5">
                          <FolderSync size={11} className="text-emerald-400 shrink-0"/>
                          <div>
                            <p className="text-emerald-300/75 text-[11px]" style={{ fontWeight: 500 }}>Agregar al mazo existente — 1 archivo</p>
                            <p className="text-white/25 text-[10px] mt-0.5 font-mono">{lessonName.replace(/[^a-z0-9]/gi,"_")}_tarjetas.txt <span className="font-sans">→ Archivo → Importar</span></p>
                          </div>
                        </div>
                      )}

                      {/* ── Export buttons row ── */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {/* TXT export (manual import) */}
                        <button onClick={handleExport} disabled={!showApply}
                          className={`h-9 rounded-xl text-white text-[10px] flex items-center justify-center gap-1.5 transition-all ${!showApply ? "bg-white/6 opacity-40 cursor-not-allowed" : "bg-white/8 hover:bg-white/12 border border-white/10 hover:border-white/18 active:scale-[0.98]"}`}>
                          <FileDown size={11}/>.txt
                        </button>

                        {/* .apkg export (direct double-click import) */}
                        <button onClick={handleExportApkg} disabled={!showApply || apkgStatus === "loading"}
                          className={`h-9 rounded-xl text-white text-[10px] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
                            !showApply || apkgStatus === "loading"
                              ? "bg-white/6 opacity-40 cursor-not-allowed"
                              : apkgStatus === "done"
                                ? "bg-emerald-700 hover:bg-emerald-600"
                                : apkgStatus === "error"
                                  ? "bg-red-700/70 hover:bg-red-700"
                                  : "bg-violet-700 hover:bg-violet-600"
                          }`}>
                          {apkgStatus === "loading"
                            ? <><Loader2 size={10} className="animate-spin"/><span className="truncate max-w-[80px]">{apkgProgress}</span></>
                            : apkgStatus === "done"
                              ? <><CheckCircle2 size={10}/>Exportado!</>
                              : apkgStatus === "error"
                                ? <><X size={10}/>Error</>
                                : <><Package size={10}/>.apkg</>
                          }
                        </button>
                      </div>

                      {/* apkg description */}
                      <p className="text-white/20 text-[9px] leading-relaxed px-0.5">
                        <span className="text-violet-400/60">.apkg</span> = importación directa con doble clic (no requiere configuración).
                        <span className="text-white/15"> .txt</span> = exportación manual + CSS + plantilla.
                      </p>

                      <button onClick={() => setShowAnkiGuide(v => !v)}
                        className="w-full text-[10px] text-white/22 hover:text-white/45 flex items-center justify-center gap-1 transition-colors">
                        <Info size={9}/>{showAnkiGuide ? "Ocultar" : "Ver"} guía de importación paso a paso
                      </button>
                      <AnimatePresence>
                        {showAnkiGuide && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-black/25 border border-white/7 rounded-xl p-3 space-y-3">
                              {isFirstExport ? (
                                <>
                                  <p className="text-white/45 text-[11px]" style={{ fontWeight: 600 }}>Setup inicial · solo una vez</p>
                                  {[
                                    { file:"anki-card-styles.css", color:"text-amber-300/60", steps:["Ábrelo con cualquier editor (Notepad, VS Code…)","Selecciona todo (Ctrl+A) y cópialo","En Anki: Herramientas → Tipos de notas → Basic → Styling","Selecciona todo, pega el CSS y guarda"] },
                                    { file:"PLANTILLA-ANKI.txt",   color:"text-sky-300/60",   steps:["Ábrelo y ve al final del archivo","Herramientas → Tipos de notas → Basic → Tarjetas","Anverso: selecciona todo → pega el bloque FRONT","Reverso: selecciona todo → pega el bloque BACK → guarda"] },
                                    { file:`${lessonName.replace(/[^a-z0-9]/gi,"_")}_tarjetas.txt`, color:"text-emerald-300/60", steps:["En Anki: Archivo → Importar → selecciona este archivo","Separador: Tabulador | HTML: activado","Clic en Importar"] },
                                  ].map(({ file, color, steps }) => (
                                    <div key={file} className="space-y-1 pt-2 border-t border-white/5">
                                      <p className={`font-mono text-[10px] ${color}`}>{file}</p>
                                      {steps.map((s,i) => <p key={i} className="text-white/28 text-[10px] leading-relaxed pl-2">{i+1}. {s}</p>)}
                                    </div>
                                  ))}
                                </>
                              ) : (
                                <>
                                  <p className="text-white/45 text-[11px]" style={{ fontWeight: 600 }}>Agregar tarjetas al mazo existente</p>
                                  {["Archivo → Importar en Anki",`Selecciona "${lessonName.replace(/[^a-z0-9]/gi,"_")}_tarjetas.txt"`,"Separador: Tabulador | HTML: activado","Clic en Importar — las tarjetas nuevas se añaden sin duplicar"].map((s,i) => (
                                    <p key={i} className="text-white/28 text-[10px] leading-relaxed">{i+1}. {s}</p>
                                  ))}
                                </>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                </div>
              )}
              </div>
              );
              })()}
              </motion.div>
              </AnimatePresence>

              {/* Grand 5/5 Completion Banner */}
              <AnimatePresence>
                {allStepsComplete && (() => {
                  const correctFinal = Object.values(questionFeedbacks).filter(f => f?.rating === "correct" || f?.rating === "excellent").length;
                  const totalQFinal = visibleQuestions.length;
                  const elapsedFinal = Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 60000));
                  const conceptsFinal = Object.values(conceptsChecked).filter(Boolean).length;
                  return (
                  <motion.div
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", damping: 20, stiffness: 300, delay: 0.2 }}
                    className="relative mt-2 mb-6 rounded-[18px] overflow-hidden p-[1px] group mx-1"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-violet-500 to-emerald-500 opacity-20 blur-xl group-hover:opacity-30 transition-opacity duration-1000 animate-[pulse_4s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-violet-400 to-emerald-400 rounded-[18px] opacity-40" />
                    <div className="relative bg-[#121214]/90 backdrop-blur-xl rounded-[17px] p-5 text-center h-full border border-white/10 shadow-2xl">
                      {/* Trophy */}
                      <motion.div
                        animate={{ scale: [1, 1.15, 1], rotate: [0, -8, 8, -4, 4, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2.5 }}
                        className="text-4xl mb-3 drop-shadow-[0_0_20px_rgba(167,139,250,0.5)] inline-block"
                      >🏆</motion.div>
                      <h3 className="text-white text-[16px] mb-1 tracking-tight" style={{ fontWeight: 600 }}>¡Sesión 100% completada!</h3>
                      <p className="text-white/40 text-[10px] mb-4 max-w-[200px] mx-auto leading-relaxed">Conocimiento consolidado y tarjetas listas. El instructor puede continuar.</p>

                      {/* Stats row */}
                      <div className="flex items-center justify-center gap-3 mb-4">
                        {[
                          { icon: "📌", value: conceptsFinal, label: "conceptos" },
                          { icon: "✅", value: `${correctFinal}/${totalQFinal}`, label: "correctas" },
                          { icon: "⏱️", value: `${elapsedFinal}m`, label: "sesión" },
                        ].map(s => (
                          <motion.div
                            key={s.label}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 400, delay: 0.4 }}
                            className="flex flex-col items-center gap-0.5 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                          >
                            <span className="text-[13px]">{s.icon}</span>
                            <span className="text-white/80 text-[12px] font-mono" style={{ fontWeight: 600 }}>{s.value}</span>
                            <span className="text-white/30 text-[9px]">{s.label}</span>
                          </motion.div>
                        ))}
                      </div>

                      <div className="inline-flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5">
                        <Loader2 size={10} className="text-violet-500 animate-spin" />
                        <span className="text-violet-500 text-[10px] tracking-[0.12em] uppercase font-medium">Esperando siguiente video…</span>
                      </div>
                    </div>
                  </motion.div>
                  );
                })()}
              </AnimatePresence>

              <div className="h-5"/>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
