# -*- coding: utf-8 -*-
# 1b. parsers con el gate + 2. vocabulario con lessonUrl.
import io

# ── 1b-i. StudyAgentTab: aceptar t SOLO con TIMED_TRANSCRIPT ─────────────────
p = 'src/app/components/StudyAgentTab.tsx'
t = io.open(p, encoding='utf-8').read()
old = "          t: typeof card.t === 'string' && /^\\d{1,2}:\\d{2}$/.test(card.t) ? card.t : undefined,"
assert old in t, 'normalize t'
new = """          // Gate F2-1: sin transcripción temporizada, cualquier t del modelo
          // es inventada — se descarta siempre.
          t: TIMED_TRANSCRIPT && typeof card.t === 'string' && /^\\d{1,2}:\\d{2}$/.test(card.t) ? card.t : undefined,"""
t = t.replace(old, new, 1)
# import del gate junto al resto de prompts
import re
m = re.search(r'from "\.\./shared/prompts";', t)
assert m, 'import prompts'
idx = t[:m.start()].rfind('import {')
seg = t[idx:m.end()]
if 'TIMED_TRANSCRIPT' not in seg:
    t = t.replace(seg, seg.replace('import {', 'import { TIMED_TRANSCRIPT,', 1), 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('1b-i. normalize con gate ok')

# ── 1b-ii. vocabularyService: parse ignora t sin gate; fuente enlazable ─────
p = 'src/app/services/vocabularyService.ts'
t = io.open(p, encoding='utf-8').read()

old = "export function buildVocabularySpec(\n\twords: VocabularyWord[],\n\tcourse: string,\n\tlesson: string,\n\tconfig: VocabConfig\n): VocabSpecResult {"
new = """export function buildVocabularySpec(
	words: VocabularyWord[],
	course: string,
	lesson: string,
	config: VocabConfig,
	/** URL de la lección: convierte la fuente en enlace real. Sin URL, el
	 *  campo va vacío y la plantilla lo oculta (nada de texto muerto). */
	lessonUrl?: string
): VocabSpecResult {"""
assert old in t, 'firma spec'
t = t.replace(old, new, 1)

old = "			word.t ? `▶ Escúchala en la lección (${word.t})` : '▶ Escúchala en la lección', // fuente (F2-1: con minuto)"
new = """			// Fuente con enlace real (contrarrevisión punto 2). El minuto solo
			// con F2-1 activo (TIMED_TRANSCRIPT); sin él, enlace a la lección.
			(() => {
				if (!lessonUrl) return '';
				const base = lessonUrl.split('#')[0].split('?')[0];
				const href = TIMED_TRANSCRIPT && word.t && /^\\d{1,2}:\\d{2}$/.test(word.t)
					? `${base}?start=${Number(word.t.split(':')[0]) * 60 + Number(word.t.split(':')[1])}#overview`
					: base;
				return `<a href="${href.replace(/"/g, '&quot;')}">▶ Escúchala en la lección${TIMED_TRANSCRIPT && word.t ? ` (${word.t})` : ''}</a>`;
			})(),"""
assert old in t, 'fuente'
t = t.replace(old, new, 1)

# parse: t solo con gate
old = """			// B6: colocación frecuente y natural con la palabra («memory leak»);
			// se tolera vacío — la plantilla la oculta.
			collocation: cleanText(raw.collocation ?? raw.collocation),
		});"""
new = """			// B6: colocación frecuente y natural con la palabra («memory leak»);
			// se tolera vacío — la plantilla la oculta.
			collocation: cleanText(raw.collocation ?? raw.collocation),
			// Gate F2-1: sin transcripción temporizada, t del modelo es ruido.
			t: TIMED_TRANSCRIPT && typeof raw.t === 'string' && /^\\d{1,2}:\\d{2}$/.test(raw.t) ? raw.t : undefined,
		});"""
assert old in t, 'parse t'
t = t.replace(old, new, 1)

# import del gate
import re
m = re.search(r'import \{[^}]*\} from "\./ankiDesign";', t)
assert m, 'import ankiDesign'
if 'TIMED_TRANSCRIPT' not in m.group(0):
    t = t.replace(m.group(0), m.group(0).replace('import {', 'import { TIMED_TRANSCRIPT,', 1), 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('1b-ii + 2. vocabularyService ok')
