# Ejemplo: nota de sesión guardada en Obsidian

> Generada por el builder real (`src/app/services/obsidianExport.ts`) con una sesión de ejemplo
> (el EJEMPLO A del prompt de estudio) y el resultado de una sesión típica.
> Ruta en el vault de la nota (fase 5: una carpeta por curso, se guarda sola al terminar la lección): `wiki/fuentes/java-bootcamp/java-bootcamp---como-java-ejecuta-tu-codigo.md` — índice del curso (MOC): `cursos/java-bootcamp.md`.

---

## 1. Nota de sesión (tal como llega al vault)

````markdown
---
title: "Cómo Java ejecuta tu código — Java Bootcamp"
date: 2026-11-05
type: sesion
platform: udemy
course: java-bootcamp
lesson: "Cómo Java ejecuta tu código"
objective: "Preparar entrevistas backend con Java"
relevance_score: 92
lesson_url: "https://www.udemy.com/course/java-bootcamp/learn/lecture/12345"
anki_deck: "Kinema::Courses::Java Bootcamp"
concepts: [bytecode, jvm, jit]
tags: [kinema/sesion, kinema/curso/java-bootcamp, kinema/plataforma/udemy]
---

# Cómo Java ejecuta tu código

Curso: [[cursos/java-bootcamp|Java Bootcamp]]
Objetivo: Preparar entrevistas backend con Java

## Resumen

La lección recorre el camino del código Java: javac lo compila a bytecode, la JVM de cada plataforma lo interpreta y el JIT traduce en caliente los hot spots a nativo. Ese reparto explica por qué el mismo .class corre en Windows y Linux sin recompilar, y por qué el rendimiento se acerca al nativo tras el warm-up.

> Relevancia para tu objetivo: 92/100 — La lección explica el mecanismo central de portabilidad de Java, directamente útil para entrevistas backend.

## Ideas clave

- **Qué produce javac** — javac compila el fuente a bytecode, no a código nativo
- **Quién ejecuta el bytecode** — la JVM de cada plataforma interpreta el bytecode
- **Por qué no es lento** — el JIT compila los hot spots a nativo en runtime
- **Portabilidad** — un .class corre donde exista una JVM, sin recompilar

> Fase 4: si una idea ya estaba en tu mazo (de otra lección del curso), su línea lo dice y enlaza con la nota de esa lección, p. ej.
> `- **Qué es un hot spot** — … · _ya en tu mazo: [[java-bootcamp---arquitectura-de-la-jvm|Arquitectura de la JVM]]_`,
> y «Resultado de la sesión» añade `· 1 idea ya estaba en tu mazo` a la línea de Tarjetas.

Conceptos: [[wiki/conceptos/bytecode|bytecode]] · [[wiki/conceptos/jvm|JVM]] · [[wiki/conceptos/jit|JIT]]

## Preguntas para comprobarte

> [!question]- ¿Qué archivo genera exactamente javac a partir del código fuente? _(explicar)_
> _Pista:_ No es un .exe; es un formato intermedio
> **Respuesta:** Un archivo .class con bytecode

> [!question]- ¿Qué componente ejecuta el bytecode en cada sistema operativo? _(explicar)_
> _Pista:_ Es específico de cada plataforma
> **Respuesta:** La JVM instalada en esa plataforma, que lo interpreta

> [!question]- Si Java interpreta bytecode, ¿por qué no es lento como un intérprete puro? _(analizar)_
> _Pista:_ Parte del código se transforma durante la ejecución
> **Respuesta:** El JIT detecta hot spots y los compila a código nativo, cacheando y reutilizando el resultado

> [!question]- ¿Por qué el mismo .class puede correr en Windows y Linux sin recompilar? _(usar en un caso)_
> _Pista:_ Algo específico de la plataforma hace el trabajo
> **Respuesta:** La JVM de cada plataforma interpreta el mismo bytecode

> [!question]- Un compañero dice que Java es más lento que C++ para todo. Evalúa esa afirmación. _(valorar)_
> _Pista:_ Depende del workload y del JIT
> **Respuesta:** En picos cálidos el JIT acerca el rendimiento a nativo; C++ sigue ganando en latencia predecible y control de memoria. La afirmación es una simplificación.

## Práctica oral

> [!question]- Explica en un minuto cómo Java logra independencia de plataforma sin perder velocidad.
> **Estructura ideal:** Dos capas: compilación a bytecode (portabilidad) + JVM con JIT (velocidad). Mencionar write-once-run-anywhere y warm-up.

## Aplicación práctica

**Escenario:** Compilas App.java en tu laptop y quieres ejecutarlo en un servidor Linux con otra JVM

**Reto:** Completa los dos comandos que faltan para ejecutarlo en el servidor sin recompilar

**Formato:** Completar · el código

