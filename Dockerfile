# syntax=docker/dockerfile:1.7
#
# Sovereign Core, as one image: `docker build -t sovereign .` from the repository's root.
#
# - Multi-stage on node:24-alpine. The last stage holds only what Next traced for the running server, the
#   migrations it applies when it starts, and nothing else: no source, no dev dependencies, no package manager.
# - No environment is baked in. Core refuses to start without SV_URL and SV_AUTH_SECRET and says what is wrong
#   (spec/env.md); everything is given when the container is run.
# - It runs as an unprivileged user and listens on 3000.

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.28.9

# ---- dependencies --------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo

# Only the manifests, so this layer is reused until a dependency changes. `pnpm-workspace.yaml` is needed here:
# it holds the catalog the manifests refer to, the supported platforms (so the musl build of the database driver
# is installed) and the install policy, and without it the install resolves differently or fails.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/core/package.json apps/core/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/bridge/package.json packages/bridge/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/mailer/package.json packages/mailer/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/ui/package.json packages/ui/package.json
# The root's `prepare` installs git hooks, and there is no git here.
ENV SKIP_INSTALL_SIMPLE_GIT_HOOKS=1
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @sovereignfs/core...

# ---- build ---------------------------------------------------------------------------------------------------
FROM deps AS build
COPY apps/core apps/core
COPY packages packages
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @sovereignfs/core... build

# ---- run -----------------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS run
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# The traced server, with its own node_modules and the migrations (`outputFileTracingIncludes`), then the static
# files Next serves from the same place.
COPY --from=build --chown=node:node /repo/apps/core/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/core/.next/static ./apps/core/.next/static

# `sovereign-admin` (core-app §3.7.4), bundled by `tsup.admin.config.ts` into one file that runs on the Node here: the
# image holds no package manager and nothing to run TypeScript with. Only the database drivers are not in the file:
# `pg` is in `node_modules` already, and the native `libsql` is linked in from where the install keeps it, so the file finds
# it from its own folder. The operator CLI runs the command with `docker exec`; nobody runs it by hand.
COPY --from=build --chown=node:node /repo/apps/core/dist/sovereign-admin.mjs ./apps/core/admin/sovereign-admin.mjs
RUN mkdir -p apps/core/admin/node_modules \
 && ln -s /app/node_modules/.pnpm/node_modules/libsql apps/core/admin/node_modules/libsql \
 && printf '#!/bin/sh\nexec node /app/apps/core/admin/sovereign-admin.mjs "$@"\n' > /usr/local/bin/sovereign-admin \
 && chmod 0755 /usr/local/bin/sovereign-admin

# A SQLite file is kept here when that is the database chosen; the compose file mounts a volume over it.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node
# Migrations are read from the working directory when the server starts.
WORKDIR /app/apps/core
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
