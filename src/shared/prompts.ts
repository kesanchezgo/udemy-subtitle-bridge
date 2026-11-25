/**
 * Prompt builders compartidos entre la extensión (background.ts) y los
 * scripts de QA (scripts/prompt-harness.mjs, scripts/prompt-inspect.mjs).
 *
 * Viven en un módulo aparte, sin dependencias de chrome ni de Vite, para que
 * Node pueda importar el archivo .ts directamente (type stripping nativo) y
 * los tests ejerzan EXACTAMENTE los mismos prompts que se envían en producción.
 * Cualquier cambio de prompt debe hacerse aquí, nunca en un espejo.
 *
 * Solo sintaxis TS "erasable" (types + funciones): sin enums, namespaces ni
 * transformaciones que el type stripping de Node no soporte.
 */

export type SrtBlock = {
	index: number;
	timeLine: string;
	text: string;
};

/**
 * Contexto del programa (career track) para los prompts de IA: el programa
 * marca la dirección de aprendizaje; el curso actual es un paso de esa ruta.
 * Opcional — Udemy no tiene programa.
 */
export type AiProgramContext = {
	title: string;
	position?: number;
	total?: number;
	description?: string;
};

export type StudyMetadata = {
	lectureKey: string;
	courseSlug: string;
	lectureId: string;
	courseName?: string;
	courseDescription?: string;
	lessonName?: string;
	objective?: string;
	cueCount?: number;
	transcriptTruncated?: boolean;
	platform?: string;
	program?: AiProgramContext;
	/**
	 * Fase 4: tarjetas que YA están en el mazo (de Anki si está conectado; si
	 * no, de lo exportado según el historial), con un id corto: las de este
	 * curso y, con `course`, las de otro curso suyo. La IA no les crea tarjeta y
	 * dice cuáles son en "inDeck" (solo con estos ids).
	 */
	deckIdeas?: { ref: string; text: string; lesson?: string; course?: string }[];
};

/** Fase 4: cuántas tarjetas del mazo viajan al prompt como mucho. */
export const DECK_IDEAS_LIMIT = 40;

/**
 * Fase 4: las tarjetas del mazo que llegan del dock (ids m1…m40), saneadas en
 * el service worker antes de ir al prompt.
 */
export function sanitizeDeckIdeas(raw: unknown): { ref: string; text: string; lesson: string; course?: string }[] {
	if (!Array.isArray(raw)) return [];
	const out: { ref: string; text: string; lesson: string; course?: string }[] = [];
	const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
	for (const item of raw.slice(0, DECK_IDEAS_LIMIT)) {
		const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
		const ref = String(r.ref ?? '').trim();
		const text = clean(r.text, 240);
		if (!/^m\d{1,3}$/.test(ref) || !text || out.some((o) => o.ref === ref)) continue;
		const course = clean(r.course, 120);
		out.push({ ref, text, lesson: clean(r.lesson, 120), ...(course ? { course } : {}) });
	}
	return out;
}

export function formatOriginalSrtBlocks(blocks: SrtBlock[]) {
	return blocks
		.map((block) => `${block.index}\n${block.timeLine}\n${block.text}`)
		.join('\n\n');
}

/**
 * Cuántas ideas clave puede tener la lección según su densidad. Es un RANGO:
 * la IA elige dentro de él según lo que la lección realmente enseña (una
 * lección corta puede ser densa y una larga, repetitiva). El tamaño de
 * Comprobar sale de aquí (una pregunta por idea, ver services/checkPlan.ts),
 * así que este rango es también el que escala la comprobación con la lección.
 */
export function keyConceptRange(transcriptText: string, cueCount?: number): { min: number; max: number } {
	const target = estimateAnkiCardTarget(transcriptText, cueCount);
	// Invariante: 1 tarjeta por idea como mínimo (ideas máx ≤ tarjetas máx).
	// En lecciones cortas (hasta ~5 min) las ideas se quedan en 3-4: bajar el
	// presupuesto de tarjetas NO reduce lo que la sesión analiza.
	if (target.max <= 3) return { min: 2, max: 3 };
	if (target.max <= 4) return { min: 3, max: 4 };
	if (target.max <= 6) return { min: 4, max: 5 };
	return { min: 5, max: 7 };
}

/**
 * Objetivo de cantidad de tarjetas Anki según la densidad de la lección.
 * Una lección corta no debe inflarse con tarjetas de relleno. Siempre cabe
 * al menos una tarjeta por idea clave (max ≥ ideas máx. del mismo rango).
 */
export function estimateAnkiCardTarget(transcriptText: string, cueCount?: number) {
	const chars = transcriptText.trim().length;
	const cues = typeof cueCount === 'number' && Number.isFinite(cueCount) ? cueCount : 0;
	// Umbrales calibrados con lecciones reales (≈850 chars y ≈11 cues por minuto
	// en los vídeos de DataCamp): hasta ~2,5 min → 2-3 tarjetas; hasta ~5 min →
	// 3-4; después escala. Las IDEAS clave de esas lecciones siguen siendo 3-4
	// (ver keyConceptRange): se recorta la tarjeta de relleno, no la cobertura.
	if (chars < 2200 || cues > 0 && cues < 27) return { min: 2, max: 3, label: 'leccion muy corta' };
	if (chars < 4300 || cues > 0 && cues < 55) return { min: 3, max: 4, label: 'leccion corta' };
	if (chars < 8000 || cues > 0 && cues < 110) return { min: 4, max: 5, label: 'leccion breve con pocos conceptos' };
	if (chars < 12000 || cues > 0 && cues < 180) return { min: 5, max: 6, label: 'leccion normal' };
	return { min: 6, max: 8, label: 'leccion larga o densa' };
}

/**
 * Qué pide una pregunta, en palabras de tarea. El nivel de Bloom tal cual
 * («recordar», «aplicar») se confundía con los pasos Recordar y Aplicar.
 */
export function bloomTaskLabel(bloom: string): string {
	const key = String(bloom || '').trim().toLowerCase();
	const labels: Record<string, string> = {
		recordar: 'definir', comprender: 'explicar', aplicar: 'usar en un caso',
		analizar: 'analizar', evaluar: 'valorar', crear: 'proponer',
	};
	return labels[key] ?? key;
}

export function buildSrtTranslationPrompt(blocks: SrtBlock[]): string {
	return [
		'Actúa como traductor experto para cursos online.',
		'Traduce este SRT de inglés a español latino neutro.',
		'',
		'REGLAS OBLIGATORIAS:',
		'1. Devuelve SOLO SRT plano. Sin markdown, sin explicaciones, sin comentarios.',
		'2. Conserva exactamente los números de bloque y los timestamps. No unas, no dividas, no reordenes bloques y conserva los saltos de línea internos de cada bloque.',
		'3. Traduce solo el texto del subtítulo.',
		'4. Mantén términos técnicos, nombres propios, marcas, comandos, APIs, librerías y palabras clave en inglés cuando sea más claro.',
		'5. Los nombres de personas que aparecen como etiqueta de hablante ("Dheeru:", "Instructor:") se conservan tal cual, seguidos de dos puntos.',
		'6. Los marcadores de sonido entre paréntesis se traducen de forma natural: "(music)" → "(música)".',
		'7. No generes feedback de estudio, porcentajes, BIEN/FALTO/PROFUNDIZACIÓN ni evaluaciones.',
		`8. IMPORTANTE: El SRT tiene exactamente ${blocks.length} bloques. Tu respuesta debe tener exactamente ${blocks.length} bloques traducidos, cada uno empezando con su mismo número.`,
		'',
		'EJEMPLO DE FORMATO (muestra el formato esperado; no copies su contenido):',
		'ENTRADA:',
		'3',
		'00:00:03,090 --> 00:00:05,610',
		'This is Dheeru Mundluru and welcome back.',
		'SALIDA:',
		'3',
		'00:00:03,090 --> 00:00:05,610',
		'Este es Dheeru Mundluru y bienvenidos de vuelta.',
		'',
		'SRT EN:',
		formatOriginalSrtBlocks(blocks),
	].join('\n');
}

