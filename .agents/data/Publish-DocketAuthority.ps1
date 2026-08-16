[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Publish', 'Restore', 'Verify')]
    [string]$Action,
    [Parameter(Mandatory)][string]$Repository,
    [Parameter(Mandatory)][string]$Project,
    [Parameter(Mandatory)][string]$AssetId,
    [Parameter(Mandatory)][string]$RelativeDestination,
    [Parameter(Mandatory)][string]$DataRoot,
    [Parameter(Mandatory)][string]$SyncRoot
)

# Publisher-contract front door for the Docket cloud authority.
#
# Manage-DocketBlob.ps1 owns every operation against the private Vercel Blob store, and
# it keeps owning them. What it does not speak is the shared project-data publisher
# contract: Invoke-DeclaredProjectData.ps1 calls a repository-relative adapter with
# Publish or Verify plus seven fixed arguments, and Manage-DocketBlob's action set and
# parameter block are shaped for a human at a prompt instead. Declaring it directly in
# data-manifest.yaml therefore failed with a ValidateSet error naming Publish, which
# aborted the nightly Agent Backups run before any snapshot existed.
#
# This adapter is the translation layer, following the wrapper pattern this repository
# already uses in .agents\data\Sync-ProjectData.ps1, which fronts the shared SQLite tool
# the same way. Nothing about the blob-store logic is reimplemented here.

$ErrorActionPreference = 'Stop'

if ($Project -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
    throw 'Project name is malformed.'
}
if ($RelativeDestination -notmatch '^private[/\\]') {
    throw "Asset '$AssetId' is outside the private export class this adapter owns."
}
if ([System.IO.Path]::IsPathRooted($RelativeDestination) -or
    $RelativeDestination -match '(^|[/\\])\.\.([/\\]|$)') {
    throw "Asset '$AssetId' has an unsafe relative destination."
}

$repositoryRoot = [System.IO.Path]::GetFullPath($Repository)
$blobAdapter = Join-Path $repositoryRoot '.agents\data\Manage-DocketBlob.ps1'
if (-not (Test-Path -LiteralPath $blobAdapter -PathType Leaf)) {
    throw "The Docket blob adapter is missing: $blobAdapter"
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $DataRoot $Project))
$exportRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $RelativeDestination))
$prefix = $projectRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if (-not $exportRoot.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Asset '$AssetId' resolves outside its declared project data root."
}

$linkFile = Join-Path $repositoryRoot '.vercel\project.json'
$linked = Test-Path -LiteralPath $linkFile -PathType Leaf

function Get-LatestExport {
    if (-not (Test-Path -LiteralPath $exportRoot -PathType Container)) { return $null }
    return @(
        Get-ChildItem -LiteralPath $exportRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
    )[0]
}

function New-Result {
    param([string]$Result, [hashtable]$Fields)
    $value = [ordered]@{
        Result = $Result
        Action = $Action
        Project = $Project
        AssetId = $AssetId
        Authority = 'private Vercel Blob store'
        ExportRoot = $exportRoot
        Linked = $linked
    }
    foreach ($key in $Fields.Keys) { $value[$key] = $Fields[$key] }
    return [pscustomobject]$value
}

if ($Action -eq 'Restore') {
    # A restore replaces four authoritative documents. The manifest restore verifier
    # requires a mutation-free dry run and a disposable target, which is a supervised
    # procedure, so an unattended publisher pass reports the route instead of taking it.
    $latest = Get-LatestExport
    return New-Result 'PASS' @{
        Restored = $false
        LatestExport = if ($latest) { $latest.FullName } else { $null }
        Reason = 'Restore the Docket authority by hand: Manage-DocketBlob.ps1 Verify, a mutation-free Restore dry run, then Restore -Disposable into an empty target.'
    }
}

if ($Action -eq 'Publish') {
    if (-not $linked) {
        return New-Result 'ATTENTION_REQUIRED' @{
            Published = $false
            Reason = 'The Docket repository is not linked to its Vercel project, so the cloud authority cannot be exported. Run vercel link in the repository root to restore .vercel/project.json.'
        }
    }
    $snapshot = & $blobAdapter -Action Snapshot -Source Cloud -DataRoot $DataRoot -SnapshotRoot $exportRoot
    return New-Result 'PASS' @{
        Published = $true
        Snapshot = $snapshot
        Reason = 'Exported, verified, and retained a cloud authority snapshot under the declared destination.'
    }
}

$latest = Get-LatestExport
if (-not $latest) {
    return New-Result 'ATTENTION_REQUIRED' @{
        Published = $false
        Reason = 'No verified export of the Docket cloud authority exists under the declared destination; nothing local would survive the loss of the blob store.'
    }
}

$verification = & $blobAdapter -Action Verify -DataRoot $DataRoot -ExportPath $latest.FullName
New-Result 'PASS' @{
    Published = $true
    LatestExport = $latest.FullName
    Verification = $verification
    Reason = 'The most recent retained export of the cloud authority passed its own verification.'
}
