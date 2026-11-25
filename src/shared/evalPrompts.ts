export interface EvalAIMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface StudyEvalContext {
	courseName?: string;
	courseDescription?: string;
	lessonName?: string;
	objective?: string;
	techContext?: string;
	/** Transcripción de la lección para que el evaluador nunca corrija a ciegas contra un resumen incompleto. */
	lessonTranscript?: string;
	/** Número de intento real sobre esta pregunta (1 = primer intento con opción de reintentar; 2+ = reintento tras pista). */
	attemptNumber?: number;
}

export const EVAL_TRANSCRIPT_MAX_CHARS = 8000;

/**
 * Selecciona hasta `maxChars` de la transcripción de la lección para anclar la
 * evaluación formativa. Si cabe entera (lecciones de hasta ~10 min), viaja
 * íntegra; si es más larga, prioriza las ventanas donde aparecen términos de la
 * pregunta, la respuesta de referencia y la respuesta del estudiante.
 */
export function selectEvalTranscriptExcerpt(
	transcript: string | undefined,
	focusText: string,
	maxChars = EVAL_TRANSCRIPT_MAX_CHARS,
): string {
	const clean = String(transcript ?? '').trim();
	if (!clean) return '';
	if (clean.length <= maxChars) return clean;

	const tokens = [...new Set(
		String(focusText ?? '')
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.split(/[^a-z0-9._-]+/)
			.filter((t) => t.length >= 3),
	)];

	if (tokens.length === 0) return `${clean.slice(0, maxChars - 1).trimEnd()}…`;

	const windowSize = 1400;
	const step = 700;
	const windows: { start: number; end: number; score: number }[] = [];
	for (let start = 0; start < clean.length; start += step) {
		const end = Math.min(clean.length, start + windowSize);
		const sliceLower = clean.slice(start, end).toLowerCase();
		let score = 0;
		for (const tok of tokens) {
			if (sliceLower.includes(tok)) score += tok.length >= 6 ? 2 : 1;
		}
		windows.push({ start, end, score });
		if (end >= clean.length) break;
	}

	const picked = windows
		.filter((w) => w.score > 0)
		.sort((a, b) => b.score - a.score || a.start - b.start)
		.slice(0, 6)
		.sort((a, b) => a.start - b.start);

	if (picked.length === 0) return `${clean.slice(0, maxChars - 1).trimEnd()}…`;

	const merged: { start: number; end: number }[] = [];
	for (const w of picked) {
		const prev = merged[merged.length - 1];
		if (prev && w.start <= prev.end + 120) prev.end = Math.max(prev.end, w.end);
		else merged.push({ start: w.start, end: w.end });
	}

	const parts: string[] = [];
	let budget = maxChars;
	for (const seg of merged) {
		if (budget <= 120) break;
		const chunk = clean.slice(seg.start, Math.min(seg.end, seg.start + budget)).trim();
		if (!chunk) continue;
		parts.push(`${seg.start > 0 ? '…' : ''}${chunk}${seg.end < clean.length ? '…' : ''}`);
		budget -= chunk.length + 6;
	}
	return parts.join('\n\n').slice(0, maxChars);
}

export function formatStudyEvalContext(ctx?: StudyEvalContext, focusText = ''): string {
	if (!ctx) return 'Contexto del curso: no especificado.';
	const excerpt = selectEvalTranscriptExcerpt(ctx.lessonTranscript, focusText);
	return [
		`Curso: ${ctx.courseName?.trim() || 'No especificado'}`,
		`Lección: ${ctx.lessonName?.trim() || 'No especificada'}`,
		`Objetivo de aprendizaje: ${ctx.objective?.trim() || 'No especificado'}`,
		ctx.courseDescription?.trim() ? `Descripción del curso: ${ctx.courseDescription.trim().slice(0, 1000)}` : '',
		ctx.techContext?.trim() ? `Ideas clave de la lección: ${ctx.techContext.trim().slice(0, 700)}` : '',
		excerpt ? `\nTRANSCRIPCIÓN DE LA LECCIÓN (fuente de verdad sobre lo explicado y mostrado en clase):\n"""\n${excerpt}\n"""` : '',
	].filter(Boolean).join('\n');
}

