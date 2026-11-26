import React from "react";

const CODE_CHIP_CLS =
	"px-1.5 py-[1px] mx-[0.5px] rounded-[5px] border border-[color:var(--usb-accent-ring)] bg-[var(--usb-accent-soft)] text-[var(--usb-accent-text)] text-[0.91em] font-mono font-semibold tracking-tight";

// Archivos ocultos (.venv, .python-version, .gitignore), archivos con extensión técnica (pyproject.toml, main.py, App.class) y flags CLI (--python, -m).
const AUTO_TECH_TOKEN_RE =
	/(^|[\s(«"“¿¡])((?:\.[a-zA-Z][a-zA-Z0-9._-]{1,30})|(?:[a-zA-Z0-9_-]+\.(?:py|toml|json|ya?ml|lock|md|txt|js|jsx|ts|tsx|java|class|jar|go|rs|rb|php|cs|cpp|c|h|sql|sh|env|cfg|ini)\b)|(?:--[a-zA-Z0-9][a-zA-Z0-9-]*))(?=[\s).,;:»"”?!]|$)/g;

function renderPlainWithAutoTokens(segment: string, keyPrefix: string): React.ReactNode[] {
	const out: React.ReactNode[] = [];
	let last = 0;
	let idx = 0;
	for (const match of segment.matchAll(AUTO_TECH_TOKEN_RE)) {
		const at = match.index ?? 0;
		const lead = match[1] ?? "";
		const token = match[2] ?? "";
		const tokenStart = at + lead.length;
		if (tokenStart > last) out.push(segment.slice(last, tokenStart));
		out.push(<code key={`${keyPrefix}-a-${idx++}`} className={CODE_CHIP_CLS}>{token}</code>);
		last = tokenStart + token.length;
	}
	if (last < segment.length) out.push(segment.slice(last));
	return out.length ? out : [segment];
}

/** `**negrita**`, `` `código` ``, `<code>…</code>` y tokens técnicos obvios, con foco visual AA en oscuro y sepia. */
export function renderStudyInline(text: string): React.ReactNode[] {
	const normalized = String(text ?? "").replace(/<\/?code>/gi, "`");
	const out: React.ReactNode[] = [];
	normalized.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).forEach((part, i) => {
		if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
			out.push(<strong key={`b-${i}`} className="font-semibold text-[var(--usb-fg-hi)]">{part.slice(2, -2)}</strong>);
			return;
		}
		if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
			out.push(<code key={`c-${i}`} className={CODE_CHIP_CLS}>{part.slice(1, -1)}</code>);
			return;
		}
		renderPlainWithAutoTokens(part, `p-${i}`).forEach((node, j) => {
			out.push(typeof node === "string" ? <React.Fragment key={`t-${i}-${j}`}>{node}</React.Fragment> : node);
		});
	});
	return out;
}

/** Versión en texto plano para `aria-label` y atributos (sin backticks ni etiquetas `<code>`). */
export function stripInlineMarkdown(text: string): string {
	return String(text ?? "")
		.replace(/<\/?code>/gi, "")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/`([^`]+)`/g, "$1");
}
