# Udemy Subtitle Bridge — Plan de Proyecto Completo
> Ciclo de vida completo · Metodología · Fases · Testing · Herramientas MCP

---

## 1. Resumen Ejecutivo

**Udemy Subtitle Bridge** es una extensión de Chrome/Firefox que:
1. **Captura** los subtítulos en inglés de cualquier video de Udemy en tiempo real.
2. **Traduce** cada línea al español usando una IA local (OpenAI-compatible, puerto 8010) con streaming SSE.
3. **Superpone** el subtítulo traducido sobre el video mediante un overlay arrastrable.
4. **Dock in-page** con Shadow DOM: panel lateral resizable (300–560px) y colapsable inyectado directamente en el DOM de Udemy.
5. **Potencia el aprendizaje** con un Study Agent pedagógico (Taxonomía de Bloom, metodología Feynman) que genera preguntas, evalúa respuestas con IA y exporta tarjetas a Anki (.apkg nativo).

**Producto final:** extensión empaquetada como `.zip` lista para Chrome Web Store y Firefox Add-ons.

**Arquitectura clave (v1.1):** In-page Dock con Shadow DOM — migrado desde Chrome Side Panel API.
Ver docs completos: `07-INPAGE-DOCK-SHADOW-DOM.md`.

---

## 2. Metodología de Desarrollo

### 2.1 Marco de Trabajo: Agile / Kanban híbrido

| Ciclo       | Duración    | Objetivo principal                                      |
|-------------|-------------|--------------------------------------------------------|
| Sprint 0    | 3 días      | Setup del entorno, scaffold de la extensión, CI básico |
| Sprint 1    | 1 semana    | Content script funcional + pipeline de traducción      |
| Sprint 2    | 1 semana    | Study Agent MVP (generación de contenido + Anki TXT)   |
| Sprint 3    | 1 semana    | Study Agent avanzado (evaluación IA streaming + .apkg) |
| Sprint 4    | 3 días      | Dev Panel + logging + refinamientos UX                 |
| Sprint 5    | 3 días      | Testing E2E, empaquetado, publicación                  |

**Convenciones del repositorio:**
- Rama `main` — siempre estable y publicable.
- Rama `develop` — integración continua de features.
- Ramas `feature/<nombre>` — cada funcionalidad o sprint.
- Commits semánticos: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.

---

## 3. Tecnologías y Herramientas

### 3.1 Stack de la Extensión (producción real)

| Capa                    | Tecnología                                | Razón de elección                              |
|-------------------------|-------------------------------------------|------------------------------------------------|
| UI Framework            | React 18 + TypeScript                     | Mismo ecosistema que el prototipo Figma Make   |
| Bundler                 | Vite 5 + `@crxjs/vite-plugin`             | HMR en Chrome, watch de manifest.json         |
| Estilos                 | Tailwind CSS v4                           | Utility-first, **compatible con Shadow DOM** (inyectado en shadow root) |
| Animaciones             | Motion (Framer Motion v12)                | API ya integrada en el prototipo               |
| Iconos                  | Lucide React                              | Consistente con el prototipo                   |
| UI Primitives           | Radix UI (Switch, Slider, Tooltip, etc.)  | Accesible, headless                            |
| Estado persistido       | `chrome.storage.sync` + localStorage FB  | Abstracción en `chromeStorage.ts`              |
| Mensajería              | CustomEvents `window` (dock↔CS) + `chrome.runtime` | CustomEvents para comunicación in-page |
| IA local (traducción)   | Fetch SSE → `http://127.0.0.1:8010`       | OpenAI-compatible (LM Studio / Ollama)         |
| Anki .apkg              | `sql.js` (SQLite WASM) + `jszip`          | Genera binario Anki2 real sin backend          |
| Anki TXT export         | Blob + download nativo                    | Formato TSV para importar en Anki              |
| Tests unitarios         | Vitest + Testing Library                  | Mismo ecosistema Vite                          |
| Tests E2E               | Playwright + `chrome-extension-tester`   | MCP disponible en entorno dev                  |
| Seguridad               | Snyk + Semgrep                            | MCPs disponibles en entorno dev                |
| Control de versiones    | Git + GitHub                              | MCPs `git` y `github` disponibles             |

### 3.2 IA Local Compatible

