// Resolve hook: intenta la resolución normal; si falla y el specifier es
// relativo (o file:// sin extensión), reintenta con .ts. Los módulos de src/
// importan sin extensión porque Vite lo resuelve solo.
export async function resolve(specifier, context, next) {
	try {
		return await next(specifier, context);
	} catch (error) {
		if ((specifier.startsWith('.') || specifier.startsWith('file://')) && !/\.[cm]?ts?$/.test(specifier)) {
			return next(`${specifier}.ts`, context);
		}
		throw error;
	}
}
