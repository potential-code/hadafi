// shared/features.ts
// Site-wide feature switches, read the same way by the API (HUMAN_MENTORS_ENABLED)
// and the site build (NEXT_PUBLIC_HUMAN_MENTORS_ENABLED). docker-compose passes
// one Dokploy variable to both, so Hana's prompts (fingerprinted by the API in
// server/services/serviceTokenClaims.ts) come out word for word the same on
// both sides.

/**
 * Human mentors: the Human Mentors page, booking, My Bookings, and every link,
 * card, prompt rule and Hana suggestion that leads there. Off until real
 * mentors can sign in and set their times (HUMAN_MENTORS_ENABLED=true on
 * Dokploy, then redeploy).
 */
export const HUMAN_MENTORS_ENABLED =
  process.env["HUMAN_MENTORS_ENABLED"] === "true" || process.env.NEXT_PUBLIC_HUMAN_MENTORS_ENABLED === "true";
