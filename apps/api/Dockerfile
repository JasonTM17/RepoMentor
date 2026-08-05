# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.12.0-alpine3.22@sha256:4f4a059445c5a6ef2b9d169d9afde176301263178141fc05ba657dab1c84f9a7

FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN npm install --global pnpm@11.0.9 \
  && pnpm config set store-dir /pnpm/store

WORKDIR /workspace

FROM base AS build

RUN apk add --no-cache build-base python3

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=repomentor-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm rebuild argon2 \
  && pnpm exec prisma generate --schema prisma/schema.prisma \
  && pnpm --filter @repomentor/api... run build \
  && pnpm deploy --legacy --filter @repomentor/api --prod --ignore-scripts /prod/api \
  && source_prisma_dir="$(dirname "$(dirname "$(readlink -f node_modules/@prisma/client)")")/.prisma" \
  && target_prisma_dir="$(dirname "$(dirname "$(readlink -f /prod/api/node_modules/@prisma/client)")")/.prisma" \
  && mkdir -p "$target_prisma_dir" \
  && cp -R "$source_prisma_dir/." "$target_prisma_dir/" \
  && rm -rf /prod/api/dist \
  && cp -R apps/api/dist /prod/api/dist

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=build --chown=node:node /prod/api/ ./

USER node

EXPOSE 3000

# The API's liveness route only asserts that the process is serving HTTP.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health/live || exit 1

CMD ["node", "dist/main.js"]
