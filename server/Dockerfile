# Stage 1: Install all workspace dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN bun install --frozen-lockfile

# Stage 2: Build server bundle with esbuild
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bunfig.toml tsconfig.json ./
COPY server/ ./server/
COPY shared/ ./shared/
RUN node ./server/build.mjs

# Stage 3: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Compiled server bundle
COPY --from=builder /app/server/dist ./dist
# Seed data files read at runtime by seed-course-content and seed-posttests.
# Placed in dist/seed-data/ so import.meta.url-relative paths resolve correctly.
COPY --from=builder /app/server/db/seed/seed-data ./dist/db/seed/seed-data
# Full node_modules required for externalized native modules (pdfkit, @napi-rs/canvas, etc.)
COPY --from=deps /app/node_modules ./node_modules
# Handlebars email templates (externalized from bundle)
COPY --from=builder /app/server/mail ./mail
# Drizzle migration files for startup migrator
COPY --from=builder /app/server/db/migrations ./db/migrations
# Migration runner script
COPY --from=builder /app/server/scripts/migrate.mjs ./scripts/migrate.mjs
# Entrypoint: runs migrations then starts server
COPY server/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p ./uploads/certificates ./uploads/media
EXPOSE 5000
ENTRYPOINT ["./entrypoint.sh"]
