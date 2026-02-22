import { customType } from "drizzle-orm/pg-core";
import { EMBEDDING } from "@openellie/shared/constants";

/**
 * Custom Drizzle type for pgvector `vector(n)` columns.
 * The data is stored as a float array in JS and as a pgvector in Postgres.
 *
 * @param name - Column name.
 * @param dimensions - Vector dimensions. Must match the embedding model output.
 */
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? EMBEDDING.DIMENSIONS})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns strings like "[0.1,0.2,...]"
    return value
      .slice(1, -1)
      .split(",")
      .map((s) => parseFloat(s));
  },
});

/**
 * Creates a standard 1536-dimension vector column.
 *
 * @param name - Column name.
 */
export function embeddingVector(name: string) {
  return vector(name, { dimensions: EMBEDDING.DIMENSIONS }).notNull();
}
