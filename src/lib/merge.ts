import { appLogger } from './logger';

/**
 * Merge tldraw snapshots at the shape level.
 * Each shape in the records array has a unique ID.
 * Union all shapes from both snapshots, prefer newer version if same ID exists.
 */
export function mergeTldrawSnapshots(local: any, remote: any): any {
  // Handle missing snapshots
  if (!local && !remote) return undefined;
  if (!local) return remote;
  if (!remote) return local;

  appLogger.addLog('[Sync] Merging Mindmaps...', 'info');

  // Normalize both to lists of records
  const getRecords = (snapshot: any): any[] => {
    if (snapshot?.store) return Object.values(snapshot.store);
    if (Array.isArray(snapshot?.records)) return snapshot.records;
    return [];
  };

  const localRecords = getRecords(local);
  const remoteRecords = getRecords(remote);

  appLogger.addLog(`[Sync] Local records: ${localRecords.length}, Remote records: ${remoteRecords.length}`, 'info');

  const shapeMap = new Map<string, any>();
  const allRecords = [...remoteRecords, ...localRecords];

  let updates = 0;
  let conflicts = 0;

  allRecords.forEach(record => {
    if (!record) return;
    const exists = shapeMap.get(record.id);
    if (!exists) {
      shapeMap.set(record.id, record);
    } else {
      conflicts++;
      // LWW based on updatedAt
      const timeA = exists.meta?.updatedAt || 0;
      const timeB = record.meta?.updatedAt || 0;

      if (timeB > timeA) {
        shapeMap.set(record.id, record);
        updates++;
      }
    }
  });

  appLogger.addLog(`[Sync] Merge complete. Total items: ${shapeMap.size}. Conflicts detected: ${conflicts}. Overwrites: ${updates}`, 'info');

  // Return merged snapshot. MindmapEditor expects { store: ... } so we return that format.
  return {
    ...remote, // Take remote's schema version etc.
    ...local,  // But prefer local's metadata
    store: Object.fromEntries(shapeMap.entries()), // Return as 'store' object
    records: undefined, // Clear records to avoid confusion
  };
}
