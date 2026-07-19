# syntax=docker/dockerfile:1
# Production image for the Sovereign runtime (Next.js standalone output).
#
# Build context is the monorepo root — required for pnpm workspace resolution:
#   docker build -f Dockerfile -t sovereign-runtime .
#
# No secrets are baked in: all configuration is injected at runtime via env.
# The one exception is private plugin repositories' clone credentials — see
# the builder stage below — which are a BuildKit secret file mount, never an
# ARG, so they never land in an image layer or the build-cache metadata.

# ---- deps: install workspace dependencies ---------------------------------
FROM node:24-alpine AS deps
# Native toolchain for better-sqlite3's musl build (no prebuilt for Alpine).
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app
# .dockerignore strips node_modules/.next/.env/.git; copying the whole tree
# keeps pnpm workspace resolution intact.
COPY . .
RUN pnpm install --frozen-lockfile

# ---- builder: compose plugins + build the standalone server ---------------
FROM deps AS builder
ENV NODE_ENV=production
# git is needed to clone the example plugins (and any external plugins declared
# in sovereign.plugins.json) at their pinned refs. This step requires network
# access during the build; the refs are pinned so the result is reproducible.
RUN apk add --no-cache git
# Clone the declared plugins into plugins/<id>/ at their pinned refs (the example
# plugins live in sovereignfs/sovereign-plugins-examples), then compose every
# plugin app/ tree into the route group — both must precede the build. The
# explicit generate is a safety net for the empty-config case (install:plugins
# only generates when it actually clones something).
#
# A plugin entry in sovereign.plugins.json can declare "tokenEnv": "<VAR>" to
# clone from a private repository (scripts/install-plugins.ts reads
# process.env[<VAR>]) — a distinct <VAR> per plugin repo is fully supported.
# Docker's plain RUN never inherits the host/Compose environment, so these
# variables have to be injected explicitly as a build secret — never a plain
# ARG, which bakes its value into the build-cache metadata even though it's
# absent from the final image layers.
#
# The mount is a FILE, not a single named var, so any number of distinct
# tokenEnv names can be supplied without ever touching this Dockerfile again:
# it holds ordinary `VAR=value` lines (one per private plugin repo, or fewer
# if several share a token), sourced into this RUN's shell before the clone
# runs. Build with:
#   docker buildx build --secret id=plugin_tokens,src=<path-to-KEY=value-file> ...
# The secret is a no-op (and this RUN behaves exactly as before) when no
# plugin declares a tokenEnv or the build omits --secret — the mounted file
# is simply absent, so nothing is sourced and every process.env.<VAR> lookup
# stays unset, same as today.
RUN --mount=type=secret,id=plugin_tokens,dst=/run/secrets/plugin_tokens \
    if [ -f /run/secrets/plugin_tokens ]; then \
      set -a; . /run/secrets/plugin_tokens; set +a; \
    fi; \
    pnpm install:plugins
# External plugin package manifests are intentionally absent from the committed
# lockfile. Refresh the builder's workspace graph after cloning pinned plugins,
# while keeping the initial source-tree install frozen.
RUN pnpm install --no-frozen-lockfile
RUN pnpm run generate
# tsup packages → next build → runtime/.next/standalone
RUN pnpm --filter @sovereignfs/runtime build

# Stage each plugin's manifest.json + migrations/ (if any) into a curated
# directory for the runner — not the full plugins/ tree, which would drag
# app/ source and each plugin's own node_modules into the production image
# for no benefit (routes are already compiled into the standalone build).
# Both files are genuine runtime dependencies of runAllPluginMigrations()
# (runtime/src/plugin-migrations.ts) and buildIdToDirMap(), which resolve
# `plugins/<dir>/manifest.json` and `plugins/<dir>/migrations/{sqlite,postgres}/`
# relative to the workspace root at server startup — previously absent from
# the runner image entirely, so every shared/isolated plugin's migrations
# were silently skipped (existsSync check) with no error logged.
RUN mkdir -p /app/.deploy/plugins && \
  for dir in plugins/*/; do \
    id="$(basename "$dir")"; \
    dest="/app/.deploy/plugins/$id"; \
    mkdir -p "$dest"; \
    [ -f "$dir/manifest.json" ] && cp "$dir/manifest.json" "$dest/"; \
    [ -d "$dir/migrations" ] && cp -r "$dir/migrations" "$dest/migrations"; \
  done

# ---- runner: minimal non-root production image ----------------------------
FROM node:24-alpine AS runner
ENV NODE_ENV=production
# The standalone server reads PORT/HOSTNAME; bind on all interfaces so the
# published port mapping reaches it.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone output (tracing rooted at the monorepo root) replicates the repo
# layout: server.js lives under runtime/, with traced node_modules + packages.
COPY --from=builder --chown=nextjs:nodejs /app/runtime/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/runtime/.next/static ./runtime/.next/static
# public/ holds the PWA assets generated at build (sw.js, workbox-*, fallback-*,
# manifest.json, icons).
COPY --from=builder --chown=nextjs:nodejs /app/runtime/public ./runtime/public
# Platform DB migrations — not traced by Next.js (runtime data, not imports).
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/migrations ./packages/db/migrations
# Per-plugin manifest.json + migrations/ (curated staging, see builder stage) —
# read at startup by runAllPluginMigrations() to apply shared/isolated-mode
# plugin migrations against the platform (or a dedicated plugin) database.
COPY --from=builder --chown=nextjs:nodejs /app/.deploy/plugins ./plugins
# Workspace root marker: the standalone server.js calls process.chdir(__dirname)
# which moves cwd from /app to /app/runtime. findWorkspaceRoot() then walks up
# and stops here (/app/pnpm-workspace.yaml), returning /app — so migration
# folder paths and SQLite file paths resolve correctly against /app rather than
# falling back to the post-chdir /app/runtime.
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Root package.json — read by getPlatformVersion() at runtime for the boot
# compatibility check. Without it the check falls back to '0.0.0' and disables
# every plugin that declares a minPlatformVersion.
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# SQLite + avatars persist here (mounted as a volume). The relative DB path
# resolves against the cwd (/app) at runtime, so it must be writable by the
# non-root runner.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "runtime/server.js"]
