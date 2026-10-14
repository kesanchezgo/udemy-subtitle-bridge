import React, { createContext, useEffect, useState } from "react";
import { DockSheet } from "./DockSheet";
import { SettingsAccordion, SettingsSection } from "./settings/SettingsKit";
import { ApiKeysPanel } from "./ApiKeysPanel";
import { CacheSettingsPanel } from "./CacheSettingsPanel";
import { ObsidianSettings } from "./ObsidianSettings";
import { usePersistedState } from "../hooks/usePersistedState";
import {
  getAiProviderConfig, initAiProviderConfig, saveAiProviderConfig, setAiProviderConfigSync,
  type AiProviderConfig,
} from "../services/ai-providers";

/** Ranura donde Study proyecta (portal) las preferencias de vocabulario. */
export const VocabularyMountContext = createContext<HTMLElement | null>(null);

/**
 * Configuración vive a nivel del dock, igual que Nivel: funciona también en la
 * pantalla de inicio de sesión. ExtensionSidebar escucha "usb:provider-changed".
 */
export function SettingsSheet({ open, onClose, localConnected, onVocabularyMount }: {
  open: boolean;
  onClose: () => void;
  localConnected: boolean;
  onVocabularyMount: (el: HTMLDivElement | null) => void;
}) {
  const [providerConfig, setProviderConfig] = useState<AiProviderConfig>(() => getAiProviderConfig());
  const [cacheTtlDays, setCacheTtlDays] = usePersistedState<number>("cache_ttl_days", 7);
  // Sección pedida por deep-link (usb:open-settings con {section}): se aplica
  // al acordeón cuando la hoja ya está montada.
  const [sectionRequest, setSectionRequest] = useState<string | null>(null);

  useEffect(() => {
    const onSection = (e: Event) => {
      const section = (e as CustomEvent<{ section?: string }>).detail?.section;
      if (section) setSectionRequest(section);
    };
    window.addEventListener("usb:section-request", onSection);
    return () => window.removeEventListener("usb:section-request", onSection);
  }, []);

  useEffect(() => {
    if (!open || !sectionRequest) return;
    // El acordeón persiste en localStorage: escribir la clave lo abre directo.
    try { localStorage.setItem("kinema_settings_open_section", sectionRequest); } catch { /* modo sin storage */ }
    setSectionRequest(null);
    window.dispatchEvent(new CustomEvent("usb:section-applied", { detail: { section: sectionRequest } }));
  }, [open, sectionRequest]);

  useEffect(() => {
    let alive = true;
    void initAiProviderConfig().then(config => { if (alive) setProviderConfig(config); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const handleSaveProvider = (config: AiProviderConfig) => {
    const saved = setAiProviderConfigSync(config);
    setProviderConfig(saved);
    void saveAiProviderConfig(saved).catch(() => undefined);
    window.dispatchEvent(new CustomEvent("usb:provider-changed", { detail: saved }));
  };

  const providerMeta = ({ local: "Local", openai: "OpenAI", anthropic: "Claude", gemini: "Gemini" } as Record<string, string>)[providerConfig.kind] ?? "IA";

  return <DockSheet keepMounted open={open} eyebrow="Ajustes" title="Configuración" ariaLabel="Configuración de Kinema" closeLabel="Cerrar configuración" onClose={onClose}>
    <SettingsAccordion defaultId="provider">
    <SettingsSection sectionId="provider" icon="cpu" title="Proveedor de IA" description="Motor, conexión y llaves API" meta={providerMeta}>
      <ApiKeysPanel localConnected={localConnected} providerConfig={providerConfig} onSaveProvider={handleSaveProvider} />
    </SettingsSection>
    <SettingsSection sectionId="vocabulary" icon="languages" title="Mazo de idiomas" description="Palabras de cada lección para Anki" keepMounted>
      <div ref={onVocabularyMount} data-vocabulary-preferences className="peer" />
      <p className="hidden peer-empty:block text-[12px] leading-relaxed text-[var(--usb-fg-mid)]">Inicia sesión o continúa sin cuenta para ajustar el mazo de idiomas.</p>
    </SettingsSection>
    <SettingsSection sectionId="obsidian" icon="bookMarked" title="Obsidian" description="Guarda cada lección como nota">
      <ObsidianSettings active={open} />
    </SettingsSection>
    <SettingsSection sectionId="cache" icon="database" title="Caché" description="Datos regenerables guardados localmente" meta={`${cacheTtlDays} d`}>
      <CacheSettingsPanel ttlDays={cacheTtlDays} onTtlChange={setCacheTtlDays} />
    </SettingsSection>
  </SettingsAccordion>
  </DockSheet>;
}
