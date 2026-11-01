/**
 * Contraste AA del tema claro (v1.5.1, §1 de la contrarrevisión).
 *
 * THEME_CSS (sepia-overrides.ts) define los tokens semánticos en el bloque
 * claro (`.usb-dock.dock-sepia { … }`) y reasigna los textos de estado con
 * `color: var(--usb-*-text)`. Este script resuelve cada token y exige
 * ≥ 4.5:1 sobre las tres superficies del tema claro (#ffffff, #f6f7f9,
 * #eef0f4) para TODA regla de texto de estado
 * `.usb-dock.dock-sepia [class*="text-{familia}-…"]`.
 *
 * Sale con código ≠ 0 si alguna combinación queda por debajo.
 *
 * Uso: node --import ./scripts/register-ts-resolve.mjs scripts/qa-contrast-sepia.mjs
 */
import { register } from 'node:module';
register('./ts-resolve-loader.mjs', import.meta.url);

const { THEME_CSS } = await import('../src/app/styles/sepia-overrides.ts');

// ── Utilidades WCAG ───────────────────────────────────────────────────────────
function parseColor(raw) {
	const v = String(raw).trim();
	let m = v.match(/^#([0-9a-fA-F]{6})$/);
	if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
	m = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
	if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
	return null;
}
function luminance([r, g, b]) {
	const lin = (c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(fg, bg) {
	const f = parseColor(fg);
	const b = parseColor(bg);
	if (!f || !b) return null;
	const l1 = luminance(f);
	const l2 = luminance(b);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ── 1. Tokens del bloque claro ────────────────────────────────────────────────
const lightBlock = THEME_CSS.match(/\.usb-dock\.dock-sepia\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
if (!lightBlock) throw new Error('Bloque claro .usb-dock.dock-sepia no encontrado en THEME_CSS');
const tokens = {};
for (const m of lightBlock.matchAll(/--usb-[a-z0-9-]+\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g)) {
	const decl = m[0];
	const name = decl.match(/(--usb-[a-z0-9-]+)/)[1];
	tokens[name] = decl.split(':')[1].trim().replace(/;$/, '');
}
for (const name of ['--usb-ok-text', '--usb-err-text', '--usb-info-text', '--usb-retry-text', '--usb-accent-text', '--usb-warn-text']) {
	if (!tokens[name]) throw new Error(`Token ${name} no definido en el bloque claro`);
}
console.log('Tokens claros:', JSON.stringify(tokens, null, 0));

// ── 2. Reglas de texto de estado ─────────────────────────────────────────────
const FAMILIES = ['amber', 'yellow', 'emerald', 'green', 'rose', 'red', 'sky', 'blue', 'fuchsia', 'violet'];
const BGS = ['#ffffff', '#f6f7f9', '#eef0f4'];
const css = THEME_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const failures = [];
const checked = [];
const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
for (const m of css.matchAll(ruleRe)) {
	const selector = m[1];
	if (!selector.includes('.usb-dock.dock-sepia')) continue;
	if (!selector.includes('[class*="text-')) continue;
	// La superficie de video permanece OSCURA en claro (representa el
	// reproductor): sus textos claros se miden sobre fondo oscuro, no sobre
	// las superficies claras de la interfaz.
	if (selector.includes('.usb-video-surface')) continue;
	const fam = FAMILIES.find((f) => selector.includes(`text-${f}`));
	if (!fam) continue;
	const colorM = m[2].match(/(?:^|;)\s*color:\s*([^;!]+)/);
	if (!colorM) continue;
	let val = colorM[1].trim();
	if (val.startsWith('var(')) {
		const name = val.slice(4, -1).trim();
		val = tokens[name];
		if (!val) {
			failures.push(`${selector.trim()} → ${name} sin valor en el bloque claro`);
			continue;
		}
	}
	checked.push(`${selector.trim().slice(0, 72)} → ${val}`);
	for (const bg of BGS) {
		const ratio = contrast(val, bg);
		if (ratio === null) {
			failures.push(`${selector.trim()} → ${val}: color no parseable`);
			continue;
		}
		if (ratio < 4.5) {
			failures.push(`${selector.trim()} → ${val} sobre ${bg}: ${ratio.toFixed(2)}:1 (mínimo 4.5)`);
		}
	}
}

console.log(`\nReglas verificadas: ${checked.length}`);
for (const line of checked) console.log(`  · ${line}`);
if (failures.length) {
	console.error(`\n✗ ${failures.length} combinaciones por debajo de 4.5:1:`);
	for (const f of failures) console.error('  ✗ ' + f);
	process.exit(1);
}
console.log('\n✅ CONTRASTE AA CLARO OK (todas las reglas ≥ 4.5:1 sobre las 3 superficies)');
