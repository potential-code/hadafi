import { db } from "../index";
import { offers } from "../schema";
import { sql } from "drizzle-orm";
import cardsJson from "./seed-data/offer-cards.json";

// ── Types ────────────────────────────────────────────────────────────────────

interface CardMeta {
  offer_category: string;
  offerprice: string;
  prod_id: string;
  redirecturl: string;
  couponoffer: string;
}

interface CardItem {
  post_id: number;
  title: string;
  slug: string;
  status: string;
  featured_image_url: string | null;
  extra_image_url: string | null;
  meta: CardMeta;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCategory(raw: string): string {
  const cleaned = raw
    .replace(/\bfeatured\b/gi, "")
    .replace(/,+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (cleaned.includes("webservices") || cleaned === "it") return "IT";
  if (cleaned === "ai") return "AI";
  if (cleaned === "marketing") return "Marketing";
  if (cleaned === "finance") return "Finance";
  if (cleaned === "pr") return "PR";
  if (cleaned === "ecommerce") return "Ecommerce";
  if (cleaned === "training") return "Training";
  return "Other";
}

function parseOfferPrice(html: string): { priceBefore: string | null; priceLabel: string } {
  const beforeMatch = html.match(/<span[^>]*line-through[^>]*>(.*?)<\/span>/i);
  const priceBefore = beforeMatch ? beforeMatch[1].trim() : null;

  const stripped = html
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let priceLabel = stripped;
  if (priceBefore && stripped.startsWith(priceBefore)) {
    priceLabel = stripped.slice(priceBefore.length).trim();
  }

  return { priceBefore, priceLabel };
}

function localImageUrl(externalUrl: string | null): string | null {
  if (!externalUrl) return null;
  const filename = externalUrl.split("/").pop();
  return filename ? `/images/offers/${filename}` : null;
}

// ── Main seed function ────────────────────────────────────────────────────────

export async function seedOffers(): Promise<void> {
  console.log("[seed-offers] Starting WP offers seed...");

  const items = (cardsJson as { cpt: { items: CardItem[] } }).cpt.items;
  console.log(`[seed-offers] Processing ${items.length} offer items...`);

  let inserted = 0;

  for (const item of items) {
    const parsed = parseOfferPrice(item.meta.offerprice ?? "");
    const couponRaw = (item.meta.couponoffer ?? "").trim();
    const pointsCost = couponRaw === "" ? 0 : (parseInt(couponRaw, 10) || 0);

    const row = {
      title: item.title,
      slug: item.slug,
      category: normalizeCategory(item.meta.offer_category ?? ""),
      priceLabel: parsed.priceLabel || "Contact for pricing",
      priceBefore: parsed.priceBefore,
      price: 0,
      pointsCost,
      imageUrl: localImageUrl(item.extra_image_url),
      status: item.status === "publish" ? "published" : "draft",
    } satisfies typeof offers.$inferInsert;

    await db
      .insert(offers)
      .values(row)
      .onConflictDoUpdate({
        target: offers.slug,
        set: {
          priceLabel: sql`EXCLUDED.price_label`,
          priceBefore: sql`EXCLUDED.price_before`,
        },
      });

    console.log(`[seed-offers]   Upserted: ${item.title}`);
    inserted++;
  }

  console.log(`\n[seed-offers] Complete — upserted: ${inserted}`);
}
