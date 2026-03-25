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

# Copia workspace packages exigidos pelos symlinks em node_modules (opencode importa tudo no boot)
COPY --from=deps /app/packages/server ./packages/server
COPY --from=deps /app/packages/opencode ./packages/opencode
COPY --from=deps /app/packages/util ./packages/util
COPY --from=deps /app/packages/sdk/js ./packages/sdk/js
COPY --from=deps /app/packages/plugin ./packages/plugin
COPY --from=deps /app/.opencode/skills ./.opencode/skills
COPY package.json bunfig.toml ./

# Base tools + Node package managers (cobertura imediata para projetos JS/TS)
RUN apk add --no-cache git openssh-client nodejs npm curl bash \
  && npm install -g pnpm yarn

# mise — gerenciador universal de runtimes (Python, Java, Go, Rust, Ruby, PHP, .NET, etc.)
# Instala na imagem e expõe globalmente; runtimes são baixados sob demanda pelo agente em /data/mise
RUN curl https://mise.run | sh \
  && mv /root/.local/bin/mise /usr/local/bin/mise

# mise armazena runtimes em /data/mise (diretório sob controle do user bun)
ENV MISE_DATA_DIR=/data/mise
ENV MISE_CACHE_DIR=/data/mise/cache

# Wrapper para opencode CLI (executa via bun; bin/opencode exige binário nativo)
RUN mkdir -p /app/bin && printf '%s\n' '#!/bin/sh' 'exec bun /app/packages/opencode/src/index.ts "$@"' > /app/bin/opencode-wrap && chmod +x /app/bin/opencode-wrap

# Diretório para o banco de dados SQLite
RUN mkdir -p /data /data/mise && chown -R bun:bun /data

USER bun

EXPOSE 3000

# OPENCODE_CLI_PATH: wrapper que executa opencode via bun (sem binário nativo)
ENV OPENCODE_CLI_PATH=/app/bin/opencode-wrap

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["bun", "run", "packages/server/src/standalone.ts"]
