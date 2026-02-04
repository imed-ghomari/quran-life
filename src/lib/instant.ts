import { init, i } from '@instantdb/react';

// TODO: Replace with your actual App ID from InstantDB dashboard
export const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || 'pr-quran-life';

const schema = i.schema({
  entities: {
    settings: i.entity({
      completionDays: i.number(),
      activePart: i.number(),
      learnedVerses: i.json(),
      skippedSurahs: i.json(),
      theme: i.string(),
      isOnboardingComplete: i.boolean(),
      kanbanColumns: i.json(),
      lastSyncedAt: i.string(),
      userId: i.string(),
    }),
    memoryNodes: i.entity({
      id: i.string(),
      type: i.string(),
      surahId: i.number(),
      partId: i.number(),
      startVerse: i.number(),
      endVerse: i.number(),
      targetId: i.string(),
      scheduler: i.json(),
      createdAt: i.string(),
      userId: i.string(),
    }),
    mindMaps: i.entity({
      surahId: i.number(),
      imageUrl: i.string(),
      imageUrlDark: i.string(),
      anchors: i.json(),
      isComplete: i.boolean(),
      tldrawSnapshot: i.json(),
      updatedAt: i.string(),
      storagePath: i.string(),
      _isRemote: i.boolean(),
      userId: i.string(),
    }),
    partMindMaps: i.entity({
      partId: i.number(),
      imageUrl: i.string(),
      imageUrlDark: i.string(),
      description: i.string(),
      isComplete: i.boolean(),
      tldrawSnapshot: i.json(),
      updatedAt: i.string(),
      storagePath: i.string(),
      _isRemote: i.boolean(),
      userId: i.string(),
    }),
    listeningProgress: i.entity({
      partId: i.number(),
      lastVerseIndex: i.number(),
      cycles: i.number(),
      updatedAt: i.string(),
      userId: i.string(),
    }),
    listeningStats: i.entity({
      surahId: i.number(),
      totalMinutes: i.number(),
      rotationCount: i.number(),
      lastListened: i.string(),
      userId: i.string(),
    }),
    mutashabihatDecisions: i.entity({
      phraseId: i.string(), // key
      status: i.string(), // 'pending' | 'ignored' | 'solved_mindmap' | 'solved_note'
      notes: i.string(),
      confirmedAt: i.string(),
      timestamp: i.string(),
      userId: i.string(),
    }),
    customMutashabihat: i.entity({
      id: i.string(),
      phrase: i.string(),
      verses: i.json(), // Array of refs
      createdAt: i.string(),
      userId: i.string(),
    }),
    reviewErrors: i.entity({
      id: i.string(),
      timestamp: i.string(),
      nodeId: i.string(),
      nodeType: i.string(),
      surahId: i.number(),
      partId: i.number(),
      startVerse: i.number(),
      endVerse: i.number(),
      grade: i.number(),
      anchorLabel: i.string(),
      anchorId: i.string(),
      absoluteAyah: i.number(),
      userId: i.string(),
    }),
    fsrsReviewLogs: i.entity({
      id: i.string(),
      nodeId: i.string(), // maps to memoryNode id
      rating: i.number(),
      state: i.number(),
      due: i.string(),
      stability: i.number(),
      difficulty: i.number(),
      elapsed_days: i.number(),
      last_elapsed_days: i.number(),
      scheduled_days: i.number(),
      review_duration: i.number(),
      review_time: i.string(),
      userId: i.string(),
    }),
    profiles: i.entity({
      fsrs_weights: i.json(),
      userId: i.string(),
    }),
    purchases: i.entity({
      email: i.string(),
      polar_checkout_id: i.string(),
      polar_customer_id: i.string(),
      polar_product_id: i.string(),
      purchased_at: i.string(),
      status: i.string(),
    }),
    optimizationMeta: i.entity({
      logCountAtLastOptimization: i.number(),
      lastOptimizedAt: i.string(),
      userId: i.string(),
    }),
    customWeights: i.entity({
      weights: i.json(),
      userId: i.string(),
    }),
  },
});

export const db = init({ appId: APP_ID, schema });

// Helper to get typed db
export type DB = typeof db;
