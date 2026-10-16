import { toast } from "sonner";

export type SoundName = "tick" | "tab" | "on" | "off" | "success" | "error" | "theme" | "pop" | "celebrate" | "streak";

const KEY = "kinema-sound";
let ctx: AudioContext | null = null;
let enabled = (() => {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
})();
const listeners = new Set<() => void>();

export const isSoundEnabled = () => enabled;
export const subscribeSound = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function setSoundEnabled(v: boolean) {
  enabled = v;
  try { localStorage.setItem(KEY, v ? "on" : "off"); } catch {}
  listeners.forEach((l) => l());
}

function note(freq: number, start: number, dur: number, peak: number, type: OscillatorType = "sine", slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t0 = ctx.currentTime + start;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function playSound(name: SoundName) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    switch (name) {
      case "tick": note(1800, 0, 0.05, 0.022, "sine", 1100); break;
      case "tab": note(660, 0, 0.09, 0.03); note(990, 0.04, 0.11, 0.022); break;
      case "on": note(520, 0, 0.09, 0.035); note(780, 0.06, 0.12, 0.03); break;
      case "off": note(780, 0, 0.09, 0.03); note(520, 0.06, 0.12, 0.026); break;
      case "theme": note(440, 0, 0.16, 0.03, "sine", 660); break;
      case "success": note(523.25, 0, 0.14, 0.035); note(659.25, 0.07, 0.14, 0.032); note(783.99, 0.14, 0.26, 0.03); break;
      case "pop": note(880, 0, 0.1, 0.03); note(1320, 0.05, 0.16, 0.024); break;
      case "celebrate": [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => note(f, i * 0.07, 0.3, 0.03)); note(2093, 0.4, 0.5, 0.012); break;
      case "streak": [392, 523.25, 659.25, 783.99].forEach((f, i) => note(f, i * 0.09, 0.22, 0.032, "triangle")); note(1046.5, 0.38, 0.5, 0.026); break;
      case "error": note(220, 0, 0.18, 0.04, "triangle", 165); break;
    }
  } catch {}
}

let patched = false;
export function installToastSounds() {
  if (patched) return;
  patched = true;
  const kinds = ["success", "error", "info", "warning", "message"] as const;
  const sound: Partial<Record<(typeof kinds)[number], SoundName>> = { success: "success", error: "error", warning: "tab" };
  kinds.forEach((k) => {
    const orig = (toast as any)[k].bind(toast);
    (toast as any)[k] = (msg: any, opts: any = {}) => {
      // El aviso repetido (mismo texto) no debe apilarse. Antes se hacía con
      // toast.dismiss(id) en la misma tarea, y eso mataba el toast RECIÉN
      // CREADO: sonner procesa el dismiss y la creación en el mismo lote y el
      // id derivado del mensaje es el mismo, así que el nuevo se descartaba a
      // sí mismo. Medido: los avisos con botón vivían ~200 ms y ese botón era
      // inalcanzable pidiendo 15 s de duración.
      //
      // sonner ya hace esto solo: si el id coincide, reemplaza el toast en vez
      // de duplicarlo. Así que aquí no hay que descartar nada — basta con
      // propagar el id, que es lo que habilita ese reemplazo.
      const id = opts.id ?? (typeof msg === "string" ? `${k}:${msg}` : undefined);
      const s = sound[k];
      if (s) playSound(s);
      return orig(msg, { ...opts, id });
    };
  });
}

export function soundForClick(target: EventTarget | null): SoundName | null {
  const el = (target as HTMLElement | null)?.closest?.("button, [role=tab], [role=switch], [role=checkbox], a");
  if (!el || (el as HTMLButtonElement).disabled) return null;
  const role = el.getAttribute("role");
  if (role === "tab") return "tab";
  if (role === "switch" || role === "checkbox") return el.getAttribute("aria-checked") === "true" ? "off" : "on";
  if (el.hasAttribute("data-no-sound")) return null;
  return "tick";
}
