import { defineConfig } from "drizzle-kit";

// DATABASE_URL is only required for db:push / db:migrate (live DB commands).
// db:generate only reads the schema and produces SQL — no connection needed.
export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost/placeholder",
  },
});
