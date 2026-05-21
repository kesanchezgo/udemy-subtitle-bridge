## MCP Tools — Global Rules

These MCP servers are always available regardless of project type. Codex selects
the appropriate MCP automatically based on the task description. To guide selection
explicitly, mention the server name in natural language in your prompt
(e.g. "use the figma MCP to...", "search with tavily...", "check snyk for vulnerabilities").
To verify active servers run `/mcp` in the Codex CLI TUI.

---

## Documentation & Research

- **figma** — ALWAYS use before writing any new UI component, screen, or style.
  Extract colors, typography, spacing, components, and frames from Figma design files.
  Requires prior OAuth login: `codex mcp login figma`.
  Applicable to: mobile, web, desktop, frontend projects.

- **context7** — ALWAYS use before writing code that depends on a library or framework API.
  Fetch up-to-date docs for Flutter, Dart, Spring Boot, React, Angular, Node, etc.
  Use when you need the correct API, method signatures, or version-specific behavior.

- **fetch** — Download external pages, raw JSONs, OpenAPI specs, or any URL.
  Use when context7 doesn't cover the topic or you need the exact content of a specific resource.

- **tavily-search** — Web search for technical solutions, CVEs, changelogs, or community answers.
  Use when context7 and fetch are not enough, or the topic is too recent or niche.

---

## Version Control & Repository

- **git** — Local repo operations: history, diffs, blame, branches, stash.
  Use BEFORE refactoring to understand recent changes. Prefer over raw shell `git` calls.
  Repository root is always the current working directory.

- **github** — Remote GitHub operations: issues, PRs, code search, CI status, releases.
  Use for anything that requires interacting with the GitHub remote, not local state.
  Do not use for local git operations — use the git MCP instead.

---

## Filesystem

- **filesystem** — Read, write, list, and search files in the project directory.
  Use when a file is not in the active context, or to inspect assets, configs,
  generated artifacts, or files outside the main source directory.

---

## Browser & Web Testing

- **playwright** — Browser automation and E2E testing for web apps or WebViews.
  Use to verify UI flows, scrape rendered pages, or run automated regression tests.
  Applicable to: web frontend, full-stack, apps with embedded WebViews.

- **chrome-devtools** — Inspect DOM, network requests, console, and performance from Chrome.
  Use for debugging web UIs or JavaScript runtime issues in a running browser tab.

- **chrome-extension-tester** — Install and test Chrome extensions in a real browser context.
  Use only when the project includes a browser extension.

---

## Mobile

- **marionette** — Control a Flutter app on a real device or emulator: tap, scroll, screenshot.
  Primary tool for Flutter visual QA and interaction testing.
  Applicable to: Flutter mobile and desktop projects.

- **mobile** — General Android device/emulator control: install APK, gestures, screen capture.
  Use for non-Flutter Android tasks or when marionette is not suitable.

---

## Backend & APIs

- **spring-initializr** — Generate or scaffold a new Spring Boot project with the correct
  dependencies, Java version, and build tool (Maven/Gradle).
  Use at project creation time or when adding a new Spring module.
  Applicable to: Spring Boot backend projects.

- **postman** — Manage and run Postman collections, environments, and API tests.
  Use when integrating a new endpoint or verifying API contract before writing client code.
  Applicable to: any project with a REST or HTTP API.

---

## Infrastructure & DevOps

- **docker** — Manage containers: start/stop services, inspect logs, exec into containers.
  Use when the project has a `docker-compose.yml` or Dockerfile.
  Applicable to: backend, full-stack, and microservices projects.

- **kubernetes** — Manage k8s resources: pods, deployments, services, and logs.
  Use only when the project deploys to a Kubernetes cluster.

- **redis** — Interact with the local Redis instance at `redis://localhost:6379`.
  Use when debugging cache behavior, session state, or pub/sub flows.
  Applicable to: backend projects that use Redis.

---

## Databases (activate when DB is ready)

These servers are currently disabled in `~/.codex/config.toml`. Uncomment and set
real credentials before using them. Do not attempt to use them until enabled.

- **postgres** — Query and manage a PostgreSQL database.
  Applicable to: Spring Boot, Node, Django backends using PostgreSQL.

- **mysql** — Query and manage a MySQL/MariaDB database.
  INSERT and UPDATE are allowed; DELETE is disabled by default for safety.
  Applicable to: backends using MySQL.

- **mongodb** — Query and manage a MongoDB instance.
  Applicable to: Node, Spring Boot backends using MongoDB.

---

## Quality & Security

- **snyk** — Scan dependencies for known vulnerabilities (CVEs).
  Run when adding a new package or before any production release.
  Reads all package manifests automatically: pubspec.yaml, pom.xml, package.json,
  requirements.txt, build.gradle, etc. Applicable to: all project types.

- **semgrep** — Static analysis for security anti-patterns in source code.
  Run when touching authentication, token handling, network calls, or cryptography.
  Runs via WSL Ubuntu. Applicable to: all project types.

- **sentry** — Query production errors from the `kivara` organization.
  Use when a bug is reported in production and cannot be reproduced locally.
  Applicable to: any project connected to Sentry.

---

## Project Management

- **linear** — Create, update, or close tasks, bugs, and milestones in Linear.
  Use when the user asks to track work, file a bug, or update sprint/backlog status.

- **notion** — Read or update project documentation: PRDs, ADRs, meeting notes, wikis.
  Use when the user references a spec, requirement, or doc that lives in Notion.

- **github** — (see Version Control section) also handles release notes and project boards.

---

## MCP Decision Matrix

| Task | Primary MCP | Fallback |
|------|-------------|----------|
| Check library API / docs | context7 | fetch |
| Search the web | tavily-search | fetch |
| Read / write project files | filesystem | — |
| Local git history / diff | git | — |
| GitHub issues / PRs | github | — |
| Design tokens / UI specs | figma | — |
| Test web UI / E2E | playwright | chrome-devtools |
| Flutter device testing | marionette | mobile |
| Test REST endpoints | postman | fetch |
| Scaffold Spring Boot project | spring-initializr | — |
| Manage containers | docker | — |
| Manage k8s cluster | kubernetes | — |
| Scan dependencies (CVEs) | snyk | semgrep |
| Security code review | semgrep | snyk |
| Production error lookup | sentry | — |
| Track tasks / bugs | linear | github |
| Read project docs / specs | notion | fetch |
| Redis cache debugging | redis | — |
| DB queries (PostgreSQL) | postgres | — |
| DB queries (MySQL) | mysql | — |
| DB queries (MongoDB) | mongodb | — |