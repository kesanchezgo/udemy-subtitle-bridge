/**
 * Suite completa de QA Anki (un comando, re-ejecutable N veces):
 *   1. qa-anki-decks.mjs         — estructura del .apkg contra código de producción
 *   2. qa-anki-import-verify.mjs — importación real en Anki + verificación + capturas + limpieza
 *   3. qa-vocab-ai.mjs           — contenido del vocabulario contra el modelo real del proxy
 *
 * Uso:    node scripts/qa-anki-all.mjs [N]
 * Ejemp:  node scripts/qa-anki-all.mjs 3   (3 intentos completos)
 */
import { spawnSync } from 'node:child_process';

const runs = Math.max(1, Number(process.argv[2]) || 1);
let failed = false;

for (let attempt = 1; attempt <= runs; attempt += 1) {
	console.log(`\n═══════════ INTENTO ${attempt}/${runs} ═══════════`);
	const steps = [
		{ name: 'estructura .apkg', cmd: ['node', 'scripts/qa-anki-decks.mjs'] },
		{ name: 'importación real + capturas', cmd: ['node', 'scripts/qa-anki-import-verify.mjs'] },
		{ name: 'contenido IA (proxy real)', cmd: ['node', 'scripts/qa-vocab-ai.mjs'] },
	];
	for (const step of steps) {
		console.log(`\n── ${step.name} ──`);
		const result = spawnSync(step.cmd[0], step.cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], shell: false, encoding: 'utf8' });
		process.stdout.write(result.stdout || '');
		if (result.status !== 0) {
			failed = true;
			process.stderr.write(result.stderr || '');
			console.error(`✗ falló: ${step.name}`);
			break;
		}
	}
}

console.log(failed ? '\n❌ SUITE CON FALLOS' : `\n✅ SUITE COMPLETA OK (${runs} intento${runs > 1 ? 's' : ''})`);
process.exit(failed ? 1 : 0);
