-- One-shot patch: update static image paths after public/ reorganization.
-- Run once against the live database. Safe to re-run (LIKE filter only matches old-style paths).

BEGIN;

-- courses.cover: /courses/... → /images/courses/...
UPDATE courses
SET cover = REPLACE(cover, '/courses/', '/images/courses/')
WHERE cover LIKE '/courses/%';

-- live_events.cover_image: /events/... → /images/events/...
UPDATE live_events
SET cover_image = REPLACE(cover_image, '/events/', '/images/events/')
WHERE cover_image LIKE '/events/%';

COMMIT;
