#!/bin/sh
set -e

echo "Running database migrations..."
node ./scripts/migrate.mjs

echo "Seeding admin user..."
node --enable-source-maps ./dist/seed-admin.mjs

echo "Starting server..."
exec node --enable-source-maps ./dist/index.mjs