export function buildObjectivesPrompt(
	courseName: string,
	description: string,
	options: { platform?: string; program?: AiProgramContext } = {},
): string {
	const program = options.program;
	return [
		'Eres un asesor pedagógico para estudiantes de cursos online.',
		'Genera 4 objetivos de aprendizaje concretos y motivantes para el siguiente curso.',
		...(options.platform ? [`PLATAFORMA: ${options.platform}`] : []),
		...(program ? [
			`PROGRAMA: ${program.title}${program.position && program.total ? ` — curso ${program.position} de ${program.total}` : ''}`,
			...(program.description ? [`DESCRIPCIÓN DEL PROGRAMA: ${program.description}`] : []),
		] : []),
		'',
		'FORMATO DE SALIDA (CRÍTICO):',
		'- Responde EXCLUSIVAMENTE con un array JSON válido.',
		'- NO uses bloques de código markdown (sin ``` ni ```json).',
		'- NO añadas texto antes ni después del array.',
		'- NO incluyas comentarios dentro del JSON.',
		'- NO uses comillas dobles dentro de los valores del JSON; si necesitas citar algo, usa « » o nada.',
		'',
		'ESQUEMA EXACTO:',
		'[',
		'  {"id":"slug-en-minusculas","icon":"🚀","title":"Texto corto","sub":"clarificador"},',
		'  {"id":"slug-2","icon":"🎯","title":"...","sub":"..."},',
		'  {"id":"slug-3","icon":"🛠️","title":"...","sub":"..."},',
		'  {"id":"slug-4","icon":"🏆","title":"...","sub":"..."}',
		']',
		'',
		'REGLAS DE CONTENIDO:',
		'- id: minúsculas-con-guiones (ej: "entrevista-spring", "cert-oracle"); 4-40 chars.',
		'- icon: UN solo emoji, sin texto.',
		'- title: máximo 35 caracteres.',
		'- sub: máximo 40 caracteres, frase clarificadora.',
		'- Varía el verbo inicial entre los 4 objetivos; no empieces todos con el mismo verbo.',
		'- Los 4 objetivos deben salir del curso y su descripción, no de plantillas fijas.',
		'- Cubre 4 motivaciones naturalmente distintas para ESTE curso: aplicación práctica, dominio conceptual, meta profesional, creación/producción, evaluación/certificación, entrevista, portafolio, mejora personal u otra que encaje.',
		'- NO fuerces entrevista, certificación o proyecto si el curso no lo justifica.',
		'- Si el curso no es técnico o no es de código, adapta los objetivos al dominio real del curso.',
		'- Usa solo los datos proporcionados. No inventes detalles externos del curso.',
		...(program ? ['- Al menos 2 de los 4 objetivos deben encajar con la dirección del PROGRAMA al que pertenece el curso.'] : []),
		'- Personalízalos al curso específico, no genérico.',
		'',
		`Curso: ${courseName}`,
		`Descripción: ${description || '(sin descripción)'}`,
		'',
		'Genera AHORA el array JSON (4 objetos, sin texto adicional):',
	].join('\n');
}

export type RefineOptions = {
	platform?: string;
	program?: AiProgramContext;
	/** Variantes YA mostradas para este mismo texto: no repetir ni reformular. */
	previousVariants?: string[];
};

export function buildRefinePrompt(
	courseName: string,
	description: string,
	rawGoal: string,
	options: RefineOptions = {},
): string {
	const previous = (options.previousVariants ?? []).filter((v) => v.trim());
	return [
		'Eres un coach pedagógico para estudiantes de cursos online.',
		'Convierte el objetivo libre del estudiante en un objetivo de aprendizaje personalizado y de alta calidad.',
		'Debe mantener la intención original del estudiante y adaptarse al curso real.',
		'',
		'CRITERIOS:',
		'- Resultado observable: que el estudiante pueda notar si avanzó.',
		'- Acción concreta: aprender, aplicar, crear, aprobar, explicar, resolver, mejorar, practicar, etc.',
		'- Contexto del curso: usa el nombre y descripción; no inventes datos externos.',
		'- EL TEXTO DEL ESTUDIANTE MANDA sobre el curso: si pide un alcance más amplio (p. ej. «no solo X, también Y»), la variante debe cubrir ese alcance completo; NO lo centres en X solo porque el curso se llame así.',
		'- No fuerces entrevista, certificación, proyecto o código si no encaja con el objetivo o el curso.',
		'- Si el objetivo ya es concreto y de alta calidad, devuélvelo pulido en redacción sin traicionar su intención.',
		'- Tono motivador, profesional y específico; evita frases genéricas tipo "aprender el curso".',
		...(options.platform ? [`PLATAFORMA: ${options.platform}`] : []),
		...(options.program ? [
			`PROGRAMA: ${options.program.title}${options.program.position && options.program.total ? ` — curso ${options.program.position} de ${options.program.total}` : ''}`,
			...(options.program.description ? [`DESCRIPCIÓN DEL PROGRAMA: ${options.program.description}`] : []),
			'- El objetivo debe encajar con la dirección del PROGRAMA al que pertenece el curso.',
		] : []),
		...(previous.length > 0 ? [
			'',
			'VARIANTES YA MOSTRADAS (PROHIBIDO repetirlas o reformularlas mínimamente):',
			...previous.map((v) => `- "${v}"`),
			'- Da una variante con un ÁNGULO claramente DISTINTO de las anteriores (otro énfasis: aplicaciones prácticas, fundamentos, entrevistas, integraciones, proyectos, arquitectura, evaluación…).',
		] : []),
		'',
		'FORMATO:',
		'- Devuelve SOLO una frase.',
		'- Sin comillas, sin explicaciones, sin markdown.',
		'- Máximo 95 caracteres.',
		'',
		'EJEMPLOS (variedad de dominios):',
		'- Java + "quiero trabajar como backend" → "Dominar Java y Spring Boot para construir APIs REST y conseguir trabajo backend."',
		'- Fotografía + "quiero hacer retratos que vendan" → "Crear retratos comerciales aplicando composición e iluminación del curso."',
		'- Cocina + "quiero hacer pasta como un chef" → "Preparar pasta fresca auténtica usando las técnicas tradicionales del curso."',
		'- Marketing + "quiero más clientes" → "Aplicar estrategias de marketing del curso para atraer y convertir clientes."',
		'',
		`Curso: ${courseName}`,
		`Descripción: ${description || '(sin descripción)'}`,
		`Objetivo del estudiante: "${rawGoal.trim()}"`,
		'Objetivo refinado:',
	].join('\n');
}

