# Run from the contractor-os-v2 folder in PowerShell
$repo = "C:\Users\13212\Documents\Claude\Projects\Fluid AI Business\contractor-os-v2"
Set-Location $repo

# 1. Kill any git lock
$lock = Join-Path $repo ".git\index.lock"
if (Test-Path $lock) { Remove-Item $lock -Force; Write-Host "Lock removed." }

# 2. Run DB migration to add new columns
Write-Host "Adding CRM + onboarding columns to DB..."
Write-Host "Run this SQL in Railway Postgres (one time):"
Write-Host ""
Write-Host "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_type TEXT;"
Write-Host "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_api_key TEXT;"
Write-Host "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;"
Write-Host ""
Write-Host "Press Enter after running the migration, or Ctrl+C to cancel."
Read-Host

# 3. Stage new/changed files
git add shared/models/auth.ts
git add server/crm/types.ts
git add server/crm/ghl.ts
git add server/crm/jobber.ts
git add server/crm/servicetitan.ts
git add server/crm/index.ts
git add server/routes.ts
git add server/bob/agent.ts
git add client/src/pages/Onboarding.tsx
git add client/src/App.tsx

# 4. Commit and push
git commit -m "feat: onboarding wizard + CRM adapter layer (GHL/Jobber/ServiceTitan stubs)"
git push

Write-Host ""
Write-Host "Done! Railway will redeploy automatically."
