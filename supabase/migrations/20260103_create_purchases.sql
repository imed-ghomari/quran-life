-- Create a table to track Polar purchases
create table if not exists public.purchases (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  polar_checkout_id text unique,
  polar_customer_id text,
  polar_product_id text,
  status text default 'completed',
  purchased_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS (Row Level Security)
alter table public.purchases enable row level security;

-- Policy: Users can only see their own purchases (matching email)
create policy "Users can view own purchases"
  on public.purchases for select
  using ( auth.jwt() ->> 'email' = email );

-- Policy: Service role (webhook) can insert purchases
create policy "Service role can insert purchases"
  on public.purchases for insert
  with check ( true );
