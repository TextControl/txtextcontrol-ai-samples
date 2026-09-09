[CmdletBinding()]
param([switch]$ReleaseGate, [string]$NuGetConfig)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
function Invoke-DotNet([string[]]$Arguments) {
    & dotnet @Arguments
    if ($LASTEXITCODE -ne 0) { throw "dotnet failed: $($Arguments -join ' ')" }
}
Push-Location $repo
try {
    & (Join-Path $PSScriptRoot check-publication.ps1)
    $restore = @('restore', 'TXTextControl.AI.Samples.sln', '--force', '--no-cache')
    if ($NuGetConfig) { $restore += @('--configfile', (Resolve-Path -LiteralPath $NuGetConfig).Path) }
    if ($ReleaseGate) { $restore += '-p:WarningsAsErrors=NU1901%3BNU1902%3BNU1903%3BNU1904' }
    Invoke-DotNet $restore
    Invoke-DotNet @('build', 'TXTextControl.AI.Samples.sln', '-c', 'Release', '--no-restore')
    foreach ($sample in 'WebDocumentAssistant','AiService','McpServer') {
        $project = (Get-ChildItem "samples/$sample" -Filter *.csproj).FullName
        $output = Join-Path $repo "artifacts/verification/$sample"
        Invoke-DotNet @('publish', $project, '-c', 'Release', '--no-restore', '-o', $output)
        if ($sample -in 'WebDocumentAssistant','AiService') {
            $depsPath = Join-Path $output (([IO.Path]::GetFileNameWithoutExtension($project)) + '.deps.json')
            $deps = Get-Content -LiteralPath $depsPath -Raw | ConvertFrom-Json
            $libraries = @($deps.libraries.PSObject.Properties.Name)
            $engine = @($libraries | Where-Object { $_ -like 'SQLite/*' })
            if ($libraries -match '^SQLitePCLRaw\.lib\.e_sqlite3/' -or $engine.Count -ne 1 -or
                [version]($engine[0].Split('/')[1]) -lt [version]'3.53.4') {
                throw "Outdated native SQLite dependency in $sample. Restore the patched Knowledge package."
            }
        }
        if ($sample -ne 'AiService' -and @(Get-ChildItem "$output/Fonts" -File -ErrorAction SilentlyContinue).Count -eq 0) { throw "Missing SDK fonts: $sample" }
        if ($sample -eq 'WebDocumentAssistant') {
            foreach ($asset in 'client.js','editor.js','client.d.ts','editor.d.ts') {
                if (!(Test-Path "$output/wwwroot/_content/TXTextControl.AI.AspNetCore/$asset")) { throw "Missing browser asset: $asset" }
            }
            foreach ($asset in 'js/app.js','js/knowledge.js','js/runtime-admin.js','js/connection-admin.js','css/app.css','images/txai.svg') {
                if (!(Test-Path "$output/wwwroot/$asset")) { throw "Missing full-web asset: $asset" }
            }
            if (@(Get-ChildItem "$output/Samples" -Filter *.rtf).Count -ne 4) { throw 'Full web sample documents are missing.' }
        }
        $private = @(Get-ChildItem $output -Recurse -File | Where-Object { $_.Extension -in '.snk','.pfx','.pem','.key','.gguf','.db' -or $_.FullName -match '[\\/](App_Data|MyDocuments)[\\/]' })
        if ($private.Count) { throw "Private/model files found in published $sample output." }
    }
    Write-Host 'Build and publish asset checks passed. Native runtime/browser acceptance tests are still required.'
}
finally { Pop-Location }
