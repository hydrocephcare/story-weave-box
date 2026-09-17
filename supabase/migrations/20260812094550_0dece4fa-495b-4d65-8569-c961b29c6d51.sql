-- =========================================================
-- PHASE A: canonical academic structure
-- =========================================================
CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_number int NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  display_order int NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.academic_years TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.academic_years TO authenticated;
GRANT ALL ON public.academic_years TO service_role;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "years public read" ON public.academic_years FOR SELECT USING (published OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "years admin write" ON public.academic_years FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  semester_number int NOT NULL,
  title text NOT NULL,
  description text,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id, semester_number)
);
GRANT SELECT ON public.semesters TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.semesters TO authenticated;
GRANT ALL ON public.semesters TO service_role;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "semesters public read" ON public.semesters FOR SELECT USING (true);
CREATE POLICY "semesters admin write" ON public.semesters FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  semester_id uuid REFERENCES public.semesters(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  short_name text,
  course_code text,
  description text,
  learning_objectives text,
  exam_information text,
  legacy_category text,
  display_order int NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  icon text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id, slug)
);
GRANT SELECT ON public.units TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units public read" ON public.units FOR SELECT USING (published OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "units admin write" ON public.units FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_units_year ON public.units(academic_year_id, display_order);
CREATE INDEX idx_units_legacy_category ON public.units(legacy_category);

CREATE TABLE public.syllabus_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  parent_topic_id uuid REFERENCES public.syllabus_topics(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text,
  description text,
  learning_objectives text,
  display_order int NOT NULL DEFAULT 0,
  importance text NOT NULL DEFAULT 'core',
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.syllabus_topics TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.syllabus_topics TO authenticated;
GRANT ALL ON public.syllabus_topics TO service_role;
ALTER TABLE public.syllabus_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topics public read" ON public.syllabus_topics FOR SELECT USING (published OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "topics admin write" ON public.syllabus_topics FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_topics_unit ON public.syllabus_topics(unit_id, display_order);

CREATE TABLE public.resource_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  topic_id uuid NOT NULL REFERENCES public.syllabus_topics(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'primary',
  relevance_score numeric NOT NULL DEFAULT 0.5,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_type, resource_id, topic_id, relationship_type)
);
GRANT SELECT ON public.resource_topics TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.resource_topics TO authenticated;
GRANT ALL ON public.resource_topics TO service_role;
ALTER TABLE public.resource_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource topics public read" ON public.resource_topics FOR SELECT USING (true);
CREATE POLICY "resource topics admin write" ON public.resource_topics FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_resource_topics_resource ON public.resource_topics(resource_type, resource_id);
CREATE INDEX idx_resource_topics_topic ON public.resource_topics(topic_id);

-- link existing resources to canonical units (additive, nullable)
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;
ALTER TABLE public.mcq_sets ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;
ALTER TABLE public.flashcard_sets ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS semester_number int;
ALTER TABLE public.mcq_sets ADD COLUMN IF NOT EXISTS semester_number int;

