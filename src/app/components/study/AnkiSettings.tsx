import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, RefreshCw } from "../icons";
import {
  Code, HowTo, Notice, Picker, RowList, SettingRow, SettingsGroup, StatusPill,
  fieldCls, primaryBtnCls, rowBtnCls, secondaryBtnCls, type ConnectionTone,
} from "../settings/SettingsKit";
import { useAnkiConnection } from "../../hooks/useAnkiConnection";
import { ankiCompatibleVocabDecks, ankiKnownWords, applyDeckMigration, planDeckMigration, type CleanupPlan } from "../../services/ankiBridge";
import type { VocabDeckInspection } from "../../services/ankiConnectOps";
import { kinemaVocabDeck, ownVocabDeck, rootOf, vocabDestination, withVocabDeck } from "../../services/ankiDestination";
import type { VocabConfig } from "../../services/vocabularyService";
import { languageName } from "./vocabLanguages";

/** Las rutas de Anki que salen de esta configuración (las mismas que en el paquete que se envía). */
export function ankiPaths(config: VocabConfig): { path: string; hint: string }[] {
  const root = rootOf(config);
  const lang = config.targetLangLabel || "English";
  return [
    { path: `${root}::Courses::‹curso›`, hint: "un mazo por curso" },
    { path: vocabDestination(config, lang).deck, hint: "palabras" },
  ];
}

/** Estado de AnkiConnect, con las mismas palabras en Anki, Idiomas y Obsidian. */
function useAnkiState() {
  const anki = useAnkiConnection(true);
  const { status, checking, decks } = anki;
  const tone: ConnectionTone = checking && !status ? "busy"
    : !status ? "idle"
      : !status.available || status.permission === "denied" ? "warn" : "ok";
  const pill = tone === "ok" ? "Conectado" : tone === "busy" ? "Comprobando" : tone === "idle" ? "Sin conectar"
    : status?.permission === "denied" ? "Sin permiso" : "No responde";
  const text = tone === "busy" ? "Comprobando…"
    : !status ? "Sin conectar · espera en Biblioteca"
      : !status.available ? "Anki no responde · pendiente de envío"
        : status.permission === "denied" ? "Permiso pendiente en AnkiConnect"
          : `Conectado${decks ? ` · ${decks.length} mazos` : ""} · envío automático`;
  return { ...anki, tone, pill, text };
}

