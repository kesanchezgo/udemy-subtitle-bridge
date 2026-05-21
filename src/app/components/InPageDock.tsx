import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { ChevronRight, Shield, Wifi, WifiOff, GripVertical, Sun, Moon } from "lucide-react";
import { Toaster } from "sonner";
import { ExtensionSidebar } from "./ExtensionSidebar";
import { AuthGuard } from "./AuthGuard";
import { AppLogo } from "./AppLogo";
import { CelebrationOverlay } from "./CelebrationOverlay";
import { Session } from "@supabase/supabase-js";
import { ThemeProvider, useDockTheme } from "../contexts/ThemeContext";
import {
  DOCK_COLLAPSED_WIDTH,
  DOCK_DEFAULT_WIDTH,
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  DOCK_RESIZE_HANDLE_WIDTH,
} from "../constants/dock";

function dispatchToDock(type: string, payload?: unknown) {
  window.dispatchEvent(
    new CustomEvent("usb:dock→cs", { detail: { type, payload } })
  );
}

interface InPageDockProps {
  onSessionResolved: (session: Session | null) => void;
  localAiConnected?: boolean;
  injectGlobalThemeCss?: boolean;
}

function InPageDockInner({ onSessionResolved, localAiConnected = true }: InPageDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DOCK_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const { isSepia, toggleTheme, t } = useDockTheme();
  const panelWidth = collapsed ? DOCK_COLLAPSED_WIDTH : Math.max(0, width - DOCK_RESIZE_HANDLE_WIDTH);

  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);
  const latestWidth = useRef(DOCK_DEFAULT_WIDTH);
  const resizePublishFrame = useRef<number | null>(null);
  const resizeVisualFrame = useRef<number | null>(null);

  const publishResize = useCallback((nextWidth: number) => {
    latestWidth.current = nextWidth;
    if (resizePublishFrame.current !== null) {
      return;
    }

    resizePublishFrame.current = requestAnimationFrame(() => {
      resizePublishFrame.current = null;
      dispatchToDock("DOCK_RESIZE", { width: latestWidth.current, live: true });
    });
  }, []);

  const scheduleWidthUpdate = useCallback((nextWidth: number) => {
    latestWidth.current = nextWidth;
    publishResize(nextWidth);

    if (resizeVisualFrame.current !== null) {
      return;
    }

    resizeVisualFrame.current = requestAnimationFrame(() => {
      resizeVisualFrame.current = null;
      setWidth(latestWidth.current);
    });
  }, [publishResize]);

  const expandDock = useCallback(() => {
    setCollapsed(false);
    dispatchToDock("DOCK_EXPAND");
  }, []);

  const collapseDock = useCallback(() => {
    setCollapsed(true);
    dispatchToDock("DOCK_COLLAPSE");
  }, []);

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsResizing(true);
    resizeStartX.current = event.clientX;
    resizeStartW.current = width;
  }, [width]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const delta = resizeStartX.current - event.clientX;
      const nextWidth = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, resizeStartW.current + delta));
      scheduleWidthUpdate(nextWidth);
    };

    const handleUp = () => {
      if (resizeVisualFrame.current !== null) {
        cancelAnimationFrame(resizeVisualFrame.current);
        resizeVisualFrame.current = null;
      }
      if (resizePublishFrame.current !== null) {
        cancelAnimationFrame(resizePublishFrame.current);
        resizePublishFrame.current = null;
      }
      setIsResizing(false);
      setCollapsed(false);
      setWidth(latestWidth.current);
      dispatchToDock("DOCK_RESIZE", { width: latestWidth.current, live: false });
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      if (resizePublishFrame.current !== null) {
        cancelAnimationFrame(resizePublishFrame.current);
        resizePublishFrame.current = null;
      }
      if (resizeVisualFrame.current !== null) {
        cancelAnimationFrame(resizeVisualFrame.current);
        resizeVisualFrame.current = null;
      }
    };
  }, [isResizing, scheduleWidthUpdate]);

  return (
    <div
      className={`usb-dock relative flex shrink-0 h-full${isSepia ? " dock-sepia" : ""}`}
      style={{
        userSelect: isResizing ? "none" : "auto",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            key="resize-handle"
            initial={{ width: DOCK_RESIZE_HANDLE_WIDTH, opacity: 0 }}
            animate={{ width: DOCK_RESIZE_HANDLE_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onMouseDown={handleResizeStart}
            title="Arrastrar para redimensionar"
            className={`h-full shrink-0 cursor-col-resize flex flex-col items-center justify-center gap-[3px] z-20 group/resize relative transition-colors duration-150 overflow-hidden ${
              isResizing
                ? t("bg-violet-500/30", "bg-black/8")
                : t("hover:bg-violet-500/15 bg-transparent", "hover:bg-black/5 bg-transparent")
            }`}
          >
            {[0, 1, 2, 3, 4].map((i) => (
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

      <motion.div
        animate={{ width: panelWidth }}
        transition={isResizing ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
        className={`relative h-full overflow-hidden shrink-0 border-l ${t("border-white/8", "border-black/7")}`}
      >
        <div className="absolute inset-0">
          <AnimatePresence initial={false}>
            {collapsed && (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.13 }}
              className={`absolute inset-0 flex flex-col items-center cursor-pointer group ${t("bg-[#0d0e0f]", "bg-[#ebebea]")}`}
              onClick={expandDock}
              title="Expandir Subtitle Bridge"
            >
              <div className="pt-3 pb-1 flex items-center justify-center">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  t(
                    "bg-violet-500/10 border border-violet-500/20 group-hover:bg-violet-500/20",
                    "bg-black/5 border border-black/8 group-hover:bg-black/9"
                  )
                }`}>
                  <ChevronRight
                    size={12}
                    className={t(
                      "text-violet-400/70 group-hover:text-violet-300 transition-colors",
                      "text-[#3d3a38]/70 group-hover:text-[#1a1918] transition-colors"
                    )}
                  />
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
                    t("text-white/25 group-hover:text-white/50", "text-[#3d3a38]/40 group-hover:text-[#1a1918]")
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
                    localAiConnected ? "bg-emerald-400 shadow-[0_0_5px_#34d399]" : t("bg-white/20", "bg-black/8")
                  }`} />
                </span>
              </div>
            </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            key="expanded"
            initial={false}
            animate={{ opacity: collapsed ? 0 : 1 }}
            transition={{ duration: 0.13 }}
            aria-hidden={collapsed}
            className={`absolute inset-0 flex flex-col ${collapsed ? "pointer-events-none invisible" : "pointer-events-auto visible"} ${t("bg-[#1a1b1d]", "bg-[#f8f7f6]")}`}
          >
              <div className={`flex items-center justify-between px-3 py-[6px] border-b shrink-0 ${
                t("bg-[#0a0b0c] border-white/6", "bg-[#f0efed] border-black/6")
              }`}>
                <div className="flex items-center gap-1.5">
                  <div className={`flex items-center gap-1 rounded px-1.5 py-[3px] border ${
                    t("bg-violet-500/8 border-violet-500/20", "bg-black/4 border-black/10")
                  }`}>
                    <Shield size={7} className={t("text-violet-400/80", "text-[#3d3a38]/70")} />
                    <span className={`text-[8px] font-mono ${t("text-violet-400/70", "text-[#3d3a38]/70")}`} style={{ fontWeight: 500, letterSpacing: "0.02em" }}>
                      Shadow DOM
                    </span>
                  </div>

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

                  <div className={`flex items-center gap-1 rounded px-1.5 py-[3px] border ${
                    localAiConnected
                      ? t("bg-sky-500/6 border-sky-500/15", "bg-sky-500/8 border-sky-500/20")
                      : t("bg-white/3 border-white/8", "bg-black/3 border-black/7")
                  }`}>
                    {localAiConnected ? (
                      <Wifi size={7} className={t("text-sky-400/70", "text-sky-600/70")} />
                    ) : (
                      <WifiOff size={7} className={t("text-white/25", "text-[#3d3a38]/40")} />
                    )}
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
                  <span className={`text-[8px] font-mono tabular-nums ${t("text-white/12", "text-[#3d3a38]/35")}`}>
                    {width}px
                  </span>

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
                      {isSepia ? (
                        <motion.span
                          key="moon"
                          initial={{ rotate: -20, opacity: 0 }}
                          animate={{ rotate: 0, opacity: 1 }}
                          exit={{ rotate: 20, opacity: 0 }}
                          transition={{ duration: 0.16 }}
                        >
                          <Moon size={10} />
                        </motion.span>
                      ) : (
                        <motion.span
                          key="sun"
                          initial={{ rotate: 20, opacity: 0 }}
                          animate={{ rotate: 0, opacity: 1 }}
                          exit={{ rotate: -20, opacity: 0 }}
                          transition={{ duration: 0.16 }}
                        >
                          <Sun size={10} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>

                  <button
                    onClick={collapseDock}
                    className={`flex items-center gap-1 px-2 py-[3px] rounded-md transition-all group/collapse border border-transparent ${
                      t(
                        "text-white/40 hover:text-white/80 hover:bg-white/8 hover:border-white/12",
                        "text-[#3d3a38]/50 hover:text-[#1a1918] hover:bg-black/6 hover:border-black/10"
                      )
                    }`}
                    title="Colapsar dock"
                  >
                    <ChevronRight size={10} className="transition-transform group-hover/collapse:translate-x-0.5" />
                    <span className="text-[8px] hidden group-hover/collapse:inline transition-all" style={{ fontWeight: 500 }}>
                      Colapsar
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <MotionConfig reducedMotion="never">
                  <Toaster
                    theme="dark"
                    position="bottom-center"
                    expand={false}
                    gap={8}
                    toastOptions={{
                      duration: 3000,
                      style: {
                        background: "rgba(17,18,24,0.82)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#fff",
                        borderRadius: "12px",
                        fontSize: "12px",
                        backdropFilter: "blur(10px)",
                      },
                    }}
                  />
                  <CelebrationOverlay />
                  <AuthGuard onSessionResolved={onSessionResolved}>
                    {(session, requestLogin, signOut) => (
                      <ExtensionSidebar
                        isOpen={true}
                        onToggle={collapseDock}
                        session={session ?? undefined}
                        onRequestLogin={requestLogin}
                        onSignOut={signOut}
                      />
                    )}
                  </AuthGuard>
                </MotionConfig>
              </div>
            </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export function InPageDock(props: InPageDockProps) {
  return (
    <ThemeProvider injectGlobalCss={props.injectGlobalThemeCss ?? true}>
      <InPageDockInner {...props} />
    </ThemeProvider>
  );
}
