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
# Native toolchain for better-sqlite3-multiple-ciphers' musl build (RFC 0071
# SQLCipher support; no prebuilt for Alpine).
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app
# .dockerignore strips node_modules/.next/.env/.git; copying the whole tree
# keeps pnpm workspace resolution intact.
COPY . .
RUN pnpm install --frozen-lockfile

# ---- builder: compose plugins into the monorepo (no app build yet) --------
FROM deps AS builder
ENV NODE_ENV=production
# Whether to compose example-plugins/ (docs/adhoc/example-plugins-plan.md) into
# this build. Off by default — a plain `docker build` never ships example
# routes/code unless explicitly opted in. This is a *build-time* decision
# distinct from (though it shares an env var with) the *runtime* Console
# "Show example apps" toggle (RFC 0021/epic 12.3, runtime/src/plugin-status.ts):
# an example excluded here has no composed route at all, so the runtime
# toggle has nothing to show regardless of its own setting. The published
# GHCR image (see .github/workflows/publish-images.yml) passes no build-args,
# so it always uses this default — only a locally-built image can override it
# with `--build-arg SOVEREIGN_EXAMPLES_ENABLED=1`.
ARG SOVEREIGN_EXAMPLES_ENABLED=0
ENV SOVEREIGN_EXAMPLES_ENABLED=${SOVEREIGN_EXAMPLES_ENABLED}
# git is needed to clone any external plugins declared in sovereign.plugins.json
# at their pinned refs. This step requires network access during the build;
# the refs are pinned so the result is reproducible.
RUN apk add --no-cache git
# Clone the declared external plugins into plugins/<id>/ at their pinned refs,
# then compose every plugin app/ tree (plugins/ plus example-plugins/ when
# SOVEREIGN_EXAMPLES_ENABLED is set) into the route group — both must precede
# the build. The explicit generate is a safety net for the empty-config case
# (install:plugins only generates when it actually clones something).
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

# ---- tools: on-demand admin CLI against a running deployment's volume -----
# Never started by `docker compose up` (compose service is profile-gated).
# Invoked explicitly for one-off admin tasks that need the `sv` CLI against
# the same data volume the runner/auth containers use — e.g.
# `sv db encrypt`/`decrypt` (RFC 0071) and the `sv user reset-mfa` break-glass
# tool — neither of which exist in the minimal runner image below (no bin/,
# scripts/, or dev tooling there by design, to keep the served image small).
#
# Branches off `builder` here — before the app-builder stage below compiles
# the Next.js app — deliberately. Every `packages/*` import `bin/sv.ts` uses
# (`@sovereignfs/db`, `@sovereignfs/manifest`) resolves straight to
# `src/index.ts` via each package's own `exports` map (they're workspace-only,
# never published, so there's no `dist/` build step in their path at all —
# only the externally-published `sdk`/`ui`/`create-plugin` packages go through
# `tsup`). So the CLI needs nothing from the slow `next build` that follows:
# building it anyway turned a one-off admin command into a multi-minute wait
# on every machine without a warm layer cache — most exposed on the
# published-image deployment path (`SOVEREIGN_VERSION=...`), which has no
# local Dockerfile at all and must build `tools` from a fresh clone with zero
# cache. Nothing here needs to change if the app build ever gets slower still.
FROM builder AS tools
ENV NODE_ENV=production
COPY docker/tools-entrypoint.sh /usr/local/bin/tools-entrypoint.sh
RUN chmod +x /usr/local/bin/tools-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/tools-entrypoint.sh"]
CMD ["sh", "-c", "echo 'Usage: docker compose --profile tools run --rm tools pnpm sv <command>' && pnpm sv --help"]

# ---- app-builder: compile the Next.js app for the runner ------------------
# Split from `builder` above so `tools` (which only needs the composed
# monorepo, not the compiled app) never pays for this step.
FROM builder AS app-builder
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
#
# example-plugins/*/ is staged into this SAME /app/.deploy/plugins/<dir>
# namespace (when SOVEREIGN_EXAMPLES_ENABLED composed them above) — the
# runner-image staging tree makes no distinction by source directory, and
# buildIdToDirMap() resolves purely by reading each staged manifest.json's
# `id` field, not by directory naming convention. No current example declares
# a database (so this is currently a no-op in practice), but a future one that
# does would otherwise have its migrations silently skipped at startup.
RUN mkdir -p /app/.deploy/plugins && \
  stage_plugin_dir() { \
    id="$(basename "$1")"; \
    dest="/app/.deploy/plugins/$id"; \
    mkdir -p "$dest"; \
    [ -f "$1/manifest.json" ] && cp "$1/manifest.json" "$dest/"; \
    [ -d "$1/migrations" ] && cp -r "$1/migrations" "$dest/migrations"; \
    true; \
  }; \
  for dir in plugins/*/; do stage_plugin_dir "$dir"; done && \
  case "$(printf '%s' "$SOVEREIGN_EXAMPLES_ENABLED" | tr '[:upper:]' '[:lower:]')" in \
    1|true|yes|on) \
      for dir in example-plugins/*/; do [ -d "$dir" ] && stage_plugin_dir "$dir"; done \
      ;; \
  esac

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
COPY --from=app-builder --chown=nextjs:nodejs /app/runtime/.next/standalone ./
COPY --from=app-builder --chown=nextjs:nodejs /app/runtime/.next/static ./runtime/.next/static
# public/ holds the PWA assets generated at build (sw.js, workbox-*, fallback-*,
# manifest.json, icons).
COPY --from=app-builder --chown=nextjs:nodejs /app/runtime/public ./runtime/public
# Platform DB migrations — not traced by Next.js (runtime data, not imports).
COPY --from=app-builder --chown=nextjs:nodejs /app/packages/db/migrations ./packages/db/migrations
# Per-plugin manifest.json + migrations/ (curated staging, see app-builder stage) —
# read at startup by runAllPluginMigrations() to apply shared/isolated-mode
# plugin migrations against the platform (or a dedicated plugin) database.
COPY --from=app-builder --chown=nextjs:nodejs /app/.deploy/plugins ./plugins
# Workspace root marker: the standalone server.js calls process.chdir(__dirname)
# which moves cwd from /app to /app/runtime. findWorkspaceRoot() then walks up
# and stops here (/app/pnpm-workspace.yaml), returning /app — so migration
# folder paths and SQLite file paths resolve correctly against /app rather than
# falling back to the post-chdir /app/runtime.
COPY --from=app-builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Root package.json — read by getPlatformVersion() at runtime for the boot
# compatibility check. Without it the check falls back to '0.0.0' and disables
# every plugin that declares a minPlatformVersion.
COPY --from=app-builder --chown=nextjs:nodejs /app/package.json ./package.json

# SQLite + avatars persist here (mounted as a volume). The relative DB path
# resolves against the cwd (/app) at runtime, so it must be writable by the
# non-root runner.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "runtime/server.js"]
