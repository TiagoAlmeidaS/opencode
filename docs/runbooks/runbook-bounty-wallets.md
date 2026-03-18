# Runbook: Configuração de Carteiras para Bounties

Configuração de endereços públicos de carteira para recebimento de recompensas em bounties (GitHub, Gitcoin, freelance). O agente injeta esses endereços automaticamente em PRs, propostas e emails.

## Segurança

**Regra de ouro:** O agente só precisa do **endereço público**. Nunca forneça:

- Chaves privadas (private keys)
- Seed phrase / frase de recuperação
- Senhas de carteira

O endereço público serve apenas para **receber** pagamentos. Não permite gastar ou transferir fundos.

## Configuração

### 1. MetaMask (EVM)

O endereço EVM funciona em Ethereum, Polygon, Arbitrum, Base, Binance Smart Chain — USDC, USDT e tokens nativos.

1. Instale [MetaMask](https://metamask.io) ou [Rabby Wallet](https://rabby.io)
2. Crie ou importe uma carteira
3. Copie o endereço (começa com `0x`, 42 caracteres)
4. Adicione no `.env.server`:

```env
EVM_WALLET_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
```

### 2. TON (Tonkeeper) — opcional

Para bounties no ecossistema Telegram (ex.: TokenTon26):

1. Instale [Tonkeeper](https://tonkeeper.com)
2. Copie o endereço (começa com `EQ`)
3. Adicione no `.env.server`:

```env
TON_WALLET_ADDRESS=EQ...
```

### 3. Bitcoin (Bech32)

Para bounties que pagam em BTC:

1. Use uma carteira compatível com endereços Bech32 (ex.: Electrum, BlueWallet)
2. Copie o endereço (começa com `bc1q`)
3. Adicione no `.env.server`:

```env
BTC_WALLET_ADDRESS=bc1q...
```

### 4. Tron

Para bounties em TRX ou USDT na rede Tron:

1. Use TronLink ou outra carteira Tron
2. Copie o endereço (começa com `T`, 34 caracteres)
3. Adicione no `.env.server`:

```env
TRON_WALLET_ADDRESS=T...
```

## Onde o endereço é injetado

| Activity | Local |
|----------|-------|
| `submit-github-pr` | Seção "Payment" no body do PR |
| `generate-gitcoin-proposal` | Seção "Payment Address" na proposta |
| `send-freelance-email` | Linha de pagamento no corpo do email |

Se nenhum endereço estiver definido, a seção é omitida.

## Validação

O servidor valida o formato antes de usar:

- **EVM:** `0x` + 40 caracteres hexadecimais
- **TON:** `EQ` + 46 caracteres base64url
- **BTC:** `bc1q` + 38–58 caracteres (Bech32)
- **TRON:** `T` + 33 caracteres alfanuméricos

Endereços inválidos são ignorados (não quebram o fluxo).

## Off-ramp (converter para Reais)

Quando receber USDC/USDT ou tokens:

1. Envie para uma corretora (Binance, Mercado Bitcoin, Nubank Cripto)
2. Venda por BRL
3. Saque via PIX

## Referências

- [runbook-troubleshoot-schedules-reports.md](runbook-troubleshoot-schedules-reports.md) — fluxo de oportunidades
- [.env.server.example](../../.env.server.example) — variáveis disponíveis
