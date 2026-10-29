import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon, ChevronDown } from "./icons";
import {
  DEFAULT_OBSIDIAN_EXPORT_CONFIG, buildObsidianOpenVaultUri, createVaultScaffold,
  loadObsidianExportConfig, openObsidianUri, saveObsidianExportConfig,
} from "../services/obsidianExport";
import { Field, SettingsGroup, ToggleRow, fieldCls, primaryBtnCls, secondaryBtnCls } from "./settings/SettingsKit";

/** Árbol del vault: muestra qué se crea y dónde, sin jerga. */
function VaultTree({ vault, notes, courses }: { vault: string; notes: string; courses: string }) {
  const row = "flex items-baseline gap-2 min-w-0";
  return <div className="rounded-lg bg-[var(--usb-bg-3)] border border-[var(--usb-border)] px-3 py-2.5 font-mono text-[11px] leading-[1.7] text-[var(--usb-fg)]">
    <div className={row}><Icon name="folderSync" size={12} className="text-[#8b6dff] shrink-0 self-center" /><span className="font-bold text-[var(--usb-fg-hi)] truncate">{vault || "Tu vault"}</span></div>
    <div className={`${row} pl-4`}><span className="text-[var(--usb-fg-mid)]">├</span><span className="[overflow-wrap:anywhere]">{notes}/</span><span className="ml-auto shrink-0 font-sans text-[10.5px] text-[var(--usb-fg-mid)]">una nota por lección</span></div>
    <div className={`${row} pl-4`}><span className="text-[var(--usb-fg-mid)]">└</span><span className="[overflow-wrap:anywhere]">{courses}/</span><span className="ml-auto shrink-0 font-sans text-[10.5px] text-[var(--usb-fg-mid)]">un índice por curso</span></div>
  </div>;
}

export function ObsidianSettings({ active }: { active: boolean }) {
  const [config, setConfig] = useState(DEFAULT_OBSIDIAN_EXPORT_CONFIG);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!active) return; let alive = true; void loadObsidianExportConfig().then(value => { if (alive) setConfig(value); }); return () => { alive = false; }; }, [active]);

  const set = (patch: Partial<typeof config>) => setConfig(current => ({ ...current, ...patch }));
  const clean = (folder: string, fallback: string) => folder.replace(/^\/+|\/+$/g, "") || fallback;
  const notes = clean(config.sourcesFolder, DEFAULT_OBSIDIAN_EXPORT_CONFIG.sourcesFolder);
  const courses = clean(config.mocsFolder, DEFAULT_OBSIDIAN_EXPORT_CONFIG.mocsFolder);
  const hasVault = Boolean(config.vaultName.trim());

  const requireVault = () => {
    if (hasVault) return true;
    toast.error("Escribe el nombre del vault primero.");
    return false;
  };

  return <div className="space-y-4">
    <p className="text-[11.5px] leading-relaxed text-[var(--usb-fg-mid)]">Obsidian es una app de notas. Kinema guarda ahí cada lección como una nota con conceptos y preguntas. Un <span className="font-semibold text-[var(--usb-fg)]">vault</span> es la carpeta donde Obsidian guarda tus notas.</p>

    <SettingsGroup title="Tu vault">
      <input aria-label="Nombre del vault" placeholder="Nombre exacto, p. ej. Mis notas" className={fieldCls} value={config.vaultName} onChange={event => set({ vaultName: event.target.value })} />
      <VaultTree vault={config.vaultName.trim()} notes={notes} courses={courses} />
      <details className="group">
        <summary className="list-none cursor-pointer select-none inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)]">Cambiar carpetas<ChevronDown size={13} className="transition-transform group-open:rotate-180" /></summary>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Field label="Lecciones"><input aria-label="Carpeta de lecciones" placeholder={DEFAULT_OBSIDIAN_EXPORT_CONFIG.sourcesFolder} className={`${fieldCls} font-mono`} value={config.sourcesFolder} onChange={event => set({ sourcesFolder: event.target.value })} /></Field>
          <Field label="Cursos"><input aria-label="Carpeta de cursos" placeholder={DEFAULT_OBSIDIAN_EXPORT_CONFIG.mocsFolder} className={`${fieldCls} font-mono`} value={config.mocsFolder} onChange={event => set({ mocsFolder: event.target.value })} /></Field>
        </div>
      </details>
    </SettingsGroup>

    <SettingsGroup title="La nota incluye">
      <div className="space-y-2.5">
        <ToggleRow label="Tarjetas de la lección" description="Van a la nota como referencia plegada, bien formateadas." checked={config.includeCards} onChange={value => set({ includeCards: value })} />
        {config.includeCards && (
          <ToggleRow label="Repasar también en Obsidian" description="Formato del plugin Spaced Repetition (#flashcards). Apagado por defecto: Anki es el único planificador." checked={config.srFlashcards === true} onChange={value => set({ srFlashcards: value })} />
        )}
        <ToggleRow label="Subtítulos originales" description="La transcripción completa." checked={config.includeRawSrt} onChange={value => set({ includeRawSrt: value })} />
        <ToggleRow label="Guardar automáticamente" description="Al preparar cada lección. Si no, desde el final de Study." checked={config.autoExport} onChange={value => set({ autoExport: value })} />
      </div>
    </SettingsGroup>

    <div className="space-y-2">
      <button type="button" disabled={busy} className={`${primaryBtnCls} w-full`} onClick={async () => { setBusy(true); try { await saveObsidianExportConfig(config); toast.success("Preferencias de Obsidian guardadas"); } catch { toast.error("No se pudieron guardar las preferencias"); } finally { setBusy(false); } }}>Guardar preferencias</button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={secondaryBtnCls} onClick={() => { if (!requireVault()) return; openObsidianUri(buildObsidianOpenVaultUri(config.vaultName)); toast.info("Obsidian debería abrir ese vault ahora", { description: "Si avisa que no existe, revisa el nombre exacto." }); }}><Icon name="externalLink" size={14} />Probar vault</button>
        <button type="button" className={secondaryBtnCls} onClick={() => { if (!requireVault()) return; const count = createVaultScaffold(config, { platform: "udemy" }); toast.success(`Creando estructura (${count} notas)…`, { description: "Índice, log y plantillas dentro del vault." }); }}><Icon name="folderPlus" size={14} />Crear carpetas</button>
      </div>
      <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">Chrome preguntará si abrir Obsidian: elige «Siempre».</p>
    </div>
  </div>;
}
