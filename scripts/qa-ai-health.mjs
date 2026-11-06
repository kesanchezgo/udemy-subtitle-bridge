/**
 * Estado de la IA sin navegador: redacción de URLs (la key de Gemini va en
 * ?key= y no puede llegar a la UI, a los logs ni al debug), el motivo del
 * bloqueo y el indicador de la cabecera en todos sus estados.
 *
 * Uso: npm run qa:ai-health
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-resolve-loader.mjs', import.meta.url);

const { redactProviderUrl } = await import('../src/app/services/ai-providers.ts');
const { aiBlockedMessage, aiBadgeStatus } = await import('../src/app/hooks/useAiHealth.ts');

const SECRET = 'qa-secreto-no-mostrar-7d1f';
const G = 'https://generativelanguage.googleapis.com/v1beta';

// 1. redactProviderUrl
assert.equal(redactProviderUrl(`${G}/models?key=${SECRET}`), `${G}/models`);
assert.equal(redactProviderUrl(`${G}/models/m:streamGenerateContent?alt=sse&key=${SECRET}`), `${G}/models/m:streamGenerateContent`);
assert.equal(redactProviderUrl('http://127.0.0.1:8010/health'), 'http://127.0.0.1:8010/health');
assert.equal(redactProviderUrl(''), '');
assert.ok(!redactProviderUrl(`no es una url?key=${SECRET}`).includes(SECRET));

// 2. aiBlockedMessage
const blocked = aiBlockedMessage('sin-respuesta', `${G}/models?key=${SECRET}`);
assert.ok(!blocked.includes(SECRET) && !blocked.includes('key='), blocked);
assert.equal(blocked, `El proveedor no responde (${G}/models). Reintentando...`);
assert.equal(aiBlockedMessage('sin-respuesta', ''), 'El proveedor no responde. Reintentando...');
assert.equal(aiBlockedMessage('no-config', 'x'), 'Sin proveedor de IA: configúralo en Ajustes → Proveedor.');
assert.equal(aiBlockedMessage('comprobando', 'x'), 'Comprobando la IA...');

// 3. aiBadgeStatus: los 7 estados
const badge = (o) => aiBadgeStatus({ kind: 'gemini', ok: null, configured: true, endpoint: G, localConnected: true, ...o });
const pick = (b) => `${b.name} · ${b.state} · ${b.tone}`;
assert.equal(pick(badge({ kind: 'local', endpoint: 'http://127.0.0.1:8010/v1/' })), 'IA local · conectada · ok');
assert.equal(badge({ kind: 'local', endpoint: 'http://127.0.0.1:8010/v1/' }).title, 'Servidor de IA local conectado (127.0.0.1:8010/v1)');
assert.equal(pick(badge({ kind: 'local', endpoint: '', ok: false })), 'IA local · sin conexión · off');
assert.equal(badge({ kind: 'local', endpoint: '', ok: false }).title, 'Servidor de IA local sin conexión (127.0.0.1:8010)');
assert.equal(pick(badge({ ok: true })), 'Gemini · nube · cloud');
assert.equal(pick(badge({ ok: null })), 'Gemini · nube · cloud');
assert.equal(pick(badge({ ok: false })), 'Gemini · sin respuesta · off');
assert.equal(pick(badge({ ok: true, configured: false })), 'Gemini · sin configurar · off');
assert.equal(pick(badge({ kind: 'anthropic', ok: false })), 'Claude · sin respuesta · off');
const leaky = badge({ ok: false, endpoint: `${G}?key=${SECRET}` });
assert.ok(!leaky.title.includes(SECRET) && !leaky.title.includes('key='), leaky.title);

console.log('✅ IA OK: URLs sin key, motivo del bloqueo e indicador en los 7 estados');
