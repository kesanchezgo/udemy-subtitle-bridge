/**
 * Glue de la extensión para el builder .apkg: carga del wasm de sql.js desde
 * el bundle y compresión zip. TODA la lógica vive en ankiApkgCore.ts (pura,
 * testeable desde Node con el mismo código de producción).
 */
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { buildCollectionBuffer, type ApkgSpec } from './ankiApkgCore';

export type { ApkgSpec } from './ankiApkgCore';

/**
 * Resuelve la URL del wasm contra el bundle de la extensión.
 *
 * El import `?url` emite una ruta RELATIVA ("assets/sql-wasm-*.wasm") que, al
 * hacer fetch desde un content script, se resuelve contra el ORIGEN DE LA
 * PÁGINA (https://www.udemy.com/assets/...) y devuelve HTML → el wasm no
 * compila ("expected magic word"). chrome.runtime.getURL la convierte en una
 * URL chrome-extension:// servida por el bundle (el recurso está declarado en
 * web_accessible_resources).
 */
function resolveSqlWasmUrl(): string {
	if (/^(https?|chrome-extension|moz-extension):/.test(sqlWasmUrl)) {
		return sqlWasmUrl;
	}
	const api = (globalThis as typeof globalThis & {
		chrome?: { runtime?: { getURL?: (path: string) => string } };
	}).chrome;
	if (typeof api?.runtime?.getURL === 'function') {
		try {
			return api.runtime.getURL(sqlWasmUrl.replace(/^\/+/, ''));
		} catch {
			/* sin runtime — devolver la cruda */
		}
	}
	return sqlWasmUrl;
}

async function loadSqlJs(): Promise<any> {
	// Carga explícita del wasm con timeout: el locateFile interno puede quedar
	// colgado sin error si el fetch del recurso del bundle no responde, y el
	// usuario vería el export congelado sin explicación.
	return Promise.race([
		(async () => {
			const wasmBinary = await fetch(resolveSqlWasmUrl()).then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status} al cargar sql-wasm.wasm`);
				return r.arrayBuffer();
			});
			return initSqlJs({ wasmBinary });
		})(),
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('sql.js no inicializó en 15 s — el wasm del bundle no respondió')), 15000)
		),
	]);
}

export async function buildAnkiApkg(spec: ApkgSpec, onProgress?: (msg: string) => void): Promise<Uint8Array> {
	onProgress?.('Inicializando SQLite...');
	const SQL = await loadSqlJs();
	const sqliteData = await buildCollectionBuffer(spec, SQL, onProgress);

	onProgress?.('Exportando colección...');
	const zip = new JSZip();
	zip.file('collection.anki2', sqliteData, { compression: 'DEFLATE', compressionOptions: { level: 6 } });
	zip.file('media', '{}', { compression: 'DEFLATE', compressionOptions: { level: 6 } });

	return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadApkg(data: Uint8Array, filename: string): void {
	// Pass the Uint8Array straight to Blob. Going through Array.from() would
	// materialize a second copy of the whole archive in memory. The cast only
	// narrows the backing buffer type; no data is copied.
	const blob = new Blob([data as BlobPart], { type: 'application/octet-stream' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename.endsWith('.apkg') ? filename : `${filename}.apkg`;
	anchor.style.display = 'none';
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1500);
}