export function buildEvalQuestionMessages(
	question: string,
	expectedAnswer: string,
	studentAnswer: string,
	bloomLevel: string,
	context?: StudyEvalContext,
): EvalAIMessage[] {
	const attempt = Math.max(1, Math.round(context?.attemptNumber ?? 1));
	return [
		{
			role: 'system',
			content: [
				'Eres el tutor experto de Kinema dando feedback formativo directo a quien estudia un curso online.',
				`El objetivo cognitivo de esta pregunta es nivel "${bloomLevel}" según la Taxonomía de Bloom.`,
				`INTENTO ACTUAL EN ESTA PREGUNTA: intento #${attempt}.`,
				'',
				'REGLA DE VOZ (OBLIGATORIA):',
				'- Háblale SIEMPRE directamente en segunda persona del singular («tú»: «Acertaste en…», «Identificaste bien…», «Te faltó precisar…», «Ojo con…»).',
				'- PROHIBIDO hablar en tercera persona sobre quien responde («El estudiante…», «Identificó…», «Confundió…», «Mencionó…», «Respondió…»).',
				'',
				'REGLA 0 — PETICIÓN DE ACLARACIÓN DEL ENUNCIADO ([ACLARACION]):',
				'- Detecta si quien responde está preguntando qué significa una palabra, expresión o parte del enunciado de la PREGUNTA porque no la entendió (p. ej., «¿a qué te refieres con X?», «¿qué significa X en la pregunta?», «no entiendo qué me preguntas con…»), incluso si añade un tanteo superficial («…y pues es más fácil») sin haber podido responder aún al fondo por esa duda léxica.',
				'- Si ocurre eso (y NO es simplemente «no sé la respuesta» a una pregunta clara), devuelve EXCLUSIVAMENTE el veredicto `[ACLARACION]` con estas dos líneas y NADA MÁS:',
				'  [ACLARACION]',
				'  ACLARACION: [explica en 1-2 frases llanas y directas qué significa exactamente ese término o expresión dentro de la pregunta, validando en media frase cualquier intuición inicial si la dio]',
				'  PISTA: [reformula la pregunta en lenguaje cotidiano y concreto apuntando a lo visto en la lección para que ahora sí pueda responderla, PROHIBIDO revelar la solución o respuesta final]',
				'',
				'REGLA DE VERDAD Y JUSTICIA TÉCNICA (CRÍTICA):',
				'- La «RESPUESTA DE REFERENCIA» es una guía mínima resumida, NUNCA una lista cerrada ni excluyente.',
				'- Si viene incluida la «TRANSCRIPCIÓN DE LA LECCIÓN», ella y el funcionamiento real de la disciplina/tecnología mandan sobre cualquier omisión de la respuesta de referencia.',
				'- Ten en cuenta que los subtítulos automáticos en inglés suelen transcribir nombres de archivos, puntos o flags de forma fonética (p. ej., «Python version» por `.python-version`, «pie project toml» por `pyproject.toml`, «git ignore» por `.gitignore`). Si la respuesta alude a algo que SÍ salió en la transcripción o que es técnicamente cierto en la herramienta real, JAMÁS digas que «no existe» o «no corresponde»: reconócelo como acierto en BIEN:.',
				'- Puente semántico («en la punta de la lengua»): si describe correctamente la función o propósito de una pieza sin recordar su nombre exacto (p. ej., dice «archivo de versión» por `.python-version` o «archivo de dependencias» cuando los requisitos van en `pyproject.toml`), NO lo trates como error total: valida su intuición funcional y conéctala con el nombre técnico exacto (`archivo` / `comando`) para anclar el recuerdo.',
				'- Adapta siempre el dominio al tema real del curso; no asumas programación si la clase trata de otra disciplina.',
				'',
				'RÚBRICA DE VEREDICTO (cuando NO es [ACLARACION]):',
				'- [EXCELENTE]: capta la idea central con precisión y explica el mecanismo, el porqué o un matiz aplicado a su objetivo.',
				'- [CORRECTO]: expresa la idea central aunque use sus propias palabras, sinónimos, espanglish técnico o redacción telegráfica/coloquial. Nunca penalices brevedad, mayúsculas, ortografía ni decir «no me acuerdo más» si ya cubrió lo esencial.',
				'- [PARCIAL]: acierta una parte real o describe la función sin los nombres clave, dejando incompleta una pieza central de la pregunta.',
				'- [INCORRECTO]: responde solo «no sé» o parte de una premisa contraria al mecanismo real.',
				'',
				'ANDAMIAJE PROGRESIVO EN `FALTO:` (SEGÚN EL INTENTO):',
				attempt === 1
					? '- Estás en el INTENTO #1: si el veredicto es [PARCIAL] o [INCORRECTO] y quien estudia SÍ intentó responder (no escribió únicamente «no sé» / «ni idea»), en `FALTO:` aplica ANDAMIAJE SIN SPOILER: señala con precisión qué dimensión, contraste o caso le falta pensar y oriéntale hacia el momento o ejemplo de la lección para que pueda recuperarlo por sí mismo al pulsar «Intentarlo de nuevo», SIN dictarle la respuesta completa masticada. (Solo si escribió únicamente «no sé» sin intento alguno, dale la explicación directa).'
					: '- Estás en el INTENTO #2 o posterior: si sigue en [PARCIAL] o [INCORRECTO], entrega ya el CIERRE EXPLICATIVO COMPLETO en `FALTO:`, explicando con total claridad el mecanismo exacto y los términos precisos para que consolide la idea sin frustración.',
				'',
				'ESTRUCTURA PEDAGÓGICA (cuando NO es [ACLARACION]):',
				'- BIEN: reconoce en 1 frase concreta lo que sí acertó o intuyó bien (poniendo el nombre técnico exacto si lo describió por su función). Si dijo solo «no sé» o todo es erróneo, escribe exactamente: (nada)',
				'- FALTO: si es EXCELENTE o CORRECTO, escribe exactamente: (nada). Si es PARCIAL o INCORRECTO, aplica la regla de ANDAMIAJE PROGRESIVO correspondiente a este intento en 1-3 frases claras.',
				'- PARA RECORDAR: 1 frase corta con una regla mental fácil de retener (en el intento #1 con [PARCIAL]/[INCORRECTO], que oriente el criterio sin regalar literalmente los datos que faltan).',
				'- Sin preguntas abiertas innecesarias al final, sin porcentajes, sin sermones. Responde SIEMPRE en español.',
			].join('\n'),
		},
		{
			role: 'user',
			content:
				`${formatStudyEvalContext(context, `${question}\n${expectedAnswer}\n${studentAnswer}`)}\n\n` +
				`INTENTO DEL ESTUDIANTE: #${attempt}\n\n` +
				`PREGUNTA (nivel ${bloomLevel}): ${question}\n\n` +
				`RESPUESTA DE REFERENCIA (guía mínima interna, puede omitir detalles válidos de la transcripción):\n${expectedAnswer}\n\n` +
				`RESPUESTA DEL ESTUDIANTE:\n${studentAnswer}\n\n` +
				'Evalúa hablándole SIEMPRE de «tú» (segunda persona, prohibido usar tercera persona como «identificó» o «confundió»).\n' +
				'Si pregunta qué significa un término o parte del enunciado, usa SOLO el formato [ACLARACION] + ACLARACION: + PISTA: (sin revelar la respuesta).\n' +
				'En cualquier otro caso usa este formato EXACTO:\n' +
				'[EXCELENTE|CORRECTO|PARCIAL|INCORRECTO]\n' +
				'BIEN: [en 2.ª persona, qué acertaste o intuiste bien en 1 frase concreta; si no hubo ningún acierto, escribe: (nada)]\n' +
				'FALTO: [solo si PARCIAL o INCORRECTO, en 2.ª persona y respetando la regla del intento actual. Si es EXCELENTE o CORRECTO escribe: (nada)]\n' +
				'PARA RECORDAR: [regla mental breve de 1 frase conectada con el tema real, sin repetir literalmente FALTO:]',
		},
	];
}

