// The database client for the maintenance scripts. After the admin-only lock (20261012120000_lock_content_writes_to_admin.sql) the public key
// can only read published notes, so writing needs the service key. Set it for one run only, never commit it:
//   PowerShell:  $env:SUPABASE_SERVICE_ROLE_KEY="<key>"; node scripts/maintenance/clean-articles.mjs --apply
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
export const usingServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
export const sb = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
