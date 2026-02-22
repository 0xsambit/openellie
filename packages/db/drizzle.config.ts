import { defineConfig } from "drizzle-kit";

// DATABASE_URL is required for migrate/push but not for generate (schema-only).
// Use a placeholder to allow `db:generate` to run without a live database.
const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/openellie";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
