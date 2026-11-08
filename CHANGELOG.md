## [1.8.11] — 2026-11-08

Reporte de producción: el 200 del proxy con 33.640 B era el escalón 1 llegando (con JSON truncado), el toast mostraba el 401/403 del escalón 2 y tiraba la historia real. Cambia código de la extensión, por eso sube la versión.

- **El error de generación cuenta la historia completa.** Cada escalón registra su resultado (`escalón 8192 (con razonamiento): 33.640 B · JSON truncado… · escalón 16384: HTTP 401/403…`) y el toast añade el «Detalle: …» técnico — ya no se ve solo el último fallo, que era del REINTENTO y no de la generación original.
- **Reintento único por escalón en errores transitorios del pool** (401/403/429/5xx tras 4 s): el estado del proxy gira en segundos — esta producción ya lo mostró (200 → 503 → 200). Sin reintento en fallos permanentes.
- Consola del service worker con la traza por escalón siempre (antes solo en DEV).
- **Prototipo (.mock) al día**; `qa:full` **59/59**, `qa:datacamp` y `qa:datacamp:flow` en verde.

## [1.8.10] — 2026-11-08

Auditoría de calidad de la nota de Obsidian sobre la exportación real del usuario: dos defectos de contenido encontrados y corregidos. Cambia código de la extensión, por eso sube la versión.

- **El callout de entrevista perdía su contenido en la nota.** El conversor usaba un regex lazy que cortaba en el PRIMER `</div>` — el del `<div class="label">` anidado — y la lista completa de la respuesta (Definición/Flujo/Cierre) desaparecía, dejando solo la palabra «Entrevista». Ahora el conversor recorre con balance de `<div>/</div>`, usa el texto del label interno como etiqueta y conserva listas y negritas.
- **«Estructura ideal» se duplicaba.** La IA a veces ya escribe «Estructura ideal: …» y el builder anteponía la etiqueta otra vez. Ahora se detecta y el texto pasa tal cual.
- **Tests**: el fixture de la nota incluye el callout anidado real (label + lista) y el caso de la etiqueta duplicada — ambos en `test-obsidian-export`.
- **Prototipo (.mock) al día**; `qa:full` **59/59**, `qa:datacamp` y `qa:datacamp:flow` en verde.

## [1.8.9] — 2026-11-08

Corrección de alcance del 1.8.7: NO era solo la tarjeta de entrevista — TODAS las tarjetas con HTML del modelo (tablas, listas, callouts) sufrían lo mismo, y la re-exportación desde Historial tampoco se reparaba. Cambia código de la extensión, por eso sube la versión.

- **Reparación en el EXPORT, no solo en la generación**: `exportApkgFile` detecta ahora las estructuras de bloque de la lista blanca del prompt (`div` callouts, `p/b/em/code/pre`, listas, tablas, blockquote, details/summary) en front/back y las trata como HTML aunque la tarjeta se haya guardado sin la marca — así se reparan TAMBIÉN las lecciones exportadas con builds anteriores y re-exportadas desde el Historial.
- **Sniff de generación ampliado** a la misma lista blanca completa (antes solo callouts + listas/tablas).
- **Prototipo (.mock) al día**; `qa:full` **59/59**, `qa:datacamp` y `qa:datacamp:flow` en verde.

## [1.8.8] — 2026-11-08

Reporte de producción: el objetivo refinado se perdía al cambiar de lección o recargar. Cambia código de la extensión, por eso sube la versión.

- **El objetivo refinado ahora se persiste** (`agent_refined_obj` / `agent_refined_from` por storage, el mismo canal que el objetivo personalizado): sobrevive recargas y cambios de lección, y solo se vacía con el descarte (X). Tras «Usar como mi texto» sigue coherente (el texto usado = el refinado).
- **Prototipo (.mock) al día**; `qa:full` **59/59**, `qa:datacamp`, `qa:datacamp:flow` y `test-obsidian-export` en verde.

## [1.8.7] — 2026-11-08

Primer uso real en producción destapó el bug de la tarjeta de entrevista, y entran los tags de plataforma. Cambia código de la extensión, por eso sube la versión.

- **La tarjeta de entrevista ya no muestra HTML crudo.** El modelo mandó el back con el callout `interview-box` autorizado por el propio prompt pero SIN `isHtml: true`, y la normalización lo respetaba tal cual: la preview del dock pintaba las etiquetas y Anki habría recibido el HTML escapado. Ahora la normalización detecta las estructuras de bloque que el prompt autoriza (callouts, listas, tablas, blockquotes, details, pre) y las marca como HTML de confianza. Las tarjetas ya exportadas se reparan solas al re-exportar (el GUID no cambia: actualiza, no duplica).
- **Tag de plataforma en las tarjetas**: `kinema/platform::datacamp|udemy` junto a `kinema::track::…` — filtrar por origen sin fragmentar el árbol de mazos (la estructura `<Root>::Courses::<Curso>::<Lección>` no cambia).
- **Prototipo (.mock) al día**; `qa:full` **59/59**, `qa:datacamp` y `qa:datacamp:flow` en verde.

## [1.8.6] — 2026-11-07

«Otra variante» del objetivo refinado era decorativa: reenviaba la MISMA petición (mismo prompt, temperatura 0.4, sin memoria) y el modelo repetía el resultado; además el prompt anclaba el objetivo a la marca del curso («…la API OpenAI…») ignorando el alcance que el estudiante pidió («no solo openai»). Cambia código de la extensión, por eso sube la versión.

- **Memoria de variantes**: el dock recuerda hasta 5 variantes ya mostradas del MISMO texto y las envía como «PROHIBIDO repetirlas o reformularlas mínimamente — da un ÁNGULO claramente distinto (aplicaciones, fundamentos, entrevistas, integraciones, proyectos…)»; al editar el texto, la memoria se reinicia. Con variantes en juego la temperatura sube a 0.75 (primera pasada: 0.4).
- **Anti-anclaje**: regla nueva en el prompt — «EL TEXTO DEL ESTUDIANTE MANDA sobre el curso»: si pide un alcance más amplio («no solo X, también Y»), la variante cubre el alcance completo y no se centra en X solo porque el curso se llame así.
- **El refinado ahora conoce el programa** (título, posición, descripción) y la plataforma: el objetivo encaja con la ruta (AI Engineering es más amplio que un solo proveedor).
- **Prototipo (.mock) al día** (prompts, background, localAI, StudyAgentTab); `qa:full` **59/59**, `qa:datacamp` y `qa:datacamp:flow` en verde.

## [1.8.5] — 2026-11-07

Auditoría del mapeo multi-programa: un curso en VARIOS programas ya se mapea bien en todo. Cambia código de la extensión, por eso sube la versión.

- **La preferencia manual ya no envenena otros cursos.** La elección era global: elegir el programa A y abrir un curso que NO pertenece a A dejaba el programa vacío aunque DataCamp marcara inscrito y activo en otro track del curso. Ahora la resolución es POR CURSO: la preferencia manual aplica solo a los cursos que pertenecen a ese track («Sin programa» sigue siendo el apagón global), y cualquier otro curso resuelve por su propia autodetección. Verificado con un slug ajeno al curso: el mapeo no se altera.
- **Las sesiones se mapean a TODOS los programas del curso.** Un curso en 4 programas se estudia una vez, pero pertenece a las 4 rutas: la nota de la lección lleva ahora `programas: [slug1, slug2, …]` (además de `programa`/`programa_slug` activos) y el MOC del programa encuentra sus sesiones con `WHERE contains(programas, "…") OR programa_slug = "…"` — estudiar el mismo curso desde otro programa no lo saca de los MOCs anteriores.
- **Arnés:** `qa:datacamp` **28/28** con el caso de envenenamiento; `qa:full` **59/59**; `test-obsidian-export` con aserciones de la lista `programas` y del Dataview nuevo. Prototipo (.mock) al día.

## [1.8.4] — 2026-11-07

