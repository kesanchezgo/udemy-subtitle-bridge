import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Languages, ChevronDown, Icon, RefreshCw, Send, CheckCircle2, Loader2 } from "../icons";
import { describeProviderFailure, getAiProviderConfig } from "../../services/ai-providers";
import { chromeLocalStorage } from "../../services/chromeStorage";
import { contentBridge } from "../../services/contentBridge";
import { parseVocabularyPayload, type VocabConfig } from "../../services/vocabularyService";
import { type KnownVocabularyWord, exportedVocabularyKeys, exportedVocabularyOrigins, prepareVocabularyCandidates, readVocabularySession, toggleVocabularySelection, updateVocabularySession, vocabularyCriteriaKey, vocabularySessionKey, vocabularyWordKey, type VocabularySession } from "../../services/vocabularySession";
import { sendVocabularySelection, setVocabularyWaiting, type VocabSendResult } from "../../services/vocabularySync";
import { Code, MiniScale, Notice, Picker, RowList, SettingRow, SettingsGroup, Stepper, primaryBtnCls, rowBtnCls, secondaryBtnCls } from "../settings/SettingsKit";
import { EXPLANATION_LANGUAGES, TARGET_LANGUAGES } from "./vocabLanguages";
import { ExportModule } from "./ExportModule";
import { KnownDecksField } from "./AnkiSettings";
import { useAnkiConnection } from "../../hooks/useAnkiConnection";
import { vocabDestination } from "../../services/ankiDestination";

interface Props {
  course: string;
  lesson: string;
  config: VocabConfig;
  onConfig: (patch: Partial<VocabConfig>) => void;
  generate: () => Promise<unknown>;
  compact?: boolean;
  mount?: HTMLElement | null;
  /** Estado real de la IA: sin proveedor disponible se deshabilita proponer. */
  aiReady?: boolean;
  /** Motivo, en una frase, cuando aiReady es false. */
  aiNotice?: string;
  /**
   * Fase 5 · la lección está terminada: lo marcado llega a Anki solo (con Anki
   * conectado) o espera a que Anki responda. Solo en Fijar.
   */
  autoSend?: boolean;
  /** URL de la lección (la fuente enlazable de cada palabra). */
  lessonUrl?: string;
}

/**
 * Serializa la config con claves ordenadas para compararla sin que el orden
 * importe. chrome.storage reordena las claves alfabéticamente al escribir, así
 * que JSON.stringify sobre un objeto recién leído nunca coincide con el objeto
 * vivo del panel aunque los valores sean los mismos.
 */
function stableConfigString(config: VocabConfig): string {
  return JSON.stringify(
    Object.keys(config).sort().map(key => [key, (config as unknown as Record<string, unknown>)[key]])
  );
}


