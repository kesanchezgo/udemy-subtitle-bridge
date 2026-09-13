// Standalone verification of the ES-overlay cue sync.
// Replicates parseTimedTextIntoCues + getActiveCueTextFromList from
// src/content_script.ts and walks the video clock across the real SRT the user
// shared, reporting the cue shown at each second.
//
// Run: node scripts/verify-overlay-sync.mjs

const ES_SRT = `1
00:00:00,082 --> 00:00:02,100
(música animada)

2
00:00:02,100 --> 00:00:03,090
Dheeru: Hola.

3
00:00:03,090 --> 00:00:05,610
Soy Dheeru Mundluru y bienvenidos de nuevo.

4
00:00:05,610 --> 00:00:09,540
Veamos cómo Java logra la independencia de plataforma

5
00:00:09,540 --> 00:00:12,423
sin afectar la velocidad de ejecución.

6
00:00:14,340 --> 00:00:17,520
Hablamos de compilación e interpretación,

7
00:00:17,520 --> 00:00:21,600
que ofrecen beneficios y limitaciones contrastantes.

8
00:00:21,600 --> 00:00:23,520
Hemos visto que con la compilación

9
00:00:23,520 --> 00:00:26,040
obtenemos velocidad de ejecución rápida

10
00:00:26,040 --> 00:00:29,670
pero sin el beneficio de la independencia de plataforma.

11
00:00:29,670 --> 00:00:32,520
Y también hemos visto que con la interpretación,

12
00:00:32,520 --> 00:00:35,460
obtenemos el beneficio de la independencia de plataforma

13
00:00:35,460 --> 00:00:39,270
pero con una velocidad de ejecución mucho más lenta.

14
00:00:39,270 --> 00:00:43,230
Y con Java, obtenemos lo mejor de ambos mundos.

15
00:00:43,230 --> 00:00:45,600
Es decir, Java usa la compilación`;

// ── Ported from content_script.ts ──

function normalizeSubtitleText(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\\[^}]+\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidSubtitleText(text) {
  const normalized = normalizeSubtitleText(text);
  const lower = normalized.toLowerCase();
  if (!normalized) return false;
  if (normalized.length > 320) return false;
  if (lower.includes('thumb-sprites') || lower.includes('#xywh=')) return false;
  if (/\.(jpg|jpeg|png|webp|gif|vtt|m3u8)([#?]|$)/i.test(normalized)) return false;
  if (/^https?:\/\//i.test(normalized) || /^blob:/i.test(normalized)) return false;
  if (/^\d+(?:\.\d+)?(?:,\d+(?:\.\d+)?){3}$/.test(normalized)) return false;
  return /[a-zA-ZÀ-ÿ]/.test(normalized);
}

function parseVttTime(timeStr) {
  const cleaned = String(timeStr).replace(',', '.').trim();
  const parts = cleaned.split(':');
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  return Number.NaN;
}

function parseTimedTextIntoCues(sourceText) {
  const cleaned = String(sourceText).replace(/^\uFEFF/, '').replace(/^WEBVTT[^\n\r]*(\r?\n)+/i, '').trim();
  const blocks = cleaned.split(/\r?\n\r?\n/);
  const parsed = [];
  let index = 1;
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let timeLineIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].includes('-->')) { timeLineIndex = i; break; }
    }
    if (timeLineIndex < 0) continue;
    const timeParts = lines[timeLineIndex].split('-->');
    if (timeParts.length !== 2) continue;
    const startTime = parseVttTime(timeParts[0]);
    const endTime = parseVttTime(timeParts[1]);
    const text = lines.slice(timeLineIndex + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (text && Number.isFinite(startTime) && Number.isFinite(endTime)) {
      const safeEnd = endTime > startTime ? endTime : startTime + 1.2;
      parsed.push({ index, startTime, endTime: safeEnd, text });
      index += 1;
    }
  }
  return parsed;
}

let lastImportedSubtitleText = '';

function getActiveCueTextFromList(cues, videoTime, offsetMs = 0) {
  if (cues.length === 0) return '';
  const valid = cues
    .map((cue) => ({ ...cue, text: normalizeSubtitleText(cue.text) }))
    .filter((cue) => isValidSubtitleText(cue.text));
  if (valid.length === 0) return '';
  if (!Number.isFinite(videoTime)) return lastImportedSubtitleText || '';
  const time = videoTime - offsetMs / 1000;
  const active = valid
    .filter((cue) => time >= cue.startTime - 0.05 && time <= cue.endTime + 0.05)
    .sort((a, b) => b.startTime - a.startTime || b.endTime - a.endTime);
  if (active[0]) return active[0].text;
  const TOL = 1.5;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const cue of valid) {
    const d = time < cue.startTime ? cue.startTime - time : time - cue.endTime;
    if (d < nearestDistance) { nearestDistance = d; nearest = cue; }
  }
  if (nearest && nearestDistance <= TOL) return nearest.text;
  return '';
}