La extensión funciona con cualquier servidor OpenAI-compatible local:
- **LM Studio** (recomendado para Windows/Mac)
- **Ollama** con `ollama serve`
- **llama.cpp** con API server
- **Jan.ai**

Puerto por defecto: `8010`. Configurable en `localAI.ts`.

### 3.3 Entorno de Desarrollo

```
Requisitos mínimos:
- Node.js 20+
- pnpm 8+
- Chrome 120+ o Firefox 115+
- Un servidor IA local corriendo en 127.0.0.1:8010
```

---

## 4. Ciclo de Vida del Proyecto

### Fase 0 — Setup (Sprint 0, días 1-3)

**Objetivo:** Repositorio funcional con scaffold de extensión Chrome.

**Actividades:**
1. Crear repo GitHub con protección de rama `main`.
2. Scaffold Vite + React + TypeScript + Tailwind v4.
3. Instalar `@crxjs/vite-plugin` y configurar `vite.config.ts`.
4. Crear `public/manifest.json` v1.1 (sin `sidePanel` permission, con in-page dock).
5. Crear estructura de carpetas completa (ver doc 01-ARQUITECTURA-TECH.md).
6. Configurar Vitest, ESLint, Prettier.
7. CI con GitHub Actions: lint + build en cada push.
8. Configurar `snyk` para escaneo de dependencias.

**Entregable:** `npm run build` genera `dist/` cargable en Chrome como extensión desempaquetada.
El In-page Dock aparece en `udemy.com/course/*` como columna derecha fija, colapsable.

**MCPs a usar en esta fase:**
- `context7`: Obtener docs actualizadas de `@crxjs/vite-plugin`.
- `github`: Crear repo, proteger rama main, configurar Actions.
- `snyk`: Primer scan de dependencias.

---

### Fase 1 — Content Script + In-page Dock + Pipeline de Traducción (Sprint 1)

**Objetivo:** Captura de subtítulos, dock in-page funcional y traducción en tiempo real.

**Actividades:**
1. Implementar `content_script.ts`:
   - Tres responsabilidades: ① captura subtítulos, ② overlay, ③ `initInPageDock()`
   - `MutationObserver` para detectar cambios de texto en tiempo real.
   - `initInPageDock()` con `attachShadow({ mode: "closed" })`.
   - CSS Tailwind inyectado en el Shadow Root.
   - `adjustUdemyLayout()` para ajustar `margin-right` del contenido de Udemy.
2. Implementar `InPageDock.tsx`:
   - Resize handle (izquierdo, 300–560px).
   - Collapse/expand con animación spring.
   - Meta bar con badges: Shadow DOM, In-page, :8010.
   - `AuthGuard` → `ExtensionSidebar` dentro del dock.
3. Implementar `localAI.ts`:
   - `streamLocalAI()` — SSE reader con buffer de líneas.
   - `translateLineStream()` — prompt de traducción.
   - Fallback gracioso cuando el servidor no responde.
4. Subtitle overlay arrastrable (div absoluto sobre el video).
5. Pestaña **Captions** del sidebar con TranslationPipeline.
6. Pestaña **Overlay** con controles de config.

**Entregable:** Instalar extensión → ir a cualquier video Udemy con CC en inglés → ver traducción en tiempo real sobre el video + dock lateral funcional.

**MCPs a usar:**
- `playwright` + `chrome-extension-tester`: Verificar que el content script se inyecta y capta subtítulos.
- `chrome-devtools`: Debug de mensajes entre content script y sidebar.
- `context7`: Docs de MutationObserver API y chrome.tabs.sendMessage.

---

### Fase 2 — Study Agent MVP (Sprint 2)

**Objetivo:** Study Agent genera contenido de estudio estructurado para cualquier lección.

**Actividades:**
1. Implementar `localAI.ts` — funciones de generación de contenido:
   - `generateStudyContent()` — prompt maestro para StudyContent JSON.
   - `evaluateActiveAnswer()` y `evaluateActiveAnswerStream()`.
   - `evaluateCodeSolution()` y `evaluateCodeSolutionStream()`.
2. Implementar `StudyAgentTab.tsx`:
   - Phase 1 — Selección de objetivo (4 presets + custom + "Refinar con IA").
   - Phase 2 — Generating (progress steps animados).
   - Phase 3 — Result:
     - Relevance score.
     - Conceptos clave.
     - Autocalibración de confianza (4 niveles).
     - Preguntas adaptativas con feedback IA.
     - Desafío de aplicación.
     - Preview tarjetas Anki con flip 3D.
