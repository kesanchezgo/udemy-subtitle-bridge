import React, { useState, useRef, useEffect, useCallback, useSyncExternalStore } from "react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { ExtensionSidebar } from "./ExtensionSidebar";
import { AuthGuard } from "./AuthGuard";
import { KinemaBrand } from "./AppLogo";
import { ChevronLeft, ChevronRight, Moon, Sun, Flame, Volume2, VolumeX, Settings } from "./icons";
import { getStreak } from "../services/streak";
import { getProgress } from "../services/progress";
import { ProgressPanel } from "./ProgressPanel";
import { playSound, soundForClick, installToastSounds, isSoundEnabled, setSoundEnabled, subscribeSound } from "../services/sounds";
import { CelebrationOverlay } from "./CelebrationOverlay";
import { Session } from "@supabase/supabase-js";
import { ThemeProvider, useDockTheme } from "../contexts/ThemeContext";
import { DockSheetHostContext } from "./DockSheet";
import { SettingsSheet, VocabularyMountContext } from "./SettingsSheet";
import { getAiProviderConfig, type AiProviderConfig } from "../services/ai-providers";
import {
  DOCK_COLLAPSED_WIDTH,
  DOCK_DEFAULT_WIDTH,
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  DOCK_RESIZE_HANDLE_WIDTH,
  DOCK_WIDTH_STORAGE_KEY,
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

/**
 * The text scale the content script measured from the browser/OS (1 at the 16px
 * default). The dock reuses it so its width grows with its text — at 1.25 the
 * labels are 25% wider and a fixed panel would truncate them.
 *
 * Falls back to 1 in the local preview, where no content script runs.
 */
function useTextScale(): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const read = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--usb-scale').trim();
      const parsed = Number.parseFloat(raw);
      setScale(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
    };
    read();

    // The content script writes the variable after mount, and it changes when the
    // user edits their browser font size, so observe rather than read once.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => observer.disconnect();
  }, []);

  return scale;
}

/**
 * The user's manually chosen dock width, persisted across page loads.
 *
 * Stored UNSCALED (the value the user dragged to at the 16px baseline) so that
 * changing the browser font size later rescales the layout instead of locking in
 * a width that no longer fits the text.
 *
 * Returns `null` until the stored value has been read, so the caller can avoid
 * flashing the default width before the real one arrives.
 */
function useStoredDockWidth(): [number | null, (width: number) => void] {
  const [stored, setStored] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    const apply = (value: unknown) => {
      if (!alive) return;
      const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
      setStored(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    };

    const chromeApi = (globalThis as typeof globalThis & {
      chrome?: { storage?: { local?: { get: (k: string[], cb: (r: Record<string, unknown>) => void) => void } } };
    }).chrome;

    const getter = chromeApi?.storage?.local?.get;
    if (typeof getter === "function") {
      try {
        getter.call(chromeApi!.storage!.local, [DOCK_WIDTH_STORAGE_KEY], (res) => apply(res?.[DOCK_WIDTH_STORAGE_KEY]));
      } catch {
        apply(null);
      }
    } else {
      // Local preview: same `usb_local_` namespace as chromeLocalStorage.
      try { apply(localStorage.getItem("usb_local_" + DOCK_WIDTH_STORAGE_KEY)); } catch { apply(null); }
    }

    // React to changes made in another tab / by another dock instance.
    const onChanged = chromeApi ? (globalThis as typeof globalThis & {
      chrome?: { storage?: { onChanged?: { addListener: (cb: (c: Record<string, { newValue?: unknown }>, area: string) => void) => void; removeListener: (cb: unknown) => void } } };
    }).chrome?.storage?.onChanged : undefined;
    let listener: ((c: Record<string, { newValue?: unknown }>, area: string) => void) | undefined;
    if (onChanged) {
      listener = (changes, area) => {
        if (area === "local" && DOCK_WIDTH_STORAGE_KEY in changes) apply(changes[DOCK_WIDTH_STORAGE_KEY]?.newValue);
      };
      onChanged.addListener(listener);
    }

    return () => {
      alive = false;
      if (onChanged && listener) onChanged.removeListener(listener);
    };
  }, []);

  const persist = useCallback((width: number) => {
    setStored(width);
    const chromeApi = (globalThis as typeof globalThis & {
      chrome?: { storage?: { local?: { set: (items: Record<string, unknown>, cb?: () => void) => void } } };
    }).chrome;
    const setter = chromeApi?.storage?.local?.set;
    if (typeof setter === "function") {
      try { setter.call(chromeApi!.storage!.local, { [DOCK_WIDTH_STORAGE_KEY]: width }); } catch { /* stale context */ }
      return;
    }
    try { localStorage.setItem("usb_local_" + DOCK_WIDTH_STORAGE_KEY, JSON.stringify(width)); } catch { /* ignore */ }
  }, []);

  return [stored, persist];
}

