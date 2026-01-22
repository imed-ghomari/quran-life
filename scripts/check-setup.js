const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manual env parsing
const envPath = path.resolve(process.cwd(), '.env.local');
let env = {};

try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, '').trim();
        env[key] = value.split('#')[0].trim(); // Handle comments
      }
    });
  }
} catch (e) {
  console.warn('Could not read .env.local');
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase URL or Service Role Key');
  console.error('Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function check() {
  console.log('Checking Supabase Connection & Schema...');
  
  // 1. Check Connection (List Buckets)
  const { data: buckets, error: connError } = await supabase.storage.listBuckets();
  if (connError) {
    console.error('❌ Connection Failed:', connError.message);
    if (connError.message.includes('signature')) {
        console.error('   -> Keys are likely invalid.');
    }
    return;
  }
  console.log('✅ Connection Successful. Buckets:', buckets?.length || 0);

  // 2. Check "mindmaps" table
  const { error: tableError } = await supabase.from('mindmaps').select('id').limit(1);
  
  if (tableError) {
    if (tableError.code === '42P01') { // undefined_table
      console.log('❌ Table "mindmaps" DOES NOT exist.');
      console.log('   -> You need to apply the migration SQL.');
    } else {
      console.error('❌ Error checking "mindmaps" table:', tableError.message, tableError.code);
    }
  } else {
    console.log('✅ Table "mindmaps" exists.');
  }

  // 3. Check "user_data" bucket
  const userDataBucket = buckets?.find(b => b.name === 'user_data');
  if (!userDataBucket) {
    console.log('❌ Storage Bucket "user_data" DOES NOT exist.');
  } else {
    console.log('✅ Storage Bucket "user_data" exists.');
  }

  // 4. Check "user_backups" table (Source for migration)
  const { count, error: backupError } = await supabase
    .from('user_backups')
    .select('*', { count: 'exact', head: true });
    
  if (backupError) {
    if (backupError.code === '42P01') {
       console.log('⚠️  Table "user_backups" DOES NOT exist. (Migration source missing?)');
    } else {
       console.error('❌ Error checking "user_backups":', backupError.message);
    }
  } else {
    console.log(`✅ Table "user_backups" exists. Rows: ${count}`);
  }
}

check();
