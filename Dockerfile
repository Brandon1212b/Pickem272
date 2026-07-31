# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Base: Node 24, matches the .replit "nodejs-24" module.
# The official node images are multi-arch, so this same Dockerfile builds on
# amd64 (your PC) and arm64 (64-bit Raspberry Pi OS) without changes.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Builder: install deps, typecheck, build frontend + api-server
# ---------------------------------------------------------------------------
FROM base AS builder

# Copy everything (simplest correct approach for a pnpm workspace with many
# inter-package "workspace:*" deps). If you want faster incremental Docker
# rebuilds later, copy just the package.json/pnpm-lock.yaml/pnpm-workspace.yaml
# files first, run install, then COPY the rest of the source.
COPY . .

RUN echo 'script-shell = "/bin/bash"' >> ~/.pnpmrc && pnpm install --frozen-lockfile --ignore-scripts

# Dummy build-time values: the frontend's vite.config.ts requires PORT and
# BASE_PATH to be set even just to run `vite build`. BASE_PATH=/ is correct
# for this deployment since the frontend is served from the app's root.
ENV NODE_ENV=production
ENV PORT=20657
ENV BASE_PATH=/

RUN pnpm -r --filter='./artifacts/**' run build

# Bundle the built frontend into the api-server's dist/ output so the single
# runtime process can serve both static assets and /api routes.
RUN mkdir -p artifacts/api-server/dist/public \
    && cp -r artifacts/nfl-pickem/dist/public/. artifacts/api-server/dist/public/

# ---------------------------------------------------------------------------
# Runtime: esbuild bundled everything (including pg, express, drizzle-orm)
# into dist/index.mjs + a few pino worker files, so no node_modules are
# needed at runtime. This keeps the final image small — good for a Pi.
# ---------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/artifacts/api-server/dist ./dist

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
