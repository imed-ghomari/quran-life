import Dexie, { Table } from 'dexie';
import { Anchor, MindMap, PartMindMap, MemoryNode, AppSettings } from './types';

export interface MindMapDoc {
  surahId: number;
  data: MindMap;
  updatedAt: string; // ISO string
  syncedAt?: string; // ISO string
  isDeleted?: boolean;
}

export interface PartMindMapDoc {
  partId: number;
  data: PartMindMap;
  updatedAt: string;
  syncedAt?: string;
}

export interface SettingsDoc {
  key: string; // 'main'
  data: AppSettings;
  updatedAt: string;
  syncedAt?: string;
}

export interface MemoryNodeDoc {
  id: string;
  data: MemoryNode;
  updatedAt: string;
  syncedAt?: string;
  isDeleted?: boolean;
}

export interface KeyValDoc {
  key: string;
  value: any;
}

export class QuranAppDB extends Dexie {
  mindmaps!: Table<MindMapDoc, number>;
  partMindmaps!: Table<PartMindMapDoc, number>;
  settings!: Table<SettingsDoc, string>;
  memoryNodes!: Table<MemoryNodeDoc, string>;
  keyval!: Table<KeyValDoc, string>;

  constructor() {
    super('QuranAppDB');
    this.version(1).stores({
      mindmaps: 'surahId, updatedAt, syncedAt',
      partMindmaps: 'partId, updatedAt, syncedAt',
      settings: 'key, updatedAt, syncedAt',
      memoryNodes: 'id, updatedAt, syncedAt, data.type, data.surahId, data.partId, data.scheduler.due',
      keyval: 'key'
    });
  }
}

export const db = new QuranAppDB();