export function buildFeynmanMessages(
	topic: string,
	modelAnswer: string,
	studentAnswer: string,
	context?: StudyEvalContext,
): EvalAIMessage[] {
	const attempt = Math.max(1, Math.round(context?.attemptNumber ?? 1));
	return [
		{
			role: 'system',
			content: [
				'Eres el tutor experto de Kinema evaluando si quien estudia entendió el concepto al explicarlo con sus propias palabras (Técnica Feynman).',
				`INTENTO ACTUAL EN ESTA EXPLICACIÓN: intento #${attempt}.`,
				'',
				'REGLA DE VOZ (OBLIGATORIA):',
				'- Háblale SIEMPRE en segunda persona («tú»: «Explicaste con claridad…», «Te faltó conectar…»).',
				'- PROHIBIDO usar tercera persona («El estudiante…», «Explicó…», «Confundió…», «Mencionó…»).',
				'',
				'REGLA 0 — PETICIÓN DE ACLARACIÓN DEL ENUNCIADO ([ACLARACION]):',
				'- Si quien estudia pregunta qué significa un término o parte de la consigna porque no la entendió (p. ej., «¿a qué te refieres con X?», «¿qué significa X?»), devuelve EXCLUSIVAMENTE:',
				'  [ACLARACION]',
				'  ACLARACION: [explica en 1-2 frases llanas qué significa ese término en la consigna]',
				'  PISTA: [reformula en lenguaje cotidiano qué idea debe explicar con sus palabras, PROHIBIDO revelar la explicación resuelta]',
				'',
				'REGLA DE VERDAD Y PUENTE SEMÁNTICO:',
				'- La «GUÍA DE ESTRUCTURA / REFERENCIA» es orientativa; la «TRANSCRIPCIÓN DE LA LECCIÓN» (si está presente) y el funcionamiento real del dominio mandan.',
				'- Reconoce detalles reales de la lección aunque los subtítulos automáticos hayan deformado nombres técnicos o aunque describa la función de una pieza sin recordar aún su término exacto (valida su intuición y nómbrale el término preciso).',
				'- Adapta siempre el dominio al tema real del curso; nunca penalices brevedad, tono oral/coloquial ni ortografía.',
				'',
				'RÚBRICA (cuando NO es [ACLARACION]):',
				'- [EXCELENTE]: explica la idea con claridad, sencillez y causa/efecto o criterio práctico.',
				'- [CORRECTO]: transmite la idea central con sus propias palabras o ejemplos equivalentes sin exigir literalidad.',
				'- [PARCIAL]: acierta parte pero deja un salto lógico o pieza clave sin explicar.',
				'- [INCORRECTO]: escribe solo «no sé» o invierte el mecanismo central.',
				'',
				'ANDAMIAJE PROGRESIVO EN `FALTO:`:',
				attempt === 1
					? '- INTENTO #1: si es [PARCIAL] o [INCORRECTO] y hubo un intento real (no solo «no sé»), en `FALTO:` indica qué eslabón lógico o contraste le falta conectar apuntando al ejemplo de la lección, SIN redactarle la explicación completa hecha para que pueda completarla al reintentar.'
					: '- INTENTO #2 o posterior: si sigue en [PARCIAL] o [INCORRECTO], da ya el cierre explicativo completo y claro en `FALTO:` para consolidar el concepto.',
				'- No hagas preguntas finales ni des porcentajes. Responde SIEMPRE en español.',
			].join('\n'),
		},
		{
			role: 'user',
			content:
				`${formatStudyEvalContext(context, `${topic}\n${modelAnswer}\n${studentAnswer}`)}\n\n` +
				`INTENTO DEL ESTUDIANTE: #${attempt}\n\n` +
				`Evalúa esta explicación con propias palabras sobre: "${topic}"\n\n` +
				`GUÍA DE ESTRUCTURA / REFERENCIA (orientativa, no exigir sus mismas palabras):\n${modelAnswer}\n\n` +
				`EXPLICACION DEL ESTUDIANTE:\n${studentAnswer}\n\n` +
				'Responde hablándole SIEMPRE de «tú».\n' +
				'Si pregunta qué significa un término de la consigna, usa SOLO [ACLARACION] + ACLARACION: + PISTA: (sin revelar la respuesta).\n' +
				'En cualquier otro caso usa este formato EXACTO (sin texto extra antes o después):\n' +
				'[EXCELENTE|CORRECTO|PARCIAL|INCORRECTO]\n' +
				'BIEN: [en 2.ª persona, qué explicaste bien en 1 frase concreta; si está todo mal o en blanco, escribe: (nada)]\n' +
				'FALTO: [solo si PARCIAL o INCORRECTO, en 2.ª persona y respetando la regla del intento actual. Si es EXCELENTE o CORRECTO escribe: (nada)]\n' +
				'PARA RECORDAR: [heurística o imagen mental de 1 frase para fijar el concepto, sin repetir literalmente FALTO:]',
		},
	];
}

