import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Icon, Eye, EyeOff, Loader2 } from "./icons";
import JSZip from "jszip";
import {
  DEFAULT_OBSIDIAN_EXPORT_CONFIG, buildObsidianOpenVaultUri, buildVaultScaffold,
  openObsidianUri, saveObsidianExportConfig, slugifyVault, type ObsidianExportConfig,
} from "../services/obsidianExport";
import { cleanVaultFolder, freezeCourseFolders, layoutPreview, mocsRoot, sourcesRoot } from "../services/obsidianDestination";
import { ObsidianUnavailableError, loadCourseFolders, loadObsidianConfig, prepareVaultIfNeeded, saveCourseFolders, type VaultPreparation } from "../services/obsidianBridge";
import { DEFAULT_OBSIDIAN_REST_URL, normalizeRestUrl } from "../services/obsidianRestOps";
import { useObsidianConnection } from "../hooks/useObsidianConnection";
import { historyService } from "../services/historyService";
import {
  Disclosure, Field, HowTo, PathPreview, RowList, SettingRow, SettingsGroup, StatusPill, ToggleRow,
  fieldCls, rowBtnCls, secondaryBtnCls, type ConnectionTone,
} from "./settings/SettingsKit";

/** Lo que se guarda: carpetas limpias, URL solo si es de este ordenador, sin espacios. */
function normalized(config: ObsidianExportConfig, previous: ObsidianExportConfig): ObsidianExportConfig {
  const url = config.restUrl?.trim();
  return {
    ...config,
    vaultName: config.vaultName.trim(),
    sourcesFolder: cleanVaultFolder(config.sourcesFolder) || DEFAULT_OBSIDIAN_EXPORT_CONFIG.sourcesFolder,
    mocsFolder: cleanVaultFolder(config.mocsFolder) || DEFAULT_OBSIDIAN_EXPORT_CONFIG.mocsFolder,
    // Una dirección que no es de este ordenador no se guarda (se queda la anterior).
    restUrl: !url ? undefined : normalizeRestUrl(url) ?? previous.restUrl,
    restApiKey: config.restApiKey?.trim() || undefined,
    // Fase 5: siempre una carpeta por curso.
    noteLayout: "course",
  };
}

const formatDate = (ms: number) => new Date(ms).toLocaleDateString("es", { day: "numeric", month: "short" });

