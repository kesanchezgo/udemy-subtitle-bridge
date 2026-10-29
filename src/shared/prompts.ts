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
};

export function formatOriginalSrtBlocks(blocks: SrtBlock[]) {
	return blocks
		.map((block) => `${block.index}\n${block.timeLine}\n${block.text}`)
		.join('\n\n');
}

/**
 * Objetivo de cantidad de tarjetas Anki según la densidad de la lección.
 * Una lección corta no debe inflarse con tarjetas de relleno.
 */
export function estimateAnkiCardTarget(transcriptText: string, cueCount?: number) {
	const chars = transcriptText.trim().length;
	const cues = typeof cueCount === 'number' && Number.isFinite(cueCount) ? cueCount : 0;
	if (chars < 2500 || cues > 0 && cues < 35) return { min: 3, max: 4, label: 'leccion corta o liviana' };
	if (chars < 6000 || cues > 0 && cues < 90) return { min: 4, max: 5, label: 'leccion breve con pocos conceptos' };
	if (chars < 12000 || cues > 0 && cues < 180) return { min: 5, max: 6, label: 'leccion normal' };
	return { min: 6, max: 8, label: 'leccion larga o densa' };
}

export function buildSrtTranslationPrompt(blocks: SrtBlock[]): string {
	return [
		'Actúa como traductor experto para cursos online de Udemy.',
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

export function buildObjectivesPrompt(courseName: string, description: string): string {
	return [
		'Eres un asesor pedagógico para estudiantes de Udemy.',
		'Genera 4 objetivos de aprendizaje concretos y motivantes para el siguiente curso.',
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
		'- Personalízalos al curso específico, no genérico.',
		'',
		`Curso: ${courseName}`,
		`Descripción: ${description || '(sin descripción)'}`,
		'',
		'Genera AHORA el array JSON (4 objetos, sin texto adicional):',
	].join('\n');
}

export function buildRefinePrompt(courseName: string, description: string, rawGoal: string): string {
	return [
		'Eres un coach pedagógico para estudiantes de Udemy.',
		'Convierte el objetivo libre del estudiante en un objetivo de aprendizaje personalizado y de alta calidad.',
		'Debe mantener la intención original del estudiante y adaptarse al curso real.',
		'',
		'CRITERIOS:',
		'- Resultado observable: que el estudiante pueda notar si avanzó.',
		'- Acción concreta: aprender, aplicar, crear, aprobar, explicar, resolver, mejorar, practicar, etc.',
		'- Contexto del curso: usa el nombre y descripción; no inventes datos externos.',
		'- No fuerces entrevista, certificación, proyecto o código si no encaja con el objetivo o el curso.',
		'- Si el objetivo ya es concreto y de alta calidad, devuélvelo pulido en redacción sin traicionar su intención.',
		'- Tono motivador, profesional y específico; evita frases genéricas tipo "aprender el curso".',
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
	return [
		'Eres un diseñador instruccional experto para cursos online de Udemy.',
		'Genera una sesión de estudio adaptada al curso, la lección actual y el objetivo del estudiante.',
		'No asumas que el curso es de programación. Si es técnico, usa su lenguaje/framework real; si no lo es, crea ejercicios prácticos del dominio correspondiente.',
		'Usa esta prioridad pedagogica: 1) la transcripción es la fuente de verdad; 2) el objetivo del estudiante define el ángulo, dificultad y distribución; 3) el curso/descripción solo aporta contexto; 4) no inventes contenido para satisfacer el objetivo.',
		'',
		`CURSO: ${metadata.courseName || metadata.courseSlug || 'Curso Udemy'}`,
		`DESCRIPCIÓN DEL CURSO: ${metadata.courseDescription || '(sin descripción)'}`,
		`LECCIÓN: ${metadata.lessonName || metadata.lectureId || 'Desconocida'}`,
		`OBJETIVO DEL ESTUDIANTE: ${metadata.objective || 'Dominar la lección y aplicarla correctamente'}`,
		`DENSIDAD DE LA LECCIÓN: ${cardTarget.label}; transcripción ${transcriptText.length} caracteres; cues ${metadata.cueCount ?? 'desconocidos'}; truncada: ${metadata.transcriptTruncated ? 'sí' : 'no'}`,
		`CANTIDAD RECOMENDADA DE ANKI: ${cardTarget.min}-${cardTarget.max} tarjetas`,
		'',
		'TRANSCRIPCIÓN DEL VIDEO:',
		transcriptText.slice(0, 18000),
		'',
		'Genera un JSON VÁLIDO (sin markdown, sin ```json) con esta estructura EXACTA:',
		'{',
		'  "relevance": { "score": 85, "reason": "explicación breve" },',
		'  "keyConcepts": ["concepto 1 en una oración", "concepto 2", "concepto 3", "concepto 4"],',
		'  "quickWin": "una acción rápida que el estudiante puede hacer ahora",',
		'  "questions": [',
		'    { "q": "pregunta", "bloom": "comprender|aplicar|analizar|evaluar", "difficulty": "confused|partial|clear|mastered", "conceptRefs": [0], "hint": "pista", "answer": "respuesta ideal" }',
		'  ],',
		'  "application": {',
		'    "isCode": true,',
		'    "setup": "contexto del ejercicio práctico",',
		'    "challenge": "código con bug o ejercicio",',
		'    "solution": "solución explicada"',
		'  },',
		'  "interviewQ": { "q": "pregunta oral/de cierre", "idealAnswer": "estructura ideal de respuesta" },',
		'  "nextAction": "siguiente paso recomendado",',
		'  "ankiCards": [',
		'    { "id": "card-001", "type": "concepto|aplicacion|codigo|entrevista|comparacion|proceso", "front": "pregunta clara (HTML simple)", "back": "respuesta estructurada (HTML del vocabulario permitido)", "tags": ["tag1", "tag2"] }',
		'  ]',
		'}',
		'',
		'REGLAS:',
		'- "relevance.score" es un entero 0-100 que mide qué tan útil es ESTA lección para el objetivo del estudiante; "reason" lo justifica en una frase.',
		'- Genera exactamente 4 keyConcepts. El indice de cada concepto (0, 1, 2, 3) se usara para calibrar preguntas.',
		'- Genera exactamente 4 preguntas, una por difficulty: confused, partial, clear, mastered.',
		'- Cada pregunta DEBE incluir conceptRefs con 1-3 indices de keyConcepts que evalua. Usa indices validos entre 0 y 3.',
		'- Las preguntas deben enfocarse en verificar comprension aplicable, no repetir literalmente el subtitulo.',
		'- Usa el objetivo para decidir el enfoque de preguntas y tarjetas. Ejemplo: si el objetivo es entrevista, favorece explicación oral, comparaciones, trade-offs y preguntas tipo entrevista, PERO solo cuando se justifiquen desde la transcripción.',
		`- Genera entre ${cardTarget.min} y ${cardTarget.max} tarjetas Anki útiles y específicas de la lección. No rellenes por cantidad: una lección corta debe tener pocas tarjetas de alta calidad; una lección densa puede tener más.`,
		'- Cada tarjeta Anki debe ser atómica: una sola idea evaluable por tarjeta. Evita duplicados, preguntas vagas y respuestas enciclopédicas.',
		'',
		'PRINCIPIOS DE REPETICIÓN ESPACIADA (estas tarjetas van a Anki):',
		'- Autocontenido: cada tarjeta debe entenderse FUERA de contexto; incluye el mínimo necesario para saber de qué habla (nombre de la clase, función o concepto).',
		'- Recall activo: el front debe obligar a recuperar la información (definir, predecir la salida, producir, comparar). Prohibidas las preguntas de sí/no y el reconocimiento trivial.',
		'- Sin solapes: si dos tarjetas comparten la mayor parte de su contenido, fusiónalas en una sola. Cada dato vive en UNA tarjeta.',
		'- Orientado al objetivo: genera tarjetas de lo que sirve para el OBJETIVO del estudiante; una idea ajena al objetivo no merece tarjeta.',
		'',
		'FORMATO HTML DE LAS TARJETAS ANKI:',
		'- La plantilla de Anki ya pone el marco visual (barra terminal, píldora de tipo, tipografía, resaltado de código). front y back aportan SOLO el HTML interno.',
		'- FRONT: la pregunta en 1-2 líneas, texto plano o con <code> inline. Si la tarjeta pide completar o predecir código, incluye el bloque de código en el front. NUNCA incluyas la respuesta en el front.',
		'- BACK: primera línea = respuesta directa con el término clave en <b>. Después máximo 2-3 bloques de apoyo, no más.',
		'- Bloques de código SOLO así: <pre><code class="language-LENGUAJE">código</code></pre>. Usa el lenguaje REAL del curso (no siempre java): válidos language-markup, language-css, language-javascript, language-typescript, language-jsx, language-tsx, language-python, language-java, language-kotlin, language-csharp, language-c, language-cpp, language-go, language-php, language-ruby, language-bash, language-powershell, language-sql, language-json, language-yaml, language-properties, language-docker (viajan embebidos en el .apkg, funcionan sin conexión). Nunca código suelto fuera de <pre><code>.',
		'- Vocabulario HTML permitido en back (solo este): <p>, <b>, <em>, <code>, <pre><code>, <ul>/<ol>/<li>, <table>/<tr>/<th>/<td>, <blockquote>, <details>/<summary>, y los callouts <div class="concept-box">, <div class="tip-box">, <div class="warning-box">, <div class="interview-box"> (este último con <div class="label">Título</div> como primera línea).',
		'- type="codigo" → back con el código solución en <pre><code class="language-LENGUAJE_REAL"> (el lenguaje del curso, de la lista de arriba) seguido de 1-2 líneas de explicación.',
		'- type="comparacion" → A3 (info mínima): el FRONT pregunta por UNA dimensión discriminante («¿Cuándo compila el JIT frente al AOT y qué gana cada uno?»). El back abre con 1-2 líneas que responden esa dimensión; la tabla queda como apoyo con 3 filas como máximo.',
		'- type="proceso" → A3 (info mínima): 4 pasos como máximo. Si el proceso tiene más, el front pregunta por el paso que falta o el que sigue («Después de X, ¿qué paso sigue y por qué?»). La secuencia completa en el back SOLO si tiene ≤4 pasos.',
		'- type="entrevista" → MÁXIMO 1 por lección. Back con <div class="interview-box"> que abra con <div class="label">Entrevista</div> y estructure la respuesta en 3-4 puntos.',
		'- Añade "summary" al JSON: 3-5 frases que sinteticen la lección CON TUS PALABRAS, en español (síntesis generativa). No repitas las keyConcepts literalmente.',
		'- Añade "conceptTerms": 2-5 nombres canónicos en singular, tal como se usan en el curso (p. ej. "bytecode", "JIT"). Serán conceptos enlazables entre cursos.',
		'- Cada ankiCard lleva además "t": "mm:ss" — el minuto de la transcripción donde se enseña ese contenido. Si no puedes situarlo con seguridad, omítelo.',
		'- <details><summary> solo para matices opcionales; la respuesta principal NUNCA dentro de details.',
		'- PROHIBIDO: markdown (```), estilos inline (style=), clases distintas de las listadas, y prefijos tipo "CÓDIGO:" o "💻" al inicio del front o del back.',
		'- Usa type="aplicacion" para casos, decisiones, ejercicios de transferencia, práctica profesional o uso real que no sea código.',
		'- Usa type="codigo" solo si la lección realmente enseña código, comandos, APIs o sintaxis. Usa type="entrevista" solo si aporta valor para explicar el tema oralmente o para el objetivo del estudiante, y nunca para rellenar cantidad.',
		'- interviewQ representa una práctica oral/de cierre para consolidar la lección. Puede ser null si no aporta valor.',
		'- Hazla de entrevista SOLO si el objetivo del estudiante, el curso o la lección lo justifican claramente. Si no, formula una explicación en voz alta, reflexión guiada o pregunta de transferencia del dominio.',
		'- Si el objetivo es entrevista pero la lección no contiene material entrevistable, genera una pregunta oral sobre lo que sí aparece en la transcripción, no sobre temas externos.',
		'- Las tags deben ser cortas, sin espacios, y reflejar curso/tema/tipo. No inventes tags genéricas si hay términos específicos en la transcripción.',
		'- application.isCode debe ser true solo si la lección realmente requiere código.',
		'- Si no es código, challenge debe ser un caso práctico, análisis, decisión o ejercicio aplicable.',
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
  "keyConcepts": ["javac compila el fuente a bytecode, no a código nativo", "la JVM interpreta el bytecode en cada plataforma", "el JIT compila hot spots a nativo en runtime", "portabilidad = un .class corre donde exista JVM"],
  "quickWin": "Compila HolaMundo.java con javac y ejecútalo en otra máquina distinta",
  "questions": [
    {"q": "¿Qué archivo genera exactamente javac a partir del código fuente?", "bloom": "comprender", "difficulty": "confused", "conceptRefs": [0], "hint": "No es un .exe; es un formato intermedio", "answer": "Un archivo .class con bytecode"},
    {"q": "¿Por qué el mismo .class puede correr en Windows y Linux sin recompilar?", "bloom": "aplicar", "difficulty": "partial", "conceptRefs": [0, 3], "hint": "Algo específico de la plataforma hace el trabajo", "answer": "La JVM de cada plataforma interpreta el mismo bytecode"},
    {"q": "Si Java interpreta bytecode, ¿por qué no es lento como un intérprete puro?", "bloom": "analizar", "difficulty": "clear", "conceptRefs": [2], "hint": "Parte del código se transforma durante la ejecución", "answer": "El JIT detecta hot spots y los compila a código nativo, cacheando y reutilizando el resultado"},
    {"q": "Un compañero dice que Java es más lento que C++ para todo. Evalúa esa afirmación.", "bloom": "evaluar", "difficulty": "mastered", "conceptRefs": [1, 2, 3], "hint": "Depende del workload y del JIT", "answer": "En picos cálidos el JIT acerca el rendimiento a nativo; C++ sigue ganando en latencia predecible y control de memoria. La afirmación es una simplificación."}
  ],
  "application": {"isCode": true, "setup": "Tienes App.java compilado en tu laptop", "challenge": "Lleva solo el .class a una PC con otra JVM y ejecútalo sin recompilar", "solution": "java -cp . App funciona si la JVM soporta la versión del bytecode; documenta la diferencia entre JDK y JRE"},
  "interviewQ": {"q": "Explica en 60 segundos cómo Java logra independencia de plataforma sin perder velocidad.", "idealAnswer": "Dos capas: compilación a bytecode (portabilidad) + JVM con JIT (velocidad). Mencionar write-once-run-anywhere y warm-up."},
  "nextAction": "Ejecuta tu app con -XX:+PrintCompilation y observa el JIT en acción",
  "ankiCards": [
    {"id": "card-001", "type": "concepto", "front": "¿Qué produce <code>javac</code> a partir del código fuente?", "back": "<p><b>Bytecode</b> en archivos <code>.class</code>, no código máquina nativo.</p><div class='concept-box'>El bytecode es un formato intermedio: solo la JVM puede ejecutarlo.</div>", "tags": ["java", "compilacion"]},
    {"id": "card-002", "type": "codigo", "front": "¿Qué imprime <code>System.out.println(1 + 2 + 3)</code> y por qué?", "back": "<p>Imprime <b>6</b>: los tres operandos son <code>int</code>, así que <code>+</code> suma aritméticamente.</p><pre><code class='language-java'>System.out.println(1 + 2 + 3); // imprime 6</code></pre>", "tags": ["java", "tipos"]},
    {"id": "card-003", "type": "comparacion", "front": "¿Cuándo compila el JIT frente al AOT y qué gana cada uno?", "back": "<p><b>JIT compila en runtime</b> (gana optimización con perfiles reales); <b>AOT antes de ejecutar</b> (gana arranque inmediato, sin warm-up).</p><table><tr><th></th><th>JIT</th><th>AOT</th></tr><tr><td>Cuándo</td><td>en runtime</td><td>antes de ejecutar</td></tr></table>", "tags": ["java", "rendimiento"]},
    {"id": "card-004", "type": "entrevista", "front": "¿Por qué Java es portable pero rápido?", "back": "<div class='interview-box'><div class='label'>Entrevista</div><ul><li><b>Portabilidad:</b> el bytecode corre donde haya JVM.</li><li><b>Velocidad:</b> el JIT compila hot spots a nativo en caliente.</li><li><b>Frase de cierre:</b> «compila una vez, ejecuta donde haya JVM; acelera en caliente con JIT».</li></ul></div>", "tags": ["java", "entrevista"]}
  ]
}

EJEMPLO B — lección NO técnica (cocina):
{
  "relevance": {"score": 85, "reason": "La técnica del punto de cocción es transversal a cualquier receta de la clase."},
  "keyConcepts": ["al dente = resistencia firme al morder, núcleo apenas húmedo", "el agua debe hervir fuerte y estar bien salada", "la pasta sigue cocinándose un minuto fuera del fuego", "reservar agua de cocción emulsiona la salsa"],
  "quickWin": "En tu próxima pasta, saca la sartén del fuego un minuto antes de lo que harías",
  "questions": [
    {"q": "¿Qué significa «al dente» al morder la pasta?", "bloom": "comprender", "difficulty": "confused", "conceptRefs": [0], "hint": "No es blanda ni cruda", "answer": "Firme con el núcleo apenas húmedo"},
    {"q": "¿Por qué se apaga el fuego un minuto antes?", "bloom": "aplicar", "difficulty": "partial", "conceptRefs": [2], "hint": "El calor residual existe", "answer": "Termina de cocinarse con calor residual y al saltear con la salsa"},
    {"q": "Tu salsa quedó cortada, ¿qué recurso de la lección la salva?", "bloom": "analizar", "difficulty": "clear", "conceptRefs": [3], "hint": "Un líquido de la cocción", "answer": "Agregar agua de cocción almidonada y emulsionar"},
    {"q": "Evalúa si conviene pasta fresca o seca para una salsa pesada de caza.", "bloom": "evaluar", "difficulty": "mastered", "conceptRefs": [0, 2], "hint": "Superficie y morder", "answer": "La seca, con superficie rugosa y bocado firme, aguanta salsas densas; la fresca se pasa"}
  ],
  "application": {"isCode": false, "setup": "Vas a cocinar spaghetti con salsa de tomate", "challenge": "Apunta el reloj y prueba un hilo 1 minuto antes del tiempo del paquete", "solution": "Deberá ofrecer resistencia pareja; escurre reservando una taza de agua y termina en la sartén con la salsa"},
  "interviewQ": {"q": "Explica a un principiante el error más común al cocer pasta.", "idealAnswer": "Pasarse de cocción por ignorar el calor residual; corregir probando antes y terminando en la sartén."},
  "nextAction": "Practica el test del bocado con dos formas de pasta distintas",
  "ankiCards": [
    {"id": "card-001", "type": "concepto", "front": "Define «al dente»", "back": "Firme al morder, con el núcleo apenas húmedo", "tags": ["cocina", "pasta"]},
    {"id": "card-002", "type": "concepto", "front": "¿Para qué sirve el agua de cocción reservada?", "back": "El almidón emulsiona y liga la salsa con la pasta", "tags": ["cocina", "salsas"]},
    {"id": "card-003", "type": "aplicacion", "front": "¿Por qué sacar la pasta 1 minuto antes del tiempo del paquete?", "back": "Termina de cocerse con calor residual y al saltearse con la salsa", "tags": ["cocina", "tecnica"]}
  ]
}
	`,
	].join('\n');
}

// ─── Vocabulario (aprendizaje de idiomas con el contenido del curso) ─────────

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
	/** Fase 2: minuto de la lección donde se enseña («mm:ss»). */
	t?: string;
};

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
}

/**
 * Extracción de vocabulario desde la transcripción REAL del curso:
 * palabras del idioma objetivo en o por encima del nivel configurado, con
 * oración limpia creada para la tarjeta (no el párrafo ruidoso del subtítulo).
 */
export function buildVocabularyPrompt(transcriptText: string, options: VocabularyOptions): string {
	return [
		`Eres un creador experto de tarjetas de vocabulario para aprender ${options.targetLang} con el método de repetición espaciada, especializado en reutilizar contenido real de cursos online de Udemy.`,
		`El estudiante tiene ${options.baseLang} como lengua base y quiere aprovechar el contenido del curso para ampliar su vocabulario de ${options.targetLang}.`,
		'',
		`CURSO: ${options.course || 'Curso Udemy'}`,
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
		'- Excluye SIEMPRE: nombres propios, personas, marcas, productos y tecnologías concretas (Java, Spring Boot, JVM, Docker), siglas y acrónimos (API, HTTP), números, contracciones, interjecciones y palabras de menos de 3 letras.',
		'- Excluye todo lo que esté por debajo del nivel mínimo: si el mínimo es B1, no incluyas palabras A1/A2 ni vocabulario escolar básico (house, water, make).',
		'- Sí incluye: phrasal verbs útiles (figure out, wrap up), términos técnicos del dominio del curso (overhead, throughput, leak, pitfalls) y palabras frecuentes en registros profesionales.',
		'- Prioriza palabras que aporten más: aparecen varias veces en la lección, se reutilizan en contextos profesionales, o son de nivel más alto.',
		'- Cada lema una sola vez; cero relleno: mejor 4 palabras excelentes que 8 mediocres.',
		'- Si la transcripción NO está en ' + options.targetLang + ' o es demasiado corta, devuelve {"words": []}.',
		'',
		'REGLAS DE ORACIÓN (críticas para la retención):',
		'- "sentence": una oración NUEVA, limpia y autocontenida de 8 a 14 palabras que TÚ creas; usa la palabra con el sentido que tiene en la lección.',
		'- PROHIBIDO copiar la línea del subtítulo (suelen ser fragmentos largos, ruidosos o sin contexto).',
		'- La oración debe contener la palabra de forma reconocible (admite -s/-ed/-ing mínimas).',
		'- Estructura simple y natural, utilizable en el mundo real; ambientada en el dominio del curso cuando suene natural.',
		'- "sentenceTranslation": traducción fiel y natural a ' + options.baseLang + ' que conserve la estructura de la oración original (sin calcos forzados ni paráfrasis libres).',
		'',
		'REGLAS DE SIGNIFICADO:',
		'- "pos": categoría gramatical en inglés entre paréntesis: noun, verb, adjective, adverb, phrasal verb.',
		'- "meaning": 1 a 3 sentidos en ' + options.baseLang + ' separados por "; ", sin la categoría gramatical, en minúsculas.',
		'- "level": el nivel CEFR real de la palabra: A1, A2, B1, B2, C1 o C2.',
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
		'{"words": [{"word": "lema", "level": "B2", "pos": "noun", "meaning": "sentido 1; sentido 2", "phonetic": "/pronunciación/", "monolingual": "definición simple en el idioma objetivo", "collocation": "colocación natural", "sentence": "Oración nueva de 8 a 14 palabras.", "sentenceTranslation": "Traducción fiel y natural.", "t": "03:12"}]}',
		`- Máximo ${options.maxWords} elementos en "words".`,
		'',
		'Genera AHORA el JSON:',
	].join('\n');
}
