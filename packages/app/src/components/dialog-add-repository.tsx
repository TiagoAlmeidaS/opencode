import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { createSignal } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServer } from "@/context/server"

export function DialogAddRepository(props: {
  onAdded?: (worktree: string) => void
}) {
  const dialog = useDialog()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const language = useLanguage()
  const [url, setUrl] = createSignal("")
  const [branch, setBranch] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal("")

  function valid(): boolean {
    const u = url().trim()
    if (!u) {
      setError(language.t("dialog.addRepository.error.urlRequired"))
      return false
    }
    try {
      const parsed = new URL(u.startsWith("http") ? u : `https://${u}`)
      if (!parsed.hostname.toLowerCase().includes("github.com")) {
        setError(language.t("dialog.addRepository.error.githubOnly"))
        return false
      }
    } catch {
      setError(language.t("dialog.addRepository.error.urlInvalid"))
      return false
    }
    setError("")
    return true
  }

  const layout = useLayout()
  const server = useServer()

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!valid()) return
    setLoading(true)
    setError("")
    try {
      const res = await globalSDK.client.project.addByUrl({
        url: url().trim(),
        branch: branch().trim() || undefined,
      })
      const data = res.data
      if (!data) {
        const err = (res as { error?: string }).error ?? language.t("common.requestFailed")
        setError(err)
        return
      }
      const list = await globalSDK.client.project.list().then((r) => r.data ?? [])
      globalSync.set("project", list)
      layout.projects.open(data.worktree)
      server.projects.touch(data.worktree)
      props.onAdded?.(data.worktree)
      dialog.close()
      showToast({
        variant: "success",
        title: language.t("dialog.addRepository.toast.title"),
        description: data.worktree,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      showToast({
        variant: "error",
        title: language.t("dialog.addRepository.toast.errorTitle"),
        description: msg.slice(0, 200),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog title={language.t("dialog.addRepository.title")} class="w-full max-w-[480px] mx-auto">
      <form onSubmit={handleSubmit} class="flex flex-col gap-6 p-6 pt-0">
        <div class="flex flex-col gap-4">
          <TextField
            autofocus
            type="url"
            label={language.t("dialog.addRepository.urlLabel")}
            placeholder="https://github.com/owner/repo"
            value={url()}
            onChange={(v) => setUrl(v)}
            validationState={error() ? "invalid" : undefined}
            error={error()}
          />
          <TextField
            type="text"
            label={language.t("dialog.addRepository.branchLabel")}
            placeholder={language.t("dialog.addRepository.branchPlaceholder")}
            value={branch()}
            onChange={(v) => setBranch(v)}
          />
        </div>
        <div class="flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={loading()}>
            {loading() ? language.t("common.loading") : language.t("dialog.addRepository.submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