export function buildCodeReviewMessages(
	challengeTitle: string,
	expectedSolution: string,
	studentCode: string,
	context?: StudyEvalContext,
	declaredLevel?: string,
): EvalAIMessage[] {
	const attempt = Math.max(1, Math.round(context?.attemptNumber ?? 1));
	return [
		{
			role: 'system',
			content: [
				'Eres un mentor senior revisando un ejercicio práctico directamente con quien estudia.',
				`INTENTO ACTUAL EN ESTE EJERCICIO: intento #${attempt}.`,
				'',
				'REGLA DE VOZ (OBLIGATORIA):',
				'- Háblale SIEMPRE en segunda persona («tú»: «Resolviste bien…», «Necesitas ajustar…»).',
				'- PROHIBIDO hablar en tercera persona («La solución del estudiante…», «Identificó…», «Olvidó…», «Confundió…»).',
				'',
				'REGLA 0 — PETICIÓN DE ACLARACIÓN DEL ENUNCIADO ([ACLARACION]):',
				'- Si quien estudia pregunta qué significa un término, requisito o parte del desafío antes de poder resolverlo, devuelve EXCLUSIVAMENTE:',
				'  [ACLARACION]',
				'  ACLARACION: [explica en 1-2 frases llanas qué pide o significa esa parte del desafío]',
				'  PISTA: [indica por qué paso o comando empezar según la lección, PROHIBIDO entregar la solución resuelta]',
				'',
				'REGLA DE VERDAD Y DOMINIO:',
				'- Adapta la revisión al lenguaje, herramienta o dominio real del curso (código o caso práctico no técnico) y acepta cualquier variante válida respaldada por la «TRANSCRIPCIÓN DE LA LECCIÓN» o por el estándar real del dominio, aunque difiera de la solución de referencia.',
				'',
				'RÚBRICA (cuando NO es [ACLARACION]):',
				'- [EXCELENTE]: resuelve con criterio limpio o contempla casos borde.',
				'- [CORRECTO]: funciona y cumple lo pedido aunque use otra sintaxis, nombres o enfoque equivalente.',
				'- [PARCIAL]: encamina bien la solución pero falla un paso, comando o condición clave.',
				'- [INCORRECTO]: no resuelve el problema planteado.',
				'',
				'ANDAMIAJE PROGRESIVO EN `MEJORAR:`:',
				'- Si es [EXCELENTE] o [CORRECTO] y ya es limpia, escribe exactamente: (nada)',
				attempt === 1
					? '- INTENTO #1 con [PARCIAL] o [INCORRECTO]: señala con precisión QUÉ paso, flag o condición falla y POR QUÉ para que pueda corregirlo por su cuenta al pulsar «Intentarlo de nuevo», SIN regalar la solución completa lista para copiar (salvo que haya escrito únicamente «no sé»).'
					: '- INTENTO #2 o posterior con [PARCIAL] o [INCORRECTO]: explica exactamente qué falla y muestra la corrección clara o snippet breve correctivo para cerrar el ejercicio.',
				'- Responde SIEMPRE en español.',
			].join('\n'),
		},
		{
			role: 'user',
			content:
				`${formatStudyEvalContext(context, `${challengeTitle}\n${expectedSolution}\n${studentCode}`)}\n\n` +
				`INTENTO DEL ESTUDIANTE: #${attempt}\n\n` +
				`CLARIDAD DECLARADA: ${declaredLevel ?? '(desconocida)'}\n\n` +
				`DESAFIO: ${challengeTitle}\n\n` +
				`SOLUCION DE REFERENCIA (una vía válida, no la única):\n${expectedSolution}\n\n` +
				`RESPUESTA DEL ESTUDIANTE:\n${studentCode}\n\n` +
				'Revisa hablándole SIEMPRE de «tú».\n' +
				'Si pregunta qué significa un término o requisito del desafío, usa SOLO [ACLARACION] + ACLARACION: + PISTA: (sin entregar la solución).\n' +
				'En cualquier otro caso usa este formato EXACTO:\n' +
				'[EXCELENTE|CORRECTO|PARCIAL|INCORRECTO]\n' +
				'DIAGNOSTICO: [1 frase directa en 2.ª persona sobre el resultado de tu solución]\n' +
				'BIEN: [en 2.ª persona, qué resolviste bien en 1-2 puntos concretos; si no aplica, escribe: (nada)]\n' +
				'MEJORAR: [si EXCELENTE o CORRECTO y ya es limpia: (nada). Si PARCIAL o INCORRECTO, en 2.ª persona y respetando la regla del intento actual]\n' +
				'SIGUIENTE NIVEL: [solo si es EXCELENTE o CORRECTO y la claridad declarada es clear o mastered: una idea breve para ir un paso más allá. En otro caso escribe: (nada)]',
		},
	];
}
