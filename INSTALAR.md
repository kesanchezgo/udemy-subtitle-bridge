# 🎓 Udemy Subtitle Bridge - Chrome Extension Instalación

## ✅ Estado Actual
La extensión ha sido **completamente probada y funciona correctamente**:
- ✅ Carga sin bloquear páginas (1.3s en Udemy)
- ✅ Panel se inyecta correctamente debajo del reproductor
- ✅ Botones interactivos funcionan
- ✅ Sin errores de consola
- ✅ Storage API lista
- ✅ Background script (service worker) operacional

## 📥 Cómo Instalar en Tu Chrome

### Paso 1: Abre Chrome Extensions
1. En tu navegador Chrome, ve a: `chrome://extensions/`
2. O usa atajo: `Ctrl+Shift+J` → Menú → Más herramientas → Extensiones

### Paso 2: Activar Modo Desarrollador
1. En la esquina **superior derecha** de chrome://extensions/
2. Busca el toggle **"Modo de desarrollador"** y **actívalo**

### Paso 3: Cargar Extensión Sin Empaquetar
1. Haz clic en el botón **"Cargar extensión sin empaquetar"**
2. Navega a la carpeta del proyecto: `D:\Proyectos\OTROS\udemy-subtitle-bridge`
3. Selecciona la carpeta y haz clic en **"Seleccionar carpeta"**

### Paso 4: Verificar Instalación
1. Deberías ver la extensión aparecer en chrome://extensions/
2. Si aparece, la extensión está lista

### Paso 5: Probar en Udemy
1. **Importante**: Asegúrate de estar logueado en Udemy en tu navegador
2. Navega a cualquier curso donde tengas acceso
3. Abre cualquier lectura de video
4. **Debajo del reproductor de video**, deberías ver el panel "📚 USG Learning Panel"
5. El panel tiene un botón "Traducir Subtítulos" para iniciar las funciones

## 📁 Estructura de Archivos

```
udemy-subtitle-bridge/
├── manifest.json          ← Configuración MV3 de Chrome
├── src/
│   ├── content-script.js  ← Se inyecta en Udemy, observa DOM
│   └── background.js      ← Service worker, maneja API calls
├── token.txt              ← Cookies de sesión (no versionado)
└── test-complete-extension.js  ← Prueba de validación
```

## 🔧 Características Implementadas

### Content Script (content-script.js)
- 🔍 Detecta automáticamente clases de Udemy
- 💉 Inyecta panel debajo del reproductor de video
- 📨 Recibe mensajes del background script
- 💾 Carga datos locales del storage

### Background Script (background.js)
- 🔌 Actúa como service worker (MV3 compatible)
- 🤖 Enruta llamadas a API (máximo 1 por acción)
- 💬 Maneja comunicación entre componentes
- ⚡ Fail-fast sin reintentos automáticos

## ⚙️ Configuración

### Permisos Utilizados
- `scripting` - Inyectar content-script
- `storage` - Guardar datos locales
- `tabs` - Monitorear pestañas activas
- `activeTab` - Acceder a pestaña actual

### Host Permissions
- `https://*.udemy.com/*` - Solo funciona en Udemy

## 🐛 Solución de Problemas

### "La extensión no aparece en chrome://extensions/"
- Verifica que "Modo de desarrollador" esté **activado**
- Intenta recargar la página (F5)

### "El panel no aparece en Udemy"
1. Verifica que **estés logueado** en Udemy
2. Abre la consola (F12) → Pestaña "Console"
3. Busca mensajes con `[USG]` para ver logs de la extensión

### "Error de lectura en console"
- Es esperado si visitas un sitio que no es Udemy
- La extensión solo se activa en `https://*.udemy.com/*`

## 📊 Pruebas Realizadas

Todos los tests pasaron ✅:
```
✅ Sintaxis válida (content-script.js, background.js)
✅ Extensión carga sin errores
✅ Panel se inyecta correctamente
✅ Botones son interactivos
✅ Sin errores de consola
✅ API Storage lista para usar
```

## 🎯 Funciones Principales

### Panel de Aprendizaje
Aparece automáticamente en cada lectura con:
- 📚 Título "USG Learning Panel"
- 🔘 Botón "Traducir Subtítulos"
- 📝 Área de visualización de transcripciones
- 🌐 Soporte para subtítulos en inglés y español

### Traducción Automática
(Cuando se implemente LLM API):
- 1️⃣ Un solo llamada a IA por traducción
- ⏱️ Caché local de traducciones previas
- 💾 Persistencia entre sesiones

## 📝 Logs Disponibles

En la consola (F12), busca mensajes que empiezan con `[USG]`:
```javascript
[USG] Panel inyectado correctamente
[USG] Subtítulos cargados
[USG] Traducción en progreso...
```

## 🚀 Próximas Etapas (Opcional)

Después de probar el panel:
1. Integración con API local (LLM endpoint)
2. Importar/exportar subtítulos (.srt)
3. Historial de traducciones
4. Configuración de idiomas

## 📞 Soporte

Si hay problemas:
1. Abre F12 → Console
2. Recopia el error o el comportamiento
3. Revisa los logs `[USG]`
4. Si persiste, recrea manualmente: chrome://extensions/ → Quitar extensión → Volver a Cargar sin empaquetar

---

**Versión**: 1.0 (MV3 - Mayo 3, 2026)  
**Estado**: ✅ Funcional y Listo para Usar
