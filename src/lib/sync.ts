import { BackupData, exportBackup, importBackup, saveSettings, getMindMaps, getPartMindMaps, getMemoryNodes, getMutashabihatDecisions, getReviewErrors, getCustomMutashabihat } from './storage';
import { fetchSupabaseBackup, uploadSupabaseBackup } from './supabaseSync';
import { appLogger } from './logger';
import { SURAHS } from './quranData';

// ========================================
// Types
// ========================================

export interface ChangeDetail {
  category: string;           // e.g., "Mindmaps", "Memory Nodes", "Settings"
  description: string;        // Human-readable description
  count: number;              // Number of items changed
  items?: string[];           // Optional: specific item names for collapsible details
  itemIds: string[];          // UNIQUE IDs for granular merging (e.g., "mindmap-1", "settings-completionDays")
}

export interface ConflictInfo {
  localChanges: ChangeDetail[];
  remoteChanges: ChangeDetail[];
  conflictingItemIds: string[]; // List of IDs that changed on BOTH sides
  localTimestamp: string;
  remoteTimestamp: string;
}

export interface SyncResult {
  status: 'success' | 'no_change' | 'error' | 'conflict';
  message?: string;
  conflict?: ConflictInfo;
}

// Store for pending conflict resolution
let pendingConflict: { local: BackupData; remote: BackupData } | null = null;

/**
 * Helper function to get surah name by ID
 */
function getSurahName(surahId: number): string {
  const surah = SURAHS.find(s => s.id === surahId);
  return surah ? surah.name : `Surah ${surahId}`;
}

/**
 * Detect changes between local and a reference (e.g., cloud) backup
 * Returns detailed change information categorized by type
 */
