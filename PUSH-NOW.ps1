# Run this in PowerShell from the contractor-os-v2 folder.
# It kills the git lock, stages only the changed files, and pushes.

$repo = "C:\Users\13212\Documents\Claude\Projects\Fluid AI Business\contractor-os-v2"
Set-Location $repo

# 1. Kill the lock
$lock = Join-Path $repo ".git\index.lock"
if (Test-Path $lock) { Remove-Item $lock -Force; Write-Host "Lock removed." }

# 2. Stage only the files from this session
git add server/routes.ts
git add server/bob/agent.ts
git add test-bob.mjs
git add BOB-TEST-AUDIT.md

# 3. Commit and push
git commit -m "fix: cross-tenant convo guard, UTC schedule timezone, full test suite + audit"
git push