export function VocabularyPanel({
  course, lesson, config, onConfig, generate, compact = false, mount,
  aiReady,
  aiNotice,
  autoSend = false,
  lessonUrl,
}: Props) {
  const key = vocabularySessionKey(course, lesson, config.targetLang);
  const [session, setSession] = useState<VocabularySession | null>(null);
  const [exported, setExported] = useState<Set<string>>(new Set());
  // Curso de donde salió cada palabra que ya tienes (una palabra vive una sola vez en Anki).
  const [origins, setOrigins] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  /** Fase 5 · el último envío a Anki de esta lección (o por qué no salió). */
  const [sendState, setSendState] = useState<{ status: "idle" | "sending" | "error"; result?: VocabSendResult; error?: string }>({ status: "idle" });
  const lock = useRef(false);
  const generation = useRef(0);
  const stale = session && vocabularyCriteriaKey(session.config) !== vocabularyCriteriaKey(config);
  useEffect(() => {
    const version = ++generation.current;
    let loadSequence = 0;
    setSession(null);
    setSendState({ status: "idle" });
    if (compact) void contentBridge.sendToContent({ type: "GLOSSARY_UPDATE", payload: { sessionKey: key, words: [] } });
    const load = async () => {
      const sequence = ++loadSequence;
      const [next, seen, from] = await Promise.all([readVocabularySession(key), exportedVocabularyKeys(config.targetLang), exportedVocabularyOrigins(config.targetLang)]);
      if (generation.current !== version || loadSequence !== sequence) return;
      setOrigins(from);
      // Comparación semántica, no JSON.stringify: chrome.storage reordena las
      // claves alfabéticamente al escribir, así que una sesión recién leída
      // "difiere" siempre en stringify aunque los valores sean idénticos. Con
      // stringify cada apertura disparaba una realineación de escritura
      // inútil, y el caso idéntico caía al else sin mostrar la sesión.
      const differsOnlyNonCritical = Boolean(
        next
        && vocabularyCriteriaKey(next.config) === vocabularyCriteriaKey(config)
        && stableConfigString(next.config) !== stableConfigString(config)
      );
      if (differsOnlyNonCritical) {
        // Solo difieren campos NO críticos (maxWords/audioMode/rootDeck): mostrar
        // la sesión existente y alinear su config en segundo plano. Retornar aquí
        // dejaba el panel vacío hasta que otro cambio volviera a disparar el efecto.
        setSession(next);
        setExported(seen);
        void updateVocabularySession(key, current => {
          if (!current) throw new Error("La lección cambió.");
          if (generation.current !== version || vocabularyCriteriaKey(current.config) !== vocabularyCriteriaKey(config)) return current;
          return { ...current, config: { ...config } };
        }).catch((error) => {
          console.warn("[vocab] no se pudo alinear la config de la sesión en segundo plano:", error);
        });
        if (compact) await pushGlossary(next, seen);
        return;
      }
      // Sin sesión, o sesión con criterios distintos (minLevel/idioma base): se
      // muestra igual — la UI la marca con el aviso de «aplicar cambios». Ocultar
      // aquí escondía una sesión guardada como si no existiera.
      setSession(next);
      setExported(seen);
      if (compact) await pushGlossary(next, seen);
    };

    const pushGlossary = async (next: Awaited<ReturnType<typeof readVocabularySession>>, seen: Set<string>) => {
      if (!compact) return;
      await contentBridge.sendToContent({
        type: "GLOSSARY_UPDATE",
        payload: {
          sessionKey: key, course, lesson,
          words: next ? [
            ...next.candidates.map(word => ({
              ...word,
              selected: next.selected.includes(vocabularyWordKey(word.word)),
              exported: seen.has(vocabularyWordKey(word.word)),
              demo: next.demo,
              needsUpdate: vocabularyCriteriaKey(next.config) !== vocabularyCriteriaKey(config),
            })),
            // Las que ya tienes: re-exposición en contexto, sin acción posible.
            ...(next.known ?? []).map(k => ({ word: k.word, phonetic: k.phonetic, monolingual: k.monolingual, selected: false, exported: true, demo: next.demo, needsUpdate: false })),
          ] : [],
        },
      });
    };
    void load().catch(() => {});
    const unsubscribe = chromeLocalStorage.onChange(() => { void load().catch(() => {}); });
    return () => {
      generation.current += 1;
      unsubscribe();
    };
  }, [key, compact, course, lesson, JSON.stringify(config)]);

  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await action(); } catch (error) {
      // Mismo vocabulario que el resto: habla del proveedor real y su endpoint.
      const cfg = getAiProviderConfig();
      toast.error(describeProviderFailure(error instanceof Error ? error.message : "", {
        kind: cfg.kind, endpoint: cfg.baseUrl, model: cfg.model,
      }));
    }
    finally { lock.current = false; setBusy(false); }
  };
  const prepare = () => run(async () => {
    if (!course.trim() || !lesson.trim() || !config.baseLangLabel.trim()) throw new Error("Completa curso, lección e idioma de explicación antes de preparar vocabulario.");
    const version = generation.current;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let payload: unknown;
    try {
      payload = await Promise.race([generate(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("La generación tardó demasiado. La lista anterior se conserva; vuelve a intentarlo cuando el motor esté disponible.")), 120000); })]);
    } finally { if (timeout) clearTimeout(timeout); }
    if (generation.current !== version) return;
    const words = prepareVocabularyCandidates(parseVocabularyPayload(payload), config);
    const rawKnown = (payload as { known?: unknown })?.known;
    const known = Array.isArray(rawKnown)
      ? rawKnown.filter((k): k is KnownVocabularyWord => Boolean(k) && typeof (k as KnownVocabularyWord).word === "string")
        .filter(k => !words.some(word => vocabularyWordKey(word.word) === vocabularyWordKey(k.word)))
      : [];
    if (!words.length && !known.length) throw new Error("No hay candidatas que cumplan el nivel configurado.");
    await updateVocabularySession(key, previous => {
      const real = previous?.demo ? previous.realBackup : previous;
      return { course, lesson, config: { ...config }, candidates: words, known, selected: real?.selected.filter(value => words.some(word => vocabularyWordKey(word.word) === value)) ?? [], demo: false, partial: Boolean((payload as { partial?: boolean })?.partial), exports: real?.exports ?? [] };
    });
    if (!words.length) toast.message("Esta lección no trae palabras nuevas", { description: `Las ${known.length} que ya tienes se verán marcadas en el video, como repaso.` });
    else toast.success("Candidatas preparadas", { description: "Márcalas desde el video o esta lista: llegan a Anki al terminar la lección." });
  });
  const selected = session?.candidates.filter(word => session.selected.includes(vocabularyWordKey(word.word)) && !exported.has(vocabularyWordKey(word.word))) ?? [];
  // Fase 5 · sin exportar: con la lección terminada, lo marcado llega a Anki
  // solo (el mismo .apkg, importado con AnkiConnect) y Anki confirma cuántas
  // entraron. Sin Anki, la lección queda esperando y se envía cuando responda.
  const anki = useAnkiConnection(true);
  const selectionKey = selected.map(word => vocabularyWordKey(word.word)).sort().join("|");
  const failedKeyRef = useRef<string | null>(null);
  const sendWords = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    setSendState(prev => ({ ...prev, status: "sending" }));
    try {
      const result = await sendVocabularySelection(key, { lessonUrl, live: config });
      failedKeyRef.current = null;
      setSendState({ status: "idle", result: result ?? undefined });
      if (result) toast.success(result.added > 0 ? `${result.added} ${result.added === 1 ? "palabra nueva" : "palabras nuevas"} en Anki` : "Ya estaban en Anki", { description: `Mazo: ${result.deck}. Las que ya tenías no se duplican ni se pisan.` });
    } catch (error) {
      failedKeyRef.current = selectionKey;
      setSendState({ status: "error", error: error instanceof Error ? error.message : String(error) });
      // Se queda esperando: se envía sola cuando Anki vuelva a responder.
      void setVocabularyWaiting(key, true, lessonUrl).catch(() => undefined);
    } finally { lock.current = false; setBusy(false); }
  };
  const canSend = Boolean(session && !session.demo && !stale && selected.length > 0 && selected.length <= config.maxWords);
  useEffect(() => {
    if (compact || !autoSend || !canSend) return;
    if (!anki.ready) {
      // Terminada sin Anki: espera (y se envía sola en cuanto Anki responda).
      void setVocabularyWaiting(key, true, lessonUrl).catch(() => undefined);
      return;
    }
    if (busy || failedKeyRef.current === selectionKey) return;
    const timer = setTimeout(() => { void sendWords(); }, 700);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, autoSend, canSend, anki.ready, busy, selectionKey, key]);
  // Anki vuelve a responder tras un fallo: se reintenta solo.
  useEffect(() => { if (anki.ready) failedKeyRef.current = null; }, [anki.ready, anki.status]);

  const toggleWord = (word: string) => run(async () => { const latestSeen = await exportedVocabularyKeys(config.targetLang); await updateVocabularySession(key, current => { if (!current) throw new Error("Prepara la lección primero."); return toggleVocabularySelection(current, word, latestSeen); }); });

  // Proponer / rehacer la lista. El texto explica qué hace: la IA lee los
  // subtítulos de la lección y propone palabras; nada se exporta todavía.
  const generateLabel = busy ? "Procesando…" : !session ? "Proponer palabras" : stale ? "Aplicar cambios a la lista" : "Volver a proponer palabras";
  const generateBlock = (
    <button type="button" disabled={busy || aiReady === false} title={aiReady === false ? aiNotice : undefined} onClick={() => prepare()} className={`${stale || !session ? primaryBtnCls : secondaryBtnCls} !h-9 w-full`}>
      <Icon name="sparkles" size={14} />{generateLabel}
    </button>
  );
  const regenerateInlineBtn = session && !stale && !autoSend && (
    <button
      type="button"
      aria-label="Volver a proponer palabras"
      disabled={busy || aiReady === false}
      title={aiReady === false ? aiNotice : "Volver a analizar los subtítulos de esta lección"}
      onClick={() => prepare()}
      className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] disabled:opacity-45 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 rounded px-1.5 py-0.5"
    >
      {busy ? <Loader2 size={11} className="animate-spin motion-reduce:animate-none" /> : <RefreshCw size={11} />}
      <span>Rehacer</span>
    </button>
  );

  // Lista + exportación: idéntica en Configuración y al final de Study.
  const language = TARGET_LANGUAGES.find(option => option.id === config.targetLang)?.label ?? config.targetLangLabel;
  // Las nuevas primero; las que ya tienes (de otra lección o curso) al final, sin seleccionar.
  // «Ya tienes»: las que llegaron igual a la lista + las que la lección repasa (session.known).
  const knownInList = session?.candidates.filter(word => exported.has(vocabularyWordKey(word.word))).length ?? 0;
  const knownCount = knownInList + (session?.known?.length ?? 0);
  const newCount = (session?.candidates.length ?? 0) - knownInList;
  const orderedCandidates = session ? [...session.candidates].sort((a, b) => Number(exported.has(vocabularyWordKey(a.word))) - Number(exported.has(vocabularyWordKey(b.word)))) : [];
  const sentSummaryDone = !compact && Boolean(session && !session.demo && selected.length === 0 && (session.exports.length > 0 || (sendState.result?.words ?? 0) > 0));
  const candidateItems = session && (
    <div className="space-y-1.5" role="region" aria-label="Candidatas de vocabulario">{orderedCandidates.map(word => {
      const wordKey = vocabularyWordKey(word.word); const seen = exported.has(wordKey); const on = session.selected.includes(wordKey);
      return <label key={wordKey} className={`flex gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${on ? "border-[#6d4aff]/45 bg-[var(--usb-accent-soft)]" : "border-[var(--usb-border)] bg-[var(--usb-bg-2)] hover:border-[#6d4aff]/30"} ${seen ? "opacity-70 cursor-default" : ""}`}>
        <input type="checkbox" aria-label={`Seleccionar ${word.word}`} checked={on} disabled={seen || busy || Boolean(stale)} onChange={() => toggleWord(word.word)} className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#6d4aff]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5 flex-wrap"><span className="text-[12.5px] font-bold text-[var(--usb-fg-hi)]">{word.word}</span><span className="font-mono text-[11px] text-[var(--usb-fg-mid)]">{word.phonetic}</span><span className="text-[10.5px] font-bold px-1.5 rounded bg-[var(--usb-bg-3)] text-[var(--usb-fg-mid)]">{word.level}</span>{seen && <span className="text-[10.5px] font-semibold text-[var(--usb-fg-mid)]" data-vocab-known>Ya en tu mazo{origins.get(wordKey) && origins.get(wordKey) !== course ? ` · ${origins.get(wordKey)}` : ""}</span>}</span>
          <span className="block text-[11.5px] text-[var(--usb-fg)]">{word.meaning}</span>
          <span className="block text-[11px] italic text-[var(--usb-fg-mid)] mt-0.5">{word.sentence}</span>
        </span>
      </label>;
    })}</div>
  );
  const wordList = session && <div className="space-y-2.5">
    {session.partial && <Notice tone="warn" icon="info">Transcripción parcial: esta lista no cubre toda la lección.</Notice>}
    {selected.length > config.maxWords && <Notice tone="warn" icon="alertCircle">La selección supera el máximo. Desmarca palabras para que lleguen a Anki.</Notice>}
    {sentSummaryDone ? (
      <details className="group rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)]">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] select-none">
          <span>Ver lista de palabras ({session.candidates.length})</span>
          <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-[var(--usb-border)] p-2.5">{candidateItems}</div>
      </details>
    ) : (
      <>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]" data-vocab-count>{newCount === 1 ? "1 palabra nueva" : `${newCount} palabras nuevas`} · desde {session.config.minLevel}{knownCount > 0 ? ` (${knownCount} ya en tu mazo)` : ""}{newCount > config.maxWords ? ` · máx. ${config.maxWords}` : ""}</p>
          {regenerateInlineBtn}
        </div>
        {candidateItems}
      </>
    )}
    {!compact && <VocabSendStatus
      words={selected.length}
      demo={Boolean(session.demo)} finished={autoSend} ankiReady={anki.ready} sendState={sendState} sentBefore={session.exports.length > 0}
      onRetry={() => { failedKeyRef.current = null; void (anki.ready ? sendWords() : anki.connect()); }}
    />}
  </div>;

  const staleNotice = stale && <Notice tone="warn" icon="alertCircle">Configuración modificada. La lista usa los criterios anteriores: aplica los cambios para que lo marcado llegue a Anki.</Notice>;

  if (!compact) {
    // Final de Study: elegir palabras. Llegan a Anki solas al terminar; los criterios viven en Ajustes → Idiomas.
    const targetEnglish = TARGET_LANGUAGES.find(option => option.id === config.targetLang)?.english ?? config.targetLangLabel ?? "English";
    const activeVocabDeck = vocabDestination(config, targetEnglish).deck;
    const sentBadge = session && !session.demo && (session.exports.length > 0 || (sendState.result?.words ?? 0) > 0) && selected.length === 0
      ? <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full border text-[var(--usb-ok-text)] bg-emerald-500/10 border-emerald-500/35 flex items-center gap-1 shrink-0"><CheckCircle2 size={10} />En Anki</span>
      : undefined;
    return <ExportModule icon={Languages} title="Palabras · opcional" badge={sentBadge} subtitle={`${language} · desde ${config.minLevel} · hasta ${config.maxWords} por lección`} configLabel="Ajustar" onToggleConfig={() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "vocabulary" } }))}>
      <div role="region" aria-label="Selección de vocabulario" className="space-y-2.5">
        {!sentSummaryDone && (
          <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold text-[var(--usb-fg-mid)]">Mazo de vocabulario</p>
              <p className="font-mono text-[11px] text-[var(--usb-fg-hi)] leading-snug [overflow-wrap:anywhere]">{activeVocabDeck}</p>
            </div>
            <span className="text-[10.5px] font-medium text-[var(--usb-fg-mid)] shrink-0">Sin duplicados</span>
          </div>
        )}
        {!session && (
          <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">Extrae palabras nuevas de los subtítulos omitiendo las que ya tienes.</p>
        )}
        {staleNotice}
        {(!session || stale) && generateBlock}
        {wordList}
      </div>
    </ExportModule>;
  }

  // Configuración: criterios (los mismos que se ven sin lección) + la lista de esta lección, plegada.
  const settings = <section aria-label="Selección de vocabulario" className="space-y-4">
    <VocabularyPreferences config={config} onConfig={onConfig} />
    {staleNotice}
    {(!session || stale) && generateBlock}
    {session && <details className="group rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)]">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-3 py-2.5 select-none">
        <span className="text-[12.5px] font-semibold text-[var(--usb-fg)]">Palabras de esta lección</span>
        <span className="flex items-center gap-2 text-[11px] tabular-nums text-[var(--usb-fg-mid)]">{newCount} nuevas · {selected.length} marcadas · {knownCount} en tu mazo<ChevronDown size={14} className="transition-transform group-open:rotate-180" /></span>
      </summary>
      <div className="border-t border-[var(--usb-border)] p-3">{wordList}</div>
    </details>}
  </section>;
  return mount ? createPortal(settings, mount) : null;
}

