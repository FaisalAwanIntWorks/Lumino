ALTER TABLE public.client_dtt_form_config DROP CONSTRAINT client_dtt_form_config_live_version_check;
ALTER TABLE public.client_dtt_form_config ADD CONSTRAINT client_dtt_form_config_live_version_check CHECK (live_version IN ('v1','v2','v3'));
ALTER TABLE public.diamond_form_leads DROP CONSTRAINT diamond_form_leads_quote_version_check;
ALTER TABLE public.diamond_form_leads ADD CONSTRAINT diamond_form_leads_quote_version_check CHECK (quote_version IN ('v1','v2','v3'));
CREATE TABLE public.sandbox_quote_v3_config (LIKE public.client_dtt_form_config INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE public.sandbox_quote_v3_config ADD CONSTRAINT sandbox_quote_v3_config_pk PRIMARY KEY (id);
ALTER TABLE public.sandbox_quote_v3_config ADD CONSTRAINT sandbox_quote_v3_config_client_unique UNIQUE (client_id);
ALTER TABLE public.sandbox_quote_v3_config ADD CONSTRAINT sandbox_quote_v3_config_client_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.sandbox_quote_v3_config ADD CONSTRAINT sandbox_quote_v3_only CHECK (client_id = 'dcd952fc-783b-4a92-be7f-62751265c650'::uuid);
GRANT SELECT ON public.sandbox_quote_v3_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sandbox_quote_v3_config TO authenticated;
GRANT ALL ON public.sandbox_quote_v3_config TO service_role;
ALTER TABLE public.sandbox_quote_v3_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads sandbox V3 form" ON public.sandbox_quote_v3_config FOR SELECT TO anon, authenticated USING (client_id = 'dcd952fc-783b-4a92-be7f-62751265c650'::uuid);
CREATE POLICY "Sandbox editors manage V3 form" ON public.sandbox_quote_v3_config FOR ALL TO authenticated USING (public.admin_write_allowed() AND (public.has_role(auth.uid(), 'agency_admin'::public.app_role) OR client_id = public.get_user_client_id(auth.uid()) OR public.is_staff_of_client(auth.uid(), client_id))) WITH CHECK (public.admin_write_allowed() AND (public.has_role(auth.uid(), 'agency_admin'::public.app_role) OR client_id = public.get_user_client_id(auth.uid()) OR public.is_staff_of_client(auth.uid(), client_id)));
CREATE TABLE public.sandbox_quote_v3_overrides (LIKE public.client_diamond_step_overrides INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE public.sandbox_quote_v3_overrides ADD CONSTRAINT sandbox_quote_v3_overrides_pk PRIMARY KEY (id);
ALTER TABLE public.sandbox_quote_v3_overrides ADD CONSTRAINT sandbox_quote_v3_override_unique UNIQUE (client_id, step_type, option_id);
ALTER TABLE public.sandbox_quote_v3_overrides ADD CONSTRAINT sandbox_quote_v3_override_client_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.sandbox_quote_v3_overrides ADD CONSTRAINT sandbox_quote_v3_overrides_only CHECK (client_id = 'dcd952fc-783b-4a92-be7f-62751265c650'::uuid);
GRANT SELECT ON public.sandbox_quote_v3_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sandbox_quote_v3_overrides TO authenticated;
GRANT ALL ON public.sandbox_quote_v3_overrides TO service_role;
ALTER TABLE public.sandbox_quote_v3_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads sandbox V3 options" ON public.sandbox_quote_v3_overrides FOR SELECT TO anon, authenticated USING (client_id = 'dcd952fc-783b-4a92-be7f-62751265c650'::uuid);
CREATE POLICY "Sandbox editors manage V3 options" ON public.sandbox_quote_v3_overrides FOR ALL TO authenticated USING (public.admin_write_allowed() AND (public.has_role(auth.uid(), 'agency_admin'::public.app_role) OR client_id = public.get_user_client_id(auth.uid()) OR public.is_staff_of_client(auth.uid(), client_id))) WITH CHECK (public.admin_write_allowed() AND (public.has_role(auth.uid(), 'agency_admin'::public.app_role) OR client_id = public.get_user_client_id(auth.uid()) OR public.is_staff_of_client(auth.uid(), client_id)));
INSERT INTO public.sandbox_quote_v3_config (client_id,form_colors,enabled_steps,step_order,submission_mode,deposit_amount,onboarding_completed,welcome_title,welcome_subtitle,form_content,enable_lead_quality_scoring,block_disposable_email,dedupe_window_minutes) SELECT client_id,form_colors,enabled_steps,step_order,submission_mode,deposit_amount,onboarding_completed,welcome_title,welcome_subtitle,form_content,enable_lead_quality_scoring,block_disposable_email,dedupe_window_minutes FROM public.client_dtt_form_config WHERE client_id='dcd952fc-783b-4a92-be7f-62751265c650'::uuid;
INSERT INTO public.sandbox_quote_v3_overrides (client_id,step_type,option_id,is_enabled,custom_price,custom_image_url,display_order) SELECT client_id,step_type,option_id,is_enabled,custom_price,custom_image_url,display_order FROM public.client_diamond_step_overrides WHERE client_id='dcd952fc-783b-4a92-be7f-62751265c650'::uuid;
CREATE FUNCTION public.get_sandbox_quote_v3_options(client_uuid uuid) RETURNS TABLE(id uuid, step_type text, option_value text, name text, price numeric, image_url text, display_order integer, extra_data jsonb, is_enabled boolean, has_custom_price boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
SELECT ao.id,ao.step_type,ao.option_value,ao.name,coalesce(ov.custom_price,ao.price),coalesce(ov.custom_image_url,ao.image_url),coalesce(ov.display_order,ao.display_order),'{}'::jsonb,coalesce(ov.is_enabled,true),(ov.custom_price IS NOT NULL)
FROM all_options ao LEFT JOIN public.sandbox_quote_v3_overrides ov ON ov.option_id=ao.id AND ov.step_type=ao.step_type AND ov.client_id=client_uuid
WHERE client_uuid='dcd952fc-783b-4a92-be7f-62751265c650'::uuid
ORDER BY ao.step_type,coalesce(ov.display_order,ao.display_order)
$$;
GRANT EXECUTE ON FUNCTION public.get_sandbox_quote_v3_options(uuid) TO anon, authenticated, service_role;