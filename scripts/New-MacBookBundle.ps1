[CmdletBinding()]
param([string]$OutputDirectory, [string]$NuGetConfig, [switch]$ReleaseGate)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
if (!$OutputDirectory) { $OutputDirectory = Join-Path $repo ('artifacts/macbook-bundle-' + (Get-Date -Format yyyyMMdd-HHmmss)) }
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'Choose a new output folder. Existing bundles are never overwritten.' }
& (Join-Path $PSScriptRoot check-publication.ps1)
New-Item -ItemType Directory -Path $output | Out-Null
$components = @(
    @{ Project='samples/AiService/TXTextControl.AI.Service.csproj'; Runtime='osx-arm64'; Folder='ai-fdd' },
    @{ Project='samples/WebDocumentAssistant/TXTextControl.AI.Web.csproj'; Runtime='linux-x64'; Folder='web' },
    @{ Project='samples/McpServer/TxTextControl.McpServer.csproj'; Runtime='linux-x64'; Folder='mcp' }
)
Push-Location $repo
try {
    foreach ($component in $components) {
        $restore = @('restore', $component.Project, '-r', $component.Runtime)
        if ($NuGetConfig) { $restore += @('--configfile', (Resolve-Path -LiteralPath $NuGetConfig).Path) }
        if ($ReleaseGate) { $restore += '-p:WarningsAsErrors=NU1901%3BNU1902%3BNU1903%3BNU1904' }
        & dotnet @restore
        if ($LASTEXITCODE) { throw "Restore failed: $($component.Project)" }
        $publish = Join-Path $output ('publish/' + $component.Folder)
        & dotnet publish $component.Project -c Release -r $component.Runtime --self-contained false --no-restore -p:UseAppHost=false -p:PublishSingleFile=false -p:PublishTrimmed=false -o $publish
        if ($LASTEXITCODE) { throw "Publish failed: $($component.Project)" }
        if ($component.Folder -ne 'ai-fdd') {
            if (@(Get-ChildItem "$publish/Fonts" -File -ErrorAction SilentlyContinue).Count -eq 0) { throw "Missing fonts: $publish" }
            Copy-Item -LiteralPath "deploy/macbook/Dockerfile.$($component.Folder)" -Destination "$publish/Dockerfile"
        }
    }
    $aiOutput = Join-Path $output 'publish/ai-fdd'
    foreach ($unexpected in 'TXTextControl.AI.Service','libhostfxr.dylib','libhostpolicy.dylib','libcoreclr.dylib') {
        if (Test-Path -LiteralPath (Join-Path $aiOutput $unexpected)) { throw "Unexpected bundled .NET host/runtime: $unexpected" }
    }
    $files = @(Get-ChildItem -LiteralPath $output -Recurse -File)
    if ($files | Where-Object { $_.Extension -in '.snk','.gguf','.db','.pfx','.pem','.key' -or $_.FullName -match '[\\/](App_Data|MyDocuments|\.codex-build)[\\/]' }) {
        throw 'Unexpected private data, model, key or diagnostic file in bundle.'
    }
    if (Get-ChildItem $aiOutput -Recurse -File | Where-Object { $_.Name -match '^TXTextControl\.(Server\.)?Core\.dll$|^tx34.*\.(so|dll)$' }) {
        throw 'The native TX document engine must not be included in the Mac AI service.'
    }
    foreach ($file in 'setup.sh','start.sh','stop.sh','require-dotnet.sh','compose.yaml','README.md') {
        Copy-Item -LiteralPath "deploy/macbook/$file" -Destination $output
    }
    Copy-Item -LiteralPath LICENSE.txt,THIRD-PARTY-NOTICES.md -Destination $output
    Write-Host "Prepared: $output"
    Write-Host 'Run bash setup.sh on the Mac. No private library source or signing key was required.'
    Write-Warning 'A successful bundle build does not clear package vulnerability, licensing or native runtime release gates.'
}
finally { Pop-Location }
