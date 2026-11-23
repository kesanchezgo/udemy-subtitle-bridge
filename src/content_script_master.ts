/** Entry propio para master.dev: crxjs emite el chunk del content script y lo
 * publica como web-accessible resource para este origen (el loader dinámico
 * de MV3 no puede cargar un chunk no listado en web_accessible_resources). */
import './content_script';
