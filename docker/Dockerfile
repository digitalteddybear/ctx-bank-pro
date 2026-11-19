FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit
FROM dependencies AS production-dependencies
RUN npm prune --omit=dev
FROM dependencies AS build
COPY . .
RUN npm run build && rm -rf .next/cache
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/mcp ./mcp
COPY --from=build --chown=node:node /app/docs ./docs
COPY --from=build --chown=node:node /app/package.json /app/tsconfig.json /app/next.config.ts ./
RUN mkdir -p /data /config /app/data && chown node:node /data /config /app/data
USER node
EXPOSE 3000
ENTRYPOINT ["node", "scripts/container-entry.mjs"]
CMD ["npm", "run", "start"]
