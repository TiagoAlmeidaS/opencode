import z from "zod"
import { Tool } from "./tool"
import { addProjectByUrl } from "../project/add-by-url"

const description =
  "Add a project to OpenCode by cloning a GitHub repository. Use when the user wants to add a repo they choose (e.g. by URL). Requires GITHUB_TOKEN. Idempotent if the project is already cloned."

export const AddProjectTool = Tool.define("add_project", {
  description,
  parameters: z.object({
    url: z.string().describe("GitHub repository URL (e.g. https://github.com/owner/repo)"),
    branch: z.string().optional().describe("Branch to clone (default: default branch)"),
  }),
  async execute(params) {
    const project = await addProjectByUrl({ url: params.url, branch: params.branch })
    return {
      title: "Project added",
      metadata: {},
      output: `Projeto adicionado: worktree=${project.worktree}, id=${project.id}`,
    }
  },
})
