#!/bin/sh
set -e

echo "Running database migrations..."
node ./scripts/migrate.mjs

echo "Seeding admin user..."
node --enable-source-maps ./dist/db/seed/seed-admin.mjs

echo "Seeding offers..."
node --enable-source-maps ./dist/db/seed/seed-hadafi-offers.mjs

echo "Seeding events..."
node --enable-source-maps ./dist/db/seed/seed-hadafi-events.mjs

echo "Seeding mentors..."
node --enable-source-maps ./dist/db/seed/seed-hadafi-mentors.mjs

echo "Seeding courses..."
node --enable-source-maps ./dist/db/seed/seed-hadafi-courses.mjs

echo "Seeding course content..."
node --enable-source-maps ./dist/db/seed/seed-hadafi-course-content.mjs

echo "Starting server..."
exec node --enable-source-maps ./dist/index.mjs
