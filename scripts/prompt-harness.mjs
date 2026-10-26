// Prompt quality harness. Runs the extension's REAL prompt builders
// (imported straight from src/shared/prompts.ts — no mirrors) against the
// configured provider with a variety of realistic inputs, then scores the
// output the same way the extension does.
//
// Request parameters (temperature / max_tokens) mirror the production call
// sites in src/background.ts 1:1.
//
// Run: node scripts/prompt-harness.mjs
//   USB_MODEL=qoder/qwen3.8-flash node scripts/prompt-harness.mjs

import {
	buildObjectivesPrompt,
	buildRefinePrompt,
	buildSrtTranslationPrompt,
	buildStudyPrompt,
	estimateAnkiCardTarget,
} from '../src/shared/prompts.ts';

const PROXY = process.env.USB_PROXY || 'http://127.0.0.1:6660/v1/chat/completions';
const API_KEY = process.env.USB_API_KEY || 'gmifree';
const MODEL = process.env.USB_MODEL || 'qoder/qwen3.8-flash';

// ─── Test inputs — a mix of technical and non-technical courses ──────────────

const SRT_TECH = [
	{ index: 1, timeLine: '00:00:00,082 --> 00:00:02,100', text: '(lively music)' },
	{ index: 2, timeLine: '00:00:02,100 --> 00:00:03,090', text: 'Dheeru: Hello there.' },
	{ index: 3, timeLine: '00:00:03,090 --> 00:00:05,610', text: 'This is Dheeru Mundluru and welcome back.' },
	{ index: 4, timeLine: '00:00:05,610 --> 00:00:09,540', text: "Now let's see how Java achieves platform independence" },
	{ index: 5, timeLine: '00:00:09,540 --> 00:00:12,423', text: 'but without affecting execution speed.' },
	{ index: 6, timeLine: '00:00:14,340 --> 00:00:17,520', text: 'We discussed about compilation and interpretation,' },
	{ index: 7, timeLine: '00:00:17,520 --> 00:00:21,600', text: 'which offer contrasting benefits and limitations.' },
	{ index: 8, timeLine: '00:00:21,600 --> 00:00:23,520', text: 'We have seen that with compilation' },
];

const SRT_COOKING = [
	{ index: 1, timeLine: '00:00:00,000 --> 00:00:02,000', text: 'Welcome back to the kitchen.' },
	{ index: 2, timeLine: '00:00:02,000 --> 00:00:05,000', text: "Today we're making a classic French omelette." },
	{ index: 3, timeLine: '00:00:05,000 --> 00:00:08,000', text: 'First, crack three eggs into a bowl.' },
	{ index: 4, timeLine: '00:00:08,000 --> 00:00:11,000', text: 'Whisk them until fully combined, with no streaks.' },
	{ index: 5, timeLine: '00:00:11,000 --> 00:00:14,000', text: 'Season with a pinch of salt and white pepper.' },
];

// domainTokens: bilingual (EN/ES) lexicon per course. The model answers in
// Spanish, so matching raw course-name substrings ("camera", "compound")
// against the output produces false negatives — the lexicon encodes what
// counts as domain-specific for THIS course in either language.
const OBJECTIVES_CASES = [
	['Java Programming Bootcamp with Spring Boot, Best Practices, Design Rules & Spring Boot Project — Updated for Java 25', 'Complete Java course with Spring Boot, Spring MVC, REST APIs, JPA/Hibernate, and real project.',
		['java', 'spring', 'api', 'rest', 'jpa', 'mvc', 'backend', 'código', 'programación', 'proyecto']],
	['The Complete Photography Masterclass: Beginner to Advanced', 'Learn camera settings, composition, lighting, portrait and landscape photography, and photo editing.',
		['cámara', 'foto', 'fotografía', 'retrato', 'paisaje', 'luz', 'composición', 'iluminación', 'encuadre', 'edición', 'camera', 'composition', 'lighting']],
	['Italian Cooking Masterclass: Authentic Pasta and Sauces', 'Hands-on course teaching fresh pasta, classic sauces, and traditional Italian cooking techniques.',
		['pasta', 'salsa', 'italian', 'cocina', 'receta', 'masa', 'sartén', 'italiana']],
	['Personal Finance Basics: Budgeting, Saving and Investing', 'Manage your money: build a budget, start an emergency fund, and understand index funds and retirement accounts.',
		['presupuesto', 'dinero', 'ahorro', 'inversi', 'invertir', 'fondo', 'índice', 'jubilación', 'retiro', 'finanza', 'budget', 'index fund']],
];