El programa entra en la capa de IA: objetivos y sesión de estudio ya consideran la ruta de aprendizaje. Además, los prompts dejan de decir «Udemy» en cualquier plataforma. Cambia código de la extensión, por eso sube la versión.

- **Los prompts reciben el programa.** La generación de sesión (`buildStudyPrompt`) y la de objetivos (`buildObjectivesPrompt`) reciben `PROGRAMA: <título> — curso N de M` + `DESCRIPCIÓN DEL PROGRAMA`, con su regla pedagógica: el programa marca la dirección de aprendizaje (en objetivos, al menos 2 de los 4 deben encajar con esa ruta) y la transcripción sigue siendo la fuente de verdad. La posición es la real del curso dentro del programa.
- **Plataforma honesta en los prompts.** Las personas de los prompts decían «estudiantes de Udemy» / «cursos online de Udemy» también al estudiar DataCamp; ahora son neutras y viaja `PLATAFORMA: datacamp|udemy` con el mensaje (la nota de sesión ya citaba la plataforma desde 1.8.0).
- **Cadena completa**: dock (memo con posición real y descripción) → mensajes (`platform` + `program`) → background (validación de forma) → prompts; y la ruta de objetivos vía `objectivesService` → `localAI` → background. Opcional de punta a punta: en Udemy nada de esto viaja y los prompts no mencionan programa.
- **Prototipo (.mock) al día** (prompts, localAI, objectivesService, StudyAgentTab); `qa:datacamp` **28/28**, `qa:full` **59/59**, `qa:datacamp:flow` en verde.

## [1.8.3] — 2026-11-07

El programa deja de ser una elección: se AUTODETECTA. Cambia código de la extensión, por eso sube la versión.

- **Cero clics.** Al abrir una lección de DataCamp, el content script pregunta a la API del track por CADA candidato del curso y auto-elige el que DataCamp marca como **inscrito y activo** (a más progreso si hubiera varios). La API de «mis tracks» está muerta (404 también para la propia SPA), así que la autodetección usa el estado por track que ya conocíamos. Cacheado 24 h por curso.
- **La elección manual siempre gana**: si el usuario elige un track (o «Sin programa») en el selector, esa decisión manda y no se pisa; borrando la elección vuelve la autodetección. Verificado en `qa:datacamp` (**27/27**): autodetección correcta, override manual a otro track y regreso a la autodetección.

## [1.8.2] — 2026-11-07

Paridad completa del programa entre sitios: la re-exportación desde el Historial ya lleva el tag del programa. Cambia código de la extensión, por eso sube la versión.

- **El registro guarda el programa elegido** (`dcTrackSlug` en el historial, escrito al cerrar la lección): la re-exportación del `.apkg` desde el Historial lleva el tag `kinema::track::<slug>` IGUAL que la exportación del cierre — antes solo la del cierre lo tenía, y una lección re-exportada de DataCamp salía sin su programa.
- **Prototipo (.mock) al día** con las mismas ediciones; `qa:datacamp` **24/24**, `qa:full` **59/59**.

## [1.8.1] — 2026-11-07

Auditoría de la integración del programa: tres fallos encontrados y corregidos antes de usarlo en serio. Cambia código de la extensión, por eso sube la versión.

- **El contexto de programa ya no se cuela en Udemy.** `dc_program_context` vive en storage.sync y sobrevive a los sitios: al abrir un curso de Udemy después de uno de DataCamp, el selector de programa aparecía y las tarjetas de UDEMY llevaban el tag `kinema::track::…` de DataCamp. Ahora el gate es por SITIO (`hostname`), no solo por la existencia del storage — en Udemy el programa no existe aunque quede contexto guardado.
- **Los enlaces de curso del MOC del programa respetan la carpeta de MOCs.** Enlazaban a la raíz del vault; ahora usan `mocsFolder` como el MOC de curso (`[[cursos/<curso>|…]]`), con la carpeta configurada por el usuario.
- **El estado ✅/⬜ del MOC ya no se desalinea con proyectos intercalados.** `userContent` se alineaba por índice contra los SOLO cursos mientras la lista completa intercala proyectos opcionales; ahora se alinea contra la lista completa y se descarta lo que no es curso (el id, si viene, manda).
- **Prototipo (.mock) al día** con el gate por sitio; `qa:datacamp` **24/24**, `qa:full` **59/59**, `qa:datacamp:flow` y `test-obsidian-export` en verde.

## [1.8.0] — 2026-11-07

Los programas (career tracks) de DataCamp entran como CONTEXTO: la generación sigue curso por curso y nada se duplica. Cambia código de la extensión, por eso sube la versión.

- **El curso sabe a qué programas pertenece.** El outline que el adaptador ya descarga trae `tracks[]` — un curso puede estar en VARIOS programas a la vez (el de la prueba: 4). Por eso el programa es contexto, nunca unidad de estructura: los mazos por programa duplicarían tarjetas (en Anki una tarjeta vive en UN mazo) y las carpetas por programa obligarían a copiar las notas. Udemy no tiene programa: sin `dc_program_context` nada de esto existe.
- **Selector de programa en el dock.** En «Datos del curso» aparece «Programa: …» con los tracks del curso y «Sin programa (solo este curso)»; la elección (`dc_active_track`) viaja por storage y el content script trae el programa completo de la API del track (`learn-hub-api…/user-track-v2/<slug>`): cursos en orden con títulos resueltos por id (caché 24 h), tiempo estimado y el progreso que la propia plataforma tiene del usuario. Debajo, «Programa: … · curso N de M · X% del programa».
- **Anki: el programa va por TAG, no por mazo.** Con programa elegido, todas las tarjetas de la lección llevan `kinema::track::<slug>` — filtrable en Anki, multi-programa sin duplicación y sin tocar el árbol `<Root>::Courses::<Curso>::<Lección>`.
- **Obsidian: frontmatter + MOC del programa.** La nota de la lección lleva `programa`/`programa_slug` y enlaza al MOC; la exportación encadena un clic más —«MOC del programa»— que crea `cursos/moc-<slug>.md` con los cursos EN ORDEN (enlace al MOC de cada curso, estado según DataCamp: ✅/⬜/—), tiempo estimado, progreso y una consulta Dataview que lista las sesiones estudiadas (`WHERE programa_slug = "…"`). Enlace sin resolver intencionado hasta crear los MOC de curso.
- **Siguiente curso del programa.** En Fijar, si DataCamp marca el curso actual como completado y hay programa, aparece «Siguiente curso del programa: …» con deep-link a la primera lección (el track da el orden). La nota de sesión además cita la plataforma real (`platform: datacamp`) en raw/ y frontmatter.
- **Prototipo (.mock) al día**: mismos cambios en `StudyAgentTab.tsx` (la UI de programa queda gated por storage y no se renderiza allí sin datos) y `obsidianExport.ts` (builders nuevos).
- **Arnés:** `qa:datacamp` pasa a **24/24** con el bloque de programa (tracks del outline, elección del track, 10 cursos en orden con el nuestro primero, progreso DataCamp, sugerencia del siguiente curso y el selector pintado en el dock). `qa:full` sigue **59/59** (Udemy sin programa: ni selector ni fila), `qa:datacamp:flow` en verde, y `test-obsidian-export` suma 11 aserciones de programa (frontmatter, ruta estable del MOC, tabla en orden y Dataview).

## [1.7.1] — 2026-11-07

Tres correcciones del soporte de DataCamp reportadas en la primera prueba. Cambia código de la extensión, por eso sube la versión.

