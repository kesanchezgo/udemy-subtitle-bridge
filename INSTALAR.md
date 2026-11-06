# Instalar Kinema — by Kivara

Extensión de Chrome (MV3) para estudiar lecciones de Udemy: subtítulos en español sobre el vídeo, sesión de estudio en 4 pasos (Recordar → Comprobar → Aplicar → Fijar), mazos de Anki y nota de Obsidian. La versión instalada es la de `manifest.json`.

## 1. Compilar

Requisitos: Node.js 20 o posterior y Chrome (o Chromium).

```bash
npm ci
npm run build
```

El build deja la extensión lista en `dist/`.

## 2. Cargar en Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige la carpeta **`dist/`**, no la raíz del repositorio.

Después de cada `git pull`: `npm run build`, recarga Kinema en `chrome://extensions` y recarga también las pestañas de Udemy que tengas abiertas. Una pestaña abierta antes de recargar la extensión pierde la conexión con ella.

**Error «Invalid script mime type … src/content_script.ts»:** cargaste la raíz del repositorio. Quita la extensión y vuelve a cargarla desde `dist/`: Chrome solo ejecuta el JavaScript compilado.

## 3. Configurar la IA

1. Abre una lección de Udemy (`https://www.udemy.com/course/…/learn/lecture/…`). El panel de Kinema aparece bajo el reproductor.
2. En **Ajustes → Proveedor de IA**, elige el motor: **Local** (en tu equipo, sin llave; por defecto `127.0.0.1:8010`), **OpenAI** o compatible (DeepSeek, OpenRouter, Groq), **Claude** o **Gemini**, con su API key.
3. Si el endpoint está en un dominio que Kinema no tiene declarado, aparece **Conceder permiso**: abre una pestaña donde Chrome te pide ese acceso.

El indicador de la cabecera muestra el estado real del motor: «conectada» o «sin conexión» en local; «nube», «sin configurar» o «sin respuesta» en la nube. Mientras la IA no responde, las acciones que la necesitan quedan desactivadas y dicen por qué; se activan solas en cuanto el proveedor responde.

## 4. Comprobar que funciona

- `npm run qa:full`: el flujo completo contra un clon local de Udemy con IA simulada, sin cuenta ni IA real. Necesita el puerto 8010 libre y, la primera vez, `npx playwright install chromium`. Resultado esperado: «57/57 comprobaciones en verde».
- `npm run qa:ai-health`: textos y estados de la IA, sin navegador.

En la consola de la pestaña (F12), los mensajes de Kinema empiezan por `[USG]`.

## 5. Problemas frecuentes

| Síntoma | Qué hacer |
|---|---|
| El panel no aparece | Comprueba que estás en una lección (`/course/…`) y recarga la pestaña. |
| Las acciones de IA siguen desactivadas | Lee el motivo en el propio botón o en el indicador de la cabecera y revisa **Ajustes → Proveedor de IA**. Con IA local, arranca antes el servidor. |
| «No se pudo contactar con el background de la extensión» | La extensión se recargó con la pestaña abierta: recarga la pestaña de Udemy. |

Funciones, mazos de Anki, Obsidian y privacidad: [`README.md`](README.md) y [`docs/`](docs/README.md).
