# Stage 1: Install all workspace dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN bun install --frozen-lockfile

# Stage 2: Build Next.js standalone app
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bunfig.toml tsconfig.json ./
COPY client/ ./client/
COPY shared/ ./shared/
# NEXT_PUBLIC_* vars must be set at build time — Next.js bakes them into the bundle
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AI_BACKEND_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AI_BACKEND_URL=$NEXT_PUBLIC_AI_BACKEND_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
WORKDIR /app/client
RUN bun run build

# Stage 3: Production runtime using Next.js standalone output
FROM node:20-alpine AS runner
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
EXPOSE 3000
CMD ["node", "client/server.js"]
