# This app as one image (contracts/app-manifest.md §4): a process that is not root, configured by its environment alone, listening on
# 3000, that applies its own migrations when it starts. `docker build -t __NAME__ .`

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS run
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# The migrations are read from disk when the server starts, and Next does not trace them.
COPY --from=build --chown=node:node /app/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# What the instance reads to host this app, without pulling the image. Keep it equal to sovereign.manifest.json: `npm run manifest:check`, or `npm run manifest:write` to copy it over.
LABEL io.github.sovereignfs.app-manifest=__MANIFEST_LABEL__
