-- Deep notes may enrich an existing published topic only. They cannot create a topic
-- from caller-supplied base content. The server generates and checks the deep notes,
-- then persists them using its privileged Neon database connection.
CREATE OR REPLACE FUNCTION public.save_topic_deep(
  p_slug text, p_name text, p_category text, p_base jsonb, p_deep jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  existing public.topic_pages%rowtype;
BEGIN
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slug');
  END IF;
  IF p_deep IS NULL OR jsonb_typeof(p_deep) <> 'object' OR pg_column_size(p_deep) > 90000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'size');
  END IF;
  IF jsonb_typeof(p_deep->'sections') <> 'array' OR jsonb_typeof(p_deep->'exam') <> 'array'
     OR jsonb_array_length(p_deep->'sections') < 4 OR jsonb_array_length(p_deep->'sections') > 14
     OR jsonb_array_length(p_deep->'exam') < 6 OR jsonb_array_length(p_deep->'exam') > 14 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'shape');
  END IF;
  IF p_deep::text ~* '(https?:|www\.|<[a-z/!]|javascript:|onerror\s*=|data:text)' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsafe');
  END IF;

  SELECT * INTO existing FROM public.topic_pages
  WHERE slug = p_slug AND status = 'published' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing');
  END IF;
  IF existing.content ? 'deep' AND (existing.content->'deep') ? 'vivas' THEN
    RETURN jsonb_build_object('ok', true, 'existing', true);
  END IF;

  UPDATE public.topic_pages
  SET content = (existing.content - 'deep') || jsonb_build_object('deep', p_deep), updated_at = now()
  WHERE slug = p_slug AND status = 'published';
  RETURN jsonb_build_object('ok', true, 'saved', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_topic_page(text, text, text, jsonb, text)
  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.save_topic_deep(text, text, text, jsonb, jsonb)
  FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_topic_page(text, text, text, jsonb, text) TO service_role;
DO $
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.publish_topic_page(text, text, text, jsonb, text) TO neondb_owner';
  END IF;
END
$;
GRANT EXECUTE ON FUNCTION public.save_topic_deep(text, text, text, jsonb, jsonb) TO service_role;
DO $
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_topic_deep(text, text, text, jsonb, jsonb) TO neondb_owner';
  END IF;
END
$;
