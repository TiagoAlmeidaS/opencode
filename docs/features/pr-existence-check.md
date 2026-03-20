# PR Existence Check

## Overview

Before the `implement-code` activity clones a repository and starts working on an issue, it now checks whether an open Pull Request already exists for that issue. This prevents duplicate work and wasted compute.

## How It Works

1. The `implement-code` activity receives a `repo_issue_job` with an `issueNumber`
2. Before cloning, it calls `checkExistingPR(token, repo, issueNumber, botLogin)`
3. The function queries `GET /repos/{owner}/{repo}/pulls?state=open` and scans:
   - PR title for `#issueNumber`
   - PR body for `#issueNumber`
   - PR branch name for `issue-{issueNumber}`
4. Based on the result:
   - **No PR found** → proceed normally
   - **PR by the bot itself** → proceed (may be a re-execution)
   - **PR by another contributor** → mark job as `skipped`, return early

## Behavior by Context

| Context | Behavior |
|---------|----------|
| **Bounties** (external repos, `use_fork=1`) | Check upstream repo PRs; skip if another contributor already submitted |
| **Own repos** (`use_fork=0`) | Check own repo PRs; skip if another PR already references the issue |
| **Self-improvement issues** | Same check applies — prevents duplicate implementation |

## API

```typescript
interface PRCheck {
  exists: boolean
  url?: string
  isOwn?: boolean
  author?: string
}

function checkExistingPR(
  token: string,
  repo: string,
  issue: number,
  botLogin?: string,
): Promise<PRCheck>
```

## Files

- `packages/server/src/github-utils.ts` — `checkExistingPR` implementation
- `packages/server/src/activities/implement-code.ts` — Integration point (early return on existing PR)
