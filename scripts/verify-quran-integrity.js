#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORD_FILE = path.join(process.cwd(), 'public', 'qpc-hafs-word-by-word.json');
const CANON_FILE = path.join(process.cwd(), 'quran-simple.txt');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCanonicalVerses(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const verses = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const firstSep = line.indexOf('|');
    const secondSep = line.indexOf('|', firstSep + 1);
    if (firstSep <= 0 || secondSep <= firstSep) continue;
    const surahId = Number(line.slice(0, firstSep));
    const ayahId = Number(line.slice(firstSep + 1, secondSep));
    if (!Number.isInteger(surahId) || !Number.isInteger(ayahId)) continue;
    verses.push({ surahId, ayahId });
  }
  return verses;
}

function parseQpcToVerses(wordByWord) {
  const versesMap = new Map();
  const keys = Object.keys(wordByWord);

  for (const key of keys) {
    const item = wordByWord[key];
    if (!item || typeof item !== 'object') continue;
    const surahId = Number(item.surah);
    const ayahId = Number(item.ayah);
    if (!Number.isFinite(surahId) || !Number.isFinite(ayahId)) continue;
    const verseKey = `${surahId}:${ayahId}`;
    const verseWords = versesMap.get(verseKey) || [];
    const text = typeof item.text === 'string' ? item.text : '';
    const isMarker = text.length <= 3 && /^[\u0660-\u0669]+$/.test(text);
    if (!isMarker && text.length > 0) {
      verseWords.push(text);
    }
    versesMap.set(verseKey, verseWords);
  }

  return [...versesMap.entries()]
    .map(([verseKey, words]) => {
      const [surahId, ayahId] = verseKey.split(':').map(Number);
      return { surahId, ayahId, text: words.join(' ') };
    })
    .sort((a, b) => (a.surahId - b.surahId) || (a.ayahId - b.ayahId));
}

function checkSurahAyahContinuity(verseKeys) {
  const bySurah = new Map();
  for (const key of verseKeys) {
    const [surahId, ayahId] = key.split(':').map(Number);
    const ayahs = bySurah.get(surahId) || [];
    ayahs.push(ayahId);
    bySurah.set(surahId, ayahs);
  }

  for (let surahId = 1; surahId <= 114; surahId += 1) {
    if (!bySurah.has(surahId)) {
      fail(`Missing surah ${surahId}`);
      continue;
    }
    const ayahs = [...new Set(bySurah.get(surahId))].sort((a, b) => a - b);
    for (let i = 0; i < ayahs.length; i += 1) {
      const expected = i + 1;
      if (ayahs[i] !== expected) {
        fail(`Surah ${surahId} has ayah gap/order issue at position ${expected} (found ${ayahs[i] ?? 'none'})`);
        break;
      }
    }
  }
}

function main() {
  if (!fs.existsSync(WORD_FILE)) {
    fail(`Missing file: ${WORD_FILE}`);
    return;
  }
  if (!fs.existsSync(CANON_FILE)) {
    fail(`Missing file: ${CANON_FILE}`);
    return;
  }

  const wordByWord = readJson(WORD_FILE);
  const canonicalVerses = readCanonicalVerses(CANON_FILE);
  const parsedVerses = parseQpcToVerses(wordByWord);

  if (!wordByWord || typeof wordByWord !== 'object' || Array.isArray(wordByWord)) {
    fail('Word-by-word file must be an object keyed by surah:ayah:word');
    return;
  }

  const expectedKeys = canonicalVerses.map(v => `${v.surahId}:${v.ayahId}`);
  const expectedSet = new Set(expectedKeys);
  const parsedKeys = parsedVerses.map(v => `${v.surahId}:${v.ayahId}`);
  const parsedSet = new Set(parsedKeys);

  if (canonicalVerses.length !== 6236) {
    fail(`Canonical source should contain 6236 verses, found ${canonicalVerses.length}`);
  }
  if (parsedVerses.length !== 6236) {
    fail(`Parsed word-by-word source should contain 6236 verses, found ${parsedVerses.length}`);
  }

  for (const [rawKey, item] of Object.entries(wordByWord)) {
    const keyMatch = rawKey.match(/^(\d+):(\d+):(\d+)$/);
    if (!keyMatch) {
      fail(`Invalid key format: ${rawKey}`);
      continue;
    }
    const surahId = Number(keyMatch[1]);
    const ayahId = Number(keyMatch[2]);
    const wordId = Number(keyMatch[3]);
    if (!item || typeof item !== 'object') {
      fail(`Invalid word entry object at key: ${rawKey}`);
      continue;
    }
    if (Number(item.surah) !== surahId || Number(item.ayah) !== ayahId || Number(item.word) !== wordId) {
      fail(`Mismatched location fields at key: ${rawKey}`);
    }
    if (item.location !== rawKey) {
      fail(`Mismatched location string at key: ${rawKey}`);
    }
    if (typeof item.text !== 'string') {
      fail(`Non-string word text at key: ${rawKey}`);
    }
  }

  checkSurahAyahContinuity(expectedSet);
  checkSurahAyahContinuity(parsedSet);

  for (const key of expectedSet) {
    if (!parsedSet.has(key)) {
      fail(`Missing verse in app source: ${key}`);
    }
  }
  for (const key of parsedSet) {
    if (!expectedSet.has(key)) {
      fail(`Unexpected extra verse in app source: ${key}`);
    }
  }

  for (const verse of parsedVerses) {
    if (!verse.text || !verse.text.trim()) {
      fail(`Empty verse text after parsing: ${verse.surahId}:${verse.ayahId}`);
    }
  }

  const expectedSorted = [...expectedSet].sort((a, b) => {
    const [sa, aa] = a.split(':').map(Number);
    const [sb, ab] = b.split(':').map(Number);
    return (sa - sb) || (aa - ab);
  });
  for (let i = 0; i < expectedSorted.length; i += 1) {
    if (parsedKeys[i] !== expectedSorted[i]) {
      fail(`Verse order mismatch at index ${i + 1}: expected ${expectedSorted[i]}, got ${parsedKeys[i]}`);
      break;
    }
  }

  if (process.exitCode && process.exitCode !== 0) return;

  console.log('Quran integrity check passed.');
  console.log(`Words entries: ${Object.keys(wordByWord).length}`);
  console.log(`Verses parsed: ${parsedVerses.length}`);
  console.log('Surah coverage: 1-114 with contiguous ayah order in each surah');
}

main();