export function ObsidianSettings({ active }: { active: boolean }) {
  const [config, setConfig] = useState<ObsidianExportConfig>(DEFAULT_OBSIDIAN_EXPORT_CONFIG);
  /** Lo último guardado (al cambiar la carpeta, los cursos con notas se quedan donde estaban). */
  const [saved, setSaved] = useState<ObsidianExportConfig>(DEFAULT_OBSIDIAN_EXPORT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const conn = useObsidianConnection(active);
  const configRef = useRef(config);
  const savedRef = useRef(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  configRef.current = config;
  savedRef.current = saved;

  useEffect(() => {
    if (!active) return;
    let alive = true;
    // Fase 5: ya con la estructura de ahora (los cursos con notas se quedan en su carpeta).
    void loadObsidianConfig().then(value => { if (alive) { setConfig(value); setSaved(value); setLoaded(true); } });
    return () => { alive = false; };
  }, [active]);

  /** Guarda lo de ahora. Si cambia la carpeta de lecciones, los cursos que YA tienen notas se quedan en la suya. */
  const persist = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const previous = savedRef.current;
    const next = normalized(configRef.current, previous);
    if (JSON.stringify(next) === JSON.stringify(previous)) return;
    try {
      let frozen = 0;
      if (sourcesRoot(next) !== sourcesRoot(previous)) {
        const lectures = (await historyService.listLectures()).filter(l => !l.deletedAt && l.obsidianExportedAt);
        const coursesWithNotes = [...new Map(lectures.map(l => [l.courseId, { course: l.courseName, programSlug: l.dcTrackSlug ?? null, notePath: l.obsidianNotePath ?? null }])).values()];
        const registry = await loadCourseFolders();
        const updated = freezeCourseFolders(registry, previous, coursesWithNotes);
        frozen = Object.keys(updated).length - Object.keys(registry).length;
        if (frozen > 0) await saveCourseFolders(updated);
      }
      await saveObsidianExportConfig(next);
      setSaved(next);
      if (frozen > 0) toast.info("Carpeta de lecciones cambiada", { description: `${frozen === 1 ? "1 curso que ya tiene notas se queda" : `${frozen} cursos que ya tienen notas se quedan`} en su carpeta. Para moverlos, «Cambiar» en Fijar o en la Biblioteca.` });
    } catch {
      toast.error("No se pudieron guardar los ajustes de Obsidian");
    }
  };

  /** Cambia y guarda solo: los interruptores al momento; lo que se escribe, al dejar de escribir. */
  const update = (patch: Partial<ObsidianExportConfig>, when: "now" | "typing" | "blur" = "now") => {
    const current = configRef.current;
    const next = { ...current, ...patch };
    // La primera vez que pegas la clave, el vault se prepara solo (se puede apagar).
    if (patch.restApiKey !== undefined && !current.restApiKey?.trim() && patch.restApiKey.trim() && next.prepareVault === undefined) next.prepareVault = true;
    configRef.current = next;
    setConfig(next);
    if (timer.current) clearTimeout(timer.current);
    if (when === "now") void persist();
    else if (when === "typing") timer.current = setTimeout(() => { void persist(); }, 700);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void persist(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // El vault se prepara solo, una vez, en cuanto hay conexión (y «Preparar el vault» está encendido).
  const prepare = async (force: boolean) => {
    setPreparing(true);
    try {
      const result: VaultPreparation | null = await prepareVaultIfNeeded({ force });
      const fresh = await loadObsidianConfig();
      setSaved(prev => ({ ...prev, vaultPreparedAt: fresh.vaultPreparedAt }));
      setConfig(prev => ({ ...prev, vaultPreparedAt: fresh.vaultPreparedAt }));
      if (!result) return;
      if (result.failed) toast.error("No se pudo preparar todo el vault", { description: result.error });
      else toast.success("Vault preparado", {
        description: result.created
          ? `${result.created} ${result.created === 1 ? "nota creada" : "notas creadas"} (índice, registro, plantillas y CLAUDE.md). Lo que ya tenías no se tocó.`
          : "Ya tenía todo: no se tocó nada.",
      });
    } catch (error) {
      if (!(error instanceof ObsidianUnavailableError)) toast.error("Obsidian no respondió", { description: error instanceof Error ? error.message : String(error) });
    } finally { setPreparing(false); }
  };
  useEffect(() => {
    if (!active || !loaded || !conn.ready || preparing || saved.prepareVault !== true || saved.vaultPreparedAt) return;
    void prepare(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, loaded, conn.ready, saved.prepareVault, saved.vaultPreparedAt]);

  const draftKey = config.restApiKey?.trim() ?? "";
  const urlText = config.restUrl?.trim() ?? "";
  const urlOk = !urlText || normalizeRestUrl(urlText) !== null;
  const pendingSave = draftKey !== (saved.restApiKey ?? "") || (urlOk && (normalizeRestUrl(urlText || DEFAULT_OBSIDIAN_REST_URL) !== normalizeRestUrl(saved.restUrl || DEFAULT_OBSIDIAN_REST_URL)));
  const status = conn.status;
  const tone: ConnectionTone = !draftKey ? "idle"
    : pendingSave || (conn.checking && !status) ? "busy"
      : !status ? "idle"
        : !status.available || !status.authenticated ? "warn" : "ok";
  const pill = tone === "ok" ? "Conectado" : tone === "busy" ? "Comprobando" : tone === "warn" ? (status?.available ? "Clave incorrecta" : "No responde") : "Sin conectar";
  const statusText = !draftKey ? "Sin conectar · pega la clave abajo"
    : tone === "busy" ? "Comprobando la conexión…"
      : !status ? "La conexión directa funciona en la extensión (no en esta vista previa)."
        : !status.available ? "Obsidian cerrado · pendiente de guardado"
          : !status.authenticated ? "Clave rechazada en Local REST API"
            : `Conectado${status.obsidian ? ` · Obsidian ${status.obsidian}` : ""} · guardado automático`;

  const courses = mocsRoot(config);
  const hasVault = Boolean(config.vaultName.trim());
  const vaultLabel = config.vaultName.trim() || "Tu vault";

  // Sin conexión, la estructura viaja como .zip: Chrome abre un solo protocolo
  // por clic y obsidian://new no crea carpetas vacías.
  const downloadScaffold = async () => {
    const { notes: files, folders } = buildVaultScaffold(config);
    const zip = new JSZip();
    folders.forEach(folder => zip.folder(folder));
    files.forEach(note => zip.file(note.path, note.markdown));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slugifyVault(config.vaultName || "vault") || "vault"}-estructura-kinema.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast.success("Estructura descargada", { description: `Descomprímela dentro de la carpeta de tu vault: ${files.length} notas y ${folders.length} carpetas.` });
  };

  const toggleRow = "px-3 py-2.5";

  return <div className="space-y-4">
    <SettingsGroup title="Vault y conexión" aside={<StatusPill tone={tone}>{pill}</StatusPill>}>
      <RowList>
        <SettingRow label="Nombre del vault" hint="Como figura en Obsidian">
          <input
            aria-label="Nombre del vault"
            placeholder="Mis notas"
            className={`${fieldCls} !h-8 !w-40 !rounded-lg`}
            value={config.vaultName}
            onChange={event => update({ vaultName: event.target.value }, "typing")}
            onBlur={() => void persist()}
          />
        </SettingRow>
        <SettingRow label={<>Local REST API{tone === "ok" && status?.version ? <span className="font-medium text-[var(--usb-fg-mid)]"> · {status.version}</span> : null}</>}
          hint={<span data-obsidian-connection-status>{statusText}</span>} hintTone={tone === "warn" ? "warn" : "mid"} attrs={{ "data-obsidian-connection": "" }}>
          <button type="button" onClick={() => { void persist().then(() => conn.connect()); }} disabled={!draftKey || conn.checking} className={rowBtnCls}>
            {conn.checking ? <Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> : <Icon name="refreshCw" size={12} />}Comprobar
          </button>
        </SettingRow>
        <SettingRow label="Clave API" hint="Puerto 27123 por defecto">
          <span className="relative flex items-center w-40">
            <input aria-label="Clave del plugin Local REST API" type={keyVisible ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder="API Key"
              className={`${fieldCls} !h-8 !rounded-lg font-mono pr-8`}
              value={config.restApiKey ?? ""} onChange={event => update({ restApiKey: event.target.value }, "typing")} onBlur={() => void persist()} />
            <button type="button" onClick={() => setKeyVisible(v => !v)} aria-label={keyVisible ? "Ocultar clave" : "Mostrar clave"}
              className="absolute right-1 w-6 h-6 rounded-md flex items-center justify-center text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)]">
              {keyVisible ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </span>
        </SettingRow>
      </RowList>
      <HowTo summary="Cómo conectar Obsidian" steps={[
        "Instala y activa el plugin comunitario «Local REST API».",
        "Activa «Enable Non-encrypted (HTTP) Server» (puerto 27123).",
        "Pega su «API Key» arriba con tu vault abierto.",
      ]}>
        <Field label="Puerto personalizado (opcional)" hint={urlOk ? "Solo si cambiaste el puerto 27123 en el plugin." : "Debe ser 127.0.0.1 o localhost."}>
          <input aria-label="Dirección del plugin Local REST API" placeholder={DEFAULT_OBSIDIAN_REST_URL} className={`${fieldCls} !h-8 !rounded-lg font-mono`} aria-invalid={!urlOk || undefined}
            value={config.restUrl ?? ""} onChange={event => update({ restUrl: event.target.value }, "typing")} onBlur={() => void persist()} />
        </Field>
      </HowTo>
    </SettingsGroup>

    <SettingsGroup title="Carpetas">
      <PathPreview
        root={vaultLabel}
        attrs={{ "data-obsidian-tree": "" }}
        rows={[
          { path: layoutPreview(config), hint: "notas de clase", attrs: { "data-obsidian-layout": "" } },
          { path: `${courses}/‹curso›.md`, hint: "índice del curso" },
          { path: `${courses}/moc-‹programa›.md`, hint: "mapa de programa" },
        ]}
      />
      <Disclosure summary="Cambiar carpetas">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Notas de clases">
            <input
              aria-label="Carpeta de lecciones"
              placeholder={DEFAULT_OBSIDIAN_EXPORT_CONFIG.sourcesFolder}
              className={`${fieldCls} !h-8 font-mono`}
              value={config.sourcesFolder}
              onChange={event => update({ sourcesFolder: event.target.value }, "blur")}
              onBlur={() => void persist()}
            />
          </Field>
          <Field label="Índices de cursos">
            <input
              aria-label="Carpeta de cursos"
              placeholder={DEFAULT_OBSIDIAN_EXPORT_CONFIG.mocsFolder}
              className={`${fieldCls} !h-8 font-mono`}
              value={config.mocsFolder}
              onChange={event => update({ mocsFolder: event.target.value }, "blur")}
              onBlur={() => void persist()}
            />
          </Field>
        </div>
        <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">Solo aplica a cursos nuevos; los actuales conservan su carpeta.</p>
      </Disclosure>
    </SettingsGroup>

    <SettingsGroup title="Nota">
      <RowList>
        <div className={toggleRow}><ToggleRow label="Incluir tarjetas" description="Preguntas y respuestas plegadas al final" checked={config.includeCards} onChange={value => update({ includeCards: value })} /></div>
        {config.includeCards && (
          <div className={toggleRow}><ToggleRow label="Formato #flashcards" description="Para repasar con el plugin Spaced Repetition" checked={config.srFlashcards === true} onChange={value => update({ srFlashcards: value })} /></div>
        )}
        <div className={toggleRow}><ToggleRow label="Subtítulos originales (.srt)" description="Copia intacta de la transcripción en raw/" checked={config.includeRawSrt} onChange={value => update({ includeRawSrt: value })} /></div>
      </RowList>
    </SettingsGroup>

    <SettingsGroup title="Opciones adicionales">
      <RowList>
        <SettingRow
          label="Estructura wiki inicial"
          attrs={{ "data-obsidian-prepare": "" }}
          hint={
            preparing
              ? "Creando archivos…"
              : saved.vaultPreparedAt
                ? `Preparado el ${formatDate(saved.vaultPreparedAt)} · sin tocar tus notas`
                : "Crea index.md, plantillas/ y CLAUDE.md si faltan"
          }
        >
          {conn.ready ? (
            <button
              type="button"
              disabled={preparing}
              onClick={() => { update({ prepareVault: true }); void prepare(true); }}
              className={rowBtnCls}
              data-obsidian-scaffold-write
            >
              {preparing ? <Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> : saved.vaultPreparedAt ? <Icon name="refreshCw" size={12} /> : <Check size={12} />}
              {saved.vaultPreparedAt ? "Revisar" : "Crear"}
            </button>
          ) : (
            <button type="button" onClick={() => { void downloadScaffold(); }} className={rowBtnCls}>
              <Icon name="folderPlus" size={12} />.zip
            </button>
          )}
        </SettingRow>
      </RowList>

      <Disclosure summary="Modo manual sin plugin (obsidian://)" attrs={{ "data-obsidian-fallback": "" }}>
        <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">
          Abre cada nota desde la Biblioteca usando el nombre de tu vault.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={`${secondaryBtnCls} !h-9`} disabled={!hasVault} onClick={() => { openObsidianUri(buildObsidianOpenVaultUri(config.vaultName.trim())); toast.info("Obsidian debería abrir ese vault ahora", { description: "Si avisa que no existe, revisa el Nombre del vault arriba." }); }}>
            <Icon name="externalLink" size={14} />Probar apertura
          </button>
          <button type="button" className={`${secondaryBtnCls} !h-9`} onClick={() => { void downloadScaffold(); }}>
            <Icon name="folderPlus" size={14} />Estructura (.zip)
          </button>
        </div>
      </Disclosure>
    </SettingsGroup>
  </div>;
}
