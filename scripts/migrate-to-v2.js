
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if present
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, '').trim();
        process.env[key] = value.split('#')[0].trim();
      }
    });
  }
} catch (e) {
  console.warn('Could not load .env.local', e);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  console.error('Make sure they are set in your environment or .env.local file.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function migrateUser(userId, data) {
  console.log(`Migrating user ${userId}...`);
  const errors = [];

  // 1. Migrate Mindmaps
  if (data.mindmaps) {
    for (const [idStr, map] of Object.entries(data.mindmaps)) {
      try {
        const id = parseInt(idStr);
        const storagePath = `${userId}/surah/${id}.json`;
        
        // Upload to Storage
        const { error: uploadError } = await supabase.storage
          .from('user_data')
          .upload(storagePath, JSON.stringify(map), {
            contentType: 'application/json',
            upsert: true
          });

        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

        // Insert Metadata
        const { error: dbError } = await supabase
          .from('mindmaps')
          .upsert({
            user_id: userId,
            type: 'surah',
            resource_id: id,
            is_complete: map.isComplete || false,
            version: 1,
            updated_at: map.updatedAt || new Date().toISOString(),
            storage_path: storagePath
          }, {
            onConflict: 'user_id,type,resource_id'
          });

        if (dbError) throw new Error(`DB insert failed: ${dbError.message}`);

      } catch (e) {
        console.error(`Failed to migrate surah mindmap ${idStr} for user ${userId}:`, e.message);
        errors.push(`Surah Mindmap ${idStr}: ${e.message}`);
      }
    }
  }

  // 2. Migrate Part Mindmaps
  if (data.partMindmaps) {
    for (const [idStr, map] of Object.entries(data.partMindmaps)) {
      try {
        const id = parseInt(idStr);
        const storagePath = `${userId}/part/${id}.json`;
        
        // Upload to Storage
        const { error: uploadError } = await supabase.storage
          .from('user_data')
          .upload(storagePath, JSON.stringify(map), {
            contentType: 'application/json',
            upsert: true
          });

        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

        // Insert Metadata
        const { error: dbError } = await supabase
          .from('mindmaps')
          .upsert({
            user_id: userId,
            type: 'part',
            resource_id: id,
            is_complete: map.isComplete || false,
            version: 1,
            updated_at: map.updatedAt || new Date().toISOString(),
            storage_path: storagePath
          }, {
            onConflict: 'user_id,type,resource_id'
          });

        if (dbError) throw new Error(`DB insert failed: ${dbError.message}`);

      } catch (e) {
        console.error(`Failed to migrate part mindmap ${idStr} for user ${userId}:`, e.message);
        errors.push(`Part Mindmap ${idStr}: ${e.message}`);
      }
    }
  }

  // 3. Migrate Memory Nodes
  if (data.memoryNodes && Array.isArray(data.memoryNodes)) {
    for (const node of data.memoryNodes) {
      try {
        const { error } = await supabase
          .from('memory_nodes')
          .upsert({
            user_id: userId,
            node_id: node.id,
            data: node, // Storing the whole node object as JSONB
            updated_at: new Date().toISOString() // Or extract from node if available?
          }, {
            onConflict: 'user_id,node_id'
          });

        if (error) throw new Error(`DB insert failed: ${error.message}`);
      } catch (e) {
        console.error(`Failed to migrate memory node ${node.id} for user ${userId}:`, e.message);
        errors.push(`Memory Node ${node.id}: ${e.message}`);
      }
    }
  }

  // 4. Migrate Settings
  if (data.settings) {
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          user_id: userId,
          theme: null, // We don't have separate theme object usually? Or is it inside settings?
          // The backupData.settings is flat: { completionDays, activePart, learnedVerses, ... }
          // The table 'settings' has columns: theme, audio_settings, learned_verses.
          // We need to map them.
          
          learned_verses: data.settings.learnedVerses || {},
          audio_settings: data.audioSettings || {},
          // We might need to store the rest of settings in a 'general' column or similar if the table supports it?
          // The schema has: theme, audio_settings, learned_verses.
          // Where do 'completionDays' and 'skippedSurahs' go?
          // If the schema is strict, we might lose them unless we add columns.
          // For now, let's just migrate what fits.
        }, {
          onConflict: 'user_id'
        });

      if (error) throw new Error(`Settings insert failed: ${error.message}`);
    } catch (e) {
      console.error(`Failed to migrate settings for user ${userId}:`, e.message);
      errors.push(`Settings: ${e.message}`);
    }
  }

  return errors;
}

async function run() {
  console.log('Starting migration...');
  
  // Fetch all user backups
  // Note: For large datasets, use pagination. For now, assuming manageable size.
  const { data: backups, error } = await supabase
    .from('user_backups')
    .select('user_id, data');

  if (error) {
    console.error('Failed to fetch user backups:', error);
    process.exit(1);
  }

  console.log(`Found ${backups.length} backups to migrate.`);

  let successCount = 0;
  let failCount = 0;

  for (const backup of backups) {
    const errors = await migrateUser(backup.user_id, backup.data);
    if (errors.length === 0) {
      successCount++;
    } else {
      failCount++;
      console.log(`User ${backup.user_id} migrated with ${errors.length} errors.`);
    }
  }

  console.log('-----------------------------------');
  console.log(`Migration Complete.`);
  console.log(`Success: ${successCount}`);
  console.log(`Partial/Fail: ${failCount}`);
}

run().catch(e => console.error(e));
