[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$adapter = Join-Path $PSScriptRoot 'Sync-ProjectData.ps1'
$harnessTools = 'C:\Users\dougl\Worktrees\agent-harness-portable-sync\.agents\tools'
if (-not (Test-Path -LiteralPath $harnessTools -PathType Container)) {
    $harnessTools = Join-Path $env:USERPROFILE '.agents\tools'
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

$python = Get-Command python.exe -ErrorAction SilentlyContinue
if (-not $python) { throw 'Python is required for the Docket data-adapter test.' }

$root = Join-Path $env:TEMP ('docket-project-data-' + [Guid]::NewGuid().ToString('N'))
try {
    $store = Join-Path $root 'Docket Local With Spaces'
    $sync = Join-Path $root 'Google Drive With Spaces\Project Data'
    $database = Join-Path $store 'docket.sqlite3'
    New-Item -ItemType Directory -Path $store -Force | Out-Null
    $fixtureScript = Join-Path $root 'create_fixture.py'
    [System.IO.File]::WriteAllText(
        $fixtureScript,
        "import sqlite3,sys`ndb=sqlite3.connect(sys.argv[1])`ndb.execute('create table documents (name text primary key, body text not null)')`ndb.execute('insert into documents values (?,?)', ('items.json','{}'))`ndb.commit()`ndb.close()`n",
        [System.Text.UTF8Encoding]::new($false)
    )
    & $python.Source $fixtureScript $database
    if ($LASTEXITCODE -ne 0) { throw 'Docket fixture database creation failed.' }

    $export = & $adapter -Action Export -LocalStoreDir $store -LocalDataRoot $root -SyncRoot $sync -HarnessToolsPath $harnessTools
    Assert-True ($export.ProjectName -eq 'docket') 'Adapter used the wrong project namespace.'
    Assert-True (Test-Path -LiteralPath $export.SnapshotPath -PathType Leaf) 'Adapter did not export Docket SQLite.'
    Assert-True ($export.SnapshotPath.StartsWith((Join-Path $sync 'docket'), [StringComparison]::OrdinalIgnoreCase)) 'Adapter wrote outside the Docket sync namespace.'

    $status = & $adapter -Action Status -LocalStoreDir $store -LocalDataRoot $root -SyncRoot $sync -HarnessToolsPath $harnessTools
    Assert-True ($status.LocalDatabaseExists -eq $true) 'Adapter status lost the canonical Docket database.'
    Assert-True ($status.SnapshotCount -eq 1) 'Adapter status did not find the export.'

    [pscustomobject]@{
        Result = 'PASS'
        CanonicalDatabase = $database
        ProjectNamespace = 'docket'
        SnapshotCount = $status.SnapshotCount
    }
}
finally {
    if (Test-Path -LiteralPath $root) {
        $resolved = [System.IO.Path]::GetFullPath($root)
        if ($resolved.StartsWith([System.IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
}
