[CmdletBinding()]
param([string]$Ref = 'HEAD')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
Push-Location $repo
try {
    & (Join-Path $PSScriptRoot check-publication.ps1)
    if (& git status --porcelain) { throw 'Commit/review the intended release before creating its source archive.' }
    $revision = & git rev-parse --verify "$Ref^{commit}"
    if ($LASTEXITCODE) { throw 'Choose an existing reviewed commit or tag.' }
    if ($revision -ne (& git rev-parse HEAD)) { throw 'Check out the intended release first so validation and archive use the same commit.' }
    New-Item -ItemType Directory -Path artifacts -Force | Out-Null
    $output = Join-Path $repo ('artifacts/txtextcontrol-ai-samples-' + $revision.Substring(0,12) + '.zip')
    if (Test-Path -LiteralPath $output) { throw 'Archive already exists; inspect it instead of overwriting it.' }
    & git archive --format=zip --prefix=txtextcontrol-ai-samples/ "--output=$output" $revision
    if ($LASTEXITCODE) { throw 'Archive failed.' }
    Get-FileHash -LiteralPath $output -Algorithm SHA256
    Write-Host "Created source archive from reviewed commit: $output"
}
finally { Pop-Location }
