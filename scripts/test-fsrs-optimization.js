#!/usr/bin/env node

const { FSRSBindingItem, FSRSBindingReview, computeParameters } = require('@open-spaced-repetition/binding');
const { generatorParameters } = require('ts-fsrs');

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSyntheticLogs({ cards = 240, minReviews = 14, maxReviews = 28, seed = 42 } = {}) {
  const random = mulberry32(seed);
  const logs = [];
  const start = Date.parse('2025-01-01T00:00:00.000Z');

  for (let cardIndex = 0; cardIndex < cards; cardIndex += 1) {
    const reviewsCount = minReviews + Math.floor(random() * (maxReviews - minReviews + 1));
    let elapsedDays = 0;
    let reviewAt = start + Math.floor(random() * 5) * 86400000;

    for (let i = 0; i < reviewsCount; i += 1) {
      const forgot = random() < 0.3;
      const rating = forgot ? 1 : 3;
      const stepDays = forgot ? 1 : 2 + Math.floor(random() * 6);
      elapsedDays = i === 0 ? 0 : stepDays;
      reviewAt += elapsedDays * 86400000;

      logs.push({
        nodeId: `card-${cardIndex}`,
        rating,
        elapsed_days: elapsedDays,
        review: new Date(reviewAt).toISOString(),
      });
    }
  }

  return logs;
}

function buildTrainSet(logs) {
  const groups = {};
  for (const log of logs) {
    if (!groups[log.nodeId]) groups[log.nodeId] = [];
    groups[log.nodeId].push(log);
  }

  const trainSet = [];
  for (const nodeId of Object.keys(groups)) {
    const nodeLogs = groups[nodeId].sort((a, b) => new Date(a.review).getTime() - new Date(b.review).getTime());
    const reviews = nodeLogs.map((log, index) => {
      const deltaT = index === 0 ? 0 : Math.max(0, Math.floor(Number(log.elapsed_days) || 0));
      return new FSRSBindingReview(log.rating, deltaT);
    });
    for (let i = 1; i < reviews.length; i += 1) {
      trainSet.push(new FSRSBindingItem(reviews.slice(0, i + 1)));
    }
  }

  return trainSet;
}

async function main() {
  const logs = generateSyntheticLogs();
  const trainSet = buildTrainSet(logs);
  const weights = await computeParameters(trainSet, { enableShortTerm: false });
  const expectedWeightsLength = generatorParameters({ enable_short_term: false }).w.length;

  const isValid =
    Array.isArray(weights) &&
    weights.length === expectedWeightsLength &&
    weights.every((v) => Number.isFinite(v));

  if (!isValid) {
    console.error('FSRS optimization test failed: invalid weights output');
    process.exit(1);
  }

  console.log('FSRS optimization test passed');
  console.log(`logs=${logs.length} trainItems=${trainSet.length} weights=${weights.length}`);
  console.log(`sample=${weights.slice(0, 5).map((v) => Number(v).toFixed(6)).join(', ')}`);
}

main().catch((err) => {
  console.error('FSRS optimization test failed with error:', err?.message || err);
  process.exit(1);
});
