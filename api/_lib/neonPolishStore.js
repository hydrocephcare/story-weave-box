import { neon } from "@neondatabase/serverless";

const connectionString = () => process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";

export function getPolishSql() {
  const url = connectionString();
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

/** The database key must match the Cloudflare runtime secret. A row alone is not sufficient. */
export async function hasPolishWriteKey() {
  const key = String(process.env.POLISH_WRITE_KEY || "");
  if (key.length < 24) return false;
  const rows = await getPolishSql().query(
    "SELECT EXISTS (SELECT 1 FROM public.polish_secret WHERE id = 1 AND secret = $1 AND length(secret) >= 24) AS configured",
    [key],
  );
  return rows[0]?.configured === true;
}

export async function verifyPolishWriteKey(value) {
  const key = String(value || "");
  if (key.length < 24) return false;
  const rows = await getPolishSql().query(
    "SELECT EXISTS (SELECT 1 FROM public.polish_secret WHERE id = 1 AND secret = $1 AND length(secret) >= 24) AS allowed",
    [key],
  );
  return rows[0]?.allowed === true;
}
