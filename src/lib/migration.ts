
import { db } from './db';
import { createStore, get, entries } from 'idb-keyval';
import { MindMap, PartMindMap, MemoryNode, AppSettings } from './types';
import { appLogger } from './logger';

const OLD_DB_NAME = 'quran-app-db';
const OLD_STORE_NAME = 'quran-app-store';
const customStore = typeof window !== 'undefined' ? createStore(OLD_DB_NAME, OLD_STORE_NAME) : undefined;

const STORAGE_KEYS = {
    SETTINGS: 'quran-app-settings',
    MEMORY_NODES: 'quran-app-memory-nodes',
    MINDMAPS_INDEX: 'quran-app-mindmaps-index',
    PART_MINDMAPS_INDEX: 'quran-app-part-mindmaps-index',
};

export async function migrateToDexie() {
    if (typeof window === 'undefined' || !customStore) return;

    const MIGRATION_FLAG = 'quran-app-migrated-to-dexie-v1';
    if (localStorage.getItem(MIGRATION_FLAG)) {
        return;
    }

    try {
        appLogger.addLog('Starting migration to Dexie...', 'info');

        // 1. Migrate Settings
        const settings = await get<AppSettings>(STORAGE_KEYS.SETTINGS, customStore);
        if (settings) {
            await db.settings.put({
                key: 'main',
                data: settings,
                updatedAt: new Date().toISOString()
            });
            appLogger.addLog('Settings migrated', 'success');
        }

        // 2. Migrate Memory Nodes
        const nodes = await get<MemoryNode[]>(STORAGE_KEYS.MEMORY_NODES, customStore);
        if (nodes && Array.isArray(nodes)) {
            const batch = nodes.map(node => ({
                id: node.id,
                data: node,
                updatedAt: new Date().toISOString()
            }));
            await db.memoryNodes.bulkPut(batch);
            appLogger.addLog(`${nodes.length} memory nodes migrated`, 'success');
        }

        // 3. Migrate Mindmaps (Split Keys)
        const mindmapIndex = await get<Record<string, Omit<MindMap, 'tldrawSnapshot'>>>(STORAGE_KEYS.MINDMAPS_INDEX, customStore);
        if (mindmapIndex) {
            const promises = Object.keys(mindmapIndex).map(async (key) => {
                const surahId = parseInt(key);
                // Try to get full data from split key
                const fullData = await get<MindMap>(`quran-app-mindmap-${surahId}`, customStore);
                const data = fullData || { ...mindmapIndex[key], surahId } as MindMap;
                
                return {
                    surahId,
                    data,
                    updatedAt: new Date().toISOString()
                };
            });
            
            const mindmaps = await Promise.all(promises);
            await db.mindmaps.bulkPut(mindmaps);
            appLogger.addLog(`${mindmaps.length} mindmaps migrated`, 'success');
        }

        // 4. Migrate Part Mindmaps
        const partIndex = await get<Record<string, Omit<PartMindMap, 'tldrawSnapshot'>>>(STORAGE_KEYS.PART_MINDMAPS_INDEX, customStore);
        if (partIndex) {
             const promises = Object.keys(partIndex).map(async (key) => {
                const partId = parseInt(key);
                const fullData = await get<PartMindMap>(`quran-app-part-mindmap-${partId}`, customStore);
                const data = fullData || { ...partIndex[key], partId } as PartMindMap;
                
                return {
                    partId,
                    data,
                    updatedAt: new Date().toISOString()
                };
            });

            const parts = await Promise.all(promises);
            await db.partMindmaps.bulkPut(parts);
            appLogger.addLog(`${parts.length} part mindmaps migrated`, 'success');
        }

        localStorage.setItem(MIGRATION_FLAG, 'true');
        appLogger.addLog('Migration to Dexie complete', 'success');

    } catch (error) {
        console.error('Migration failed:', error);
        appLogger.addLog('Migration to Dexie failed', 'error');
    }
}