/** Fase 5 · qué pasa con lo marcado: llega a Anki al terminar (o espera a que Anki responda). */
function VocabSendStatus({ words, demo, finished, ankiReady, sendState, sentBefore, onRetry }: {
  words: number; demo: boolean; finished: boolean; ankiReady: boolean; sentBefore: boolean;
  sendState: { status: "idle" | "sending" | "error"; result?: VocabSendResult; error?: string };
  onRetry: () => void;
}) {
  const what = words === 1 ? "1 palabra" : `${words} palabras`;
  let tone: "info" | "ok" | "warn" = "info";
  let text: React.ReactNode;
  let action: React.ReactNode = null;
  if (demo) text = "Demo: en la extensión, lo que marques llega a Anki al terminar la lección.";
  else if (sendState.status === "sending") text = <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Enviando a Anki…</span>;
  else if (words === 0 && sendState.result) { tone = "ok"; text = `${sendState.result.added > 0 ? `${sendState.result.added} ${sendState.result.added === 1 ? "palabra nueva" : "palabras nuevas"}` : "Ya estaban"} en Anki · ${sendState.result.deck}`; }
  else if (words === 0 && sentBefore) { tone = "ok"; text = "Lo que marcaste de esta lección ya está en Anki."; }
  else if (words === 0) text = finished ? "Sin palabras marcadas." : "Marca en el video o en la lista las que quieras guardar.";
  else if (!finished) text = ankiReady ? `${what} se enviarán a Anki al terminar.` : `${what} quedarán listas para Anki al terminar.`;
  else if (sendState.status === "error" || !ankiReady) {
    tone = "warn";
    text = `Anki no responde · ${words === 1 ? "1 palabra en espera" : `${words} palabras en espera`}.`;
    action = <button type="button" onClick={onRetry} className="shrink-0 text-[11px] font-semibold text-[var(--usb-accent-text)] hover:underline">Reintentar</button>;
  } else text = <span className="inline-flex items-center gap-1.5"><Send size={12} />{what} van a Anki ahora.</span>;
  const color = tone === "ok" ? "text-[var(--usb-ok-text)]" : tone === "warn" ? "text-[var(--usb-warn-text)]" : "text-[var(--usb-fg-mid)]";
  return <div role="status" className="flex items-start justify-between gap-2" data-vocab-sync={demo ? "demo" : sendState.status === "sending" ? "sending" : words === 0 && (sendState.result || sentBefore) ? "sent" : finished && (sendState.status === "error" || !ankiReady) && words > 0 ? "waiting" : "idle"}>
    <p className={`text-[11px] leading-snug ${color}`}>{text}</p>
    {action}
  </div>;
}