export function buildStudyPrompt(transcriptText: string, metadata: StudyMetadata) {
	const cardTarget = estimateAnkiCardTarget(transcriptText, metadata.cueCount);
	const ideas = keyConceptRange(transcriptText, metadata.cueCount);
	const deck = (metadata.deckIdeas ?? []).filter((d) => d && d.ref && d.text).slice(0, DECK_IDEAS_LIMIT);
	const hasDeck = deck.length > 0;
	return [
		'Eres un diseñador instruccional experto para cursos online.',
		'Genera una sesión de estudio adaptada al curso, la lección actual y el objetivo del estudiante.',
		'No asumas que el curso es de programación. Si es técnico, usa su lenguaje/framework real; si no lo es, crea ejercicios prácticos del dominio correspondiente.',
		'Usa esta prioridad pedagogica: 1) la transcripción es la fuente de verdad; 2) el objetivo del estudiante define el ángulo, dificultad y distribución; 3) el curso/descripción y el programa aportan contexto; 4) no inventes contenido para satisfacer el objetivo.',
		'',
		`CURSO: ${metadata.courseName || metadata.courseSlug || 'Curso online'}`,
		`DESCRIPCIÓN DEL CURSO: ${metadata.courseDescription || '(sin descripción)'}`,
		`LECCIÓN: ${metadata.lessonName || metadata.lectureId || 'Desconocida'}`,
		`OBJETIVO DEL ESTUDIANTE: ${metadata.objective || 'Dominar la lección y aplicarla correctamente'}`,
		...(metadata.platform ? [`PLATAFORMA: ${metadata.platform}`] : []),
		...(metadata.program ? [
			`PROGRAMA: ${metadata.program.title}${metadata.program.position && metadata.program.total ? ` — curso ${metadata.program.position} de ${metadata.program.total}` : ''}`,
			...(metadata.program.description ? [`DESCRIPCIÓN DEL PROGRAMA: ${metadata.program.description}`] : []),
			'El programa marca la dirección de aprendizaje del estudiante: objetivos, preguntas y ejercicios deben encajar con esa ruta; el curso actual es un paso de ella.',
		] : []),
		`DENSIDAD DE LA LECCIÓN: ${cardTarget.label}; transcripción ${transcriptText.length} caracteres; cues ${metadata.cueCount ?? 'desconocidos'}; truncada: ${metadata.transcriptTruncated ? 'sí' : 'no'}`,
		`IDEAS CLAVE ESPERABLES: ${ideas.min}-${ideas.max}`,
		`CANTIDAD RECOMENDADA DE ANKI: ${cardTarget.min}-${cardTarget.max} tarjetas`,
		'',
		'TRANSCRIPCIÓN (O TEXTO) DE LA LECCIÓN:',
		transcriptText.slice(0, 18000),
		'',
		...(hasDeck ? [
			'IDEAS QUE YA ESTÁN EN SU MAZO (tarjetas que ya repasa en Anki · id · «idea» — tarjeta · lección; si es de otro curso suyo, también el curso):',
			...deck.map((d) => `- ${d.ref} · ${d.text}${d.lesson ? ` · lección «${d.lesson}»` : ''}${d.course ? ` del curso «${d.course}»` : ''}`),
			'',
		] : []),
		'Genera un JSON VÁLIDO (sin markdown, sin ```json) con esta estructura EXACTA:',
		'{',
		'  "relevance": { "score": 85, "reason": "explicación breve" },',
		'  "keyConcepts": ["Título breve — la idea en una oración", "Título — idea 2", "..."],',
		'  "questions": [',
		'    { "q": "pregunta", "bloom": "comprender|aplicar|analizar|evaluar", "difficulty": "confused|partial|clear|mastered", "conceptRefs": [0], "hint": "pista", "answer": "respuesta ideal" }',
		'  ],',
		'  "application": {',
		'    "isCode": true,',
		'    "setup": "contexto del ejercicio práctico",',
		'    "challenge": "la instrucción del ejercicio en una frase",',
		'    "solution": "solución explicada",',
		'    "practice": { "format": "completar|ordenar|predecir|error|decidir", "language": "python", "body": "…", "blanks": [{ "accept": ["…"], "hint": "…", "options": ["…", "…", "…"] }], "steps": ["…"], "options": ["…"], "answerIndex": 0, "lines": ["…"], "errorLine": 0, "fixedLine": "…", "explanation": "por qué la correcta lo es" }',
		'  },',
		'  "interviewQ": { "q": "pregunta oral/de cierre", "idealAnswer": "estructura ideal de respuesta" },',
		'  "nextAction": "una acción concreta para usar lo aprendido en algo propio",',
		...(hasDeck ? ['  "inDeck": [{ "idea": 0, "ref": "m1" }],'] : []),
		'  "ankiCards": [',
		'    { "id": "card-001", "type": "concepto|aplicacion|codigo|entrevista|comparacion|proceso", "conceptRefs": [0], "front": "pregunta clara (HTML simple)", "back": "respuesta estructurada (HTML del vocabulario permitido)", "tags": ["tag1", "tag2"] }',
		'  ]',
		'}',
		'',
		'REGLAS:',
		'FILTRO DE CONOCIMIENTO TRANSFERIBLE (aplica a keyConcepts, questions y ankiCards — «Regla de los 6 meses»):',
		'- Cada keyConcept, pregunta y tarjeta debe enseñar conocimiento del dominio reutilizable fuera del curso (mecanismos, criterios de ingeniería, trade-offs, sintaxis/APIs reales, decisiones de producción o gobernanza del ecosistema).',
		'- PROHIBIDO convertir en keyConcepts, questions o ankiCards logística efímera o meta-información del curso: cómo se llama el proyecto de juguete/ejemplo del curso (p. ej. «Release Tracker», «TodoApp»), anuncios del temario («qué veremos en futuros capítulos»), lista arbitraria de programas/editores a instalar para seguir la clase, biografía del instructor o avisos administrativos. Esos datos contextuales solo pueden mencionarse brevemente en "summary", nunca como ideas clave, preguntas ni tarjetas.',
		'- Excepción para lecciones introductorias, de bienvenida, setup o cierre: si gran parte del vídeo es logístico, extrae únicamente los principios o decisiones transferibles que sí se expliquen (p. ej., por qué fijar una versión anterior del runtime en producción cuando los drivers aún no soportan la última, en lugar de «qué versión usa el curso») y formúlalos de manera universal (sin «en este curso…»). Si solo hay 1 o 2 ideas transferibles reales en toda la lección, quédate en 2 keyConcepts (o 1-2 tarjetas reales) en vez de rellenar con logística del curso.',
		'- "relevance.score" es un entero 0-100 que mide qué tan útil es ESTA lección para el objetivo del estudiante; "reason" lo justifica en una frase.',
		`- Genera entre ${ideas.min} y ${ideas.max} keyConcepts: las ideas centrales que la lección realmente enseña. Elige el número por el contenido, no por el tiempo: no rellenes, no partas una idea en dos y no dejes fuera una idea central. El índice de cada idea (0, 1, 2…) se usa en conceptRefs.`,
		'- Cada keyConcept tiene la forma «Título — detalle» (separados por « — »). El título (4-12 palabras, formulado como pregunta directa con ¿…?) plantea una pregunta concreta y autocontenida que obligue a recordar la idea sin revelar la respuesta (p. ej. «¿Qué genera javac al compilar?», nunca un sustantivo suelto como «Portabilidad» ni frases incompletas como «Por qué no es lento»). El detalle es la respuesta clara y autoexplicativa en 1-2 oraciones concisas (qué es + por qué importa o cómo actúa), para que al destaparlo en Recordar el estudiante consolide el mecanismo y no solo una etiqueta.',
		'- questions: UNA pregunta por cada keyConcept, en el mismo orden (la pregunta i evalúa la idea i y su conceptRefs empieza por i), MÁS una pregunta final de síntesis que combine 2-3 ideas. Total = número de keyConcepts + 1. Ninguna idea puede quedar sin pregunta.',
		'- difficulty: la de síntesis es "mastered". Las de cada idea van de "confused" (recordar o definir) a "partial" (explicar) o "clear" (aplicar o analizar) según lo que exija esa idea. Incluye al menos una "confused" y, si hay 3 o más ideas, al menos una "partial" y una "clear".',
		'- conceptRefs de preguntas y tarjetas: 1-3 índices VÁLIDOS de keyConcepts (de 0 al número de ideas menos 1).',
		hasDeck
			? '- ankiCards: al menos una tarjeta por keyConcept que NO esté en inDeck (todas las ideas nuevas cubiertas). Si generas más ideas que el mínimo de tarjetas, sube las tarjetas hasta cubrirlas. Las ideas de inDeck no llevan tarjeta y no cuentan para la cantidad recomendada: no rellenes.'
			: '- ankiCards: al menos una tarjeta por keyConcept (todas las ideas cubiertas). Si generas más ideas que el mínimo de tarjetas, sube las tarjetas hasta cubrirlas.',
		...(hasDeck ? [
			'- inDeck: si una keyConcept es la MISMA idea que una de «IDEAS QUE YA ESTÁN EN SU MAZO» (la tarjeta existente ya obliga a recordar exactamente eso, aunque esté redactada distinto), mantenla en keyConcepts y en questions (se practica igual en la sesión), NO generes ninguna ankiCard para ella y añade {"idea": <índice en keyConcepts>, "ref": "<id de la lista>"} a "inDeck".',
			'- Misma idea = misma respuesta esperada. Un tema relacionado, un caso más avanzado, otro aspecto del mismo concepto o una idea que solo comparte términos NO es la misma: esa sí lleva su tarjeta. Una tarjeta de OTRO curso solo cuenta si su respuesta vale tal cual en esta lección (mismo dominio y mismo sentido). En la duda, NO la pongas en inDeck. Usa SOLO ids de la lista, cada id una vez; si ninguna coincide, "inDeck": [].',
		] : []),
		'- Las preguntas deben enfocarse en verificar comprension aplicable, no repetir literalmente el subtitulo.',
		'- Diseño de `questions` (PROHIBIDO el inventario mecánico): no preguntes listas exhaustivas de memoria bruta como «¿qué archivos y carpetas genera el comando X?» o «enumera todas las opciones de Y». Pregunta por el PROPÓSITO, mecanismo o diferencia de responsabilidad entre las piezas clave explicadas en la lección (p. ej., qué papel cumple `.python-version` frente a `pyproject.toml` al iniciar un proyecto con `uv init`). Si una pregunta requiere mencionar 2-3 artefactos concretos, `answer` y `hint` DEBEN incluir TODOS los que el instructor mostró o mencionó en la transcripción para ese punto (sin omitir ninguno que dejaría desprotegido al evaluador).',
		'- Claridad léxica en `questions` (PROHIBIDA la jerga sintética no enseñada): formula cada `q` y `hint` con verbos y palabras llanas, concretas y observables. SOLO uses un término técnico especializado en el enunciado si ese término exacto se explicó en la transcripción o es el concepto mismo evaluado; PROHIBIDO inventar sustantivos abstractos o académicos (p. ej., NO preguntes «¿qué diferencia hay en la resolución del intérprete?» ni «¿cómo opera la orquestación del entorno?» si en clase simplemente se mostró qué Python se ejecuta al activar `.venv` frente a `uv run`: pregunta «¿cómo decide la terminal qué versión de Python ejecutar en cada caso y qué cambia en tu sesión?»).',
		'- Subtítulos automáticos (ASR): la transcripción en inglés puede contener transcripciones fonéticas sin puntuación de comandos, rutas o archivos con punto/guion (p. ej., «Python version» cuando en terminal muestra `.python-version`, «pie project dot toml» por `pyproject.toml`, «git ignore» por `.gitignore`). Reconstruye siempre el identificador técnico real del ecosistema en `keyConcepts`, `questions`, `answer` y `ankiCards`.',
		'- Usa el objetivo para decidir el enfoque de preguntas y tarjetas. Ejemplo: si el objetivo es entrevista, favorece explicación oral, comparaciones, trade-offs y preguntas tipo entrevista, PERO solo cuando se justifiquen desde la transcripción.',
		`- Genera entre ${cardTarget.min} y ${cardTarget.max} tarjetas Anki útiles y específicas de la lección. No rellenes por cantidad: una lección corta debe tener pocas tarjetas de alta calidad; una lección densa puede tener más.`,
		'- Cada tarjeta Anki debe ser atómica: una sola idea evaluable por tarjeta. Evita duplicados, preguntas vagas y respuestas enciclopédicas.',
		'- No repitas la MISMA idea en dos tarjetas desde ángulos distintos (p. ej. «qué controla X» y «qué implica X»): si dos tarjetas comparten concepto, FUSÍONALAS en una sola atómica.',
		'',
		'PRINCIPIOS DE REPETICIÓN ESPACIADA (estas tarjetas van a Anki):',
		'- Autocontenido: cada tarjeta debe entenderse FUERA de contexto; incluye el mínimo necesario para saber de qué habla (nombre de la clase, función o concepto).',
		'- Recall activo: el front debe obligar a recuperar la información (definir, predecir la salida, producir, comparar). Prohibidas las preguntas de sí/no y el reconocimiento trivial.',
		'- Sin solapes: si dos tarjetas comparten la mayor parte de su contenido, fusiónalas en una sola. Cada dato vive en UNA tarjeta.',
		'- Orientado al objetivo: genera tarjetas de lo que sirve para el OBJETIVO del estudiante; una idea ajena al objetivo no merece tarjeta.',
		'',
		'FORMATO HTML DE LAS TARJETAS ANKI:',
		'- La plantilla de Anki ya pone el marco visual (barra terminal, píldora de tipo, tipografía, resaltado de código). front y back aportan SOLO el HTML interno.',
		'- FRONT: la pregunta en 1-2 líneas, texto plano o con <code> inline, 100 % universal y autocontenida (PROHIBIDO escribir «en esta lección», «en este curso» o «según el instructor»). Si la tarjeta pide completar o predecir código, incluye el bloque de código en el front. NUNCA incluyas la respuesta en el front.',
		'- BACK: primera línea = respuesta directa con el término clave en <b>; después máximo 2-3 bloques breves de apoyo con el mecanismo o criterio universal (PROHIBIDO atar la respuesta a «en la lección se usa…» o al proyecto de juguete del curso).',
		'- Bloques de código SOLO así: <pre><code class="language-LENGUAJE">código</code></pre>. Usa el lenguaje REAL del curso (no siempre java): válidos language-markup, language-css, language-javascript, language-typescript, language-jsx, language-tsx, language-python, language-java, language-kotlin, language-csharp, language-c, language-cpp, language-go, language-php, language-ruby, language-bash, language-powershell, language-sql, language-json, language-yaml, language-properties, language-docker (viajan embebidos en el .apkg, funcionan sin conexión). Nunca código suelto fuera de <pre><code>.',
		'- Vocabulario HTML permitido en back (solo este): <p>, <b>, <em>, <code>, <pre><code>, <ul>/<ol>/<li>, <table>/<tr>/<th>/<td>, <blockquote>, <details>/<summary>, y los callouts <div class="concept-box">, <div class="tip-box">, <div class="warning-box">, <div class="interview-box"> (este último con <div class="label">Título</div> como primera línea).',
		'- type="codigo" → back con el código solución en <pre><code class="language-LENGUAJE_REAL"> (el lenguaje del curso, de la lista de arriba) seguido de 1-2 líneas de explicación.',
		'- type="comparacion" → A3 (info mínima): el FRONT pregunta por UNA dimensión discriminante («¿Cuándo compila el JIT frente al AOT y qué gana cada uno?»). El back abre con 1-2 líneas que responden esa dimensión; la tabla queda como apoyo con 3 filas como máximo.',
		'- type="proceso" → A3 (info mínima): 4 pasos como máximo. Si el proceso tiene más, el front pregunta por el paso que falta o el que sigue («Después de X, ¿qué paso sigue y por qué?»). La secuencia completa en el back SOLO si tiene ≤4 pasos.',
		'- type="entrevista" → MÁXIMO 1 por lección. Back con <div class="interview-box"> que abra con <div class="label">Entrevista</div> y estructure la respuesta en 3-4 puntos.',
		'- Si el OBJETIVO DEL ESTUDIANTE menciona entrevistas, preparación de un puesto o conseguir trabajo (entrevista/interview/job/puesto/hiring), la sesión DEBE incluir EXACTAMENTE 1 tarjeta type="entrevista": CUENTA dentro del rango recomendado en lecciones cortas (2-4: usa el extremo superior para ella, no infla el total) y puede ir ADEMÁS del rango solo en lecciones de 5 o más. Su contenido sale de la transcripción, no de temas externos.',
		'- Añade "summary" al JSON: 3-5 frases que sinteticen la lección CON TUS PALABRAS, en español (síntesis generativa). No repitas las keyConcepts literalmente.',
		'- Añade "conceptTerms": 0-5 nombres canónicos en singular SOLO de conceptos técnicos o del dominio que ESTA lección explique o desarrolle de verdad. PROHIBIDO incluir tecnologías, librerías o temas que el instructor solo mencione de pasada como adelanto del temario futuro (en una lección introductoria sin conceptos técnicos explicados, usa [] o 1-2 reales). Serán conceptos enlazables entre cursos.',
		...(TIMED_TRANSCRIPT ? ['- Cada ankiCard lleva además "t": "mm:ss" — el minuto EXACTO marcado en la transcripción temporizada. Si no hay marca cerca, omítelo.'] : []),
		'- <details><summary> solo para matices opcionales; la respuesta principal NUNCA dentro de details.',
		'- PROHIBIDO: markdown (```), estilos inline (style=), clases distintas de las listadas, y prefijos tipo "CÓDIGO:" o "💻" al inicio del front o del back.',
		'- Usa type="aplicacion" para casos, decisiones, ejercicios de transferencia, práctica profesional o uso real que no sea código.',
		'- Usa type="codigo" solo si la lección realmente enseña código, comandos, APIs o sintaxis. Usa type="entrevista" solo si aporta valor para explicar el tema oralmente o para el objetivo del estudiante, y nunca para rellenar cantidad.',
		'- interviewQ representa una práctica oral/de cierre para consolidar la lección. Puede ser null si no aporta valor.',
		'- nextAction: una acción concreta de aplicación (probarlo en un proyecto, un ejemplo propio). Nada de «repasa tus apuntes» ni «relee la lección»: el estudio ocurre en la app y el repaso lo hace Anki.',
		'- Hazla de entrevista SOLO si el objetivo del estudiante, el curso o la lección lo justifican claramente. Si no, formula una explicación en voz alta, reflexión guiada o pregunta de transferencia del dominio.',
		'- Si el objetivo es entrevista pero la lección no contiene material entrevistable, genera una pregunta oral sobre lo que sí aparece en la transcripción, no sobre temas externos.',
		'- Las tags deben ser cortas, sin espacios, y reflejar curso/tema/tipo. No inventes tags genéricas si hay términos específicos en la transcripción.',
		'- application: UNA práctica que transfiera a un caso nuevo las ideas más útiles para el objetivo; en una lección densa, que integre 2-3 ideas en el mismo caso. No repitas ninguna pregunta de questions ni pidas recordar definiciones (eso ya lo hacen Comprobar y Anki).',
		'- application.isCode debe ser true solo si la lección realmente requiere código.',
		'- Si no es código, challenge debe ser un caso práctico, análisis, decisión o ejercicio aplicable.',
		'- application.practice: el MISMO ejercicio en un formato que Kinema corrige al instante, para CUALQUIER curso (programación, idiomas, cocina, negocio…). Elige el formato que mejor ejercite lo que enseña la lección:',
		'  · "completar": "body" con 1-3 huecos marcados [[1]], [[2]], [[3]] (en orden, cada uno una sola vez); "blanks"[i].accept = las respuestas válidas de ese hueco (incluye variantes equivalentes), "hint" = pista corta, "options" opcional = 3 opciones que incluyen la correcta. En código, el hueco es una palabra o expresión corta, nunca una línea entera.',
		'  · "ordenar": "steps" = 3-7 pasos (o líneas de código) EN EL ORDEN CORRECTO; Kinema los baraja. Usa "ordenar" SOLO cuando exista dependencia causal, temporal o sintáctica estricta donde intercambiar dos pasos invalide el resultado (pipeline, protocolo, algoritmo). PROHIBIDO usar "ordenar" para instalaciones de herramientas o checklists independientes cuyo orden real sea intercambiable; usa "decidir" o "completar".',
		'  · "predecir": «¿qué pasa si…?»: "body" = el código o la situación; "options" = 3 resultados posibles; "answerIndex" = índice (desde 0) del correcto.',
		'  · "error": "lines" = 3-12 líneas de código o pasos de un proceso con UN error; "errorLine" = índice (desde 0) de la línea mala; "fixedLine" = esa línea corregida.',
		'  · "decidir": "body" = un caso práctico; "options" = 3 enfoques plausibles; "answerIndex" = el mejor para ese caso.',
		'  · Incluye SOLO los campos del formato elegido, más "explanation" (1-2 frases: por qué la respuesta correcta lo es) y "language" (el lenguaje real, sin «language-») si hay código.',
		'  · Código: 12 líneas como máximo. NUNCA pidas escribir una clase, una función o un programa desde cero: da el código casi hecho y pide la pieza clave.',
		'  · Las opciones incorrectas son errores plausibles de quien no entendió la lección, no absurdos. challenge es la instrucción en una frase y solution la solución completa explicada (también para quien no ve el ejercicio interactivo).',
		'- Todo en español excepto términos técnicos, marcas, comandos, APIs, librerías o nombres propios que convenga mantener.',
		'- No inventes temas ajenos a la transcripción; si falta contexto, usa el curso/lección como guía.',
		'- Back de TODAS las tarjetas: la 1.ª línea RESPONDE la pregunta y la 2.ª da el porqué o el mecanismo (elaboración). El front nunca pide recordar una tabla o lista completa.',
		'- Responde SOLO con el JSON, sin texto adicional',
		'',
		'EJEMPLOS de nivel de calidad esperado (no copies su contenido, imita su precisión y atomicidad):',
		`
EJEMPLO A — lección técnica (Java/JVM):
{
  "summary": "La lección recorre el camino del código Java: javac lo compila a bytecode, la JVM de cada plataforma lo interpreta y el JIT traduce en caliente los hot spots a nativo. Ese reparto explica por qué el mismo .class corre en Windows y Linux sin recompilar, y por qué el rendimiento se acerca al nativo tras el warm-up.",
  "conceptTerms": ["bytecode", "JVM", "JIT"],
  "relevance": {"score": 92, "reason": "La lección explica el mecanismo central de portabilidad de Java, directamente útil para entrevistas backend."},
  "keyConcepts": ["¿Qué genera javac al compilar? — javac compila el fuente a bytecode, no a código nativo", "¿Quién lee y ejecuta el bytecode? — la JVM de cada plataforma interpreta el bytecode", "¿Por qué Java logra velocidad casi nativa? — el JIT compila los hot spots a nativo en runtime", "¿Por qué un .class corre sin recompilar? — un .class corre donde exista una JVM, sin recompilar"],
  "questions": [
    {"q": "¿Qué archivo genera exactamente javac a partir del código fuente?", "bloom": "comprender", "difficulty": "confused", "conceptRefs": [0], "hint": "No es un .exe; es un formato intermedio", "answer": "Un archivo .class con bytecode"},
    {"q": "¿Qué componente ejecuta el bytecode en cada sistema operativo?", "bloom": "comprender", "difficulty": "partial", "conceptRefs": [1], "hint": "Es específico de cada plataforma", "answer": "La JVM instalada en esa plataforma, que lo interpreta"},
    {"q": "Si Java interpreta bytecode, ¿por qué no es lento como un intérprete puro?", "bloom": "analizar", "difficulty": "clear", "conceptRefs": [2], "hint": "Parte del código se transforma durante la ejecución", "answer": "El JIT detecta hot spots y los compila a código nativo, cacheando y reutilizando el resultado"},
    {"q": "¿Por qué el mismo .class puede correr en Windows y Linux sin recompilar?", "bloom": "aplicar", "difficulty": "partial", "conceptRefs": [3, 1], "hint": "Algo específico de la plataforma hace el trabajo", "answer": "La JVM de cada plataforma interpreta el mismo bytecode"},
    {"q": "Un compañero dice que Java es más lento que C++ para todo. Evalúa esa afirmación.", "bloom": "evaluar", "difficulty": "mastered", "conceptRefs": [1, 2, 3], "hint": "Depende del workload y del JIT", "answer": "En picos cálidos el JIT acerca el rendimiento a nativo; C++ sigue ganando en latencia predecible y control de memoria. La afirmación es una simplificación."}
  ],
  "application": {"isCode": true, "setup": "Compilas App.java en tu laptop y quieres ejecutarlo en un servidor Linux con otra JVM", "challenge": "Completa los dos comandos que faltan para ejecutarlo en el servidor sin recompilar", "solution": "javac App.java genera App.class en la laptop; en el servidor basta java App, porque su JVM interpreta el mismo bytecode", "practice": {"format": "completar", "language": "bash", "body": "[[1]] App.java        # en la laptop: genera App.class\\nscp App.class servidor:~/\\nssh servidor [[2]] App  # sin recompilar", "blanks": [{"accept": ["javac"], "hint": "el compilador", "options": ["javac", "java", "jar"]}, {"accept": ["java"], "hint": "lanza la JVM", "options": ["javac", "java", "jvm"]}], "explanation": "javac compila una vez a bytecode; en el servidor, java arranca su JVM, que interpreta ese mismo .class."}},
  "interviewQ": {"q": "Explica en un minuto cómo Java logra independencia de plataforma sin perder velocidad.", "idealAnswer": "Dos capas: compilación a bytecode (portabilidad) + JVM con JIT (velocidad). Mencionar write-once-run-anywhere y warm-up."},
  "nextAction": "Ejecuta tu app con -XX:+PrintCompilation y observa el JIT en acción",
  "ankiCards": [
    {"id": "card-001", "type": "concepto", "conceptRefs": [0], "front": "¿Qué produce <code>javac</code> a partir del código fuente?", "back": "<p><b>Bytecode</b> en archivos <code>.class</code>, no código máquina nativo.</p><div class='concept-box'>El bytecode es un formato intermedio: solo la JVM puede ejecutarlo.</div>", "tags": ["java", "compilacion"]},
    {"id": "card-002", "type": "codigo", "conceptRefs": [1, 3], "front": "¿Qué comando ejecuta <code>App.class</code> en cualquier máquina con JVM?", "back": "<p><b><code>java App</code></b>: la JVM de esa máquina carga e interpreta el bytecode, sin recompilar.</p><pre><code class='language-bash'>javac App.java   # genera App.class\\njava App         # la JVM lo ejecuta</code></pre>", "tags": ["java", "jvm"]},
    {"id": "card-003", "type": "comparacion", "conceptRefs": [2], "front": "¿Cuándo compila el JIT frente al AOT y qué gana cada uno?", "back": "<p><b>JIT compila en runtime</b> (gana optimización con perfiles reales); <b>AOT antes de ejecutar</b> (gana arranque inmediato, sin warm-up).</p><table><tr><th></th><th>JIT</th><th>AOT</th></tr><tr><td>Cuándo</td><td>en runtime</td><td>antes de ejecutar</td></tr></table>", "tags": ["java", "rendimiento"]},
    {"id": "card-004", "type": "entrevista", "conceptRefs": [3, 2], "front": "¿Por qué Java es portable pero rápido?", "back": "<div class='interview-box'><div class='label'>Entrevista</div><ul><li><b>Portabilidad:</b> el bytecode corre donde haya JVM.</li><li><b>Velocidad:</b> el JIT compila hot spots a nativo en caliente.</li><li><b>Frase de cierre:</b> «compila una vez, ejecuta donde haya JVM; acelera en caliente con JIT».</li></ul></div>", "tags": ["java", "entrevista"]}
  ]
}

EJEMPLO B — lección NO técnica (cocina):
{
  "relevance": {"score": 85, "reason": "La técnica del punto de cocción es transversal a cualquier receta de la clase."},
  "keyConcepts": ["¿Qué significa el punto al dente? — resistencia firme al morder, con el núcleo apenas húmedo", "¿Cómo debe estar el agua al cocer? — hirviendo fuerte y bien salada antes de echar la pasta", "¿Por qué apagar el fuego un minuto antes? — la pasta sigue cocinándose un minuto fuera del fuego por calor residual", "¿Para qué se reserva agua de cocción? — su almidón emulsiona y liga la salsa"],
  "questions": [
    {"q": "¿Qué significa «al dente» al morder la pasta?", "bloom": "comprender", "difficulty": "confused", "conceptRefs": [0], "hint": "No es blanda ni cruda", "answer": "Firme con el núcleo apenas húmedo"},
    {"q": "¿Por qué el agua debe hervir fuerte y estar bien salada antes de echar la pasta?", "bloom": "comprender", "difficulty": "partial", "conceptRefs": [1], "hint": "Temperatura y sabor desde dentro", "answer": "El hervor fuerte aguanta la bajada de temperatura y evita que se pegue; la sal la sazona por dentro porque la pasta absorbe el agua"},
    {"q": "¿Por qué se apaga el fuego un minuto antes?", "bloom": "aplicar", "difficulty": "partial", "conceptRefs": [2], "hint": "El calor residual existe", "answer": "Termina de cocinarse con calor residual y al saltear con la salsa"},
    {"q": "Tu salsa quedó cortada, ¿qué recurso de la lección la salva?", "bloom": "analizar", "difficulty": "clear", "conceptRefs": [3], "hint": "Un líquido de la cocción", "answer": "Agregar agua de cocción almidonada y emulsionar"},
    {"q": "Evalúa si conviene pasta fresca o seca para una salsa pesada de caza.", "bloom": "evaluar", "difficulty": "mastered", "conceptRefs": [0, 2], "hint": "Superficie y morder", "answer": "La seca, con superficie rugosa y bocado firme, aguanta salsas densas; la fresca se pasa"}
  ],
  "application": {"isCode": false, "setup": "Vas a cocinar spaghetti con salsa de tomate para cuatro", "challenge": "Ordena los pasos para que la pasta quede al dente y ligada con la salsa", "solution": "Hervir agua abundante y salarla; echar la pasta; probar un hilo 1 minuto antes del tiempo del paquete; reservar una taza de agua de cocción; escurrir y terminar en la sartén con la salsa", "practice": {"format": "ordenar", "steps": ["Hervir agua abundante y salarla", "Echar la pasta y remover", "Probar un hilo 1 minuto antes del tiempo del paquete", "Reservar una taza de agua de cocción", "Escurrir y terminar en la sartén con la salsa"], "explanation": "La sal va en el agua antes de la pasta; se prueba antes de tiempo por el calor residual y el agua se reserva antes de escurrir para ligar la salsa."}},
  "interviewQ": {"q": "Explica a un principiante el error más común al cocer pasta.", "idealAnswer": "Pasarse de cocción por ignorar el calor residual; corregir probando antes y terminando en la sartén."},
  "nextAction": "Practica el test del bocado con dos formas de pasta distintas",
  "ankiCards": [
    {"id": "card-001", "type": "concepto", "conceptRefs": [0], "front": "Define «al dente»", "back": "Firme al morder, con el núcleo apenas húmedo", "tags": ["cocina", "pasta"]},
    {"id": "card-002", "type": "concepto", "conceptRefs": [3], "front": "¿Para qué sirve el agua de cocción reservada?", "back": "El almidón emulsiona y liga la salsa con la pasta", "tags": ["cocina", "salsas"]},
    {"id": "card-003", "type": "aplicacion", "conceptRefs": [2], "front": "¿Por qué sacar la pasta 1 minuto antes del tiempo del paquete?", "back": "Termina de cocerse con calor residual y al saltearse con la salsa", "tags": ["cocina", "tecnica"]},
    {"id": "card-004", "type": "concepto", "conceptRefs": [1], "front": "¿Por qué se sala el agua de la pasta y no solo la salsa?", "back": "La pasta absorbe agua al cocerse: la sal la sazona por dentro; la salsa solo la sazona por fuera", "tags": ["cocina", "pasta"]}
  ]
}
	`,
	].join('\n');
}

