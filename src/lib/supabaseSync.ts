import { createClient } from '@/utils/supabase/client';
import { BackupData } from './storage';
import { appLogger } from './logger';

export async function fetchSupabaseBackup() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    appLogger.addLog('Not signed in, skipping cloud fetch', 'warning');
    return { data: null };
  }

  appLogger.addLog('Fetching remote data from Supabase...', 'info');
  const { data, error } = await supabase
    .from('user_backups')
    .select('data')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
    appLogger.addLog(`Failed to fetch remote data: ${error.message}`, 'error');
    console.error('Error fetching backup from Supabase:', error);
    throw error;
  }

  if (data) {
    appLogger.addLog('Remote data fetched successfully', 'success');
  } else {
    appLogger.addLog('No remote data found', 'info');
  }

  return { data: data?.data as BackupData | null };
}

export async function uploadSupabaseBackup(backupData: BackupData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    appLogger.addLog('Not signed in, skipping cloud upload', 'warning');
    throw new Error('Not authenticated');
  }

  appLogger.addLog('Uploading data to Supabase (optimized)...', 'info');

  // Create a lean copy of data without heavy base64 images
  const leanData = JSON.parse(JSON.stringify(backupData));
  if (leanData.mindmaps) {
    Object.values(leanData.mindmaps).forEach((mm: any) => {
      mm.imageUrl = null;
      mm.imageUrlDark = null;
    });
  }
  if (leanData.partMindmaps) {
    Object.values(leanData.partMindmaps).forEach((pmm: any) => {
      pmm.imageUrl = null;
      pmm.imageUrlDark = null;
    });
  }

  const { error } = await supabase
    .from('user_backups')
    .upsert({
      user_id: user.id,
      data: leanData,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    appLogger.addLog(`Failed to upload data: ${error.message}`, 'error');
    console.error('Error uploading backup to Supabase:', error);
    throw error;
  }

  appLogger.addLog('Data uploaded to Supabase successfully', 'success');
}
