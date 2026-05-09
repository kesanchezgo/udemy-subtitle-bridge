import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, Shield, Wifi, WifiOff, GripVertical } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { ExtensionSidebar } from "./ExtensionSidebar";
import { AuthGuard } from "./AuthGuard";
import { AppLogo } from "./AppLogo";

const MIN_WIDTH = 300;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 360;
const COLLAPSED_W = 40;

function dispatchToDock(type: string, payload?: unknown) {
  window.dispatchEvent(new CustomEvent("usb:dock→cs", { detail: { type, payload } }));
}

interface InPageDockProps {
  onSessionResolved: (session: Session | null) => void;
  localAiConnected?: boolean;
}

export function InPageDock({ onSessionResolved, localAiConnected = true }: InPageDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);
  const latestWidth = useRef(DEFAULT_WIDTH);

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
      const nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartW.current + delta));
      latestWidth.current = nextWidth;
      setWidth(nextWidth);
    };

    const handleUp = () => {
      setIsResizing(false);
      dispatchToDock("DOCK_RESIZE", { width: latestWidth.current });
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [isResizing]);

  return (
    <div
      className="relative flex shrink-0 h-full"
      style={{ userSelect: isResizing ? "none" : "auto" }}
    >
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
            className={
              `h-full shrink-0 cursor-col-resize flex flex-col items-center justify-center gap-[3px] ` +
              `z-20 group/resize relative transition-colors duration-150 overflow-hidden ` +
              `${isResizing ? "bg-violet-500/30" : "hover:bg-violet-500/15 bg-transparent"}`
            }
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`w-[3px] h-[3px] rounded-full transition-colors duration-150 shrink-0 ` +
                  `${isResizing ? "bg-violet-400" : "bg-white/10 group-hover/resize:bg-violet-400/60"}`}
              />
            ))}
            <GripVertical
              size={12}
              className={`absolute transition-opacity duration-150 ` +
                `${isResizing
                  ? "text-violet-400 opacity-100"
                  : "text-white/0 group-hover/resize:text-violet-400/50 group-hover/resize:opacity-100"
                }`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={{ width: collapsed ? COLLAPSED_W : width }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="relative h-full overflow-hidden border-l border-white/8 shrink-0"
      >
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.13 }}
              className="absolute inset-0 flex flex-col items-center bg-[#0d0e0f] cursor-pointer group"
              onClick={() => {
                setCollapsed(false);
                dispatchToDock("DOCK_EXPAND");
              }}
              title="Expandir Subtitle Bridge"
            >
              <div className="pt-3 pb-1 flex items-center justify-center">
                <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/20 transition-all">
                  <ChevronRight size={12} className="text-violet-400/70 group-hover:text-violet-300 transition-colors" />
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
                  className="text-white/25 group-hover:text-white/50 transition-colors text-[9px] tracking-widest uppercase"
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
                    localAiConnected ? "bg-emerald-400 shadow-[0_0_5px_#34d399]" : "bg-white/20"
                  }`} />
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.13 }}
              className="absolute inset-0 flex flex-col bg-[#1a1b1d]"
            >
              <div className="flex items-center justify-between px-3 py-[6px] bg-[#0a0b0c] border-b border-white/6 shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 bg-violet-500/8 border border-violet-500/20 rounded px-1.5 py-[3px]">
                    <Shield size={7} className="text-violet-400/80" />
                    <span className="text-[8px] text-violet-400/70 font-mono" style={{ fontWeight: 500, letterSpacing: "0.02em" }}>
                      Shadow DOM
                    </span>
                  </div>

                  <div className="flex items-center gap-1 bg-emerald-500/6 border border-emerald-500/14 rounded px-1.5 py-[3px]">
                    <span className="relative flex h-[6px] w-[6px] shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                      <span className="relative inline-flex rounded-full h-[6px] w-[6px] bg-emerald-400 shadow-[0_0_4px_#34d399]" />
                    </span>
                    <span className="text-[8px] text-emerald-400/60" style={{ fontWeight: 500 }}>
                      In-page
                    </span>
                  </div>

                  <div className={`flex items-center gap-1 rounded px-1.5 py-[3px] border ${
                    localAiConnected ? "bg-sky-500/6 border-sky-500/15" : "bg-white/3 border-white/8"
                  }`}>
                    {localAiConnected
                      ? <Wifi size={7} className="text-sky-400/70" />
                      : <WifiOff size={7} className="text-white/25" />}
                    <span className={`text-[8px] font-mono ${localAiConnected ? "text-sky-400/60" : "text-white/20"}`} style={{ fontWeight: 500 }}>
                      :8010
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-white/12 font-mono tabular-nums">
                    {width}px
                  </span>
                  <button
                    onClick={() => {
                      setCollapsed(true);
                      dispatchToDock("DOCK_COLLAPSE");
                    }}
                    className="w-[22px] h-[22px] flex items-center justify-center rounded-md text-white/20 hover:text-white/60 hover:bg-white/8 border border-transparent hover:border-white/10 transition-all"
                    title="Colapsar dock"
                  >
                    <ChevronRight size={11} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <AuthGuard onSessionResolved={onSessionResolved}>
                  {(session, requestLogin, signOut) => (
                    <ExtensionSidebar
                      isOpen={true}
                      onToggle={() => {
                        setCollapsed(true);
                        dispatchToDock("DOCK_COLLAPSE");
                      }}
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