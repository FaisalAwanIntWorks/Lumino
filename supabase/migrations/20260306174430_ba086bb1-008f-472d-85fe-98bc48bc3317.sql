ALTER TABLE public.design_requests DROP CONSTRAINT design_requests_request_type_check;
ALTER TABLE public.design_requests ADD CONSTRAINT design_requests_request_type_check CHECK (request_type = ANY (ARRAY['new_design'::text, 'modification'::text, 'custom_engraving'::text, 'ring_builder'::text]));

ALTER TABLE public.design_requests DROP CONSTRAINT design_requests_status_check;
ALTER TABLE public.design_requests ADD CONSTRAINT design_requests_status_check CHECK (status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'pending'::text]));