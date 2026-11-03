ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_status_check CHECK (status = ANY (ARRAY[
  'active'::text, 'trial'::text, 'paused'::text, 'cancelled'::text, 'archived'::text,
  'CRM - Active'::text, 'CRM - Trial'::text, 'CRM - Paused'::text,
  -- keep legacy values so existing rows and code paths still validate
  'suspended'::text, 'canceled'::text, 'inactive'::text, 'deleted'::text, 'none'::text
]));