const REFINE_CASES = [
	['Java Programming Bootcamp', 'quiero conseguir un trabajo como backend developer'],
	['Photography Masterclass', 'aprender a hacer retratos que vendan'],
	['Italian Cooking Masterclass', 'hacer pasta fresca como un chef italiano'],
];

// The study-session prompt needs a transcript. Use realistic excerpts.
const STUDY_TRANSCRIPT_JAVA = `Now let's see how Java achieves platform independence but without affecting execution speed. We discussed about compilation and interpretation, which offer contrasting benefits and limitations. We have seen that with compilation we get fast execution speed but without the benefit of platform independence. And we have also seen that with interpretation, we get the benefit of platform independence but with much slower execution speed. And with Java, we get the best of both worlds. Java uses a hybrid approach: first the source code is compiled to bytecode, then the JVM interprets that bytecode at runtime. The JVM is platform-specific, but the bytecode is not, so the same .class file runs anywhere a JVM exists. JIT compilation further improves speed by compiling hot spots to native code. That is why Java is both portable and fast.`;

const STUDY_TRANSCRIPT_COOKING = `Welcome back to the kitchen. Today we're making a classic French omelette. First, crack three eggs into a bowl. Whisk them until fully combined, with no streaks of white or yolk visible. Season with a pinch of salt and white pepper. Heat a non-stick pan over medium heat and add a knob of butter. When the butter foams but before it browns, pour in the eggs. Stir constantly with a fork while shaking the pan, keeping the eggs moving so they form small, soft curds. Once the eggs are mostly set but still slightly runny on top, stop stirring and let the bottom set for a few seconds. Tilt the pan and fold the omelette over itself, then roll it onto the plate seam-side down. The surface should be smooth, pale yellow, and slightly shiny, not browned.`;

const STUDY_TRANSCRIPT_FINANCE = `Welcome to lesson five on compound interest. Compound interest means your interest earns interest. If you invest one thousand dollars at an annual rate of eight percent, after one year you have one thousand and eighty dollars. But in year two you earn eight percent on one thousand and eighty, not on the original thousand. Over thirty years that growth curve bends upward dramatically. The rule of seventy two tells you how long money takes to double: divide seventy two by the annual return. At eight percent, money doubles roughly every nine years. Fees work the same way in reverse: a one percent annual fee compounds into a huge difference over a career. That is why low cost index funds matter so much for long term investors.`;

const STUDY_CASES = [
	['Java course — technical', STUDY_TRANSCRIPT_JAVA, {
		lectureKey: 'java-platform-independence',
		courseSlug: 'java-programming-bootcamp',
		lectureId: '12345',
		courseName: 'Java Programming Bootcamp',
		courseDescription: 'Complete Java course with Spring Boot, REST APIs, and real project.',
		lessonName: 'Platform Independence in Java',
		objective: 'Conseguir trabajo como backend developer',
		cueCount: 12,
	}, ['java', 'jvm', 'javac', 'bytecode', 'jit', 'compil', 'plataforma', 'intérprete', 'interprete', '.class']],
	['Cooking course — non-technical', STUDY_TRANSCRIPT_COOKING, {
		lectureKey: 'cooking-french-omelette',
		courseSlug: 'italian-cooking-masterclass',
		lectureId: '67890',
		courseName: 'Italian Cooking Masterclass',
		courseDescription: 'Authentic pasta and sauces.',
		lessonName: 'Classic French Omelette',
		objective: 'Aprender a hacer tortillas francesas perfectas para vender',
		cueCount: 8,
	}, ['huevo', 'sartén', 'sarten', 'mantequilla', 'batir', 'fuego', 'omelette', 'tortilla', 'cocina', 'plato', 'doblar']],
	['Finance course — non-technical, interview-adjacent goal', STUDY_TRANSCRIPT_FINANCE, {
		lectureKey: 'finance-compound-interest',
		courseSlug: 'personal-finance-basics',
		lectureId: '24680',
		courseName: 'Personal Finance Basics: Budgeting, Saving and Investing',
		courseDescription: 'Manage your money: build a budget, start an emergency fund, and understand index funds and retirement accounts.',
		lessonName: 'Compound Interest and the Rule of 72',
		objective: 'Empezar a invertir con confianza en mis ahorros personales',
		cueCount: 10,
	}, ['interés', 'interes', 'compuesto', '72', 'duplica', 'inversi', 'invertir', 'fondo', 'índice', 'indice', 'comisión', 'comision', 'tarifa', 'dinero', 'regla', 'porcentaje']],
];

