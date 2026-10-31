# The toolkit as an image (operator-cli §8): what the server runs for `sv apply` and `sv receive`, from the digest in suite.lock.
#
# It holds the bundled toolkit and the Docker client and Compose plugin it drives the server's Docker with, through the socket the
# server's wrapper mounts. Build `dist/sv.mjs` first: `pnpm --filter @sovereignfs/cli build`, then
# `docker build -t sv-cli apps/cli`.
FROM node:24-alpine
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
COPY dist/sv.mjs ./sv.mjs
ENTRYPOINT ["node", "/app/sv.mjs"]
