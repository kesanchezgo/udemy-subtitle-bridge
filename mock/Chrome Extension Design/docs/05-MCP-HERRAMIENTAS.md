# Udemy Subtitle Bridge — MCPs Disponibles y Cómo Usarlos
> Guía de uso de herramientas MCP para el agente IA en este proyecto

---

## Regla General

**Antes de usar cualquier MCP**, el agente debe verificar:
1. ¿Está disponible? (Ejecutar `/mcp` en Codex CLI para ver servidores activos)
2. ¿Es el MCP correcto para la tarea? (usar la tabla de decisión al final)
3. ¿Ya tengo esta información en el contexto? (evitar llamadas redundantes)

---

## 1. context7 — Documentación de Librerías

**Cuándo usarlo en este proyecto:**
- Antes de usar `@crxjs/vite-plugin` — API del manifest, configuración de entry points
- Antes de usar `sql.js` — API de initSqlJs, Database, prepare/run, export
- Antes de usar `motion` (framer motion) — AnimatePresence, layoutId, spring transitions
- Antes de usar `jszip` — generateAsync, file(), tipos de compresión
- Antes de usar `chrome.runtime` / `chrome.tabs` — API de extensiones Chrome
- Antes de usar `MutationObserver` — opciones, disconnect, observe

**Ejemplo de uso:**
```
[Tarea: implementar sql.js en ankiApkg.ts]
1. Usar context7 con query: "sql.js initSqlJs Database prepare run export wasm"
2. Revisar la respuesta para confirmar la API actual
3. Implementar ankiApkg.ts usando exactamente esa API
```

---

## 2. figma — Diseño UI desde Figma

**Cuándo usarlo en este proyecto:**
- Al replicar pantallas del prototipo Figma Make en la extensión real
- Para extraer tokens de color exactos del diseño
- Para obtener spacing y tipografía precisos
- Al crear assets (íconos, logos) que deben coincidir con el diseño

**Requiere:** Login previo con `codex mcp login figma`

**Ejemplo de uso:**
```
[Tarea: replicar el header del sidebar]
1. Usar figma MCP con el ID del frame del header
2. Extraer: colores exactos, tamaño del logo, font-weight del título
3. Implementar con los valores extraídos
```

---

## 3. playwright — Tests E2E

**Cuándo usarlo en este proyecto:**
- Verificar que el content script se inyecta correctamente en Udemy
- Probar el flujo completo: instalar extensión → video → overlay → traducción
- Smoke tests antes de hacer release
- Regression tests después de cambios en content_script.ts

**Casos de uso específicos:**

```typescript
// TC-01: Verificar inyección del content script
await page.goto('https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/');
await page.waitForSelector('#usb-overlay'); // el overlay div

// TC-03: Verificar PING/PONG
// Simular el envío de PING desde el sidebar y esperar PONG en el content
const pongReceived = await page.evaluate(() => {
  return new Promise(resolve => {
    window.addEventListener('usb_to_sidebar', e => {
      if (e.detail.type === 'PONG') resolve(true);
    });
    window.dispatchEvent(new CustomEvent('usb_to_content', {
      detail: { type: 'PING' }
    }));
    setTimeout(() => resolve(false), 2000);
  });
});
expect(pongReceived).toBe(true);
```

---

## 4. chrome-extension-tester — Tests de Extensión Real

**Cuándo usarlo en este proyecto:**
- Instalar la extensión en Chrome real (no mocks)
- Verificar que los permisos del manifest funcionan
- Probar chrome.storage.sync en contexto real
- Verificar que chrome.tabs.sendMessage llega al content script

**Flujo de uso:**
```
1. Ejecutar: pnpm build
2. chrome-extension-tester: install --path ./dist
3. chrome-extension-tester: open-url https://www.udemy.com/course/XXX
4. chrome-extension-tester: screenshot (verificar overlay visible)
5. chrome-extension-tester: evaluate-script "document.getElementById('usb-overlay')"
```

---

## 5. chrome-devtools — Debug del Navegador

**Cuándo usarlo en este proyecto:**
- Debug de mensajes entre content script y sidebar (Network → WS)
- Inspeccionar el DOM del overlay inyectado
- Verificar rendimiento del overlay (no debe causar repaints)
- Debug de SSE chunks en tiempo real (Network → EventStream)

**Casos de uso específicos:**

```
[Debug: el overlay no aparece]
1. Abrir chrome-devtools
2. Inspeccionar DOM: buscar elemento con id="usb-overlay"
3. Si no existe: revisar que content script se inyectó (Sources → Content Scripts)
4. Si existe pero invisible: revisar z-index y position

[Debug: SSE no llega]
1. chrome-devtools → Network → Filter "EventStream"
2. Abrir request a 127.0.0.1:8010/v1/chat/completions
3. Ver pestaña "EventStream" para tokens en tiempo real
```

