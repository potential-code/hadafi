// What an operator key may call. An operator key acts as an admin, but only
// on the method + path patterns below: Hadafi's equivalents of the endpoints
// the operator MCP (potential-ai-operator) calls on SMEEP, which its Hadafi
// adapter is built against (table in docs/operator-access.md). Anything else
// answers 403 for a key; admin sessions (cookies) are not affected.
//
// KEEP IN STEP WITH THE OPERATOR MCP: when it adds or changes a Hadafi tool,
// add its method and path here in the same change (and to the table in
// docs/operator-access.md), or the tool gets a 403. A test checks that every
// entry is a route Hadafi really serves. Patterns use Express syntax;
// ":name" matches one path segment.
//
// Deliberately absent (the MCP does not use them): the bulk exports
// (/api/admin/exports/*, which is also the only admin way to the newsletter
// list, and /api/admin/organisations/:id/exports/*), the AI report download
// (/api/admin/ai/report), AI question writing (/api/admin/quiz/generate),
// media upload, the Zoom host start link, AI-report reviewer notes, the
// Hadafi-only announcement edit and delete (PUT/DELETE
// /api/admin/announcements/:id; SMEEP has no such routes, and PUT can send),
// every learner, mentor, partner and account route.
//
// Deliberately absent because they hand out a login and the key would choose
// who gets it (CEO decision for SMEEP, Nov 2026, applied to Hadafi: a person
// does these in the admin UI):
//   POST /api/admin/organisations/:id/partners          partner invite: creates
//        a partner login for any address the caller names; it signs in by an
//        emailed code and sees the organisation's learner records.
//   POST /api/admin/mentor-applications/:id/approve     creates a mentor login
//        for an application anyone can submit publicly.
//   POST /api/admin/mentor-applications/:id/reject      the other half of the
//        same decision; it stays with the person who approves.
// Do not add them back for the operator MCP. Reading partners and mentor
// applications and removing a partner stay: they only take access away.
export const OPERATOR_ROUTES = [
  // Offers
  "GET /api/admin/offers",
  "GET /api/offers/:id",
  "POST /api/admin/offers",
  "PATCH /api/admin/offers/:id",
  "DELETE /api/admin/offers/:id",

  // Announcements (POST is rate limited for keys, middleware/limits.ts)
  "GET /api/admin/announcements",
  "GET /api/admin/announcements/audience",
  "POST /api/admin/announcements",
  "POST /api/admin/announcements/:id/end", // SMEEP: .../:id/archive

  // Live events
  "GET /api/live-events/admin",
  "GET /api/live-events/admin/zoom",
  "POST /api/live-events",
  "PATCH /api/live-events/:id",
  "DELETE /api/live-events/:id",
  "GET /api/live-events/:id/bookings",
  "GET /api/live-events/:id/bookings/export", // bookers' names and emails, as CSV
  "POST /api/live-events/:id/zoom/resync",

  // Courses (LMS authoring)
  "GET /api/lms/admin/courses",
  "GET /api/lms/admin/courses/:id",
  "POST /api/lms/admin/courses",
  "PATCH /api/lms/admin/courses/:id",
  "DELETE /api/lms/admin/courses/:id",
  "POST /api/lms/admin/courses/:id/modules",
  "POST /api/lms/admin/courses/:id/modules/reorder",
  "POST /api/lms/admin/courses/:id/assessments",
  "PATCH /api/lms/admin/modules/:id",
  "DELETE /api/lms/admin/modules/:id",
  "POST /api/lms/admin/modules/:id/units",
  "POST /api/lms/admin/modules/:id/units/reorder",
  "PATCH /api/lms/admin/units/:id",
  "DELETE /api/lms/admin/units/:id",
  "POST /api/lms/admin/units/:id/blocks",
  "POST /api/lms/admin/units/:id/blocks/reorder",
  "PATCH /api/lms/admin/blocks/:id",
  "DELETE /api/lms/admin/blocks/:id",
  "POST /api/lms/admin/blocks/:id/questions",
  "POST /api/lms/admin/blocks/:id/questions/reorder",
  "PATCH /api/lms/admin/block-questions/:id",
  "DELETE /api/lms/admin/block-questions/:id",
  "PATCH /api/lms/admin/assessments/:id",
  "DELETE /api/lms/admin/assessments/:id",
  "POST /api/lms/admin/assessments/:id/questions",
  "POST /api/lms/admin/assessments/:id/questions/reorder",
  "PATCH /api/lms/admin/assessment-questions/:id",
  "DELETE /api/lms/admin/assessment-questions/:id",

  // Organisations
  "GET /api/admin/organisations",
  "POST /api/admin/organisations",
  "PATCH /api/admin/organisations/:id",
  "DELETE /api/admin/organisations/:id",
  "POST /api/admin/organisations/:id/join-code",
  "GET /api/admin/organisations/:id/dashboard",
  "GET /api/admin/organisations/:id/learners/:userId",
  "POST /api/admin/organisations/:id/learners",
  "DELETE /api/admin/organisations/:id/learners/:userId",
  "GET /api/admin/organisations/:id/partners",
  "DELETE /api/admin/organisations/:id/partners/:userId",

  // People: invites and applications (read only)
  "GET /api/admin/needs-attention",
  "GET /api/admin/invites",
  "POST /api/admin/invites",
  "GET /api/admin/mentor-applications",
  "GET /api/admin/stakeholder-applications",

  // Media library and AI safety reports
  "GET /api/media",
  "DELETE /api/media",
  "DELETE /api/media/:id",
  "GET /api/admin/ai-reports",
  "PATCH /api/admin/ai-reports/:id",

  // Analytics
  "GET /api/admin/stats",
  "GET /api/admin/analytics/impact",
  "GET /api/admin/analytics/learning-gain",
  "GET /api/admin/analytics/insights",
  "GET /api/admin/analytics/kpi-overview",
  "GET /api/admin/analytics/user-growth",
  "GET /api/admin/analytics/enrollments",
  "GET /api/admin/analytics/course-engagement",
  "GET /api/admin/analytics/course-completion",
  "GET /api/admin/analytics/course-performance",
  "GET /api/admin/analytics/stakeholder-kpis",
  "GET /api/admin/analytics/stakeholder-trend",
  "GET /api/admin/analytics/stakeholder-trend-by-type",

  // AI analytics: the pseudonymised ai.* views (SELECT-only, guarded server-side) and saved boards
  "GET /api/admin/ai/catalog",
  "POST /api/admin/ai/query",
  "GET /api/admin/ai/dashboards",
  "GET /api/admin/ai/dashboards/:id",
  "POST /api/admin/ai/dashboards",
  "PUT /api/admin/ai/dashboards/:id",
  "DELETE /api/admin/ai/dashboards/:id",
] as const;

interface CompiledRoute {
  method: string;
  pattern: RegExp;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(entry: string): CompiledRoute {
  const [method, path] = entry.split(" ") as [string, string];
  const source = path
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "[^/]+" : escape(seg)))
    .join("/");
  // Case-insensitive with an optional trailing slash, as Express routes.
  return { method, pattern: new RegExp(`^${source}/?$`, "i") };
}

const COMPILED: readonly CompiledRoute[] = OPERATOR_ROUTES.map(compile);

/**
 * True when an operator key may call `method` on `pathname`. `pathname` must
 * be the normalised request path (no query string, no host), see
 * operatorKeys.requestPathname.
 */
export function operatorRouteAllowed(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  return COMPILED.some((route) => route.method === m && route.pattern.test(pathname));
}

/**
 * The path with anything but plain word segments replaced by ":param", for
 * logs: ids, emails and names in a path never reach the log line.
 */
export function routeShape(pathname: string): string {
  return pathname
    .split("/")
    .map((seg) => (seg === "" || /^[a-z][a-z-]{0,39}$/i.test(seg) ? seg : ":param"))
    .join("/");
}
