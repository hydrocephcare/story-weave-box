-- Reassert the server-only publication boundary. Browser sessions may generate through
-- the authenticated Supabase AI gateway, but only the trusted Vercel/Neon backend persists.
CREATE OR REPLACE FUNCTION public.save_topic_deep(
  p_slug text, p_name text, p_category text, p_base jsonb, p_deep jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  existing public.topic_pages%rowtype;
  old_deep jsonb;
BEGIN
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slug');
  END IF;
  IF p_deep IS NULL OR jsonb_typeof(p_deep) <> 'object' OR pg_column_size(p_deep) > 90000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'size');
  END IF;
  IF coalesce(p_deep->>'checked', 'false') <> 'true' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'review');
  END IF;
  IF coalesce(jsonb_typeof(p_deep->'sections'), '') <> 'array'
     OR coalesce(jsonb_typeof(p_deep->'vivas'), '') <> 'array'
     OR coalesce(jsonb_typeof(p_deep->'mcqs'), '') <> 'array'
     OR coalesce(jsonb_typeof(p_deep->'cases'), '') <> 'array'
     OR coalesce(jsonb_typeof(p_deep->'facts'), '') <> 'array'
     OR coalesce(jsonb_typeof(p_deep->'mistakes'), '') <> 'array'
     OR coalesce(jsonb_typeof(p_deep->'exam'), '') <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'shape');
  END IF;
  IF jsonb_array_length(p_deep->'sections') < 7 OR jsonb_array_length(p_deep->'sections') > 14
     OR jsonb_array_length(p_deep->'vivas') < 12 OR jsonb_array_length(p_deep->'vivas') > 40
     OR jsonb_array_length(p_deep->'mcqs') < 6 OR jsonb_array_length(p_deep->'mcqs') > 24
     OR jsonb_array_length(p_deep->'cases') < 2 OR jsonb_array_length(p_deep->'cases') > 10
     OR jsonb_array_length(p_deep->'facts') < 6 OR jsonb_array_length(p_deep->'facts') > 30
     OR jsonb_array_length(p_deep->'mistakes') < 5 OR jsonb_array_length(p_deep->'mistakes') > 30
     OR jsonb_array_length(p_deep->'exam') < 12 OR jsonb_array_length(p_deep->'exam') > 14 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'shape');
  END IF;
  IF p_deep::text ~* '(https?:|www\\.|<[a-z/!]|javascript:|onerror\\s*=|data:text)' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsafe');
  END IF;

  SELECT * INTO existing
  FROM public.topic_pages
  WHERE slug = p_slug AND status = 'published'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing');
  END IF;

  old_deep := existing.content->'deep';
  IF coalesce(old_deep->>'checked', 'false') = 'true'
     AND coalesce(jsonb_typeof(old_deep->'sections'), '') = 'array'
     AND coalesce(jsonb_typeof(old_deep->'vivas'), '') = 'array'
     AND coalesce(jsonb_typeof(old_deep->'mcqs'), '') = 'array'
     AND coalesce(jsonb_typeof(old_deep->'cases'), '') = 'array'
     AND coalesce(jsonb_typeof(old_deep->'facts'), '') = 'array'
     AND coalesce(jsonb_typeof(old_deep->'mistakes'), '') = 'array'
     AND coalesce(jsonb_typeof(old_deep->'exam'), '') = 'array' THEN
    IF jsonb_array_length(old_deep->'sections') >= 7
       AND jsonb_array_length(old_deep->'vivas') >= 12
       AND jsonb_array_length(old_deep->'mcqs') >= 6
       AND jsonb_array_length(old_deep->'cases') >= 2
       AND jsonb_array_length(old_deep->'facts') >= 6
       AND jsonb_array_length(old_deep->'mistakes') >= 5
       AND jsonb_array_length(old_deep->'exam') >= 12 THEN
      RETURN jsonb_build_object('ok', true, 'existing', true);
    END IF;
  END IF;

  UPDATE public.topic_pages
  SET content = (existing.content - 'deep') || jsonb_build_object('deep', p_deep),
      updated_at = now()
  WHERE slug = p_slug AND status = 'published';
  RETURN jsonb_build_object('ok', true, 'saved', true);
END;
$function$;

-- Never allow a browser JWT to invoke server publication functions directly.
REVOKE ALL ON FUNCTION public.publish_topic_page(text, text, text, jsonb, text)
  FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION public.publish_topic_page_system(text, text, text, jsonb, text)
  FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION public.save_topic_deep(text, text, text, jsonb, jsonb)
  FROM PUBLIC, anonymous, authenticated;

GRANT EXECUTE ON FUNCTION public.publish_topic_page(text, text, text, jsonb, text)
  TO service_role, neondb_owner;
GRANT EXECUTE ON FUNCTION public.publish_topic_page_system(text, text, text, jsonb, text)
  TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.save_topic_deep(text, text, text, jsonb, jsonb)
  TO service_role, neondb_owner;