---

## 6. git — Control de Versiones Local

**Cuándo usarlo en este proyecto:**
- Antes de refactorizar cualquier servicio: `git diff HEAD~1 src/app/services/`
- Para entender el contexto de un cambio reciente: `git log --oneline -10`
- Para revertir un cambio problemático: `git stash` o `git checkout -- file`

**Comandos más útiles para este proyecto:**
```bash
git log --oneline --graph -15   # ver historial reciente
git diff HEAD src/app/          # cambios no commiteados
git blame src/app/services/localAI.ts  # quién cambió qué
git stash                       # guardar cambios temporalmente
git stash pop                   # recuperar cambios guardados
```

---

## 7. github — Repositorio Remoto

**Cuándo usarlo en este proyecto:**
- Crear issues para bugs encontrados durante testing
- Revisar PRs antes de mergear a main
- Crear releases con changelog automático
- Verificar status de CI antes de deploying

**Flujo de release:**
```
1. github: crear tag v1.0.0 en rama main
2. github: crear release con descripción del changelog
3. github: adjuntar el .zip de la extensión como asset del release
4. Notificar a usuarios en la descripción del release
```

---

## 8. snyk — Seguridad de Dependencias

**Cuándo usarlo en este proyecto:**
- Al agregar cualquier dependencia nueva (sql.js, jszip, etc.)
- Antes de cada release (Fase 5)
- Si GitHub Dependabot reporta una vulnerabilidad

**Cómo usar:**
```bash
# Snyk escanea automáticamente todos los manifests
snyk test               # scan del proyecto actual
snyk monitor            # monitoreo continuo
snyk fix                # corregir vulnerabilidades automáticamente cuando es posible
```

**Umbrales aceptables:**
- Critical: 0 (bloquea release)
- High: 0 (bloquea release)
- Medium: revisar caso por caso
- Low: aceptable si no hay solución disponible

---

## 9. semgrep — Análisis Estático de Seguridad

**Cuándo usarlo en este proyecto:**
- Al modificar `chromeStorage.ts` (manejo de datos de usuario)
- Al modificar `localAI.ts` (peticiones de red)
- Antes de publicar en Chrome Web Store
- Al agregar nuevos permisos al manifest

**Uso en este proyecto:**
```bash
# Revisar manejo de datos de usuario
semgrep --config=auto src/app/services/chromeStorage.ts
semgrep --config=auto src/app/services/localAI.ts

# Revisar el content script (acceso al DOM de páginas externas)
semgrep --config=auto src/content_script.ts
```

---

## 10. postman — Tests de API

**Cuándo usarlo en este proyecto:**
- Verificar que la IA local responde en el formato esperado antes de codificar
- Probar los prompts nuevos antes de integrarlos en el código
- Debugging cuando la traducción da resultados inesperados

**Colección de Postman para este proyecto:**

```json
{
  "name": "Udemy Subtitle Bridge — Local AI",
  "item": [
    {
      "name": "Translate Subtitle (streaming)",
      "request": {
        "method": "POST",
        "url": "http://127.0.0.1:8010/v1/chat/completions",
        "body": {
          "model": "local-model",
          "messages": [
            { "role": "system", "content": "Eres un traductor técnico... [prompt completo del doc 04]" },
            { "role": "user", "content": "Java is a strongly typed language" }
          ],
          "stream": true,
          "temperature": 0.1,
          "max_tokens": 120
        }
      }
    },
    {
      "name": "Evaluate Question Answer",
      "request": {
        "method": "POST",
        "url": "http://127.0.0.1:8010/v1/chat/completions",
        "body": {
          "model": "local-model",
          "messages": [
            { "role": "system", "content": "[system prompt del doc 04]" },
            { "role": "user", "content": "PREGUNTA: ¿Qué es la JVM?\n\nRESPUESTA ESPERADA: ...\n\nRESPUESTA DEL ESTUDIANTE: La JVM convierte el código" }
          ],
          "stream": false,
          "temperature": 0.3,
          "max_tokens": 380
        }
      }
    }
  ]
}
```

---

## 11. filesystem — Lectura de Archivos

**Cuándo usarlo en este proyecto:**
- Leer archivos generados (dist/, build artifacts)
- Inspeccionar el .apkg generado (es un ZIP, deberías poder verificar su contenido)
- Leer logs de tests cuando son muy largos para el contexto

**Ejemplo:**
```
[Tarea: verificar que el .apkg generado tiene el schema correcto]
1. filesystem: read ./tests/output/test.apkg (como binario)
2. Nota: .apkg es un ZIP — renombrar a .zip y extraer
3. filesystem: read ./collection.anki2 (el SQLite extraído)
```

