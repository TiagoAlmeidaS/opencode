# Requisitos de backend para o App (UI)

## Objetivo

O **App** (`packages/app`) é o frontend que se conecta a um backend HTTP. Este runbook descreve qual backend usar e o que fazer em caso de 404 em `/path` ou erros de init.

## Backend esperado

O App espera que na URL configurada (por padrão `http://localhost:4096`) esteja rodando o **OpenCode Server** (daemon do pacote `opencode`), **não** o servidor standalone do pacote `packages/server`.

- **OpenCode Server (correto):** `opencode serve` ou `opencode serve --daemon` — expõe `/path`, `/global`, `/project`, `/session`, etc. Porta padrão: 4096.
- **Standalone (packages/server):** servidor com dashboard, pipelines e API em `/api` — **não** expõe `/path`. Porta padrão: 3000.

Se o App apontar para o standalone na porta 4096 (ou para qualquer processo que não seja o OpenCode Server), ocorrerá **404 em GET /path** e o bootstrap do App pode falhar.

### App Flutter: OpenCode + daemon noutro host/porta (`/api`)

Se o **OpenCode** (`opencode serve`) estiver num URL (ex.: `http://host:4096`) e o **standalone** `packages/server` noutro (ex.: `http://host:3000/api`), na tela de conexão do Flutter:

1. **OpenCode Server URL** — URL do `opencode serve` (sessões, projetos, `/global/health`, `/path`, …).
2. **Daemon API base (optional)** — URL completa até ao prefixo da API daemon, ex.: `http://host:3000/api` (os pedidos passam a ser `GET …/api/status`, etc.).
3. **API token (optional)** — se o standalone tiver `API_TOKEN`, usar o mesmo valor aqui (envio como `Authorization: Bearer …` só nos pedidos daemon).

Se o daemon estiver no **mesmo** processo `opencode serve --daemon`, deixe *Daemon API base* vazio (usa `{url}/server/*`).

## Sintomas

- **Request:** `GET http://localhost:4096/path` → **404 Not Found**
- **Console:** `TypeError: Cannot read properties of undefined (reading '0')` durante init de providers (por exemplo ao acessar store de diretório ainda não criado).
- **Console (UI):** `(…command || []).map is not a function` — o cliente assumia que `GET /command` devolvia um array; com `/path` em 404 o estado podia ficar inconsistente ou a API podia devolver um corpo inesperado. O App normaliza a lista de comandos com `Array.isArray`.

### 404 em `/path` com o OpenCode Server “certo”

Em versões afetadas, `Server.createApp` terminava com um `return` antes de registar rotas como `GET /path`, `GET /command` e o fallback `/*`. O resultado era **404 em `/path`** mesmo com `opencode serve` na porta esperada. **Correção:** construir a app com atribuição (`app = app…`) e um único `return` final em `packages/opencode/src/server/server.ts`. Depois de atualizar o servidor, volta a testar `GET /path`.

## Solução

1. **Garantir que o backend na porta 4096 é o OpenCode Server:**
   - Subir com `opencode serve` (ou `opencode serve --daemon` se usar pipelines).
   - Ou configurar a porta em `opencode.json` / variáveis de ambiente e apontar o App para essa URL.

2. **Variáveis do App (dev):**
   - `VITE_OPENCODE_SERVER_HOST` e `VITE_OPENCODE_SERVER_PORT` definem o host/porta do backend (default: localhost:4096).

3. **Guards no código:** O App foi ajustado para não assumir que `globalSync.child(dir)` existe antes do bootstrap; acessos a `[0]` em stores de diretório usam optional chaining e fallbacks para evitar o `TypeError` quando o store ainda não existe.

## Adicionar repositório por URL

O App web, o **App Flutter** e a tool `add_project` permitem adicionar projetos por URL GitHub (clone + registo).

- **Endpoint:** `POST /project/add-by-url` (body: `{ url, branch?, token? }`).
- **Repositório público:** Só precisas do `url` (clone anónimo no servidor).
- **Repositório privado:** Uma destas opções:
  1. **`GITHUB_TOKEN` no processo do OpenCode Server** — PAT com scope `repo` (ler/clone). Ver abaixo sobre `.env.server`.
  2. **PAT no App Flutter** — campo opcional no diálogo *Add repository*; o token vai **só nesse pedido** para o servidor fazer o clone (não fica guardado na app).

### O teu `GITHUB_TOKEN` está no `.env.server` — serve?

O ficheiro **`.env.server` na raiz do repo** é usado pelo **Docker Compose / stack de deploy** (ex.: `env_file`), **não** é lido automaticamente pelo `opencode serve` quando corres o CLI à mão no terminal.

Para o clone por URL usar o PAT:

- **Docker / compose:** confirma que o serviço que corre o OpenCode tem `GITHUB_TOKEN` (ou `env_file: .env.server`).
- **Terminal local (`opencode serve`):** o processo tem de ver a variável — por exemplo, na mesma shell: `export GITHUB_TOKEN=ghp_...` (Linux/macOS) ou `set GITHUB_TOKEN=ghp_...` antes de iniciar (Windows), **ou** carregar o `.env.server` com uma ferramenta que exporte para o ambiente.

Se `GITHUB_TOKEN` estiver **efetivamente** no ambiente do processo `opencode serve`, **não precisas** de colocar PAT no App Flutter para adicionar repos privados (só URL + branch). O campo PAT na app continua útil para **listar “os meus repositórios”** na API GitHub a partir do telemóvel.

- **Local do clone:** `{dataDir}/projects/<owner>-<repo>`.

## Referências

- [API OpenCode Server](../api/opencode-server.md)
- [App README](../../packages/app/README.md) — E2E e variáveis do App
