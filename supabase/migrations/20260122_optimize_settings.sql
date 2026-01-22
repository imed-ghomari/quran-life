-- Phase F: Optimization (Settings Normalization)

-- 1. Add normalized columns to settings table
alter table settings 
add column if not exists completion_days integer default 30,
add column if not exists active_part integer default 4,
add column if not exists skipped_surahs integer[] default '{}',
add column if not exists kanban_columns jsonb default '{"backlog": [], "in-progress": [], "complete": []}'::jsonb,
add column if not exists review_errors jsonb default '[]'::jsonb,
add column if not exists mutashabihat_decisions jsonb default '{}'::jsonb,
add column if not exists custom_mutashabihat jsonb default '[]'::jsonb,
add column if not exists portion_pointers jsonb default '{}'::jsonb;

-- 2. Migrate data from audio_settings (if any exists)
-- This is a best-effort migration for existing rows.
-- We extract fields from the audio_settings blob if they exist there.
update settings
set 
  completion_days = coalesce((audio_settings->>'completionDays')::integer, completion_days),
  active_part = coalesce((audio_settings->>'activePart')::integer, active_part),
  -- Postgres doesn't easily cast json array to int array without a function, 
  -- but we can try to rely on application sync to fix this next time, 
  -- or use a simple cast if the format matches. 
  -- For safety in this script, we'll leave skipped_surahs empty and let the app sync it.
  kanban_columns = coalesce(audio_settings->'kanbanColumns', kanban_columns),
  review_errors = coalesce(audio_settings->'reviewErrors', review_errors),
  mutashabihat_decisions = coalesce(audio_settings->'mutashabihatDecisions', mutashabihat_decisions),
  custom_mutashabihat = coalesce(audio_settings->'customMutashabihat', custom_mutashabihat),
  portion_pointers = coalesce(audio_settings->'portionPointers', portion_pointers);

-- 3. Cleanup audio_settings (Optional - removing non-audio keys)
-- We won't delete the keys to prevent data loss during transition, 
-- but the App will now write to the new columns.
