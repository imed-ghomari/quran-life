
const fs = require('fs');
const path = require('path');

const BACKUP_PATH = '/Users/imedgh/Desktop/temp_quran life/quran-life/quran-app-backup-2026-01-22.json';
const OUTPUT_PATH = path.join(process.cwd(), 'quran-mindmaps-restore.json');

try {
    console.log(`Reading backup from ${BACKUP_PATH}...`);
    const content = fs.readFileSync(BACKUP_PATH, 'utf8');
    const data = JSON.parse(content);

    const restoreData = {};
    let count = 0;

    if (data.mindmaps) {
        console.log(`Found ${Object.keys(data.mindmaps).length} Surah Mindmaps.`);
        restoreData.mindmaps = data.mindmaps;
        count += Object.keys(data.mindmaps).length;
    }

    if (data.partMindmaps) {
        console.log(`Found ${Object.keys(data.partMindmaps).length} Part Mindmaps.`);
        restoreData.partMindmaps = data.partMindmaps;
        count += Object.keys(data.partMindmaps).length;
    }

    if (count === 0) {
        console.log('No mindmaps found in the backup file.');
        process.exit(1);
    }

    // Add a timestamp to ensure it's treated as a valid backup
    restoreData.settings = {
        updatedAt: new Date().toISOString()
    };

    console.log(`Writing ${count} mindmaps to ${OUTPUT_PATH}...`);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(restoreData, null, 2));
    console.log('Done! You can now import this file via the App Settings.');

} catch (error) {
    console.error('Error processing backup:', error);
}
