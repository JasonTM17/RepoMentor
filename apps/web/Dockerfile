# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.12.0-alpine3.22

FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN npm install --global pnpm@11.0.9 \
  && pnpm config set store-dir /pnpm/store

WORKDIR /workspace

FROM base AS build

RUN apk add --no-cache libc6-compat

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=repomentor-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm --filter @repomentor/web build \
  && pnpm deploy --legacy --filter @repomentor/web --prod --ignore-scripts /prod/web \
  && mkdir -p /prod/web/public \
  && if [ -d apps/web/public ]; then cp -R apps/web/public/. /prod/web/public/; fi

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=build --chown=node:node /prod/web/package.json ./package.json
COPY --from=build --chown=node:node /prod/web/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/web/.next ./.next
COPY --from=build --chown=node:node /prod/web/public ./public

USER node

EXPOSE 3000

# The web app has no dedicated health route; this checks its HTTP shell only.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["./node_modules/.bin/next", "start"]
