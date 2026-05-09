import React, { useState, useEffect } from "react";
import { Timer, BrainCircuit, Activity, Play, Pause, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import type { Session } from "@supabase/supabase-js";

export function LearningToolsTab({ session }: { session?: Session }) {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<"pomodoro" | "shortBreak" | "longBreak">("pomodoro");
  const sessionLabel = session?.user.email?.trim() || "Modo invitado";

  useEffect(() => {
    let interval: number | undefined;
    if (isRunning && timeLeft > 0) {
      interval = window.setInterval(() => setTimeLeft((current) => current - 1), 1000);
    } else if (timeLeft === 0 && isRunning) {
      setIsRunning(false);
      try {
        const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
          const ctx = new AudioContextCtor();
          const osc = ctx.createOscillator();
          osc.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 1);
          osc.start();
          osc.stop(ctx.currentTime + 1);
        }
      } catch {
        // ignore audio failures
      }
      toast("¡Tiempo terminado!", { icon: <Timer className="text-amber-400" size={18} /> });
    }
    return () => {
      if (interval) {
        window.clearInterval(interval);
      }
    };
  }, [isRunning, timeLeft]);

  const toggleTimer = () => setIsRunning((current) => !current);

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(mode === "pomodoro" ? 25 * 60 : mode === "shortBreak" ? 5 * 60 : 15 * 60);
  };

  const changeMode = (nextMode: "pomodoro" | "shortBreak" | "longBreak") => {
    setMode(nextMode);
    setIsRunning(false);
    setTimeLeft(nextMode === "pomodoro" ? 25 * 60 : nextMode === "shortBreak" ? 5 * 60 : 15 * 60);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full space-y-6 p-5 text-white/90">
      <div>
        <h3 className="text-[13px] font-semibold text-white mb-1">Herramientas de Aprendizaje</h3>
        <p className="text-[11px] text-white/50">Técnicas de enfoque para maximizar tu retención.</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-white/28">{sessionLabel}</p>
      </div>

      <div className="bg-black/20 border border-white/10 rounded-xl p-5 flex flex-col items-center">
        <div className="flex items-center gap-2 text-white/60 text-[11px] font-medium uppercase tracking-wider mb-6">
          <Timer size={14} /> Timer Pomodoro
        </div>

        <div className="flex gap-2 mb-8 bg-white/5 p-1 rounded-lg border border-white/5">
          <button
            onClick={() => changeMode("pomodoro")}
            className={`px-3 py-1.5 rounded-md text-[10px] transition-colors ${mode === "pomodoro" ? "bg-red-500/20 text-red-300 font-medium" : "text-white/40 hover:text-white/80"}`}
          >
            Enfoque
          </button>
          <button
            onClick={() => changeMode("shortBreak")}
            className={`px-3 py-1.5 rounded-md text-[10px] transition-colors ${mode === "shortBreak" ? "bg-emerald-500/20 text-emerald-300 font-medium" : "text-white/40 hover:text-white/80"}`}
          >
            Pausa Corta
          </button>
          <button
            onClick={() => changeMode("longBreak")}
            className={`px-3 py-1.5 rounded-md text-[10px] transition-colors ${mode === "longBreak" ? "bg-sky-500/20 text-sky-300 font-medium" : "text-white/40 hover:text-white/80"}`}
          >
            Pausa Larga
          </button>
        </div>

        <motion.div
          animate={{ scale: isRunning ? [1, 1.02, 1] : 1 }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-5xl font-light tracking-wider font-mono text-white mb-8"
        >
          {formatTime(timeLeft)}
        </motion.div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTimer}
            className={`flex items-center justify-center w-12 h-12 rounded-full border transition-all shadow-lg ${isRunning ? "bg-white/10 border-white/20 text-white" : "bg-white text-black border-white hover:scale-105"}`}
          >
            {isRunning ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-1" />}
          </button>
          <button
            onClick={resetTimer}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-black/20 border border-white/10 rounded-xl p-4 flex flex-col gap-2 items-start cursor-pointer hover:bg-white/5 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
            <Activity size={14} className="text-violet-400" />
          </div>
          <p className="text-[12px] font-medium text-white/80 mt-1">Estadísticas</p>
          <p className="text-[10px] text-white/40 leading-relaxed">Analiza tus tiempos de mayor concentración.</p>
        </div>
        <div className="bg-black/20 border border-white/10 rounded-xl p-4 flex flex-col gap-2 items-start cursor-pointer hover:bg-white/5 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
            <BrainCircuit size={14} className="text-sky-400" />
          </div>
          <p className="text-[12px] font-medium text-white/80 mt-1">Espaciado</p>
          <p className="text-[10px] text-white/40 leading-relaxed">Sincroniza tus repasos con la curva de olvido.</p>
        </div>
      </div>
    </div>
  );
}