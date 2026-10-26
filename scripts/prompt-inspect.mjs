// Inspect the raw outputs for cases whose behavior needs eyeballing, so we fix
// the prompt, not the scoring. Imports the REAL builders from the shared
// module — no mirrors.
//
// Run: node scripts/prompt-inspect.mjs

import {
	buildObjectivesPrompt,
	buildRefinePrompt,
	buildStudyPrompt,
} from '../src/shared/prompts.ts';

const PROXY = process.env.USB_PROXY || 'http://127.0.0.1:6660/v1/chat/completions';
const API_KEY = process.env.USB_API_KEY || 'gmifree';
const MODEL = process.env.USB_MODEL || 'qoder/qwen3.8-flash';

async function ask(prompt, maxTokens = 2048, temperature = 0.2) {
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
	const text = await res.text();
	if (!res.ok) return `HTTP ${res.status}: ${text.slice(0, 200)}`;
	return JSON.parse(text)?.choices?.[0]?.message?.content?.trim() || '(empty)';
}

const cases = [
	['OBJECTIVES — Photography', buildObjectivesPrompt('The Complete Photography Masterclass: Beginner to Advanced', 'Learn camera settings, composition, lighting, portrait and landscape photography, and photo editing.'), 1500, 0.5],
	['OBJECTIVES — Cooking', buildObjectivesPrompt('Italian Cooking Masterclass: Authentic Pasta and Sauces', 'Hands-on course teaching fresh pasta, classic sauces, and traditional Italian cooking techniques.'), 1500, 0.5],
	['REFINE — backend job', buildRefinePrompt('Java Programming Bootcamp', '', 'quiero conseguir un trabajo como backend developer'), 200, 0.4],
	['STUDY — Java', buildStudyPrompt(
		"Now let's see how Java achieves platform independence but without affecting execution speed. Java uses a hybrid approach: first the source code is compiled to bytecode, then the JVM interprets that bytecode at runtime. The JVM is platform-specific, but the bytecode is not, so the same .class file runs anywhere a JVM exists.",
		{
			lectureKey: 'java-platform-independence',
			courseSlug: 'java-programming-bootcamp',
			lectureId: '12345',
			courseName: 'Java Programming Bootcamp',
			courseDescription: 'Complete Java course with Spring Boot, REST APIs, and real project.',
			lessonName: 'Platform Independence in Java',
			objective: 'Conseguir trabajo como backend developer',
			cueCount: 12,
		},
	), 8192, 0.35],
];

for (const [label, prompt, maxTokens, temperature] of cases) {
	console.log(`\n${'='.repeat(60)}\n${label}\n${'='.repeat(60)}`);
	const out = await ask(prompt, maxTokens, temperature);
	console.log(out);
	console.log('\n');
}
