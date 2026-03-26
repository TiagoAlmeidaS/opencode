/**
 * RabbitMQ client — connection management, topology setup, publish/consume helpers.
 *
 * Topology (exchange: opencode, type: direct):
 *   dev-cycle.implement-code      ← job created
 *   dev-cycle.generate-docs       ← implement-code completed
 *   dev-cycle.open-pr             ← generate-docs completed
 *   dev-cycle.validate-ci         ← open-pr completed
 *   dev-cycle.notify-pr-approval  ← validate-ci completed
 *   dev-cycle.error               ← any step failed
 */
import amqp from "amqplib"

export const DEV_CYCLE_QUEUES = {
  implementCode: "dev-cycle.implement-code",
  generateDocs: "dev-cycle.generate-docs",
  openPr: "dev-cycle.open-pr",
  validateCi: "dev-cycle.validate-ci",
  notifyPrApproval: "dev-cycle.notify-pr-approval",
  error: "dev-cycle.error",
} as const

const EXCHANGE = "opencode"
const RECONNECT_DELAY_MS = 5_000

export type ConsumeHandler = (
  payload: unknown,
  ack: () => void,
  nack: (requeue?: boolean) => void,
) => Promise<void>

export interface RabbitMQClient {
  publish(queue: string, payload: unknown): void
  consume(queue: string, handler: ConsumeHandler): Promise<void>
  close(): Promise<void>
}

export async function createRabbitMQClient(url: string): Promise<RabbitMQClient> {
  // amqp.connect returns ChannelModel (wraps Connection + createChannel)
  let model: amqp.ChannelModel | null = null
  let ch: amqp.Channel | null = null
  let closing = false

  async function connect(): Promise<void> {
    model = await amqp.connect(url, { heartbeat: 120 })
    ch = await model.createChannel()

    // Topology: durable exchange + queues
    await ch.assertExchange(EXCHANGE, "direct", { durable: true })
    for (const q of Object.values(DEV_CYCLE_QUEUES)) {
      await ch.assertQueue(q, { durable: true })
      await ch.bindQueue(q, EXCHANGE, q)
    }

    model.on("error", (err: Error) => console.error("[rabbitmq] connection error:", err.message))
    model.on("close", () => {
      if (!closing) {
        console.warn("[rabbitmq] connection closed — reconnecting in", RECONNECT_DELAY_MS, "ms")
        setTimeout(
          () => connect().catch((e) => console.error("[rabbitmq] reconnect failed:", e)),
          RECONNECT_DELAY_MS,
        )
      }
    })

    console.log("[rabbitmq] connected to", url.replace(/:\/\/[^@]*@/, "://***@"))
  }

  await connect()

  return {
    publish(queue: string, payload: unknown) {
      if (!ch) {
        console.error("[rabbitmq] publish skipped (no channel):", queue)
        return
      }
      ch.publish(EXCHANGE, queue, Buffer.from(JSON.stringify(payload)), { persistent: true })
    },

    async consume(queue: string, handler: ConsumeHandler) {
      if (!ch) throw new Error("[rabbitmq] consume called before channel is ready")
      await ch.prefetch(1) // one active message per consumer at a time
      await ch.consume(queue, async (msg) => {
        if (!msg) return
        let payload: unknown
        try {
          payload = JSON.parse(msg.content.toString())
        } catch {
          ch!.ack(msg) // malformed message — discard
          return
        }
        const ack = () => ch!.ack(msg)
        const nack = (requeue = false) => ch!.nack(msg, false, requeue)
        try {
          await handler(payload, ack, nack)
        } catch (err) {
          console.error(`[rabbitmq] unhandled consumer error in ${queue}:`, err)
          nack(false)
        }
      })
      console.log("[rabbitmq] consumer registered:", queue)
    },

    async close() {
      closing = true
      try {
        await ch?.close()
        await model?.close()
      } catch {
        // ignore errors on close
      }
    },
  }
}
