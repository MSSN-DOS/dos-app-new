import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

let client: postgres.Sql | undefined;

export function getDbClient(): postgres.Sql {
  if (client) return client;

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local — see README.md for required variables.",
    );
  }

  client = postgres(databaseUrl, {
    prepare: false,
    onnotice: () => {},
  });

  return client;
}

export function getDb() {
  return drizzle(getDbClient());
}

export type Db = ReturnType<typeof getDb>;
