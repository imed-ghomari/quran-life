
const fs = require('fs');
const path = require('path');

const RECITATIONS_DIR = path.join(process.cwd(), 'public', 'recitations');
const OUTPUT_FILE = path.join(process.cwd(), 'public', 'recitations', 'reciters.json');

function formatName(slug) {
    // Remove extension first
    let name = slug.replace(/\.json$/, '');

    // Remove prefix like 'surah-recitation-' or 'ayah-recitation-'
    name = name
        .replace(/^surah-recitation-/, '')
        .replace(/^ayah-recitation-/, '')
        .replace(/-recitation$/, '')
        .replace(/-recitation-/, '-') // intermediate
        .replace(/-streaming$/, '');
    
    // Remove trailing numbers or hash (e.g., -949)
    name = name.replace(/-\d+$/, '');
    
    // Remove (1) etc
    name = name.replace(/\s\(\d+\)/, '');

    // Replace dashes with spaces and Capitalize
    let formatted = name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
        
    // Remove 'Hafs' (case insensitive)
    formatted = formatted.replace(/\sHafs$/i, '').replace(/\sHafs\s/i, ' ');
    
    return formatted.trim();
}

function generate() {
    if (!fs.existsSync(RECITATIONS_DIR)) {
        console.error('Recitations directory not found!');
        return;
    }

    const items = fs.readdirSync(RECITATIONS_DIR);
    const reciters = [];

    items.forEach(item => {
        const fullPath = path.join(RECITATIONS_DIR, item);
        const stat = fs.statSync(fullPath);

        if (item === 'reciters.json' || item === '.DS_Store') return;

        // Filter out "with kids" or "with children"
        if (item.toLowerCase().includes('with-kids') || item.toLowerCase().includes('with-children')) {
            return;
        }

        if (stat.isDirectory()) {
            // Surah based
            const hasSurahJson = fs.existsSync(path.join(fullPath, 'surah.json'));
            const hasSegmentsJson = fs.existsSync(path.join(fullPath, 'segments.json'));

            if (hasSurahJson) {
                reciters.push({
                    id: item,
                    name: formatName(item),
                    type: 'surah-based',
                    relativePath: `/recitations/${item}`,
                    hasSegments: hasSegmentsJson
                });
            }
        } else if (item.endsWith('.json')) {
            // Ayah based
            // Skip if it doesn't look like a recitation file
            if (!item.startsWith('ayah-recitation-')) return;

            reciters.push({
                id: item.replace('.json', ''),
                name: formatName(item),
                type: 'ayah-based',
                relativePath: `/recitations/${item}`,
                hasSegments: true // Assuming ayah files generally have segment data or at least audio urls
            });
        }
    });

    // 1. Resolve exact name duplicates first (e.g. same name, different source)
    // Prioritize hasSegments > Surah-based > Cleaner ID
    const uniqueByName = new Map();
    
    reciters.forEach(reciter => {
        if (!uniqueByName.has(reciter.name)) {
            uniqueByName.set(reciter.name, reciter);
        } else {
            const existing = uniqueByName.get(reciter.name);
            let replace = false;

            // Priority 1: Has Segments (Word Highlighting)
            if (reciter.hasSegments && !existing.hasSegments) {
                replace = true;
            } else if (!reciter.hasSegments && existing.hasSegments) {
                replace = false;
            } 
            // Priority 2: Surah-based (usually better metadata)
            else if (reciter.type === 'surah-based' && existing.type === 'ayah-based') {
                replace = true;
            } else if (reciter.type === 'ayah-based' && existing.type === 'surah-based') {
                replace = false;
            }
            // Priority 3: Cleaner ID (no numbers)
            else {
                 const existingIsDirty = existing.id.match(/\(\d+\)$/) || existing.id.match(/-\d+$/);
                 const newIsDirty = reciter.id.match(/\(\d+\)$/) || reciter.id.match(/-\d+$/);
                 if (existingIsDirty && !newIsDirty) replace = true;
            }

            if (replace) {
                console.log(`[Duplicate] Replacing ${existing.id} with ${reciter.id} for "${reciter.name}"`);
                uniqueByName.set(reciter.name, reciter);
            } else {
                console.log(`[Duplicate] Keeping ${existing.id} for "${reciter.name}"`);
            }
        }
    });

    let processedReciters = Array.from(uniqueByName.values());

    // 2. Remove "Generic" entries if "Specific" ones exist
    // e.g. Remove "Name" if "Name Murattal" or "Name Mujawwad" exists
    const styles = ['Murattal', 'Mujawwad', 'Muallim', 'Warsh', 'Qaloon'];
    const namesToRemove = new Set();

    processedReciters.forEach(generic => {
        // Check if this generic reciter matches the start of any specific reciter
        const isGeneric = processedReciters.some(specific => {
            if (generic.id === specific.id) return false;
            
            // Check if specific name starts with generic name
            if (specific.name.startsWith(generic.name)) {
                // Check if the remainder is a known style
                const remainder = specific.name.slice(generic.name.length).trim();
                return styles.some(style => remainder === style || remainder.startsWith(style));
            }
            return false;
        });

        if (isGeneric) {
            console.log(`[Redundant] Removing generic "${generic.name}" because specific variations exist.`);
            namesToRemove.add(generic.id);
        }
    });

    processedReciters = processedReciters.filter(r => !namesToRemove.has(r.id));

    // 3. Add Visual Indicator for Word Highlighting
    // processedReciters.forEach(r => {
    //     if (r.hasSegments) {
    //         r.name = `${r.name} (Words)`;
    //     }
    // });

    // Sort by name
    processedReciters.sort((a, b) => a.name.localeCompare(b.name));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedReciters, null, 2));
    console.log(`Generated ${processedReciters.length} reciters in ${OUTPUT_FILE}`);
}

generate();
