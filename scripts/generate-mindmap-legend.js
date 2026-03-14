const fs = require('fs');
const path = require('path');

const THUMB_SIZE_PX = 12;

const SYMBOL_GROUPS = [
    {
        name: 'People and Beings',
        symbols: [
            'people',
            'male',
            'female',
            'prophets:believers',
            'angels',
            'devil:disbelievers',
            'sperm',
        ],
    },
    {
        name: 'Worship and Faith',
        symbols: [
            'praying:worship',
            'supplication',
            'remember:belief',
            'reminder:warning',
            'disbelief',
            'quran',
            'book',
        ],
    },
    {
        name: 'Knowledge and Structure',
        symbols: [
            'surah name in arabic',
            'verse group',
            'speech:talk',
            'therefore',
            'opposit',
        ],
    },
    {
        name: 'Senses and Perspective',
        symbols: [
            'see',
            'not seeing',
            'high',
        ],
    },
    {
        name: 'Time and World',
        symbols: [
            'sun:day',
            'moon:night',
            'time',
            'world',
        ],
    },
    {
        name: 'Destinations and Realities',
        symbols: [
            'destination',
            'paradise',
            'hellfire',
            'kaba',
            'money:wealth:resource',
        ],
    },
];

function slugifyTitle(title) {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function htmlEscape(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function buildSourceTitleToFileMap(sourceDir) {
    const map = new Map();
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const fileName = entry.name;
        const ext = path.extname(fileName).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) continue;
        const title = path.basename(fileName, path.extname(fileName)).toLowerCase().trim();
        map.set(title, fileName);
    }

    return map;
}

function renderSymbolRow(symbol, imageUrl) {
    const safe = htmlEscape(symbol);
    const displayMeaning = htmlEscape(symbol.replaceAll(':', '/'));
    return [
        '    <tr>',
        `      <td><img src="${imageUrl}" alt="${safe}" title="${safe}" width={${THUMB_SIZE_PX}} height={${THUMB_SIZE_PX}} style={{ width: '${THUMB_SIZE_PX}px', height: '${THUMB_SIZE_PX}px', objectFit: 'contain', display: 'block' }} /></td>`,
        `      <td>${displayMeaning}</td>`,
        '    </tr>',
    ].join('\n');
}

function renderGroupTable(group, symbolToImageUrl) {
    const rows = group.symbols
        .map((symbol) => renderSymbolRow(symbol, symbolToImageUrl.get(symbol)))
        .join('\n');

    return [
        `## ${group.name}`,
        '',
        '<table>',
        '  <thead>',
        '    <tr>',
        '      <th>Symbol</th>',
        '      <th>Meaning</th>',
        '    </tr>',
        '  </thead>',
        '  <tbody>',
        rows,
        '  </tbody>',
        '</table>',
    ].join('\n');
}

function main() {
    const root = process.cwd();
    const sourceDir = path.join(root, 'symbol meanings');
    const publicDir = path.join(root, 'public', 'assets', 'symbol-meanings');
    const legendFile = path.join(root, 'content', 'mindmaps', 'legend.mdx');

    if (!fs.existsSync(sourceDir)) {
        throw new Error(`Missing source folder: ${sourceDir}`);
    }

    fs.mkdirSync(publicDir, { recursive: true });

    const sourceTitleMap = buildSourceTitleToFileMap(sourceDir);
    const symbolToImageUrl = new Map();
    const expectedFiles = new Set();

    for (const group of SYMBOL_GROUPS) {
        for (const symbol of group.symbols) {
            const sourceFile = sourceTitleMap.get(symbol.toLowerCase());
            if (!sourceFile) {
                throw new Error(`Symbol "${symbol}" is configured but no matching file was found in "symbol meanings".`);
            }

            const ext = path.extname(sourceFile).toLowerCase() === '.jpeg' ? '.jpg' : path.extname(sourceFile).toLowerCase();
            const outFile = `${slugifyTitle(symbol)}${ext}`;
            const sourcePath = path.join(sourceDir, sourceFile);
            const outPath = path.join(publicDir, outFile);
            fs.copyFileSync(sourcePath, outPath);

            expectedFiles.add(outFile);
            symbolToImageUrl.set(symbol, `/assets/symbol-meanings/${outFile}`);
        }
    }

    // Keep the public folder clean from stale assets that are no longer configured.
    const existingPublicFiles = fs.readdirSync(publicDir);
    for (const existing of existingPublicFiles) {
        const existingPath = path.join(publicDir, existing);
        if (!fs.statSync(existingPath).isFile()) continue;
        if (!expectedFiles.has(existing)) {
            fs.unlinkSync(existingPath);
        }
    }

    const tableBlocks = SYMBOL_GROUPS.map((group) => renderGroupTable(group, symbolToImageUrl)).join('\n\n');

    const legendMdx = [
        '# Mindmap Legend (Read First)',
        '',
        'Use this page as a **reference key** for the symbols used in mindmap documentation.',
        'Check this legend first before reading any Part or Surah mindmap page.',
        '',
        '## Symbol Key',
        '',
        `All symbol images below use the same frame size (${THUMB_SIZE_PX}px) for consistency, with \`object-fit: contain\` so no part of any symbol gets cropped.`,
        '',
        tableBlocks,
        '',
        '## How To Use This With Other Mindmaps',
        '',
        '1. Open this legend first.',
        '2. Keep these meanings in mind while reading Part and Surah mindmaps.',
        '3. If any symbol meaning is unclear, refer back to this legend page.',
        '',
        '## Note',
        '',
        'This is the canonical legend for documentation mindmaps and is maintained by the project maintainer.',
        'If a symbol appears unclear in any page, refer back to this file.',
        '',
    ].join('\n');

    fs.writeFileSync(legendFile, legendMdx, 'utf8');

    console.log(`✅ Generated ${path.relative(root, legendFile)} with ${SYMBOL_GROUPS.flatMap((g) => g.symbols).length} symbols.`);
    console.log(`✅ Synced symbol assets to ${path.relative(root, publicDir)}.`);
}

main();