function InPageDockInner({ onSessionResolved, localAiConnected = true }: InPageDockProps) {
  const [providerKind, setProviderKind] = useState<AiProviderConfig["kind"]>(() => getAiProviderConfig().kind);
  useEffect(() => {
    const onChange = (e: Event) => { const kind = (e as CustomEvent<AiProviderConfig>).detail?.kind; if (kind) setProviderKind(kind); };
    window.addEventListener("usb:provider-changed", onChange);
    return () => window.removeEventListener("usb:provider-changed", onChange);
  }, []);
  const cloudName = ({ openai: "OpenAI", anthropic: "Claude", gemini: "Gemini" } as Record<string, string>)[providerKind];
  const aiStatus = cloudName
    ? { name: cloudName, state: "nube", tone: "cloud" as const, title: `Proveedor activo: ${cloudName}` }
    : localAiConnected
    ? { name: "IA local", state: "conectada", tone: "ok" as const, title: "Servidor de IA local conectado (127.0.0.1:8010)" }
    : { name: "IA local", state: "sin conexión", tone: "off" as const, title: "Servidor de IA local sin conexión" };

  const textScale = useTextScale();
  // Scale the default and the bounds so a larger text size still fits.
  const defaultWidth = Math.round(DOCK_DEFAULT_WIDTH * textScale);
  const minWidth = Math.round(DOCK_MIN_WIDTH * textScale);
  const maxWidth = Math.round(DOCK_MAX_WIDTH * textScale);

  const [storedWidth, setStoredWidth] = useStoredDockWidth();
  const userResized = useRef(false);

  // The persisted (unscaled) width wins over the default, so a width the user
  // dragged to is reused on every later page load instead of snapping back.
  const resolvedWidth = storedWidth !== null
    ? Math.max(minWidth, Math.min(maxWidth, Math.round(storedWidth * textScale)))
    : defaultWidth;

  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(resolvedWidth);
  const [isResizing, setIsResizing] = useState(false);
  const { isSepia, toggleTheme, t } = useDockTheme();
  const panelWidth = collapsed ? DOCK_COLLAPSED_WIDTH : Math.max(0, width - DOCK_RESIZE_HANDLE_WIDTH);

  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);
  const latestWidth = useRef(resolvedWidth);
  const resizePublishFrame = useRef<number | null>(null);
  const resizeVisualFrame = useRef<number | null>(null);

  // Adopt the resolved width (stored, or the scaled default) unless the user is
  // mid-drag, which would otherwise fight the incoming value.
  useEffect(() => {
    if (userResized.current && isResizing) return;
    setWidth(resolvedWidth);
    latestWidth.current = resolvedWidth;
    dispatchToDock("DOCK_RESIZE", { width: resolvedWidth, live: false });
  }, [resolvedWidth, isResizing]);

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
    userResized.current = true;
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
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, resizeStartW.current + delta));
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
      // Remember the width the user chose, stored unscaled so a later change to
      // the browser font size still rescales it instead of clamping it.
      setStoredWidth(Math.round(latestWidth.current / textScale));
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
  }, [isResizing, minWidth, maxWidth, scheduleWidthUpdate, setStoredWidth, textScale]);

  const soundOn = useSyncExternalStore(subscribeSound, isSoundEnabled);
  useEffect(() => { installToastSounds(); }, []);
  const [streak, setStreak] = useState(() => getStreak());
  useEffect(() => {
    const h = () => setStreak(getStreak());
    window.addEventListener("usb:streak", h);
    return () => window.removeEventListener("usb:streak", h);
  }, []);
  const [level, setLevel] = useState(() => getProgress().level);
  const [progressOpen, setProgressOpen] = useState(false);
  const [sheetHost, setSheetHost] = useState<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const gearClickRef = useRef<number[]>([]);

  useEffect(() => {
    const handleSettingsState = (e: Event) => {
      const custom = e as CustomEvent<{ settingsOpen?: boolean; devMode?: boolean }>;
      if (custom.detail) {
        if (typeof custom.detail.devMode === "boolean") {
          setDevMode(custom.detail.devMode);
        }
      }
    };
    const toggle = () => setSettingsOpen(v => !v);
    // Abre la hoja. La sección la aplica el listener de cada SettingsSection
    // (SettingsKit) sobre el MISMO evento usb:open-settings. La hoja usa
    // keepMounted, así que el acordeón está siempre montado y su listener
    // siempre presente: no hace falta reenviar ni persistir nada aquí. Un
    // re-despacho por rAF solo reintroduce el evento y arriesba a sobreescribir
    // la sección que otro listener ya había fijado.
    const openIt = (e?: Event) => {
      setSettingsOpen(true);
      setProgressOpen(false);
    };
    const closeIt = () => setSettingsOpen(false);
    window.addEventListener("usb:settings-state", handleSettingsState);
    window.addEventListener("usb:toggle-settings", toggle);
    window.addEventListener("usb:open-settings", openIt);
    window.addEventListener("usb:close-settings", closeIt);
    window.addEventListener("usb:toggle-dev", closeIt);
    return () => {
      window.removeEventListener("usb:settings-state", handleSettingsState);
      window.removeEventListener("usb:toggle-settings", toggle);
      window.removeEventListener("usb:open-settings", openIt);
      window.removeEventListener("usb:close-settings", closeIt);
      window.removeEventListener("usb:toggle-dev", closeIt);
    };
  }, []);
  const [vocabularyMount, setVocabularyMount] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (settingsOpen) setProgressOpen(false);
    window.dispatchEvent(new CustomEvent("usb:settings-open", { detail: { open: settingsOpen } }));
  }, [settingsOpen]);

  // Nv y engranaje comparten el mismo estado visual: pastilla con borde que se tiñe de violeta al estar abierta.
  const pillClass = (active: boolean) =>
    active
      ? t("text-white bg-[#6d4aff]/20 border-[#8b6dff]/60", "text-[#4a2fd1] bg-[#6d4aff]/10 border-[#6d4aff]/45")
      : t("text-white/90 bg-white/5 border-white/12 hover:bg-white/10", "text-[#15161c] bg-white border-black/12 hover:bg-black/5");

  const handleGearClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setProgressOpen(false);
    const now = Date.now();
    // Cadena de clics: cada uno a <600 ms del anterior (no ventana total), más el conteo nativo del navegador.
    const prev = gearClickRef.current;
    const recentClicks = prev.length && now - prev[prev.length - 1] < 600 ? [...prev, now] : [now];
    gearClickRef.current = recentClicks;

    if (e.detail >= 3 || recentClicks.length >= 3) {
      gearClickRef.current = [];
      window.dispatchEvent(new CustomEvent("usb:toggle-dev"));
      return;
    }

    window.dispatchEvent(new CustomEvent("usb:toggle-settings"));
  };

  // La insignia de nivel vive junto al logo (ExtensionSidebar); el panel sigue siendo del dock.
  useEffect(() => {
    const toggle = () => setProgressOpen(v => !v);
    window.addEventListener("usb:toggle-progress", toggle);
    return () => window.removeEventListener("usb:toggle-progress", toggle);
  }, []);
  useEffect(() => {
    if (progressOpen) setSettingsOpen(false);
    window.dispatchEvent(new CustomEvent("usb:progress-open", { detail: { open: progressOpen } }));
  }, [progressOpen]);

  useEffect(() => {
    const h = () => setLevel(getProgress().level);
    window.addEventListener("usb:xp", h);
    return () => window.removeEventListener("usb:xp", h);
  }, []);

  return (
    <div
      onClickCapture={(e) => {
        const n = soundForClick(e.target);
        if (n) playSound(n);
      }}
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
            style={{ backgroundColor: isSepia ? "#ffffff" : "#121214" }}
            title="Arrastrar para redimensionar"
            className={`h-full shrink-0 cursor-col-resize flex flex-col items-center justify-center gap-[3px] z-20 group/resize relative transition-colors duration-150 overflow-hidden ${
              isResizing
                ? t("bg-violet-500/30", "bg-black/8")
                : t("hover:bg-violet-500/15", "")
            }`}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`w-[3px] h-[3px] rounded-full transition-colors duration-150 shrink-0 ${
                  isResizing
                    ? t("bg-violet-400", "bg-violet-500")
                    : t("bg-white/10 group-hover/resize:bg-violet-400/60", "bg-black/6 group-hover/resize:bg-violet-500/40")
                }`}
              />
            ))}
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
              className={`absolute inset-0 flex flex-col items-center cursor-pointer group ${t("bg-[#0d0e0f]", "bg-[#eceef2]")}`}
              onClick={expandDock}
              title="Expandir Kinema"
            >
              <div className="pt-5 pb-1 flex items-center justify-center">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  t(
                    "bg-violet-500/10 border border-violet-500/20 group-hover:bg-violet-500/20",
                    "bg-black/5 border border-black/8 group-hover:bg-black/9"
                  )
                }`}>
                  <span
                    aria-hidden="true"
                    className={`text-[16px] leading-none transition-colors ${t(
                      "text-violet-300 group-hover:text-white",
                      "text-[#5b37e8] group-hover:text-[#3a2399]"
                    )}`}
                  >
                    <ChevronLeft size={14} />
                  </span>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center">
                <KinemaBrand compact />
              </div>

              <div className="pb-4 flex items-center justify-center">
                <span className={`relative flex h-2 w-2 ${localAiConnected ? "" : "opacity-50"}`}>
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
            ref={setSheetHost}
            initial={false}
            animate={{ opacity: collapsed ? 0 : 1 }}
            transition={{ duration: 0.13 }}
            aria-hidden={collapsed}
            className={`absolute inset-0 flex flex-col ${collapsed ? "pointer-events-none invisible" : "pointer-events-auto visible"} ${t("bg-[#1a1b1d]", "bg-[#f6f7f9]")}`}
          >
              <div className={`flex items-center justify-between px-3.5 py-1.5 border-b shrink-0 ${
                t("bg-[#141516] border-white/6", "bg-[#f6f7f9] border-black/6")
              }`}>
                {/* Único indicador de IA: motor activo + estado. Clic → Configuración › Proveedor. */}
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "provider" } }))}
                  title={`${aiStatus.title} · Abrir proveedor de IA`}
                  aria-label={`${aiStatus.name} ${aiStatus.state}. Abrir proveedor de IA`}
                  className={`-ml-1.5 inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium transition-colors hover:bg-[color-mix(in_srgb,currentColor_7%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a48bff] ${t("text-white/60 hover:text-white/85", "text-[#15161c]/60 hover:text-[#15161c]/85")}`}
                >
                  <span className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${
                    aiStatus.tone === "ok" ? "bg-emerald-500" : aiStatus.tone === "cloud" ? "bg-[#6d4aff]" : "bg-amber-500"
                  }`} />
                  <span className="truncate">{aiStatus.name} · {aiStatus.state}</span>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleGearClick}
                    title="Configuración · triple clic para modo Dev"
                    aria-label="Abrir configuración"
                    aria-pressed={settingsOpen}
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-colors ${
                      devMode && !settingsOpen
                        ? t("text-amber-300 bg-amber-500/10 border-amber-400/40", "text-amber-800 bg-amber-50 border-amber-600/40")
                        : pillClass(settingsOpen)
                    }`}
                  >
                    <Settings size={13.5} />
                  </button>

                  <div
                    className={`inline-flex items-center h-7 rounded-lg border overflow-hidden ${
                      t("bg-white/5 border-white/12 divide-x divide-white/10", "bg-white border-black/12 divide-x divide-black/10")
                    }`}
                  >
                    <button
                      data-no-sound
                      onClick={() => { const next = !soundOn; setSoundEnabled(next); if (next) playSound("on"); }}
                      title={soundOn ? "Silenciar sonidos" : "Activar sonidos"}
                      aria-label={soundOn ? "Silenciar sonidos" : "Activar sonidos"}
                      aria-pressed={soundOn}
                      className={`w-7 h-full flex items-center justify-center transition-colors ${
                        t("text-white/80 hover:text-white hover:bg-white/10", "text-[#3d3a38] hover:text-[#15161c] hover:bg-black/5")
                      }`}
                    >
                      {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} className={t("text-white/50", "text-[#3d3a38]/60")} />}
                    </button>
                    <motion.button
                      data-no-sound
                      onClick={() => { playSound("theme"); toggleTheme(); }}
                      whileTap={{ scale: 0.92 }}
                      title={isSepia ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
                      aria-label={isSepia ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
                      className={`w-7 h-full flex items-center justify-center transition-colors ${
                        t("text-white/80 hover:text-white hover:bg-white/10", "text-[#3d3a38] hover:text-[#15161c] hover:bg-black/5")
                      }`}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={isSepia ? "moon" : "sun"}
                          aria-hidden="true"
                          className="flex"
                          initial={{ rotate: isSepia ? -25 : 25, opacity: 0 }}
                          animate={{ rotate: 0, opacity: 1 }}
                          exit={{ rotate: isSepia ? 25 : -25, opacity: 0 }}
                          transition={{ duration: 0.16 }}
                        >
                          {isSepia ? <Moon size={14} /> : <Sun size={14} />}
                        </motion.span>
                      </AnimatePresence>
                    </motion.button>
                    <button
                      onClick={collapseDock}
                      title={`Colapsar dock (${width}px)`}
                      aria-label="Colapsar dock"
                      className={`w-7 h-full flex items-center justify-center transition-colors ${
                        t("text-white/80 hover:text-white hover:bg-white/10", "text-[#3d3a38] hover:text-[#15161c] hover:bg-black/5")
                      }`}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {progressOpen && <ProgressPanel key="progress" onClose={() => setProgressOpen(false)} />}
              </AnimatePresence>

              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <DockSheetHostContext.Provider value={sheetHost}>
                <MotionConfig reducedMotion="user">
                  <Toaster
                    theme={isSepia ? "light" : "dark"}
                    position="bottom-center"
                    expand
                    visibleToasts={3}
                    gap={8}
                    offset={16}
                    toastOptions={{ duration: 3500 }}
                  />
                  <CelebrationOverlay />
                  <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} localConnected={localAiConnected} onVocabularyMount={setVocabularyMount} />
                  <VocabularyMountContext.Provider value={vocabularyMount}>
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
                  </VocabularyMountContext.Provider>
                </MotionConfig>
                </DockSheetHostContext.Provider>
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
