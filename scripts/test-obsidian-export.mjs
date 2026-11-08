// Verifica los builders de exportación a Obsidian sin chrome (Node 24+).
// Run: node scripts/test-obsidian-export.mjs

import {
	buildSessionNotePath,
	buildSessionNoteMarkdown,
	buildCourseMocPath,
	buildCourseMocMarkdown,
	buildProgramMocPath,
	buildProgramMocMarkdown,
	buildRawSrtNotePath,
	buildRawSrtNoteMarkdown,
	buildScaffoldNotes,
	buildObsidianNewUri,
	slugifyVault,
	htmlToMarkdownLite,
	DEFAULT_OBSIDIAN_EXPORT_CONFIG,
} from '../src/app/services/obsidianExport.ts';

const assert = (cond, msg) => {
	if (!cond) {
		console.error('❌ ' + msg);
		process.exitCode = 1;
	} else {
		console.log('✅ ' + msg);
	}
};

const cfg = { ...DEFAULT_OBSIDIAN_EXPORT_CONFIG, vaultName: 'Dev Courses' };
const session = {
	courseName: 'Java Programming Bootcamp: Spring Boot & REST APIs',
	lessonName: 'Platform Independence in Java',
	objective: 'Conseguir trabajo como backend developer',
	sourceUrl: 'https://www.udemy.com/course/java/learn/lecture/12345',
	platform: 'udemy',
	content: {
		relevance: { score: 83, reason: 'La lección explica el mecanismo de portabilidad.' },
		keyConcepts: ['javac compila a bytecode', 'la JVM interpreta el bytecode'],
		quickWin: 'Compilar y ejecutar en otra máquina',
		questions: [
			{ q: '¿Qué genera javac?', bloom: 'comprender', difficulty: 'confused', hint: 'No es un .exe', answer: 'Un .class con bytecode' },
		],
		application: { isCode: true, setup: 'App.java compilada', challenge: 'Ejecutar en otra JVM', solution: 'java -cp . App' },
		interviewQ: { q: 'Explica la portabilidad de Java', idealAnswer: 'Bytecode + JIT' },
		nextAction: 'Ejecutar con -XX:+PrintCompilation',
		ankiCards: [
			{ front: '¿Qué produce <code>javac</code>?', back: '<p><b>Bytecode</b> en <code>.class</code></p>', type: 'concepto' },
			{ front: '¿Qué imprime <code>System.out.println(1+2)</code>?', back: '<p>Imprime <b>3</b></p><pre><code class="language-java">System.out.println(1 + 2); // 3</code></pre>', type: 'codigo' },
		],
	},
};

// slugify
assert(slugifyVault('Platform Independence in Java') === 'platform-independence-in-java', 'slugify kebab-case');
assert(slugifyVault('¿Por qué la JVM es portable?') === 'por-que-la-jvm-es-portable', 'slugify sin tildes ni signos');

// path de sesión
const notePath = buildSessionNotePath(cfg, session.courseName, session.lessonName);
assert(notePath === 'wiki/fuentes/java-programming-bootcamp-spring-boot-rest-apis---platform-independence-in-java.md', `ruta de sesión: ${notePath}`);

// markdown de sesión
const md = buildSessionNoteMarkdown(session, cfg, { today: new Date(2026, 8, 22) });
assert(md.startsWith('---\ntitle: "Platform Independence in Java — Java Programming Bootcamp'), 'frontmatter al inicio');
assert(md.includes('type: sesion') && md.includes('platform: udemy'), 'frontmatter type/platform');
assert(md.includes('course: java-programming-bootcamp-spring-boot-rest-apis'), 'frontmatter course slug');
assert(md.includes('relevance_score: 83'), 'relevance_score');
assert(md.includes('lesson_url: "https://www.udemy.com/'), 'lesson_url (C9); source_url ya no va en la sesión');
assert(!md.includes('source_url:'), 'C9: sin source_url duplicado');
assert(md.includes('[[cursos/java-programming-bootcamp-spring-boot-rest-apis|'), 'enlace al MOC');
assert(md.includes('## Ideas clave') && md.includes('- javac compila a bytecode'), 'ideas clave');
assert(md.includes('## Preguntas para comprobarte') && md.includes('> [!question]-') && md.includes('**Respuesta:** Un .class'), 'C5: preguntas plegadas con respuesta dentro');
assert(!/\d+\. \*\*[^*]+\*\*[\s\S]*?Respuesta:/.test(md), 'C5: respuestas ya NO a la vista en lista');

