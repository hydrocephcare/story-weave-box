// Canonical production backend (the project's own Supabase instance).
// Kept here so every direct REST / edge-function call uses the same host as
// the generated client, regardless of build-time environment variables.
export const SUPABASE_URL = "https://dekyjrfwvavtoivqivno.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL";
export const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
