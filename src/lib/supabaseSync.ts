import { createClient } from '@/utils/supabase/client';
import { BackupData } from './storage';

export async function fetchSupabaseBackup() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return { data: null };

  const { data, error } = await supabase
    .from('user_backups')
    .select('data')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
    console.error('Error fetching backup from Supabase:', error);
    throw error;
  }

  return { data: data?.data as BackupData | null };
}

export async function uploadSupabaseBackup(backupData: BackupData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_backups')
    .upsert({
      user_id: user.id,
      data: backupData,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('Error uploading backup to Supabase:', error);
    throw error;
  }
}
