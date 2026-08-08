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

FROM base AS build

ARG NEXT_PUBLIC_API_ORIGIN=
ENV NEXT_PUBLIC_API_ORIGIN=${NEXT_PUBLIC_API_ORIGIN}

RUN apk add --no-cache libc6-compat=1.1.0-r4

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
