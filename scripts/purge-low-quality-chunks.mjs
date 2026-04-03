#!/usr/bin/env node
/**
 * Purge low-quality chunks from Supabase.
 *
 * Removes chunks that are:
 *   - Shorter than 150 characters
 *   - Table-of-contents pages
 *   - Heading-only (fewer than 2 sentences)
 *   - Mostly numbered TOC lines
 *
 * Usage:
 *   node scripts/purge-low-quality-chunks.mjs [--dry-run]
 *
 * --dry-run  Preview what would be deleted without actually deleting.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH   = 500;

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('❌ Missing SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
  return createClient(url, key, { auth: { persistSession: false } });
}

function isLowQuality(text) {
  if (!text || text.length < 150) return true;
  if (/table of contents/i.test(text)) return true;

  // Mostly numbered TOC lines: "4.4 Hub Definition\n4.5 Link..."
  const tocLines = (text.match(/^\s*\d+(\.\d+)*\s+[A-Z]/gm) || []).length;
  const totalLines = text.split('\n').filter(Boolean).length;
  if (totalLines > 3 && tocLines / totalLines > 0.5) return true;

  // Fewer than 2 sentences → heading-only
  const sentences = (text.match(/[.!?]\s/g) || []).length;
  if (sentences < 2) return true;

  return false;
}

async function main() {
  console.log(`\n🔍 Scanning chunks for low-quality content${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);
  const supabase = getSupabase();

  let offset = 0;
  let totalScanned = 0;
  let toDelete = [];

  // Page through all chunks
  while (true) {
    const { data, error } = await supabase
      .from('chunks')
      .select('id, content')
      .range(offset, offset + BATCH - 1);

    if (error) { console.error('❌ Fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const chunk of data) {
      if (isLowQuality(chunk.content)) {
        toDelete.push(chunk.id);
      }
    }

    totalScanned += data.length;
    process.stdout.write(`   Scanned ${totalScanned} chunks, ${toDelete.length} flagged...\r`);
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`\n\n📊 Results:`);
  console.log(`   Total scanned : ${totalScanned}`);
  console.log(`   Low-quality   : ${toDelete.length}`);
  console.log(`   Will keep     : ${totalScanned - toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('\n✅ No low-quality chunks found. Nothing to delete.\n');
    return;
  }

  if (DRY_RUN) {
    console.log('\n⚠️  Dry run — no changes made. Remove --dry-run to delete.\n');
    return;
  }

  console.log(`\n🗑️  Deleting ${toDelete.length} chunks...`);

  // Delete in batches of 100 (Supabase IN clause limit)
  const DEL_BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += DEL_BATCH) {
    const batch = toDelete.slice(i, i + DEL_BATCH);
    const { error } = await supabase.from('chunks').delete().in('id', batch);
    if (error) { console.error('❌ Delete error:', error.message); process.exit(1); }
    deleted += batch.length;
    process.stdout.write(`   Deleted ${deleted}/${toDelete.length}...\r`);
  }

  console.log(`\n✅ Done. Removed ${deleted} low-quality chunks.\n`);
  console.log('💡 Tip: Run "vacuum analyze chunks;" in Supabase SQL editor to reclaim space.\n');
}

main().catch((err) => { console.error('❌', err.message); process.exit(1); });