- **El dock vive DENTRO de la página, no encima.** En DataCamp el dock era `fixed` sobre el contenido: ahora el ajuste de layout de Udemy tiene su equivalente — `<main>` de la lección recibe un margen derecho igual al ancho del dock (con transición), el contenido se estrecha y el dock queda AL LADO. Al destruirse el dock (ejercicio sin vídeo), el margen vuelve a 0. Verificado: `main.right ≤ dock.left` con dock abierto y `margin-right: 0px` sin él.
- **Redimensionado: ampliar vuelve a funcionar tras reducir.** El asa escuchaba `mousemove` en `document`: al ampliar, el arrastre cruza el contenido y, sobre el iframe del reproductor, esos eventos se pierden y el ancho quedaba clavado en el valor reducido. Ahora el asa usa Pointer Events con **captura de puntero** (`setPointerCapture`): todos los eventos llegan al asa pase el puntero por donde pase (la captura se suelta sola en pointerup/cancel). En Udemy el mismo ciclo ampliar→reducir→ampliar funciona igual.
- **Curso doblado al español: el overlay sale DESACTIVADO.** La detección de idioma (del contenido del VTT) ahora decide: si el audio ya está en español, los subtítulos no aportan nada — el overlay arranca apagado y el motivo en el estado lo dice («El vídeo ya está doblado al español: subtítulos desactivados»). El push de configuración del dock al montar ya no lo re-enciende por encima: el contexto de lección lleva `siteDubbedEs` y el sidebar anula el push efectivo en runtime sin tocar el ajuste global persistido (en Udemy queda el que el usuario dejó). Quien quiera los subtítulos igualmente, los enciende y funcionan (cues en español por el relé del marco). El VTT sigue sembrado para el transcript del estudio.
- **Arnés:** `qa:datacamp` pasa a **18/18** con los tres casos nuevos (layout sin solape, ciclo ampliar/reducir/ampliar con arrastre real sobre el iframe, doblaje con overlay apagado + opt-in manual). `qa:full` sigue **59/59**.

## [1.7.0] — 2026-11-07

DataCamp entra como segundo sitio. Cambia código de la extensión, por eso sube la versión.

- **Soporte de DataCamp en lecciones de vídeo.** Las lecciones de vídeo (`VideoExercise`) de `app.datacamp.com` montan el dock; los ejercicios de código, chat y pruebas no (ahí no hay vídeo, que es la única «zona de vídeo» de DataCamp). El reproductor vive en un iframe cross-origin (`projector.datacamp.com`): el mismo content script corre en dos modos — en el marco superior monta dock y overlay, y dentro del iframe un relé mínimo manda hora, duración y rectángulo del `<video>` por postMessage; con eso el overlay se ancla al vídeo real dentro del iframe y los cues avanzan con la reproducción.
- **Subtítulos oficiales en WebVTT, sin romper nada del pipeline.** La API pública del projector (`/api/videos/{key}`) trae las pistas de subtítulos por idioma; el adaptador siembra el VTT en el mismo estado que ya usa Udemy (`capturedEnVtt`/`capturedCues`), así que traducción, caché por lección, chip de glosario y flujo de estudio funcionan sin cambios. Si la pista ya está en español (cursos doblados: el idioma se detecta del CONTENIDO del VTT, no de la etiqueta — DataCamp etiqueta «English» a pistas traducidas) se muestra tal cual sin gastar IA; si está en inglés, el pipeline de traducción con jerga técnica preservada la toma como siempre. La key estable de caché es la `projector_key`.
- **Contexto real para el estudio**: curso y lección vienen de la API del outline y del deck del projector (el título de la lección es el de la PRIMERA diapositiva; el del deck es el del curso), «Ir a la siguiente lección» pulsa el botón de la SPA (`aria-label="Ir al siguiente ejercicio"`), y el poll de 1 s reevalúa en DataCamp aunque la URL no cambie (el iframe del reproductor aparece después de la navegación).
- **Manifest**: nueva entrada de content script con `all_frames` para `app.datacamp.com` + `projector.datacamp.com` con su propio punto de entrada (`content_script_datacamp.ts`) — el build (crxjs) publica los chunks como recursos web-accesibles por origen, sin exponer el puente de red de Udemy fuera de su sitio. `host_permissions` añade `https://*.datacamp.com/*`.
- **Arnés:** `npm run qa:datacamp` (14 comprobaciones) contra DataCamp real, con las cookies de sesión en `.qa-datacamp-cookies.json` (ignorado por git, nunca versionar): dock solo en vídeo, contexto curso/lección, subtítulo en español sin IA, cues que avanzan con el relé, transcripción del estudio, desaparición en un ejercicio de chat y regreso en otra lección de vídeo. `qa:full` sigue 59/59.

## [No liberado]

- **Arnés:** `qa:datacamp:flow` recorre el FLUJO COMPLETO de estudio sobre DataCamp real con IA mock determinista (sin gastar el proveedor): generación a partir del transcript de DataCamp (3.388 chars), Recordar con marcado de ideas, Comprobar con revisiones y plan «de 3» (checkCap), Aplicar con el reto del estudio, Fijar con «Tarjetas de la lección» y «Terminar lección», celebración incluida, y el registro del historial persistido como completado con ideas, preguntas, 3 tarjetas Anki y los nombres reales de curso/lección de DataCamp. El lector de storage filtra el service worker PROPIO de DataCamp (`gsstm.datacamp.com`, sin API `chrome`) que aparecía en `context.serviceWorkers()` y hacía fallar la lectura.
- **Arnés:** `qa-real-usage` mide la sesión A→B y cierra cada corrida con una línea `plan · …`: tamaño del mazo persistido, ideas marcadas al entrar a Comprobar, «Pregunta N de M» del plan, por cada «Revisar mi respuesta» los segundos hasta el veredicto pintado y si siguió consolidación, la config activa (kind, endpoint sin query, modelo) y la celebración (clic en «Terminar lección» → toast, hasta 20 s). Solo lee: no cambia qué marca ni qué teclea el arnés. Resultados de las cinco corridas y su lectura en `docs/QA_HUMAN_SESSION.md`.

## [1.6.3] — 2026-11-06

Corregir la API key ya no deja el indicador en «sin respuesta». Sin cambios en el flujo de estudio, los mazos ni Obsidian.

- **La huella de la caché de salud incluye la key.** En 1.6.2 la huella solo guardaba si había key, no cuál: al corregir una key mala con el mismo proveedor, la misma URL y el mismo modelo, la huella no cambiaba y el sondeo con la key anterior, aún en vuelo, volvía a llenar la caché con su «no responde» hasta 15 s, con las acciones de IA bloqueadas. Es el caso más habitual (pegar mal la key y corregirla). Ahora la key entra como resumen FNV-1a de 32 bits: cambiarla cambia la huella y la key no queda en claro en la caché.
- **Arnés:** `qa:full` pasa a **59/59** con «corregir la key no deja el veredicto de la key anterior» (mismo proveedor y URL; con la key mala el mock tarda más que el timeout del sondeo). Sin el arreglo falla; con él, pasa. Corregido el comentario del mock lento de I.5: el sondeo aborta a los 1,8 s, antes de que el mock conteste.

## [1.6.2] — 2026-11-06

La caché de salud del proveedor de IA dejaba bloqueada la extensión con un proveedor sano. Cambia código de la extensión, por eso sube la versión.

- **La caché de salud va ligada a la configuración del proveedor** (`providerConfigFingerprint`). El veredicto del sondeo se guardaba sin relación con la configuración con la que se había hecho: al cambiar de proveedor, un sondeo del ANTERIOR que seguía en vuelo terminaba después y volvía a llenar la caché con su «no responde». El dock leía ese veredicto, mostraba el endpoint viejo y dejaba bloqueadas las acciones de IA hasta que caducaba la caché (15 s) — con el proveedor nuevo funcionando. Ahora un veredicto solo se sirve y se guarda si la configuración es la misma, así que el resultado de un sondeo obsoleto se descarta.
- **El arnés lo reproduce**: la sección I estrena la comprobación «un sondeo tarde del proveedor anterior no deja «sin respuesta» al nuevo» (mock que contesta a los 3 s y cambio de proveedor durante el sondeo). Sin el arreglo falla; con él, pasa. Verificado en las dos direcciones.
- **Las confirmaciones de clic del arnés son por selector.** Esperaban el texto de un `placeholder` —«Lo que recuerdo es…», «Escribe tu respuesta…»—, que no vive en `textContent`: tres de las seis agotaban su plazo entero (unos 58 s por ejecución) y el clic funcionaba por tiempo, el mismo patrón que la medición de los avisos. Ahora esperan un `textarea[placeholder^=…]`, el botón por su texto o `[data-skip-step]`. Las capturas de pantalla de la suite dejan de ser fatales: son evidencia, no aserciones, y una captura que no llega por carga de la máquina no debe tumbar el informe.
- **El conteo de sondeos vuelve a ser estricto** (todos los eventos, ≤ 2 en 31 s). Los `ok:false` de más que obligaron a contarlos por separado no eran el service worker dormido: eran esta caché sirviendo el veredicto del proveedor anterior. Con el arreglo dejan de aparecer.
- **`qa:full` pasa de 57 a 58 comprobaciones** y baja de ~254 s a ~200 s por ejecución, al no gastar los plazos de las confirmaciones que nunca se cumplían.

