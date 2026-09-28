// Consultas Scopus para sustentar el diseño pedagógico de cada familia de mazos.
const KEY = 'fa6b212635275f83491b00fc3bbd67f5';
const queries = {
  testing_effect: 'TITLE-ABS-KEY("retrieval practice" AND "testing effect")',
  spacing: 'TITLE-ABS-KEY("distributed practice" AND spacing)',
  srs_algorithm: 'TITLE-ABS-KEY("spaced repetition" AND scheduling AND memory)',
  interleaving: 'TITLE-ABS-KEY("interleaved practice" OR (interleaving AND "mathematical practice"))',
  vocab_flashcards: 'TITLE-ABS-KEY(flashcard* AND vocabulary AND "second language")',
  dual_coding: 'TITLE-ABS-KEY("dual coding" AND (picture* OR image*))',
  desirable_difficulties: 'TITLE-ABS-KEY("desirable difficulties")',
  learning_techniques: 'TITLE-ABS-KEY("elaborative interrogation" OR "self-explanation" OR "practice testing")',
  incidental_vocab: 'TITLE-ABS-KEY("incidental vocabulary" AND reading AND acquisition)',
  vocab_context: 'TITLE-ABS-KEY(vocabulary AND "sentence" AND (L2 OR "second language") AND learning)',
};
const out = {};
for (const [name, q] of Object.entries(queries)) {
  const url = `https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(q)}&count=6&sort=citedby-count&apiKey=${KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) { console.error(name, 'HTTP', res.status); continue; }
    const json = await res.json();
    const entries = json['search-results']?.entry ?? [];
    out[name] = entries.map(e => ({
      title: e['dc:title'],
      authors: e['dc:creator'] ? (Array.isArray(e['dc:creator']) ? e['dc:creator'].map(c => c['ce:surname'] || c.$).join(', ') : e['dc:creator'].$) : '',
      year: (e['prism:coverDate'] || '').slice(0, 4),
      journal: e['prism:publicationName'],
      doi: (e['prism:doi'] || (e['dc:identifier'] || '').replace('DOI:', '')) || '',
      citedBy: e['citedby-count'],
    }));
    console.log(`✓ ${name}: ${out[name].length} refs`);
  } catch (err) { console.error(`✗ ${name}: ${err.message}`); }
  await new Promise(r => setTimeout(r, 400));
}
const fs = await import('node:fs');
fs.writeFileSync('tmp/scopus-refs.json', JSON.stringify(out, null, 1));
console.log('→ tmp/scopus-refs.json');
