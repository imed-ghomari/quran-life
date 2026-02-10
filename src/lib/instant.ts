import { init, i } from '@instantdb/react';

// InstantDB app identifier (public env var in Next.js)
// TODO: Replace with your actual App ID from InstantDB dashboard
export const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || 'pr-quran-life';

// Schema definition for all InstantDB entities used by the app.
const schema = i.schema({
  entities: {
    // User-level app preferences and progress.
    settings: i.entity({
      completionDays: i.number(),
      activePart: i.number(),
      learnedVerses: i.json(),
      skippedSurahs: i.json(),
      todoDefaultFilter: i.string(),
      reviewSortOrder: i.string(),
      completeExitBehavior: i.string(),
      kanbanSortOrder: i.string(),
      dailyPortionMode: i.string(),
      theme: i.string(),
      isOnboardingComplete: i.boolean(),
      kanbanColumns: i.json(),
      lastSyncedAt: i.string(),
      userId: i.string(),
    }),
    // Atomic memory items (verses/sections) tracked by the scheduler.
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
    // Surah-level mind maps and their snapshots.
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
      source: i.string(),
      premadeId: i.string(),
      premadeImportedAt: i.string(),
      premadeEdited: i.boolean(),
      userId: i.string(),
    }),
    // Part-level mind maps and their snapshots.
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
      source: i.string(),
      premadeId: i.string(),
      premadeImportedAt: i.string(),
      premadeEdited: i.boolean(),
      userId: i.string(),
    }),
    // Last listened verse per part (for resuming audio).
    listeningProgress: i.entity({
      partId: i.number(),
      lastVerseIndex: i.number(),
      cycles: i.number(),
      updatedAt: i.string(),
      userId: i.string(),
    }),
    // Aggregate listening stats per surah.
    listeningStats: i.entity({
      surahId: i.number(),
      totalMinutes: i.number(),
      rotationCount: i.number(),
      lastListened: i.string(),
      userId: i.string(),
    }),
    // Decisions and notes for similar-phrase (mutashabihat) items.
    mutashabihatDecisions: i.entity({
      phraseId: i.string(), // key
      status: i.string(), // 'pending' | 'ignored' | 'solved_mindmap' | 'solved_note'
      notes: i.string(),
      confirmedAt: i.string(),
      timestamp: i.string(),
      userId: i.string(),
    }),
    // User-defined similar-phrase links across verses.
    customMutashabihat: i.entity({
      id: i.string(),
      verseId: i.string(),
      targetVerseId: i.string(),
      surahId: i.number(),
      ayahId: i.number(),
      targetSurahId: i.number(),
      targetAyahId: i.number(),
      notes: i.string(),
      status: i.string(),
      createdAt: i.string(),
      userId: i.string(),
    }),
    // Mistakes recorded during review sessions.
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
    // FSRS scheduler logs for each review event.
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
    // User profile data for scheduling.
    profiles: i.entity({
      fsrs_weights: i.json(),
      userId: i.string(),
    }),
    // Metadata used when optimizing FSRS parameters.
    optimizationMeta: i.entity({
      logCountAtLastOptimization: i.number(),
      lastOptimizedAt: i.string(),
      userId: i.string(),
    }),
    // User-specified weight overrides for FSRS.
    customWeights: i.entity({
      weights: i.json(),
      userId: i.string(),
    }),
    // Subscription records (Paddle).
    subscriptions: i.entity({
      userId: i.string(),
      status: i.string(),
      paddleSubscriptionId: i.string(),
      paddleCustomerId: i.string(),
      priceId: i.string(),
      updatedAt: i.string(),
      customData: i.json(),
    }),
    // Raw webhook events for reconciliation.
    paddleWebhookEvents: i.entity({
      eventId: i.string(),
      eventType: i.string(),
      userId: i.string(),
      subscriptionId: i.string(),
      customerId: i.string(),
      status: i.string(),
      priceId: i.string(),
      processedAt: i.string(),
    }),
  },
});

// Typed database client.
export const db = init({ appId: APP_ID, schema });

// Helper to get typed db
export type DB = typeof db;