function detectChanges(current: BackupData, reference: BackupData): ChangeDetail[] {
  const changes: ChangeDetail[] = [];

  // Settings changes
  if (current.settings && reference.settings) {
    const changedFields: string[] = [];
    const changedIds: string[] = [];

    if (current.settings.completionDays !== reference.settings.completionDays) {
      changedFields.push('Completion days');
      changedIds.push('settings-completionDays');
    }
    if (current.settings.activePart !== reference.settings.activePart) {
      changedFields.push('Active part');
      changedIds.push('settings-activePart');
    }
    if (JSON.stringify(current.settings.learnedVerses) !== JSON.stringify(reference.settings.learnedVerses)) {
      changedFields.push('Learned verses');
      changedIds.push('settings-learnedVerses');
    }
    if (JSON.stringify(current.settings.skippedSurahs) !== JSON.stringify(reference.settings.skippedSurahs)) {
      changedFields.push('Skipped surahs');
      changedIds.push('settings-skippedSurahs');
    }

    if (changedFields.length > 0) {
      changes.push({
        category: 'Settings',
        description: 'App settings modified',
        count: changedFields.length,
        items: changedFields,
        itemIds: changedIds,
      });
    }
  }

  // Mindmap changes
  if (current.mindmaps) {
    const refMaps = reference.mindmaps || {};
    const changedMindmaps: string[] = [];
    const changedIds: string[] = [];

    Object.entries(current.mindmaps).forEach(([id, lMap]) => {
      const rMap = refMaps[id];
      if (JSON.stringify(lMap) !== JSON.stringify(rMap)) {
        changedMindmaps.push(getSurahName(parseInt(id)));
        changedIds.push(`mindmap-${id}`);
      }
    });

    if (changedMindmaps.length > 0) {
      changes.push({
        category: 'Surah Mindmaps',
        description: `${changedMindmaps.length} mindmap${changedMindmaps.length > 1 ? 's' : ''} updated`,
        count: changedMindmaps.length,
        items: changedMindmaps,
        itemIds: changedIds,
      });
    }
  }

  // Part Mindmap changes
  if (current.partMindmaps) {
    const refParts = reference.partMindmaps || {};
    const changedParts: string[] = [];
    const changedIds: string[] = [];

    Object.entries(current.partMindmaps).forEach(([id, lMap]) => {
      const rMap = refParts[id];
      if (JSON.stringify(lMap) !== JSON.stringify(rMap)) {
        changedParts.push(`Part ${id}`);
        changedIds.push(`part-mindmap-${id}`);
      }
    });

    if (changedParts.length > 0) {
      changes.push({
        category: 'Part Mindmaps',
        description: `${changedParts.length} part mindmap${changedParts.length > 1 ? 's' : ''} updated`,
        count: changedParts.length,
        items: changedParts,
        itemIds: changedIds,
      });
    }
  }

  // Memory nodes changes
  if (current.memoryNodes) {
    const refNodes = reference.memoryNodes || [];
    const refNodeMap = new Map(refNodes.map(n => [n.id, n]));
    const changedNodes: string[] = [];
    const changedIds: string[] = [];

    current.memoryNodes.forEach(lNode => {
      const rNode = refNodeMap.get(lNode.id);
      if (JSON.stringify(lNode) !== JSON.stringify(rNode)) {
        if (lNode.type === 'mindmap' && lNode.surahId) {
          changedNodes.push(`${getSurahName(lNode.surahId)} mindmap review`);
        } else if (lNode.type === 'verse' && lNode.surahId) {
          changedNodes.push(`${getSurahName(lNode.surahId)} ${lNode.startVerse}-${lNode.endVerse}`);
        } else if (lNode.type === 'part_mindmap' && lNode.partId) {
          changedNodes.push(`Part ${lNode.partId} mindmap review`);
        }
        changedIds.push(`memory-node-${lNode.id}`);
      }
    });

    if (changedNodes.length > 0) {
      changes.push({
        category: 'Review Progress',
        description: `${changedNodes.length} node${changedNodes.length > 1 ? 's' : ''} updated`,
        count: changedNodes.length,
        items: changedNodes.slice(0, 20),
        itemIds: changedIds,
      });
    }
  }

  // Mutashabihat decisions
  if (current.mutashabihatDecisions) {
    const refDecs = reference.mutashabihatDecisions || {};
    const changedIds: string[] = [];
    let changedCount = 0;

    Object.entries(current.mutashabihatDecisions).forEach(([key, lDec]) => {
      const rDec = refDecs[key];
      if (JSON.stringify(lDec) !== JSON.stringify(rDec)) {
        changedCount++;
        changedIds.push(`mutashabihat-decision-${key}`);
      }
    });

    if (changedCount > 0) {
      changes.push({
        category: 'Similar Verses Decisions',
        description: `${changedCount} decision${changedCount > 1 ? 's' : ''} updated`,
        count: changedCount,
        itemIds: changedIds,
      });
    }
  }

  // Custom Mutashabihat
  if (current.customMutashabihat) {
    const refCustoms = reference.customMutashabihat || [];
    const refCustomIds = new Set(refCustoms.map(c => c.id));
    const changedIds: string[] = [];
    const newCustoms = current.customMutashabihat.filter(c => !refCustomIds.has(c.id));

    if (newCustoms.length > 0) {
      newCustoms.forEach(c => changedIds.push(`custom-mutashabihat-${c.id}`));
      changes.push({
        category: 'Custom Similar Verses',
        description: `${newCustoms.length} new custom verse${newCustoms.length > 1 ? 's' : ''}`,
        count: newCustoms.length,
        itemIds: changedIds,
      });
    }
  }

  // Review errors
  if (current.reviewErrors) {
    const refErrs = reference.reviewErrors || [];
    const refErrIds = new Set(refErrs.map(e => e.id));
    const changedIds: string[] = [];
    const newErrors = current.reviewErrors.filter(e => !refErrIds.has(e.id));

    if (newErrors.length > 0) {
      newErrors.forEach(e => changedIds.push(`review-error-${e.id}`));
      changes.push({
        category: 'Review Errors',
        description: `${newErrors.length} new error${newErrors.length > 1 ? 's' : ''} recorded`,
        count: newErrors.length,
        itemIds: changedIds,
      });
    }
  }

  return changes;
}

/**
 * Check if there's a conflict between local and remote data.
 * A conflict exists when BOTH sides have changes to the SAME ITEM since the last known sync.
 */
function checkForConflicts(local: BackupData, remote: BackupData): ConflictInfo | null {
  const lastSyncedAt = local.settings?.lastSyncedAt || '';

  // If never synced before, no conflict - just merge
  if (!lastSyncedAt) return null;

  const localExportedAt = local.exportedAt || '';
  const remoteExportedAt = remote.exportedAt || '';

  // If both local and remote were modified after last sync, we have a potential conflict
  const localModifiedAfterSync = localExportedAt > lastSyncedAt;
  const remoteModifiedAfterSync = remoteExportedAt > lastSyncedAt;

  if (!localModifiedAfterSync || !remoteModifiedAfterSync) {
    // Only one side changed, no conflict
    return null;
  }

  // Both sides modified - detect specific changes
  const localChanges = detectChanges(local, remote);
  const remoteChanges = detectChanges(remote, local);

  // Identify specific items that changed on BOTH sides
  const localIds = new Set(localChanges.flatMap(c => c.itemIds));
  const remoteIds = new Set(remoteChanges.flatMap(c => c.itemIds));
  const conflictingItemIds = Array.from(localIds).filter(id => remoteIds.has(id));

  // Only show conflict if there are actual overlapping changes
  if (conflictingItemIds.length === 0) {
    return null;
  }

  return {
    localChanges: localChanges.filter(c => c.itemIds.some(id => conflictingItemIds.includes(id))),
    remoteChanges: remoteChanges.filter(c => c.itemIds.some(id => conflictingItemIds.includes(id))),
    conflictingItemIds,
    localTimestamp: localExportedAt,
    remoteTimestamp: remoteExportedAt,
  };
}

