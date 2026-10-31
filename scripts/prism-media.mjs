/**
 * Lee los archivos de Prism de node_modules en el MISMO orden que el bundle
 * de la extensión y devuelve el array de media que addApkgEntries espera.
 *
 * Solo para scripts de QA/demo que corren en Node: la extensión usa los
 * imports ?raw de ankiApkg.ts (mismo contenido, vía Vite).
 *
 * Uso: const PRISM_MEDIA = await loadPrismMedia();
 */
import fs from 'node:fs';
import path from 'node:path';

const LANGS = 'markup css clike javascript typescript jsx tsx python java kotlin csharp c cpp go php ruby bash powershell sql json yaml properties docker'.split(' ');
const NL = '\n';

export function loadPrismMedia() {
	// node_modules se resuelve desde el repo raíz (los scripts viven en scripts/).
	const base = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');
	const js = LANGS.map((l) => fs.readFileSync(path.join(base, 'node_modules', 'prismjs', 'components', `prism-${l}.min.js`), 'utf8')).join(NL);
	const css = fs.readFileSync(path.join(base, 'node_modules', 'prismjs', 'themes', 'prism.min.css'), 'utf8')
		+ NL + fs.readFileSync(path.join(base, 'node_modules', 'prismjs', 'themes', 'prism-tomorrow.min.css'), 'utf8');
	return [
		{ name: '_kinema-prism-v1.js', data: js },
		{ name: '_kinema-prism-v1.css', data: css },
	];
}
