# PowerShell script to fix Next.js cache issue
# Run this script to completely reset Next.js and fix the 0 results issue

Write-Host "🔧 Fixing Next.js Cache Issue..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill any running Node processes
Write-Host "Step 1: Killing any running Node.js processes..." -ForegroundColor Yellow
try {
    $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        $nodeProcesses | Stop-Process -Force
        Write-Host "✅ Killed $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Green
    } else {
        Write-Host "✅ No Node.js processes running" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Could not kill Node processes: $_" -ForegroundColor Yellow
}

Write-Host ""

# Step 2: Clear .next cache
Write-Host "Step 2: Clearing .next build cache..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item -Recurse -Force .next
    Write-Host "✅ Cleared .next cache" -ForegroundColor Green
} else {
    Write-Host "✅ No .next cache found" -ForegroundColor Green
}

Write-Host ""

# Step 3: Instructions for database
Write-Host "Step 3: Database Function Update" -ForegroundColor Yellow
Write-Host "📋 Please run DEFINITIVE-FIX-match-chunks.sql in Supabase SQL Editor" -ForegroundColor Cyan
Write-Host "   (Open Supabase Dashboard → SQL Editor → paste the SQL file content)" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Enter when you've run the SQL..." -ForegroundColor Cyan
Read-Host

Write-Host ""

# Step 4: Start Next.js dev server
Write-Host "Step 4: Starting Next.js dev server..." -ForegroundColor Yellow
Write-Host "✅ Ready to start! Run: npm run dev" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 After the server starts, test with: 'What are Hubs in Data Vault?'" -ForegroundColor Cyan
Write-Host "   You should see: [query] Result: 8 chunks (not 0)" -ForegroundColor Gray
Write-Host ""