## [1.6.1] — 2026-11-06

Correcciones de la auditoría posterior a 1.6.0. Sin cambios en el flujo de estudio, los mazos ni Obsidian.

- **La API key de Gemini ya no se ve en pantalla.** El sondeo pide `…/models?key=…` y devolvía esa URL entera como `endpoint`: con Gemini configurado y sin respuesta (key revocada, sin red), el CTA, los tooltips de Regenerar, Refinar y Vocabulario y el error de Captions mostraban «El proveedor no responde (…?key=…)». Ahora el service worker devuelve y guarda el endpoint sin query (`redactProviderUrl`), también en `usg_provider_health_debug` y en el log `[USG][provider]`, y `aiBlockedMessage` la quita por segunda vez. Un registro de depuración antiguo con la key se sobrescribe en el siguiente sondeo.
- **El indicador de IA de la cabecera dice la verdad también en la nube.** Con OpenAI, Claude o Gemini mostraba siempre «· nube», aunque faltara la API key o el proveedor no respondiera, mientras el CTA decía lo contrario. Ahora dice «sin configurar» o «sin respuesta» (punto ámbar), y «nube» solo cuando responde o aún no se sabe. El nombre del motor se toma de la configuración vigente, así que también sigue un cambio hecho en otra pestaña. IA local, sin cambios.
- **El sondeo de IA ya no acumula cadenas.** Cada «Guardar» del proveedor arrancaba un sondeo sin cancelar el temporizador pendiente: una cadena más en Study y dos en Captions (evento + storage), vivas hasta cerrar el dock. Ahora cada sondeo nuevo cancela el pendiente y descarta una respuesta atrasada. Study, además, escucha el cambio por storage como Captions. Siguen siendo dos sondeos separados (ver 1.5.13).
- **Sin reintentos huérfanos.** Si se recarga la extensión con una pestaña de Udemy abierta, los sondeos de esa pestaña se detienen en vez de reintentar cada 5 s. Captions lee `chrome.runtime.lastError`, como ya hacía Study.
- **Restos:** fuera `hooks/useHotkeys.ts` y `components/figma/ImageWithFallback.tsx`, que la extensión no usaba (siguen en el prototipo). El aviso de sesión lista ya no habla de «plan de dominio». El comentario de `useAiHealth` ya no atribuye consumidores que tienen su propio sondeo.
- **Arnés:** `qa:full` pasa de 53/53 a **57/57** con la sección I: «Gemini · sin configurar», «Gemini · sin respuesta» (mock que responde 401), la key nunca en el dock ni en el debug, y tres cambios de proveedor seguidos sin sondeos acumulados (≤ 2 en 31 s). Requiere el puerto 8010 libre: con una IA local ahí, el service worker la usa de reserva. Nuevo `npm run qa:ai-health`, sin navegador: redacción de URLs, motivo del bloqueo e indicador en los 7 estados. Las dos comprobaciones de posición de los avisos miden el aviso cuando está montado y opaco —hasta 4 s, sin esperas fijas—: sonner lo crea una altura por debajo del panel con `opacity: 0` y en una máquina cargada la entrada puede empezar tarde, así que medir por tiempo daba fallos intermitentes con el aviso aún invisible.
- **Cierre:** puntos suspensivos «…» en los avisos de IA («Comprobando la IA…», «Reintentando…»), como en el resto de la interfaz. Documentación de la raíz al día: `INSTALAR.md` reescrita para Kinema y fuera `REPORTE-PRUEBA.md` (informe de prueba de la v1.0) y `.instructions.md` (instrucciones de agente que apuntaban a archivos que ya no existen).
- **Scripts sin datos personales:** `live-probe.mjs` y `live-proof.mjs` leen `ud_cache_user` con `udemySecret` (de `.qa-udemy-cookies.json` o de `UDEMY_UD_CACHE_USER`), como las demás cookies, en vez de llevar el id de usuario de Udemy escrito en el código. El README ya no cita una ruta local e `INSTALAR.md` no fija el número de comprobaciones de `qa:full`.

## [1.6.0] — 2026-11-05

Adopta el prototipo completo (diseño, flujo pedagógico, textos, avisos, historial, progreso y formato de Obsidian/Anki) sobre v1.5.15: se conserva todo lo probado en v1.5.9–v1.5.15 (estado real de la IA, proveedor y relay, permisos, sondeo de subtítulos que no se rinde). Fusión a tres bandas con base `8a4ff82`: 7 archivos nuevos, 26 copiados, 4 fusionados y 1 con conflictos (6, en `StudyAgentTab.tsx`).

