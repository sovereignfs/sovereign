# Production image for the Sovereign Harness engine service (Next.js
# standalone output). Wraps llama.cpp server (RFC 0063, Research 0015 —
# llama.cpp selected over Ollama; workstream 0014 leg 2).
#
# Build context is the monorepo root — required for pnpm workspace resolution:
#   docker build -f apps/harness/Dockerfile -t sovereign-harness .
#
# No secrets are baked in: all configuration is injected at runtime via env.
#
# Unlike apps/relay (a separately-deployed shared service), this app is part
# of this monorepo's own docker-compose.yml/docker-compose.prod.yml, gated
# behind the optional `harness` Compose profile — matching apps/auth's
# integration style, not apps/relay's.

# ---- deps: install workspace dependencies ---------------------------------
FROM node:24-alpine AS deps
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app
# .dockerignore strips node_modules/.next/.env/.git; copying the whole tree
# keeps pnpm workspace resolution intact.
COPY . .
RUN pnpm install --frozen-lockfile

# ---- builder: build the standalone server ---------------------------------
FROM deps AS builder
ENV NODE_ENV=production
RUN pnpm --filter @sovereignfs/harness build

# ---- runner: minimal non-root production image ----------------------------
FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3003
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone output (tracing rooted at the monorepo root) replicates the repo
# layout: server.js lives under apps/harness/, with traced node_modules + packages.
# This service ships no public/ directory — it serves no HTML, only JSON/SSE
# API routes under app/api/*.
COPY --from=builder --chown=nextjs:nodejs /app/apps/harness/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/harness/.next/static ./apps/harness/.next/static

# Downloaded GGUF model weights persist here (mounted as a named volume in
# Compose — sovereign_harness_models). Writable by the non-root runner.
RUN mkdir -p /app/models && chown nextjs:nodejs /app/models

USER nextjs
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3003/api/health || exit 1

CMD ["node", "apps/harness/server.js"]
