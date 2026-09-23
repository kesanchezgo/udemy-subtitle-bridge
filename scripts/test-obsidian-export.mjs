// Verifica los builders de exportación a Obsidian sin chrome (Node 24+).
// Run: node scripts/test-obsidian-export.mjs

import {
	buildSessionNotePath,
	buildSessionNoteMarkdown,
	buildCourseMocPath,
	buildCourseMocMarkdown,
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
assert(md.includes('source_url: "https://www.udemy.com/'), 'source_url');
assert(md.includes('[[cursos/java-programming-bootcamp-spring-boot-rest-apis|'), 'enlace al MOC');
assert(md.includes('## Ideas clave') && md.includes('- javac compila a bytecode'), 'ideas clave');
assert(md.includes('## Preguntas de calibración') && md.includes('Respuesta: Un .class'), 'preguntas');
assert(md.includes('- [ ] Ejecutar con -XX:+PrintCompilation'), 'next action como task');
assert(md.includes('#flashcards') && md.includes('- ¿Qué produce `javac`? :: **Bytecode** en `.class`'), 'tarjetas SR');
assert(md.includes('¿Qué imprime `System.out.println(1+2)`?'), 'front con código inline');
assert(md.includes('`System.out.println(1 + 2); // 3`'), 'código de bloque colapsado a inline en tarjeta');
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

console.log(process.exitCode ? '\nHAY FALLOS' : '\nTODO OK');
