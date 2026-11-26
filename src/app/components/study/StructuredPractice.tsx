/**
 * Aplicar · práctica estructurada (flowVersion 3).
 *
 * Tablero controlado: el estado vive en StudyAgentTab (sobrevive al cambiar de
 * paso y se restaura del historial). Aquí solo se pinta el ejercicio, se
 * corrige contra la clave (practiceFormats) y se avisa al padre; el «¿Cómo
 * sigues?», la solución y la duda los pinta el padre con los mismos
 * componentes que Comprobar, para que Aplicar no parezca otra aplicación.
 */
import React, { useMemo } from "react";
import { renderStudyInline } from "./inlineFormat";
import { Check, Plus, Send, Sparkles, X } from "../icons";
import { useDockTheme } from "../../contexts/ThemeContext";
import {
	blankHint, errorWindow, gradePractice, optionToDiscard, practiceFormatMeta,
	stableShuffle, summarizePracticeAnswer,
	type PracticeAnswer, type StructuredPractice as Practice,
} from "../../services/practiceFormats";

export interface PracticeRun {
	answer: PracticeAnswer;
	/** Comprobaciones hechas. */
	attempts: number;
	/** 0 o 1: la pista se cuenta una vez. */
	hintsUsed: number;
	hintOpen: boolean;
	/** Última comprobación; `key` = la respuesta comprobada (si cambia, el resultado queda viejo). */
	last: { correct: boolean; parts: boolean[]; key: string } | null;
	solutionSeen: boolean;
}

export function emptyAnswer(practice: Practice): PracticeAnswer {
	switch (practice.format) {
		case "completar": return { format: "completar", values: practice.blanks.map(() => "") };
		case "ordenar": return { format: "ordenar", order: [] };
		case "predecir": return { format: "predecir", choice: -1 };
		case "decidir": return { format: "decidir", choice: -1 };
		case "error": return { format: "error", line: -1 };
	}
}

export function initialRun(practice: Practice): PracticeRun {
	return { answer: emptyAnswer(practice), attempts: 0, hintsUsed: 0, hintOpen: false, last: null, solutionSeen: false };
}

/** ¿La respuesta guardada encaja con este ejercicio? (al restaurar). */
export function answerFits(practice: Practice, answer: unknown): answer is PracticeAnswer {
	if (!answer || typeof answer !== "object") return false;
	const a = answer as Record<string, unknown>;
	if (a.format !== practice.format) return false;
	if (practice.format === "completar") return Array.isArray(a.values) && a.values.length === practice.blanks.length;
	if (practice.format === "ordenar") return Array.isArray(a.order) && a.order.every((i) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < practice.steps.length);
	if (practice.format === "error") return Number.isInteger(a.line);
	return Number.isInteger(a.choice);
}

export const answerKey = (a: PracticeAnswer) => JSON.stringify(a);

export function isAnswerComplete(practice: Practice, a: PracticeAnswer): boolean {
	if (a.format === "completar") return a.values.every((v) => v.trim().length > 0);
	if (a.format === "ordenar") return practice.format === "ordenar" && a.order.length === practice.steps.length;
	if (a.format === "error") return a.line >= 0;
	return a.choice >= 0;
}

const LETTERS = ["A", "B", "C", "D"];