export function AnkiSettings({ config, onConfig }: { config: VocabConfig; onConfig: (patch: Partial<VocabConfig>) => void }) {
  const anki = useAnkiState();
  const { status, decks, checking, ready, connect } = anki;
  const [plan, setPlan] = useState<CleanupPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [vocabInspection, setVocabInspection] = useState<VocabDeckInspection | null>(null);
  const root = rootOf(config);
  const lang = config.targetLangLabel || "English";
  const langName = languageName(config);
  const defaultVocabDeck = kinemaVocabDeck(config, lang);
  const own = ownVocabDeck(config, lang);

  // Inspección real por diseño de tarjeta (Note Type y campos), no solo por nombre.
  useEffect(() => {
    if (!ready) { setVocabInspection(null); return; }
    let alive = true;
    void ankiCompatibleVocabDecks(config.targetLang, lang, root).then((res) => {
      if (!alive) return;
      setVocabInspection(res);
      // Si el usuario renombró su mazo de Kinema en Anki y no fijó otro manualmente,
      // Kinema detecta el mazo renombrado por su tipo de nota para no crear uno duplicado.
      const explicitChoice = config.vocabDecks && Object.prototype.hasOwnProperty.call(config.vocabDecks, lang);
      if (
        res?.detectedKinemaDeck &&
        res.detectedKinemaDeck !== defaultVocabDeck &&
        !res.defaultDeckExists &&
        !own &&
        !explicitChoice
      ) {
        onConfig({ vocabDecks: withVocabDeck(config, lang, res.detectedKinemaDeck) });
      }
    });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, config.targetLang, lang, root]);

  const deckMoves = plan?.moves.filter((m) => m.cards > 0 || !m.removed) ?? [];
  const cardsToMove = plan?.moves.reduce((n, m) => n + m.cards, 0) ?? 0;
  const tagRenames = plan?.tags.filter((t) => t.notes > 0) ?? [];
  const notesToRetag = tagRenames.reduce((n, t) => n + t.notes, 0);
  const nothingToDo = plan !== null && deckMoves.length === 0 && tagRenames.length === 0;

  const review = async () => {
    setBusy(true);
    try { setPlan(await planDeckMigration(config)); }
    catch (error) { toast.error("Anki no respondió", { description: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const done = await applyDeckMigration(config);
      const moved = done.moves.reduce((n, m) => n + m.cards, 0);
      const removed = done.moves.filter((m) => m.removed).length;
      const retagged = done.tags.reduce((n, t) => n + (t.renamed ? t.notes : 0), 0);
      setPlan(null);
      toast.success(moved || retagged ? "Anki, ordenado" : "No había nada que ordenar", {
        description: [
          moved ? `${moved} tarjetas en su mazo de curso o de idioma, con sus repasos (${removed} mazos vacíos eliminados).` : "",
          retagged ? `${retagged} notas con las etiquetas de ahora. Si Anki aún lista las antiguas (ya vacías), desaparecen con Herramientas → Comprobar base de datos.` : "",
        ].filter(Boolean).join(" ") || undefined,
      });
    } catch (error) {
      toast.error("No se pudo terminar", { description: `${error instanceof Error ? error.message : String(error)}. Lo ya ordenado se queda así; puedes repetirlo.` });
    } finally { setBusy(false); }
  };

  // Solo se ofrecen mazos compatibles por diseño de tarjeta (o el mazo oficial de Kinema).
  const KINEMA = "__kinema__";
  const compatibleFromAnki = vocabInspection?.compatibleDecks ?? [];
  const compatibleMap = new Map(compatibleFromAnki.map((item) => [item.deck, item]));
  const selectableCompatibleDecks = [
    ...compatibleFromAnki.map((item) => item.deck),
    ...(own && !compatibleMap.has(own) ? [own] : []),
  ];
  const showVocabDeckPicker = selectableCompatibleDecks.length > 0;
  const deckOptions = [
    {
      id: KINEMA,
      label: "El de Kinema",
      hint: defaultVocabDeck,
    },
    ...selectableCompatibleDecks.map((d) => {
      const info = compatibleMap.get(d);
      const hint = decks && !decks.includes(d)
        ? "No está en tu Anki"
        : info?.reason === "kinema"
          ? "Detectado por diseño"
          : "Diseño compatible";
      return { id: d, label: d, hint };
    }),
  ];

  const activeVocabDeck = vocabDestination(config, lang).deck;

  return (
    <div className="space-y-4">
      <SettingsGroup title="Conexión" aside={<StatusPill tone={anki.tone}>{anki.pill}</StatusPill>}>
        <RowList>
          <SettingRow label={<>AnkiConnect{ready && status?.version ? <span className="font-medium text-[var(--usb-fg-mid)]"> · v{status.version}</span> : null}</>}
            hint={<span data-anki-connection-status>{anki.text}</span>} hintTone={anki.tone === "warn" ? "warn" : "mid"} attrs={{ "data-anki-connection": "" }}>
            <button type="button" onClick={() => void connect()} disabled={checking} className={rowBtnCls}>
              {checking ? <Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> : ready ? <RefreshCw size={12} /> : <Check size={12} />}{ready ? "Comprobar" : "Conectar"}
            </button>
          </SettingRow>
        </RowList>
        <HowTo summary="Cómo conectar Anki" attrs={{ "data-anki-howto": "" }} steps={[
          "Complementos → Obtener complementos → código 2055492159 (AnkiConnect) y reinicia.",
          "Pulsa «Conectar» y acepta el permiso en Anki.",
          "Recomendado: activa FSRS en Opciones del mazo (Anki 23.10+).",
        ]} />
      </SettingsGroup>

      <SettingsGroup title="Mazos">
        <RowList>
          <SettingRow label="Mazo principal" hint="Raíz de los mazos nuevos">
            <input
              aria-label="Mazo raíz de Anki"
              placeholder="Kinema"
              className={`${fieldCls} !h-8 !w-32 !rounded-lg font-mono`}
              value={config.rootDeck}
              onChange={(e) => onConfig({ rootDeck: e.target.value })}
              onBlur={() => { if (!config.rootDeck.trim()) onConfig({ rootDeck: "Kinema" }); }}
            />
          </SettingRow>
          <SettingRow
            label="Cursos"
            attrs={{ "data-anki-courses": "" }}
            hint={<Code>{root}::Courses::‹curso›</Code>}
          >
            <span className="text-[11px] font-medium text-[var(--usb-fg-mid)]">1 por curso</span>
          </SettingRow>
          <SettingRow
            label={`Vocabulario · ${langName}`}
            attrs={{ "data-anki-vocab": "" }}
            hint={
              own
                ? <><Code attrs={{ "data-vocab-deck-path": "" }}>{activeVocabDeck}</Code> · conserva sus opciones</>
                : <Code attrs={{ "data-vocab-deck-path": "" }}>{activeVocabDeck}</Code>
            }
          >
            {showVocabDeckPicker ? (
              <Picker
                label="Mazo de las palabras"
                value={own || KINEMA}
                options={deckOptions}
                onChange={(id) => onConfig({ vocabDecks: withVocabDeck(config, lang, id === KINEMA ? "" : id) })}
              />
            ) : (
              <span className="text-[11px] font-medium text-[var(--usb-fg-mid)]">Automático</span>
            )}
          </SettingRow>
        </RowList>

        <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]" data-anki-paths>
          Plantilla y ritmo propios (20 conceptos y 15 palabras nuevas al día), sin tocar tus otros tipos de nota ni duplicar tarjetas.
        </p>
      </SettingsGroup>

      {ready && (
        <SettingsGroup title="Mantenimiento">
          <div className="space-y-2" data-anki-migration>
            {!plan ? (
              <>
                <button type="button" onClick={() => void review()} disabled={busy} className={`${secondaryBtnCls} !h-9 w-full`}>
                  {busy ? <Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> : <RefreshCw size={12} />}Revisar mazos y etiquetas antiguos
                </button>
              </>
            ) : nothingToDo ? (
              <Notice tone="ok" icon="check">No hay nada antiguo que ordenar.</Notice>
            ) : (
              <>
                <Notice tone="info" icon="info">
                  {[
                    deckMoves.length ? `${deckMoves.length} ${deckMoves.length === 1 ? "mazo antiguo" : "mazos antiguos"} · ${cardsToMove} tarjetas pasarán a su mazo de curso o de idioma, con sus repasos.` : "",
                    tagRenames.length ? `${notesToRetag} notas con ${tagRenames.length === 1 ? "1 etiqueta antigua" : `${tagRenames.length} etiquetas antiguas`} pasarán a kinema::programa / kinema::plataforma.` : "",
                  ].filter(Boolean).join(" ")}
                </Notice>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPlan(null)} disabled={busy} className={`${secondaryBtnCls} !h-9`}>Cancelar</button>
                  <button type="button" onClick={() => void apply()} disabled={busy} className={`${primaryBtnCls} !h-9`}>
                    {busy ? <Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> : <Check size={12} />}Ordenar ahora
                  </button>
                </div>
              </>
            )}
          </div>
        </SettingsGroup>
      )}
    </div>
  );
}

/** Estado de sincronización con el mazo automático de vocabulario del idioma activo. */
export function KnownDecksField({ config }: { config: VocabConfig; onConfig?: (patch: Partial<VocabConfig>) => void }) {
  const anki = useAnkiState();
  const { ready } = anki;
  const lang = config.targetLangLabel || "English";
  const langName = languageName(config).toLowerCase();
  const vocabDeck = vocabDestination(config, lang).deck;
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!ready) { setCount(null); return; }
    let alive = true;
    const timer = setTimeout(() => {
      void ankiKnownWords([vocabDeck], config.targetLang).then((words) => { if (alive) setCount(words ? words.length : null); });
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, vocabDeck, config.targetLang]);

  return (
    <div data-vocab-known>
      <p className={`text-[11px] leading-snug ${count && count > 0 ? "text-[var(--usb-ok-text)]" : "text-[var(--usb-fg-mid)]"}`} role="status" data-vocab-known-count={count !== null ? "" : undefined}>
        {!count
          ? `Omite automáticamente las palabras que ya estén en tu mazo de ${langName}.`
          : `${count === 1 ? "1 palabra" : `${count.toLocaleString("es")} palabras`} de tu mazo de ${langName} omitidas automáticamente.`}
      </p>
    </div>
  );
}