// ── Run ──

const cues = parseTimedTextIntoCues(ES_SRT);
console.log(`Parsed ${cues.length} ES cues (expected 15).`);
if (cues.length !== 15) {
  console.log('❌ CUE COUNT MISMATCH — parser is dropping cues.');
  cues.forEach((c) => console.log(`  #${c.index} ${c.startTime.toFixed(2)}–${c.endTime.toFixed(2)} "${c.text.slice(0, 40)}"`));
}

// ── Overlay visibility gate (ported from applyOverlayStyle + ensureOverlayVisibleForImportedCues) ──

function overlayWouldRender(config, importedCueCount) {
  return Boolean(config.visible && config.autoTranslate && importedCueCount > 0);
}

function ensureOverlayVisibleForImportedCues(config, imported) {
  if (imported.length === 0) return config;
  if (config.visible && config.enabled && config.autoTranslate) return config;
  return { ...config, visible: true, enabled: true, autoTranslate: true };
}

const scenarios = [
  { name: 'toggle ON, overlay ON', config: { visible: true, enabled: true, autoTranslate: true } },
  { name: 'toggle OFF (user paused), overlay ON', config: { visible: true, enabled: true, autoTranslate: false } },
  { name: 'toggle OFF, overlay OFF', config: { visible: false, enabled: false, autoTranslate: false } },
];

console.log('\nImport-gate scenarios (after importing an ES track):');
let gateFailures = 0;
for (const s of scenarios) {
  const afterImport = ensureOverlayVisibleForImportedCues(s.config, cues);
  const renders = overlayWouldRender(afterImport, cues.length);
  if (!renders) gateFailures += 1;
  console.log(`  ${renders ? '✓' : '✗'} ${s.name} -> visible=${afterImport.visible} autoTranslate=${afterImport.autoTranslate} renders=${renders}`);
}

console.log('\nTimeline walk (video seconds -> displayed cue):');
let blanks = 0;
let shown = 0;
for (let t = 0; t <= 46; t += 0.5) {
  const text = getActiveCueTextFromList(cues, t, 0);
  const mark = text ? '✓' : '·';
  if (text) shown += 1; else blanks += 1;
  console.log(`  t=${t.toFixed(1).padStart(5)}s ${mark} ${text ? text.slice(0, 46) : '(blank)'}`);
}

console.log(`\nShown: ${shown}, blank: ${blanks}`);
const ok = cues.length === 15 && blanks === 0 && gateFailures === 0;
if (cues.length === 15) console.log('✅ Parser returns all 15 cues.');
else console.log('❌ Parser dropped cues.');
if (blanks === 0) console.log('✅ No blank frames across the timeline.');
else console.log(`❌ ${blanks} blank frames.`);
if (gateFailures === 0) console.log('✅ Overlay renders after import in every scenario.');
else console.log(`❌ Overlay hidden after import in ${gateFailures} scenario(s).`);
console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exitCode = ok ? 0 : 1;