/**
 * Resolve granular conflict by choosing per-item or global resolution
 */
export async function resolveConflict(
  choice: 'local' | 'remote' | 'manual',
  manualChoices?: Record<string, 'local' | 'remote'>
): Promise<SyncResult> {
  if (!pendingConflict) {
    return { status: 'error', message: 'No conflict to resolve' };
  }

  const { local, remote } = pendingConflict;
  const baselineExportedAt = local.exportedAt; // Use this to track what we resolved
  pendingConflict = null;

  try {
    appLogger.addLog(`Resolving conflict: ${choice} resolution...`, 'info');

    let resultData: BackupData;

    if (choice === 'local') {
      resultData = { ...local };
    } else if (choice === 'remote') {
      resultData = { ...remote };
    } else {
      // Manual merge
      const { mergedData } = mergeBackups(local, remote);
      resultData = mergedData;

      if (manualChoices) {
        // Overwrite merged items with explicit choices
        Object.entries(manualChoices).forEach(([itemId, side]) => {
          const data = side === 'local' ? local : remote;
          applyGranularItem(resultData, data, itemId);
        });
      }
    }

    // Mark as resolved for this state
    resultData.settings = {
      ...(resultData.settings || {}),
      lastSyncedAt: new Date().toISOString()
    } as any;
    resultData.exportedAt = new Date().toISOString();
    resultData.lastResolvedFor = baselineExportedAt;

    // Save locally
    importBackup(resultData);
    // Push to cloud
    await uploadSupabaseBackup(resultData);

    appLogger.addLog('Conflict resolved and synced', 'success');
    return { status: 'success', message: 'Conflict resolved successfully' };
  } catch (error: any) {
    appLogger.addLog(`Conflict resolution failed: ${error.message}`, 'error');
    return { status: 'error', message: error.message || 'Failed to resolve conflict' };
  }
}

/**
 * Applies a single item from source to target based on itemId
 */
function applyGranularItem(target: BackupData, source: BackupData, itemId: string) {
  if (itemId.startsWith('settings-')) {
    const field = itemId.replace('settings-', '') as keyof any;
    if (target.settings && source.settings) {
      (target.settings as any)[field] = (source.settings as any)[field];
    }
  } else if (itemId.startsWith('mindmap-')) {
    const id = itemId.replace('mindmap-', '');
    if (target.mindmaps && source.mindmaps && source.mindmaps[id]) {
      target.mindmaps[id] = source.mindmaps[id];
    }
  } else if (itemId.startsWith('part-mindmap-')) {
    const id = itemId.replace('part-mindmap-', '');
    if (target.partMindmaps && source.partMindmaps && source.partMindmaps[id]) {
      target.partMindmaps[id] = source.partMindmaps[id];
    }
  } else if (itemId.startsWith('memory-node-')) {
    const id = itemId.replace('memory-node-', '');
    if (target.memoryNodes && source.memoryNodes) {
      const sourceNode = source.memoryNodes.find(n => n.id === id);
      if (sourceNode) {
        target.memoryNodes = target.memoryNodes.filter(n => n.id !== id);
        target.memoryNodes.push(sourceNode);
      }
    }
  } else if (itemId.startsWith('mutashabihat-decision-')) {
    const key = itemId.replace('mutashabihat-decision-', '');
    if (target.mutashabihatDecisions && source.mutashabihatDecisions && source.mutashabihatDecisions[key]) {
      target.mutashabihatDecisions[key] = source.mutashabihatDecisions[key];
    }
  }
}

/**
 * Orchestrates the sync process:
 * 1. Pull remote data from Supabase
 * 2. Check for conflicts
 * 3. If conflict exists, return conflict info for user decision
 * 4. Otherwise, merge and push
 */
