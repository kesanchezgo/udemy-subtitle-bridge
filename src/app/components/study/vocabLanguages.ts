/**
 * Idiomas del vocabulario (fase 5.1: una sola lista para Ajustes → Idiomas y
 * Ajustes → Anki). `english` es el nombre que va en el mazo y en el tipo de
 * nota («Kinema::Vocabulary::English»); `label`, el que se lee en la interfaz.
 */
export const TARGET_LANGUAGES = [
  { id: "en", label: "Inglés", english: "English" },
  { id: "fr", label: "Francés", english: "French" },
  { id: "de", label: "Alemán", english: "German" },
  { id: "pt", label: "Portugués", english: "Portuguese" },
  { id: "it", label: "Italiano", english: "Italian" },
];

/** Se guarda el nombre en minúsculas: es lo que recibe el prompt. */
export const EXPLANATION_LANGUAGES = [
  { id: "español", label: "Español" },
  { id: "inglés", label: "Inglés" },
  { id: "portugués", label: "Portugués" },
  { id: "francés", label: "Francés" },
  { id: "alemán", label: "Alemán" },
  { id: "italiano", label: "Italiano" },
];

/** «English» → «Inglés» (o el código, si no es uno de los conocidos). */
export function languageName(config: { targetLang: string; targetLangLabel?: string }): string {
  return TARGET_LANGUAGES.find(option => option.id === config.targetLang)?.label ?? config.targetLangLabel ?? config.targetLang;
}
