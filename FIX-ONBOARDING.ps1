$file = "client\src\pages\Onboarding.tsx"
$content = Get-Content $file -Raw

# Add getToken import after the react-query import line
$content = $content -replace `
  '(import \{ useQuery, useMutation, useQueryClient \} from "@tanstack/react-query";)', `
  '$1' + [Environment]::NewLine + 'import { getToken } from "@/hooks/use-auth";'

# Replace wrong localStorage key with getToken()
$content = $content -replace 'localStorage\.getItem\("authToken"\)', 'getToken()'

Set-Content $file $content -NoNewline
Write-Host "Done. Verifying..."
Select-String -Path $file -Pattern "authToken|getToken|use-auth" | Select-Object LineNumber, Line
