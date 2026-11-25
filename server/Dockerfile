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

# Stage 2: Build server bundle with esbuild
FROM oven/bun:1.2-alpine@sha256:0841c588f6304300baf1d395ae339ce09a6e18c4b6a7cdd4fddcbdb87a2f096a AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bunfig.toml tsconfig.json ./
COPY server/ ./server/
COPY shared/ ./shared/
RUN node ./server/build.mjs

# Stage 3: Production runtime
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
WORKDIR /app
ENV NODE_ENV=production
# su-exec: the entrypoint starts as root only to chown the uploads volume,
# then drops to the unprivileged "node" user (uid 1000) for everything else.
RUN apk add --no-cache su-exec
# Compiled server bundle
COPY --from=builder /app/server/dist ./dist
# Seed data files read at runtime by seed-course-content and seed-posttests.
# Placed in dist/seed-data/ so import.meta.url-relative paths resolve correctly.
COPY --from=builder /app/server/db/seed/seed-data ./dist/db/seed/seed-data
# Certificate template and the font it is drawn in (the image has no system fonts)
COPY --from=builder /app/server/assets ./assets
# Full node_modules required for externalized native modules (pdfkit, @napi-rs/canvas, etc.)
COPY --from=deps /app/node_modules ./node_modules
# Handlebars email templates (externalized from bundle)
COPY --from=builder /app/server/mail ./mail
# Drizzle migration files for startup migrator
COPY --from=builder /app/server/db/migrations ./db/migrations
# Migration runner script
COPY --from=builder /app/server/scripts/migrate.mjs ./scripts/migrate.mjs
# Release prep (audit, admins, AI read-only role, certificate check), run by
# hand in the container: node scripts/prod-prep.mjs audit (docs/release-runbook.md)
COPY --from=builder /app/server/scripts/prod-prep.mjs /app/server/scripts/ai-readonly-role.mjs /app/server/scripts/ai-readonly-role.sql ./scripts/
# CRM outbox health, read-only: node scripts/crm-outbox-status.mjs
COPY --from=builder /app/server/scripts/crm-outbox-status.mjs ./scripts/crm-outbox-status.mjs
# Operator service account bootstrap (docs/operator-access.md):
#   node scripts/create-operator-user.mjs --email <address> [--apply]
COPY --from=builder /app/server/scripts/create-operator-user.mjs ./scripts/create-operator-user.mjs
# Entrypoint: hands /app/uploads to "node", drops to it, runs migrations, starts
# the server. The app's own files stay root-owned (read-only to the server);
# uploads (the volume) is the only place it writes.
COPY server/entrypoint.sh ./entrypoint.sh
RUN chmod 755 ./entrypoint.sh && mkdir -p ./uploads/certificates ./uploads/media && chown -R node:node ./uploads
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1
ENTRYPOINT ["./entrypoint.sh"]
