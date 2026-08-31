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
# Root PRIVACY.md/TOS.md (RFC 0090) — the registration create hook
# (apps/auth/src/auth.ts, via legal-content.ts) hashes these to stamp
# policyAcceptedHash on signup (GDPR-8, workstream 0021 leg 6). Same
# workspace-root resolution as the marker above, so these must land at the
# same /app path the root Dockerfile copies them to for `runtime`.
COPY --from=builder --chown=nextjs:nodejs /app/PRIVACY.md ./PRIVACY.md
COPY --from=builder --chown=nextjs:nodejs /app/TOS.md ./TOS.md

# Repairs a real gap in Next's standalone-output file tracer (@vercel/nft):
# @neon-rs/load (libsql's native-binding loader) requires the
# platform-specific `@libsql/<target>` package dynamically — branching on
# the running platform at call time — so the tracer's static analysis never
# discovers that require and silently omits the package from the standalone
# output's node_modules, even though apps/auth/next.config.ts's
# outputFileTracingIncludes now force-copies the raw package *files*
# themselves. What's still missing is the symlink pnpm's isolated
# node_modules layout requires: libsql's own require('@libsql/<target>')
# resolves through a symlink inside ITS OWN scoped node_modules
# (.pnpm/libsql@<version>/node_modules/@libsql/<target>), which the tracer
# also never recreates for this dynamic require. Confirmed by direct
# inspection: the raw @libsql/linux-arm64-musl package content lands
# correctly at .pnpm/@libsql+linux-arm64-musl@0.5.29/..., but no symlink to
# it exists inside libsql@0.5.29's own node_modules/@libsql/ — so Node's
# `require('@libsql/linux-arm64-musl')` from within libsql's module scope
# still fails with MODULE_NOT_FOUND. Recreates it for every musl target the
# Alpine-based runner image could actually run on (arm64: Apple Silicon
# Docker Desktop; x64: most cloud hosts) — `|| true` because a given build
# only produces one of these two raw packages (whichever the tracer
# happened to include for the host's own architecture), not both.
RUN for target in linux-arm64-musl linux-x64-musl; do \
  src="/app/node_modules/.pnpm/@libsql+${target}@0.5.29/node_modules/@libsql/${target}"; \
  dest="/app/node_modules/.pnpm/libsql@0.5.29/node_modules/@libsql/${target}"; \
  if [ -d "$src" ] && [ ! -e "$dest" ]; then \
  mkdir -p "$(dirname "$dest")" && \
  ln -s "../../../@libsql+${target}@0.5.29/node_modules/@libsql/${target}" "$dest" && \
  echo "[auth Dockerfile] linked $dest -> $src"; \
  fi; \
  done

# auth.db persists here (mounted as a volume). The relative DB path resolves
# against the workspace root (/app, via the marker above), so it must be
# writable by the non-root runner.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "apps/auth/server.js"]
