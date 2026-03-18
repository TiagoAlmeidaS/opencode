import { registerActivity } from "../activity"
import { githubIssuesScanActivity } from "./github-issues-scan"
import { seedNichesActivity } from "./seed-niches"
import { marketDataCryptoActivity } from "./market-data-crypto"
import { scanGithubBountiesActivity } from "./scan-github-bounties"
import { scanGitcoinBountiesActivity } from "./scan-gitcoin-bounties"
import { scanFreelanceJobsActivity } from "./scan-freelance-jobs"
import { scanContentJobsActivity } from "./scan-content-jobs"
import { scoreOpportunityActivity } from "./score-opportunity"
import { classifyNicheActivity } from "./classify-niche"
import { analyzeNicheRelationsActivity } from "./analyze-niche-relations"
import { generateMarketDigestActivity } from "./generate-market-digest"
import { sendTelegramReportActivity } from "./send-telegram-report"
import { sendTelegramAlertActivity } from "./send-telegram-alert"
import { dailyReportActivity } from "./daily-report"
import { executeOpportunityActivity } from "./execute-opportunity"
import { classifyWorkspaceStrategyActivity } from "./classify-workspace-strategy"
import { createDedicatedRepoActivity } from "./create-dedicated-repo"
import { submitGithubPrActivity } from "./submit-github-pr"
import { generateGitcoinProposalActivity } from "./generate-gitcoin-proposal"
import { sendFreelanceEmailActivity } from "./send-freelance-email"
import { verifySubmissionOutcomeActivity } from "./verify-submission-outcome"
import { scanImmunefiBountiesActivity } from "./scan-immunefi-bounties"
import { scanHackerOneProgramsActivity } from "./scan-hackerone-programs"
import { deliverContentActivity } from "./deliver-content"
import { extractLearningsActivity } from "./extract-learnings"
import { createSkillGapIssueActivity } from "./create-skill-gap-issue"
import { generateSpecActivity } from "./generate-spec"
import { generateTddTestsActivity } from "./generate-tdd-tests"
import { implementCodeActivity } from "./implement-code"
import { generateDocsActivity } from "./generate-docs"
import { openPrActivity } from "./open-pr"
import { notifyPrApprovalActivity } from "./notify-pr-approval"

registerActivity(githubIssuesScanActivity)
registerActivity(seedNichesActivity)
registerActivity(marketDataCryptoActivity)
registerActivity(scanGithubBountiesActivity)
registerActivity(scanGitcoinBountiesActivity)
registerActivity(scanFreelanceJobsActivity)
registerActivity(scanContentJobsActivity)
registerActivity(scoreOpportunityActivity)
registerActivity(classifyNicheActivity)
registerActivity(analyzeNicheRelationsActivity)
registerActivity(generateMarketDigestActivity)
registerActivity(sendTelegramReportActivity)
registerActivity(sendTelegramAlertActivity)
registerActivity(dailyReportActivity)
registerActivity(executeOpportunityActivity)
registerActivity(classifyWorkspaceStrategyActivity)
registerActivity(createDedicatedRepoActivity)
registerActivity(submitGithubPrActivity)
registerActivity(generateGitcoinProposalActivity)
registerActivity(sendFreelanceEmailActivity)
registerActivity(verifySubmissionOutcomeActivity)
registerActivity(scanImmunefiBountiesActivity)
registerActivity(scanHackerOneProgramsActivity)
registerActivity(deliverContentActivity)
registerActivity(extractLearningsActivity)
registerActivity(createSkillGapIssueActivity)
registerActivity(generateSpecActivity)
registerActivity(generateTddTestsActivity)
registerActivity(implementCodeActivity)
registerActivity(generateDocsActivity)
registerActivity(openPrActivity)
registerActivity(notifyPrApprovalActivity)
