-- Login OTP tokens table for email-based passwordless sign-in
create table if not exists public.login_otp_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
-- [bridge] ensure columns
ALTER TABLE public.login_otp_tokens
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS otp_hash text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS used boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


-- Clean up expired/used tokens quickly
create index if not exists login_otp_tokens_email_idx on public.login_otp_tokens (email);
create index if not exists login_otp_tokens_expires_idx on public.login_otp_tokens (expires_at);

-- RLS: edge functions use service role key, no public access needed
alter table public.login_otp_tokens enable row level security;

-- Auto-delete expired tokens (keeps table clean)
create or replace function public.cleanup_expired_login_otps()
returns void language sql security definer as $$
  delete from public.login_otp_tokens
  where expires_at < now() - interval '1 hour';
$$;
