// Lets the original Supabase (Deno) function run unchanged: `serve` records its handler and `Deno.env` reads the Worker's secrets.
let handler = null;
let current = {};
export const serve = (h) => { handler = h; };
globalThis.Deno = { env: { get: (k) => current[k], toObject: () => ({ ...current }) } };
export const run = (req, env) => { current = env; return handler(req); };
