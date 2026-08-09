# Production image for Sovereign Relay (Next.js standalone output).
#
# Build context is the monorepo root — required for pnpm workspace resolution:
#   docker build -f apps/relay/Dockerfile -t sovereign-relay .
#
# No secrets are baked in: APNs/FCM credentials are injected at runtime via
# env, same as every other credential in this monorepo.
#
# Unlike apps/auth and the runtime image, this one is not part of the default
# self-hosted stack (docker-compose.yml / docker-compose.prod.yml) — it is a
# shared, centrally-operated service most self-hosted instances never deploy
# themselves. See docs/rfcs/0087-sovereign-relay.md's "Deployment topology"
# for why, and the sovereign-infra/openfs-infra repos for how it's actually
# deployed (their own per-app docker-compose.yml + Caddy vhost, not this
# monorepo's compose files).

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
RUN pnpm --filter @sovereignfs/relay build

# ---- runner: minimal non-root production image ----------------------------
FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone output (tracing rooted at the monorepo root) replicates the repo
# layout: server.js lives under apps/relay/, with traced node_modules + packages.
# This service ships no public/ directory — it serves no HTML, only the
# JSON API routes under app/v1/*.
COPY --from=builder --chown=nextjs:nodejs /app/apps/relay/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/relay/.next/static ./apps/relay/.next/static

# No data volume: this service is deliberately stateless (RFC 0085's "Shared
# relay platform" — no persistent state beyond what a feature strictly needs,
# and push needs none). If a future feature here needs short-TTL state (e.g.
# WebRTC signaling sessions), that is in-memory or an external store, not a
# local volume — revisit this Dockerfile when that's actually built.

USER nextjs
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/api/health || exit 1

CMD ["node", "apps/relay/server.js"]
