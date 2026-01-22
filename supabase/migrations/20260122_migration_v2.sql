-- Phase B: Infrastructure Setup (Supabase)

-- Step 4: Create new Postgres tables

-- 1. mindmaps (Metadata Only)
create table if not exists mindmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  type text not null check (type in ('surah', 'part')),
  resource_id integer not null, -- Surah Number or Part Number
  is_complete boolean default false,
  version integer default 1,
  updated_at timestamptz default now(),
  storage_path text not null, -- e.g., users/{uid}/mindmaps/surah_1_v1.json
  snapshot_hash text,
  
  -- Unique constraint to prevent duplicates per user/resource/type
  unique(user_id, type, resource_id)
);

-- Enable RLS for mindmaps
alter table mindmaps enable row level security;

create policy "Users can view their own mindmaps"
  on mindmaps for select
  using (auth.uid() = user_id);

create policy "Users can insert their own mindmaps"
  on mindmaps for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own mindmaps"
  on mindmaps for update
  using (auth.uid() = user_id);

create policy "Users can delete their own mindmaps"
  on mindmaps for delete
  using (auth.uid() = user_id);


-- 2. memory_nodes (High Frequency Sync)
create table if not exists memory_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  node_id text not null, -- The logic ID used in app
  data jsonb not null, -- Contains specific SM-2/FSRS state only
  updated_at timestamptz default now(),
  
  unique(user_id, node_id)
);

-- Enable RLS for memory_nodes
alter table memory_nodes enable row level security;

create policy "Users can view their own memory_nodes"
  on memory_nodes for select
  using (auth.uid() = user_id);

create policy "Users can insert their own memory_nodes"
  on memory_nodes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own memory_nodes"
  on memory_nodes for update
  using (auth.uid() = user_id);

create policy "Users can delete their own memory_nodes"
  on memory_nodes for delete
  using (auth.uid() = user_id);


-- 3. settings (Low Frequency)
create table if not exists settings (
  user_id uuid references auth.users(id) primary key,
  theme jsonb,
  audio_settings jsonb,
  learned_verses jsonb,
  updated_at timestamptz default now()
);

-- Enable RLS for settings
alter table settings enable row level security;

create policy "Users can view their own settings"
  on settings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own settings"
  on settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own settings"
  on settings for update
  using (auth.uid() = user_id);


-- Step 5: Create Supabase Storage bucket `user_data` with RLS policies.
-- Create bucket if not exists (requires storage schema access)
insert into storage.buckets (id, name, public)
values ('user_data', 'user_data', false)
on conflict (id) do nothing;

-- RLS for Storage
-- Allow users to access their own folder (root segment matches user_id)
create policy "Users can read their own storage"
  on storage.objects for select
  using ( bucket_id = 'user_data' and auth.uid()::text = (storage.foldername(name))[1] );

create policy "Users can upload their own storage"
  on storage.objects for insert
  with check ( bucket_id = 'user_data' and auth.uid()::text = (storage.foldername(name))[1] );

create policy "Users can update their own storage"
  on storage.objects for update
  with check ( bucket_id = 'user_data' and auth.uid()::text = (storage.foldername(name))[1] );

create policy "Users can delete their own storage"
  on storage.objects for delete
  using ( bucket_id = 'user_data' and auth.uid()::text = (storage.foldername(name))[1] );
