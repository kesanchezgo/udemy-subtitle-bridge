import React from "react";

/** `**negrita**` y `` `código` `` en línea, con contraste AA en oscuro y sepia. */
export function renderStudyInline(text: string): React.ReactNode[] {
	return String(text ?? "").split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
		if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
			return <strong key={i} className="font-semibold text-[var(--usb-fg-hi)]">{part.slice(2, -2)}</strong>;
		}
		if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
			return <code key={i} className="px-1 py-0.5 rounded border border-[var(--usb-border)] bg-[var(--usb-bg-2)] text-[var(--usb-accent-text)] text-[0.92em] font-mono">{part.slice(1, -1)}</code>;
		}
		return <React.Fragment key={i}>{part}</React.Fragment>;
	});
}

/** Versión en texto plano para `aria-label` y atributos (sin backticks crudos). */
export function stripInlineMarkdown(text: string): string {
	return String(text ?? "")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/`([^`]+)`/g, "$1");
}
