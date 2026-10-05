import { supabase } from "@/integrations/supabase/client";

/**
 * Book and library file lists are for verified MKU students, so they are not public files.
 * The server (api/student-data.js) checks the signed-in account before it returns them.
 * While developing on your own computer the plain files are used instead.
 */
export async function fetchProtected<T>(file: string): Promise<T> {
  if (import.meta.env.DEV) {
    const r = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
    if (!r.ok) throw new Error(String(r.status));
    return r.json() as Promise<T>;
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("401");
  const r = await fetch(`/api/student-data?file=${encodeURIComponent(file)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<T>;
}
