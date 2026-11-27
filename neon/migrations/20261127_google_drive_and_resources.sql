-- Google Drive OAuth/import storage and downloadable study-resource catalogue.
-- Apply to the Neon database only after the migration branch has passed validation.
CREATE TABLE IF NOT EXISTS public.study_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL CHECK (year BETWEEN 1 AND 6),
  unit text NOT NULL DEFAULT 'General',
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Other Resources',
  file_name text NOT NULL,
  file_path text NOT NULL UNIQUE,
  file_type text,
  file_size bigint,
  download_enabled boolean NOT NULL DEFAULT true,
  keywords text[],
  storage_url text,
  google_drive_file_id text,
  source_modified_at timestamptz,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS study_resources_year_release_idx
  ON public.study_resources (year, download_enabled, published, unit, title);

CREATE INDEX IF NOT EXISTS study_resources_drive_file_idx
  ON public.study_resources (google_drive_file_id)
  WHERE google_drive_file_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.google_drive_connections (
  user_id uuid PRIMARY KEY,
  google_email text,
  refresh_token_enc text NOT NULL,
  access_token_enc text,
  access_token_expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.google_drive_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  redirect_to text NOT NULL DEFAULT 'https://ompathstudy.com',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.google_drive_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  root_folder_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  total_items integer NOT NULL DEFAULT 0,
  completed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  discovered_bytes bigint NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_drive_import_jobs_user_created_idx
  ON public.google_drive_import_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.google_drive_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.google_drive_import_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  google_file_id text NOT NULL,
  parent_google_file_id text,
  name text NOT NULL,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  modified_time timestamptz,
  relative_path text NOT NULL DEFAULT '',
  web_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','imported','failed','skipped')),
  public_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, google_file_id)
);

CREATE INDEX IF NOT EXISTS google_drive_import_items_pending_idx
  ON public.google_drive_import_items (job_id, status, created_at);

ALTER TABLE public.study_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_drive_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_drive_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_drive_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_drive_import_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.study_resources TO anonymous, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.study_resources TO authenticated;

DROP POLICY IF EXISTS "Public can read released study resources" ON public.study_resources;
CREATE POLICY "Public can read released study resources"
  ON public.study_resources FOR SELECT TO anonymous, authenticated
  USING (published = true AND download_enabled = true);

DROP POLICY IF EXISTS "Admins manage study resources" ON public.study_resources;
CREATE POLICY "Admins manage study resources"
  ON public.study_resources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- OAuth tokens, OAuth state and import queues are server-only.
REVOKE ALL ON public.google_drive_connections, public.google_drive_oauth_states,
  public.google_drive_import_jobs, public.google_drive_import_items
  FROM anonymous, authenticated;