- **Los avisos viven en una sola pila, abajo y centrados dentro del panel**; también las celebraciones. Antes eran `position: fixed` sobre el vídeo y la celebración salía arriba, tapando subtítulos. El historial y la caché también avisan por ahí.
- **Progreso coherente**: XP y nivel con `levelOf = floor(sqrt(xp/60)) + 1`, compartido por Progreso, el dock y Study. La autoevaluación de Recordar ya no compite con el nivel de XP. Rachas con mejor racha y «hoy ya estudiaste»; la celebración se difiere al cierre. Logros desde `answered`/`improved`.
- **Historial y Progreso con la misma cifra de Anki** (`ankiDue.ts`, mazo raíz configurable): si AnkiConnect no responde sale `null`, nunca un `0`. Arreglo en `USG_ANKI_DUE`: `return true`, porque la respuesta es asíncrona. Acción «Repasar en Anki».
- **Respuestas persistidas con `firstTryCorrect`**: recargar no vuelve a dar XP ni cambia el resumen de Comprobar.
- **Dudas sobre la lección** (§5, `LessonDoubtPanel`) y **Comprobar proporcional** (`checkPlan.ts`, nuevo del prototipo): como mucho `min(5, ideas clave)` preguntas — una en el nivel elegido, una por cada idea que no marcaste y, si marcaste alguna, una de confirmación sobre una marcada (para contrastar el autoinforme). Las ideas que no caben se dicen en pantalla y van a Anki como refuerzo; el tope de fatiga solo actúa en lecciones de 6–7 ideas con casi nada marcado. Sin IA, `askLessonDoubt` responde con fragmentos verificados de la transcripción marcados como `source: "local"`: es honesto, no bloquea.
- **Lecciones de texto**, «Ir a la siguiente lección» y estado `unsupported` (`udemyLecture.ts`). En Udemy real (ver más abajo) se verificó que `[data-purpose="go-to-next"]` existe y que el título sale de `li[aria-current="true"]`; lo único sin verificar en real es el estado `unsupported`, porque el cuestionario del curso probado vive en `/learn/quiz/<id>`, donde el dock no se monta a propósito. Si los selectores no encuentran nada devuelven `false`/`null` y Study lo dice, sin inventar navegación.
- **Vocabulario**: flexiones (`vocabMatch.ts`) y `knownWords`.
- **Nota de Obsidian** con el formato nuevo y los textos de tarjetas («Tarjetas por descargar»).
- **Migración v1→v2 de una lección terminada**: `practiceStatus` se infiere «hecha» de `status: "completed"` cuando no hay reto de código, igual que ya se infería `finishedAt`. Sin esto, una lección que el usuario cerró en el flujo de 5 pasos reaparecía como «con pasos pendientes» (v1 no guardaba ese campo). Nunca «correcta»: eso no se sabe.
- **El nombre de la lección ya no se pisa, pero tampoco se queda viejo**: el relleno automático escribe si el campo sigue vacío/heredado, si **cambió la lección** (`agent_lesson_autofill_key`) o si nadie lo ha editado desde el último relleno (`agent_lesson_autofill_value`). Antes se sobrescribía en cada actualización de contexto —y el nombre que el usuario escribía en «Nombre del video/clase actual» se revertía solo, con el guard nuevo («Estás en otra lección») ocultando su sesión a mitad de camino—; la primera versión del arreglo, al fiarse solo del ID de la lección, fijaba para siempre el primer título que llegara. En Udemy el primer contexto puede adelantarse al temario: en una corrida real la sesión quedó bautizada con la lección ANTERIOR («27. Variables: Primitive Types» en vez de «26. Demo: Declaring & Re-initializing Variables»). Ahora, mientras el valor sea el que escribió Kinema, el título de la página manda y el nombre se corrige solo. El content script, que rellena el campo cuando está vacío o heredado, escribe a la vez el nombre, la marca de la lección y el valor rellenado: antes escribía solo el nombre, el dock lo tomaba por una edición del usuario y dejaba de corregirlo.
- **Arnés adaptado al contrato del prototipo** (nunca debilitando una prueba): rótulos nuevos en los flujos (`Comparar con las ideas clave`, `Revisar mi respuesta`, `Saltar este paso`), la comprobación cerrada se detecta por su bloque de repaso (`[data-verify-review]`), y el resultado de la nota de Obsidian y los bloques cercados del callout se comprueban como los emite ahora. `qa:full` pasa de 49/49 a **53/53**, con cuatro comprobaciones nuevas. Dos son de avisos: el aviso real dentro del panel, abajo y centrado, y la celebración dentro de la pila de avisos, sin capa propia. Las otras dos son de Obsidian, por el contrato «un clic = una URI»: la nota va a la carpeta de fuentes, y «Crear índice», en el aviso, emite la segunda URI (el índice del curso, en la carpeta de MOCs). La comprobación que antes exigía dos URIs en un solo clic ahora exige **exactamente una**.
- **El mismo barrido en las suites de entorno real**: `qa:extension` recorría el flujo de 5 pasos (paso «Repaso», «Saltar a la práctica») y esperaba el marcador `¿Lo sé?`; ahora recorre los 4 pasos, espera el presupuesto que el propio dock promete («~5–15 min»; con el payload nuevo la generación real tarda 80–170 s) y audita el `.apkg` con Prism como media indexada (`media`), los presets con el nombre de marca y la nota de Obsidian por el contrato nuevo (sin `source_url` ni `#flashcards`, con `lesson_url`). `qa-observer` medía la carga de evaluación con tres textos que ya no existen: ahora usa `Leyendo tu respuesta…` → `Comparando con la lección…` → `Preparando tu revisión…`, y comprueba que «Preparando tu sesión» (generación) no cuenta como espera. `qa-real-usage` (la corrida real contra Udemy con el proxy del usuario) esperaba los marcadores `[CORRECTO]`/`FALTO:` en crudo y el botón «Evaluar»: el prototipo los convierte en rótulos y en la caja «¿Cómo sigues?», así que ahora la señal es `[data-next-moves]`/`[data-verify-review]` y el avance usa «Revisar mi respuesta», «Siguiente pregunta» y «Siguiente». Con `QA_OBSIDIAN_VAULT=<vault>` exporta de verdad y deja las URIs capturadas en `tmp/real-usage/`.

## Verificado en el entorno real (2026-11-05)

Corridas contra Udemy con la sesión del usuario, el proxy `127.0.0.1:6660` con `deepseek-v4.1-flash:free` y el Anki del usuario:

- `qa:extension` (IA real): sesión generada en 78–171 s, Obsidian, guard de duplicados, `.apkg` con Prism y tipografía — **OK**.
- `qa-full-flows --real`: **13/13** (los bloques D/E se omiten a propósito: sembrarían datos en la cuenta real).
- `qa:anki:all`: **OK** (estructura del `.apkg`, importación real y contenido IA).
- Flujo COMPLETO real (lección «26. Demo: Declaring & Re-initializing Variables», 900 s): **completado en 1 m 56 s** (generación 53 s · Comprobar 52 s · Aplicar 12 s), con la **celebración dentro de la pila de avisos del panel** medida sobre la página real (`found/inside/low` y ninguna capa propia).
- **Export real a Obsidian**: la URI que genera la app (`vault=Dev Courses`, 19 115 caracteres) creó la nota en el vault (`wiki/fuentes/java-in-depth-...---26-demo-declaring-re-initializing-variables.md`, 12 950 bytes) con el frontmatter y las nueve secciones del contrato.
- **Selectores de `udemyLecture.ts` en real**: `[data-purpose="go-to-next"]` existe en la página de lección (la ruta principal de «Ir a la siguiente lección» acierta) y el título sale de `li[aria-current="true"]`. El cuestionario de ese curso vive en `/learn/quiz/<id>`, donde el dock **no se monta a propósito** (`isUdemyLecturePage` pide `/learn/lecture/<id>`), así que el estado `unsupported` no se puede provocar con una lección real de este curso: queda cubierto en el clon y en la suite del prototipo.
- **Riesgo anotado**: una lección larga produce una URI de ~19 KB. Chrome la acepta (ShellExecute), pero `cmd.exe` no (límite de 8 KB): para lanzarla desde un terminal hay que usar `Start-Process`. El dock ya ofrece «Copiar» y «Descargar .md» como alternativas.


## [1.5.15] — 2026-11-04

- **Diagnóstico del sondeo**: el veredicto de `USG_PROVIDER_HEALTH` se guarda en `chrome.storage.local` (`usg_provider_health_debug`) con la URL probada y, si fallan todas, el motivo por candidata. La consola del service worker no es visible desde fuera y sin este rastro el bloqueo del CTA solo se podía adivinar.
- **QA (solo arnés)**: la semilla del proveedor se **verifica** y se reintenta (antes anunciaba «proveedor → 6660» aunque la escritura hubiera fallado: dentro del código del navegador quedaba un `process.env` que lanzaba excepción y el `catch` vacío la ocultaba — por eso la app sondeaba el 8010 por defecto y bloqueaba el CTA, con razón). Navegación a la lección con reintento (`net::ERR_ABORTED` intermitente) y el fallo del CTA imprime el aviso completo con endpoint.

Con esto, la corrida real completa pasa con el proxy del usuario:
`proveedor guardado: local http://127.0.0.1:6660/v1 deepseek-v4.1-flash:free` → generación 86 s → flujo mínimo completado, ≤ 4 min.

## [1.5.14] — 2026-11-04

- **Arreglado el sondeo de IA contra el endpoint equivocado**: `checkProviderHealth` leía la configuración de forma síncrona, así que en un service worker recién despertado (o antes de que terminara su carga) veía el valor por defecto `http://127.0.0.1:8010/v1` y devolvía «El proveedor no responde» aunque el proveedor real (p. ej. `http://127.0.0.1:6660/v1`) contestara perfectamente. Ahora espera a `providerConfigReady`, la misma carrera que ya se corrigió en el relay. Verificado: el sondeo construye `…/v1/models` y responde 200 en 33 ms; el default 8010 da ECONNREFUSED, que era exactamente lo que veía el dock.
- El fallo del CTA ahora imprime el aviso completo (con endpoint) en las suites.

## [1.5.13] — 2026-11-04

