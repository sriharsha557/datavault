# DEFINITIVE FIX for 0 Results Issue

## Problem
Next.js app returns 0 chunks, but `test-postgrest-directly.mjs` script returns 8 chunks with the EXACT same code.

## Root Cause
**Next.js dev server is caching stale function schema or connection state.**

The test script proves:
- ✅ Database function works perfectly
- ✅ Supabase JS client works perfectly
- ✅ Embedding format is correct
- ❌ Next.js environment has stale cache

## The Fix (3 Steps)

### Step 1: Apply Database Function (if not already done)

Run `DEFINITIVE-FIX-match-chunks.sql` in Supabase SQL Editor:

```bash
# Copy the SQL file content and run it in Supabase SQL Editor
# This ensures the function signature is exactly: match_chunks(vector(384), int, text)
```

### Step 2: Kill Next.js Dev Server COMPLETELY

**CRITICAL**: Don't just press Ctrl+C. You need to kill the process completely.

```powershell
# Find the Next.js process
Get-Process node | Where-Object {$_.Path -like "*node.exe*"} | Stop-Process -Force

# OR in the terminal where Next.js is running:
# Press Ctrl+C, then close the terminal window completely
```

### Step 3: Clear Next.js Cache and Restart

```powershell
# Clear the build cache
Remove-Item -Recurse -Force .next

# Restart Next.js dev server
npm run dev
```

### Step 4: Test Immediately

After the server starts, test with:
```
What are Hubs in Data Vault?
```

You should see in the logs:
```
[query] Calling match_chunks
[query] Embedding length: 384
[query] First 3 values: [ ... ]
[query] Result: 8 chunks  ← Should be 8, not 0
```

## Why This Works

The test script `test-postgrest-directly.mjs` creates a **fresh Supabase client** every time it runs. It doesn't have any cached schema or connection state.

Next.js dev server, however:
1. Caches module imports (including Supabase client)
2. Reuses connections across requests
3. May cache PostgREST schema information
4. Hot-reloading doesn't always clear these caches

By killing the process completely and clearing `.next`, we force Next.js to:
- Re-import all modules fresh
- Re-establish all connections
- Re-fetch PostgREST schema
- Start with clean state

## If It Still Fails

If after these steps it still returns 0 chunks, then we have a deeper issue with Next.js environment vs standalone script environment. In that case:

### Fallback Option: Use Direct Postgres Connection

Modify `app/api/query/route.ts` to use direct Postgres connection instead of Supabase client:

```typescript
// Replace the supabase.rpc call with:
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// In the query route:
const client = await pool.connect();
try {
  const result = await client.query(`
    SELECT * FROM match_chunks($1::vector(384), $2, $3)
  `, [`[${queryEmbedding.join(',')}]`, top_k, doc_type_filter ?? null]);
  
  const chunks = result.rows;
  // ... rest of the code
} finally {
  client.release();
}
```

But try the cache clear first - that should fix it.

## Verification

After the fix, run both:

1. **Test script** (should still work):
```bash
node test-postgrest-directly.mjs
```

2. **Next.js app** (should now work):
```
What are Hubs in Data Vault?
```

Both should return 8 chunks with similar similarity scores.
