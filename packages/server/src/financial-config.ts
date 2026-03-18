/**
 * Configuração financeira para bounties — endereços públicos de recebimento.
 * Só armazena endereços públicos. Nunca chaves privadas ou seed phrase.
 */

const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/
const TON_REGEX = /^EQ[a-zA-Z0-9_-]{46}$/
const BTC_REGEX = /^bc1q[a-z0-9]{38,58}$/
const TRON_REGEX = /^T[A-Za-z0-9]{33}$/

function validEvm(addr: string): boolean {
  return EVM_REGEX.test(addr.trim())
}

function validTon(addr: string): boolean {
  return TON_REGEX.test(addr.trim())
}

function validBtc(addr: string): boolean {
  return BTC_REGEX.test(addr.trim())
}

function validTron(addr: string): boolean {
  return TRON_REGEX.test(addr.trim())
}

export function getEvmWalletAddress(): string | null {
  const addr = process.env.EVM_WALLET_ADDRESS?.trim()
  return addr && validEvm(addr) ? addr : null
}

export function getTonWalletAddress(): string | null {
  const addr = process.env.TON_WALLET_ADDRESS?.trim()
  return addr && validTon(addr) ? addr : null
}

export function getBtcWalletAddress(): string | null {
  const addr = process.env.BTC_WALLET_ADDRESS?.trim()
  return addr && validBtc(addr) ? addr : null
}

export function getTronWalletAddress(): string | null {
  const addr = process.env.TRON_WALLET_ADDRESS?.trim()
  return addr && validTron(addr) ? addr : null
}

/**
 * Retorna snippet para injetar em PRs, propostas e emails de bounty.
 * Ex.: "Bounty completed. Wallet for reward (EVM): 0x..."
 */
export function getBountyWalletSnippet(): string {
  const evm = getEvmWalletAddress()
  const ton = getTonWalletAddress()
  const btc = getBtcWalletAddress()
  const tron = getTronWalletAddress()
  const parts: string[] = []
  if (evm) parts.push(`Wallet for reward (EVM): ${evm}`)
  if (ton) parts.push(`Wallet for reward (TON): ${ton}`)
  if (btc) parts.push(`Wallet for reward (BTC): ${btc}`)
  if (tron) parts.push(`Wallet for reward (TRON): ${tron}`)
  return parts.length ? `Bounty completed. ${parts.join(" | ")}` : ""
}
