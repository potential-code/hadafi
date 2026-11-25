#!/bin/sh
set -e

# Started as root (the image default) only to hand the uploads volume to the
# unprivileged "node" user: files written by older images (which ran as root)
# are root-owned. Only /app/uploads changes owner, only what isn't node's
# already, without following symbolic links (-h) or leaving the volume
# (-xdev). Then this script runs again as node; migrations and the server
# never run as root.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/uploads/certificates /app/uploads/media
  find /app/uploads -xdev \! -user node -exec chown -h node:node {} +
  exec su-exec node:node "$0" "$@"
fi

echo "Running database migrations..."
node ./scripts/migrate.mjs

echo "Starting server..."
exec node --enable-source-maps ./dist/index.mjs