/**
 * Ajustes → Idiomas: qué palabras te propone cada lección. Lo mismo con o sin
 * lección abierta (Ajustes lo muestra también antes de entrar, sin Study).
 * Mismo lenguaje que el resto de Ajustes: filas «qué es + ayuda» y su control.
 */
export function VocabularyPreferences({ config, onConfig }: { config: VocabConfig; onConfig: (patch: Partial<VocabConfig>) => void }) {
  const language = TARGET_LANGUAGES.find(option => option.id === config.targetLang)?.label ?? config.targetLangLabel;
  const lang = language.toLowerCase();
  const targetEnglish = TARGET_LANGUAGES.find(option => option.id === config.targetLang)?.english ?? config.targetLangLabel ?? "English";
  const explainIn = config.baseLangLabel.trim().toLowerCase() || "español";
  const explanationOptions = EXPLANATION_LANGUAGES.some(option => option.id === explainIn)
    ? EXPLANATION_LANGUAGES
    : [...EXPLANATION_LANGUAGES, { id: config.baseLangLabel, label: config.baseLangLabel }];
  const sameLanguageWarning = explainIn === lang;
  const activeDeck = vocabDestination(config, targetEnglish).deck;
  const openAnki = () => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "anki" } }));

  return <div className="space-y-4">
    <SettingsGroup title="Idiomas">
      <RowList>
        <SettingRow label="Aprendo">
          <Picker
            label="Idioma objetivo del vocabulario"
            value={config.targetLang}
            onChange={id => onConfig({ targetLang: id, targetLangLabel: TARGET_LANGUAGES.find(option => option.id === id)?.english ?? id })}
            options={TARGET_LANGUAGES}
          />
        </SettingRow>
        <SettingRow label="Traducir a">
          <Picker label="Idioma de explicación" value={explainIn} onChange={id => onConfig({ baseLangLabel: id })} options={explanationOptions} />
        </SettingRow>
        <SettingRow label="Mazo en Anki" hint={<Code>{activeDeck}</Code>}>
          <button type="button" onClick={openAnki} className={rowBtnCls} data-vocab-anki-link>Ver en Anki</button>
        </SettingRow>
      </RowList>
      {sameLanguageWarning && (
        <Notice tone="warn" icon="info">
          Mismo idioma elegido para aprender y explicar ({lang}).
        </Notice>
      )}
    </SettingsGroup>

    <SettingsGroup title="Selección">
      <RowList>
        <SettingRow label="Nivel mínimo" hint="Escala CEFR">
          <MiniScale label="Nivel mínimo de vocabulario" value={config.minLevel} onChange={id => onConfig({ minLevel: id })} options={["A1", "A2", "B1", "B2", "C1", "C2"]} />
        </SettingRow>
        <SettingRow label="Máximo por lección">
          <Stepper label="Máximo palabras nuevas" min={3} max={20} value={config.maxWords} onChange={value => onConfig({ maxWords: value })} />
        </SettingRow>
      </RowList>
      <KnownDecksField config={config} />
    </SettingsGroup>
  </div>;
}
