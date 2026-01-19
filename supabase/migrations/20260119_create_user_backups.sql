-- Create user_backups table if it doesn't exist
create table if not exists public.user_backups (
  user_id uuid references auth.users not null primary key,
  data jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table public.user_backups enable row level security;

-- Policies
create policy "Users can view own backup"
  on public.user_backups for select
  using ( auth.uid() = user_id );

create policy "Users can update own backup"
  on public.user_backups for insert
  with check ( auth.uid() = user_id );

create policy "Users can update own backup (update)"
  on public.user_backups for update
  using ( auth.uid() = user_id );
