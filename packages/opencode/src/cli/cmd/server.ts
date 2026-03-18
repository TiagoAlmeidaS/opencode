import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { ServerMemory } from "@/server-memory/client"

const MemoryRetrieveCommand = cmd({
  command: "retrieve <query>",
  describe: "query OpenCode Server RAG (GET /server/memory/retrieve)",
  builder: (yargs: Argv) =>
    yargs
      .positional("query", { type: "string", describe: "search text" })
      .option("limit", { type: "number", default: 5 }),
  handler: async (args) => {
    const root = await ServerMemory.base()
    if (!root) {
      process.stderr.write(
        "Configure server.memory.url, OPENCODE_SERVER_MEMORY_URL, or OPENCODE_SERVER_URL\n",
      )
      process.exitCode = 1
      return
    }
    const q = String(args.query ?? "")
    const chunks = await ServerMemory.retrieveRag(root, q, (args.limit as number) ?? 5)
    process.stdout.write(JSON.stringify({ chunks }, null, 2) + "\n")
  },
})

const LearningsListCommand = cmd({
  command: "list",
  describe: "list agent learnings (GET /server/learnings)",
  builder: (yargs: Argv) =>
    yargs.option("category", { type: "string" }).option("limit", { type: "number", default: 50 }),
  handler: async (args) => {
    const root = await ServerMemory.base()
    if (!root) {
      process.stderr.write(
        "Configure server.memory.url, OPENCODE_SERVER_MEMORY_URL, or OPENCODE_SERVER_URL\n",
      )
      process.exitCode = 1
      return
    }
    const rows = await ServerMemory.fetchLearnings(root, {
      category: args.category as string | undefined,
      limit: (args.limit as number) ?? 50,
    })
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n")
  },
})

const LearningsCreateCommand = cmd({
  command: "create",
  describe: "create or upsert a learning by key (POST /server/learnings)",
  builder: (yargs: Argv) =>
    yargs
      .option("key", { type: "string", demandOption: true })
      .option("category", { type: "string", demandOption: true })
      .option("title", { type: "string", demandOption: true })
      .option("body", { type: "string", demandOption: true })
      .option("confidence", { type: "number" })
      .option("source", { type: "string" })
      .option("tags", { type: "string", describe: "comma-separated" }),
  handler: async (args) => {
    const root = await ServerMemory.base()
    if (!root) {
      process.stderr.write(
        "Configure server.memory.url, OPENCODE_SERVER_MEMORY_URL, or OPENCODE_SERVER_URL\n",
      )
      process.exitCode = 1
      return
    }
    const tagsRaw = args.tags as string | undefined
    const tags = tagsRaw
      ? tagsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined
    const row = await ServerMemory.putLearning(root, {
      key: args.key as string,
      category: args.category as string,
      title: args.title as string,
      body: args.body as string,
      confidence: args.confidence as number | undefined,
      source: (args.source as string) ?? "cli",
      tags,
    })
    if (!row) {
      process.exitCode = 1
      process.stderr.write("request failed\n")
      return
    }
    process.stdout.write(JSON.stringify(row, null, 2) + "\n")
  },
})

const ServerMemoryNestedCommand = cmd({
  command: "memory",
  describe: "RAG memory",
  builder: (yargs: Argv) => yargs.command(MemoryRetrieveCommand).demandCommand(),
  handler: () => {},
})

const ServerLearningsNestedCommand = cmd({
  command: "learnings",
  describe: "agent learnings",
  builder: (yargs: Argv) =>
    yargs.command(LearningsListCommand).command(LearningsCreateCommand).demandCommand(),
  handler: () => {},
})

export const ServerCommand = cmd({
  command: "server",
  describe: "OpenCode Server (memory RAG, learnings)",
  builder: (yargs: Argv) =>
    yargs.command(ServerMemoryNestedCommand).command(ServerLearningsNestedCommand).demandCommand(),
  handler: () => {},
})
