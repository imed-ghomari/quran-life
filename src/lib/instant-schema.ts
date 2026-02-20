import { i } from '@instantdb/core';

// Schema definition for all InstantDB entities used by the app.
export const schema = i.schema({
  entities: {
    // User-level app preferences and progress.
    settings: i.entity({
      completionDays: i.number(),
      activePart: i.number(),
      learnedVerses: i.json().optional(),
      skippedSurahs: i.json().optional(),
      todoDefaultFilter: i.string().optional(),
      reviewSortOrder: i.string().optional(),
      completeExitBehavior: i.string().optional(),
      kanbanSortOrder: i.string().optional(),
      dailyPortionMode: i.string().optional(),
      todayDefaultMode: i.string().optional(),
      theme: i.string().optional(),
      isOnboardingComplete: i.boolean().optional(),
      kanbanColumns: i.json().optional(),
      suspendedVerseGroupsAcknowledged: i.json().optional(),
      audioSettings: i.json().optional(),
      lastSyncedAt: i.string().optional(),
      userId: i.string().indexed(),
    }),
    // Atomic memory items (verses/sections) tracked by the scheduler.
    memoryNodes: i.entity({
      type: i.string(),
      surahId: i.number().optional(),
      partId: i.number().optional(),
      startVerse: i.number().optional(),
      endVerse: i.number().optional(),
      targetId: i.string().optional(),
      scheduler: i.json().optional(),
      createdAt: i.string().optional(),
      userId: i.string().indexed(),
    }),
    // Surah-level mind maps and their snapshots.
    mindMaps: i.entity({
      surahId: i.number(),
      imageUrl: i.string().optional(),
      imageUrlDark: i.string().optional(),
      anchors: i.json().optional(),
      isComplete: i.boolean().optional(),
      tldrawSnapshot: i.json().optional(),
      updatedAt: i.string().optional(),
      storagePath: i.string().optional(),
      _isRemote: i.boolean().optional(),
      source: i.string().optional(),
      premadeId: i.string().optional(),
      premadeImportedAt: i.string().optional(),
      premadeEdited: i.boolean().optional(),
      userId: i.string().indexed(),
    }),
    // Part-level mind maps and their snapshots.
    partMindMaps: i.entity({
      partId: i.number(),
      imageUrl: i.string().optional(),
      imageUrlDark: i.string().optional(),
      description: i.string().optional(),
      isComplete: i.boolean().optional(),
      tldrawSnapshot: i.json().optional(),
      updatedAt: i.string().optional(),
      storagePath: i.string().optional(),
      _isRemote: i.boolean().optional(),
      source: i.string().optional(),
      premadeId: i.string().optional(),
      premadeImportedAt: i.string().optional(),
      premadeEdited: i.boolean().optional(),
      userId: i.string().indexed(),
    }),
    // Last listened verse per part (for resuming audio).
    listeningProgress: i.entity({
      partId: i.number(),
      lastVerseIndex: i.number().optional(),
      cycles: i.number().optional(),
      updatedAt: i.string().optional(),
      userId: i.string().indexed(),
    }),
    // Aggregate listening stats per surah.
    listeningStats: i.entity({
      surahId: i.number(),
      totalMinutes: i.number().optional(),
      rotationCount: i.number().optional(),
      lastListened: i.string().optional(),
      userId: i.string().indexed(),
    }),
    // Decisions and notes for similar-phrase (mutashabihat) items.
    mutashabihatDecisions: i.entity({
      phraseId: i.string(), // key
      status: i.string(), // 'pending' | 'ignored' | 'solved_mindmap' | 'solved_note'
      notes: i.string().optional(),
      confirmedAt: i.string().optional(),
      timestamp: i.string().optional(),
      userId: i.string().indexed(),
    }),
    // User-defined similar-phrase links across verses.
    customMutashabihat: i.entity({
      verseId: i.string(),
      targetVerseId: i.string(),
      surahId: i.number(),
      ayahId: i.number(),
      targetSurahId: i.number(),
      targetAyahId: i.number(),
      notes: i.string(),
      status: i.string(),
      createdAt: i.string(),
      userId: i.string().indexed(),
    }),
    // Mistakes recorded during review sessions.
    reviewErrors: i.entity({
      type: i.string().optional(),
      timestamp: i.string().optional(),
      nodeId: i.string().optional(),
      nodeType: i.string().optional(),
      surahId: i.number().optional(),
      partId: i.number().optional(),
      startVerse: i.number().optional(),
      endVerse: i.number().optional(),
      grade: i.number().optional(),
      anchorLabel: i.string().optional(),
      anchorId: i.string().optional(),
      absoluteAyah: i.number().optional(),
      userId: i.string().indexed(),
    }),
    // FSRS scheduler logs for each review event.
    fsrsReviewLogs: i.entity({
      nodeId: i.string(), // maps to memoryNode id
      rating: i.number().optional(),
      state: i.number().optional(),
      due: i.string().optional(),
      stability: i.number().optional(),
      difficulty: i.number().optional(),
      elapsed_days: i.number().optional(),
      last_elapsed_days: i.number().optional(),
      scheduled_days: i.number().optional(),
      review_duration: i.number().optional(),
      review_time: i.string().optional(),
      userId: i.string().indexed(),
    }),
    // User profile data for scheduling.
    profiles: i.entity({
      fsrs_weights: i.json().optional(),
      userId: i.string().indexed(),
    }),
    // Metadata used when optimizing FSRS parameters.
    optimizationMeta: i.entity({
      logCountAtLastOptimization: i.number().optional(),
      lastOptimizedAt: i.string().optional(),
      userId: i.string().indexed(),
    }),
    // User-specified weight overrides for FSRS.
    customWeights: i.entity({
      weights: i.json().optional(),
      userId: i.string().indexed(),
    }),
    // Subscription records (Paddle).
    subscriptions: i.entity({
      userId: i.string().indexed(),
      status: i.string().optional(),
      paddleSubscriptionId: i.string().optional(),
      paddleCustomerId: i.string().optional(),
      priceId: i.string().optional(),
      updatedAt: i.string().optional(),
      customData: i.json().optional(),
    }),
    // Raw webhook events for reconciliation.
    paddleWebhookEvents: i.entity({
      eventId: i.string().indexed(),
      eventType: i.string().optional(),
      userId: i.string().indexed(),
      subscriptionId: i.string().optional(),
      customerId: i.string().optional(),
      status: i.string().optional(),
      priceId: i.string().optional(),
      processedAt: i.string().optional(),
    }),
  },
});

export default schema;
