# Base images are pinned by digest (multi-arch index), so a rebuild uses
# exactly the images this was tested with: bun 1.2.23 (the bun that wrote
# bun.lock; a newer bun rewrites it and the frozen install fails) and Node
# 22.23.5, as of 25 Nov 2026. To refresh, on purpose:
#   docker buildx imagetools inspect oven/bun:1.2-alpine   (and node:22-alpine)
# put the new "Digest:" values below (every FROM in server/Dockerfile and
# client/Dockerfile), rebuild, run the tests and a local docker run.

# Stage 1: Install all workspace dependencies
FROM oven/bun:1.2-alpine@sha256:0841c588f6304300baf1d395ae339ce09a6e18c4b6a7cdd4fddcbdb87a2f096a AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN bun install --frozen-lockfile

# Stage 2: Build Next.js standalone app
# Built on Node, not Bun: in the Bun image `next build` runs on the Bun
# runtime, and Next 16 fails there ("Expected CommonJS module to have a
# function wrapper"). Bun still installs the packages in stage 1.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bunfig.toml tsconfig.json ./
COPY client/ ./client/
COPY shared/ ./shared/
# The site forwards /api and /uploads to the API (next.config.ts rewrites), so
# the session cookie is first-party. API_INTERNAL_URL is where this Next server
# reaches the API: the compose service "server" on port 5000 by default
# (`:-` also covers an empty value passed by compose).
ARG API_INTERNAL_URL
ENV API_INTERNAL_URL=${API_INTERNAL_URL:-http://server:5000}
# NEXT_PUBLIC_* vars must be set at build time — Next.js bakes them into the bundle
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AI_BACKEND_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_HUMAN_MENTORS_ENABLED=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AI_BACKEND_URL=$NEXT_PUBLIC_AI_BACKEND_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_HUMAN_MENTORS_ENABLED=$NEXT_PUBLIC_HUMAN_MENTORS_ENABLED
WORKDIR /app/client
RUN node ../node_modules/next/dist/bin/next build

# Stage 3: Production runtime using Next.js standalone output
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Standalone bundle includes a minimal self-contained node_modules.
# With outputFileTracingRoot set to the monorepo root, the output nests under
# client/ (server.js -> client/server.js) and node_modules sits at the root.
COPY --from=builder /app/client/.next/standalone ./
# Static assets are not included in standalone — must be copied separately,
# alongside the nested server.js under client/.
COPY --from=builder /app/client/.next/static ./client/.next/static
COPY --from=builder /app/client/public ./client/public
# Run as the unprivileged "node" user (uid 1000). The app's files stay
# root-owned and read-only to it; only Next's cache folder is writable.
RUN mkdir -p client/.next/cache && chown node:node client/.next/cache
USER node
EXPOSE 3000
CMD ["node", "client/server.js"]
