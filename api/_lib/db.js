import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Database connection string not found.");
}

export const sql = neon(connectionString);