ALTER TABLE public.cad_requests
  ADD CONSTRAINT cad_requests_request_number_unique UNIQUE (request_number);