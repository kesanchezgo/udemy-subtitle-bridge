import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, Shield, Wifi, WifiOff, GripVertical, Sun, Moon } from "lucide-react";
import { ExtensionSidebar } from "./ExtensionSidebar";
import { AuthGuard } from "./AuthGuard";
import { AppLogo } from "./AppLogo";
import { Session } from "@supabase/supabase-js";
import { ThemeProvider, useDockTheme } from "../contexts/ThemeContext";

const MIN_WIDTH     = 300;
const MAX_WIDTH     = 560;
const DEFAULT_WIDTH = 360;
const COLLAPSED_W   = 40;

// ── CustomEvent helper (dock → content_script in production) ──────────────────
// In the prototype this fires on window but content_script.ts is not running,
// so it's a no-op here. In production it triggers adjustUdemyLayout().
function dispatchToDock(type: string, payload?: unknown) {
  window.dispatchEvent(
    new CustomEvent("usb:dock→cs", { detail: { type, payload } })
  );
}

interface InPageDockProps {
  onSessionResolved: (session: Session | null) => void;
  localAiConnected?: boolean;
}

// ── Inner dock — consumes theme context ───────────────────────────────────────
function InPageDockInner({ onSessionResolved, localAiConnected = true }: InPageDockProps) {
  const [collapsed,  setCollapsed]  = useState(false);
  const [width,      setWidth]      = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const { isSepia, toggleTheme, t } = useDockTheme();

  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);
  const latestWidth  = useRef(DEFAULT_WIDTH);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartW.current = width;
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: MouseEvent) => {
      const delta = resizeStartX.current - e.clientX;
      const newW  = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartW.current + delta));
      latestWidth.current = newW;
      setWidth(newW);
    };
    const handleUp = () => {
      setIsResizing(false);
      dispatchToDock("DOCK_RESIZE", { width: latestWidth.current });
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup",   handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup",   handleUp);
    };
  }, [isResizing]);

  return (
    <div
      className={`usb-dock relative flex shrink-0 h-full${isSepia ? " dock-sepia" : ""}`}
      style={{ userSelect: isResizing ? "none" : "auto" }}
    >
      {/* ── Resize handle ── */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            key="resize-handle"
            initial={{ width: 5, opacity: 0 }}
            animate={{ width: 5, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onMouseDown={handleResizeStart}
            title="Arrastrar para redimensionar"
            className={`
              h-full shrink-0 cursor-col-resize flex flex-col items-center justify-center gap-[3px]
              z-20 group/resize relative transition-colors duration-150 overflow-hidden
              ${isResizing
                ? t("bg-violet-500/30", "bg-black/8")
                : t("hover:bg-violet-500/15 bg-transparent", "hover:bg-black/5 bg-transparent")
              }
            `}
          >
            {[0,1,2,3,4].map(i => (
              <div
                key={i}
                className={`w-[3px] h-[3px] rounded-full transition-colors duration-150 shrink-0 ${
                  isResizing
                    ? t("bg-violet-400", "bg-[#9c9894]")
                    : t("bg-white/10 group-hover/resize:bg-violet-400/60", "bg-black/6 group-hover/resize:bg-[#9c9894]/60")
                }`}
              />
            ))}
            <GripVertical
              size={12}
              className={`absolute transition-opacity duration-150 ${
                isResizing
                  ? t("text-violet-400 opacity-100", "text-[#3d3a38] opacity-100")
                  : t(
                      "text-white/0 group-hover/resize:text-violet-400/50 group-hover/resize:opacity-100",
                      "text-black/0 group-hover/resize:text-[#3d3a38]/50 group-hover/resize:opacity-100"
                    )
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Animated width container ── */}
      <motion.div
        animate={{ width: collapsed ? COLLAPSED_W : width }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className={`relative h-full overflow-hidden shrink-0 border-l ${
          t("border-white/8", "border-black/7")
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            /* ─── COLLAPSED ─── */
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.13 }}
              className={`absolute inset-0 flex flex-col items-center cursor-pointer group ${
                t("bg-[#0d0e0f]", "bg-[#ebebea]")
              }`}
              onClick={() => { setCollapsed(false); dispatchToDock("DOCK_EXPAND"); }}
              title="Expandir Subtitle Bridge"
            >
              <div className="pt-3 pb-1 flex items-center justify-center">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  t(
                    "bg-violet-500/10 border border-violet-500/20 group-hover:bg-violet-500/20",
                    "bg-black/5 border border-black/8 group-hover:bg-black/9"
                  )
                }`}>
                  <ChevronRight size={12} className={t(
                    "text-violet-400/70 group-hover:text-violet-300 transition-colors",
                    "text-[#3d3a38]/70 group-hover:text-[#1a1918] transition-colors"
                  )} />
                </div>
              </div>

              <div className="py-2 flex items-center justify-center">
                <AppLogo size={20} iconOnly />
              </div>

              <div
                className="flex-1 flex items-center justify-center"
                style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
              >
                <span
                  className={`text-[9px] tracking-widest uppercase transition-colors ${
                    t(
                      "text-white/25 group-hover:text-white/50",
                      "text-[#3d3a38]/40 group-hover:text-[#1a1918]"
                    )
                  }`}
                  style={{ fontWeight: 600, transform: "rotate(180deg)", letterSpacing: "0.12em" }}
                >
                  Subtitle Bridge
                </span>
              </div>

              <div className="pb-4 flex items-center justify-center">
                <span className={`relative flex h-2 w-2 ${localAiConnected ? "" : "opacity-50"}`}>
                  {localAiConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                    localAiConnected ? "bg-emerald-400 shadow-[0_0_5px_#34d399]" : t("bg-white/20","bg-black/8")
                  }`} />
                </span>
              </div>
            </motion.div>

          ) : (
            /* ─── EXPANDED ─── */
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.13 }}
              className={`absolute inset-0 flex flex-col ${t("bg-[#1a1b1d]", "bg-[#f8f7f6]")}`}
            >
              {/* Meta bar */}
              <div className={`flex items-center justify-between px-3 py-[6px] border-b shrink-0 ${
                t("bg-[#0a0b0c] border-white/6", "bg-[#f0efed] border-black/6")
              }`}>
                <div className="flex items-center gap-1.5">
                  {/* Shadow DOM badge */}
                  <div className={`flex items-center gap-1 rounded px-1.5 py-[3px] border ${
                    t(
                      "bg-violet-500/8 border-violet-500/20",
                      "bg-black/4 border-black/10"
                    )
                  }`}>
                    <Shield size={7} className={t("text-violet-400/80", "text-[#3d3a38]/70")} />
                    <span className={`text-[8px] font-mono ${t("text-violet-400/70", "text-[#3d3a38]/70")}`} style={{ fontWeight: 500, letterSpacing: "0.02em" }}>
                      Shadow DOM
                    </span>
                  </div>

                  {/* In-page badge */}
                  <div className={`flex items-center gap-1 rounded px-1.5 py-[3px] border ${
                    t("bg-emerald-500/6 border-emerald-500/14", "bg-emerald-500/8 border-emerald-500/20")
                  }`}>
                    <span className="relative flex h-[6px] w-[6px] shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                      <span className="relative inline-flex rounded-full h-[6px] w-[6px] bg-emerald-400 shadow-[0_0_4px_#34d399]" />
                    </span>
                    <span className={`text-[8px] ${t("text-emerald-400/60", "text-emerald-600/70")}`} style={{ fontWeight: 500 }}>
                      In-page
                    </span>
                  </div>

                  {/* :8010 badge */}
                  <div className={`flex items-center gap-1 rounded px-1.5 py-[3px] border ${
                    localAiConnected
                      ? t("bg-sky-500/6 border-sky-500/15", "bg-sky-500/8 border-sky-500/20")
                      : t("bg-white/3 border-white/8", "bg-black/3 border-black/7")
                  }`}>
                    {localAiConnected
                      ? <Wifi    size={7} className={t("text-sky-400/70", "text-sky-600/70")} />
                      : <WifiOff size={7} className={t("text-white/25", "text-[#3d3a38]/40")} />
                    }
                    <span className={`text-[8px] font-mono ${
                      localAiConnected
                        ? t("text-sky-400/60", "text-sky-600/60")
                        : t("text-white/20", "text-[#3d3a38]/40")
                    }`} style={{ fontWeight: 500 }}>
                      :8010
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Width label */}
                  <span className={`text-[8px] font-mono tabular-nums ${t("text-white/12", "text-[#3d3a38]/35")}`}>
                    {width}px
                  </span>

                  {/* ── Theme toggle ── */}
                  <motion.button
                    onClick={toggleTheme}
                    whileTap={{ scale: 0.88 }}
                    title={isSepia ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
                    className={`w-6 h-6 flex items-center justify-center rounded-md transition-all border ${
                      isSepia
                        ? "bg-black/6 border-black/12 text-[#3d3a38] hover:bg-black/10"
                        : "bg-white/4 border-white/8 text-white/30 hover:text-white/60 hover:bg-white/10 hover:border-white/15"
                    }`}
                  >
                    <AnimatePresence mode="wait">
                      {isSepia
                        ? <motion.span key="moon" initial={{ rotate: -20, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 20, opacity: 0 }} transition={{ duration: 0.16 }}>
                            <Moon size={10} />
                          </motion.span>
                        : <motion.span key="sun" initial={{ rotate: 20, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -20, opacity: 0 }} transition={{ duration: 0.16 }}>
                            <Sun size={10} />
                          </motion.span>
                      }
                    </AnimatePresence>
                  </motion.button>

                  {/* Collapse button */}
                  <button
                    onClick={() => { setCollapsed(true); dispatchToDock("DOCK_COLLAPSE"); }}
                    className={`flex items-center gap-1 px-2 py-[3px] rounded-md transition-all group/collapse border border-transparent ${
                      t(
                        "text-white/40 hover:text-white/80 hover:bg-white/8 hover:border-white/12",
                        "text-[#3d3a38]/50 hover:text-[#1a1918] hover:bg-black/6 hover:border-black/10"
                      )
                    }`}
                    title="Colapsar dock"
                  >
                    <ChevronRight size={10} className="transition-transform group-hover/collapse:translate-x-0.5" />
                    <span className="text-[8px] hidden group-hover/collapse:inline transition-all" style={{ fontWeight: 500 }}>Colapsar</span>
                  </button>
                </div>
              </div>

              {/* Extension UI */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <AuthGuard onSessionResolved={onSessionResolved}>
                  {(session, requestLogin, signOut) => (
                    <ExtensionSidebar
                      isOpen={true}
                      onToggle={() => { setCollapsed(true); dispatchToDock("DOCK_COLLAPSE"); }}
                      session={session ?? undefined}
                      onRequestLogin={requestLogin}
                      onSignOut={signOut}
                    />
                  )}
                </AuthGuard>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ── Public export — wraps with ThemeProvider ──────────────────────────────────
export function InPageDock(props: InPageDockProps) {
  return (
    <ThemeProvider>
      <InPageDockInner {...props} />
    </ThemeProvider>
  );
}