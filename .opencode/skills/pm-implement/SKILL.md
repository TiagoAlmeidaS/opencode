---
name: pm-implement
description: Implement a GitHub issue end-to-end with structured acceptance criteria, unit tests, integration tests, and a clean commit. Use after understanding the issue requirements.
---

# pm-implement: Structured Issue Implementation

Implement a GitHub issue following a disciplined flow: discover project, extract acceptance criteria, write tests first, implement code, validate, and commit.

## Triggers

Use this skill when:
- Implementing a GitHub issue (feature, bug, chore)
- The issue has acceptance criteria or a checklist
- You need structured test coverage (unit + integration)
- Preparing a branch for PR

## Context: $ARGUMENTS

---

## Process

### 1. Fetch Issue Context

If issue context is already provided in the prompt, use it directly. Otherwise:

```bash
gh issue view <issue-ref> --json title,body,labels,number,url
```

Identify the issue type from labels or title:
- `type:feature` / `feat` / `[FEAT]` — new feature
- `type:bug` / `fix` / `[BUG]` — bugfix
- `type:chore` / `chore` / `[CHORE]` — infrastructure/refactor

### 2. Project Discovery

Run the `pm-discover` skill or perform inline discovery:

1. Map directory structure, detect monorepo vs single app
2. Read manifest (`package.json`, `Cargo.toml`, etc.) for stack and deps
3. Read `AGENTS.md`, `CONTRIBUTING.md`, or equivalent conventions file
4. Identify test framework, test directory pattern, existing test examples
5. Identify architecture layers (API, services, models, UI)

### 3. Extract Acceptance Criteria

Parse the issue body for acceptance criteria. Look for:

- `## Criterios de Aceite` or `## Acceptance Criteria` section
- Checkbox lists (`- [ ] ...`)
- Given/When/Then blocks
- Numbered requirements

For each criterion, plan three outputs:

| Criterion | Code Task | Unit Test | Integration Test |
|-----------|-----------|-----------|------------------|
| CA-01: ... | Implement X | Test X in isolation | Test X in full flow |
| CA-02: ... | Implement Y | Test Y in isolation | Test Y end-to-end |

If the issue has no explicit criteria, derive them from the description.

### 4. Create Branch

```bash
git checkout -b <type>/<issue-number>-<slug>
```

Examples:
- `feat/43-selecao-plano`
- `fix/12-login-validation`
- `chore/7-setup-ci`

### 5. Write Tests First (TDD)

#### 5.1 Unit Tests

Create test files alongside the source or in the project's test directory. Follow the project's existing patterns.

Structure each test with Given/When/Then:

```
describe('FeatureName', () => {
  describe('Given context', () => {
    describe('When action', () => {
      it('Then expected result', () => {
        // Arrange — set up test data (use faker/factories when available)
        // Act — execute the behavior
        // Assert — verify the outcome
      })
    })
  })
})
```

For each acceptance criterion, write at least one unit test covering:
- Happy path
- Edge cases (empty input, boundary values)
- Error cases (invalid input, missing data)

#### 5.2 Integration Tests

Create in the project's integration test directory (or `__tests__/integration/`):

- Test API endpoints with actual HTTP requests
- Test full flow: input -> processing -> output
- Test database interactions if applicable
- Use test database or appropriate mocks

### 6. Implement Code

Follow the project's conventions detected in step 2:

- **Naming** — match existing casing (camelCase, snake_case, PascalCase)
- **Structure** — place files in the appropriate layer directory
- **Patterns** — follow existing error handling, validation, and DI patterns
- **Dependencies** — install new deps only when necessary, prefer existing ones

For each acceptance criterion, mark completion in the code:

```
// CA-01: Description of criterion — implemented
// CA-02: Description of criterion — implemented
```

### 7. Validate

Run the full validation suite:

```bash
# Adapt to the project's tools
<lint-command>        # e.g. npm run lint, cargo clippy, ruff check
<typecheck-command>   # e.g. tsc --noEmit, mypy, cargo check
<test-command>        # e.g. npm test, pytest, cargo test, dotnet test
```

Fix any failures before proceeding.

### 8. Commit

Create a structured commit message:

```
<type>(<scope>): <concise title>

Implements #<issue-number>

Acceptance criteria:
- CA-01: <description> — done
- CA-02: <description> — done
- CA-03: <description> — done

Tests: <N> unit, <M> integration
```

Where `<type>` is one of: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`.

Do NOT push — the branch is ready for review or PR creation.

---

## Output

After completion, report:

- Branch name
- Files created/modified (grouped by type: source, test, config)
- Acceptance criteria status (done / partial / blocked)
- Test count (unit + integration)
- Any remaining issues or follow-up items

---

## Checklist

Before marking implementation as complete:

- [ ] All acceptance criteria addressed
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing (if applicable)
- [ ] Lint passing
- [ ] Type check passing
- [ ] Commit created with structured message
- [ ] No unrelated changes included
