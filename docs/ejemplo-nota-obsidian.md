# Ejemplo: nota de sesión exportada a Obsidian

> Generada por el builder real (`src/app/services/obsidianExport.ts`) con una sesión de ejemplo
> (el EJEMPLO A del prompt de estudio) y el resultado de una sesión típica.
> Ruta en el vault de la nota: `wiki/fuentes/java-bootcamp---como-java-ejecuta-tu-codigo.md` — índice del curso (MOC): `cursos/java-bootcamp.md`.

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
anki_deck: "Kinema::Courses::Java Bootcamp::Cómo Java ejecuta tu código"
concepts: [bytecode, jvm, jit]
tags: [kinema/sesion, kinema/curso/java-bootcamp, udemy]
---

# Cómo Java ejecuta tu código

Curso: [[cursos/java-bootcamp|Java Bootcamp]]
Objetivo: Preparar entrevistas backend con Java

## Resumen

La lección recorre el camino del código Java: javac lo compila a bytecode, la JVM de cada plataforma lo interpreta y el JIT traduce en caliente los hot spots a nativo. Ese reparto explica por qué el mismo .class corre en Windows y Linux sin recompilar, y por qué el rendimiento se acerca al nativo tras el warm-up.

> Relevancia para tu objetivo: 92/100 — La lección explica el mecanismo central de portabilidad de Java, directamente útil para entrevistas backend.

## Ideas clave

- javac compila el fuente a bytecode, no a código nativo
- la JVM interpreta el bytecode en cada plataforma
- el JIT compila hot spots a nativo en runtime
- portabilidad = un .class corre donde exista JVM

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

**Escenario:** Tienes App.java compilado en tu laptop

**Reto:** Lleva solo el .class a una PC con otra JVM y ejecútalo sin recompilar

> [!example]- Ver solución
> java -cp . App funciona si la JVM soporta la versión del bytecode; documenta la diferencia entre JDK y JRE

## Próximo paso

- [ ] Ejecuta tu app con -XX:+PrintCompilation y observa el JIT en acción

## Resultado de la sesión

**Lección completada**

- Recordaste (según tú): 3 de 4 ideas
- Comprobación: 1 a la primera · 1 tras corregir
- Práctica: correcta
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

> [!info] El mazo con formato dev-card se exporta desde la extensión como `.apkg`.

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
tags: [curso, udemy, java-bootcamp]
---

# Java Bootcamp

**Objetivo:** Preparar entrevistas backend con Java

> [!tip] Las sesiones se listan solas: cada exportación de la extensión
> crea una nota en `wiki/fuentes` con `course: java-bootcamp` en el frontmatter.

## Sesiones

```dataview
TABLE lesson AS "Lección", date AS "Fecha", relevance_score AS "Relevancia"
FROM "wiki/fuentes"
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

1. Generas una sesión en el dock → Obsidian → **Exportar**.
2. Chrome pregunta una vez «¿Abrir Obsidian?» → **Siempre permitir**.
3. Obsidian crea la nota de la sesión en `wiki/fuentes/`. La primera vez de cada curso, el aviso
   ofrece «Crear índice del curso» (el MOC en `cursos/`): Chrome abre un solo protocolo por clic.
4. Con **Dataview**, el MOC lista la sesión con fecha y relevancia; con «Repasar también en
   Obsidian» activado, las tarjetas van bajo `#flashcards` para el plugin **Spaced Repetition**.