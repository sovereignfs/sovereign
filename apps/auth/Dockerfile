# Production image for the Sovereign auth server (Next.js standalone output).
#
# Build context is the monorepo root — required for pnpm workspace resolution:
#   docker build -f apps/auth/Dockerfile -t sovereign-auth .
#
# No secrets are baked in: all configuration is injected at runtime via env.

# ---- deps: install workspace dependencies ---------------------------------
FROM node:24-alpine AS deps
# Native toolchain for better-sqlite3-multiple-ciphers' musl build (RFC 0071
# SQLCipher support; no prebuilt for Alpine).
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app
# .dockerignore strips node_modules/.next/.env/.git; copying the whole tree
# keeps pnpm workspace resolution intact.
COPY . .
RUN pnpm install --frozen-lockfile

# ---- builder: build the standalone server ---------------------------------
FROM deps AS builder
ENV NODE_ENV=production
RUN pnpm --filter @sovereignfs/auth build

# ---- runner: minimal non-root production image ----------------------------
FROM node:24-alpine AS runner
ENV NODE_ENV=production
# The standalone server reads PORT/HOSTNAME (the old `next start --port 3001`
# flag does not apply); bind on all interfaces so the runtime can reach it.
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone output (tracing rooted at the monorepo root) replicates the repo
# layout: server.js lives under apps/auth/, with traced node_modules + packages.
# The auth app ships no public/ directory.
COPY --from=builder --chown=nextjs:nodejs /app/apps/auth/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/auth/.next/static ./apps/auth/.next/static
# Workspace root marker: the standalone server.js calls process.chdir(__dirname),
# moving cwd to /app/apps/auth. The auth DB path resolver (apps/auth/src/db.ts)
# walks up looking for pnpm-workspace.yaml and stops here (/app), so auth.db
# resolves to /app/data/auth.db — the mounted volume. Without this marker it
# would fall back to the post-chdir cwd and write to /app/apps/auth/data/auth.db,
# OUTSIDE the volume: users/sessions would not persist across container recreates
# and would be missing from backups.
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# auth.db persists here (mounted as a volume). The relative DB path resolves
# against the workspace root (/app, via the marker above), so it must be
# writable by the non-root runner.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "apps/auth/server.js"]
