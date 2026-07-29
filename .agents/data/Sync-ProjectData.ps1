[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Export', 'Restore', 'Status')]
    [string]$Action,

    [string]$LocalStoreDir = $env:LOCAL_STORE_DIR,

    [string]$LocalDataRoot = $env:PROJECT_DATA_ROOT,

    [string]$SyncRoot = $env:PROJECT_DATA_SYNC_ROOT,

    [string]$SnapshotPath,

    [string]$HarnessToolsPath = (Join-Path $env:USERPROFILE '.agents\tools')
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($LocalStoreDir)) {
    $LocalStoreDir = Join-Path $env:USERPROFILE '.docket-local'
}

$sharedTool = Join-Path $HarnessToolsPath 'Sync-SqliteProjectData.ps1'
if (-not (Test-Path -LiteralPath $sharedTool -PathType Leaf)) {
    throw "Shared SQLite project-data tool is missing: $sharedTool"
}

$arguments = @{
    Action = $Action
    ProjectName = 'docket'
    DatabasePath = (Join-Path $LocalStoreDir 'docket.sqlite3')
    LocalDataRoot = $LocalDataRoot
    SyncRoot = $SyncRoot
}
if ($SnapshotPath) { $arguments.SnapshotPath = $SnapshotPath }

& $sharedTool @arguments
