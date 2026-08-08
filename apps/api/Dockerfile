# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.16.0-alpine3.22@sha256:191c9f0080fcbbc6547a85dc0ff7988072214a355aabdc1d2ec55a7dae5eea8a
ARG NPM_VERSION=12.0.2
ARG OPENSSL_LIB_VERSION=3.5.7-r0

# The ARG includes an explicit tag and immutable digest; Hadolint cannot infer that through interpolation.
# hadolint ignore=DL3006
FROM ${NODE_IMAGE} AS base

ARG NPM_VERSION
ARG OPENSSL_LIB_VERSION

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN apk add --no-cache \
      "libcrypto3=${OPENSSL_LIB_VERSION}" \
      "libssl3=${OPENSSL_LIB_VERSION}" \
  && npm install --global --ignore-scripts "npm@${NPM_VERSION}" \
  && npm install --global --ignore-scripts pnpm@11.0.9 \
  && npm cache clean --force \
  && pnpm config set store-dir /pnpm/store

WORKDIR /workspace

FROM base AS workspace

RUN apk add --no-cache \
      build-base=0.5-r3 \
      python3=3.12.13-r0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=repomentor-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts

COPY . .

FROM workspace AS migration

# This one-shot target intentionally retains the Prisma CLI, schema, and
# checked-in migrations. DATABASE_URL is supplied only when the container runs.
CMD ["pnpm", "db:migrate"]

FROM workspace AS build

RUN pnpm rebuild argon2 \
  && pnpm exec prisma generate --schema prisma/schema.prisma \
  && pnpm --filter @repomentor/api... run build

FROM build AS production

RUN pnpm deploy --legacy --filter @repomentor/api --prod --ignore-scripts /prod/api \
  && source_prisma_dir="$(dirname "$(dirname "$(readlink -f node_modules/@prisma/client)")")/.prisma" \
  && target_prisma_dir="$(dirname "$(dirname "$(readlink -f /prod/api/node_modules/@prisma/client)")")/.prisma" \
  && mkdir -p "$target_prisma_dir" \
  && cp -R "$source_prisma_dir/." "$target_prisma_dir/" \
  && rm -rf /prod/api/dist \
  && cp -R apps/api/dist /prod/api/dist

# The ARG includes an explicit tag and immutable digest; Hadolint cannot infer that through interpolation.
# hadolint ignore=DL3006
FROM ${NODE_IMAGE} AS runtime

ARG OPENSSL_LIB_VERSION

RUN apk add --no-cache \
      "libcrypto3=${OPENSSL_LIB_VERSION}" \
      "libssl3=${OPENSSL_LIB_VERSION}" \
  && rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/bin/npm \
      /usr/local/bin/npx

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=production --chown=node:node /prod/api/ ./

USER node

EXPOSE 3000

# The API's liveness route only asserts that the process is serving HTTP.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health/live || exit 1

CMD ["node", "dist/main.js"]