- **La traducción también consulta el estado de IA** (`useAiHealth`, hook nuevo): sin proveedor la pipeline no arranca — tarda minutos y fallaría a mitad — y lo dice («Sin proveedor de IA…» / «El proveedor no responde (endpoint). Reintentando…»). El auto-arranque depende del estado, así que se dispara sola en cuanto la IA aparece; el botón «Retraducir» se deshabilita con el motivo al pasar el cursor.
- El hook re-sondea al cambiar la configuración por storage (`chrome.storage.onChanged`), no solo por el evento de la UI: cubre cambios desde otra pestaña o ventana.
- `aiBlockedMessage` pasa a vivir con el hook y Study lo importa, así que el vocabulario de bloqueo sigue siendo uno solo.
- Nota de arquitectura: StudyAgentTab conserva su propio sondeo. Al unificarlo en el hook, la suite (`qa-full-flows`) pasó de 49/49 a fallar en cascada desde el paso Recordar; revertido, vuelve a 49/49. Queda un sondeo por superficie montada (Study y Captions), con el mismo evento `usb:ai-health` y el mismo veredicto cacheado en el SW (15 s) — así que el coste en red es el mismo.

## [1.5.12] — 2026-11-04

- **El mismo estado de IA gobierna todas las acciones de IA**, no solo el CTA: `Regenerar` objetivos, `Refinar con IA` y `Proponer palabras` (vocabulario) se deshabilitan sin proveedor y explican el motivo al pasar el cursor («Sin proveedor de IA: configúralo en Ajustes → Proveedor» / «Comprobando la IA...» / «El proveedor no responde (endpoint). Reintentando...»). Un único helper (`aiBlockedMessage`) alimenta los cuatro avisos, así que no pueden divergir.
- Se mantiene el reintento por estado: en cuanto la IA aparece (≤5 s), los botones se rehabilitan solos, sin recargar.
- La generación automática de objetivos sigue funcionando sin IA (cae a plantillas heurísticas, con su aviso): hace falta tener objetivos que elegir aunque el proveedor no esté.

## [1.5.11] — 2026-11-04

- **Un solo vocabulario para los fallos de IA** (`describeProviderFailure` en `ai-providers`), que habla del proveedor REAL y de su endpoint: sin proveedor configurado, no responde, credencial rechazada (401/403), limitando (429), cuota agotada, saturado (5xx), contenido vacío (modelos de razonamiento) o respuesta cortada. Antes cada camino inventaba su texto y varios culpaban a **Gemini** aunque el camino sea el proveedor configurado.
- Aplicado en los cuatro sitios donde el mensaje mentía o era genérico: **objetivos** (generar/regenerar), **refinar objetivo**, **generar sesión** y **vocabulario** (proponer palabras).

## [1.5.10] — 2026-11-04

- **El dock conoce el estado REAL de la IA** (antes el badge «IA local · conectada» venía hardcodeado y el CTA se podía pulsar sin proveedor):
  - El service worker sondea el `/models` del proveedor CONFIGURADO — valga el tipo (OpenAI-compatible, Anthropic, Gemini, servidores locales tipo kivaroute/Ollama/LM Studio) — con sus cabeceras de autenticación y 1,8 s de timeout, cacheado 15 s e invalidado al cambiar la configuración.
  - El CTA distingue tres estados y lo dice: «Sin proveedor de IA: configúralo en Ajustes → Proveedor» / «Comprobando la IA…» / «El proveedor no responde (endpoint). Reintentando…». Solo se habilita con la IA lista.
  - Reintento automático: cada 5 s mientras no responde, cada 30 s cuando está lista. El botón se enciende solo en cuanto la IA aparece, sin recargar.
  - La pre-generación también espera: sin IA disponible no se gasta la llamada.
  - El badge del header refleja el mismo estado (se acabó el verde mentiroso).
- QA: los mocks responden `GET /v1/models` para que el sondeo no invente un «sin respuesta».

## [1.5.9] — 2026-11-04

- **El CTA dejaba de estar muerto sin explicación cuando el curso tiene objetivos heurísticos**: la condición exigía `!objectivesMock`, así que elegir una de esas tarjetas no habilitaba «Generar sesión de aprendizaje» (solo escribir un objetivo propio lo hacía). Un objetivo ELEGIDO cuenta ahora aunque la plantilla sea heurística — la sesión se genera con el proveedor configurado, no con Gemini. El aviso de «plantillas heurísticas» se mantiene.
- **El indicador de transcripción se rendía a los ~60 s**: si los subtítulos se capturaban más tarde (p. ej. tras reintentar desde Captions), Study seguía diciendo «Sin subtítulos en esta lección» y el CTA quedaba bloqueado para siempre. Ahora sondea sin rendirse mientras el paso es el de objetivo y re-evalúa en cuanto llegan cues (con freno de 2 s).

## [1.5.8] — 2026-11-03

- **Estado de pre-generación por lección** (fallo de 1.5.7): `preGenRef` sobrevivía al cambio de lección porque Study está siempre montado. Si una lección se ojeaba sin estudiarla, quedaba en `done` y no se volvía a pre-generar en toda la sesión; si quedaba en `running`, al pulsar Empezar en la lección siguiente se esperaba esa generación ajena. Ahora se reinicia al cambiar de lección y en Empezar solo se espera la generación de la lección y el objetivo actuales.
- **La clave de caché lleva curso + ID real de la lección** (era solo el nombre + objetivo): dos lecciones con el mismo nombre («Chapter Introduction», «Demo») podían servirse el mazo de la otra. Además se re-verifica curso y lección al consumir. Verificado con un par real de lecciones homónimas: el mazo de A quedó en caché con el ID de A (`..._4121106_...`) y B (mismo nombre, ID 4299336) generó y consumió el suyo.
- La comparación de objetivo al terminar la pre-generación lee el objetivo **actual** (ref), no la foto del arranque.
- **Modo de cronometraje humano en el arnés** (`QA_HUMAN_TIMING=1`): tiempo por paso (Recordar, Comprobar, Aplicar, Fijar) desde Empezar, esperas de IA medidas aparte (generación y evaluaciones), si se consumió el mazo pre-generado y el estado de la escalera. Y modo de cambio de lección (`QA_MULTI_LESSON=1`, con `QA_MULTI_WAIT_A=1` para la prueba fuerte).

## [1.5.7] — 2026-11-03

- **Pre-generación del mazo durante el vídeo (opción A)**, con las cuatro condiciones acordadas:
  1. Solo con un objetivo del curso: el último usado en el curso (historial) o uno de los objetivos derivados del curso. Nunca un texto libre global que pueda venir de otro curso (es el bug que señaló la revisión: `agent_custom_obj` sobrevive al cambio de curso).
  2. Si el objetivo cambia, la pre-generación se descarta (se compara el objetivo al terminar) y al pulsar Empezar se genera como siempre.
  3. El mazo pre-generado vive solo en caché (`usb_cache_...` con TTL de 2 días): sin entrada de historial ni XP hasta que el estudiante abre Study.
  4. Arranca en los últimos ~3 min de lección, o al momento si dura menos; las lecciones que solo se ojean no gastan llamadas.
  Al pulsar Empezar, si hay una pre-generación en curso para el mismo objetivo se espera ESA llamada (sin duplicar) y se consume del caché. Medido: generación en el CTA **2 s** frente a 107-151 s de la ruta normal.
- **Reloj del vídeo en el dock**: la duración viaja en el payload de cada cue y el dock emite `usb:video-progress`, que decide la ventana de pre-generación.
- **Telemetría del escalón de generación** (`usg_study_generation_stats`): qué peldaño produjo cada mazo (8192 con razonamiento / 16384 sin él). Primeros datos: 4 mazos por el primer peldaño y 3 escalados — el razonamiento se mantiene en el primer intento, como se acordó.
- **Traducción bajo carga medida**: con una generación de mazo en curso, una línea tarda 1.8-2.3 s (media 2.0 s), igual que en reposo — el proveedor gratuito no serializa.
- **QA real**: `QA_REAL_PROXY`, `QA_COLD_SW`, `QA_KEEP_CACHE`, `QA_KEEP_HISTORY`, `QA_PICK_CARD`, `QA_SEED_COURSE_OBJECTIVE`, `QA_VERBOSE`; el perfil limpia cookies antes de inyectar la sesión (tokens rotados duplicados rompían la API).

## [1.5.6] — 2026-11-03