export async function syncWithCloud(): Promise<SyncResult> {
  try {
    appLogger.addLog('Starting cloud sync...', 'info');
    const localData = exportBackup();
    const { data: remoteData } = await fetchSupabaseBackup();

    if (!remoteData) {
      // No remote data, push local data as the first backup
      appLogger.addLog('No remote data found. Creating initial backup...', 'info');
      await uploadSupabaseBackup(localData);
      appLogger.addLog('Initial backup created successfully', 'success');
      return { status: 'success', message: 'Initial backup created on Supabase' };
    }

    // Check if remote already contains the resolution for our current state
    if (remoteData.lastResolvedFor === localData.exportedAt) {
      appLogger.addLog('Sync: Adopting remote resolution for current state...', 'info');
      remoteData.settings = {
        ...(remoteData.settings || {}),
        lastSyncedAt: new Date().toISOString()
      } as any;
      importBackup(remoteData);
      return { status: 'success', message: 'Resolution adopted from cloud' };
    }

    // Check for conflicts before merging
    const conflict = checkForConflicts(localData, remoteData);
    if (conflict) {
      appLogger.addLog('Sync conflict detected. Awaiting user decision...', 'warning');
      pendingConflict = { local: localData, remote: remoteData };
      return { status: 'conflict', message: 'Conflict detected', conflict };
    }

    // MERGE AGAIN with latest local state right before saving
    // this prevents losing changes made while the fetch was in flight
    const latestLocal = exportBackup();
    const { mergedData, hasChanges: mergedHasChanges } = mergeBackups(latestLocal, remoteData);

    if (mergedHasChanges || localData.exportedAt !== latestLocal.exportedAt) {
      appLogger.addLog('Changes detected. Merging and uploading...', 'info');
      // Update local storage
      mergedData.settings = {
        ...(mergedData.settings || {}),
        lastSyncedAt: new Date().toISOString()
      } as any;

      importBackup(mergedData);
      // Update remote storage
      await uploadSupabaseBackup(mergedData);
      appLogger.addLog('Sync complete: Data merged and uploaded', 'success');
      return { status: 'success', message: 'Sync complete: data merged' };
    }

    // Even if no data changed, update the sync timestamp locally
    const settings = { ...(localData.settings || {}) } as any;
    settings.lastSyncedAt = new Date().toISOString();
    // We don't want to reload the page if nothing changed, so we just save the setting
    saveSettings(settings);

    appLogger.addLog('Sync complete: Already in sync', 'success');
    return { status: 'no_change', message: 'Already in sync' };
  } catch (error: any) {
    appLogger.addLog(`Sync failed: ${error.message || 'Unknown error'}`, 'error');
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

    // Merge each mindmap individually using its own updatedAt if available
    Object.entries(remoteMaps).forEach(([id, rMap]) => {
      const lMap = mergedMaps[id];
      const rTime = rMap.updatedAt || remoteTime;
      const lTime = lMap?.updatedAt || localTime;

      const rDeleted = rMap.deletedAt || '';
      const lDeleted = lMap?.deletedAt || '';

      // Rule: If either is explicitly deleted, the latest deletion OR latest update wins
      // But a deletion always trumps an older update.
      const rMaxTime = rDeleted > rTime ? rDeleted : rTime;
      const lMaxTime = lDeleted > lTime ? lDeleted : lTime;

      if (!lMap || (rMaxTime > lMaxTime && JSON.stringify(lMap) !== JSON.stringify(rMap))) {
        mergedMaps[id] = {
          ...rMap,
          imageUrl: rMap.imageUrl || lMap?.imageUrl || null,
          imageUrlDark: rMap.imageUrlDark || lMap?.imageUrlDark || null,
        };
        hasChanges = true;
      }
    });

    if (JSON.stringify(merged.mindmaps) !== JSON.stringify(mergedMaps)) {
      merged.mindmaps = mergedMaps;
      // If we added new maps or updated existing ones from remote, that's already tracked by hasChanges.
      // But we should also check if local had maps that remote didn't, which is handled by { ...localMaps } initial state.
    }
    merged.mindmaps = mergedMaps;
  }

  // 6. Part Mindmaps (Merge by Part ID)
  if (remote.partMindmaps) {
    const localPartMaps = local.partMindmaps || {};
    const remotePartMaps = remote.partMindmaps || {};
    const mergedPartMaps = { ...localPartMaps };

    Object.entries(remotePartMaps).forEach(([id, rMap]) => {
      const lMap = mergedPartMaps[id];
      const rTime = rMap.updatedAt || remoteTime;
      const lTime = lMap?.updatedAt || localTime;

      const rDeleted = rMap.deletedAt || '';
      const lDeleted = lMap?.deletedAt || '';

      const rMaxTime = rDeleted > rTime ? rDeleted : rTime;
      const lMaxTime = lDeleted > lTime ? lDeleted : lTime;

      if (!lMap || (rMaxTime > lMaxTime && JSON.stringify(lMap) !== JSON.stringify(rMap))) {
        mergedPartMaps[id] = {
          ...rMap,
          imageUrl: rMap.imageUrl || lMap?.imageUrl || null,
          imageUrlDark: rMap.imageUrlDark || lMap?.imageUrlDark || null,
        };
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

    Object.entries(remoteProg).forEach(([id, rProg]) => {
      const lProg = mergedProg[id];
      const rTime = rProg.updatedAt || remoteTime;
      const lTime = lProg?.updatedAt || localTime;

      if (!lProg || (rTime > lTime && JSON.stringify(lProg) !== JSON.stringify(rProg))) {
        mergedProg[id] = rProg;
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
