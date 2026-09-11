[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
$files = @(& git -C $repo ls-files --cached --others --exclude-standard)
if ($LASTEXITCODE -ne 0 -or !$files.Count) { throw 'Cannot read the sample repository inventory.' }
$forbidden = @($files | Where-Object {
    $_ -match '(^|/)(src|bin|obj|App_Data|MyDocuments|artifacts|\.vs|\.codex-build|publish)/' -or
    $_ -match '\.(snk|pfx|p12|pem|key|gguf|db|db-wal|db-shm|dll|exe|nupkg|snupkg|zip|tar)$' -or
    $_ -match '(^|/)\.env$|\.env$'
})
if ($forbidden.Count) { throw ('Files outside the public sample boundary: ' + ($forbidden -join ', ')) }
$projects = @(Get-ChildItem (Join-Path $repo samples) -Recurse -Filter *.csproj | Where-Object { $_.FullName -notmatch '[\\/](bin|obj)[\\/]' })
if ($projects.Count -ne 10) { throw "Expected 10 sample projects; found $($projects.Count)." }
foreach ($project in $projects) {
    [xml]$xml = Get-Content -LiteralPath $project.FullName -Raw
    if ($xml.SelectNodes('//ProjectReference').Count) { throw "Private project reference in $($project.Name)." }
    if ($xml.SelectNodes('//PackageReference[@Version or @VersionOverride or @Condition]').Count) { throw "Use centrally pinned, unconditional package references: $($project.Name)." }
    if (!(Test-Path -LiteralPath (Join-Path $project.DirectoryName README.md))) { throw "Missing sample README: $($project.Name)." }
}
function Test-NoEmbeddedApiKey($node, [string]$file) {
    if ($null -eq $node) { return }
    if ($node -is [System.Collections.IDictionary]) {
        foreach ($key in $node.Keys) {
            if ($key -eq 'ApiKey' -and ![string]::IsNullOrWhiteSpace([string]$node[$key])) {
                throw "Non-empty ApiKey in publishable JSON: $file. Use user secrets or an environment variable."
            }
            Test-NoEmbeddedApiKey $node[$key] $file
        }
    } elseif ($node -is [System.Collections.IEnumerable] -and $node -isnot [string]) {
        foreach ($item in $node) { Test-NoEmbeddedApiKey $item $file }
    }
}
foreach ($file in $files | Where-Object { $_ -like '*.json' }) {
    $json = Get-Content -LiteralPath (Join-Path $repo $file) -Raw | ConvertFrom-Json -AsHashtable
    Test-NoEmbeddedApiKey $json $file
}
foreach ($file in $files | Where-Object { $_ -like '*.md' }) {
    $path = Join-Path $repo $file
    $content = Get-Content -LiteralPath $path -Raw
    foreach ($match in [regex]::Matches($content, '\]\(([^)\s]+)\)')) {
        $link = $match.Groups[1].Value
        if ($link -match '^[a-zA-Z][a-zA-Z0-9+.-]*:|^#|^/') { continue }
        $relative = [Uri]::UnescapeDataString(($link -split '#',2)[0])
        if ($relative -and !(Test-Path -LiteralPath (Join-Path (Split-Path $path) $relative))) {
            throw "Broken local Markdown link in ${file}: $link"
        }
    }
}
Write-Host "Publication boundary passed: $($projects.Count) package-only samples, README and local-link checks, no disallowed release files."
Write-Host 'This does not replace a dedicated secret scan, dependency audit or legal review.'
