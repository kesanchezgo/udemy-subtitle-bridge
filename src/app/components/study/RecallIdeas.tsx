/**
 * Recordar (flowVersion 3): cada idea es una pista (su título) y dos botones
 * del mismo peso, «Lo sabía» / «No del todo». El detalle aparece al responder:
 * así cada respuesta es un intento de recuerdo con corrección inmediata.
 *
 * Lo que se responde aquí NO es decorativo: «Lo sabía» = checkedConceptIndexes
 * (plan de Comprobar, confirmación, refuerzo en Anki, historial y nota de
 * Obsidian); «No del todo» y lo no respondido son las ideas que se practican.
 * «Duda» aparece al responder la idea (§5: la duda surge al intentar).
 */
import React from "react";
import { Check, HelpCircle, Minus } from "../icons";
import { formatRecallPrompt, splitIdea } from "../../services/recallCue";
import { renderStudyInline, stripInlineMarkdown } from "./inlineFormat";
import type { RecallMark } from "../../services/historyService";

export function RecallIdeas({
	ideas, marks, locked, onMark, doubt,
}: {
	ideas: string[];
	marks: Record<number, RecallMark | undefined>;
	locked: boolean;
	onMark: (index: number, mark: RecallMark) => void;
	doubt?: { isOpen: (i: number) => boolean; toggle: (i: number) => void; render: (i: number) => React.ReactNode };
}) {
	return (
		<ul className="space-y-2" data-doubt-recall data-recall-ideas>
			{ideas.map((idea, i) => {
				const { title, detail } = splitIdea(idea);
				const prompt = formatRecallPrompt(title);
				const mark = marks[i];
				const answered = mark !== undefined;
				const open = doubt?.isOpen(i) ?? false;
				return (
					<li key={i} className="space-y-2" data-recall-idea={mark ?? "pending"}>
						<div className={`rounded-xl border px-3 py-2.5 transition-colors ${
							mark === "knew" ? "border-emerald-500/30 bg-emerald-500/[0.05]"
								: mark === "unsure" ? "border-amber-500/30 bg-amber-500/[0.05]"
									: "border-[var(--usb-border)] bg-[var(--usb-bg-3)]"
						}`}>
							<div className="flex items-start gap-2.5">
								<span className={`mt-0.5 w-5 h-5 rounded-md border text-[10px] font-mono font-bold flex items-center justify-center shrink-0 tabular-nums select-none ${
									mark === "knew"
										? "border-emerald-500/40 bg-emerald-500/12 text-[var(--usb-ok-text)]"
										: mark === "unsure"
											? "border-amber-500/40 bg-amber-500/12 text-[var(--usb-warn-text)]"
											: "border-[var(--usb-border)] bg-[var(--usb-bg-2)] text-[var(--usb-fg-mid)]"
								}`}>
									{i + 1}
								</span>
								<p className="flex-1 min-w-0 text-[12px] font-semibold leading-snug text-[var(--usb-fg-hi)] pt-0.5">{renderStudyInline(prompt)}</p>
								{/* La duda aparece al intentar, no al mirar: tras responder esa idea. */}
								{doubt && (answered || locked) && (
									<button type="button" onClick={() => doubt.toggle(i)} aria-expanded={open}
										aria-label="Tengo una duda sobre esta idea" title="Tengo una duda sobre esta idea" data-doubt-trigger
										className={`-mr-1 h-7 px-2 rounded-lg inline-flex items-center gap-1 shrink-0 border text-[10.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${
											open ? "text-violet-300 border-violet-500/40 bg-violet-500/10" : "text-[var(--usb-fg-mid)] border-[var(--usb-border)] hover:text-violet-300 hover:border-violet-500/30"
										}`}>
										<HelpCircle size={12} aria-hidden="true" />Duda
									</button>
								)}
							</div>
							{detail && (answered || locked) && (
								<p className="mt-1.5 pl-7 text-[11px] leading-relaxed text-[var(--usb-fg-mid)] animate-[usb-rise_240ms_ease-out_both]" data-recall-detail>{renderStudyInline(detail)}</p>
							)}
							{locked ? (
								<p className={`mt-2 pl-7 inline-flex items-center gap-1 text-[10.5px] font-semibold ${mark === "knew" ? "text-[var(--usb-ok-text)]" : mark === "unsure" ? "text-[var(--usb-warn-text)]" : "text-[var(--usb-fg-lo)]"}`}>
									{mark === "knew" ? <><Check size={11} aria-hidden="true" />Lo recordabas</> : mark === "unsure" ? <><Minus size={11} aria-hidden="true" />Para repasar</> : "Sin marcar"}
								</p>
							) : (
								<div className="mt-2.5 grid grid-cols-2 gap-1.5" role="group" aria-label={`¿Recordabas «${stripInlineMarkdown(prompt)}»?`}>
									<button type="button" onClick={() => onMark(i, "knew")} aria-pressed={mark === "knew"} data-recall-mark="knew"
										className={`h-8 rounded-lg border text-[11px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${
											mark === "knew" ? "border-emerald-500/55 bg-emerald-500/15 text-[var(--usb-ok-text)]" : "border-[var(--usb-border-mid)] bg-[var(--usb-bg-2)] text-[var(--usb-fg)] hover:border-emerald-500/40"
										}`}>
										<Check size={12} aria-hidden="true" />Lo recuerdo
									</button>
									<button type="button" onClick={() => onMark(i, "unsure")} aria-pressed={mark === "unsure"} data-recall-mark="unsure"
										className={`h-8 rounded-lg border text-[11px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${
											mark === "unsure" ? "border-amber-500/55 bg-amber-500/15 text-[var(--usb-warn-text)]" : "border-[var(--usb-border-mid)] bg-[var(--usb-bg-2)] text-[var(--usb-fg)] hover:border-amber-500/40"
										}`}>
										<Minus size={12} aria-hidden="true" />Repasarlo
									</button>
								</div>
							)}
						</div>
						{doubt?.render(i)}
					</li>
				);
			})}
		</ul>
	);
}