assert(md.includes('- [ ] Ejecutar con -XX:+PrintCompilation'), 'next action como task');
assert(md.includes('> [!example]- Tarjetas de esta lección') && !md.includes('#flashcards'), 'C6: tarjetas como referencia plegada, sin #flashcards');
assert(md.includes('¿Qué imprime `System.out.println(1+2)`?'), 'front con código inline');
assert(md.includes('```java') && md.includes('System.out.println(1 + 2); // 3'), 'C6: código de bloque cercado con su lenguaje');
{
	// Los APERTURES de bloque (índices pares) deben declarar lenguaje; los
	// cierres son ``` solos por naturaleza. Las tarjetas van dentro del callout
	// plegado «Tarjetas de esta lección», así que cada línea viene citada
	// («> ```»): se quita el prefijo antes de clasificar.
	const fenceLines = md.split(String.fromCharCode(10))
		.map((l) => l.replace(/^(?:>\s?)+/, ''))
		.filter((l) => l.startsWith('```'));
	const openers = fenceLines.filter((_f, i) => i % 2 === 0);
	assert(openers.length > 0 && openers.every((f) => f.length > 3), 'C6: todo bloque cercado declara su lenguaje');
}
assert(!md.includes('<pre') && !md.includes('<div'), 'sin HTML crudo en markdown');

// MOC
const mocPath = buildCourseMocPath(cfg, session.courseName);
assert(mocPath === 'cursos/java-programming-bootcamp-spring-boot-rest-apis.md', `ruta de MOC: ${mocPath}`);
const moc = buildCourseMocMarkdown(session.courseName, { platform: 'udemy', today: new Date(2026, 8, 22) });
assert(moc.includes('type: curso') && moc.includes('status: en-progreso'), 'frontmatter MOC');
assert(moc.includes('WHERE course = "java-programming-bootcamp-spring-boot-rest-apis"'), 'query Dataview por course');
assert(moc.includes('FROM "wiki/fuentes"'), 'query sobre fuentes');

// URI
const uri = buildObsidianNewUri('Dev Courses', { path: notePath, markdown: md });
assert(uri.startsWith('obsidian://new?vault=Dev%20Courses&file=wiki%2Ffuentes%2F'), 'URI obsidian://new con vault y file encoded');
assert(decodeURIComponent(uri).includes('title: "Platform Independence'), 'contenido en la URI');
assert(uri.length < 100_000, 'URI bajo límites prácticos');

// scaffold
const scaffold = buildScaffoldNotes({ platform: 'udemy' });
assert(scaffold.length === 7, '7 notas de scaffold');
assert(scaffold.some((n) => n.path === 'CLAUDE.md'), 'CLAUDE.md en scaffold');
assert(scaffold.some((n) => n.path === 'AGENTS.md'), 'AGENTS.md en scaffold (mirror para otros agentes)');
const agents = scaffold.find((n) => n.path === 'AGENTS.md');
assert(agents && agents.markdown.includes('Espejo de `CLAUDE.md`'), 'AGENTS.md declara que es espejo');
assert(scaffold.some((n) => n.path === 'plantillas/sesion.md'), 'plantilla de sesión en scaffold');
assert(scaffold.every((n) => !n.markdown.includes('undefined')), 'sin "undefined" en scaffold');

// raw SRT note
const rawPath = buildRawSrtNotePath(session.courseName, session.lessonName, { platform: 'udemy' });
assert(rawPath === 'raw/udemy/java-programming-bootcamp-spring-boot-rest-apis/java-programming-bootcamp-spring-boot-rest-apis---platform-independence-in-java.md', `ruta raw: ${rawPath}`);
const rawMd = buildRawSrtNoteMarkdown(session.courseName, session.lessonName, '1\n00:00:00,000 --> 00:00:04,000\nHello', { platform: 'udemy', today: new Date(2026, 8, 22) });
assert(rawMd.includes('type: raw-srt') && rawMd.includes('```srt'), 'raw note con frontmatter y bloque srt');
assert(rawMd.includes('INMUTABLE'), 'raw note marca inmutabilidad');
assert(rawMd.includes('00:00:00,000 --> 00:00:04,000'), 'SRT intacto dentro del bloque');

