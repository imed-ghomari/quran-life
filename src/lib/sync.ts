import { BackupData, exportBackup, importBackup, saveSettings, getMindMaps, getPartMindMaps, getMemoryNodes, getMutashabihatDecisions, getReviewErrors, getCustomMutashabihat, getNodeLastReview } from './storage';
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

  // Filter changes to ONLY include the specific items that overlap
  const filterChanges = (changes: ChangeDetail[]): ChangeDetail[] => {
    return changes
      .map(c => {
        const filteredIds = c.itemIds.filter(id => conflictingItemIds.includes(id));
        if (filteredIds.length === 0) return null;

        // If items labels are present, filter them too
        let filteredItems = c.items;
        if (c.items && c.items.length === c.itemIds.length) {
          filteredItems = c.items.filter((_, idx) => conflictingItemIds.includes(c.itemIds[idx]));
        }

        const result: ChangeDetail = {
          ...c,
          itemIds: filteredIds,
          items: filteredItems,
          count: filteredIds.length,
          description: `${filteredIds.length} ${c.category.toLowerCase()} item${filteredIds.length > 1 ? 's' : ''} in conflict`
        };
        return result;
      })
      .filter((c): c is ChangeDetail => c !== null);
  };

  return {
    localChanges: filterChanges(localChanges),
    remoteChanges: filterChanges(remoteChanges),
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
    // We now AUTO-MERGE conflicts instead of stopping
    const conflict = checkForConflicts(localData, remoteData);
    if (conflict) {
      appLogger.addLog('Sync conflict detected. Auto-merging...', 'warning');
      // We do NOT return conflict status anymore, we proceed to mergeBackups
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

// ========================================
// Conflict-Free Merge Helpers
// ========================================

/**
 * Merge tldraw snapshots at the shape level.
 * Each shape in the records array has a unique ID.
 * Union all shapes from both snapshots, prefer newer version if same ID exists.
 */
function mergeTldrawSnapshots(local: any, remote: any): any {
  // Handle missing snapshots
  if (!local && !remote) return undefined;
  if (!local) return remote;
  if (!remote) return local;

  // Helper to extract records from either 'store' (object) or 'records' (array)
  const getRecords = (snapshot: any): any[] => {
    if (snapshot?.store) return Object.values(snapshot.store);
    if (Array.isArray(snapshot?.records)) return snapshot.records;
    return [];
  };

  const localRecords = getRecords(local);
  const remoteRecords = getRecords(remote);

  appLogger.addLog(`Merging Mindmap: Local records ${localRecords.length}, Remote records ${remoteRecords.length}`, 'info');

  // If neither has records, prefer the one with more data or remote
  if (localRecords.length === 0 && remoteRecords.length === 0) {
    return local || remote;
  }

  // Build shape map by ID, keep newer version of each shape
  const shapeMap = new Map<string, any>();

  // Add all local shapes first
  localRecords.forEach((record: any) => {
    shapeMap.set(record.id, record);
  });

  let newFromRemote = 0;
  let updatedFromRemote = 0;

  // Merge remote shapes - add if new, or replace if both have updatedAt and remote is newer
  remoteRecords.forEach((record: any) => {
    const existing = shapeMap.get(record.id);
    if (!existing) {
      // New shape from remote - add it
      shapeMap.set(record.id, record);
      newFromRemote++;
    } else {
      // Both have this shape - use updatedAt if available, otherwise keep local
      const localTime = existing.meta?.updatedAt || existing.updatedAt || '';
      const remoteTime = record.meta?.updatedAt || record.updatedAt || '';
      if (remoteTime > localTime && remoteTime !== '') { // strict check to ensure we don't accidentally swap on empty
        shapeMap.set(record.id, record);
        updatedFromRemote++;
      }
    }
  });

  appLogger.addLog(`Merge Stats: Added ${newFromRemote} new, Updated ${updatedFromRemote} existing from remote. Total: ${shapeMap.size}`, 'info');

  // Return merged snapshot. MindmapEditor expects { store: ... } so we return that format.
  return {
    ...remote, // Take remote's schema version etc.
    ...local,  // But prefer local's metadata
    store: Object.fromEntries(shapeMap.entries()), // Return as 'store' object
    records: undefined, // Clear records to avoid confusion
  };
}

/**
 * Merge anchors by ID - union of both arrays.
 */
function mergeAnchors(local: any[] = [], remote: any[] = []): any[] {
  const anchorMap = new Map<string, any>();

  // Add all local anchors
  local.forEach(a => anchorMap.set(a.id, a));

  // Add remote anchors if they don't exist locally
  remote.forEach(a => {
    if (!anchorMap.has(a.id)) {
      anchorMap.set(a.id, a);
    }
  });

  return Array.from(anchorMap.values());
}

/**
 * Merge learnedVerses - union of verse arrays per surah.
 * Never lose learned verses from either device.
 */
function mergeLearnedVerses(
  local: Record<string, number[]> = {},
  remote: Record<string, number[]> = {}
): Record<string, number[]> {
  const allSurahs = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const merged: Record<string, number[]> = {};

  allSurahs.forEach(surahId => {
    const localVerses = new Set(local[surahId] || []);
    const remoteVerses = remote[surahId] || [];
    // Union: add all remote verses to local set
    remoteVerses.forEach(v => localVerses.add(v));
    if (localVerses.size > 0) {
      merged[surahId] = Array.from(localVerses).sort((a, b) => a - b);
    }
  });

  return merged;
}

/**
 * Merges local and remote backups.
 * Conflict-free strategy:
 * - For sets/dictionaries: Union of keys/values
 * - For mindmaps: Shape-level merge (no data loss)
 * - For counters: Take MAX values
 * - For single values: Latest date wins
 */
function mergeBackups(local: BackupData, remote: BackupData): { mergedData: BackupData; hasChanges: boolean } {
  const merged: BackupData = { ...local };
  let hasChanges = false;

  // 1. Settings (Merge with conflict-free learnedVerses)
  if (remote.settings || local.settings) {
    const localSettings = local.settings || {} as any;
    const remoteSettings = remote.settings || {} as any;
    const localUpdated = localSettings.updatedAt ? new Date(localSettings.updatedAt).getTime() : 0;
    const remoteUpdated = remoteSettings.updatedAt ? new Date(remoteSettings.updatedAt).getTime() : 0;

    // Start with whichever settings is newer for scalar fields
    const baseSettings = remoteUpdated > localUpdated ? { ...remoteSettings } : { ...localSettings };

    // But ALWAYS merge learnedVerses from both devices (never lose data)
    baseSettings.learnedVerses = mergeLearnedVerses(
      localSettings.learnedVerses || {},
      remoteSettings.learnedVerses || {}
    );

    // Union skipped surahs from both devices
    const localSkipped = new Set<number>(localSettings.skippedSurahs || []);
    const remoteSkipped: number[] = remoteSettings.skippedSurahs || [];
    remoteSkipped.forEach((s: number) => localSkipped.add(s));
    baseSettings.skippedSurahs = Array.from(localSkipped).sort((a: number, b: number) => a - b);

    merged.settings = baseSettings;

    if (JSON.stringify(local.settings) !== JSON.stringify(merged.settings)) {
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
      if (!lNode || getNodeLastReview(rNode.scheduler) > getNodeLastReview(lNode.scheduler)) {
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

  // 5. Mindmaps (Merge by Surah ID with shape-level tldraw merge)
  const remoteTime = remote.exportedAt || '';
  const localTime = local.exportedAt || '';

  if (remote.mindmaps || local.mindmaps) {
    const localMaps = local.mindmaps || {};
    const remoteMaps = remote.mindmaps || {};
    const mergedMaps: typeof localMaps = {};

    // Get all mindmap IDs from both sources
    const allIds = new Set([...Object.keys(localMaps), ...Object.keys(remoteMaps)]);

    allIds.forEach(id => {
      const lMap = localMaps[id];
      const rMap = remoteMaps[id];

      // If only one side has it, use that
      if (!lMap) {
        mergedMaps[id] = rMap;
        hasChanges = true;
        return;
      }
      if (!rMap) {
        mergedMaps[id] = lMap;
        return;
      }

      // Both have this mindmap - merge at shape level
      const rDeleted = rMap.deletedAt || '';
      const lDeleted = lMap.deletedAt || '';

      // If either deleted, check which is newer
      if (rDeleted || lDeleted) {
        const rMaxTime = rDeleted > (rMap.updatedAt || '') ? rDeleted : (rMap.updatedAt || '');
        const lMaxTime = lDeleted > (lMap.updatedAt || '') ? lDeleted : (lMap.updatedAt || '');
        if (rMaxTime > lMaxTime) {
          mergedMaps[id] = rMap;
        } else {
          mergedMaps[id] = lMap;
        }
        hasChanges = true;
        return;
      }

      // Shape-level merge: combine both tldraw snapshots
      const mergedSnapshot = mergeTldrawSnapshots(lMap.tldrawSnapshot, rMap.tldrawSnapshot);

      // Union anchors from both
      const mergedAnchors = mergeAnchors(lMap.anchors || [], rMap.anchors || []);

      // Use newer metadata for other fields
      const rTime = rMap.updatedAt || remoteTime;
      const lTime = lMap.updatedAt || localTime;
      const baseMap = rTime > lTime ? rMap : lMap;

      mergedMaps[id] = {
        ...baseMap,
        // Keep images from either source
        imageUrl: rMap.imageUrl || lMap.imageUrl || null,
        imageUrlDark: rMap.imageUrlDark || lMap.imageUrlDark || null,
        // Use merged snapshot and anchors
        tldrawSnapshot: mergedSnapshot,
        anchors: mergedAnchors,
        // isComplete is true if either thinks it's complete
        isComplete: lMap.isComplete || rMap.isComplete,
        // Use latest updatedAt
        updatedAt: rTime > lTime ? rTime : lTime,
      };

      if (JSON.stringify(lMap) !== JSON.stringify(mergedMaps[id])) {
        hasChanges = true;
      }
    });

    merged.mindmaps = mergedMaps;
  }

  // 6. Part Mindmaps (Merge by Part ID with shape-level merge)
  if (remote.partMindmaps || local.partMindmaps) {
    const localPartMaps = local.partMindmaps || {};
    const remotePartMaps = remote.partMindmaps || {};
    const mergedPartMaps: typeof localPartMaps = {};

    const allPartIds = new Set([...Object.keys(localPartMaps), ...Object.keys(remotePartMaps)]);

    allPartIds.forEach(id => {
      const lMap = localPartMaps[id];
      const rMap = remotePartMaps[id];

      if (!lMap) {
        mergedPartMaps[id] = rMap;
        hasChanges = true;
        return;
      }
      if (!rMap) {
        mergedPartMaps[id] = lMap;
        return;
      }

      // Both have this part mindmap - merge at shape level
      const rDeleted = rMap.deletedAt || '';
      const lDeleted = lMap.deletedAt || '';

      if (rDeleted || lDeleted) {
        const rMaxTime = rDeleted > (rMap.updatedAt || '') ? rDeleted : (rMap.updatedAt || '');
        const lMaxTime = lDeleted > (lMap.updatedAt || '') ? lDeleted : (lMap.updatedAt || '');
        mergedPartMaps[id] = rMaxTime > lMaxTime ? rMap : lMap;
        hasChanges = true;
        return;
      }

      // Shape-level merge
      const mergedSnapshot = mergeTldrawSnapshots(lMap.tldrawSnapshot, rMap.tldrawSnapshot);
      const rTime = rMap.updatedAt || remoteTime;
      const lTime = lMap.updatedAt || localTime;
      const baseMap = rTime > lTime ? rMap : lMap;

      mergedPartMaps[id] = {
        ...baseMap,
        imageUrl: rMap.imageUrl || lMap.imageUrl || null,
        imageUrlDark: rMap.imageUrlDark || lMap.imageUrlDark || null,
        tldrawSnapshot: mergedSnapshot,
        isComplete: lMap.isComplete || rMap.isComplete,
        updatedAt: rTime > lTime ? rTime : lTime,
      };

      if (JSON.stringify(lMap) !== JSON.stringify(mergedPartMaps[id])) {
        hasChanges = true;
      }
    });

    merged.partMindmaps = mergedPartMaps;
  }

  // 7. Listening Stats (Merge by Surah ID - take MAX values)
  if (remote.listeningStats || local.listeningStats) {
    const localStats = local.listeningStats || {};
    const remoteStats = remote.listeningStats || {};
    const mergedStats: typeof localStats = {};

    const allStatIds = new Set([...Object.keys(localStats), ...Object.keys(remoteStats)]);

    allStatIds.forEach(id => {
      const lStat = localStats[id];
      const rStat = remoteStats[id];

      if (!lStat) {
        mergedStats[id] = rStat;
        hasChanges = true;
        return;
      }
      if (!rStat) {
        mergedStats[id] = lStat;
        return;
      }

      // Take MAX values for counters (never lose progress)
      mergedStats[id] = {
        surahId: lStat.surahId,
        totalMinutes: Math.max(lStat.totalMinutes || 0, rStat.totalMinutes || 0),
        lastListened: (lStat.lastListened || '') > (rStat.lastListened || '')
          ? lStat.lastListened
          : rStat.lastListened,
      };

      if (lStat.totalMinutes !== mergedStats[id].totalMinutes ||
        lStat.lastListened !== mergedStats[id].lastListened) {
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
