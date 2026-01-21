-- Add index on email for faster lookups in middleware and RLS
create index if not exists purchases_email_idx on public.purchases (email);
