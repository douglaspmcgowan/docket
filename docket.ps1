<#
.SYNOPSIS
Agent-facing Docket CLI entry point. Cloud is the default target.

.DESCRIPTION
Takes the whole subcommand as ONE quoted string. PowerShell's parameter binder would otherwise
try to resolve CLI flags such as --out or --set against its own common parameters, so a single
string is the only unambiguous shape.

Cloud commands: the subcommand is written to <store>\cli-request.json and the pinned Bitwarden
broker command id `docket-admin` runs docket-cli.js with REVIEW_SECRET injected into that child
process only. No agent, argument, log line, or file ever holds the bearer value.

Local commands (--target local / --local) touch only the on-disk mirror and skip the broker.

.EXAMPLE
  .\docket.ps1 'list --ids-only'
  .\docket.ps1 'list --target local --project "Skills Audit"'
  .\docket.ps1 'delete card-a card-b'
  .\docket.ps1 'prune --dry-run'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false, Position = 0)]
    [string]$Line = 'help'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$storeDir = if ($env:LOCAL_STORE_DIR) { $env:LOCAL_STORE_DIR } else { Join-Path $env:USERPROFILE '.docket-local' }

# Tokenize honouring double quotes so grouped values such as --project "Skills Audit" survive.
$tokens = [System.Collections.Generic.List[string]]::new()
foreach ($match in [regex]::Matches($Line, '"([^"]*)"|(\S+)')) {
    $tokens.Add($(if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }))
}
$arguments = @($tokens)
if ($arguments.Count -eq 0) { $arguments = @('help') }

$isLocal = $arguments -contains '--local' -or $arguments[0] -eq 'help' -or
           $arguments -contains '--help' -or $arguments -contains '-h'
for ($i = 0; $i -lt $arguments.Count - 1; $i++) {
    if ($arguments[$i] -eq '--target' -and $arguments[$i + 1] -eq 'local') { $isLocal = $true }
}

if ($isLocal) {
    & node (Join-Path $repoRoot 'docket-cli.js') @arguments
    exit $(if (Test-Path variable:LASTEXITCODE) { $LASTEXITCODE } else { 0 })
}

New-Item -ItemType Directory -Path $storeDir -Force | Out-Null
$requestPath = Join-Path $storeDir 'cli-request.json'
$responsePath = Join-Path $storeDir 'cli-response.json'
if (Test-Path -LiteralPath $responsePath) { Remove-Item -LiteralPath $responsePath -Force }

# ConvertTo-Json unwraps a single-element array; force the array shape the CLI validates.
$payload = @{ argv = @($arguments) } | ConvertTo-Json -Depth 5 -Compress
# BOM-free on both Windows PowerShell 5.1 and pwsh; 5.1's -Encoding utf8 emits a BOM that docket-cli's JSON.parse rejects.
[System.IO.File]::WriteAllText($requestPath, $payload, [System.Text.UTF8Encoding]::new($false))

& (Join-Path $env:USERPROFILE '.agents\tools\Invoke-WithBitwardenSecret.ps1') -CommandId 'docket-admin'
exit $(if (Test-Path variable:LASTEXITCODE) { $LASTEXITCODE } else { 0 })
