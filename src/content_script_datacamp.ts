/**
 * Punto de entrada del content script para DataCamp.
 *
 * Mismo bootstrap que Udemy (el bootstrap decide por sitio: en app.datacamp.com
 * monta el dock en lecciones de vídeo; en el marco de projector.datacamp.com
 * solo corre el relé de hora/rect del vídeo). Existe como fichero separado para
 * que el build (crxjs) genere su propio chunk y lo publique como recurso
 * web-accesible para los orígenes de DataCamp: el loader carga el módulo con un
 * import dinámico y Chrome lo bloquea si el recurso no está listado para ese
 * origen.
 */
import './content_script';