3. Export Anki TXT (3 archivos: tarjetas.txt, estilos.css, plantilla.txt).
4. Pestaña **Study** visible en el sidebar con navegación.

**Entregable:** Seleccionar objetivo → generar sesión de estudio → responder preguntas → exportar tarjetas Anki TXT.

**MCPs a usar:**
- `context7`: Docs de Taxonomía de Bloom, técnica Feynman (para diseñar prompts).
- `playwright`: Automatizar flujo completo de Study Agent.
- `postman`: Verificar que los prompts retornan el formato JSON esperado.

---

### Fase 3  Study Agent Avanzado + .apkg (Sprint 3)

**Objetivo:** Evaluación IA con streaming real y exportación .apkg nativa.

**Actividades:**
1. Refactorizar `StudyAgentTab.tsx` para usar SSE streaming en evaluaciones:
   - `evaluateActiveAnswerStream()` con fallback a no-streaming.
   - `evaluateCodeSolutionStream()` con fallback.
   - Componente `AIFeedback` con cursor parpadeante.
2. Implementar `ankiApkg.ts`:
   - Schema SQLite Anki2 (ver spec en doc 01).
   - Insertar notas, cartas, colección.
   - Exportar .apkg con JSZip.
3. Botón "Exportar .apkg" con progress feedback.
4. Componente `AnkiFlipPreview` — tarjetas con flip 3D.
5. `ProgressStepper` — indicador de progreso de sesión.
6. Hook `usePersistedState.ts` — persiste objetivo, curso, lección entre sesiones.

**Entregable:** Exportar .apkg → abrir en Anki → tarjetas con CSS completo y Prism.js funcionando.

**MCPs a usar:**
- `playwright`: Test del flujo completo con evaluación IA streaming.
- `snyk`: Scan de sql.js y jszip por vulnerabilidades.
- `semgrep`: Revisar manejo de datos de usuario y storage.

---

### Fase 4 — Dev Panel + Pulido UX (Sprint 4)

**Objetivo:** Panel de debugging para desarrollo y refinamiento de micro-interacciones.

**Actividades:**
1. `DevTab.tsx` — panel oculto (triple-click en ⚙):
   - Log SSE con histograma de latencias por token.
   - Cache de traducciones.
   - Estadísticas de la última petición completada.
2. `debugStore.ts` — observador reactivo de peticiones SSE.
3. Glassmorphism en header del sidebar.
4. Animaciones de tabs con Motion `layoutId`.
5. Halos palpitantes en indicadores de conexión.
6. Progress stepper animado en Study Agent.
7. Mejoras de accesibilidad (aria-labels, focus-visible).
8. Internacionalización de strings (español).

**Entregable:** Panel dev accesible, UX refinado sin regresiones.

**MCPs a usar:**
- `chrome-devtools`: Verificar rendimiento de animaciones (FPS, reflow).
- `playwright`: Regression tests de todos los flujos.
- `semgrep`: Audit final de seguridad.

---

### Fase 5 — Testing, Empaquetado y Publicación (Sprint 5)

**Objetivo:** Extensión publicada en Chrome Web Store y Firefox Add-ons.

#### 5.1 Testing Matrix

| Tipo de test           | Herramienta                        | Qué verifica                                        |
|------------------------|------------------------------------|-----------------------------------------------------|
| Unitario — servicios   | Vitest                             | chromeStorage, contentBridge, debugStore, ankiApkg  |
| Unitario — hooks       | Vitest + RTL                       | usePersistedState, estado del StudyAgent            |
| Componente             | Vitest + RTL                       | TranslationPipeline, AnkiFlipPreview, AIFeedback    |
| Integración            | Vitest (mocks de chrome API)       | Flujo sidebar ↔ content script                      |
| E2E — Chrome           | Playwright + chrome-extension-tester | Instalación, captura subtítulos, overlay, export  |
| E2E — Firefox          | Playwright + marionette            | Compatibilidad Manifest V2/V3                       |
| Seguridad              | Snyk + Semgrep                     | CVEs en deps, patrones inseguros en código          |
| Performance            | chrome-devtools MCP                | FPS del overlay, memoria del content script         |

