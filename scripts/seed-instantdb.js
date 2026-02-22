const { init } = require('@instantdb/admin');
const { randomUUID } = require('crypto');

const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || 'pr-quran-life';
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN;

if (!adminToken) {
  console.error('Missing INSTANT_APP_ADMIN_TOKEN');
  process.exit(1);
}

const db = init({ appId, adminToken });

async function main() {
  const now = new Date();
  const iso = now.toISOString();
  const eventEntityId = randomUUID();
  const subscriptionEntityId = randomUUID();
  const customerId = 'seed-customer-id';
  const priceId = 'seed-price-id';
  const memoryNodeEntityId = randomUUID();
  const mindMapSurahId = 1;
  const partId = 1;
  const reviewEntityId = randomUUID();
  const fsrsLogEntityId = randomUUID();
  const customMutashabihatEntityId = randomUUID();
  const settingsEntityId = randomUUID();
  const mindMapEntityId = randomUUID();
  const partMindMapEntityId = randomUUID();
  const listeningProgressEntityId = randomUUID();
  const listeningStatsEntityId = randomUUID();
  const mutashabihatDecisionEntityId = randomUUID();
  const profileEntityId = randomUUID();
  const optimizationMetaEntityId = randomUUID();
  const customWeightsEntityId = randomUUID();

  const userId = `seed-user-${randomUUID()}`;
  const subscriptionId = `seed-subscription-${subscriptionEntityId}`;
  const eventId = `seed-event-${eventEntityId}`;

  await db.transact([
    db.tx.settings[settingsEntityId].update({
      completionDays: 7,
      activePart: 1,
      partSystemVersion: 2,
      learnedVerses: [],
      skippedSurahs: [],
      theme: 'light',
      isOnboardingComplete: false,
      kanbanColumns: [],
      lastSyncedAt: iso,
      userId,
    }),
    db.tx.memoryNodes[memoryNodeEntityId].update({
      id: memoryNodeEntityId,
      type: 'verse',
      surahId: 1,
      partId,
      startVerse: 1,
      endVerse: 1,
      targetId: 'seed-target-id',
      scheduler: {},
      createdAt: iso,
      userId,
    }),
    db.tx.mindMaps[mindMapEntityId].update({
      surahId: mindMapSurahId,
      imageUrl: '',
      imageUrlDark: '',
      anchors: [],
      isComplete: false,
      tldrawSnapshot: {},
      updatedAt: iso,
      storagePath: '',
      _isRemote: false,
      source: 'seed',
      premadeId: '',
      premadeImportedAt: '',
      premadeEdited: false,
      userId,
    }),
    db.tx.partMindMaps[partMindMapEntityId].update({
      partId,
      imageUrl: '',
      imageUrlDark: '',
      description: '',
      isComplete: false,
      tldrawSnapshot: {},
      updatedAt: iso,
      storagePath: '',
      _isRemote: false,
      source: 'seed',
      premadeId: '',
      premadeImportedAt: '',
      premadeEdited: false,
      userId,
    }),
    db.tx.listeningProgress[listeningProgressEntityId].update({
      partId,
      lastVerseIndex: 0,
      cycles: 0,
      updatedAt: iso,
      userId,
    }),
    db.tx.listeningStats[listeningStatsEntityId].update({
      surahId: 1,
      totalMinutes: 0,
      rotationCount: 0,
      lastListened: iso,
      userId,
    }),
    db.tx.mutashabihatDecisions[mutashabihatDecisionEntityId].update({
      phraseId: 'seed-phrase-id',
      status: 'pending',
      notes: '',
      confirmedAt: '',
      timestamp: iso,
      userId,
    }),
    db.tx.customMutashabihat[customMutashabihatEntityId].update({
      id: customMutashabihatEntityId,
      verseId: '1:1',
      targetVerseId: '1:2',
      surahId: 1,
      ayahId: 1,
      targetSurahId: 1,
      targetAyahId: 2,
      notes: '',
      status: 'pending',
      createdAt: iso,
      userId,
    }),
    db.tx.reviewErrors[reviewEntityId].update({
      id: reviewEntityId,
      timestamp: iso,
      nodeId: memoryNodeEntityId,
      nodeType: 'verse',
      surahId: 1,
      partId,
      startVerse: 1,
      endVerse: 1,
      grade: 0,
      anchorLabel: '',
      anchorId: '',
      absoluteAyah: 1,
      userId,
    }),
    db.tx.fsrsReviewLogs[fsrsLogEntityId].update({
      id: fsrsLogEntityId,
      nodeId: memoryNodeEntityId,
      rating: 0,
      state: 0,
      due: iso,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      last_elapsed_days: 0,
      scheduled_days: 0,
      review_duration: 0,
      review_time: iso,
      userId,
    }),
    db.tx.profiles[profileEntityId].update({
      fsrs_weights: {},
      userId,
    }),
    db.tx.optimizationMeta[optimizationMetaEntityId].update({
      logCountAtLastOptimization: 0,
      lastOptimizedAt: iso,
      userId,
    }),
    db.tx.customWeights[customWeightsEntityId].update({
      weights: {},
      userId,
    }),
    db.tx.subscriptions[subscriptionEntityId].update({
      userId,
      status: 'active',
      paddleSubscriptionId: subscriptionId,
      paddleCustomerId: customerId,
      priceId,
      updatedAt: iso,
      customData: {},
    }),
    db.tx.paddleWebhookEvents[eventEntityId].update({
      eventId,
      eventType: 'subscription.created',
      userId,
      subscriptionId,
      customerId,
      status: 'active',
      priceId,
      processedAt: iso,
    }),
  ]);

  console.log('Seeded all InstantDB entities with userId:', userId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
