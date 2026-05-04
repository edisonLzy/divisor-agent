import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../domain/sessions/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const client = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
});

export const db = drizzle(client, { schema });
