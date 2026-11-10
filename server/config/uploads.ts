import path from 'path'

/**
 * Root of everything served at /uploads, for every reader and writer (as SMEEP
 * 1507451). This file sits one level below the server root both as source
 * (server/config) and once bundled (server/dist), so both resolve to
 * server/uploads. Resolving from a service's own folder instead put tests'
 * certificates in server/services/uploads.
 */
export const UPLOADS_ROOT = path.resolve(__dirname, '..', 'uploads')
export const MEDIA_DIR = path.join(UPLOADS_ROOT, 'media')
export const CERTIFICATES_DIR = path.join(UPLOADS_ROOT, 'certificates')
