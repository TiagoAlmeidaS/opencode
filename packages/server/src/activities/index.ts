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
import { generateMarketDigestActivity } from "./generate-market-digest"
import { sendTelegramReportActivity } from "./send-telegram-report"
import { sendTelegramAlertActivity } from "./send-telegram-alert"
import { dailyReportActivity } from "./daily-report"
import { executeOpportunityActivity } from "./execute-opportunity"

registerActivity(githubIssuesScanActivity)
registerActivity(seedNichesActivity)
registerActivity(marketDataCryptoActivity)
registerActivity(scanGithubBountiesActivity)
registerActivity(scanGitcoinBountiesActivity)
registerActivity(scanFreelanceJobsActivity)
registerActivity(scoreOpportunityActivity)
registerActivity(classifyNicheActivity)
registerActivity(analyzeNicheRelationsActivity)
registerActivity(generateMarketDigestActivity)
registerActivity(sendTelegramReportActivity)
registerActivity(sendTelegramAlertActivity)
registerActivity(dailyReportActivity)
registerActivity(executeOpportunityActivity)
