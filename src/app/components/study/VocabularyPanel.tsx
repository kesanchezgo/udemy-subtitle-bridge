import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Languages, ChevronDown, Download, Icon } from "../icons";
import { chromeLocalStorage } from "../../services/chromeStorage";
import { contentBridge } from "../../services/contentBridge";
import { buildVocabularySpec, markVocabularyExported, parseVocabularyPayload, type VocabConfig } from "../../services/vocabularyService";
import { exportedVocabularyKeys, prepareVocabularyCandidates, readVocabularySession, toggleVocabularySelection, updateVocabularySession, vocabularyCriteriaKey, vocabularySessionKey, vocabularyWordKey, withVocabularyExportLock, type VocabularySession } from "../../services/vocabularySession";
import { buildAnkiApkg, downloadApkg } from "../../services/ankiApkg";
import { ChoiceGroup, MiniScale, Notice, Picker, RowList, SettingRow, SettingsGroup, Stepper, fieldCls, primaryBtnCls, secondaryBtnCls } from "../settings/SettingsKit";
import { ExportModule } from "./ExportModule";

interface Props {
  course: string;
  lesson: string;
  config: VocabConfig;
  onConfig: (patch: Partial<VocabConfig>) => void;
  generate: () => Promise<unknown>;
  compact?: boolean;
  mount?: HTMLElement | null;
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


export function VocabularyPanel({ course, lesson, config, onConfig, generate, compact = false, mount }: Props) {
  const key = vocabularySessionKey(course, lesson, config.targetLang);
  const [session, setSession] = useState<VocabularySession | null>(null);
  const [exported, setExported] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [archiveChoice, setArchiveChoice] = useState("latest");
  const lock = useRef(false);
  const generation = useRef(0);
  const stale = session && vocabularyCriteriaKey(session.config) !== vocabularyCriteriaKey(config);
  useEffect(() => {
    const version = ++generation.current;
    let loadSequence = 0;
    setSession(null);
    setArchiveChoice("latest");
    if (compact) void contentBridge.sendToContent({ type: "GLOSSARY_UPDATE", payload: { sessionKey: key, words: [] } });
    const load = async () => {
      const sequence = ++loadSequence;
      const [next, seen] = await Promise.all([readVocabularySession(key), exportedVocabularyKeys(config.targetLang)]);
      if (generation.current !== version || loadSequence !== sequence) return;
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
          words: next?.candidates.map(word => ({
            ...word,
            selected: next.selected.includes(vocabularyWordKey(word.word)),
            exported: seen.has(vocabularyWordKey(word.word)),
            demo: next.demo,
            needsUpdate: vocabularyCriteriaKey(next.config) !== vocabularyCriteriaKey(config),
          })) ?? [],
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
    try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo completar la acción."); }
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
    if (!words.length) throw new Error("No hay candidatas que cumplan el nivel configurado.");
    await updateVocabularySession(key, previous => {
      const real = previous?.demo ? previous.realBackup : previous;
      return { course, lesson, config: { ...config }, candidates: words, selected: real?.selected.filter(value => words.some(word => vocabularyWordKey(word.word) === value)) ?? [], demo: false, partial: Boolean((payload as { partial?: boolean })?.partial), exports: real?.exports ?? [] };
    });
    toast.success("Candidatas preparadas", { description: "Selecciona desde el video o esta lista; todavía no se ha exportado nada." });
  });
  const selected = session?.candidates.filter(word => session.selected.includes(vocabularyWordKey(word.word)) && !exported.has(vocabularyWordKey(word.word))) ?? [];
  const exportWords = (redownload: boolean) => run(() => withVocabularyExportLock(key, async () => {
    const current = await readVocabularySession(key);
    if (!current || current.demo) throw new Error("La demo no exporta tarjetas ni modifica el registro real.");
    const seen = await exportedVocabularyKeys(current.config.targetLang);
    const archive = archiveChoice === "latest" ? current.exports.at(-1) : current.exports[Number(archiveChoice)];
    const words = redownload ? archive?.words ?? [] : current.candidates.filter(word => current.selected.includes(vocabularyWordKey(word.word)) && !seen.has(vocabularyWordKey(word.word)));
    const snapshot = redownload && archive ? archive.config : current.config;
    if (!redownload && vocabularyCriteriaKey(current.config) !== vocabularyCriteriaKey(config)) throw new Error("Actualiza las candidatas para aplicar la configuración nueva.");
    if (!words.length) throw new Error("Selecciona al menos una palabra nueva.");
    if (!redownload && words.length > snapshot.maxWords) throw new Error("La selección supera el máximo configurado.");
    // Fuente enlazable: la misma URL que usa el export de conceptos. Sin URL
    // (preview/local), el campo va vacío y la plantilla lo oculta.
    const lessonUrl = /^https?:/.test(window.location.href) ? window.location.href : undefined;
    const { spec, deckPath } = buildVocabularySpec(words, current.course, current.lesson, snapshot, lessonUrl);
    const apkg = await buildAnkiApkg(spec);
    downloadApkg(apkg, `${current.lesson.replace(/[^a-z0-9]/gi, "_")}_vocabulario_${snapshot.targetLang}.apkg`);
    if (!redownload) {
      await markVocabularyExported(snapshot.targetLang, words, { course: current.course, lesson: current.lesson, deck: deckPath });
      await updateVocabularySession(key, previous => {
        const latest = previous ?? current;
        const archive = { words, config: snapshot, createdAt: Date.now() };
        if (latest.demo) {
          const real = latest.realBackup ?? current;
          return { ...latest, realBackup: { ...real, exports: [...real.exports, archive] } };
        }
        return { ...latest, exports: [...latest.exports, archive] };
      });
    }
    toast.success(redownload ? "Archivo descargado de nuevo" : "Vocabulario exportado", { description: "Importa el archivo en Anki Desktop. La descarga no confirma la importación." });
  }));

  const exportedCount = session?.candidates.filter(word => exported.has(vocabularyWordKey(word.word))).length ?? 0;
  const toggleWord = (word: string) => run(async () => { const latestSeen = await exportedVocabularyKeys(config.targetLang); await updateVocabularySession(key, current => { if (!current) throw new Error("Prepara la lección primero."); return toggleVocabularySelection(current, word, latestSeen); }); });

  // Proponer / rehacer la lista. El texto explica qué hace: la IA lee los
  // subtítulos de la lección y propone palabras; nada se exporta todavía.
  const generateLabel = busy ? "Procesando…" : !session ? "Proponer palabras" : stale ? "Aplicar cambios a la lista" : "Volver a proponer palabras";
  const generateBlock = <div className="space-y-1.5">
    <button type="button" disabled={busy} onClick={() => prepare()} className={`${stale || !session ? primaryBtnCls : secondaryBtnCls} w-full`}><Icon name="sparkles" size={14} />{generateLabel}</button>
    <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">{session ? "Rehace la lista con estos ajustes; conserva lo que marcaste." : "No exporta nada: solo propone la lista."}</p>
  </div>;

  // Lista + exportación: idéntica en Configuración y al final de Study.
  const wordList = session && <div className="space-y-3">
    {session.partial && <Notice tone="warn" icon="info">Transcripción parcial: esta lista no cubre toda la lección.</Notice>}
    {selected.length > config.maxWords && <Notice tone="warn" icon="alertCircle">La selección supera el máximo. Desmarca palabras antes de exportar.</Notice>}
    <div className="max-h-72 overflow-y-auto overscroll-contain space-y-1.5" role="region" aria-label="Candidatas de vocabulario" tabIndex={0}>{session.candidates.map(word => {
      const wordKey = vocabularyWordKey(word.word); const seen = exported.has(wordKey); const on = session.selected.includes(wordKey);
      return <label key={wordKey} className={`flex gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${on ? "border-[#6d4aff]/45 bg-[var(--usb-accent-soft)]" : "border-[var(--usb-border)] bg-[var(--usb-bg-2)] hover:border-[#6d4aff]/30"} ${seen ? "opacity-70 cursor-default" : ""}`}>
        <input type="checkbox" aria-label={`Seleccionar ${word.word}`} checked={on} disabled={seen || busy || Boolean(stale)} onChange={() => toggleWord(word.word)} className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#6d4aff]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5 flex-wrap"><span className="text-[12.5px] font-bold text-[var(--usb-fg-hi)]">{word.word}</span><span className="font-mono text-[11px] text-[var(--usb-fg-mid)]">{word.phonetic}</span><span className="text-[10.5px] font-bold px-1.5 rounded bg-[var(--usb-bg-3)] text-[var(--usb-fg-mid)]">{word.level}</span>{seen && <span className="text-[10.5px] font-semibold text-[var(--usb-fg-mid)]">Ya exportada</span>}</span>
          <span className="block text-[11.5px] text-[var(--usb-fg)]">{word.meaning}</span>
          <span className="block text-[11px] italic text-[var(--usb-fg-mid)] mt-0.5">{word.sentence}</span>
        </span>
      </label>;
    })}</div>
    {session.exports.length > 1 && <SettingsGroup title="Archivo para volver a descargar">
      <ChoiceGroup label="Lote de vocabulario exportado" columns={2} disabled={busy} value={archiveChoice} onChange={setArchiveChoice} options={[{ id: "latest", label: "Último", hint: `${session.exports.at(-1)?.words.length ?? 0} palabras` }, ...session.exports.map((archive, index) => ({ id: String(index), label: `Lote ${index + 1}`, hint: `${archive.words.length} palabras · ${new Date(archive.createdAt).toLocaleDateString("es-ES")}` }))]} />
    </SettingsGroup>}
    <div className={`grid gap-2 ${session.exports.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
      <button type="button" disabled={busy || !selected.length || selected.length > config.maxWords || session.demo || Boolean(stale)} onClick={() => exportWords(false)} className={primaryBtnCls}><Download size={14} />Exportar {selected.length} nuevas</button>
      {session.exports.length > 0 && <button type="button" disabled={busy || session.demo} onClick={() => exportWords(true)} className={secondaryBtnCls}>Volver a descargar · sin IA</button>}
    </div>
    <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">Descargar el archivo no confirma que se haya importado en Anki.</p>
  </div>;

  const staleNotice = stale && <Notice tone="warn" icon="alertCircle">Configuración modificada. La lista usa los criterios anteriores: aplica los cambios antes de exportar.</Notice>;
  const language = TARGET_LANGUAGES.find(option => option.id === config.targetLang)?.label ?? config.targetLangLabel;

  if (!compact) {
    // Final de Study: seleccionar y exportar. Los criterios viven en Configuración.
    return <ExportModule icon={Languages} title="Mazo de idiomas · opcional" subtitle={`${language} · desde ${config.minLevel} · hasta ${config.maxWords} nuevas`} configLabel="Ajustar" onToggleConfig={() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "vocabulary" } }))}>
      <div role="region" aria-label="Selección de vocabulario" className="space-y-3">
        <p className="text-[11.5px] leading-relaxed text-[var(--usb-fg-mid)]">Palabras de esta lección para tu mazo de idiomas. Márcalas aquí o en el video.</p>
        {staleNotice}
        {generateBlock}
        {wordList}
      </div>
    </ExportModule>;
  }

  // Configuración: criterios + la misma lista, plegada.
  const explanationOptions = EXPLANATION_LANGUAGES.some(option => option.id === config.baseLangLabel.trim().toLowerCase())
    ? EXPLANATION_LANGUAGES
    : [...EXPLANATION_LANGUAGES, { id: config.baseLangLabel, label: config.baseLangLabel }];
  const settings = <section aria-label="Selección de vocabulario" className="space-y-4">
    <p className="text-[11.5px] leading-relaxed text-[var(--usb-fg-mid)]">Al terminar una lección, la IA propone palabras de sus subtítulos para tu mazo de idiomas en Anki.</p>
    <SettingsGroup title="Idiomas">
      <RowList>
        <SettingRow label="Aprendo"><Picker label="Idioma objetivo del vocabulario" value={config.targetLang} onChange={id => onConfig({ targetLang: id, targetLangLabel: TARGET_LANGUAGES.find(option => option.id === id)?.english ?? id })} options={TARGET_LANGUAGES} /></SettingRow>
        <SettingRow label="Explicaciones en" hint="Significado y traducciones"><Picker label="Idioma de explicación" value={config.baseLangLabel.trim().toLowerCase() || "español"} onChange={id => onConfig({ baseLangLabel: id })} options={explanationOptions} /></SettingRow>
      </RowList>
    </SettingsGroup>
    <SettingsGroup title="Por lección">
      <RowList>
        <SettingRow label="Desde el nivel" hint="CEFR"><MiniScale label="Nivel mínimo de vocabulario" value={config.minLevel} onChange={id => onConfig({ minLevel: id })} options={["A1", "A2", "B1", "B2", "C1", "C2"]} /></SettingRow>
        <SettingRow label="Palabras nuevas" hint="Máximo, de 3 a 20"><Stepper label="Máximo palabras nuevas" min={3} max={20} value={config.maxWords} onChange={value => onConfig({ maxWords: value })} /></SettingRow>
      </RowList>
    </SettingsGroup>
    <SettingsGroup title="Anki">
      <RowList>
        <SettingRow label="Tarjeta para producir"><Picker label="Tarjeta para producir" value={config.production === false ? "no" : "si"} onChange={id => onConfig({ production: id === "si" })} options={[{ id: "si", label: "Activada", hint: "Reconocer + Producir (español →)" }, { id: "no", label: "Solo reconocer", hint: "Una tarjeta por palabra" }]} /></SettingRow>
        <div className="px-3 py-2.5 space-y-1.5">
          <label className="flex items-center justify-between gap-3"><span className="text-[12.5px] font-semibold text-[var(--usb-fg)]">Mazo raíz</span><input aria-label="Mazo raíz de Anki" className={`${fieldCls} !h-8 !w-40 !rounded-lg`} value={config.rootDeck} onChange={event => onConfig({ rootDeck: event.target.value })} /></label>
          <p className="text-[10.5px] text-[var(--usb-fg-mid)]">También agrupa las tarjetas de la lección.</p>
          <p className="font-mono text-[10.5px] text-[var(--usb-fg-mid)] [overflow-wrap:anywhere]">{config.rootDeck || "…"}::Courses::‹curso›::‹lección›<br />{config.rootDeck || "…"}::Vocabulary::{config.targetLangLabel}::‹curso›</p>
        </div>
      </RowList>
    </SettingsGroup>
    {staleNotice}
    {generateBlock}
    {session && <details className="group rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)]">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-3 py-2.5 select-none">
        <span className="text-[12.5px] font-semibold text-[var(--usb-fg)]">Palabras de esta lección</span>
        <span className="flex items-center gap-2 text-[11px] tabular-nums text-[var(--usb-fg-mid)]">{session.candidates.length} · {selected.length} sel. · {exportedCount} exp.<ChevronDown size={14} className="transition-transform group-open:rotate-180" /></span>
      </summary>
      <div className="border-t border-[var(--usb-border)] p-3">{wordList}</div>
    </details>}
  </section>;
  return mount ? createPortal(settings, mount) : null;
}

const TARGET_LANGUAGES = [
  { id: "en", label: "Inglés", english: "English" },
  { id: "fr", label: "Francés", english: "French" },
  { id: "de", label: "Alemán", english: "German" },
  { id: "pt", label: "Portugués", english: "Portuguese" },
  { id: "it", label: "Italiano", english: "Italian" },
];

/** Se guarda el nombre en minúsculas: es lo que recibe el prompt. */
const EXPLANATION_LANGUAGES = [
  { id: "español", label: "Español" },
  { id: "inglés", label: "Inglés" },
  { id: "portugués", label: "Portugués" },
  { id: "francés", label: "Francés" },
  { id: "alemán", label: "Alemán" },
  { id: "italiano", label: "Italiano" },
];
