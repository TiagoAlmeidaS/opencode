import { registerActivity } from "../activity"
import { githubIssuesScanActivity } from "./github-issues-scan"
import { seedNichesActivity } from "./seed-niches"

registerActivity(githubIssuesScanActivity)
registerActivity(seedNichesActivity)
