import { eq } from "drizzle-orm";

import { db } from "../db";
import { mentorRegistrations, stakeholderRegistrations } from "../db/schema";
import { AppError } from "../utils/app-error";
import { sendMail } from "../mail/mailer";

// ---------------------------------------------------------------------------
// registerExpert
// ---------------------------------------------------------------------------

/**
 * Registers an expert (mentor) by inserting a row into mentor_registrations.
 *
 * Steps:
 * 1. Check that the email is not already present in mentor_registrations.
 *    Throws a 409 if the email is taken so the caller can surface a clear message.
 * 2. Insert the registration row with status='pending'.
 * 3. Return { ok: true } — the admin team reviews pending rows manually.
 *
 * @param data - Expert registration fields from the validated request body
 * @throws AppError(409, "EXPERT_EMAIL_EXISTS") — if the email is already registered
 */
export async function registerExpert(data: {
  name: string;
  email: string;
  linkedin: string;
  hourlyRate: number;
  expertise: string[];
  methods: string[];
  passion: string;
}): Promise<{ ok: true }> {
  const { name, email, linkedin, hourlyRate, expertise, methods, passion } = data;

  // --- 1. Guard against duplicate email registrations -----------------------
  const existing = await db
    .select({ id: mentorRegistrations.id })
    .from(mentorRegistrations)
    .where(eq(mentorRegistrations.email, email))
    .limit(1);

  if (existing.length > 0) {
    throw new AppError(
      "An expert registration with this email already exists",
      409,
      "EXPERT_EMAIL_EXISTS",
    );
  }

  // --- 2. Insert the pending registration -----------------------------------
  // Wrap in try/catch to handle the race condition where two concurrent requests
  // both pass the SELECT check above before either INSERT completes. The DB unique
  // constraint fires a 23505 (unique_violation) on the second writer — we convert
  // that to a 409 instead of letting it surface as a 500.
  try {
    await db.insert(mentorRegistrations).values({
      name,
      email,
      linkedinUrl: linkedin,
      hourlyRate,
      expertise,
      methods,
      passion,
      status: "pending",
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      throw new AppError("This email is already registered as an expert", 409, "EXPERT_EMAIL_EXISTS");
    }
    throw err;
  }

  // --- 3. Send confirmation email (outside the insert, non-blocking on failure)
  // If the mailer fails the registration is still accepted — the row is committed.
  await sendMail({
    to: email,
    subject: "We've received your SMEEP mentor application",
    template: "mentor-application-received",
    context: { name },
  }).catch((err: unknown) => {
    console.error("[mail] Failed to send mentor application received email:", (err as Error)?.message ?? err);
  });

  // --- 4. Return success indicator ------------------------------------------
  return { ok: true };
}

// ---------------------------------------------------------------------------
// registerOrganisation
// ---------------------------------------------------------------------------

/** Valid organisation types accepted by the registration form. */
const VALID_ORG_TYPES = ["vc", "government", "corporate", "university", "incubator"] as const;

/**
 * Registers an organisation stakeholder by inserting a row into stakeholder_registrations.
 *
 * Steps:
 * 1. Validate the `type` field against the known enum values.
 *    (The Zod DTO already enforces this at the route layer, but we re-check here
 *     as a service-level defence in case the service is called directly in tests
 *     or from other internal callers without going through the HTTP route.)
 * 2. Insert the registration row.
 * 3. Return { ok: true }.
 *
 * @param data - Organisation registration fields from the validated request body
 * @throws AppError(400, "INVALID_TYPE") — if type is not one of the accepted values
 */
export async function registerOrganisation(data: {
  type: string;
  fullName: string;
  title: string;
  email: string;
  country: string;
  website: string;
  phone: string;
  representing: string;
  involvement: string[];
}): Promise<{ ok: true }> {
  const { type, fullName, title, email, country, website, phone, representing, involvement } = data;

  // --- 1. Validate organisation type ----------------------------------------
  if (!(VALID_ORG_TYPES as readonly string[]).includes(type)) {
    throw new AppError(
      `Invalid organisation type '${type}'. Must be one of: ${VALID_ORG_TYPES.join(", ")}`,
      400,
      "INVALID_TYPE",
    );
  }

  // --- 2. Insert the registration --------------------------------------------
  await db.insert(stakeholderRegistrations).values({
    type,
    fullName,
    title,
    email,
    country,
    website,
    phone,
    representing,
    involvement,
  });

  // --- 3. Return success indicator ------------------------------------------
  return { ok: true };
}