// ─── Vocabulario (aprendizaje de idiomas con el contenido del curso) ─────────

/**
 * F2-1 (GATE): ¿la transcripción que viaja al prompt lleva marcas [mm:ss]?
 *
 * HOY: false. collectTranscriptText une los cues con texto plano — el modelo
 * no puede situar un minuto y los inventaría, y el único filtro (formato
 * mm:ss) no comprueba contra la duración real. Con false, el prompt NO pide
 * t y los parsers NO lo aceptan: los enlaces vuelven a «Repasar esta
 * lección» / sin minuto. Cuando exista la recolección temporizada:
 *   1. poner true;
 *   2. validar t ≤ duración del video y que exista una marca cercana (±30 s)
 *      en la transcripción enviada.
 * Compartida entre la extensión y los QA (prompt-inspect la lee).
 */
export const TIMED_TRANSCRIPT = false;

export type VocabularyWord = {
	word: string;
	level: string;
	pos: string;
	meaning: string;
	sentence: string;
	sentenceTranslation: string;
	/** Pronunciación: IPA para la mayoría de idiomas; lectura en kana para japonés. */
	phonetic: string;
	/** Definición simple EN EL IDIOMA OBJETIVO (aprendizaje monolingüe). */
	monolingual: string;
	/** B6: colocación frecuente y natural con la palabra (2-5 palabras, p. ej.
	 *  «memory leak»). Vacío tolerado: la plantilla oculta la sección. */
	collocation?: string;
	/** Forma exacta en que aparece en la transcripción («ran», «figured it out»):
	 *  así se reconoce aunque el lema sea irregular (shared/vocabMatch.ts). */
	form?: string;
	/** Fase 2: minuto de la lección donde se enseña («mm:ss»). */
	t?: string;
};

