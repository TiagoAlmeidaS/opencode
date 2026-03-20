---
name: pm-discover
description: Perform structured codebase discovery and indexing before implementing. Maps project structure, tech stack, conventions, architecture, test patterns, and dependencies. Use before any implementation task on an unfamiliar repo.
---

# pm-discover: Project Discovery & Indexing

Explore and index a codebase to build a structured understanding before making changes. Produces a mental model of the project that feeds directly into implementation.

## Triggers

Use this skill when:
- Working on a repo for the first time
- Before implementing a GitHub issue
- After cloning a project in an automated pipeline
- When the codebase structure is unclear

## Context: $ARGUMENTS

---

## Process

### 1. Project Structure

Map the top-level directory layout to understand organization.

```bash
# List root dirs and key files
ls -la
find . -maxdepth 2 -type f -name "*.json" -o -name "*.toml" -o -name "*.yaml" -o -name "*.yml" -o -name "Makefile" -o -name "Dockerfile" | head -40
```

Identify:
- **Monorepo vs single app** — look for `packages/`, `apps/`, `services/`, workspace config
- **Entry points** — `src/index.*`, `main.*`, `app/`, `cmd/`
- **Config files** — `tsconfig.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `*.csproj`

### 2. Technology Stack

Read the primary manifest file to detect:

| Signal | Language/Stack |
|--------|---------------|
| `package.json` | Node/TypeScript/JavaScript |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `pyproject.toml` / `setup.py` | Python |
| `*.csproj` / `*.sln` | .NET / C# |
| `pom.xml` / `build.gradle` | Java/Kotlin |
| `Gemfile` | Ruby |
| `pubspec.yaml` | Dart/Flutter |
| `composer.json` | PHP |

Extract from the manifest:
- **Package manager** — npm, bun, pnpm, yarn, pip, cargo, dotnet, go
- **Framework** — Next.js, Express, FastAPI, Actix, Gin, ASP.NET, Rails, Laravel
- **Key dependencies** — ORM, UI library, test framework, validation lib
- **Scripts** — build, test, lint, dev, start

### 3. Conventions & Rules

Check for project-level conventions (read if they exist):

- `AGENTS.md` — agent-specific rules
- `CLAUDE.md` — Claude-specific instructions
- `CONTRIBUTING.md` — contribution guidelines
- `.cursor/rules/*.md` — Cursor rules
- `.opencode/skills/` — existing skills
- `.editorconfig` — formatting rules
- `eslint*`, `prettier*`, `biome*` — linting config
- `rustfmt.toml`, `.rubocop.yml`, `ruff.toml` — language-specific formatters

### 4. Architecture

Identify the architectural layers by scanning directories:

- **API layer** — `routes/`, `api/`, `controllers/`, `handlers/`, `endpoints/`
- **Business logic** — `services/`, `usecases/`, `domain/`, `core/`, `lib/`
- **Data layer** — `models/`, `schema/`, `entities/`, `repositories/`, `db/`
- **UI layer** — `components/`, `pages/`, `views/`, `screens/`, `templates/`
- **Infrastructure** — `config/`, `middleware/`, `plugins/`, `providers/`
- **Shared** — `utils/`, `helpers/`, `common/`, `shared/`

Read 1-2 representative files from each layer to understand patterns (naming, exports, error handling, dependency injection).

### 5. Test Patterns

Detect the test setup:

- **Test directories** — `test/`, `tests/`, `__tests__/`, `spec/`, `*_test.*`, `*.test.*`, `*.spec.*`
- **Test framework** — Jest, Vitest, Mocha, pytest, go test, cargo test, xUnit, RSpec, PHPUnit
- **Test config** — `jest.config.*`, `vitest.config.*`, `pytest.ini`, `.rspec`
- **Fixtures / mocks** — `fixtures/`, `mocks/`, `factories/`, `__mocks__/`
- **Coverage** — `coverage/`, `.nycrc`, `codecov.yml`

Read 1-2 existing test files to understand:
- Import patterns
- Describe/it structure or equivalent
- Mock/stub patterns
- Assertion style
- Data setup (fixtures, factories, faker)

### 6. Dependencies Analysis

From the manifest, identify critical dependencies:

- **ORM / Database** — Drizzle, Prisma, SQLAlchemy, GORM, Entity Framework, ActiveRecord
- **HTTP / API** — Express, Hono, FastAPI, Gin, Actix-web, ASP.NET
- **UI** — React, Vue, Svelte, Angular, Flutter, SwiftUI
- **Auth** — NextAuth, Passport, JWT libs, OAuth
- **Validation** — Zod, Yup, Pydantic, FluentValidation
- **State** — Zustand, Redux, MobX, Riverpod, Provider

### 7. Output

After completing steps 1-6, produce a structured summary:

```
PROJECT DISCOVERY
=================
Type: [monorepo | single-app | library | CLI]
Language: [primary language]
Framework: [primary framework]
Package Manager: [npm | bun | pnpm | pip | cargo | ...]
Test Framework: [Jest | Vitest | pytest | ...]
Test Command: [npm test | bun test | pytest | ...]

Architecture:
- API: [path and pattern]
- Business: [path and pattern]
- Data: [path and pattern]
- UI: [path and pattern]

Conventions:
- [key convention 1]
- [key convention 2]

Key Dependencies:
- [dep 1]: [purpose]
- [dep 2]: [purpose]

Test Patterns:
- Location: [test dir pattern]
- Style: [describe/it | Given/When/Then | ...]
- Mocking: [pattern]
```

This summary should be used as context for implementation tasks.

---

## Notes

- Spend no more than 2-3 minutes on discovery. The goal is a quick structured scan, not exhaustive analysis.
- Prioritize reading convention files (AGENTS.md, CONTRIBUTING.md) — they contain the most actionable constraints.
- If the project has a README with architecture docs, read the relevant section.
- For monorepos, focus discovery on the specific package/app relevant to the task.