// htmlToMarkdownLite
assert(htmlToMarkdownLite('<p>A</p><ul><li>x</li><li>y</li></ul>') === 'A · x · y', `listas a bullets: "${htmlToMarkdownLite('<p>A</p><ul><li>x</li><li>y</li></ul>')}"`);

// ── flowVersion 2: recuerdo libre, puntos a reforzar y resultado (§6) ────────
{
	const base = {
		...session,
		recallNotes: 'El bytecode es intermedio; la JVM lo ejecuta en cualquier SO.',
		weakPoints: [
			{ q: '¿Qué compila el JIT y cuándo?', answer: 'Hot spots detectados en runtime, a nativo y cacheados.' },
		],
		result: {
			title: 'Lección completada',
			remembered: { count: 1, total: 4 },
			check: { firstTry: 0, improved: 1, skipped: false },
			practice: 'later',
			calibration: { said: 'Entendido', shown: 'Más o menos', message: 'Te sentías más seguro de lo que mostraste.' },
			cards: { total: 6, reinforce: 1, destination: 'anki' },
		},
	};
	const md2 = buildSessionNoteMarkdown(base, cfg, { today: new Date(2026, 9, 31) });
	assert(md2.includes('## Lo que recordé sin mirar'), 'sección «Lo que recordé sin mirar» presente');
	assert(md2.includes('bytecode es intermedio'), 'el recuerdo libre viaja con su texto');
	assert(md2.includes('## Puntos a reforzar'), 'sección «Puntos a reforzar» presente');
	assert(md2.includes('> [!question]- ¿Qué compila el JIT y cuándo?'), 'pregunta débil como callout plegado');
	assert(md2.includes('**Respuesta:** Hot spots'), 'respuesta correcta plegada dentro');
	assert(md2.includes('## Resultado de la sesión'), 'sección de resultado presente');
	assert(md2.includes('Recordaste (según tú): 1 de 4 ideas'), 'resumen de ideas recordadas');
	assert(md2.includes('Comprobación: 0 a la primera · 1 tras corregir'), 'línea de comprobación');
	assert(md2.includes('Práctica: pendiente'), 'estado de práctica');
	assert(md2.includes('Tarjetas: 6 (1 de refuerzo) · en Anki'), 'línea de tarjetas con destino');
	// El mensaje de calibración ya nombra el nivel elegido y el demostrado (contrato del prototipo).
	assert(md2.includes('> [!info] Calibración: Te sentías más seguro de lo que mostraste.'), 'línea de calibración');
	// Sin datos nuevos, las secciones no aparecen (retrocompatible).
	const md3 = buildSessionNoteMarkdown(session, cfg, { today: new Date(2026, 9, 31) });
	assert(!md3.includes('Lo que recordé sin mirar') && !md3.includes('Puntos a reforzar') && !md3.includes('Resultado de la sesión'),
		'las secciones nuevas no aparecen sin datos');
}

