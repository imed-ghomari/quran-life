
import { useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MindMapDoc, PartMindMapDoc } from '@/lib/db';
import { createClient } from '@/utils/supabase/client';
import { mergeTldrawSnapshots } from '@/lib/merge';
import { appLogger } from '@/lib/logger';
import { MindMap, PartMindMap } from '@/lib/types';
import { updateSettingsCache, updateMemoryNodesCache } from '@/lib/storage';

// const SYNC_INTERVAL = 30000; // 30 seconds

export function useDexieSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Track online status
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncMindmaps = useCallback(async (userId: string) => {
    const supabase = createClient();
    
    // 1. Fetch Remote Metadata
    const { data: remoteMaps, error: fetchError } = await supabase
      .from('mindmaps')
      .select('*')
      .eq('user_id', userId);

    if (fetchError) throw fetchError;

    // 2. Process Surah Mindmaps
    const localSurahMaps = await db.mindmaps.toArray();
    const remoteSurahMaps = remoteMaps?.filter(m => m.type === 'surah') || [];

    // Map for quick lookup
    const localSurahMap = new Map(localSurahMaps.map(m => [m.surahId, m]));
    const remoteSurahMap = new Map(remoteSurahMaps.map(m => [m.resource_id, m]));

    // A. Handle Incoming Changes (Remote -> Local)
    for (const remote of remoteSurahMaps) {
      const local = localSurahMap.get(remote.resource_id);
      const remoteTime = new Date(remote.updated_at).getTime();
      const localTime = local ? new Date(local.updatedAt).getTime() : 0;

      // If remote is newer, or local doesn't exist
      if (!local || remoteTime > localTime) {
        // Download snapshot
        if (remote.storage_path) {
          const { data: blob, error: dlError } = await supabase.storage
            .from('mindmaps')
            .download(remote.storage_path);

          if (!dlError && blob) {
            const text = await blob.text();
            const remoteSnapshot = JSON.parse(text);

            // Merge logic
            const localSnapshot = local?.data.tldrawSnapshot;
            const mergedSnapshot = mergeTldrawSnapshots(localSnapshot, remoteSnapshot);

            // Update Dexie
            await db.mindmaps.put({
              surahId: remote.resource_id,
              data: {
                ...local?.data, // Keep local fields like isComplete if needed, or prefer remote?
                surahId: remote.resource_id,
                imageUrl: null, // Don't sync blobs directly if not needed, or fetch separate URL
                isComplete: remote.is_complete,
                anchors: local?.data.anchors || [], // Anchors might need merging too? Assuming snapshot contains visual state. 
                // Wait, anchors are semantic data. They might be in the snapshot or separate.
                // For now, preserve local anchors if not in snapshot.
                tldrawSnapshot: mergedSnapshot
              } as MindMap,
              updatedAt: remote.updated_at,
              syncedAt: new Date().toISOString()
            });
          }
        }
      }
    }

    // B. Handle Outgoing Changes (Local -> Remote)
    // Find items where updated > synced, or never synced
    const dirtySurahMaps = localSurahMaps.filter(m => 
      !m.syncedAt || new Date(m.updatedAt) > new Date(m.syncedAt)
    );

    for (const local of dirtySurahMaps) {
      const remote = remoteSurahMap.get(local.surahId);
      const remoteTime = remote ? new Date(remote.updated_at).getTime() : 0;
      const localTime = new Date(local.updatedAt).getTime();

      // Only push if local is actually newer (double check to avoid race conditions)
      if (localTime > remoteTime) {
        // Upload to Storage
        const filePath = `${userId}/surah/${local.surahId}.json`;
        const { error: uploadError } = await supabase.storage
          .from('mindmaps')
          .upload(filePath, JSON.stringify(local.data.tldrawSnapshot), {
            upsert: true,
            contentType: 'application/json'
          });

        if (!uploadError) {
          // Update Metadata Table
          await supabase.from('mindmaps').upsert({
            user_id: userId,
            type: 'surah',
            resource_id: local.surahId,
            is_complete: local.data.isComplete,
            storage_path: filePath,
            updated_at: local.updatedAt
          }, { onConflict: 'user_id, type, resource_id' });

          // Mark as synced
          await db.mindmaps.update(local.surahId, {
            syncedAt: new Date().toISOString()
          });
        }
      }
    }
    
    // 3. Process Part Mindmaps (Similar logic)
    const localPartMaps = await db.partMindmaps.toArray();
    const remotePartMaps = remoteMaps?.filter(m => m.type === 'part') || [];
    
    const localPartMap = new Map(localPartMaps.map(m => [m.partId, m]));
    const remotePartMap = new Map(remotePartMaps.map(m => [m.resource_id, m]));

    // Part Mindmaps - Incoming
    for (const remote of remotePartMaps) {
        const local = localPartMap.get(remote.resource_id);
        const remoteTime = new Date(remote.updated_at).getTime();
        const localTime = local ? new Date(local.updatedAt).getTime() : 0;
  
        if (!local || remoteTime > localTime) {
          if (remote.storage_path) {
            const { data: blob, error: dlError } = await supabase.storage
              .from('mindmaps')
              .download(remote.storage_path);
  
            if (!dlError && blob) {
              const text = await blob.text();
              const remoteSnapshot = JSON.parse(text);
              const localSnapshot = local?.data.tldrawSnapshot;
              const mergedSnapshot = mergeTldrawSnapshots(localSnapshot, remoteSnapshot);
  
              await db.partMindmaps.put({
                partId: remote.resource_id,
                data: {
                    ...local?.data,
                    partId: remote.resource_id,
                    imageUrl: null,
                    isComplete: remote.is_complete,
                    description: local?.data.description || '',
                    tldrawSnapshot: mergedSnapshot
                } as PartMindMap,
                updatedAt: remote.updated_at,
                syncedAt: new Date().toISOString()
              });
            }
          }
        }
      }

    // Part Mindmaps - Outgoing
    const dirtyPartMaps = localPartMaps.filter(m => 
        !m.syncedAt || new Date(m.updatedAt) > new Date(m.syncedAt)
    );
  
    for (const local of dirtyPartMaps) {
        const remote = remotePartMap.get(local.partId);
        const remoteTime = remote ? new Date(remote.updated_at).getTime() : 0;
        const localTime = new Date(local.updatedAt).getTime();
  
        if (localTime > remoteTime) {
          const filePath = `${userId}/part/${local.partId}.json`;
          const { error: uploadError } = await supabase.storage
            .from('mindmaps')
            .upload(filePath, JSON.stringify(local.data.tldrawSnapshot), {
              upsert: true,
              contentType: 'application/json'
            });
  
          if (!uploadError) {
            await supabase.from('mindmaps').upsert({
              user_id: userId,
              type: 'part',
              resource_id: local.partId,
              is_complete: local.data.isComplete,
              storage_path: filePath,
              updated_at: local.updatedAt
            }, { onConflict: 'user_id, type, resource_id' });
  
            await db.partMindmaps.update(local.partId, {
              syncedAt: new Date().toISOString()
            });
          }
        }
    }

    // 4. Sync Settings
    const { data: remoteSettings } = await supabase.from('settings').select('*').eq('user_id', userId).single();
    const localSettings = await db.settings.get('main');
    
    if (remoteSettings) {
        const remoteTime = new Date(remoteSettings.updated_at || 0).getTime();
        const localTime = localSettings ? new Date(localSettings.updatedAt).getTime() : 0;

        // Pull
        if (remoteTime > localTime) {
            const newSettings = {
                completionDays: remoteSettings.completion_days,
                activePart: remoteSettings.active_part,
                learnedVerses: remoteSettings.learned_verses || {},
                skippedSurahs: remoteSettings.skipped_surahs || [],
                theme: 'system', // Default or map if stored
                updatedAt: remoteSettings.updated_at
            };
            
            await db.settings.put({
                key: 'main',
                data: newSettings as any,
                updatedAt: remoteSettings.updated_at,
                syncedAt: new Date().toISOString()
            });
            
            updateSettingsCache(newSettings as any);
        }
    }

    // Push Settings
    if (localSettings && (!localSettings.syncedAt || new Date(localSettings.updatedAt) > new Date(localSettings.syncedAt))) {
        // Check if local is actually newer than remote (which we just fetched)
        const remoteTime = remoteSettings ? new Date(remoteSettings.updated_at || 0).getTime() : 0;
        if (new Date(localSettings.updatedAt).getTime() > remoteTime) {
            await supabase.from('settings').upsert({
                user_id: userId,
                completion_days: localSettings.data.completionDays,
                active_part: localSettings.data.activePart,
                learned_verses: localSettings.data.learnedVerses,
                skipped_surahs: localSettings.data.skippedSurahs,
                updated_at: localSettings.updatedAt
            }, { onConflict: 'user_id' });
            
            await db.settings.update('main', { syncedAt: new Date().toISOString() });
        }
    }

    // 5. Sync Memory Nodes
    // Pull
    const { data: remoteNodes } = await supabase.from('memory_nodes').select('*').eq('user_id', userId);
    if (remoteNodes) {
        // Bulk put for performance
        const nodesToPut = [];
        for (const rNode of remoteNodes) {
            const localNode = await db.memoryNodes.get(rNode.node_id);
            const remoteTime = new Date(rNode.updated_at).getTime();
            const localTime = localNode ? new Date(localNode.updatedAt).getTime() : 0;
            
            if (remoteTime > localTime) {
                nodesToPut.push({
                    id: rNode.node_id,
                    data: rNode.data,
                    updatedAt: rNode.updated_at,
                    syncedAt: new Date().toISOString()
                });
            }
        }
        if (nodesToPut.length > 0) {
            await db.memoryNodes.bulkPut(nodesToPut);
            const allNodes = await db.memoryNodes.toArray();
            updateMemoryNodesCache(allNodes.map(n => n.data));
        }
    }

    // Push
    const dirtyNodes = await db.memoryNodes.filter(n => !n.syncedAt || new Date(n.updatedAt) > new Date(n.syncedAt)).toArray();
    if (dirtyNodes.length > 0) {
        const payload = dirtyNodes.map(n => ({
            user_id: userId,
            node_id: n.id,
            data: n.data,
            updated_at: n.updatedAt
        }));
        
        const { error: nodeError } = await supabase.from('memory_nodes').upsert(payload, { onConflict: 'user_id, node_id' });
        
        if (!nodeError) {
            const ids = dirtyNodes.map(n => n.id);
            await db.memoryNodes.where('id').anyOf(ids).modify({ syncedAt: new Date().toISOString() });
        }
    }


  }, []);

  const sync = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    
    setIsSyncing(true);
    setError(null);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        await syncMindmaps(session.user.id);
        setLastSyncedAt(new Date());
        appLogger.addLog('Dexie Sync completed successfully', 'success');
      }
    } catch (err: any) {
      console.error('Dexie Sync failed:', err);
      setError(err.message);
      appLogger.addLog(`Dexie Sync failed: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline, syncMindmaps]);

  // Periodic Sync removed to save Supabase resources
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //       sync();
  //   }, SYNC_INTERVAL);
  //   return () => clearInterval(interval);
  // }, [sync]);

  // Initial Sync on mount/online
  useEffect(() => {
    if (isOnline) {
        sync();
    }
  }, [isOnline, sync]);

  return {
    isSyncing,
    lastSyncedAt,
    error,
    syncNow: sync
  };
}
