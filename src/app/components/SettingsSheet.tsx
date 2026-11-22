import React, { createContext, useCallback, useEffect, useState } from "react";
import { DockSheet } from "./DockSheet";
import { SettingsAccordion, SettingsSection } from "./settings/SettingsKit";
import { ApiKeysPanel } from "./ApiKeysPanel";
import { CacheSettingsPanel } from "./CacheSettingsPanel";
import { ObsidianSettings } from "./ObsidianSettings";
import { usePersistedState } from "../hooks/usePersistedState";
import { AnkiSettings } from "./study/AnkiSettings";
import { VocabularyPreferences } from "./study/VocabularyPanel";
import { languageName } from "./study/vocabLanguages";
import { loadVocabConfig, saveVocabConfig, type VocabConfig } from "../services/vocabularyService";
import { rootOf } from "../services/ankiDestination";
import { loadObsidianExportConfig } from "../services/obsidianExport";
import { chromeLocalStorage } from "../services/chromeStorage";
import {
  getAiProviderConfig, initAiProviderConfig, saveAiProviderConfig, setAiProviderConfigSync,
  type AiProviderConfig,
} from "../services/ai-providers";

/** Ranura donde Study proyecta (portal) las preferencias de idiomas (qué palabras se proponen). */
export const VocabularyMountContext = createContext<HTMLElement | null>(null);
/** Ranura de los ajustes de Anki (Study es quien guarda su configuración: una sola fuente). */
export const AnkiMountContext = createContext<HTMLElement | null>(null);

/**
 * La ranura donde Study proyecta Anki o Idiomas. Mientras Study no está (antes
 * de entrar o de «Continuar sin cuenta»), Ajustes muestra esos mismos ajustes
 * por su cuenta: nunca una sección vacía ni un «inicia sesión».
 */
function StudySlot({ onMount, onFilled, attrs, children }: { onMount: (el: HTMLDivElement | null) => void; onFilled: (filled: boolean) => void; attrs: Record<string, string>; children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [filled, setFilled] = useState(false);
  const ref = useCallback((node: HTMLDivElement | null) => { setEl(node); onMount(node); }, [onMount]);
  useEffect(() => {
    if (!el) return;
    const update = () => setFilled(el.childElementCount > 0);
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { childList: true });
    return () => observer.disconnect();
  }, [el]);
  useEffect(() => { onFilled(filled); }, [filled, onFilled]);
  return <>
    <div ref={ref} {...attrs} />
    {!filled && children}
  </>;
}

/**
 * Configuración vive a nivel del dock, igual que Nivel: funciona también en la
 * pantalla de inicio de sesión. ExtensionSidebar escucha "usb:provider-changed".
 */