#### 5.2 Casos de prueba críticos

```
TC-01: Content script se inyecta en udemy.com/course/*
TC-02: MutationObserver captura cambios del elemento .ud-transcript-cue
TC-03: PING/PONG handshake entre sidebar y content script
TC-04: Traducción streaming llega token a token a TranslationPipeline
TC-05: Overlay aparece y se puede arrastrar
TC-06: Config del overlay (pos, size, opacity, color) persiste entre sesiones
TC-07: Study Agent genera StudyContent para cualquier objetivo
TC-08: Evaluación de pregunta con IA streaming (fallback a no-streaming)
TC-09: Export .apkg abre correctamente en Anki desktop
TC-10: Triple-click en ⚙ activa/desactiva panel Dev
TC-11: Panel Dev muestra tokens SSE en tiempo real
TC-12: Extension funciona offline (mock fallback en traducción)
TC-13: No memory leaks en MutationObserver al navegar entre videos
TC-14: Overlay se resetea correctamente al cambiar de video
TC-DOCK: In-page Dock se ajusta correctamente al resize/collapse
```

#### 5.3 Empaquetado

**Chrome:**
```bash
pnpm build        # genera dist/
# Cargar dist/ como extensión desempaquetada en chrome://extensions
# Luego: Herramientas → Empaquetar extensión → genera .crx + private key
```

**Firefox:**
```bash
pnpm build:firefox   # usa manifest.json v2 alternativo
web-ext build --source-dir dist/
web-ext sign --api-key $AMO_KEY --api-secret $AMO_SECRET
```

#### 5.4 Chrome Web Store

1. Crear cuenta de desarrollador ($5 USD, único pago).
2. Preparar assets: icono 128×128, screenshots 1280×800, descripción en inglés y español.
3. Completar Privacy Policy (no se recopilan datos personales).
4. Submitir para revisión (1-3 días).
5. Publicar con visibilidad pública.

**MCPs a usar:**
- `snyk`: Scan final antes de publicar.
- `github`: Crear release tag v1.0.0, generar changelog.
- `playwright` + `chrome-extension-tester`: Smoke tests en build de producción.

---

## 5. Estructura de Sprints — Tabla Resumen

| Sprint | Duración | Features | Tests | MCPs |
|--------|----------|----------|-------|------|
| 0 | 3 días | Scaffold, manifest v1.1, build pipeline | Build CI | github, context7, snyk |
| 1 | 7 días | content_script, **InPageDock Shadow DOM**, TranslationPipeline | TC-01..TC-06 + TC-DOCK | playwright, chrome-devtools, context7 |
| 2 | 7 días | StudyAgent MVP, Anki TXT | TC-07, TC-09 (parcial) | context7, playwright, postman |
| 3 | 7 días | Streaming eval, .apkg, AnkiFlipPreview | TC-08, TC-09 completo | playwright, snyk, semgrep |
| 4 | 3 días | DevTab, glassmorphism, micro-UX, resize polish | TC-10..TC-11, regression | chrome-devtools, playwright |
| 5 | 3 días | Testing completo, empaquetado, publicación | TC-01..TC-14 completos | snyk, github, playwright+chrome-extension-tester |

---

## 6. Roles y Responsabilidades

| Rol                  | Responsabilidad                                                          |
|----------------------|--------------------------------------------------------------------------|
| Dev Full Stack       | Implementar todos los sprints                                            |
| Agente IA (GPT-4.1) | Asistir en implementación con los docs 02-05 como contexto              |
| QA / Tester          | Ejecutar test matrix en Fase 5                                           |
| DevOps               | CI/CD, empaquetado Chrome Web Store                                      |

---

## 7. Riesgos y Mitigaciones