/**
 * Cuántas palabras proponer: hasta el máximo por lección del estudiante
 * (VocabConfig.maxWords, 3–20) y, si la lección es corta, menos: una lección
 * corta no da para 20 palabras útiles y pedir de más empuja a la IA a rellenar
 * (6 · 10 · 15 · 20 según el volumen). Un solo número para el estudiante.
 */
export function vocabularyCandidateTarget(transcriptText: string, maxWords = 20): number {
	const chars = transcriptText.trim().length;
	const byVolume = chars < 2500 ? 6 : chars < 6000 ? 10 : chars < 12000 ? 15 : 20;
	return Math.min(byVolume, Math.min(20, Math.max(3, Math.round(Number(maxWords) || 20))));
}

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function cefrRank(level: string): number {
	const index = CEFR_ORDER.indexOf(String(level || '').trim().toUpperCase());
	return index === -1 ? -1 : index;
}

export function cefrLevels(): string[] {
	return [...CEFR_ORDER];
}

export interface VocabularyOptions {
	course: string;
	lesson: string;
	/** Idioma objetivo, p. ej. "inglés". Arquitectura abierta a cualquier idioma. */
	targetLang: string;
	/** Idioma base del estudiante para significados y traducciones, p. ej. "español". */
	baseLang: string;
	/** Nivel CEFR mínimo (incluido), p. ej. "B1". */
	minLevel: string;
	/** Máximo de palabras a extraer de la lección. */
	maxWords: number;
	/** Lemas que el estudiante YA tiene en su mazo y aparecen en esta lección:
	 *  no se proponen, así las candidatas son todas nuevas. */
	knownWords?: string[];
}

