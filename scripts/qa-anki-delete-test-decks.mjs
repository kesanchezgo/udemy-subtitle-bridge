/**
 * Borra los 2 mazos de PRUEBA de la colección del usuario (con backup previo):
 *   - "Java In-Depth: Become a Complete Java Engineer! [2026]" (árbol completo)
 *   - "Learn English::Dev Vocabulary"
 *
 * Backup: exporta cada mazo a .apkg con AnkiConnect `exportPackage`; si la
 * acción no existe, vuelca notas completas (campos+tags) a JSON. Los archivos
 * de medios NUNCA se borran de collection.media, así que backup + medios =
 * recuperación completa. Quedan en tmp/anki-backups/.
 *
 * Uso: node scripts/qa-anki-delete-test-decks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ANKI = 'http://127.0.0.1:8765';
const BACKUP_DIR = path.resolve('tmp/anki-backups');

const TEST_DECKS = [
	'Java In-Depth: Become a Complete Java Engineer! [2026]',
	'Learn English::Dev Vocabulary',
];

async function call(action, params = {}) {
	const res = await fetch(ANKI, { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
}

const beforeDecks = (await call('deckNames')).sort();
fs.mkdirSync(BACKUP_DIR, { recursive: true });

for (const deck of TEST_DECKS) {
	if (!beforeDecks.some((d) => d === deck || d.startsWith(`${deck}::`))) {
		console.log(`· "${deck}" ya no existe — nada que hacer`);
		continue;
	}
	const safe = deck.replace(/[^\w]+/g, '_').slice(0, 80);

	// 1. Backup apkg (si la acción existe)
	let apkgPath = null;
	try {
		apkgPath = path.join(BACKUP_DIR, `${safe}.apkg`).replace(/\\/g, '/');
		await call('exportPackage', { deck, path: apkgPath, includeSched: false });
		if (!fs.existsSync(apkgPath)) apkgPath = null;
	} catch {
		apkgPath = null;
	}
	if (apkgPath) {
		console.log(`  ✓ backup .apkg → ${apkgPath} (${fs.statSync(apkgPath).size} bytes)`);
	} else {
		// 2. Backup JSON de notas (los medios quedan en collection.media)
		const nids = await call('findNotes', { query: `deck:"${deck}"` });
		const notes = nids.length ? await call('notesInfo', { notes: nids }) : [];
		const jsonPath = path.join(BACKUP_DIR, `${safe}_notes.json`);
		fs.writeFileSync(jsonPath, JSON.stringify(notes, null, 1));
		console.log(`  ✓ backup JSON (${notes.length} notas) → ${jsonPath}`);
	}

	// 3. Borrado: primero notas, luego el árbol de mazos
	const nids = await call('findNotes', { query: `deck:"${deck}"` });
	if (nids.length) await call('deleteNotes', { notes: nids });
	await call('deleteDecks', { decks: [deck], cardsToo: true });
	console.log(`  ✓ eliminado "${deck}" (${nids.length} notas, medios intactos en collection.media)`);
}

// 4. Verificación
const afterDecks = (await call('deckNames')).sort();
const survivors = afterDecks.filter((d) => TEST_DECKS.some((t) => d === t || d.startsWith(`${t}::`)));
if (survivors.length) {
	console.error(`✗ aún existen: ${JSON.stringify(survivors)}`);
	process.exit(1);
}
const expectedRemaining = beforeDecks.filter((d) => !TEST_DECKS.some((t) => d === t || d.startsWith(`${t}::`))).sort();
if (afterDecks.length !== expectedRemaining.length || afterDecks.some((d, i) => d !== expectedRemaining[i])) {
	console.error('✗ la colección final no coincide con lo esperado');
	process.exit(1);
}
console.log(`✅ mazos de prueba eliminados con backup; resto de la colección intacto (${afterDecks.length} mazos)`);
