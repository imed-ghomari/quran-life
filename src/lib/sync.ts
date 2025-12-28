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

  // 3. Mutashabihat Decisions (Latest timestamp wins, with updatedAt fallback)
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
        // Local has something remote doesn't - we need to push
        hasChanges = true;
      } else {
        // Both exist - use confirmedAt first, then updatedAt, then fallback
        const lTime = l.confirmedAt || l.updatedAt || '';
        const rTime = r.confirmedAt || r.updatedAt || '';

        // If times are equal, prefer confirmed over unconfirmed
        if (rTime > lTime || (rTime === lTime && r.confirmedAt && !l.confirmedAt)) {
          mergedDecs[key] = r;
          hasChanges = true;
        } else {
          mergedDecs[key] = l;
          // If local differs from remote, flag for push
          if (lTime > rTime || JSON.stringify(l) !== JSON.stringify(r)) {
            hasChanges = true;
          }
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

  // 5. Mindmaps (Merge by Surah ID)
  const remoteTime = remote.exportedAt || '';
  const localTime = local.exportedAt || '';

  if (remote.mindmaps) {
    const localMaps = local.mindmaps || {};
    const remoteMaps = remote.mindmaps || {};
    const mergedMaps = { ...localMaps };

    // For now, if a surah exists in both, we prioritize REMOTE if remote is globally newer, 
    // otherwise we keep LOCAL. Ideally we'd have per-item timestamps.
    // However, this at least allows disjoint updates (Surah A on phone, Surah B on desktop).
    Object.entries(remoteMaps).forEach(([id, map]) => {
      // If we don't have it, or if we define "remote is newer" as the tie-breaker
      if (!mergedMaps[id] || (remoteTime > localTime && JSON.stringify(mergedMaps[id]) !== JSON.stringify(map))) {
        mergedMaps[id] = map;
        hasChanges = true;
      }
    });

    // Also check if we have local maps that aren't in remote, 
    // and if we are pushing (local > remote), we keep them (already in ...localMaps).
    // If local is OLDER, strictly speaking we might want to respect deletions? 
    // But for this app, we generally accumulate data. Keeping local additions is safer.

    // If we kept a local map that differs from remote (and wasn't overwritten above), 
    // that constitutes a change to push back.
    if (JSON.stringify(merged.mindmaps) !== JSON.stringify(mergedMaps)) {
      merged.mindmaps = mergedMaps;
      if (Object.keys(mergedMaps).length > Object.keys(remoteMaps).length) {
        hasChanges = true;
      }
    }
    // Explicitly set the merged result
    merged.mindmaps = mergedMaps;
  }

  // 6. Part Mindmaps (Merge by Part ID)
  if (remote.partMindmaps) {
    const localPartMaps = local.partMindmaps || {};
    const remotePartMaps = remote.partMindmaps || {};
    const mergedPartMaps = { ...localPartMaps };

    Object.entries(remotePartMaps).forEach(([id, map]) => {
      if (!mergedPartMaps[id] || (remoteTime > localTime && JSON.stringify(mergedPartMaps[id]) !== JSON.stringify(map))) {
        mergedPartMaps[id] = map;
        hasChanges = true;
      }
    });
    merged.partMindmaps = mergedPartMaps;
  }

  // 7. Listening Stats (Merge by Surah ID)
  if (remote.listeningStats) {
    const localStats = local.listeningStats || {};
    const remoteStats = remote.listeningStats || {};
    const mergedStats = { ...localStats };

    Object.entries(remoteStats).forEach(([id, stat]) => {
      const lStat = mergedStats[id];
      // Here we have specific timestamps inside the object!
      if (!lStat || (stat.lastListened > lStat.lastListened)) {
        mergedStats[id] = stat;
        hasChanges = true;
      }
    });
    merged.listeningStats = mergedStats;
  }

  // 8. Listening Progress (Merge by Part ID)
  if (remote.listeningProgress) {
    const localProg = local.listeningProgress || {};
    const remoteProg = remote.listeningProgress || {};
    const mergedProg = { ...localProg };

    Object.entries(remoteProg).forEach(([id, prog]) => {
      // No timestamp here, so fallback to global time
      if (!mergedProg[id] || remoteTime > localTime) {
        mergedProg[id] = prog;
        hasChanges = true;
      }
    });
    merged.listeningProgress = mergedProg;
  }

  // 9. Review Errors (Union based on ID)
  if (remote.reviewErrors) {
    const localErrs = local.reviewErrors || [];
    const remoteErrs = remote.reviewErrors || [];
    const errMap = new Map(localErrs.map(e => [e.id, e]));

    remoteErrs.forEach(re => {
      if (!errMap.has(re.id)) {
        errMap.set(re.id, re);
        hasChanges = true;
      }
    });
    // Keep only last 100 to stick to storage limits logic
    // Sort by timestamp descending
    const allErrs = Array.from(errMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 100);

    merged.reviewErrors = allErrs;
  }

  // 10. Simple scalars
  if (remoteTime > localTime) {
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