```bash
____ App.java        # en la laptop: genera App.class
scp App.class servidor:~/
ssh servidor ____ App  # sin recompilar
```

> [!example]- Ver solución
> Hueco 1: javac · Hueco 2: java
>
> javac compila una vez a bytecode; en el servidor, java arranca su JVM, que interpreta ese mismo .class.

> [!note]- Solución explicada
> javac App.java genera App.class en la laptop; en el servidor basta java App, porque su JVM interpreta el mismo bytecode

## Próximo paso

- [ ] Ejecuta tu app con -XX:+PrintCompilation y observa el JIT en acción

## Resultado de la sesión

**Lección completada**

- Recordaste (según tú): 3 de 4 ideas
- Lo que dijiste saber: se confirmó
- Comprobación: 1 a la primera · 1 tras corregir
- Práctica: correcta · a la primera (Completar)
- Tarjetas: 4 (1 de refuerzo) · en Anki

> [!info] Calibración: Elegiste «Entendido» y lo demostraste.

## Lo que recordé sin mirar

javac compila a bytecode y la JVM lo ejecuta; el JIT acelera lo que más se usa.

## Puntos a reforzar

No me salieron sin mirar:
- portabilidad = un .class corre donde exista JVM

> [!question]- ¿Por qué el mismo .class puede correr en Windows y Linux sin recompilar?
> **Respuesta:** La JVM de cada plataforma interpreta el mismo bytecode

> [!example]- Tarjetas de esta lección (4) · repásalas en Anki
> **¿Qué produce `javac` a partir del código fuente?**
> **Bytecode** en archivos `.class`, no código máquina nativo.
> El bytecode es un formato intermedio: solo la JVM puede ejecutarlo.
>
> **¿Qué comando ejecuta `App.class` en cualquier máquina con JVM?**
> **`java App`**: la JVM de esa máquina carga e interpreta el bytecode, sin recompilar.
>
> ```bash
> javac App.java # genera App.class
> java App # la JVM lo ejecuta
> ```
>
> **¿Cuándo compila el JIT frente al AOT y qué gana cada uno?**
> **JIT compila en runtime** (gana optimización con perfiles reales); **AOT antes de ejecutar** (gana arranque inmediato, sin warm-up).
>
> | | JIT | AOT |
> | --- | --- | --- |
> | Cuándo | en runtime | antes de ejecutar |
>
> **¿Por qué Java es portable pero rápido?**
> Entrevista
>
> - **Portabilidad:** el bytecode corre donde haya JVM.
> - **Velocidad:** el JIT compila hot spots a nativo en caliente.
> - **Frase de cierre:** «compila una vez, ejecuta donde haya JVM; acelera en caliente con JIT».
>

> [!info] Estas tarjetas se sincronizan automáticamente con tu mazo de Anki.

````

---

## 2. Índice del curso (MOC, se ofrece solo la primera vez de cada curso)

````markdown
---
title: "Java Bootcamp"
date: 2026-11-05
type: curso
platform: udemy
status: en-progreso
tags: [kinema/moc/curso, kinema/plataforma/udemy]
---

# Java Bootcamp

**Objetivo:** Preparar entrevistas backend con Java

> [!tip] Las sesiones se listan solas: cada nota de Kinema lleva la etiqueta
> `kinema/sesion` y `course: java-bootcamp` en el frontmatter, esté en la carpeta que esté.

## Sesiones

```dataview
TABLE lesson AS "Lección", date AS "Fecha", relevance_score AS "Relevancia"
FROM "wiki/fuentes" OR #kinema/sesion
WHERE course = "java-bootcamp"
SORT date DESC
```

## Progreso

- [ ] Terminar todas las lecciones planificadas
- [ ] Destilar conceptos clave → [[wiki/conceptos/]]

## Conceptos del curso

- (destilado supervisado: enlazar aquí [[wiki/conceptos/...]])

````

Con el plugin Dataview instalado, la sección **Sesiones** del MOC se renderiza como tabla
y muestra esta sesión automáticamente (y todas las siguientes del mismo curso).

## 3. Resultado esperado al probarlo tú

1. Conectas Obsidian una vez (Ajustes → Obsidian → Conexión: plugin **Local REST API**).
2. Estudias la lección y pulsas **Terminar lección**: sin exportar nada, Kinema guarda la nota en
   `wiki/fuentes/<curso>/` y, la primera vez de cada curso, su índice (el MOC en `cursos/`), de una vez.
3. Si Obsidian estaba cerrado, la nota espera y se guarda sola en cuanto lo abres.
4. Con **Dataview**, el MOC lista la sesión con fecha y relevancia; con «Repasar también en
   Obsidian» activado, las tarjetas van bajo `#flashcards` para el plugin **Spaced Repetition**.