export function StructuredPractice({
	practice, isCode, run, onChange, onCheck,
}: {
	practice: Practice;
	isCode: boolean;
	run: PracticeRun;
	onChange: (next: PracticeRun) => void;
	/** Se llama al comprobar, con el estado nuevo y el resultado. */
	onCheck: (next: PracticeRun, result: { correct: boolean; summary: string }) => void;
}) {
	const meta = practiceFormatMeta(practice.format, isCode);
	const closed = run.solutionSeen || Boolean(run.last?.correct);
	const stale = run.last !== null && run.last.key !== answerKey(run.answer);
	const showMarks = run.last !== null && !stale;
	const reveal = run.solutionSeen && !run.last?.correct;
	const complete = isAnswerComplete(practice, run.answer);
	const setAnswer = (answer: PracticeAnswer) => { if (!closed) onChange({ ...run, answer }); };

	const check = () => {
		if (closed || !complete) return;
		const graded = gradePractice(practice, run.answer, isCode);
		const next: PracticeRun = {
			...run,
			attempts: run.attempts + 1,
			last: { correct: graded.correct, parts: graded.parts, key: answerKey(run.answer) },
		};
		onCheck(next, { correct: graded.correct, summary: summarizePracticeAnswer(practice, run.answer) });
	};

	const toggleHint = () => onChange({ ...run, hintOpen: !run.hintOpen, hintsUsed: run.hintOpen ? run.hintsUsed : Math.max(run.hintsUsed, 1) });
	const hintActive = run.hintsUsed > 0 && !closed;

	const resultLine = (() => {
		if (!showMarks || !run.last) return null;
		if (run.last.correct) {
			const how = run.attempts <= 1 && run.hintsUsed === 0 ? "A la primera." : run.attempts <= 1 ? "Con pista." : `En ${run.attempts} intentos.`;
			return { ok: true, text: `Correcto. ${how}` };
		}
		const ok = run.last.parts.filter(Boolean).length;
		const n = run.last.parts.length;
		switch (practice.format) {
			case "completar": return { ok: false, text: n === 1 ? "Ese hueco no es correcto." : `${ok} de ${n} huecos bien.` };
			case "ordenar": return { ok: false, text: `${ok} de ${n} en su sitio.` };
			case "error": return { ok: false, text: "Esa línea está bien: el error está en otra." };
			default: return { ok: false, text: "No es esa opción." };
		}
	})();

	return (
		<div className="space-y-3" data-structured-practice={practice.format}>
			<div className="flex items-center gap-2 flex-wrap">
				<span className="inline-flex items-center h-6 px-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[10.5px] font-bold text-[var(--usb-ok-text)]">
					{meta.label}<span className="font-medium opacity-80">&nbsp;· {meta.sub}</span>
				</span>
				<span className="text-[10.5px] text-[var(--usb-fg-mid)] leading-snug">{meta.instruction}</span>
			</div>

			{practice.format === "completar" && (
				<FillBoard practice={practice} isCode={isCode} run={run} closed={closed} reveal={reveal} showMarks={showMarks} onValues={(values) => setAnswer({ format: "completar", values })} />
			)}
			{practice.format === "ordenar" && (
				<OrderBoard practice={practice} isCode={isCode} run={run} closed={closed} reveal={reveal} showMarks={showMarks} onOrder={(order) => setAnswer({ format: "ordenar", order })} />
			)}
			{(practice.format === "predecir" || practice.format === "decidir") && (
				<ChoiceBoard practice={practice} isCode={isCode} run={run} closed={closed} reveal={reveal} showMarks={showMarks} hintActive={hintActive}
					onChoice={(choice) => setAnswer({ format: practice.format as "predecir" | "decidir", choice })} />
			)}
			{practice.format === "error" && (
				<ErrorBoard practice={practice} isCode={isCode} run={run} closed={closed} reveal={reveal} showMarks={showMarks} hintActive={hintActive}
					onLine={(line) => setAnswer({ format: "error", line })} />
			)}

			{!closed && (
				<div className="space-y-1.5">
					<button type="button" onClick={toggleHint} aria-expanded={run.hintOpen} data-practice-hint
						className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${
							run.hintOpen
								? "bg-amber-500/10 border-amber-500/30 text-[var(--usb-warn-text)]"
								: "bg-[var(--usb-bg-3)] border-[var(--usb-border)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg)] hover:border-[var(--usb-border-mid)]"
						}`}>
						<Sparkles size={12} className="shrink-0 text-amber-400" aria-hidden="true" />
						<span className="text-[11px] font-semibold flex-1">{run.hintOpen ? "Ocultar pista" : "Ver pista"}</span>
						<span className="text-[10px] font-medium opacity-80">{run.hintsUsed > 0 ? "usada" : "da menos XP"}</span>
					</button>
					{run.hintOpen && <HintBody practice={practice} run={run} onPick={(i, v) => {
						if (run.answer.format !== "completar") return;
						const values = [...run.answer.values];
						values[i] = v;
						setAnswer({ format: "completar", values });
					}} />}
				</div>
			)}

			{resultLine && (
				<div role="status" data-practice-result={resultLine.ok ? "ok" : "miss"}
					className={`rounded-xl border px-3 py-2.5 space-y-1 ${resultLine.ok ? "border-emerald-500/30 bg-emerald-500/[0.07]" : "border-rose-500/30 bg-rose-500/[0.06]"}`}>
					<p className={`flex items-center gap-1.5 text-[11.5px] font-bold ${resultLine.ok ? "text-[var(--usb-ok-text)]" : "text-rose-400"}`}>
						{resultLine.ok ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}{resultLine.text}
					</p>
					{resultLine.ok && practice.explanation && <p className="text-[11px] leading-relaxed text-[var(--usb-fg)]">{renderStudyInline(practice.explanation)}</p>}
				</div>
			)}

			{!closed && (
				<button type="button" onClick={check} disabled={!complete || (run.last !== null && !stale)}
					className="kx-on-solid kx-cta w-full h-10 rounded-xl text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
					<Send size={12} aria-hidden="true" />{run.attempts === 0 ? "Comprobar" : "Comprobar de nuevo"}
				</button>
			)}
		</div>
	);
}

type BoardProps = { practice: Practice; isCode: boolean; run: PracticeRun; closed: boolean; reveal: boolean; showMarks: boolean };

const markCls = (state: "ok" | "miss" | "none") =>
	state === "ok" ? "border-emerald-500/55 bg-emerald-500/10" : state === "miss" ? "border-rose-500/55 bg-rose-500/10" : "border-[var(--usb-border-mid)] bg-[var(--usb-bg-3)]";

/** Separa comentario final (# … o // …) del código para darle contraste real de editor. */
function renderCodeFragment(fragment: string, isSepia: boolean, keyPrefix: string) {
	const commentMatch = fragment.match(/^([\s\S]*?)(\s*(?:#|\/\/).*)$/);
	if (!commentMatch) {
		return <span key={keyPrefix} style={{ color: isSepia ? "#0f172a" : "#e2e8f0" }}>{fragment}</span>;
	}
	return (
		<React.Fragment key={keyPrefix}>
			{commentMatch[1] && <span style={{ color: isSepia ? "#0f172a" : "#e2e8f0" }}>{commentMatch[1]}</span>}
			<span className="italic" style={{ color: isSepia ? "#475569" : "#94a3b8" }}>{commentMatch[2]}</span>
		</React.Fragment>
	);
}

/** Cabecera y superficie tipo IDE/Terminal consistente en oscuro y claro. */
function CodeSurface({ language, children, attrs }: { language?: string; children: React.ReactNode; attrs?: Record<string, string> }) {
	const { isSepia } = useDockTheme();
	return (
		<div
			{...attrs}
			className="rounded-xl border border-[var(--usb-border)] overflow-hidden"
			style={{ backgroundColor: isSepia ? "#f6f8fa" : "#0d1117" }}
		>
			<div
				className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--usb-border)] select-none"
				style={{ backgroundColor: isSepia ? "#eef1f5" : "#161b22" }}
			>
				<span className="inline-flex items-center gap-1.5" aria-hidden="true">
					<span className="w-2 h-2 rounded-full bg-rose-400/75" />
					<span className="w-2 h-2 rounded-full bg-amber-400/75" />
					<span className="w-2 h-2 rounded-full bg-emerald-400/75" />
				</span>
				<span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--usb-fg-mid)]">
					{language || "code"}
				</span>
			</div>
			{children}
		</div>
	);
}

function FillBoard({ practice, isCode, run, closed, reveal, showMarks, onValues }: BoardProps & { onValues: (v: string[]) => void }) {
	const { isSepia } = useDockTheme();
	if (practice.format !== "completar" || run.answer.format !== "completar") return null;
	const values = run.answer.values;

	const renderToken = (part: string, key: string) => {
		const m = part.match(/^\[\[(\d+)\]\]$/);
		if (!m) {
			return isCode ? renderCodeFragment(part, isSepia, key) : <React.Fragment key={key}>{part}</React.Fragment>;
		}
		const i = Number(m[1]) - 1;
		const blank = practice.blanks[i];
		const shown = reveal ? blank.accept[0] : values[i] ?? "";
		const state = reveal ? "ok" : showMarks ? (run.last?.parts[i] ? "ok" : "miss") : "none";

		if (isCode) {
			const slotStateCls = state === "ok"
				? `border-emerald-500/65 bg-emerald-500/15 ${isSepia ? "text-emerald-900" : "text-emerald-200"}`
				: state === "miss"
					? `border-rose-500/65 bg-rose-500/15 ${isSepia ? "text-rose-900" : "text-rose-200"}`
					: `border-violet-500/50 bg-violet-500/12 ${isSepia ? "text-violet-900" : "text-violet-200"}`;
			return (
				<span key={key} className="inline-flex items-center align-middle mx-0.5">
					<input
						data-code-slot=""
						aria-invalid={state === "miss" || undefined}
						value={shown}
						readOnly={closed}
						aria-label={`Hueco ${i + 1}`}
						spellCheck={false}
						autoComplete="off"
						autoCapitalize="off"
						onChange={(e) => { const next = [...values]; next[i] = e.target.value; onValues(next); }}
						onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
						placeholder={`[${i + 1}]`}
						style={{ width: `${Math.max(6, shown.length + 2.5)}ch` }}
						className={`inline-block h-[22px] px-1.5 rounded-[6px] border font-mono text-[11px] font-semibold text-center leading-none outline-none transition-all focus:ring-2 focus:ring-[#6d4aff]/45 placeholder:opacity-65 ${slotStateCls}`}
					/>
				</span>
			);
		}

		return (
			<input key={key} value={shown} readOnly={closed} aria-label={`Hueco ${i + 1}`} spellCheck={false} autoComplete="off" autoCapitalize="off"
				onChange={(e) => { const next = [...values]; next[i] = e.target.value; onValues(next); }}
				onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
				placeholder={String(i + 1)}
				style={{ width: `${Math.max(5, shown.length + 2)}ch` }}
				className={`inline-block align-baseline mx-0.5 px-1.5 rounded-md border text-center outline-none transition-colors focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30 placeholder:text-[var(--usb-fg-lo)] text-[11.5px] h-[22px] text-[var(--usb-fg-hi)] ${markCls(state)}`} />
		);
	};

	if (isCode) {
		const lines = practice.body.split("\n");
		return (
			<CodeSurface language={practice.language} attrs={{ "data-fill-board": "" }}>
				<div className="overflow-x-auto overflow-y-hidden custom-scrollbar-thin py-2">
					<div className="min-w-max">
						{lines.map((line, lineIdx) => {
							const tokens = line.split(/(\[\[\d+\]\])/g);
							return (
								<div key={lineIdx} className="flex items-center px-2.5 min-h-[28px]">
									<span
										aria-hidden="true"
										className="w-6 pr-2.5 mr-2.5 text-right font-mono text-[10px] tabular-nums select-none border-r border-[var(--usb-border)] shrink-0"
										style={{ color: isSepia ? "#94a3b8" : "#64748b" }}
									>
										{lineIdx + 1}
									</span>
									<div className="font-mono text-[11px] leading-[1.85] whitespace-pre">
										{tokens.map((tok, tokIdx) => renderToken(tok, `${lineIdx}-${tokIdx}`))}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</CodeSurface>
		);
	}

	const parts = practice.body.split(/(\[\[\d+\]\])/g);
	return (
		<div className="bg-[var(--usb-bg-2)] border border-[var(--usb-border)] rounded-xl p-3 text-[11.5px] text-[var(--usb-fg-hi)] leading-[2.1] whitespace-pre-wrap" data-fill-board>
			{parts.map((part, k) => renderToken(part, String(k)))}
		</div>
	);
}

function OrderBoard({ practice, isCode, run, closed, reveal, showMarks, onOrder }: BoardProps & { onOrder: (o: number[]) => void }) {
	const shuffled = useMemo(() => (practice.format === "ordenar" ? stableShuffle(practice.steps) : []), [practice]);
	if (practice.format !== "ordenar" || run.answer.format !== "ordenar") return null;
	const order = reveal ? practice.steps.map((_, i) => i) : run.answer.order;
	const pool = shuffled.filter((i) => !order.includes(i));
	const textCls = isCode ? "font-mono text-[10.5px]" : "text-[11.5px]";
	return (
		<div className="space-y-2" data-order-board>
			<ol className="space-y-1.5" aria-label="Tu orden">
				{practice.steps.map((_, pos) => {
					const idx = order[pos];
					const filled = idx !== undefined;
					const state = reveal ? "ok" : showMarks && filled ? (run.last?.parts[pos] ? "ok" : "miss") : "none";
					return (
						<li key={pos}>
							{filled ? (
								<button type="button" disabled={closed} onClick={() => onOrder(order.filter((_, k) => k !== pos))}
									aria-label={`Paso ${pos + 1}: ${practice.steps[idx]}. Quitar`}
									className={`w-full flex items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${markCls(state)}`}>
									<span className="w-5 h-5 rounded-md bg-[var(--usb-bg-2)] border border-[var(--usb-border)] text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums text-[var(--usb-fg-mid)]">{pos + 1}</span>
									<span className={`flex-1 min-w-0 leading-relaxed text-[var(--usb-fg-hi)] ${textCls}`}>{isCode ? practice.steps[idx] : renderStudyInline(practice.steps[idx])}</span>
									{!closed && <X size={12} className="mt-1 shrink-0 text-[var(--usb-fg-lo)]" aria-hidden="true" />}
								</button>
							) : (
								<div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--usb-border)] px-2.5 py-2">
									<span className="w-5 h-5 rounded-md border border-dashed border-[var(--usb-border)] text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums text-[var(--usb-fg-lo)]">{pos + 1}</span>
									<span className="text-[10.5px] text-[var(--usb-fg-lo)]">{pos === order.length ? "Toca el que va aquí" : ""}</span>
								</div>
							)}
						</li>
					);
				})}
			</ol>
			{pool.length > 0 && !closed && (
				<div className="rounded-xl bg-[var(--usb-bg-2)] border border-[var(--usb-border)] p-2 space-y-1.5" aria-label="Pasos por colocar">
					{pool.map((i) => (
						<button key={i} type="button" onClick={() => onOrder([...order, i])}
							className="w-full flex items-start gap-2 rounded-lg border border-[var(--usb-border-mid)] bg-[var(--usb-bg-3)] px-2.5 py-1.5 text-left hover:border-[#6d4aff]/45 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
							<Plus size={12} className="mt-0.5 shrink-0 text-[var(--usb-fg-mid)]" aria-hidden="true" />
							<span className={`flex-1 min-w-0 leading-relaxed text-[var(--usb-fg)] ${textCls}`}>{isCode ? practice.steps[i] : renderStudyInline(practice.steps[i])}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function Body({ text, isCode, language }: { text: string; isCode: boolean; language?: string }) {
	const { isSepia } = useDockTheme();
	if (!text.trim()) return null;
	if (!isCode) {
		return <div className="bg-[var(--usb-bg-2)] border border-[var(--usb-border)] rounded-xl p-3 text-[11.5px] text-[var(--usb-fg-hi)] leading-relaxed whitespace-pre-wrap">{renderStudyInline(text)}</div>;
	}
	const lines = text.split("\n");
	return (
		<CodeSurface language={language}>
			<div className="overflow-x-auto overflow-y-hidden custom-scrollbar-thin py-2">
				<div className="min-w-max">
					{lines.map((line, idx) => (
						<div key={idx} className="flex items-center px-2.5 min-h-[24px]">
							<span
								aria-hidden="true"
								className="w-6 pr-2.5 mr-2.5 text-right font-mono text-[10px] tabular-nums select-none border-r border-[var(--usb-border)] shrink-0"
								style={{ color: isSepia ? "#94a3b8" : "#64748b" }}
							>
								{idx + 1}
							</span>
							<div className="font-mono text-[11px] leading-relaxed whitespace-pre">
								{renderCodeFragment(line, isSepia, String(idx))}
							</div>
						</div>
					))}
				</div>
			</div>
		</CodeSurface>
	);
}

function ChoiceBoard({ practice, isCode, run, closed, reveal, showMarks, hintActive, onChoice }: BoardProps & { hintActive: boolean; onChoice: (i: number) => void }) {
	if ((practice.format !== "predecir" && practice.format !== "decidir") || (run.answer.format !== "predecir" && run.answer.format !== "decidir")) return null;
	const choice = run.answer.choice;
	const discarded = hintActive ? optionToDiscard(practice) : null;
	const codeBody = isCode && practice.format === "predecir";
	return (
		<div className="space-y-2">
			<Body text={practice.body} isCode={codeBody} language={practice.language} />
			<div role="radiogroup" aria-label="Opciones" className="space-y-1.5" data-choice-board>
				{practice.options.map((opt, i) => {
					const selected = choice === i;
					const isAnswer = i === practice.answerIndex;
					const out = discarded === i;
					const state = (reveal || (closed && run.last?.correct)) && isAnswer ? "ok" : showMarks && selected ? (run.last?.correct ? "ok" : "miss") : "none";
					return (
						<button key={i} type="button" role="radio" aria-checked={selected} disabled={closed || out} onClick={() => onChoice(i)}
							className={`w-full flex items-start gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${
								state !== "none" ? markCls(state) : selected ? "border-violet-500/55 bg-violet-500/10" : "border-[var(--usb-border-mid)] bg-[var(--usb-bg-3)] hover:border-[#6d4aff]/45"
							} ${out ? "opacity-40" : ""}`}>
							<span className={`w-5 h-5 rounded-md border text-[10px] font-bold flex items-center justify-center shrink-0 ${selected ? "border-violet-400/60 text-violet-300" : "border-[var(--usb-border)] text-[var(--usb-fg-mid)]"}`}>{LETTERS[i]}</span>
							<span className={`flex-1 min-w-0 leading-relaxed text-[var(--usb-fg-hi)] ${codeBody ? "font-mono text-[10.5px]" : "text-[11.5px]"} ${out ? "line-through" : ""}`}>{codeBody ? opt : renderStudyInline(opt)}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

function ErrorBoard({ practice, isCode, run, closed, reveal, showMarks, hintActive, onLine }: BoardProps & { hintActive: boolean; onLine: (i: number) => void }) {
	const { isSepia } = useDockTheme();
	if (practice.format !== "error" || run.answer.format !== "error") return null;
	const chosen = run.answer.line;
	const win = hintActive ? errorWindow(practice) : null;
	const solved = reveal || Boolean(closed && run.last?.correct);
	const rows = practice.lines.map((line, i) => {
		const selected = chosen === i;
		const inWin = win ? i >= win[0] && i <= win[1] : false;
		const state = solved && i === practice.errorLine ? "ok" : showMarks && selected ? (run.last?.correct ? "ok" : "miss") : "none";
		return (
			<button key={i} type="button" role="radio" aria-checked={selected} disabled={closed} onClick={() => onLine(i)}
				className={`w-full flex items-start gap-2 px-2.5 py-1 text-left border-l-2 transition-colors disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6d4aff]/70 ${
					state === "ok" ? "border-emerald-400 bg-emerald-500/10" : state === "miss" ? "border-rose-400 bg-rose-500/10" : selected ? "border-violet-400 bg-violet-500/12" : inWin ? "border-amber-400/60 bg-amber-500/[0.06]" : isSepia ? "border-transparent hover:bg-black/[0.04]" : "border-transparent hover:bg-white/[0.04]"
				}`}>
				<span className="w-6 pr-2 text-right text-[10px] tabular-nums font-mono leading-relaxed select-none border-r border-[var(--usb-border)] shrink-0" style={{ color: isSepia ? "#94a3b8" : "#64748b" }}>{i + 1}</span>
				<span className={`flex-1 min-w-0 whitespace-pre-wrap leading-relaxed ${isCode ? "font-mono text-[11px]" : "text-[11.5px] text-[var(--usb-fg-hi)]"}`}>
					{isCode ? renderCodeFragment(line, isSepia, `err-${i}`) : line}
				</span>
			</button>
		);
	});
	return (
		<div className="space-y-2">
			{isCode ? (
				<CodeSurface language={practice.language}>
					<div role="radiogroup" aria-label="Líneas" data-error-board className="py-1">{rows}</div>
				</CodeSurface>
			) : (
				<div className="rounded-xl border border-[var(--usb-border)] overflow-hidden bg-[var(--usb-bg-2)]" role="radiogroup" aria-label="Líneas" data-error-board>{rows}</div>
			)}
			{solved && (
				<div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] px-3 py-2 space-y-0.5" data-error-fix>
					<p className="text-[10.5px] font-bold text-[var(--usb-ok-text)]">Línea {practice.errorLine + 1} corregida</p>
					<p className={`line-through ${isSepia ? "text-rose-700" : "text-rose-400/85"} whitespace-pre-wrap ${isCode ? "font-mono text-[10.5px]" : "text-[11px]"}`}>{practice.lines[practice.errorLine]}</p>
					<p className={`text-[var(--usb-ok-text)] whitespace-pre-wrap ${isCode ? "font-mono text-[10.5px]" : "text-[11px]"}`}>{practice.fixedLine}</p>
				</div>
			)}
		</div>
	);
}

function HintBody({ practice, run, onPick }: { practice: Practice; run: PracticeRun; onPick: (blank: number, value: string) => void }) {
	const box = "bg-amber-500/8 border border-amber-500/25 rounded-xl p-3 text-[11px] text-[var(--usb-fg)] leading-relaxed space-y-2";
	if (practice.format === "completar") {
		return (
			<div className={box} data-hint-body>
				{practice.blanks.map((b, i) => {
					const h = blankHint(b);
					return (
						<div key={i} className="space-y-1">
							<p><span className="font-bold">Hueco {i + 1}:</span> {h.text ? <>{renderStudyInline(`${h.text.replace(/\.+$/, "")}${/[?!…:;]$/.test(h.text.trim()) ? "" : "."}`)} </> : ""}{h.prefix ? <>Empieza por <code className="font-mono">{h.prefix}…</code></> : null}</p>
							{h.options && (
								<div className="flex flex-wrap gap-1.5">
									{h.options.map((o) => {
										const on = run.answer.format === "completar" && run.answer.values[i] === o;
										return (
											<button key={o} type="button" onClick={() => onPick(i, o)} aria-pressed={on}
												className={`h-7 px-2 rounded-lg border font-mono text-[10.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${on ? "border-violet-500/55 bg-violet-500/12 text-violet-200" : "border-[var(--usb-border-mid)] bg-[var(--usb-bg-3)] hover:border-[#6d4aff]/45"}`}>
												{o}
											</button>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		);
	}
	if (practice.format === "ordenar") {
		return <div className={box} data-hint-body><p>El primer paso es: <span className="font-semibold">«{renderStudyInline(practice.steps[0])}»</span></p></div>;
	}
	if (practice.format === "error") {
		const w = errorWindow(practice);
		return <div className={box} data-hint-body><p>{w ? `El error está entre las líneas ${w[0] + 1} y ${w[1] + 1} (marcadas).` : "Revisa línea por línea."}</p></div>;
	}
	const d = optionToDiscard(practice);
	return <div className={box} data-hint-body><p>{d !== null ? `Descartada: la opción ${LETTERS[d]} no es.` : "Piensa qué ocurre paso a paso."}</p></div>;
}
