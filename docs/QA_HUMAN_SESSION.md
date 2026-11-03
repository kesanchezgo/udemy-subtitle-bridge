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