# Ejemplo: nota de sesión exportada a Obsidian

> Generada por el builder real (`src/app/services/obsidianExport.ts`) con la sesión de ejemplo.
> Ruta en el vault de la nota: `wiki/fuentes/java-programming-bootcamp-spring-boot-rest-apis---platform-independence-in-java.md` — MOC: `cursos/java-programming-bootcamp-spring-boot-rest-apis.md`.

---

## 1. Nota de sesión (tal como llega al vault)

En Obsidian la nota se crea con este contenido exacto:

markdown
---
title: "Platform Independence in Java — Java Programming Bootcamp: Spring Boot & REST APIs"
date: 2026-09-22
type: sesion
platform: udemy
course: java-programming-bootcamp-spring-boot-rest-apis
lesson: "Platform Independence in Java"
objective: "Conseguir trabajo como backend developer"
relevance_score: 92
source_url: "https://www.udemy.com/course/java-bootcamp/learn/lecture/12345"
tags: [udemy, sesion, java-programming-bootcamp-spring-boot-rest-apis]
---

# Platform Independence in Java

Curso: [[cursos/java-programming-bootcamp-spring-boot-rest-apis|Java Programming Bootcamp: Spring Boot & REST APIs]]
Objetivo: Conseguir trabajo como backend developer

## Resumen

La lección explica el mecanismo central de portabilidad de Java, directamente útil para entrevistas backend. (relevancia 92/100 para el objetivo).

## Ideas clave

- javac compila el fuente a bytecode, no a código nativo
- la JVM interpreta el bytecode en cada plataforma
- el JIT compila hot spots a nativo en runtime
- portabilidad = un .class corre donde exista JVM

## Quick win

- Compilar HolaMundo.java y ejecutarlo en otra máquina distinta

## Aplicación práctica

**Escenario:** Tienes App.java compilado en tu laptop

**Reto:** Lleva solo el .class a una PC con otra JVM y ejecútalo sin recompilar

**Solución:** java -cp . App funciona si la JVM soporta la versión del bytecode

## Preguntas de calibración

1. **¿Qué archivo genera exactamente javac a partir del código fuente?** _(comprender · confused)_
   - Pista: No es un .exe; es un formato intermedio
   - Respuesta: Un archivo .class con bytecode
2. **¿Por qué el mismo .class puede correr en Windows y Linux sin recompilar?** _(aplicar · partial)_
   - Pista: Algo específico de la plataforma hace el trabajo
   - Respuesta: La JVM de cada plataforma interpreta el mismo bytecode
3. **Si Java interpreta bytecode, ¿por qué no es lento?** _(analizar · clear)_
   - Pista: Parte del código se transforma durante la ejecución
   - Respuesta: El JIT compila hot spots a nativo y cachea el resultado
4. **Evalúa: «Java es más lento que C++ para todo».** _(evaluar · mastered)_
   - Pista: Depende del workload
   - Respuesta: El JIT acerca el rendimiento a nativo en picos cálidos; es una simplificación

## Práctica oral

**Pregunta:** Explica en 60 segundos cómo Java logra independencia de plataforma sin perder velocidad.

**Estructura ideal:** Dos capas: compilación a bytecode (portabilidad) + JVM con JIT (velocidad).

## Próximo paso

- [ ] Ejecuta tu app con -XX:+PrintCompilation y observa el JIT en acción

## Tarjetas Anki

#flashcards
- ¿Qué produce `javac` a partir del código fuente? :: **Bytecode** en archivos `.class`, no código máquina nativo.
- ¿Qué imprime `System.out.println(1 + 2 + 3)` y por qué? :: Imprime **6**: los tres operandos son `int`, así que `+` suma aritméticamente. `System.out.println(1 + 2 + 3); // imprime 6`

> [!info] El mazo con formato dev-card se exporta desde la extensión como `.apkg`.



---

## 2. MOC del curso (se crea solo la primera vez)

markdown
---
title: "Java Programming Bootcamp: Spring Boot & REST APIs"
date: 2026-09-22
type: curso
platform: udemy
status: en-progreso
tags: [curso, udemy, java-programming-bootcamp-spring-boot-rest-apis]
---

# Java Programming Bootcamp: Spring Boot & REST APIs

**Objetivo:** Conseguir trabajo como backend developer

> [!tip] Las sesiones se listan solas: cada exportación de la extensión
> crea una nota en `wiki/fuentes` con `course: java-programming-bootcamp-spring-boot-rest-apis` en el frontmatter.

## Sesiones

```dataview
TABLE lesson AS "Lección", date AS "Fecha", relevance_score AS "Relevancia"
FROM "wiki/fuentes"
WHERE course = "java-programming-bootcamp-spring-boot-rest-apis"
SORT date DESC
```

## Progreso

- [ ] Terminar todas las lecciones planificadas
- [ ] Destilar conceptos clave → [[wiki/conceptos/]]

## Conceptos del curso

- (destilado supervisado: enlazar aquí [[wiki/conceptos/...]])



Con el plugin Dataview instalado, la sección **Sesiones** del MOC se renderiza como tabla
y muestra esta sesión automáticamente (y todas las siguientes del mismo curso).

## 3. Resultado esperado al probarlo tú

1. Generas una sesión en el dock → Obsidian → **Exportar**.
2. Chrome pregunta una vez «¿Abrir Obsidian?» → **Siempre permitir**.
3. Obsidian abre las dos notas: la sesión en `wiki/fuentes/` y el MOC en `cursos/`.
4. Con **Dataview**, el MOC lista la sesión con fecha y relevancia; con **Spaced Repetition**,
   las líneas `pregunta :: respuesta` bajo `#flashcards` son repaso espaciado dentro de Obsidian.