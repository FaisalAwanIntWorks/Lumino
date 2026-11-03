-- Quote Estimator: per-client option names.
--
-- Each client can now give any option (shape, setting, holder, band, ...) its
-- own display name from Configure -> Options & Pricing. The name lives next to
-- the existing per-client price / image overrides, so three clients can call
-- the same ring three different things while the shared option row, its
-- stable `option_value` slug (what leads, CRM sync and emails key on) and
-- every other client stay untouched. NULL / blank = the default name.
--
-- The option RPCs return COALESCE(custom_name, name) in the existing `name`
-- column, so every form version, the Ring Builder and the editors pick the
-- new name up without a code change to their readers. Return shapes are
-- unchanged. The Sandbox V1 / V3 storage (Lovable-created, not in this
-- migration set) is updated only where it exists.

ALTER TABLE public.client_diamond_step_overrides
  ADD COLUMN IF NOT EXISTS custom_name TEXT;

CREATE OR REPLACE FUNCTION public.get_client_diamond_form_options(client_uuid uuid)
RETURNS TABLE(
  id uuid,
  step_type text,
  option_value text,
  name text,
  price numeric,
  image_url text,
  display_order integer,
  extra_data jsonb,
  is_enabled boolean,
  has_custom_price boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH all_options AS (
    SELECT o.id, 'nature'::text AS step_type, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_nature_options o
    UNION ALL
    SELECT o.id, 'shape'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_shape_options o
    UNION ALL
    SELECT o.id, 'size'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_size_options o
    UNION ALL
    SELECT o.id, 'quality'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_quality_options o
    UNION ALL
    SELECT o.id, 'setting'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM ring_setting_options o
    UNION ALL
    SELECT o.id, 'holder'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_holder_options o
    UNION ALL
    SELECT o.id, 'band'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM band_type_options o
    UNION ALL
    SELECT o.id, 'band_width'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM band_width_options o
    UNION ALL
    SELECT o.id, 'metal'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM ring_metal_options o
    UNION ALL
    SELECT o.id, 'personalization'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM personalization_options o
  )
  SELECT
    ao.id,
    ao.step_type,
    ao.option_value,
    COALESCE(NULLIF(btrim(ov.custom_name), ''), ao.name) AS name,
    COALESCE(ov.custom_price, ao.price) AS price,
    COALESCE(ov.custom_image_url, ao.image_url) AS image_url,
    COALESCE(ov.display_order, ao.display_order) AS display_order,
    '{}'::jsonb AS extra_data,
    COALESCE(ov.is_enabled, true) AS is_enabled,
    (ov.custom_price IS NOT NULL) AS has_custom_price
  FROM all_options ao
  LEFT JOIN client_diamond_step_overrides ov
    ON ov.option_id = ao.id AND ov.step_type = ao.step_type AND ov.client_id = client_uuid
  ORDER BY ao.step_type, COALESCE(ov.display_order, ao.display_order);
$$;

-- Sandbox V1 storage (only where the Lovable-created table exists).
DO $do$
BEGIN
  IF to_regclass('public.sandbox_quote_v1_overrides') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.sandbox_quote_v1_overrides ADD COLUMN IF NOT EXISTS custom_name TEXT';

  EXECUTE $fn$
  CREATE OR REPLACE FUNCTION public.get_sandbox_quote_v1_options(client_uuid uuid)
  RETURNS TABLE(id uuid, step_type text, option_value text, name text, price numeric, image_url text, display_order integer, extra_data jsonb, is_enabled boolean, has_custom_price boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
  WITH all_options AS (
   SELECT o.id,'nature'::text step_type,o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.diamond_nature_options o UNION ALL
   SELECT o.id,'shape',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.diamond_shape_options o UNION ALL
   SELECT o.id,'size',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.diamond_size_options o UNION ALL
   SELECT o.id,'quality',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.diamond_quality_options o UNION ALL
   SELECT o.id,'setting',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.ring_setting_options o UNION ALL
   SELECT o.id,'holder',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.diamond_holder_options o UNION ALL
   SELECT o.id,'band',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.band_type_options o UNION ALL
   SELECT o.id,'band_width',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.band_width_options o UNION ALL
   SELECT o.id,'metal',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.ring_metal_options o UNION ALL
   SELECT o.id,'personalization',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.personalization_options o
  )
  SELECT ao.id,ao.step_type,ao.option_value,coalesce(nullif(btrim(ov.custom_name),''),ao.name),coalesce(ov.custom_price,ao.price),coalesce(ov.custom_image_url,ao.image_url),coalesce(ov.display_order,ao.display_order),'{}'::jsonb,coalesce(ov.is_enabled,true),(ov.custom_price IS NOT NULL)
  FROM all_options ao LEFT JOIN public.sandbox_quote_v1_overrides ov ON ov.option_id=ao.id AND ov.step_type=ao.step_type AND ov.client_id=client_uuid
  WHERE client_uuid='dcd952fc-783b-4a92-be7f-62751265c650'::uuid
  ORDER BY ao.step_type,coalesce(ov.display_order,ao.display_order)
  $body$
  $fn$;
END
$do$;

-- Sandbox V3 storage (only where the Lovable-created table exists). Body
-- mirrors the live definition (incl. the standard V3 quality fallback rows).
DO $do$
BEGIN
  IF to_regclass('public.sandbox_quote_v3_overrides') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.sandbox_quote_v3_overrides ADD COLUMN IF NOT EXISTS custom_name TEXT';

  EXECUTE $fn$
  CREATE OR REPLACE FUNCTION public.get_sandbox_quote_v3_options(client_uuid uuid)
  RETURNS TABLE(id uuid, step_type text, option_value text, name text, price numeric, image_url text, display_order integer, extra_data jsonb, is_enabled boolean, has_custom_price boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
  WITH standard_v3_quality(id, option_value, name, price, image_url, display_order) AS (
    VALUES
      ('d1000000-0000-4000-8000-000000000001'::uuid, 'd-vvs2', 'D Colour, VVS2 Clarity', 0::numeric, NULL::text, 1),
      ('d1000000-0000-4000-8000-000000000002'::uuid, 'd-vs1', 'D Colour, VS1 Clarity', 0::numeric, NULL::text, 2),
      ('d1000000-0000-4000-8000-000000000003'::uuid, 'd-vs2', 'D Colour, VS2 Clarity', 0::numeric, NULL::text, 3),
      ('d1000000-0000-4000-8000-000000000004'::uuid, 'e-vvs1', 'E Colour, VVS1 Clarity', 0::numeric, NULL::text, 5),
      ('d1000000-0000-4000-8000-000000000005'::uuid, 'e-vs1', 'E Colour, VS1 Clarity', 0::numeric, NULL::text, 7),
      ('d1000000-0000-4000-8000-000000000006'::uuid, 'e-vs2', 'E Colour, VS2 Clarity', 0::numeric, NULL::text, 8),
      ('d1000000-0000-4000-8000-000000000007'::uuid, 'f-vvs1', 'F Colour, VVS1 Clarity', 0::numeric, NULL::text, 9),
      ('d1000000-0000-4000-8000-000000000008'::uuid, 'f-vvs2', 'F Colour, VVS2 Clarity', 0::numeric, NULL::text, 10),
      ('d1000000-0000-4000-8000-000000000009'::uuid, 'f-vs1', 'F Colour, VS1 Clarity', 0::numeric, NULL::text, 11),
      ('d1000000-0000-4000-8000-000000000010'::uuid, 'f-vs2', 'F Colour, VS2 Clarity', 0::numeric, NULL::text, 12),
      ('d1000000-0000-4000-8000-000000000011'::uuid, 'g-vvs1', 'G Colour, VVS1 Clarity', 0::numeric, NULL::text, 13),
      ('d1000000-0000-4000-8000-000000000012'::uuid, 'g-vvs2', 'G Colour, VVS2 Clarity', 0::numeric, NULL::text, 14),
      ('d1000000-0000-4000-8000-000000000013'::uuid, 'g-vs1', 'G Colour, VS1 Clarity', 0::numeric, NULL::text, 15),
      ('d1000000-0000-4000-8000-000000000014'::uuid, 'g-vs2', 'G Colour, VS2 Clarity', 0::numeric, NULL::text, 16),
      ('d1000000-0000-4000-8000-000000000015'::uuid, 'h-vvs1', 'H Colour, VVS1 Clarity', 0::numeric, NULL::text, 17),
      ('d1000000-0000-4000-8000-000000000016'::uuid, 'h-vvs2', 'H Colour, VVS2 Clarity', 0::numeric, NULL::text, 18),
      ('d1000000-0000-4000-8000-000000000017'::uuid, 'h-vs1', 'H Colour, VS1 Clarity', 0::numeric, NULL::text, 19),
      ('d1000000-0000-4000-8000-000000000018'::uuid, 'h-vs2', 'H Colour, VS2 Clarity', 0::numeric, NULL::text, 20)
  ),
  all_options AS (
   SELECT o.id,'nature'::text step_type,o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.diamond_nature_options o UNION ALL
   SELECT o.id,'shape',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.diamond_shape_options o UNION ALL
   SELECT o.id,'size',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.diamond_size_options o UNION ALL
   SELECT o.id,'quality',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.diamond_quality_options o UNION ALL
   SELECT q.id,'quality',q.option_value,q.name,q.price,q.image_url,q.display_order FROM standard_v3_quality q
     WHERE NOT EXISTS (SELECT 1 FROM public.diamond_quality_options existing WHERE existing.option_value = q.option_value) UNION ALL
   SELECT o.id,'setting',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.ring_setting_options o UNION ALL
   SELECT o.id,'holder',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.diamond_holder_options o UNION ALL
   SELECT o.id,'band',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.band_type_options o UNION ALL
   SELECT o.id,'band_width',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.band_width_options o UNION ALL
   SELECT o.id,'metal',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.ring_metal_options o UNION ALL
   SELECT o.id,'personalization',o.option_value,o.name,o.price,o.image_url,o.display_order FROM public.personalization_options o
  )
  SELECT ao.id,ao.step_type,ao.option_value,coalesce(nullif(btrim(ov.custom_name),''),ao.name),coalesce(ov.custom_price,ao.price),coalesce(ov.custom_image_url,ao.image_url),coalesce(ov.display_order,ao.display_order),'{}'::jsonb,coalesce(ov.is_enabled,true),(ov.custom_price IS NOT NULL)
  FROM all_options ao
  LEFT JOIN public.sandbox_quote_v3_overrides ov ON ov.option_id=ao.id AND ov.step_type=ao.step_type AND ov.client_id=client_uuid
  WHERE client_uuid='dcd952fc-783b-4a92-be7f-62751265c650'::uuid
  ORDER BY ao.step_type,coalesce(ov.display_order,ao.display_order)
  $body$
  $fn$;
END
$do$;
