import { db } from "../index";
import { users, mentorRegistrations } from "../schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import cardsJson from "./seed-data/mentor-cards.json";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExpertCardMeta {
  expert_track: string;
  expert_category: string;
  linkedinurl: string;
  overview_txt: string;
  ap_shortcode: string;
  zoomurl: string;
}

interface ExpertCardItem {
  post_id: number;
  title: string;
  slug: string;
  status: string;
  content: string;
  featured_image_url: string | null;
  extra_image_url: string | null;
  meta: ExpertCardMeta;
}

// ── Email override table ──────────────────────────────────────────────────────

const EMAIL_OVERRIDES: Record<string, string> = {
  "ghinwa.abi.zeid": "ghinwa.abizeid@smeep.potential.org",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function emailFromSlug(slug: string): string {
  const localPart = slug.replace(/-/g, ".");
  if (EMAIL_OVERRIDES[localPart]) {
    return EMAIL_OVERRIDES[localPart];
  }
  return `${localPart}@smeep.potential.org`;
}

function normalizeLinkedin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function parseExpertise(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function localAvatarUrl(externalUrl: string | null): string | null {
  if (!externalUrl) return null;
  const filename = externalUrl.split("/").pop();
  return filename ? `/images/mentors/${filename}` : null;
}

// ── Main seed function ────────────────────────────────────────────────────────

export async function seedMentors(): Promise<void> {
  console.log("[seed-mentors] Starting human mentors seed...");

  const allItems = (cardsJson as { cpt: { items: ExpertCardItem[] } }).cpt.items;
  const published = allItems.filter((item) => item.status === "publish");

  console.log(
    `[seed-mentors] Found ${allItems.length} total items, ${published.length} published — seeding published only.`,
  );

  let usersInserted = 0;
  let registrationsInserted = 0;

  for (const card of published) {
    const email = emailFromSlug(card.slug);
    const bio = card.meta.overview_txt.trim() || null;
    const expertise = parseExpertise(card.meta.expert_category ?? "");
    const linkedinUrl = normalizeLinkedin(card.meta.linkedinurl ?? "");
    const avatarUrl = localAvatarUrl(card.extra_image_url);

    // Mentors log in via OTP — password hash is required by schema but never used directly.
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), 12);

    await db
      .insert(users)
      .values({
        fullName: card.title,
        email,
        passwordHash,
        role: "mentor",
        bio: bio ?? undefined,
        avatarUrl: avatarUrl ?? undefined,
      })
      .onConflictDoNothing();

    const [userRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!userRow) {
      console.error(
        `[seed-mentors]   ERROR: Could not find user row for ${email} after insert — skipping registration.`,
      );
      continue;
    }

    usersInserted++;
    console.log(`[seed-mentors]   User: ${card.title} <${email}>`);

    await db
      .insert(mentorRegistrations)
      .values({
        name: card.title,
        email,
        linkedinUrl,
        expertise: expertise.length > 0 ? expertise : null,
        status: "approved",
        userId: userRow.id,
        hourlyRate: null,
        methods: null,
        passion: null,
      })
      .onConflictDoNothing();

    registrationsInserted++;
    console.log(
      `[seed-mentors]     Registration: ${expertise.join(", ") || "(no expertise)"} | LinkedIn: ${linkedinUrl ?? "none"}`,
    );
  }

  console.log(
    `\n[seed-mentors] Complete — users processed: ${usersInserted}, registrations processed: ${registrationsInserted} (of ${published.length} published cards).`,
  );
}
