export default {
  // Users can only see their own user record.
  $users: {
    allow: {
      view: "auth.id == data.id",
      update: "auth.id == data.id",
    },
  },
  settings: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  memoryNodes: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  mindMaps: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  partMindMaps: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  listeningProgress: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  listeningStats: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  mutashabihatDecisions: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  customMutashabihat: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  reviewErrors: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  fsrsReviewLogs: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  profiles: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  optimizationMeta: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  customWeights: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  subscriptions: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
  paddleWebhookEvents: {
    allow: {
      view: "auth.id == data.userId",
      create: "auth.id == data.userId",
      update: "auth.id == data.userId",
      delete: "auth.id == data.userId",
    },
  },
};
