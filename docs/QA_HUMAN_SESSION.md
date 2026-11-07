# Sesión humana (QA de tiempos)

Lo único que falta para cerrar la pregunta de producto: cuánto tarda **una
persona** en leer y escribir durante el flujo. El arnés prepara todo, mide las
esperas de IA y observa, pero el tiempo humano solo sale de una sesión real.

## Antes

- Chrome con la extensión cargada desde `dist/` (`npm run build` primero).
- El proxy de IA configurado y respondiendo (el arnés lo apunta a
  `127.0.0.1:6660/v1` con `QA_REAL_PROXY=1`).
- Cookies de Udemy en `.qa-udemy-cookies.json` (raíz, ignorado por git).

## El ORDEN importa: primero A, después B

**B depende de A.** B usa `QA_KEEP_HISTORY=1` y aprovecha el objetivo que A dejó
guardado para ese curso; si se corre B primero, B también es «primera lección»
(el peor caso) y la comparación se pierde. Los dos en el **mismo curso**.

```bash
# 1º A · peor caso: primera lección del curso (historial limpio), flujo mínimo.
#     Elige el objetivo como lo harías normalmente. Se cumple si ≤ 4 min.
npm run qa:session:a

# 2º B · caso normal: otra lección de 15 min del MISMO curso.
#     NO cambies el objetivo: deja el que viene preseleccionado (si lo cambias,
#     se descarta el mazo pre-generado y B deja de ser el caso normal).
#     Resuelve el desafío de verdad y exporta el .apkg. Se cumple si ≤ 12 min.
npm run qa:session:b
```

Ambos usan el modo de observación: el script prepara la sesión, limpia la caché
(según el caso), adelanta el vídeo a ~3:30 del final para que la
pre-generación se dispare sola y **a partir de ahí no toca nada**. Tú miras el
tramo final, eliges el objetivo y estudias.

En A pulsa «Hacerlo después» en el paso Aplicar. En B resuelve el desafío y
exporta el mazo.

## Qué devuelve al terminar

```
── TIEMPO POR PASO (persona real, observado) ──
  Recordar   total   __s   espera IA   __s   humano   __s
  Comprobar  total   __s   espera IA   __s   humano   __s
  Aplicar    total   __s   espera IA   __s   humano   __s
  Fijar      total   __s   espera IA   __s   humano   __s
  TOTAL      __s desde Empezar (el vídeo previo no cuenta)
  espera tras pulsar Empezar: __s
  pre-generación lista: __s antes/después de Empezar
  terminó la lección: sí · mazo pre-generado consumido: sí/no · escalones: {...}
```

Orden para mirarlo:

1. **Espera tras pulsar Empezar** y si la pre-generación estaba lista antes.
2. **Tiempo humano por paso** — la única cifra que da una persona.
3. **Mazo pre-generado consumido** — en B debería ser `sí`; en A puede ser `no`
   (primera lección, sin objetivo recordado).

## Criterio de decisión sobre A

Hay que mirar **dos cifras**, no una:

- **A tal como salió** (peor caso: sin pre-generación, porque con el historial
  limpio cambiar de objetivo la descarta).
- **A en el caso normal**: `total − espera tras Empezar + 2 s` (la espera que
  quedaría con el mazo pre-generado listo, como en las lecciones siguientes).

Con eso:

- Si **las dos** pasan de 4 min → recortar el flujo mínimo (una sola pregunta)
  o subir el objetivo a ~5 min.
- Si **solo falla la de peor caso** → probablemente basta con aceptar que la
  primera lección de cada curso sea algo más lenta, sin tocar el flujo mínimo.
- Si **ninguna** pasa de 4 min → no hay nada que decidir.

## Referencia de máquina (ya medido, sin persona)

Lección de 15 min, flujo mínimo:

| Ventaja de la pre-generación | Espera tras Empezar |
|---|---|
| 35 s | 65 s |
| 159 s | **2 s** |

La espera es `max(0, generación − ventaja)`, con generación de 65-105 s (peor
caso con escalada: ~150 s). Con la ventana de 3 min usada entera la espera
desaparece; en el peor caso quedan 0-30 s. No hace falta adelantar el disparo
para el caso típico.