// ─── Runner + scoring ─────────────────────────────────────────────────────────

const results = [];

async function ask(name, prompt, temperature, maxTokens) {
	const t0 = Date.now();
	try {
		const res = await fetch(PROXY, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
			body: JSON.stringify({
				model: MODEL,
				messages: [{ role: 'user', content: prompt }],
				temperature,
				max_tokens: maxTokens,
				stream: false,
			}),
		});
		const ms = Date.now() - t0;
		const text = await res.text();
		if (!res.ok) {
			results.push({ name, ok: false, reason: `HTTP ${res.status}: ${text.slice(0, 120)}`, ms });
			return null;
		}
		const content = JSON.parse(text)?.choices?.[0]?.message?.content?.trim() || '';
		return { content, ms };
	} catch (e) {
		results.push({ name, ok: false, reason: String(e).slice(0, 120), ms: Date.now() - t0 });
		return null;
	}
}

function record(name, ok, reason, extra = '') {
	results.push({ name, ok, reason, extra });
	console.log(`${ok ? '✅' : '❌'} ${name}: ${reason}${extra ? ' | ' + extra : ''}`);
}

function parseLooseJson(content) {
	try { return JSON.parse(content); } catch { /* keep trying */ }
	const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenced) {
		try { return JSON.parse(fenced[1].trim()); } catch { /* keep trying */ }
	}
	const obj = content.match(/\{[\s\S]*\}/);
	if (obj) {
		try { return JSON.parse(obj[0]); } catch { /* keep trying */ }
	}
	const arr = content.match(/\[[\s\S]*\]/);
	if (arr) {
		try { return JSON.parse(arr[0]); } catch { /* keep trying */ }
	}
	return null;
}

// ─── 1. Translation prompt ─────────────────────────────────────────────────────
// Production call site: translateSrtWithProvider → temp 0.15, max_tokens 32768.

console.log(`\n=== SRT translation (technical course) ===`);
const transTech = await ask('SRT-tech', buildSrtTranslationPrompt(SRT_TECH), 0.15, 32768);
if (transTech) {
	const blocks = transTech.content.split(/\n\s*\n/).filter((b) => b.trim());
	const hasTimestamps = blocks.every((b) => /\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/.test(b));
	const hasSpanish = /[áéíóúñ¿¡]|Java|independencia|compilación/i.test(transTech.content);
	const blockCount = blocks.length;
	// Speaker label + sound-cue handling from the polished prompt rules.
	const keptSpeaker = /Dheeru:/i.test(transTech.content);
	const translatedCue = /música|musica/i.test(transTech.content);
	record(
		'SRT translation — Java course',
		hasTimestamps && hasSpanish && blockCount === SRT_TECH.length && keptSpeaker && translatedCue,
		`${blockCount}/${SRT_TECH.length} blocks, timestamps=${hasTimestamps}, spanish=${hasSpanish}, speakerLabel=${keptSpeaker}, soundCue=${translatedCue}`,
		transTech.content.slice(0, 80).replace(/\n/g, ' | '),
	);
}

console.log(`\n=== SRT translation (non-technical course) ===`);
const transCook = await ask('SRT-cooking', buildSrtTranslationPrompt(SRT_COOKING), 0.15, 32768);
if (transCook) {
	const blocks = transCook.content.split(/\n\s*\n/).filter((b) => b.trim());
	const hasTimestamps = blocks.every((b) => /\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/.test(b));
	const hasSpanish = /cocina|huevo|batir|tortilla|ingredientes|sal/i.test(transCook.content);
	record(
		'SRT translation — cooking course',
		hasTimestamps && hasSpanish && blocks.length === SRT_COOKING.length,
		`${blocks.length}/${SRT_COOKING.length} blocks, timestamps=${hasTimestamps}, spanish=${hasSpanish}`,
		transCook.content.slice(0, 80).replace(/\n/g, ' | '),
	);
}

// ─── 2. Objectives prompt ─────────────────────────────────────────────────────
// Production call site: generateObjectivesViaGemini → temp 0.5, max_tokens 1500.

