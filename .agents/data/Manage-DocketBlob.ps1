[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Inspect', 'Export', 'Verify', 'Restore')]
    [string]$Action,

    [ValidateSet('Cloud', 'Local')]
    [string]$Source = 'Cloud',

    [string]$DataRoot,
    [string]$LocalStoreDir,
    [string]$ExportPath,
    [string]$RestoreTarget,
    [switch]$Disposable
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$cli = Join-Path $repoRoot 'scripts\docket-data.js'

if ([string]::IsNullOrWhiteSpace($DataRoot)) {
    $DataRoot = if (-not [string]::IsNullOrWhiteSpace($env:PROJECT_DATA_ROOT)) {
        $env:PROJECT_DATA_ROOT
    }
    else {
        Join-Path $env:USERPROFILE 'Data\Projects'
    }
}

function Resolve-ContainedPath([string]$Root, [string]$Candidate, [string]$Label) {
    if ([string]::IsNullOrWhiteSpace($Candidate)) { throw "$Label is required." }
    $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $candidatePath = [IO.Path]::GetFullPath($Candidate)
    $prefix = $rootPath + [IO.Path]::DirectorySeparatorChar
    if (-not $candidatePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label must stay under DataRoot."
    }

    $cursor = $candidatePath
    while ($cursor.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
        $cursor.Equals($rootPath, [StringComparison]::OrdinalIgnoreCase)) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "$Label crosses a reparse point: $cursor"
            }
        }
        if ($cursor.Equals($rootPath, [StringComparison]::OrdinalIgnoreCase)) { break }
        $parent = Split-Path $cursor -Parent
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $candidatePath
}

function Invoke-NodeData([string[]]$Arguments, [switch]$CloudEnvironment) {
    if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) {
        throw "Docket data CLI is missing: $cli"
    }
    if ($CloudEnvironment) {
        $vercel = Get-Command vercel.cmd -ErrorAction SilentlyContinue
        if (-not $vercel) { throw 'Vercel CLI is required for cloud Docket data access.' }
        if (-not (Test-Path -LiteralPath (Join-Path $repoRoot '.vercel\project.json') -PathType Leaf)) {
            throw 'The Docket repository is not linked to a Vercel project.'
        }
        $raw = & $vercel.Source env run -- node $cli @Arguments
    }
    else {
        $raw = & node $cli @Arguments
    }
    if ($LASTEXITCODE -ne 0) { throw "Docket data command failed with exit code $LASTEXITCODE." }
    $jsonLine = @($raw | Where-Object { $_ -match '^\{' })[-1]
    if ([string]::IsNullOrWhiteSpace($jsonLine)) { throw 'Docket data command returned no JSON result.' }
    return ($jsonLine | ConvertFrom-Json)
}

$dataRootPath = [IO.Path]::GetFullPath($DataRoot)
if (-not (Test-Path -LiteralPath $dataRootPath)) {
    New-Item -ItemType Directory -Path $dataRootPath -Force | Out-Null
}
if ((Get-Item -LiteralPath $dataRootPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw "DataRoot cannot be a reparse point: $dataRootPath"
}

if ($Action -eq 'Verify') {
    $safeExport = Resolve-ContainedPath $dataRootPath $ExportPath 'ExportPath'
    return Invoke-NodeData @('verify', '--output', $safeExport)
}

if ($Action -eq 'Restore') {
    $safeExport = Resolve-ContainedPath $dataRootPath $ExportPath 'ExportPath'
    $safeTarget = Resolve-ContainedPath $dataRootPath $RestoreTarget 'RestoreTarget'
    $arguments = @('restore', '--backend', 'local', '--store-dir', $safeTarget, '--output', $safeExport)
    if ($Disposable) { $arguments += '--disposable' }
    return Invoke-NodeData $arguments
}

if ($Source -eq 'Local') {
    if ([string]::IsNullOrWhiteSpace($LocalStoreDir)) {
        $LocalStoreDir = if (-not [string]::IsNullOrWhiteSpace($env:LOCAL_STORE_DIR)) {
            $env:LOCAL_STORE_DIR
        }
        else {
            Join-Path $env:USERPROFILE '.docket-local'
        }
    }
    $safeStore = Resolve-ContainedPath $dataRootPath $LocalStoreDir 'LocalStoreDir'
    if ($Action -eq 'Inspect') {
        return Invoke-NodeData @('inspect', '--backend', 'local', '--store-dir', $safeStore)
    }
    $safeExport = Resolve-ContainedPath $dataRootPath $ExportPath 'ExportPath'
    return Invoke-NodeData @('export', '--backend', 'local', '--store-dir', $safeStore, '--output', $safeExport)
}

if ($Action -eq 'Inspect') {
    return Invoke-NodeData @('inspect', '--backend', 'cloud') -CloudEnvironment
}
$safeExport = Resolve-ContainedPath $dataRootPath $ExportPath 'ExportPath'
return Invoke-NodeData @('export', '--backend', 'cloud', '--output', $safeExport) -CloudEnvironment
