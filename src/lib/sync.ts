import { BackupData, exportBackup, importBackup, saveSettings } from './storage';
import { fetchSupabaseBackup, uploadSupabaseBackup } from './supabaseSync';

export interface SyncResult {
  status: 'success' | 'no_change' | 'error';
  message?: string;
}

/**
 * Orchestrates the sync process:
 * 1. Pull remote data from Supabase
 * 2. Merge with local data
 * 3. Push merged data back to Supabase (if changed)
 */
export async function syncWithCloud(): Promise<SyncResult> {
  try {
    const localData = exportBackup();
    const { data: remoteData } = await fetchSupabaseBackup();

    if (!remoteData) {
      // No remote data, push local data as the first backup
      await uploadSupabaseBackup(localData);
      return { status: 'success', message: 'Initial backup created on Supabase' };
    }

    // Merge logic
    const { mergedData, hasChanges } = mergeBackups(localData, remoteData);

    if (hasChanges) {
      // Update local storage
      mergedData.settings = {
        ...(mergedData.settings || {}),
        lastSyncedAt: new Date().toISOString()
      } as any;
      
      importBackup(mergedData);
      // Update remote storage
      await uploadSupabaseBackup(mergedData);
      return { status: 'success', message: 'Sync complete: data merged' };
    }

    // Even if no data changed, update the sync timestamp locally
    const settings = { ...(localData.settings || {}) } as any;
    settings.lastSyncedAt = new Date().toISOString();
    // We don't want to reload the page if nothing changed, so we just save the setting
    saveSettings(settings);

    return { status: 'no_change', message: 'Already in sync' };
  } catch (error: any) {
    console.error('Sync failed:', error);
    return { status: 'error', message: error.message || 'Unknown sync error' };
  }
}

/**
 * Merges local and remote backups.
 * Simple strategy: 
 * - For sets/dictionaries: Union of keys/values
 * - For single values: Latest date wins
 */
function mergeBackups(local: BackupData, remote: BackupData): { mergedData: BackupData; hasChanges: boolean } {
  const merged: BackupData = { ...local };
  let hasChanges = false;

  // 1. Settings (Latest updatedAt wins)
  if (remote.settings) {
    const localUpdated = local.settings?.updatedAt ? new Date(local.settings.updatedAt).getTime() : 0;
    const remoteUpdated = remote.settings?.updatedAt ? new Date(remote.settings.updatedAt).getTime() : 0;

    // If remote is newer, adopt it completely
    if (remoteUpdated > localUpdated) {
      merged.settings = { ...remote.settings };
      hasChanges = true;
    } 
    // If local is newer or equal, we keep local settings (which are already in 'merged')
    // but we might want to flag hasChanges if they are different from remote 
    // so we can push the local changes to cloud.
    else if (JSON.stringify(local.settings) !== JSON.stringify(remote.settings)) {
      hasChanges = true;
    }
  }

  // 2. Memory Nodes (Latest SM-2 state wins per node ID)
  if (remote.memoryNodes) {
    const localNodes = local.memoryNodes || [];
    const remoteNodes = remote.memoryNodes || [];
    const nodeMap = new Map(localNodes.map(n => [n.id, n]));

    remoteNodes.forEach(rNode => {
      const lNode = nodeMap.get(rNode.id);
      if (!lNode || rNode.scheduler.lastReview > lNode.scheduler.lastReview) {
        nodeMap.set(rNode.id, rNode);
        hasChanges = true;
      }
    });
    merged.memoryNodes = Array.from(nodeMap.values());
  }

  // 3. Mutashabihat Decisions (Latest confirmedAt wins)
  if (remote.mutashabihatDecisions) {
    const localDecs = local.mutashabihatDecisions || {};
    const remoteDecs = remote.mutashabihatDecisions || {};
    const allKeys = Array.from(new Set([...Object.keys(localDecs), ...Object.keys(remoteDecs)]));

    const mergedDecs: typeof localDecs = {};
    for (const key of allKeys) {
      const l = localDecs[key];
      const r = remoteDecs[key];
      if (!l) {
        mergedDecs[key] = r;
        hasChanges = true;
      } else if (!r) {
        mergedDecs[key] = l;
      } else {
        const lTime = l.confirmedAt || '';
        const rTime = r.confirmedAt || '';
        if (rTime > lTime) {
          mergedDecs[key] = r;
          hasChanges = true;
        } else {
          mergedDecs[key] = l;
        }
      }
    }
    merged.mutashabihatDecisions = mergedDecs;
  }

  // 4. Custom Mutashabihat (Union by ID)
  if (remote.customMutashabihat) {
    const localCustoms = local.customMutashabihat || [];
    const remoteCustoms = remote.customMutashabihat || [];
    const customMap = new Map(localCustoms.map(c => [c.id, c]));

    remoteCustoms.forEach(rc => {
      if (!customMap.has(rc.id)) {
        customMap.set(rc.id, rc);
        hasChanges = true;
      }
    });
    merged.customMutashabihat = Array.from(customMap.values());
  }

  // Simple "Latest wins" for the rest
  const remoteTime = remote.exportedAt || '';
  const localTime = local.exportedAt || '';

  if (remoteTime > localTime) {
    if (JSON.stringify(remote.mindmaps) !== JSON.stringify(local.mindmaps)) {
        merged.mindmaps = remote.mindmaps;
        hasChanges = true;
    }
    if (JSON.stringify(remote.partMindmaps) !== JSON.stringify(local.partMindmaps)) {
        merged.partMindmaps = remote.partMindmaps;
        hasChanges = true;
    }
    if (JSON.stringify(remote.listeningStats) !== JSON.stringify(local.listeningStats)) {
        merged.listeningStats = remote.listeningStats;
        hasChanges = true;
    }
    if (JSON.stringify(remote.listeningProgress) !== JSON.stringify(local.listeningProgress)) {
        merged.listeningProgress = remote.listeningProgress;
        hasChanges = true;
    }
    if (JSON.stringify(remote.reviewErrors) !== JSON.stringify(local.reviewErrors)) {
        merged.reviewErrors = remote.reviewErrors;
        hasChanges = true;
    }
    if (remote.cycleStart !== local.cycleStart) {
        merged.cycleStart = remote.cycleStart;
        hasChanges = true;
    }
    if (remote.listeningComplete !== local.listeningComplete) {
        merged.listeningComplete = remote.listeningComplete;
        hasChanges = true;
    }
  }

  merged.exportedAt = new Date().toISOString();
  
  // If we had changes from remote, or we are pushing our newer local data
  return { mergedData: merged, hasChanges: hasChanges || localTime > remoteTime };
}