console.log(`\n=== Objectives generation (4 different course domains) ===`);
for (const [name, desc, domainTokens] of OBJECTIVES_CASES) {
	const r = await ask(`obj-${name.slice(0, 20)}`, buildObjectivesPrompt(name, desc), 0.5, 1500);
	if (!r) continue;
	const parsed = parseLooseJson(r.content);
	const ok = Array.isArray(parsed) && parsed.length === 4 &&
		parsed.every((o) => o && typeof o.id === 'string' && typeof o.icon === 'string' && typeof o.title === 'string' && typeof o.sub === 'string');
	// Domain fit: at least one objective must reference THIS course's subject
	// using the bilingual lexicon, not a fixed study-goal template.
	const domainFit = parsed?.some((o) => {
		const text = (o.title + ' ' + o.sub + ' ' + o.id).toLowerCase();
		return domainTokens.some((w) => text.includes(w));
	});
	const noGeneric = parsed?.every((o) => !/^(aprender el curso|estudiar el tema|dominar el contenido|mejorar las habilidades)$/i.test(o.title.trim()));
	record(
		`objectives — ${name.slice(0, 40)}…`,
		ok && (domainFit) && noGeneric,
		ok ? `4/4 valid, domainFit=${domainFit}, no-generic=${noGeneric}` : 'invalid JSON or schema',
		parsed?.slice(0, 2).map((o) => o.title).join(' | '),
	);
}

// ─── 3. Refine prompt ────────────────────────────────────────────────────────
// Production call site: refineObjectiveViaGemini → temp 0.4, max_tokens 200.

