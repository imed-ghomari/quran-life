const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;
const apply = process.argv.includes('--apply');

if (!appId) {
  console.error('Missing NEXT_PUBLIC_INSTANT_APP_ID');
  process.exit(1);
}

if (!adminToken) {
  console.error('Missing INSTANT_APP_ADMIN_TOKEN (or INSTANT_ADMIN_TOKEN)');
  process.exit(1);
}

const db = init({ appId, adminToken });

function toMillis(row) {
  const candidates = [
    row?.lastSyncedAt,
    row?.updatedAt,
    row?.timestamp,
    row?.lastOptimizedAt,
    row?.lastListened,
    row?.review_time,
    row?.createdAt,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const ms = Date.parse(String(value));
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function hasValidTimestamp(row) {
  return Number.isFinite(toMillis(row)) && toMillis(row) > 0;
}

function makeKey(parts) {
  return parts.map((v) => String(v ?? '').trim()).join('::');
}

function dedupeRows(rows, keyFn) {
  const groupsByKey = new Map();
  const deleteIds = [];
  const skipped = [];
  const ambiguousKeys = [];

  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key) {
      skipped.push(row?.id);
      continue;
    }
    if (!groupsByKey.has(key)) groupsByKey.set(key, []);
    groupsByKey.get(key).push(row);
  }

  let kept = 0;
  for (const [key, group] of groupsByKey.entries()) {
    if (group.length <= 1) {
      kept += group.length;
      continue;
    }

    // Safety-first: only delete duplicates when all rows in the group have valid timestamps.
    const allHaveValidTimestamps = group.every(hasValidTimestamp);
    if (!allHaveValidTimestamps) {
      kept += group.length;
      ambiguousKeys.push(key);
      continue;
    }

    const sorted = [...group].sort((a, b) => {
      const diff = toMillis(b) - toMillis(a);
      if (diff !== 0) return diff;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });

    const winner = sorted[0];
    kept += 1;
    for (let i = 1; i < sorted.length; i += 1) {
      const candidate = sorted[i];
      if (candidate?.id && candidate.id !== winner?.id) {
        deleteIds.push(candidate.id);
      }
    }
  }

  return {
    kept,
    duplicates: deleteIds.length,
    deleteIds,
    skipped,
    ambiguousKeys,
  };
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

async function main() {
  const data = await db.query({
    settings: {},
    mindMaps: {},
    partMindMaps: {},
    listeningProgress: {},
    listeningStats: {},
    mutashabihatDecisions: {},
  });

  const plans = [
    {
      name: 'settings',
      entity: 'settings',
      result: dedupeRows(data.settings, (row) => makeKey([row.userId])),
      tx: (id) => db.tx.settings[id].delete(),
    },
    {
      name: 'mindMaps',
      entity: 'mindMaps',
      result: dedupeRows(data.mindMaps, (row) => makeKey([row.userId, row.surahId])),
      tx: (id) => db.tx.mindMaps[id].delete(),
    },
    {
      name: 'partMindMaps',
      entity: 'partMindMaps',
      result: dedupeRows(data.partMindMaps, (row) => makeKey([row.userId, row.partId])),
      tx: (id) => db.tx.partMindMaps[id].delete(),
    },
    {
      name: 'listeningProgress',
      entity: 'listeningProgress',
      result: dedupeRows(data.listeningProgress, (row) => makeKey([row.userId, row.partId])),
      tx: (id) => db.tx.listeningProgress[id].delete(),
    },
    {
      name: 'listeningStats',
      entity: 'listeningStats',
      result: dedupeRows(data.listeningStats, (row) => makeKey([row.userId, row.surahId])),
      tx: (id) => db.tx.listeningStats[id].delete(),
    },
    {
      name: 'mutashabihatDecisions',
      entity: 'mutashabihatDecisions',
      result: dedupeRows(data.mutashabihatDecisions, (row) => makeKey([row.userId, row.phraseId])),
      tx: (id) => db.tx.mutashabihatDecisions[id].delete(),
    },
  ];

  let totalDuplicates = 0;
  for (const plan of plans) {
    totalDuplicates += plan.result.duplicates;
    console.log(
      `[${plan.name}] rows=${(data[plan.entity] || []).length} keep=${plan.result.kept} duplicates=${plan.result.duplicates} skipped=${plan.result.skipped.length} ambiguous=${plan.result.ambiguousKeys.length}`,
    );
  }

  if (totalDuplicates === 0) {
    console.log('No duplicates found.');
    return;
  }

  if (!apply) {
    console.log(`Dry run: ${totalDuplicates} duplicate rows would be deleted.`);
    console.log('Note: Ambiguous duplicate groups (missing timestamps) are skipped for safety.');
    console.log('Re-run with --apply to execute cleanup.');
    return;
  }

  for (const plan of plans) {
    const ids = plan.result.deleteIds;
    if (ids.length === 0) continue;

    const batches = chunk(ids, 100);
    for (const batch of batches) {
      await db.transact(batch.map((id) => plan.tx(id)));
    }
    console.log(`[${plan.name}] deleted ${ids.length} duplicate rows.`);
  }

  console.log(`Cleanup complete. Deleted ${totalDuplicates} duplicate rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