-- =========================================================
-- PHASE 9: content quality / verification (additive)
-- =========================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['articles','mcq_sets','flashcard_sets'] LOOP
    EXECUTE format('ALTER TABLE public.%I
      ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT ''imported'',
      ADD COLUMN IF NOT EXISTS completeness_status text NOT NULL DEFAULT ''unknown'',
      ADD COLUMN IF NOT EXISTS reviewed_by uuid,
      ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
      ADD COLUMN IF NOT EXISTS source_type text,
      ADD COLUMN IF NOT EXISTS source_reference text,
      ADD COLUMN IF NOT EXISTS confidence_score numeric,
      ADD COLUMN IF NOT EXISTS contains_answer_key boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS answer_key_verified boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS content_type text', t);
  END LOOP;
END $$;

-- =========================================================
-- PHASE B: private student progress
-- =========================================================
CREATE TABLE public.user_resource_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  progress_percent int NOT NULL DEFAULT 0,
  last_position text,
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_type, resource_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_resource_progress TO authenticated;
GRANT ALL ON public.user_resource_progress TO service_role;
ALTER TABLE public.user_resource_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own progress" ON public.user_resource_progress FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_urp_user ON public.user_resource_progress(user_id, last_opened_at DESC);

CREATE TABLE public.user_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  collection_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_type, resource_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_bookmarks TO authenticated;
GRANT ALL ON public.user_bookmarks TO service_role;
ALTER TABLE public.user_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bookmarks" ON public.user_bookmarks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_bookmarks_user ON public.user_bookmarks(user_id, created_at DESC);

CREATE TABLE public.user_topic_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.syllabus_topics(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started',
  confidence_level int NOT NULL DEFAULT 0,
  correct_answers int NOT NULL DEFAULT 0,
  attempted_questions int NOT NULL DEFAULT 0,
  last_studied_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, topic_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_topic_progress TO authenticated;
GRANT ALL ON public.user_topic_progress TO service_role;
ALTER TABLE public.user_topic_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own topic progress" ON public.user_topic_progress FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_study_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  resource_type text,
  resource_id uuid,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES public.syllabus_topics(id) ON DELETE SET NULL,
  duration_seconds int NOT NULL DEFAULT 0,
  score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.user_study_activity TO authenticated;
GRANT ALL ON public.user_study_activity TO service_role;
ALTER TABLE public.user_study_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activity read" ON public.user_study_activity FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own activity insert" ON public.user_study_activity FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_activity_user ON public.user_study_activity(user_id, created_at DESC);

-- =========================================================
-- PHASE 12: exam attempts
-- =========================================================
CREATE TABLE public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  score numeric,
  maximum_score numeric,
  percentage numeric,
  duration_seconds int,
  completed boolean NOT NULL DEFAULT false,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  topic_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.exam_attempts TO authenticated;
GRANT ALL ON public.exam_attempts TO service_role;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts" ON public.exam_attempts FOR ALL TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_attempts_user ON public.exam_attempts(user_id, created_at DESC);

-- =========================================================
-- PHASE 11: revision planner
-- =========================================================
CREATE TABLE public.revision_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  unit_ids uuid[] NOT NULL DEFAULT '{}',
  exam_date date,
  study_days int,
  daily_minutes int,
  rest_days int[] NOT NULL DEFAULT '{}',
  confidence_level int,
  activity_types text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revision_plans TO authenticated;
GRANT ALL ON public.revision_plans TO service_role;
ALTER TABLE public.revision_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plans" ON public.revision_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.revision_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.revision_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES public.syllabus_topics(id) ON DELETE SET NULL,
  resource_type text,
  resource_id uuid,
  resource_title text,
  activity text NOT NULL DEFAULT 'read',
  estimated_minutes int NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'pending',
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revision_plan_items TO authenticated;
GRANT ALL ON public.revision_plan_items TO service_role;
ALTER TABLE public.revision_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plan items" ON public.revision_plan_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_plan_items_plan ON public.revision_plan_items(plan_id, scheduled_date, display_order);

-- =========================================================
-- PHASE 6/7: search aliases, medical concepts
-- =========================================================
CREATE TABLE public.search_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_term text NOT NULL,
  alias text NOT NULL,
  topic_id uuid REFERENCES public.syllabus_topics(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  priority int NOT NULL DEFAULT 0,
  approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias, canonical_term)
);
GRANT SELECT ON public.search_aliases TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.search_aliases TO authenticated;
GRANT ALL ON public.search_aliases TO service_role;
ALTER TABLE public.search_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aliases public read" ON public.search_aliases FOR SELECT USING (approved OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "aliases admin write" ON public.search_aliases FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_aliases_alias ON public.search_aliases(lower(alias));

CREATE TABLE public.medical_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_term text NOT NULL UNIQUE,
  definition text,
  preferred_article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  preferred_topic_id uuid REFERENCES public.syllabus_topics(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  importance int NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  approved boolean NOT NULL DEFAULT false,
  click_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medical_concepts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.medical_concepts TO authenticated;
GRANT ALL ON public.medical_concepts TO service_role;
ALTER TABLE public.medical_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concepts public read" ON public.medical_concepts FOR SELECT USING (approved OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "concepts admin write" ON public.medical_concepts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.medical_concept_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.medical_concepts(id) ON DELETE CASCADE,
  alias text NOT NULL,
  abbreviation boolean NOT NULL DEFAULT false,
  spelling_variant boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, alias)
);
GRANT SELECT ON public.medical_concept_aliases TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.medical_concept_aliases TO authenticated;
GRANT ALL ON public.medical_concept_aliases TO service_role;
ALTER TABLE public.medical_concept_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concept aliases public read" ON public.medical_concept_aliases FOR SELECT USING (approved OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "concept aliases admin write" ON public.medical_concept_aliases FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.concept_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_concept_id uuid NOT NULL REFERENCES public.medical_concepts(id) ON DELETE CASCADE,
  target_concept_id uuid NOT NULL REFERENCES public.medical_concepts(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'related',
  relevance_score numeric NOT NULL DEFAULT 0.5,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_concept_id, target_concept_id, relationship_type)
);
GRANT SELECT ON public.concept_relationships TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.concept_relationships TO authenticated;
GRANT ALL ON public.concept_relationships TO service_role;
ALTER TABLE public.concept_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concept rel public read" ON public.concept_relationships FOR SELECT USING (approved OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "concept rel admin write" ON public.concept_relationships FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.concept_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid REFERENCES public.medical_concepts(id) ON DELETE CASCADE,
  from_resource_type text,
  from_resource_id uuid,
  to_article_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.concept_link_clicks TO anon, authenticated;
