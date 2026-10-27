FROM node:24.22.1-alpine AS base

RUN apk update && apk upgrade --no-cache && npm install -g npm@11.19.0

WORKDIR /app

COPY package*.json ./

# ---------------------------------------------------------------------------
# development: full devDependencies, used by docker-compose (watch/debug mode)
# ---------------------------------------------------------------------------
FROM base AS development

RUN npm ci

COPY . .

RUN npx prisma generate

EXPOSE 3000
EXPOSE 9229

# ---------------------------------------------------------------------------
# build: compiles the TypeScript output consumed by the production stage
# ---------------------------------------------------------------------------
FROM base AS build

RUN npm ci

COPY . .

RUN npx prisma generate

RUN npm run build

# ---------------------------------------------------------------------------
# production: lean runtime image with only production dependencies
# ---------------------------------------------------------------------------
FROM base AS production

ENV NODE_ENV=production

RUN npm ci --omit=dev --ignore-scripts && npm uninstall -g npm

COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated

EXPOSE 3000

USER node

CMD ["node", "dist/src/main"]