- **Vista previa sin extensión reparada** (regresión de 1.5.5): `proxyChat` y `streamProviderViaPort` delegaban siempre en el service worker y sin extensión lanzaban «sin runtime», un error que la cadena de respaldo no reconoce como fallo de conexión — Comprobar y los subtítulos traducidos caían. Ahora, sin runtime de extensión, ambos vuelven al fetch directo (la evaluación, su versión en streaming y `translateLine` llegan al mock). `qa:local` cubre las tres rutas.
- **Carrera del allowlist al despertar el SW**: al reanudarse tras ~30 s de inactividad la config aún no estaba cargada y el relay rechazaba el proveedor real (solo permitía 8010). La promesa de `initAiProviderConfig()` se guarda al arrancar y ambos handlers la esperan antes de validar la URL. Verificado con `QA_COLD_SW=1` (35 s de suspensión antes de evaluar).
- **Contraste del monitor de video en claro**: `text-white` exacto y los ámbar del chip de vocabulario sobre `.usb-video-surface` (la única superficie oscura dentro del dock claro) con tonos legibles (18.3:1 y 12.7:1); `qa-contrast-sepia` los mide y falla si desaparecen.
- **Reintentos de generación**: la escalera pasa de 8192 → 16384 sin razonamiento (se elimina el peldaño intermedio con razonamiento, el más lento y el que menos desatasca); la espera de la prueba admite generaciones largas (600 s).
- **QA**: `qa-local` portado a ESM y actualizado a la marca actual (Kinema) con 6 bloques; los tiempos por paso del informe ya no mezclan la generación con Comprobar.

## [1.5.5] — 2026-11-03

- **Streaming IA por el SW**: `streamConfiguredProvider` usaba `fetch` directo desde el content script, que Chromium bloquea por Private Network Access en páginas https; la evaluación quedaba colgada sin error. Ahora va por un Port del runtime (`USG_PROXY_STREAM`). La generación y la evaluación no-streaming ya usaban `USG_PROXY_CHAT`; la IA local integrada (8010) también pasa por el relay en vez de fetchear desde la página.
- **Allowlist del relay**: `USG_PROXY_CHAT`/`USG_PROXY_STREAM` solo fetchean el proveedor configurado o el servidor local bundled, nunca una URL arbitraria.
- **Modelos reasoning**: el veredicto llegaba vacío porque el razonamiento consumía los 260 tokens de las evaluaciones (medido: 203 de reasoning, 0 de content). Presupuestos: evaluaciones 2000, traducción 800, objetivos 1500/800; la generación escala 8192 → 16384 → 16384 con razonamiento desactivado. Errores del proveedor ya no se disfrazan de «no hay keys de Gemini».
- **Traducción con reasoning desactivado** (`enable_thinking`/`thinking`/`reasoning_effort`, con reintento sin esos campos ante 400): medido 6.4 s/línea con razonamiento frente a 1.8 s sin él — los subtítulos se desincronizaban.
- **Carrera de configuración**: el panel de Ajustes (`keepMounted`) guardaba el snapshot previo al primer `initAiProviderConfig` (default 8010) pisando el config persistido; ahora el global se sincroniza con `chrome.storage.onChanged` y el panel relee al abrirse. Se retiró el guardado previo a la validación de `ApiKeysPanel` (la validación ya corre en el SW; guardar antes marcaba «activo» un endpoint caído).
- **Endpoint real en la UI**: el pie y el tooltip del dock muestran el `baseUrl` configurado (antes 8010 fijo); el health check sondea primero el proveedor local configurado.
- **Contraste claro**: `text-amber-700`/`text-emerald-700` (DevTab) mapeados a los tokens AA.
- **QA**: matriz de timing real (lecciones de 2 y 15 min × flujo mínimo y completo) con caché limpiada y proxy real; el loop de Comprobar espera el veredicto asentado antes de pulsar; clicks con reintento en las suites.

## [1.5.4] — 2026-11-01

- Aviso único tras el primer export .apkg: activar «Importar cualquier configuración del mazo» (con acceso a la guía).
- QA/docs: veredicto FSRS medido, etiquetas sin la clave inerte del preset y nombres reales de los presets.

## [1.5.3] — 2026-11-01

- La guía de importación indica activar «Importar cualquier configuración del mazo» para recibir los presets (antes prometía que se configuraban solos).
- Docs: FSRS es un ajuste de toda la colección; ningún .apkg lo activa.

## [1.5.2] — 2026-11-01

- El foco vuelve a «Reiniciar» al cancelar la confirmación (Cancelar, Escape y el temporizador de 5 s comparten `closeResetConfirm`; si el foco seguía en el grupo, se restaura — quien navega con teclado no pierde su sitio).

## [1.5.1] — 2026-11-01

- Contraste AA en claro: paleta semántica con tokens (`--usb-ok/err/info/retry/accent-text`) en claro y oscuro; los textos de estado (ámbar, esmeralda, rosa/rojo, sky, fucsia, violet-200) usan el token de su familia en vez de tonos 600 que no llegaban a 4.5:1. Fondos y bordes intactos.
- El chip «Nivel N» de la tarjeta de cierre usa `--usb-fg-hi` (solo el icono conserva el acento).
- «Respuesta modelo» del paso Comprobar con tokens del tema (antes text-white/25 en oscuro).
- El indicador de subtítulos dice «Vista previa sin extensión · Se usará una sesión de ejemplo» fuera del runtime y la píldora «N líneas» solo aparece con subtítulos reales.
- Eliminada la barra en bucle de «Preparando tu sesión» (sin animaciones infinitas; el chip «Generando…» y el spinner del paso activo bastan).
- La confirmación de «Reiniciar» ocurre dentro del dock («¿Borrar respuestas? · Sí, reiniciar · Cancelar», se revierte sola a los 5 s, Escape cancela) en vez del diálogo nativo.

## [1.5.0] — 2026-10-31

### Study · flujo flowVersion 2 (4 pasos, un solo modo)
- **4 pasos**: Recordar (nivel + recuerdo libre + conceptos, fusiona los
  antiguos 0 y 1) → Comprobar (adaptativo) → Aplicar (nunca bloquea) →
  Fijar (exportar + Terminar lección). Mínimo real: 1 toque de nivel +
  1 respuesta + Terminar (~3 min); el hero promete «~4–10 min» en vez de
  un falso «~8 min».
- **Comprobación adaptativa**: arranca en la dificultad declarada; correcta
  a la primera completa el paso con «Un reto más» opcional; fallar trae una
  pregunta de consolidación del nivel anterior (máx. 2 obligatorias).
  «Ir al desafío» ya no dispara «Evaluación saltada»; el toast queda solo
  para «Saltar», que ahora es un botón secundario con contraste AA.
- **Terminar lección**: exportar ya no es requisito. `finishedAt` marca el
  cierre; quien exporta solo a Obsidian sí puede terminar. Sin exportar,
  la lección aparece en «Tarjetas de contenido por descargar».
- **Resumen de cierre honesto**: una sola tarjeta con datos reales
  (recordadas, comprobación, práctica, calibración, tarjetas, próximo paso).
  Título según resultado — «Lección dominada» solo con todo correcto a la
  primera; nunca por defecto. Fuera «¡Comprensión verificada! La IA
  confirmó…», el cohete que rebota y «Lección dominada» incondicional.
- **Calibración honesta**: demostrado = dificultad más alta correcta a la
  primera (antes: ratio de correctas que ignoraba la dificultad).
- **Pantalla de objetivo compacta** para quien vuelve (objetivo + CTA
  «Empezar · ~4–10 min», curso y objetivo propio plegados). El indicador
  «Transcripción capturada · 248 líneas» (texto fijo) pasa a estado real vía
  bridge con reintentos; CTA bloqueado sin transcripción, con motivo.
- **Repasos pendientes visibles**: fila discreta con las tarjetas del curso
  pendientes (AnkiConnect, scope curso — `USG_ANKI_DUE` acepta
  `scope: lesson|course|all`). Muerto el «logro» por abrir Anki.