export function SettingsSheet({ open, onClose, localConnected, onVocabularyMount, onAnkiMount }: {
  open: boolean;
  onClose: () => void;
  localConnected: boolean;
  onVocabularyMount: (el: HTMLDivElement | null) => void;
  onAnkiMount: (el: HTMLDivElement | null) => void;
}) {
  const [providerConfig, setProviderConfig] = useState<AiProviderConfig>(() => getAiProviderConfig());
  const [cacheTtlDays, setCacheTtlDays] = usePersistedState<number>("cache_ttl_days", 7);

  // El sheet es keepMounted: leer el config cada vez que se ABRE, no solo al
  // montar. Si el init de arranque resolvió antes de una escritura externa
  // (otro contexto o el seed de pruebas), el panel guardaría valores viejos.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void initAiProviderConfig().then(config => { if (alive) setProviderConfig(config); }).catch(() => undefined);
    return () => { alive = false; };
  }, [open]);

  const handleSaveProvider = (config: AiProviderConfig) => {
    const saved = setAiProviderConfigSync(config);
    setProviderConfig(saved);
    void saveAiProviderConfig(saved).catch(() => undefined);
    window.dispatchEvent(new CustomEvent("usb:provider-changed", { detail: saved }));
  };

  // Sin Study, Anki e Idiomas comparten UNA copia de la configuración (la
  // misma que guarda Study: usb_vocab_config), leída cada vez que Study no está.
  const [slots, setSlots] = useState({ anki: false, vocabulary: false });
  const studyPresent = slots.anki && slots.vocabulary;
  const [standaloneCfg, setStandaloneCfg] = useState<VocabConfig | null>(null);
  const [summaryCfg, setSummaryCfg] = useState<VocabConfig | null>(null);
  const [vaultMeta, setVaultMeta] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void loadVocabConfig().then(value => {
        if (!alive) return;
        setSummaryCfg(value);
        if (!studyPresent) setStandaloneCfg(value);
      }).catch(() => undefined);
      void loadObsidianExportConfig().then(obs => {
        if (alive) setVaultMeta(obs.vaultName.trim());
      }).catch(() => undefined);
    };
    if (studyPresent) setStandaloneCfg(null);
    refresh();
    const off = chromeLocalStorage.onChange(() => refresh());
    return () => { alive = false; off(); };
  }, [studyPresent, open]);

  const onStandaloneConfig = (patch: Partial<VocabConfig>) => {
    if (!standaloneCfg) return;
    const next = { ...standaloneCfg, ...patch };
    setStandaloneCfg(next);
    setSummaryCfg(next);
    void saveVocabConfig(next);
  };
  const ankiFilled = useCallback((filled: boolean) => setSlots(current => current.anki === filled ? current : { ...current, anki: filled }), []);
  const vocabularyFilled = useCallback((filled: boolean) => setSlots(current => current.vocabulary === filled ? current : { ...current, vocabulary: filled }), []);

  const providerMeta = ({ local: "Local", openai: "OpenAI", anthropic: "Claude", gemini: "Gemini" } as Record<string, string>)[providerConfig.kind] ?? "IA";
  const ankiMeta = summaryCfg ? rootOf(summaryCfg) : undefined;
  const vocabMeta = summaryCfg ? `${languageName(summaryCfg)} · ${summaryCfg.minLevel}` : undefined;

  return <DockSheet keepMounted open={open} eyebrow="Ajustes" title="Configuración" ariaLabel="Configuración de Kinema" closeLabel="Cerrar configuración" onClose={onClose}>
    <SettingsAccordion defaultId="provider">
    <SettingsSection sectionId="provider" icon="cpu" title="Proveedor de IA" description="Motor, conexión y llaves API" meta={providerMeta}>
      <ApiKeysPanel localConnected={localConnected} providerConfig={providerConfig} onSaveProvider={handleSaveProvider} />
    </SettingsSection>
    <SettingsSection sectionId="anki" icon="layers" title="Anki" description="Conexión y mazos" meta={ankiMeta} keepMounted>
      <StudySlot onMount={onAnkiMount} onFilled={ankiFilled} attrs={{ "data-anki-preferences": "" }}>
        {standaloneCfg && <div data-anki-standalone><AnkiSettings config={standaloneCfg} onConfig={onStandaloneConfig} /></div>}
      </StudySlot>
    </SettingsSection>
    <SettingsSection sectionId="vocabulary" icon="languages" title="Idiomas" description="Idioma, nivel y límite por lección" meta={vocabMeta} keepMounted>
      <StudySlot onMount={onVocabularyMount} onFilled={vocabularyFilled} attrs={{ "data-vocabulary-preferences": "" }}>
        {standaloneCfg && <div data-vocabulary-standalone><VocabularyPreferences config={standaloneCfg} onConfig={onStandaloneConfig} /></div>}
      </StudySlot>
    </SettingsSection>
    <SettingsSection sectionId="obsidian" icon="bookMarked" title="Obsidian" description="Vault, conexión y formato de notas" meta={vaultMeta || undefined}>
      <ObsidianSettings active={open} />
    </SettingsSection>
    <SettingsSection sectionId="cache" icon="database" title="Caché" description="Datos temporales regenerables" meta={`${cacheTtlDays} d`}>
      <CacheSettingsPanel ttlDays={cacheTtlDays} onTtlChange={setCacheTtlDays} />
    </SettingsSection>
  </SettingsAccordion>
  </DockSheet>;
}
