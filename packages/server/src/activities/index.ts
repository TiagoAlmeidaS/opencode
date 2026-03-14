import { registerActivity } from "../activity"
import { githubIssuesScanActivity } from "./github-issues-scan"
import { seedNichesActivity } from "./seed-niches"
import { marketDataCryptoActivity } from "./market-data-crypto"
import { scanGithubBountiesActivity } from "./scan-github-bounties"
import { scanGitcoinBountiesActivity } from "./scan-gitcoin-bounties"
import { scanFreelanceJobsActivity } from "./scan-freelance-jobs"
import { scoreOpportunityActivity } from "./score-opportunity"
import { classifyNicheActivity } from "./classify-niche"
import { analyzeNicheRelationsActivity } from "./analyze-niche-relations"

registerActivity(githubIssuesScanActivity)
registerActivity(seedNichesActivity)
registerActivity(marketDataCryptoActivity)
registerActivity(scanGithubBountiesActivity)
registerActivity(scanGitcoinBountiesActivity)
registerActivity(scanFreelanceJobsActivity)
registerActivity(scoreOpportunityActivity)
registerActivity(classifyNicheActivity)
registerActivity(analyzeNicheRelationsActivity)