### Gamificación (§2)
- XP nuevo: `answer_submitted` 5 (≥20 car., 1/pregunta), `first_try_correct`
  10, `answer_improved` 10, `practice_attempted` 15, `practice_correct` +10
  (+20 si es reto de código correcto), `lesson_finished` 30, `export_done` 10
  (una vez por lección, Anki u Obsidian). Fuera XP por autodeclarar
  (`concept_ack`) y combos (`question_combo`); logro combo3 eliminado,
  s1 → «Primera lección terminada», c25/c100 cuentan aciertos a la primera.
- **Una celebración grande por lección**: el cierre, con nivel y logros DENTRO
  de la tarjeta (`mergeFollowUps`), sin overlays en cola por respuesta ni
  frases aleatorias. Confeti solo en cierre y subida de nivel. Fuera el
  shake al fallar y el destello al acertar; fuera los toasts de «+5 XP»,
  «Vas por buen camino…» y «Adaptando las preguntas a tu nivel…».
- «Reiniciar» pide confirmación antes de borrar. Panel de Progreso: sección
  «Aprendizaje» (lecciones semana/total, % aciertos a la primera de las
  últimas 20, puntos reforzados, repasos pendientes en Anki); «Estudiante
  Focado» → «Enfocado»; rangos con iconos del set propio (fuera emojis).

### Study → mazo (§3): tarjetas de refuerzo
- Las tarjetas del prompt llevan `conceptRefs` (como las preguntas); al
  llegar a Fijar se calculan los conceptos débiles (no marcados o cubiertos
  por fallos): las tarjetas existentes que los cubren reciben
  `kinema::reforzar` y van PRIMERO en la cola (`buildConceptSpec` ordena
  antes de asignar due); los conceptos débiles sin tarjeta generan como
  máximo 2 tarjetas de refuerzo desde la pregunta fallada
  (`kinema::origen::study`, GUID con prefijo `study:`).
- Vista previa con chip «Refuerzo» y «Quitar/Incluir» por tarjeta: solo se
  exporta lo que el estudiante acepta; la selección persiste en el historial
  y «Volver a descargar» la respeta.
- El aviso de reexportación compara el conjunto de GUIDs (`exportedGuids`) y
  solo avisa si el paquete cambió.

### Feedback de la IA (§4)
- Rúbrica explícita: veredicto sin «85% de comprensión» (precisión
  inventada), BIEN / FALTO / PARA RECORDAR, sin PROFUNDIZACIÓN (la pregunta
  nueva que nunca se podía responder), max_tokens 380 → 260. En la revisión
  de código, SIGUIENTE NIVEL solo con veredicto correcto y nivel
  clear/mastered (el nivel viaja en el contexto). Práctica oral con la misma
  rúbrica. «Sin conexión con la IA local» muestra el error real.

### Otros (§5, §6)
- Demo solo fuera de la extensión: sin detección, curso/lección/objetivo
  arrancan vacíos y el CTA explica qué falta (antes nombrarían el mazo con
  «Java In-Depth…»).
- Restauración v2: `questionsDone` explícito (nunca inferido de «una
  correcta»), `finishedAt`, cola reconstruida del historial; migración v1 →
  v2 en lectura (focusStep 5→4 pasos mapeado).
- **Seguridad**: eliminado el autosync de tarjetas a Supabase que enviaba el
  `userId` en la URL sin Authorization; se documenta el requisito del JWT
  para la edge function antes de reactivarlo.
- Obsidian y el historial reciben el cierre: «Lo que recordé sin mirar»
  (recallNotes), «Puntos a reforzar» (preguntas falladas con su respuesta,
  plegadas) y el resultado de la sesión en la nota.
- Guía de importación: frase honesta de FSRS («Comprueba que FSRS esté
  activado: Opciones del mazo → FSRS (Anki 23.10+)» — la prueba decisiva en
  perfil limpio queda pendiente, ver docs/STUDY_FLOW_PEDAGOGY.md),
  «Vocabulary → {idioma configurado}», fuera «tu sistema de imágenes».
- Contraste AA en lo tocado (nav, Saltar, Nv. X) con tokens del tema;
  generador: lista de estados sin «Paso 1–5» y barra indeterminada.

### Docs
- `docs/STUDY_FLOW_PEDAGOGY.md` (nuevo): cada decisión con su referencia
  DOI verificada (Hattie & Timperley 2007; Shute 2008; Deci, Koestner &
  Ryan 1999; Metcalfe 2017; Dunlosky & Rawson 2012; Karpicke & Blunt 2011;
  Kalyuga 2007; Sailer et al. 2017; Butler & Winne 1995).

## [1.4.1] — 2026-10-29

### Corrección crítica
- El .apkg de LECCIÓN (conceptos) no importaba en Anki real: los archivos de
  media de Prism se guardaban en el zip bajo su nombre real en vez de bajo su
  número («0», «1»…). Hallado importando en Anki Desktop (AnkiConnect).
  El empaquetado vive ahora en addApkgEntries (ankiApkgCore.ts, función pura
  compartida por la extensión y el QA). Verificado: conceptos + Prism
  importan sin error y los 2 archivos aparecen en collection.media.

## [1.4.0] — 2026-10-29

### Anki · Conceptos
- Prism embebido en el .apkg (`_kinema-prism-v1.*`): resaltado de código
  offline para 23 lenguajes (antes: CDN, solo java/markup/properties).
- El prompt usa el lenguaje REAL del curso; las clases desconocidas caen a
  `language-none`.
- Info mínima: comparación pregunta por UNA dimensión (tabla ≤3 filas como
  apoyo), proceso ≤4 pasos, entrevista máx. 1 por lección; el back abre
  respondiendo y luego el porqué.
- `newGatherPriority: 1`: las nuevas salen en el orden en que estudiaste.
- Tags jerárquicos `kinema::` (curso/lección/tipo/tema); fuera tags sueltos.
- La ruta del mazo del aviso incluye `::Courses::` (antes mentía).
- Fuera el export `.txt` (duplicaba sin GUID con otro note type); `.apkg` es
  el único camino. Aviso al reexportar una lección regenerada.
- FSRS: corrección documental — no viaja en el .apkg; activarlo en Opciones.

### Anki · Vocabulario v2
- Note type POR IDIOMA (`Kinema · Vocab · English`, ID por idioma).
- Dos tarjetas: «Reconocer» (palabra resaltada en contexto) y «Producir»
  (hueclo cloze, activada por defecto; interruptor en Ajustes).
- Audio con respaldo: archivo si existe, si no voz del sistema con el locale
  del idioma. Fuera el selector de audio.
- Campos nuevos al final: `nivel`, `colocacion`, `fuente`, `producir`.
- Tags `kinema::` jerárquicos; fuera `udemy-bridge` y tags sueltos.

### Obsidian
- Resumen generativo real (la relevancia pasa a línea aparte).
- Respuestas plegadas (callouts) para autoevaluación.
- Tarjetas como referencia plegada sin `#flashcards`; «Repasar también en
  Obsidian» (apagado) activa el formato del plugin.
- «Reemplazar nota» (`overwrite=true`); clipboard para URIs >30k (SRT antes
  de la primera URI); MOC por vault y con la carpeta configurada;
  frontmatter `anki_deck`/`lesson_url`/`concepts`; tags `kinema/*`;
  conceptos enlazables `[[wiki/conceptos/…]]`; errata «cruto»→«crudo».

### Fase 2 (parcial)
- `t` (minuto de la lección) en tarjetas y palabras: la Fuente enlaza a
  `?start=<seg>`; conceptos enlazables `conceptTerms`.
- Pendiente: recolección temporizada del transcript (insertar `[mm:ss]` en el
  prompt) — requiere su propia pasada de QA del pipeline de transcripción.

### General
- Auditoría de producción: cloze XSS/regex, auth local sin Supabase,
  PermissionPage con tema, animaciones finitas, WAR mínimo, focusable=false,
  logs con guarda DEV, permiso de host por service worker.
- Modelo de IA por defecto en QA: `qoder/qwen3.8-flash`.

## [1.1.1] and earlier

See git history.