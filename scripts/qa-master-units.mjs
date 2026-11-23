// Tests puros del adaptador master.dev (Frontend Masters): parseo de learning
// paths y total de lecciones. Sin red, sin credenciales, sin navegador.
// Los parsers usan DOMParser (API de navegador): este arnés aporta el shim
// mínimo para ejecutarlos en Node. node scripts/qa-master-units.mjs
import assert from "node:assert/strict";

// ── DOMParser mínimo (solo etiquetas/atributos/texto que usan los parsers) ────
class Elem {
	constructor(tag, attrs = {}) { this.tagName = tag.toUpperCase(); this.attrs = attrs; this.nodes = []; }
	getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
	get textContent() {
		return this.nodes.map((n) => typeof n === "string" ? n : n.textContent).join("");
	}
	matches(selector) {
		const m = selector.match(/^([a-z][\w-]*)(?:\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\])?$/i);
		if (!m || m[1].toUpperCase() !== this.tagName) return false;
		if (!m[2]) return true;
		const value = this.getAttribute(m[2]);
		return value !== null && (m[3] === undefined || value === m[3]);
	}
	collect(selector, out) {
		for (const node of this.nodes) {
			if (typeof node === "string") continue;
			if (node.matches(selector)) out.push(node);
			node.collect(selector, out);
		}
	}
	querySelectorAll(selector) { const out = []; this.collect(selector, out); return out; }
	querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
const VOID = new Set(["meta", "br", "img", "input", "link", "hr", "source"]);
globalThis.DOMParser = class {
	parseFromString(html) {
		const root = new Elem("html");
		const stack = [root];
		const tokens = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
		let last = 0, match;
		const pushText = (raw) => { if (raw) stack[stack.length - 1].nodes.push(raw); };
		while ((match = tokens.exec(html))) {
			pushText(html.slice(last, match.index));
			last = tokens.lastIndex;
			const closing = match[1] === "/";
			const tag = match[2].toLowerCase();
			if (closing) { if (stack.length > 1 && stack[stack.length - 1].tagName === tag.toUpperCase()) stack.pop(); continue; }
			const attrs = {};
			const attrRe = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
			let a;
			while ((a = attrRe.exec(match[3]))) {
				if (!a[1] || a[1].toLowerCase() === "class" && a[2] === undefined && a[3] === undefined && a[4] === undefined) continue;
				attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
			}
			const el = new Elem(tag, attrs);
			stack[stack.length - 1].nodes.push(el);
			if (!VOID.has(tag)) stack.push(el);
		}
		pushText(html.slice(last));
		return root;
	}
};

const root = new URL("../src/", import.meta.url);
const master = await import(new URL("app/services/masterLecture.ts", root).href);

let passed = 0;
const test = async (name, fn) => {
	try { await fn(); passed += 1; console.log(`PASS ${name}`); }
	catch (error) { console.error(`FAIL ${name}`); throw error; }
};

await test("parseMasterCourseTracks: dos learning paths reales, dedupe y texto limpio", () => {
	const html = `<div class="tags learning-paths"><div>Learning Paths</div><div>
		<span class=tag><a class=FM-Link href=/learn/ai-engineering/>AI Engineering</a></span>
		<span class=tag><a class=FM-Link href=/learn/ai/>Coding with AI</a></span>
		<span class=tag><a class=FM-Link href=/learn/ai/>Coding with AI (dup)</a></span>
		<a href=/learn/>Paths</a><a href=/courses/ai-engineering/>Applied AI Engineering Fundamentals</a>
	</div></div>`;
	const tracks = master.parseMasterCourseTracks(html);
	assert.deepEqual(tracks, [
		{ slug: "ai-engineering", title: "AI Engineering" },
		{ slug: "ai", title: "Coding with AI" },
	]);
	assert.deepEqual(master.parseMasterCourseTracks("<html></html>"), []);
});

await test("parseMasterLearningPathHtml: sintaxis corchete (ai-engineering)", () => {
	const html = `<html><head>
		<title>AI Engineering Learning Path - Build Resilient AI-Powered Software | Master.dev</title>
		<meta name=description content="Gain experience building &amp; hardening AI-enabled features">
	</head><body>
		<script>window._bs.enrollment={},window._bs.progress=[],window._bs.learningPaths=[],window._bs.learningPaths["ai-engineering"]={core:["prompt-engineering","ai-agents-v2","mcp","ai-engineering","ai-agent-workflows","agent-harness"]}</script>
		<a href=/courses/>Courses</a>
		<a href=/courses/prompt-engineering/><h2 class=FM-line-clamp>Practical Prompt Engineering</h2></a>
		<a href=/courses/ai-engineering/><h2 class=FM-line-clamp>Applied AI Engineering Fundamentals</h2></a>
	</body></html>`;
	const path = master.parseMasterLearningPathHtml(html, "ai-engineering");
	assert(path, "debe parsear");
	assert.equal(path.title, "AI Engineering", 'título sin "Learning Path - ..." ni "| Master.dev"');
	assert.equal(path.description, "Gain experience building & hardening AI-enabled features");
	assert.deepEqual(path.coreSlugs, ["prompt-engineering", "ai-agents-v2", "mcp", "ai-engineering", "ai-agent-workflows", "agent-harness"]);
	assert.equal(path.courseTitles["prompt-engineering"], "Practical Prompt Engineering");
	assert.equal(path.courseTitles["ai-engineering"], "Applied AI Engineering Fundamentals");
	assert.equal(path.courseTitles["courses"], undefined, "nav genérico ignorado");
});

await test("parseMasterLearningPathHtml: sintaxis punto (ai) + título alternativo", () => {
	const html = `<html><head><title>Coding with AI Learning Path - Ship Faster with Agentic Tools | Master.dev</title></head><body>
		<script>window._bs.learningPaths.ai={core:["prompt-engineering","codex","claude-code","local-ai","pro-ai","fullstack-app-codex"]}</script>
		<a href=/courses/codex/><h2>Agentic Frontend Development with Codex</h2></a>
	</body></html>`;
	const path = master.parseMasterLearningPathHtml(html, "ai");
	assert(path);
	assert.equal(path.title, "Coding with AI");
	assert.deepEqual(path.coreSlugs, ["prompt-engineering", "codex", "claude-code", "local-ai", "pro-ai", "fullstack-app-codex"]);
	assert.equal(path.courseTitles["codex"], "Agentic Frontend Development with Codex");
	assert.equal(master.parseMasterLearningPathHtml("<html></html>", "ai"), null, "sin core → null");
});

await test("masterLectureTotal: lessonSlugs y respaldo lessonData, null honesto", () => {
	assert.equal(master.masterLectureTotal({ lessonSlugs: ["a","b","c"], lessonData: {} }), 3);
	assert.equal(master.masterLectureTotal({ lessonSlugs: [], lessonData: { a: {}, b: {} } }), 2);
	assert.equal(master.masterLectureTotal({ lessonSlugs: [], lessonData: {} }), null);
	assert.equal(master.masterLectureTotal(null), null);
});

await test("clearMasterCourseCache existe (tests pueden reiniciar caché)", () => {
	assert.equal(typeof master.clearMasterCourseCache, "function");
	master.clearMasterCourseCache();
});

console.log(`QA unidades de master.dev: ${passed}/${passed} OK`);
