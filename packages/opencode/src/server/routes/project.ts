import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import { Instance } from "../../project/instance"
import { Project } from "../../project/project"
import { addProjectByUrl } from "../../project/add-by-url"
import z from "zod"
import { ProjectID } from "../../project/schema"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { InstanceBootstrap } from "../../project/bootstrap"

export const ProjectRoutes = lazy(() =>
  new Hono()
    .post(
      "/add-by-url",
      describeRoute({
        summary: "Add project by repository URL",
        description:
          "Clone a GitHub repository and register it as a project. Public repos clone without auth. Optional token (or GITHUB_TOKEN env) for private repos. Idempotent if the project already exists.",
        operationId: "project.addByUrl",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string", format: "uri", description: "GitHub repository URL (e.g. https://github.com/owner/repo)" },
                  branch: { type: "string", description: "Branch to clone (default: default branch)" },
                  token: {
                    type: "string",
                    description: "GitHub PAT for private clone; not persisted. Overrides GITHUB_TOKEN for this request.",
                  },
                },
              } as any,
            },
          },
        },
        responses: {
          200: {
            description: "Project information",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", z.object({ url: z.string().url(), branch: z.string().optional(), token: z.string().optional() })),
      async (c) => {
        const body = c.req.valid("json")
        try {
          const project = await addProjectByUrl({ url: body.url, branch: body.branch, token: body.token })
          return c.json(project, 200)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes("GITHUB_TOKEN") || msg.includes("URL") || msg.includes("GitHub")) return c.json({ error: msg }, 400)
          return c.json({ error: msg }, 500)
        }
      },
    )
    .get(
      "/",
      describeRoute({
        summary: "List all projects",
        description: "Get a list of projects that have been opened with OpenCode.",
        operationId: "project.list",
        responses: {
          200: {
            description: "List of projects",
            content: {
              "application/json": {
                schema: resolver(Project.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const projects = await Project.list()
        return c.json(projects)
      },
    )
    .get(
      "/current",
      describeRoute({
        summary: "Get current project",
        description: "Retrieve the currently active project that OpenCode is working with.",
        operationId: "project.current",
        responses: {
          200: {
            description: "Current project information",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(Instance.project)
      },
    )
    .post(
      "/git/init",
      describeRoute({
        summary: "Initialize git repository",
        description: "Create a git repository for the current project and return the refreshed project info.",
        operationId: "project.initGit",
        responses: {
          200: {
            description: "Project information after git initialization",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        const dir = Instance.directory
        const prev = Instance.project
        const next = await Project.initGit({
          directory: dir,
          project: prev,
        })
        if (next.id === prev.id && next.vcs === prev.vcs && next.worktree === prev.worktree) return c.json(next)
        await Instance.reload({
          directory: dir,
          worktree: dir,
          project: next,
          init: InstanceBootstrap,
        })
        return c.json(next)
      },
    )
    .patch(
      "/:projectID",
      describeRoute({
        summary: "Update project",
        description: "Update project properties such as name, icon, and commands.",
        operationId: "project.update",
        responses: {
          200: {
            description: "Updated project information",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ projectID: ProjectID.zod })),
      validator("json", Project.update.schema.omit({ projectID: true })),
      async (c) => {
        const projectID = c.req.valid("param").projectID
        const body = c.req.valid("json")
        const project = await Project.update({ ...body, projectID })
        return c.json(project)
      },
    ),
)
