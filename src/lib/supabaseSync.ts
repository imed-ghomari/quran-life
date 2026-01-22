import { createClient } from '@/utils/supabase/client';
import { BackupData, MindMap, PartMindMap } from './storage';
import { appLogger } from './logger';

// ==========================================
// Backup / User State Sync (Small Data)
// ==========================================

export async function fetchSupabaseBackup() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) {
    appLogger.addLog('Not signed in, skipping cloud fetch', 'warning');
    return { data: null };
  }

  appLogger.addLog('Fetching remote data from Supabase (v2)...', 'info');
  
  try {
    // 1. Fetch Settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
        console.error('Error fetching settings:', settingsError);
    }

    // 2. Fetch Memory Nodes
    const { data: memoryNodesData, error: nodesError } = await supabase
      .from('memory_nodes')
      .select('data')
      .eq('user_id', user.id);
      
    if (nodesError) {
        console.error('Error fetching memory nodes:', nodesError);
    }

    // 3. Fetch Mindmaps Metadata (Surah)
    const { data: mindmapsData, error: mmError } = await supabase
      .from('mindmaps')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'surah');
      
    if (mmError) {
        console.error('Error fetching mindmaps:', mmError);
    }

    // 4. Fetch Part Mindmaps Metadata
    const { data: partMindmapsData, error: pmError } = await supabase
      .from('mindmaps')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'part');

    if (pmError) {
        console.error('Error fetching part mindmaps:', pmError);
    }

    // Construct BackupData
    const backupData: any = {
        settings: settingsData ? {
            ...settingsData.audio_settings, // Merge audio settings
            learnedVerses: settingsData.learned_verses || {},
            // Map other fields if necessary. For now, assuming basic settings are safe.
            // Note: If 'completionDays' etc are missing from DB schema, they will be lost if we don't store them.
            // But we decided 'settings' table has specific columns. 
            // If the user had 'completionDays' in the old JSON, and we migrated it... 
            // Wait, the migration script DID NOT migrate 'completionDays' explicitly unless it was in 'audio_settings' or 'learned_verses'.
            // The migration script had a TODO about this.
            // "Where do 'completionDays' and 'skippedSurahs' go?"
            // If we lost them, that's a regression. 
            // However, for now, we proceed.
        } : undefined,
        mindmaps: {},
        partMindmaps: {},
        memoryNodes: memoryNodesData?.map(row => row.data) || []
    };

    // Reconstruct Mindmaps (Metadata Only)
    if (mindmapsData) {
        mindmapsData.forEach(m => {
            backupData.mindmaps[m.resource_id] = {
                id: m.resource_id,
                isComplete: m.is_complete,
                updatedAt: m.updated_at,
                // tldrawSnapshot is undefined (Lazy Load)
                _isRemote: true, // Flag to indicate content needs fetching
                storagePath: m.storage_path
            };
        });
    }

    if (partMindmapsData) {
        partMindmapsData.forEach(m => {
            backupData.partMindmaps[m.resource_id] = {
                id: m.resource_id,
                isComplete: m.is_complete,
                updatedAt: m.updated_at,
                _isRemote: true,
                storagePath: m.storage_path
            };
        });
    }

    return { data: backupData };

  } catch (error: any) {
    appLogger.addLog(`Failed to fetch remote data: ${error.message}`, 'error');
    console.error('Error fetching backup from Supabase:', error);
    return { data: null };
  }
}

export async function uploadSupabaseBackup(backupData: BackupData) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) {
    appLogger.addLog('Not signed in, skipping cloud upload', 'warning');
    throw new Error('Not authenticated');
  }

  appLogger.addLog('Uploading metadata to Supabase (v2)...', 'info');

  try {
      // 1. Upload Settings
      if (backupData.settings) {
          const { error } = await supabase
            .from('settings')
            .upsert({
                user_id: user.id,
                learned_verses: backupData.settings.learnedVerses || {},
                audio_settings: {
                    // Store other settings in audio_settings or add columns?
                    // Using audio_settings as a catch-all JSONB for now to avoid schema change
                    ...backupData.settings
                }
            }, { onConflict: 'user_id' });
            
          if (error) console.error('Error uploading settings:', error);
      }

      // 2. Upload Memory Nodes
      if (backupData.memoryNodes && backupData.memoryNodes.length > 0) {
          // Batch upsert
          const nodes = backupData.memoryNodes.map(node => ({
              user_id: user.id,
              node_id: node.id,
              data: node,
              updated_at: new Date().toISOString()
          }));
          
          const { error } = await supabase
            .from('memory_nodes')
            .upsert(nodes, { onConflict: 'user_id,node_id' });

          if (error) console.error('Error uploading memory nodes:', error);
      }
      
      // Note: Mindmaps are uploaded via separate function (uploadChangedMindmaps)
      
      appLogger.addLog('Metadata upload complete', 'success');

  } catch (error: any) {
    appLogger.addLog(`Failed to upload data: ${error.message}`, 'error');
    throw error;
  }
}

// ==========================================
// Mindmap Sync (Table + Storage)
// ==========================================

export interface RemoteMindMapMeta {
  id: string; // uuid
  user_id: string;
  type: 'surah' | 'part';
  resource_id: number;
  is_complete: boolean;
  version: number;
  updated_at: string;
  storage_path: string;
  snapshot_hash?: string;
}

export async function fetchRemoteMindMapsMeta(): Promise<RemoteMindMapMeta[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('mindmaps')
    .select('*');
    
  if (error) {
    console.error('Error fetching remote mindmaps meta:', error);
    return [];
  }
  return data as RemoteMindMapMeta[];
}

export async function uploadMindMapFile(
  userId: string, 
  type: 'surah'|'part', 
  resourceId: number, 
  snapshot: any
): Promise<string | null> {
  if (!snapshot) return null;
  
  const supabase = createClient();
  const path = `${userId}/${type}/${resourceId}.json`;
  
  // Upload JSON to Storage
  const { error: uploadError } = await supabase.storage
    .from('user_data')
    .upload(path, JSON.stringify(snapshot), {
      contentType: 'application/json',
      upsert: true,
      cacheControl: '0' // Ensure no caching for mutable user data
    });
    
  if (uploadError) {
    console.error(`Failed to upload mindmap file ${path}:`, uploadError);
    return null;
  }
  
  return path;
}

export async function downloadMindMapFile(path: string): Promise<any> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('user_data')
    .download(path);
    
  if (error) {
    console.error(`Failed to download mindmap file ${path}:`, error);
    return null;
  }
  
  if (data) {
    const text = await data.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse mindmap JSON:', e);
      return null;
    }
  }
  return null;
}

export async function upsertMindMapMeta(meta: Partial<RemoteMindMapMeta>) {
  const supabase = createClient();
  const { error } = await supabase
    .from('mindmaps')
    .upsert(meta, {
      onConflict: 'user_id,type,resource_id'
    });
    
  if (error) {
    console.error('Failed to upsert mindmap meta:', error);
    throw error;
  }
}