## Medición con el arnés instrumentado (5 corridas, sin persona)

`scripts/qa-real-usage.mjs` mide la sesión y cierra cada corrida con una línea
`plan · …`: tamaño del mazo persistido (`usb_history_lecture`), ideas marcadas
al entrar a Comprobar, «Pregunta N de M» del plan, por cada «Revisar mi
respuesta» los segundos hasta el veredicto pintado y si siguió consolidación,
config activa, y celebración (clic en «Terminar lección» → toast). No cambia
qué marca ni qué teclea el arnés.

Proveedor: servidor local compatible con OpenAI en `127.0.0.1:6660/v1`, modelo
gratuito del momento `deepseek-v4.1-flash:free`. Lección A «Demo: Declaring &
Re-initializing Variables» (15 min), B «Demo: Exceptions & Exception Handling»
(15 min).

```
A sin mazo #1 · plan · ideas 6 · preguntas 6 · marcadas 0 · plan «de 5» · revisiones [7s incorrecta, 7s incorrecta, 6s incorrecta, 6s incorrecta, 16s incorrecta] · modelo deepseek-v4.1-flash:free · celebración n/d · INCOMPLETA
A sin mazo #2 · plan · ideas 6 · preguntas 7 · marcadas 0 · plan «de 5» · revisiones [9s incorrecta, 9s incorrecta, 7s incorrecta, 6s incorrecta, 6s incorrecta] · modelo deepseek-v4.1-flash:free · celebración n/d · INCOMPLETA
A con mazo #1 · plan · ideas 6 · preguntas 7 · marcadas 0 · plan «de 5» · revisiones [193s incorrecta, 128s incorrecta, 70s incorrecta, 5s incorrecta, 8s incorrecta] · modelo deepseek-v4.1-flash:free · celebración n/d · INCOMPLETA
A con mazo #2 · plan · ideas 6 · preguntas 6 · marcadas 0 · plan «de 5» · revisiones [8s incorrecta, 6s incorrecta, 8s incorrecta, 5s incorrecta, 6s incorrecta] · modelo deepseek-v4.1-flash:free · celebración n/d · INCOMPLETA
B completa    · plan · ideas 7 · preguntas 7 · marcadas 0 · plan «de 5» · revisiones [157s incorrecta, 9s incorrecta, 6s incorrecta, 14s incorrecta, 12s incorrecta] · modelo deepseek-v4.1-flash:free · celebración 0 s
```

Lectura:

- **El plan siempre queda «de 5»** aunque el mazo varíe por generación
  (ideas 6-7, preguntas 6-7): manda `checkCap` = min(5, ideas, preguntas).
  «Marcadas» fue 0 en las cinco (el arnés no marca ideas en Recordar).
- **La espera del veredicto es del proveedor, no de la app**: 5-16 s en cuatro
  corridas frente a 70-193 s en la de madrugada. Veredicto «incorrecta» en las
  21 revisiones (el arnés teclea respuestas fijas); siempre siguió
  consolidación tras la 1ª-4ª.
- **Solo B llegó a «Terminar lección»** (el arnés mínimo se atasca unos 30 s en
  los clics finales y queda INCOMPLETA — limitación del arnés, no del flujo):
  objetivo ≤ 12 min ✓ (478 s) y la celebración salió a los 0 s, dentro del
  panel.
- **En flujo mínimo el mazo pre-generado no se consumió** aunque el arnés
  buscara la ventana (espera tras «Empezar» ≈ 94 s, igual que sin mazo); en B
  (flujo completo) sí se consumió (1 s). Dato sin decidir: no se cambió nada
  del arnés ni de la app.
- El proveedor gratuito falla de tres maneras: 503 «all keys locked», 429
  «under heavy load», y 200 con texto («The model used its entire output
  budget on reasoning…») o JSON truncado en los dos escalones. Un 401/403 es
  el proxy pasando el rechazo de una key upstream vencida: la prueba de
  conexión (GET /models) sigue en 200, por eso «Conexión correcta» y el aviso
  del dock no se contradicen.