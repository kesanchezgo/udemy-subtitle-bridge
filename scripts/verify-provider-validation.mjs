// Direct test of validateProviderConfig logic (no browser needed): exercise the
// same fetch the function performs and assert the classification.
// Run: node scripts/verify-provider-validation.mjs

const classify = async (baseUrl, apiKey, model) => {
  if (!baseUrl) return { status: 'missing_fields' };
  if (!apiKey) return { status: 'missing_fields' };
  if (!model) return { status: 'missing_fields' };
  try { new URL(baseUrl); } catch { return { status: 'bad_url' }; }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'di ok' }], max_tokens: 8, stream: false }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) return { status: 'http_error', http: res.status };
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    return content ? { status: 'ok' } : { status: 'http_error', note: 'empty content' };
  } catch (e) {
    if (e.name === 'AbortError') return { status: 'unreachable', reason: 'timeout' };
    return { status: 'unreachable', reason: e.name };
  } finally {
    clearTimeout(timeout);
  }
};

const cases = [
  { label: 'missing URL', args: ['', 'k', 'm'], expect: 'missing_fields' },
  { label: 'missing key', args: ['http://127.0.0.1:6660/v1', '', 'm'], expect: 'missing_fields' },
  { label: 'bad URL', args: ['not-a-url', 'k', 'm'], expect: 'bad_url' },
  { label: 'dead port', args: ['http://127.0.0.1:9999/v1', 'x', 'm'], expect: 'unreachable' },
  { label: 'working proxy', args: ['http://127.0.0.1:6660/v1', 'gmifree', 'muse-spark-1.3-contributor-free'], expect: 'ok' },
];

let pass = 0;
for (const c of cases) {
  const r = await classify(...c.args);
  const ok = r.status === c.expect;
  if (ok) pass += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${c.label.padEnd(16)} -> ${r.status}${r.reason ? ` (${r.reason})` : ''}${r.http ? ` (HTTP ${r.http})` : ''} [expect ${c.expect}]`);
}
console.log(`\n${pass}/${cases.length} passed`);
process.exitCode = pass === cases.length ? 0 : 1;