console.log(`\n=== Objective refinement ===`);
for (const [course, goal] of REFINE_CASES) {
	const r = await ask(`refine-${course.slice(0, 15)}`, buildRefinePrompt(course, '', goal), 0.4, 200);
	if (!r) continue;
	const text = r.content.trim().replace(/^["']|["']$/g, '');
	const oneLine = !text.includes('\n');
	const reasonable = text.length >= 15 && text.length <= 140;
	// The refine prompt should produce a single outcome-oriented sentence. A
	// response that talks about "tu meta" instead of stating the objective is a
	// sign the model slipped into coaching mode.
	const talksAboutGoal = /tu (meta|objetivo|meta laboral|meta de aprendizaje)/i.test(text);
	const hasAction = /(crear|aplicar|construir|diseñar|practicar|explicar|resolver|mejorar|capturar|editar|preparar|dominar|optimizar|conseguir|lograr|alcanzar|hacer|producir|aprender|postular|buscar|gestionar|manejar|invertir|cocinar)/i.test(text);
	const domainRef = /(java|spring|backend|frontend|api|rest|código|programación|software|desarrollo|developer|desarrollador|fotografía|foto|retrato|paisaje|cocina|pasta|salsa|italian|marketing|ventas|diseño|video|audio|música|idioma|inglés|finanzas|dinero|ahorro|inversi|presupuesto|negocio|emprendimiento)/i.test(text);
	const specific = hasAction && domainRef && !talksAboutGoal;
	record(
		`refine — "${goal.slice(0, 30)}…"`,
		oneLine && reasonable && specific,
		`oneLine=${oneLine} len=${text.length} action=${hasAction} domain=${domainRef} noMeta=${!talksAboutGoal}`,
		text.slice(0, 80),
	);
}

// ─── 4. Study session prompt — the core feature ─────────────────────────────
// Production call site: generateLearningPanelFromTranscript → temp 0.35, 8192.

console.log(`\n=== Study session generation ===`);
for (const [label, transcript, metadata, domainTokens] of STUDY_CASES) {
	const cardTarget = estimateAnkiCardTarget(transcript, metadata.cueCount);
	const prompt = buildStudyPrompt(transcript, metadata);
	const r = await ask(`study-${label.slice(0, 20)}`, prompt, 0.35, 8192);
	if (!r) continue;

	const parsed = parseLooseJson(r.content);

	const issues = [];
	if (!parsed || typeof parsed !== 'object') {
		issues.push('not valid JSON');
	} else {
		const p = parsed;
		if (!p.relevance || !Number.isFinite(Number(p.relevance.score))) issues.push('relevance.score');
		if (!Array.isArray(p.keyConcepts) || p.keyConcepts.length < 4) issues.push('keyConcepts[4]');
		if (!Array.isArray(p.questions) || p.questions.length < 4) issues.push('questions[4]');
		p.questions?.slice(0, 4).forEach((q, i) => {
			if (!q?.q) issues.push(`questions[${i}].q`);
			if (!q?.bloom) issues.push(`questions[${i}].bloom`);
			if (!q?.difficulty) issues.push(`questions[${i}].difficulty`);
			if (!q?.hint) issues.push(`questions[${i}].hint`);
			if (!q?.answer) issues.push(`questions[${i}].answer`);
		});
		const app = p.application;
		if (!app?.setup || !app?.challenge || !app?.solution) issues.push('application fields');
		if (typeof app?.isCode !== 'boolean') issues.push('application.isCode');
		if (!p.quickWin) issues.push('quickWin');
		if (!p.nextAction) issues.push('nextAction');
		if (!Array.isArray(p.ankiCards) || p.ankiCards.length < cardTarget.min) issues.push(`ankiCards[${cardTarget.min}]`);
		p.ankiCards?.slice(0, 5).forEach((c, i) => {
			if (!c?.front || !c?.back || !c?.type) issues.push(`ankiCards[${i}] incomplete`);
		});
	}

	// Domain check: the questions/anki must reference the lesson topic, using
	// the bilingual lexicon for this course (the answer comes back in Spanish).
	const domainHit =
		parsed?.questions?.some((q) =>
			domainTokens.some((w) => `${q?.q || ''} ${q?.answer || ''}`.toLowerCase().includes(w)),
		)
		|| parsed?.ankiCards?.some((c) =>
			domainTokens.some((w) => `${c?.front || ''} ${c?.back || ''}`.toLowerCase().includes(w)),
		);

	// Non-technical lessons must not be framed as code.
	const wrongDomain = !label.startsWith('Java') && parsed?.application?.isCode === true;

	// Anki card format contract (mirrors the dev-card template in
	// StudyAgentTab.tsx): code blocks carry a language class, no badge
	// prefixes, no markdown fences, no inline styles, only whitelisted classes.
	const allowedClass = /^(concept-box|tip-box|warning-box|interview-box|label|language-[\w#+.-]+)$/;
	const formatIssues = [];
	(parsed?.ankiCards || []).forEach((c, i) => {
		const body = `${c?.front || ''}\n${c?.back || ''}`;
		if (/^(💻\s*CÓDIGO|CÓDIGO)/i.test(c?.front || '') || /^(💻\s*CÓDIGO|CÓDIGO)/i.test(c?.back || '')) formatIssues.push(`card${i}: badge prefix`);
		if (/```/.test(body)) formatIssues.push(`card${i}: markdown fence`);
		if (/style=/i.test(body)) formatIssues.push(`card${i}: inline style`);
		for (const m of body.matchAll(/class=["']([^"']+)["']/g)) {
			for (const token of m[1].split(/\s+/)) {
				if (!allowedClass.test(token)) formatIssues.push(`card${i}: class "${token}"`);
			}
		}
		for (const m of body.matchAll(/<pre[^>]*>/gi)) {
			if (!/language-/i.test(m[0])) formatIssues.push(`card${i}: <pre> sin language-*`);
		}
	});
	// Soft quality signal: the back should open with the direct answer
	// (término clave en <b>) — advisory, reported but not fatal.
	const boldFirstLine = (parsed?.ankiCards || []).filter((c) => {
		const first = String(c?.back || '').split(/<\/p>|<br|<\/li>|<\/div>/i)[0] || '';
		return /<(b|strong)>/i.test(first.slice(0, 160)) || String(c?.back || '').length < 60;
	}).length;
	const ankiTotal = parsed?.ankiCards?.length ?? 0;

	record(
		`study — ${label}`,
		issues.length === 0 && domainHit && !wrongDomain && formatIssues.length === 0,
		issues.length > 0
			? `missing: ${issues.slice(0, 5).join(', ')}`
			: formatIssues.length > 0
				? `format: ${formatIssues.slice(0, 4).join(', ')}`
				: `valid JSON, ${ankiTotal} cards (target ${cardTarget.min}-${cardTarget.max}), ${parsed.questions?.length ?? 0} questions, domainHit=${domainHit}, boldFirstLine=${boldFirstLine}/${ankiTotal}`,
		parsed?.keyConcepts?.slice(0, 2).join(' | ') || '(no keyConcepts)',
	);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length;
console.log(`\n=== SUMMARY (${MODEL} @ ${PROXY}) ===`);
console.log(`${passed}/${results.length} prompt behaviours passed`);
console.log('\nFailed cases:');
results.filter((r) => !r.ok).forEach((r) => console.log(`  ❌ ${r.name}: ${r.reason}`));

process.exit(passed === results.length ? 0 : 1);
