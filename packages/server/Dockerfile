# ── Build stage ────────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS deps

WORKDIR /app

# Copia o monorepo (workspaces são exigidos pelo root package.json)
COPY . .

# Instala server + opencode (CLI para execute-opportunity). Retry em caso de ConnectionRefused.
RUN for i in 1 2 3; do bun install --filter @opencode-ai/server --filter opencode && break; sleep 30; done

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS runtime

WORKDIR /app

# Copia node_modules resolvidos (workspace: deps ficam no root)
COPY --from=deps /app/node_modules ./node_modules

# Copia código fonte do server, opencode (CLI) e util (workspace dep de opencode)
COPY packages/server/src ./packages/server/src
COPY packages/server/public ./packages/server/public
COPY packages/server/package.json packages/server/
COPY --from=deps /app/packages/opencode ./packages/opencode
COPY --from=deps /app/packages/util ./packages/util
COPY package.json bunfig.toml ./

# Instala git (necessário para fork+clone em submit-github-pr)
RUN apk add --no-cache git openssh-client

# Wrapper para opencode CLI (executa via bun; bin/opencode exige binário nativo)
RUN mkdir -p /app/bin && printf '%s\n' '#!/bin/sh' 'exec bun /app/packages/opencode/src/index.ts "$@"' > /app/bin/opencode-wrap && chmod +x /app/bin/opencode-wrap

# Diretório para o banco de dados SQLite
RUN mkdir -p /data && chown bun:bun /data

USER bun

EXPOSE 3000

# OPENCODE_CLI_PATH: wrapper que executa opencode via bun (sem binário nativo)
ENV OPENCODE_CLI_PATH=/app/bin/opencode-wrap

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "run", "packages/server/src/standalone.ts"]