| Riesgo                                         | Probabilidad | Impacto | Mitigación                                                  |
|------------------------------------------------|--------------|---------|-------------------------------------------------------------|
| Udemy cambia el selector CSS de subtítulos     | Media        | Alto    | Usar múltiples selectores CSS + MutationObserver configurable |
| Udemy cambia `.app--content-column--LnPGp` (margin-right dock) | Media | Medio | Múltiples selectores fallback para `adjustUdemyLayout()` |
| Chrome Web Store rechaza la extensión          | Baja         | Alto    | Revisar políticas de privacidad, no capturar datos sensibles |
| IA local no disponible (usuario sin servidor)  | Media        | Medio   | Fallback a mock translations con aviso claro al usuario     |
| sql.js WASM no carga en extensión              | Baja         | Alto    | Usar `locateFile` con URL del WASM embebida en el bundle    |
| Firefox incompatibilidad Manifest V3           | Media        | Medio   | Mantener manifest v2 alternativo; Shadow DOM es estándar web |
| Rendimiento: dock causa repintados al resize | Baja         | Medio   | `adjustUdemyLayout()` con requestAnimationFrame throttle |
| Shadow DOM "closed" rompe herramientas de debug | Baja         | Bajo    | Añadir `mode: "open"` flag en desarrollo, "closed" en producción |

---

## 8. Definición de "Hecho" (Definition of Done)

Una feature está **completa** cuando:
- [ ] Código implementado y commiteado en `develop`.
- [ ] Tests unitarios escritos y pasando.
- [ ] Test E2E cubre el flujo principal.
- [ ] No hay errores de TypeScript (`tsc --noEmit` limpio).
- [ ] No hay warnings de ESLint.
- [ ] Snyk scan: 0 vulnerabilidades críticas o altas.
- [ ] Funciona en Chrome 120+ y Firefox 115+.
- [ ] Se documenta en el doc correspondiente.

---

## 9. Herramientas MCP Disponibles en el Entorno

Ver documento completo: `05-MCP-HERRAMIENTAS.md`

**Resumen de cuándo usar cada MCP:**

| MCP                      | Cuándo usarlo en este proyecto                                    |
|--------------------------|-------------------------------------------------------------------|
| `context7`               | Antes de escribir código que usa Shadow DOM API, CustomEvents, o cualquier API externa |
| `figma`                  | Al replicar diseños del prototipo Figma Make                     |
| `playwright`             | Tests E2E de la extensión instalada en Chrome (incluyendo dock resize/collapse) |
| `chrome-extension-tester`| Instalar y probar la extensión en un navegador real              |
| `chrome-devtools`        | Debug del Shadow Root, overlay performance, margin-right adjustment |
| `git`                    | Historial de cambios antes de refactorizar                       |
| `github`                 | Issues, PRs, releases, CI status                                 |
| `snyk`                   | Scan de vulnerabilidades antes de cada release                   |
| `semgrep`                | Audit de seguridad al tocar autenticación o datos de usuario     |
| `postman`                | Verificar formato de respuesta de la IA local antes de codificar |
| `filesystem`             | Leer archivos fuera del contexto activo del agente              |
| `fetch`                  | Descargar specs, JSONs o páginas de referencia                  |
| `tavily-search`          | Buscar soluciones a errores o APIs recientes no cubiertas por context7 |
| `linear`                 | Crear/actualizar tasks y bugs del sprint                        |
| `notion`                 | Leer/actualizar PRD y docs del proyecto                         |

---

## 10. Notas Importantes para el Agente IA

1. **Arquitectura v1.1 In-page Dock**: LEER `07-INPAGE-DOCK-SHADOW-DOM.md` antes de tocar `content_script.ts` o `InPageDock.tsx`.
2. **Shadow DOM "closed"**: Nunca cambiar a "open" sin documentar el motivo. En desarrollo se puede usar "open" para facilitar debugging.
3. **El orden es estricto**: seguir el orden de sprints. No implementar Sprint 2 antes de que Sprint 1 esté completo.
4. **Antes de escribir código**: usar `context7` para obtener la API actualizada de cualquier librería.
5. **Antes de instalar paquetes**: verificar que no estén ya en `package.json`.
6. **Prompts de IA**: usar EXACTAMENTE los prompts del doc `04-PROMPTS-IA-LOCAL.md`. No inventar prompts nuevos.
7. **Diseño UI**: replicar EXACTAMENTE las specs del doc `03-DISEÑO-UI-DETALLADO.md`.
8. **Servicios**: los contratos de los servicios están en `01-ARQUITECTURA-TECH.md`. No cambiar las interfaces públicas.
9. **Selectores Udemy**: después de cada cambio en `content_script.ts`, actualizar `06-UDEMY-HTML-INTEGRACION.md`.
10. **adjustUdemyLayout()**: siempre que cambie el ancho o estado del dock, llamar esta función para ajustar el margen de Udemy.