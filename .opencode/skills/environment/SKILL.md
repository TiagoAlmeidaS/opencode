---
name: environment
description: Container environment guide for OpenCode agents. Documents available tools, how to install any missing runtime (Python, Java, Go, Rust, Ruby, PHP, etc.) via mise, and how to handle services not available in the container.
---

# Container Environment

You are executing inside a Docker container. This skill describes what is available and how to provision anything that is missing.

## Pre-installed Tools

| Tool | Purpose |
|------|---------|
| `git` | Clone, branch, commit |
| `bun` | JS/TS runtime + package manager |
| `node` / `npm` | Node.js runtime |
| `pnpm` | Node package manager (pnpm workspaces) |
| `yarn` | Node package manager (Yarn workspaces) |
| `curl` | HTTP downloads, install scripts |
| `bash` | Shell scripting |
| `mise` | **Universal runtime manager** — installs any language on demand |

**Not available:** `docker`, `docker compose`, `sudo`, `apt`, `brew`.

---

## Installing Any Runtime with mise

`mise` is the universal tool version manager. Use it whenever the project requires a runtime not pre-installed.

### Detect what the project needs

```bash
# mise auto-detects from: .tool-versions, .mise.toml, pyproject.toml, go.mod, pom.xml, Gemfile, etc.
mise install
```

### Install specific runtimes

```bash
# Python
mise install python@3.12
mise use --global python@3.12

# Java (Temurin/Adoptium)
mise install java@21
mise use --global java@21

# Go
mise install go@latest
mise use --global go@latest

# Rust
mise install rust@latest
mise use --global rust@latest

# Ruby
mise install ruby@3.3
mise use --global ruby@3.3

# PHP
mise install php@8.3
mise use --global php@8.3

# .NET
mise install dotnet@8
mise use --global dotnet@8
```

### Run commands with the installed runtime

```bash
# Option A: activate in current shell
eval "$(mise activate bash)"
python --version

# Option B: run a single command (no activation needed)
mise exec -- python -m pytest
mise exec -- mvn test
mise exec -- go test ./...
```

### Install build tools after runtime is active

```bash
# Python: pip / pipenv / poetry / uv
mise exec -- pip install -r requirements.txt
mise exec -- pip install poetry && poetry install

# Java: Maven or Gradle (also installable via mise)
mise install maven@3.9
mise exec -- mvn install -DskipTests
mise install gradle@8
mise exec -- gradle build

# Go: no extra install needed (go mod download)
mise exec -- go mod download

# Rust: cargo (bundled with rust)
mise exec -- cargo build
```

---

## Handling External Services

The container has **no access to docker**. If the project's tests require:

| Service | Alternative |
|---------|-------------|
| PostgreSQL / MySQL | Use SQLite in-memory (`sqlite://:memory:`) or mock the DB layer |
| Redis | Use a mock/in-memory implementation or skip those tests with `--ignore` / `skip()` |
| Elasticsearch | Mock the client or skip the integration tests |
| RabbitMQ / Kafka | Mock the message broker client |
| S3 / Blob storage | Use local filesystem or mock the SDK client |

**Approach:**
1. Check if the project has an existing test setup that already mocks external services.
2. If not, add environment guards: `if process.env.CI !== "1"` or use the test framework's skip mechanism.
3. Document skipped tests in the spec under `"skipped_tests"` with reason `"requires_external_service"`.

---

## Language-Specific Cheatsheet

### Node / TypeScript
```bash
# Detect package manager
ls package-lock.json   # npm
ls yarn.lock           # yarn
ls pnpm-lock.yaml      # pnpm
ls bun.lockb           # bun

# Run tests
npm test / yarn test / pnpm test / bun test
npx vitest / npx jest

# Type check (monorepo)
ls tsconfig.json || echo "no tsconfig at root — check packages/"
npx turbo typecheck        # turbo monorepo
cd packages/<name> && npx tsc --noEmit
```

### Python
```bash
mise install python@latest
mise exec -- pip install -r requirements.txt   # or: poetry install / uv sync
mise exec -- pytest                            # or: python -m pytest
mise exec -- python -m mypy .                  # type check
```

### Java / Kotlin
```bash
mise install java@21
mise install maven@3.9    # if pom.xml
mise exec -- mvn test -q

# or Gradle
mise install gradle@8     # if build.gradle
mise exec -- gradle test
```

### Go
```bash
mise install go@latest
mise exec -- go mod download
mise exec -- go test ./...
mise exec -- go build ./...
```

### Rust
```bash
mise install rust@latest
mise exec -- cargo test
mise exec -- cargo build
```

### Ruby
```bash
mise install ruby@3.3
mise exec -- bundle install
mise exec -- bundle exec rspec     # or: rails test
```

### PHP
```bash
mise install php@8.3
mise exec -- composer install
mise exec -- php vendor/bin/phpunit
```

### .NET / C#
```bash
mise install dotnet@8
mise exec -- dotnet restore
mise exec -- dotnet test
```

---

## Notes

- `mise install` without arguments reads the project's version file automatically — try it first.
- Always run `mise use --global <runtime>@<version>` after installing so subsequent commands find it.
- If `mise exec --` prefixing feels verbose, activate with `eval "$(mise activate bash)"` once.
- mise runtimes are cached in `/data/mise` — subsequent jobs on the same container reuse downloads.