/**
 * Extracción de vocabulario desde la transcripción REAL del curso:
 * palabras del idioma objetivo en o por encima del nivel configurado, con
 * oración limpia creada para la tarjeta (no el párrafo ruidoso del subtítulo).
 */
export function buildVocabularyPrompt(transcriptText: string, options: VocabularyOptions): string {
	return [
		`Eres un creador experto de tarjetas de vocabulario para aprender ${options.targetLang} con el método de repetición espaciada, especializado en reutilizar contenido real de cursos online.`,
		`El estudiante tiene ${options.baseLang} como lengua base y quiere aprovechar el contenido del curso para ampliar su vocabulario de ${options.targetLang}.`,
		'',
		`CURSO: ${options.course || 'Curso online'}`,
		`LECCIÓN: ${options.lesson || 'Desconocida'}`,
		`NIVEL MÍNIMO (CEFR, incluido): ${options.minLevel}`,
		`MÁXIMO DE PALABRAS: ${options.maxWords}`,
		'',
		'TRANSCRIPCIÓN ORIGINAL DE LA LECCIÓN (fuente de verdad):',
		transcriptText.slice(0, 18000),
		'',
		'TAREA: extrae de la transcripción palabras o expresiones en ' + options.targetLang + ' cuyo nivel CEFR sea ' + options.minLevel + ' o superior, y crea una tarjeta por palabra.',
		'',
		'REGLAS DE SELECCIÓN:',
		'- Solo palabras de contenido: sustantivos, verbos, adjetivos, adverbios y phrasal verbs.',
		'- "word" SIEMPRE en forma base (lema) y minúsculas: "run", no "ran"; "framework"; "look up".',
		'- "form": la forma EXACTA en que aparece en la transcripción, copiada tal cual ("ran", "figured it out", "leaks"). Si coincide con el lema, repítelo.',
		'- Excluye SIEMPRE: nombres propios, personas, marcas, productos y tecnologías concretas (Java, Spring Boot, JVM, Docker), siglas y acrónimos (API, HTTP), números, contracciones, interjecciones y palabras de menos de 3 letras.',
		'- Excluye todo lo que esté por debajo del nivel mínimo: si el mínimo es B1, no incluyas palabras A1/A2 ni vocabulario escolar básico (house, water, make).',
		'- Sí incluye: phrasal verbs útiles (figure out, wrap up), términos técnicos del dominio del curso (overhead, throughput, leak, pitfalls) y palabras frecuentes en registros profesionales.',
		'- Prioriza palabras que aporten más: aparecen varias veces en la lección, se reutilizan en contextos profesionales, o son de nivel más alto.',
		'- Cada lema una sola vez; cero relleno: mejor 4 palabras excelentes que 8 mediocres.',
		...((options.knownWords || []).length > 0
			? [`- YA ESTÁN EN SU MAZO (de otras lecciones o cursos): NO las propongas: ${(options.knownWords || []).slice(0, 80).join(', ')}.`]
			: []),
		'- Si la transcripción NO está en ' + options.targetLang + ' o es demasiado corta, devuelve {"words": []}.',
		'',
		'REGLAS DE ORACIÓN (críticas para la retención):',
		'- "sentence": una oración NUEVA, limpia y autocontenida de 8 a 14 palabras que TÚ creas; usa la palabra con el sentido que tiene en la lección.',
		'- PROHIBIDO copiar la línea del subtítulo (suelen ser fragmentos largos, ruidosos o sin contexto).',
		'- La oración debe contener la palabra de forma reconocible (admite -s/-ed/-ing mínimas). Si "collocation" no está vacía (p. ej. "legacy codebase", "nonprofit organization"), la oración "sentence" DEBE usar esa misma colocación exacta de forma natural (no otra variante como "old codebase" o "nonprofit group"), para consolidar el mismo bloque léxico en memoria.',
		'- Escenario real y autónomo: redacta una frase de entorno profesional o cotidiano real; PROHIBIDO empezar con «For this course», «In this lesson», «In this class» o hablar de seguir el curso.',
		'- Ortografía y mayúsculas impecables en "sentence" y "collocation": aunque "word" vaya en minúsculas, dentro de "sentence" respeta SIEMPRE las mayúsculas correctas del idioma para nombres propios, lenguajes y siglas (escribe "Python", "API", "SQL", "Swagger UI", nunca "python", "api" ni "swagger ui").',
		'- "sentenceTranslation": traducción fiel y natural a ' + options.baseLang + ' que conserve la estructura de la oración original (sin calcos forzados ni paráfrasis libres).',
		'',
		'REGLAS DE SIGNIFICADO:',
		'- "pos": categoría gramatical en inglés entre paréntesis: noun, verb, adjective, adverb, phrasal verb.',
		'- "meaning": 1 a 3 sentidos en ' + options.baseLang + ' separados por "; ", sin la categoría gramatical, en minúsculas.',
		'- "level": el nivel CEFR real de la palabra: A1, A2, B1, B2, C1 o C2. Asigna el nivel CEFR lexicográfico real (referencia Cambridge EVP / Oxford 5000): términos cultos, metalingüísticos, jurídicos o de gobernanza (p. ej. "idiomatic", "steward", "advocacy", "caveat", "ubiquitous", "idempotent") son C1 o C2, no B2.',
		'',
		'REGLAS DE PRONUNCIACIÓN Y DEFINICIÓN MONOLINGÜE:',
		'- "phonetic": la pronunciación de la palabra en su sistema nativo. Para la mayoría de idiomas: IPA entre barras (ej. "/liːk/"), acento marcado. Para japonés: la LECTURA de la palabra en hiragana (ej. "かくにん"), sin barras.',
		'- "monolingual": una definición SIMPLE escrita EN ' + options.targetLang + ' (NO en ' + options.baseLang + '), de 6 a 14 palabras, clara para un estudiante del nivel ' + options.minLevel + '.',
		'- "collocation": UNA combinación frecuente y natural con la palabra en el idioma objetivo, de 2 a 5 palabras (p. ej. "memory leak", "plug a leak"). Si no existe una natural, cadena vacía.',
		'- La definición monolingüe NUNCA usa la palabra que define ni derivadas obvias.',
		'',
		'FORMATO DE SALIDA (CRÍTICO):',
		'- Responde EXCLUSIVAMENTE con un objeto JSON válido. Sin markdown, sin ```json, sin texto extra.',
		'- Sin comillas dobles dentro de los valores; usa « » si necesitas citar.',
		'- Esquema exacto:',
		(TIMED_TRANSCRIPT
			? '{"words": [{"word": "lema", "level": "B2", "pos": "noun", "form": "forma vista", "meaning": "sentido 1; sentido 2", "phonetic": "/pronunciación/", "monolingual": "definición simple en el idioma objetivo", "collocation": "colocación natural", "sentence": "Oración nueva de 8 a 14 palabras.", "sentenceTranslation": "Traducción fiel y natural.", "t": "03:12"}]}'
			: '{"words": [{"word": "lema", "level": "B2", "pos": "noun", "form": "forma vista", "meaning": "sentido 1; sentido 2", "phonetic": "/pronunciación/", "monolingual": "definición simple en el idioma objetivo", "collocation": "colocación natural", "sentence": "Oración nueva de 8 a 14 palabras.", "sentenceTranslation": "Traducción fiel y natural."}]}'),
		`- Máximo ${options.maxWords} elementos en "words".`,
		'',
		'Genera AHORA el JSON:',
	].join('\n');
}