GRANT SELECT ON public.concept_link_clicks TO authenticated;
GRANT ALL ON public.concept_link_clicks TO service_role;
ALTER TABLE public.concept_link_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clicks insert" ON public.concept_link_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "clicks admin read" ON public.concept_link_clicks FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.search_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  normalized_query text,
  results_count int NOT NULL DEFAULT 0,
  clicked_resource_type text,
  clicked_resource_id uuid,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.search_queries TO anon, authenticated;
GRANT SELECT ON public.search_queries TO authenticated;
GRANT ALL ON public.search_queries TO service_role;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "search log insert" ON public.search_queries FOR INSERT WITH CHECK (true);
CREATE POLICY "search log admin read" ON public.search_queries FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_search_queries_created ON public.search_queries(created_at DESC);

-- =========================================================
-- PHASE 10: reports and helpfulness voting
-- =========================================================
CREATE TABLE public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  resource_url text,
  section_anchor text,
  selected_text text,
  report_type text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'open',
  assigned_admin_id uuid,
  resolution_notes text,
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT INSERT ON public.content_reports TO anon, authenticated;
GRANT SELECT, UPDATE ON public.content_reports TO authenticated;
GRANT ALL ON public.content_reports TO service_role;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports insert" ON public.content_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "reports read" ON public.content_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR auth.uid() = user_id);
CREATE POLICY "reports admin update" ON public.content_reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_reports_status ON public.content_reports(status, created_at DESC);

CREATE TABLE public.resource_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  vote text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.resource_feedback TO anon, authenticated;
GRANT SELECT ON public.resource_feedback TO authenticated;
GRANT ALL ON public.resource_feedback TO service_role;
ALTER TABLE public.resource_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback insert" ON public.resource_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "feedback admin read" ON public.resource_feedback FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_feedback_resource ON public.resource_feedback(resource_type, resource_id);

-- =========================================================
-- PHASE 19: indexes on existing content tables
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_articles_pub_created ON public.articles(published, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_articles_unit ON public.articles(unit_id);
CREATE INDEX IF NOT EXISTS idx_articles_content_type ON public.articles(content_type);
CREATE INDEX IF NOT EXISTS idx_articles_exam_year ON public.articles(exam_year);
CREATE INDEX IF NOT EXISTS idx_articles_updated ON public.articles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcq_pub_created ON public.mcq_sets(published, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mcq_unit ON public.mcq_sets(unit_id);
CREATE INDEX IF NOT EXISTS idx_flash_pub_created ON public.flashcard_sets(published, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flash_unit ON public.flashcard_sets(unit_id);

-- updated_at triggers for new tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_years','semesters','units','syllabus_topics','user_resource_progress',
                           'user_topic_progress','revision_plans','revision_plan_items','search_aliases',
                           'medical_concepts'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;