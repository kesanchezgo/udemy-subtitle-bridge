# Sesión humana (QA de tiempos)

Lo único que falta para cerrar la pregunta de producto: cuánto tarda **una
persona** en leer y escribir durante el flujo. El arnés puede preparar todo,
medir las esperas de IA y observar, pero el tiempo humano solo sale de una
sesión real.

## Antes

- Chrome con la extensión cargada desde `dist/` (`npm run build` primero).
- El proxy de IA configurado y respondiendo (por defecto el arnés lo apunta a
  `127.0.0.1:6660/v1` con `QA_REAL_PROXY=1`).
- Sesión de Udemy con cursos comprados: `.qa-udemy-cookies.json` en la raíz
  (ignorado por git) con las cookies exportadas.

## Los dos casos

```bash
# A · peor caso: primera lección del curso (historial limpio), flujo mínimo.
#     Se cumple si salen ≤ 4 min desde Empezar.
npm run qa:session:a

# B · caso normal: otra lección de 15 min, objetivo ya recordado del curso.
#     Resolver el desafío de verdad y exportar el .apkg. Se cumple si ≤ 12 min.
npm run qa:session:b
```

Ambos usan el modo de observación: el script prepara la sesión, limpia la caché
(según el caso), adelanta el vídeo a ~3:30 del final para que la
pre-generación se dispare sola y **a partir de ahí no toca nada**. Tú miras el
tramo final del vídeo, eliges el objetivo como lo harías normalmente y estudias.

En A pulsa «Hacerlo después» en el paso Aplicar (es el flujo mínimo). En B
resuelve el desafío y exporta el mazo.

## Qué devuelve al terminar

Un resumen por paso y una línea final:

```
── TIEMPO POR PASO (persona real, observado) ──
  Recordar   total   __s   espera IA   __s   humano   __s
  Comprobar  total   __s   espera IA   __s   humano   __s
  Aplicar    total   __s   espera IA   __s   humano   __s
  Fijar      total   __s   espera IA   __s   humano   __s
  TOTAL      __s desde Empezar (el vídeo previo no cuenta)
  terminó la lección: sí · mazo pre-generado consumido: sí/no · escalones: {...}
```

Lo que hay que mirar, en este orden:

1. **Espera tras pulsar Empezar** — es lo que la pre-generación debe eliminar.
2. **Tiempo humano por paso** — la única cifra que solo da una persona.
3. **Mazo pre-generado consumido** — en B debería ser `sí`; en A puede ser `no`
   (primera lección, sin objetivo recordado).

## Criterio de decisión

Con los dos resúmenes delante:

- Si **A** sale por debajo de 4 min → el flujo mínimo está bien como está.
- Si **A** pasa de 4 min → elegir entre una sola pregunta en el flujo mínimo o
  subir el objetivo a ~5 min. Se decide con los datos, no antes.

## Referencia de máquina (ya medido)

Corrida de máquina (sin persona), lección de 15 min, flujo mínimo:

| Ventaja de la pre-generación | Espera tras Empezar |
|---|---|
| 35 s | 65 s |
| 159 s | **2 s** |

La espera es `max(0, generación − ventaja)` con una generación de 65-105 s
(peor caso con escalada: ~150 s). Con la ventana de 3 min usada entera la
espera desaparece; en el peor caso quedan 0-30 s. No hace falta adelantar el
disparo para el caso típico.