# ── Build stage ────────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS deps

WORKDIR /app

# Copia manifests do workspace para resolver o catalog de dependências
COPY package.json bun.lock bunfig.toml ./
COPY packages/server/package.json packages/server/

# Instala somente as dependências do pacote server
RUN bun install --frozen-lockfile --filter @opencode-ai/server

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS runtime

WORKDIR /app

# Copia node_modules resolvidos
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules 2>/dev/null || true

# Copia código fonte do server
COPY packages/server/src ./packages/server/src
COPY packages/server/public ./packages/server/public
COPY packages/server/package.json packages/server/
COPY package.json bunfig.toml ./

# Diretório para o banco de dados SQLite
RUN mkdir -p /data && chown bun:bun /data

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "run", "packages/server/src/standalone.ts"]
