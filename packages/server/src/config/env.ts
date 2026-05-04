export function getPort(): number {
  return Number(process.env.PORT) || 3000;
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return url;
}
