import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const offers = pgTable("offers", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").unique().notNull(),
  category: text("category").notNull(), // AI | Marketing | IT | Finance | PR | Ecommerce | Training
  priceLabel: text("price_label").notNull(), // display string: "Free", "$25/month", "Starting from $99"
  priceBefore: text("price_before"), // original/was price for strikethrough display (nullable), e.g. "$50"
  price: integer("price").notNull().default(0), // USD cents (2500 = $25.00); 0 = free
  pointsCost: integer("points_cost").notNull().default(0),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("published"), // 'published' | 'draft'
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export type Offer = typeof offers.$inferSelect;
export type InsertOffer = typeof offers.$inferInsert;