// ── Programa (career track): frontmatter de sesión + MOC del programa ──────
{
	const program = {
		title: 'Associate AI Engineer for Developers',
		slug: 'associate-ai-engineer-for-developers',
		description: 'Aprende a integrar IA en aplicaciones.',
		timeNeeded: '29hrs',
		completionRate: 0.003,
		enrolled: true,
		courses: [
			{ title: 'Trabajar con la API de OpenAI', slug: 'working-with-the-openai-api', position: 0, done: false },
			{ title: 'Ingeniería de prompts con la API de OpenAI', slug: 'prompt-engineering-with-the-openai-api', position: 1, done: null },
			{ title: 'Trabajar con Hugging Face', slug: 'working-with-hugging-face', position: 2, done: true },
		],
	};
	const pPath = buildProgramMocPath(cfg, program.title, program.slug);
	assert(pPath === 'cursos/moc-associate-ai-engineer-for-developers.md', 'ruta del MOC del programa estable');
	const pMd = buildProgramMocMarkdown(program, { today: new Date(2026, 10, 7), sourcesFolder: 'wiki/fuentes', mocsFolder: 'cursos' });
	assert(pMd.includes('type: programa') && pMd.includes('programa_slug: associate-ai-engineer-for-developers'), 'frontmatter del MOC con type y programa_slug');
	assert(pMd.includes('Progreso en la plataforma: **0%**'), 'porcentaje de progreso DataCamp presente');
	assert(pMd.includes('| 1 | [[cursos/trabajar-con-la-api-de-openai|Trabajar con la API de OpenAI]] | ⬜ pendiente |'), 'curso 1 pendiente con enlace');
	assert(pMd.includes('✅ completado'), 'curso completado marcado');
	assert(pMd.includes('— sin dato'), 'curso sin dato de estado');
	assert(pMd.includes('WHERE contains(programas, "associate-ai-engineer-for-developers") OR programa_slug = "associate-ai-engineer-for-developers"'), 'Dataview filtra por lista de programas y slug activo');
	const sessionWithProgram = {
		...session,
		program: { title: program.title, slug: program.slug },
		programs: ['associate-ai-engineer-for-developers', 'openai-fundamentals', 'developing-ai-applications'],
	};
	const mdP = buildSessionNoteMarkdown(sessionWithProgram, cfg, { today: new Date(2026, 10, 7) });
	assert(mdP.includes('programa: "Associate AI Engineer for Developers"'), 'frontmatter programa en la nota de sesión');
	assert(mdP.includes('programa_slug: associate-ai-engineer-for-developers'), 'frontmatter programa_slug en la nota de sesión');
	assert(mdP.includes('programas: [associate-ai-engineer-for-developers, openai-fundamentals, developing-ai-applications]'), 'frontmatter programas con TODOS los programas del curso');
	assert(mdP.includes('[[cursos/moc-associate-ai-engineer-for-developers|Associate AI Engineer for Developers]]'), 'enlace al MOC del programa');
	assert(pMd.includes('WHERE contains(programas, "associate-ai-engineer-for-developers") OR programa_slug = "associate-ai-engineer-for-developers"'), 'Dataview encuentra la sesión desde cualquier programa del curso');
	const mdNoP = buildSessionNoteMarkdown(session, cfg, { today: new Date(2026, 10, 7) });
	assert(!mdNoP.includes('programa:') && !mdNoP.includes('programa_slug'), 'sin programa, nada de programa en la nota');
}

// ── Calidad de exportación: callout anidado y etiqueta no duplicada ─────────
{
	// Callout interview-box con label + lista anidada: el CONTENIDO sobrevive
	// (antes el regex lazy cortaba en el primer </div> y dejaba solo «Entrevista»).
	const backHtml = "<div class='interview-box'><div class='label'>Entrevista</div><ul><li><b>Definición:</b> interfaz programática.</li><li><b>Flujo:</b> solicitud con modelo, datos y parámetros.</li></ul></div>";
	const sessionCallout = {
		...session,
		content: { ...session.content, ankiCards: [{ front: '¿Cómo explicarías en una entrevista qué es la API de OpenAI?', back: backHtml, type: 'entrevista' }] },
	};
	const mdCallout = buildSessionNoteMarkdown(sessionCallout, cfg, { today: new Date(2026, 10, 8) });
	assert(mdCallout.includes('interfaz programática'), 'el contenido de la lista del callout sobrevive');
	assert(mdCallout.includes('solicitud con modelo, datos y parámetros'), 'cada ítem de la lista sobrevive');
	// «Estructura ideal» no se duplica cuando la IA ya lo escribió.
	const dupSession = {
		...session,
		content: { ...session.content, interviewQ: { q: 'q', idealAnswer: 'Estructura ideal: 1) Qué es. 2) Para qué sirve. 3) Ejemplo.' } },
	};
	const mdDup = buildSessionNoteMarkdown(dupSession, cfg, { today: new Date(2026, 10, 8) });
	assert(!mdDup.includes('**Estructura ideal:** Estructura ideal:'), 'no se duplica la etiqueta «Estructura ideal»');
	assert(mdDup.includes('> Estructura ideal: 1) Qué es.'), 'el texto de la IA pasa tal cual');
}

console.log(process.exitCode ? '\nHAY FALLOS' : '\nTODO OK');
