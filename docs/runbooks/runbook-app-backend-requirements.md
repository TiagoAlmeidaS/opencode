# Requisitos de backend para o App (UI)

## Objetivo

O **App** (`packages/app`) é o frontend que se conecta a um backend HTTP. Este runbook descreve qual backend usar e o que fazer em caso de 404 em `/path` ou erros de init.

## Backend esperado

O App espera que na URL configurada (por padrão `http://localhost:4096`) esteja rodando o **OpenCode Server** (daemon do pacote `opencode`), **não** o servidor standalone do pacote `packages/server`.

- **OpenCode Server (correto):** `opencode serve` ou `opencode serve --daemon` — expõe `/path`, `/global`, `/project`, `/session`, etc. Porta padrão: 4096.
- **Standalone (packages/server):** servidor com dashboard, pipelines e API em `/api` — **não** expõe `/path`. Porta padrão: 3000.

Se o App apontar para o standalone na porta 4096 (ou para qualquer processo que não seja o OpenCode Server), ocorrerá **404 em GET /path** e o bootstrap do App pode falhar.

## Sintomas

- **Request:** `GET http://localhost:4096/path` → **404 Not Found**
- **Console:** `TypeError: Cannot read properties of undefined (reading '0')` durante init de providers (por exemplo ao acessar store de diretório ainda não criado).

## Solução

1. **Garantir que o backend na porta 4096 é o OpenCode Server:**
   - Subir com `opencode serve` (ou `opencode serve --daemon` se usar pipelines).
   - Ou configurar a porta em `opencode.json` / variáveis de ambiente e apontar o App para essa URL.

2. **Variáveis do App (dev):**
   - `VITE_OPENCODE_SERVER_HOST` e `VITE_OPENCODE_SERVER_PORT` definem o host/porta do backend (default: localhost:4096).

3. **Guards no código:** O App foi ajustado para não assumir que `globalSync.child(dir)` existe antes do bootstrap; acessos a `[0]` em stores de diretório usam optional chaining e fallbacks para evitar o `TypeError` quando o store ainda não existe.

## Adicionar repositório por URL

O App e a tool `add_project` (no chat) permitem adicionar projetos por URL de repositório GitHub (clone + registo).

- **Requisito:** O OpenCode Server deve ter a variável de ambiente **`GITHUB_TOKEN`** definida (PAT com permissão de leitura/clone de repositórios).
- **Endpoint:** `POST /project/add-by-url` (body: `{ url: string, branch?: string }`).
- **Local do clone:** Os repositórios são clonados para `{dataDir}/projects/<owner>-<repo>`. O `dataDir` é o diretório de dados do OpenCode (ex.: XDG data). O utilizador pode limpar projetos antigos nessa pasta manualmente se quiser.

## Referências

- [API OpenCode Server](../api/opencode-server.md)
- [App README](../../packages/app/README.md) — E2E e variáveis do App