---

## 12. fetch — Descargar Recursos Externos

**Cuándo usarlo en este proyecto:**
- Descargar la spec oficial de Manifest V3 cuando haya dudas
- Obtener el schema de Anki .apkg cuando context7 no lo cubre
- Descargar la documentación de LM Studio API
- Obtener ejemplos de otras extensiones Chrome open-source

**Ejemplos:**
```
fetch: https://developer.chrome.com/docs/extensions/reference/api/
fetch: https://github.com/ankitects/anki/blob/main/pylib/anki/exporting.py
fetch: https://lmstudio.ai/docs/api
```

---

## 13. tavily-search — Búsqueda Web

**Cuándo usarlo en este proyecto:**
- Cuando la extensión falla por cambios recientes en la API de Udemy
- Para buscar el selector CSS actualizado de los subtítulos de Udemy
- Para encontrar soluciones a errores específicos de chrome extensions
- Cuando context7 y fetch no tienen la información (librería muy nueva o niche)

**Ejemplos de queries:**
```
"udemy subtitle element CSS selector 2024 site:stackoverflow.com"
"@crxjs/vite-plugin manifest v3 side panel chrome extension 2024"
"sql.js wasm content security policy chrome extension"
"chrome extension side panel api example github"
```

---

## 14. linear — Project Management

**Cuándo usarlo en este proyecto:**
- Crear un issue para cada bug encontrado en testing
- Actualizar el status de los sprints
- Crear subtasks para features complejas (como el Study Agent)

**Flujo de uso:**
```
[Bug encontrado en TC-09: .apkg no abre en Anki]
1. linear: crear issue "Bug: .apkg generado no abre en Anki desktop"
2. Agregar labels: bug, sprint-3, high-priority
3. Asignar al dev actual
4. Cuando se corrige: linear: close issue con resolución
```

---

## 15. notion — Documentación del Proyecto

**Cuándo usarlo en este proyecto:**
- Leer el PRD si existe en Notion
- Actualizar el status de los sprints en la wiki del equipo
- Consultar decisiones de arquitectura documentadas en ADRs
- Crear meeting notes de design reviews

---

## Tabla de Decisión Rápida

| Tarea                                           | MCP a usar                    |
|------------------------------------------------|-------------------------------|
| Implementar sql.js para .apkg                  | context7                      |
| Replicar diseño del prototipo Figma Make        | figma                         |
| Verificar que el overlay se inyecta en Udemy    | playwright + chrome-extension-tester |
| Debug de mensajes content script ↔ sidebar     | chrome-devtools               |
| Verificar formato de respuesta de la IA local  | postman                       |
| Antes de hacer release: scan de seguridad      | snyk + semgrep                |
| El selector CSS de subtítulos de Udemy cambió  | tavily-search                 |
| Crear release v1.0.0 en GitHub                 | github                        |
| Entender un cambio reciente antes de refactor  | git                           |
| Bug reportado en producción por usuario        | sentry (si está configurado)  |
| Track de bugs y sprints                        | linear                        |
| Leer PRD y decisiones de arquitectura          | notion                        |

---

## Protocolo para el Agente IA

```
ANTES de cualquier implementación:
1. context7 → verificar API de la librería que voy a usar
2. git → ver si hay cambios recientes en el archivo que voy a modificar
3. filesystem → leer el archivo completo si no está en contexto

DURANTE la implementación:
- Si encuentro un error que no entiendo: tavily-search
- Si necesito verificar que mi código hace lo correcto: postman (para APIs) o playwright (para UI)

ANTES de hacer commit:
- tsc --noEmit → verificar tipos
- pnpm lint → verificar ESLint
- pnpm test → pasar todos los tests

ANTES de release:
- snyk test → 0 vulnerabilidades críticas/altas
- semgrep → revisar código de red y storage
- chrome-extension-tester → smoke tests en Chrome real
- github → crear PR, esperar CI verde
```

---

## Notas sobre MCPs No Activos por Defecto

Los siguientes MCPs requieren configuración adicional (credenciales):

- **postgres/mysql/mongodb**: No aplica para este proyecto (no hay backend propio)
- **redis**: No aplica (sin caché de servidor)
- **docker**: Útil si se containeriza el servidor IA local en desarrollo
- **kubernetes**: No aplica (extensión de navegador, sin k8s)
- **sentry**: Configurar si se quiere monitoreo de errores en producción
- **marionette/mobile**: No aplica (no es app móvil)
- **spring-initializr**: No aplica (no es proyecto Spring Boot)

Para activarlos: editar `~/.codex/config.toml` y descomentar la sección correspondiente con las credenciales reales.
