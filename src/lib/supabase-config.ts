// Canonical production backend (the project's own Supabase instance).
// Kept here so every direct REST / edge-function call uses the same host as
// the generated client, regardless of build-time environment variables.
export const SUPABASE_URL = "https://strfwaqvxvkhjbqrwmla.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";
export const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
