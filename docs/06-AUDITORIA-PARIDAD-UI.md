# Auditoria de Paridad UI 1:1

Fecha: 2026-05-05
Base de comparacion: docs/03-DISEÑO-UI-DETALLADO.md

## Alcance revisado

- Header + Tab Nav del sidebar
- Tab Study (objetivo, generating, result)
- Tab Captions (estado, pipeline, SRT)
- Tab Overlay (preview + controles)
- Tab Dev (telemetria y request cards)

## Resultado ejecutivo

- Paridad alta ya alcanzada en: Header visual base, Tab Nav con indicador activo, TranslationPipeline, estado operativo de Captions, estructura de Overlay y telemetria SSE base en Dev.
- Brechas residuales: principalmente en microcomportamientos de Study y Dev para replica 1:1 exacta del spec (animaciones/estados granulares, comportamiento expandible y dinamismo por step).

## Checklist por modulo

### 1) Header + Tabs

- [x] Logo, titulo, subtitulo, badge de puerto y gear de dev mode
- [x] Indicador de tab activa y ping en Study
- [~] Visibilidad de tab Dev

Observacion:
- El spec muestra 4 tabs en nav; actualmente Dev depende de modo dev (triple click en gear).
- Referencias:
  - src/app/components/ExtensionSidebar.tsx:46
  - src/app/components/ExtensionSidebar.tsx:294

### 2) Captions + Pipeline

- [x] Tarjeta de estado en vivo
- [x] Toggle Auto EN -> ES
- [x] Gestion SRT (Export EN / Import ES)
- [x] Pipeline con estados idle/capturing/streaming/done
- [x] Historial visual de traducciones

Observacion:
- Muy cercano al spec funcional; quedan solo ajustes menores de copy/animacion fina en labels.
- Referencias:
  - src/app/components/ExtensionSidebar.tsx:113
  - src/app/components/ExtensionSidebar.tsx:167
  - src/app/components/ExtensionSidebar.tsx:186
  - src/app/components/TranslationPipeline.tsx

### 3) Study Agent

- [x] Fase objetivo (hero, objetivos 2x2, refine, inputs, generar)
- [x] Fase generating con spinner y pasos
- [x] Fase result con score, conceptos, calibracion, quiz, code challenge, anki
- [~] Dinamismo 1:1 de StepHeader/estado por paso y Bloom/dificultad

Brechas detectadas:
- Stepper de result esta hardcodeado, no modelado por estado real de pasos.
- Badge Bloom actual fijo ("Bloom · Aplicar") sin estrategia dinamica por nivel.
- Hay streaming de evaluacion IA, pero el layout/resultados no reproducen todos los estados de detalle del spec.
- Referencias:
  - src/app/components/StudyAgentTab.tsx:205
  - src/app/components/StudyAgentTab.tsx:267
  - src/app/components/StudyAgentTab.tsx:323

### 4) Overlay

- [x] Preview 16:9 + codigo ficticio + toggle overlay activo
- [x] Selector de posicion y color
- [x] Sliders de tamano/opacidad/offset
- [x] Reset de posicion
- [~] Fidelity de componentes UI (sliders/switch) respecto a spec exacto

Brechas detectadas:
- El spec describe controles tipo Radix con estados visuales mas ricos; hoy los controles React viven dentro de ExtensionSidebar con slider/switch propios.
- Referencias:
  - src/app/components/ExtensionSidebar.tsx:349
  - src/app/components/ExtensionSidebar.tsx:390
  - src/app/components/ExtensionSidebar.tsx:399
  - src/app/components/ExtensionSidebar.tsx:434

### 5) Dev Tab

- [x] Summary por estado
- [x] Histograma de latencias
- [x] Request cards con contexto/status/preview
- [~] Comportamiento expandible/colapsable 1:1 y detalle profundo por request

Brechas detectadas:
- El spec define card colapsada/expandida con header button; actualmente la card se renderiza plana (sin toggle por item).
- Referencias:
  - src/app/components/DevTab.tsx:57
  - src/app/components/DevTab.tsx:117

## Priorizacion de brechas residuales

### Alta

1. Study: modelar estado real por paso en result (step headers, active/done/pending) en lugar de layout fijo.
2. Study: dinamizar Bloom y dificultad en base a calibracion/flujo de preguntas.

### Media

1. Dev: agregar expand/collapse por request card para paridad exacta del comportamiento del spec.
2. Header/Nav: decidir si Dev tab debe ser visible siempre en modo 1:1 (actualmente depende de devMode).

### Baja

1. Overlay: migrar a controles con comportamiento/estados visuales mas cercanos al spec Radix.
2. Captions/Pipeline: ajustar microcopy/animaciones para match visual fino.

## Validacion tecnica

- Problems (workspace): sin errores.
- QA local: ultimo registro de terminal en esta sesion indica exit code 0 para `npm run qa:local`.

## Recomendacion de cierre

Para declarar 1:1 cerrado, abordar primero las brechas de prioridad Alta (Study) y luego Media (Dev + decision de visibilidad de tab Dev). Con eso, el gap residual quedaria practicamente visual de detalle.