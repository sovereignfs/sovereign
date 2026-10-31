# A test app for `sv apply` (apps/cli/src/apply/*.docker.test.ts). Its manifest is the label, as an app's image carries it.
FROM node:24-alpine
WORKDIR /app
COPY server.mjs ./
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
