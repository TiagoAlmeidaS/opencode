import { Octokit } from "@octokit/rest"

export interface PRCheck {
  exists: boolean
  url?: string
  isOwn?: boolean
  author?: string
}

/**
 * Check if an open PR already exists that references the given issue number.
 * Scans title and body for `#issueNumber` or `issue-{n}` in branch names.
 */
export async function checkExistingPR(
  token: string,
  repo: string,
  issue: number,
  botLogin?: string,
): Promise<PRCheck> {
  const [owner, name] = repo.split("/")
  if (!owner || !name) return { exists: false }

  const octokit = new Octokit({ auth: token })
  const { data: pulls } = await octokit.pulls.list({
    owner,
    repo: name,
    state: "open",
    per_page: 50,
    sort: "created",
    direction: "desc",
  })

  const tag = `#${issue}`
  const branchTag = `issue-${issue}`
  for (const pr of pulls) {
    const title = pr.title ?? ""
    const body = pr.body ?? ""
    const branch = pr.head?.ref ?? ""
    const refs = title.includes(tag) || body.includes(tag) || branch.includes(branchTag)
    if (!refs) continue

    const author = pr.user?.login ?? ""
    const isOwn = !!botLogin && author === botLogin
    return { exists: true, url: pr.html_url, isOwn, author }
  }
  return { exists: false }
}

/**
 * Create an issue on GitHub and return its number + URL.
 */
export async function createGitHubIssue(
  token: string,
  repo: string,
  opts: { title: string; body: string; labels?: string[] },
): Promise<{ number: number; url: string }> {
  const [owner, name] = repo.split("/")
  if (!owner || !name) throw new Error(`Invalid repo: ${repo}`)

  const octokit = new Octokit({ auth: token })
  const { data } = await octokit.issues.create({
    owner,
    repo: name,
    title: opts.title,
    body: opts.body,
    labels: opts.labels,
  })
  return { number: data.number, url: data.html_url }
}

export interface CIStatus {
  conclusion: "passing" | "failing" | "pending" | "skipped"
  failingChecks: string[]
}

/**
 * Check GitHub CI status for a given ref (branch/SHA).
 * Queries both the Checks API (GitHub Actions) and the legacy Commit Status API.
 * Returns "skipped" if no CI is configured on the repo.
 */
export async function checkCIStatus(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<CIStatus> {
  let hasCI = false
  let anyPending = false
  const failingChecks: string[] = []

  // GitHub Actions / Checks API
  try {
    const { data } = await octokit.checks.listForRef({ owner, repo, ref, per_page: 50 })
    if (data.total_count > 0) {
      hasCI = true
      for (const run of data.check_runs) {
        if (run.status !== "completed") {
          anyPending = true
        } else if (["failure", "timed_out", "cancelled"].includes(run.conclusion ?? "")) {
          failingChecks.push(run.name)
        }
      }
    }
  } catch { /* checks API unavailable or no checks */ }

  // Legacy Commit Status API
  try {
    const { data: combined } = await octokit.repos.getCombinedStatusForRef({ owner, repo, ref })
    if (combined.statuses.length > 0) {
      hasCI = true
      if (combined.state === "pending") anyPending = true
      if (combined.state === "failure" || combined.state === "error") {
        for (const s of combined.statuses) {
          if (s.state === "failure" || s.state === "error") failingChecks.push(s.context)
        }
      }
    }
  } catch { /* legacy status API unavailable */ }

  if (!hasCI) return { conclusion: "skipped", failingChecks: [] }
  if (anyPending) return { conclusion: "pending", failingChecks: [] }
  if (failingChecks.length > 0) return { conclusion: "failing", failingChecks }
  return { conclusion: "passing", failingChecks: [] }
}

/**
 * Check if an issue with the given title already exists (open state).
 */
export async function issueExists(
  token: string,
  repo: string,
  title: string,
): Promise<boolean> {
  const [owner, name] = repo.split("/")
  if (!owner || !name) return false

  const octokit = new Octokit({ auth: token })
  const { data } = await octokit.search.issuesAndPullRequests({
    q: `repo:${owner}/${name} is:issue is:open "${title.slice(0, 80)}"`,
    per_page: 5,
  })
  return data.total_count > 0
}
