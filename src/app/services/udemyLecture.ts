// Lectura de la página de lección de Udemy que no depende de subtítulos:
// «Ir a la siguiente lección» y lecciones de texto (artículos). Funciones puras
// sobre el DOM (reciben el documento) para poder probarlas sin Udemy real.
//
// OJO: los selectores de Udemy no están verificados en una sesión real desde
// el prototipo; si no encuentran nada, devuelven false/null y Study lo dice.

/** Usa los controles de la propia página; si no los encuentra devuelve false (sin inventar navegación). */
export function goToNextLecture(doc: Document = document): boolean {
	const nextButton = doc.querySelector<HTMLElement>(
		'[data-purpose="go-to-next"], button[data-purpose="go-to-next-button"], [data-purpose="next-item-button"]'
	);
	if (nextButton) {
		nextButton.click();
		return true;
	}
	// Temario: el elemento que sigue al actual (li[aria-current="true"]).
	const current = doc.querySelector('li[aria-current="true"]');
	if (!current) return false;
	const items = Array.from(doc.querySelectorAll('li')).filter((li) => li.querySelector('[data-purpose="item-title"]'));
	const at = items.indexOf(current as HTMLLIElement);
	const next = at >= 0 ? items[at + 1] : undefined;
	const target = next?.querySelector<HTMLElement>('[data-purpose^="curriculum-item-"], [data-purpose="item-title"]');
	if (!target) return false;
	target.click();
	return true;
}

// Sin <video>, el contenido de la lección es el texto del artículo. Solo se lee
// dentro del visor de la lección: nunca Q&A, notas ni la descripción del curso.
const ARTICLE_SELECTORS = [
	'[class*="article-asset--content"]',
	'[class*="article-asset"] [data-purpose="safely-set-inner-html:rich-text-viewer:html"]',
	'[data-purpose="article-container"]',
	'[class*="article-asset"]'
];
const ARTICLE_EXCLUDE = '[role="tabpanel"], [data-purpose*="question"], [data-purpose*="course-description"], [id^="usb-dock-host-"]';
const textOf = (el: Element) => ((el as HTMLElement).innerText ?? el.textContent ?? '');

export function findArticleElement(doc: Document = document): HTMLElement | null {
	if (doc.querySelector('video')) return null;
	for (const selector of ARTICLE_SELECTORS) {
		const candidates = Array.from(doc.querySelectorAll<HTMLElement>(selector))
			.filter((el) => !el.closest(ARTICLE_EXCLUDE) && textOf(el).trim().length >= 300);
		if (candidates.length > 0) {
			return candidates.sort((a, b) => textOf(b).length - textOf(a).length)[0];
		}
	}
	return null;
}

/** «video» | «article» (texto) | «other» (cuestionario, ejercicio, práctica…). */
export function getLectureKind(doc: Document = document): 'video' | 'article' | 'other' {
	if (doc.querySelector('video')) return 'video';
	// DataCamp: el vídeo vive en el iframe del projector, no en este documento —
	// sin esto, una lección de vídeo se clasificaba como «other» y el dock decía
	// «es un cuestionario o ejercicio».
	if (doc.querySelector('iframe[src*="projector.datacamp.com"]')) return 'video';
	return findArticleElement(doc) ? 'article' : 'other';
}

export function collectArticleText(maxChars: number, doc: Document = document): { text: string; source: string; cueCount: number; truncated: boolean } | null {
	const article = findArticleElement(doc);
	if (!article) return null;
	// Bloques de primer nivel (sin repetir un <p> dentro de un <li>); el código conserva sus saltos.
	const blocks = Array.from(article.querySelectorAll<HTMLElement>('p, li, h1, h2, h3, h4, pre, blockquote'))
		.filter((el) => !el.parentElement?.closest('p, li, pre, blockquote'))
		.map((el) => (el.tagName === 'PRE' ? textOf(el).trim() : textOf(el).replace(/\s+/g, ' ').trim()))
		.filter(Boolean);
	let text = (blocks.length > 0 ? blocks.join('\n') : textOf(article)).trim();
	const truncated = text.length > maxChars;
	if (truncated) text = text.slice(0, maxChars);
	return { text, source: 'article-text', cueCount: Math.max(1, blocks.length), truncated };
}
