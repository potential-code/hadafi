#!/bin/sh
set -e

echo "Running database migrations..."
node ./scripts/migrate.mjs

echo "Starting server..."
exec node --enable-source-maps ./dist/index.mjs
