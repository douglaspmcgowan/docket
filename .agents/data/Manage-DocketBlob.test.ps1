$ErrorActionPreference = 'Stop'

$adapter = Join-Path $PSScriptRoot 'Manage-DocketBlob.ps1'
$root = Join-Path $env:TEMP ('docket-blob-adapter-' + [Guid]::NewGuid().ToString('N'))
$dataRoot = Join-Path $root 'data-root'
$source = Join-Path $dataRoot 'runtime\source'
$export = Join-Path $dataRoot 'private\export'
$snapshotRoot = Join-Path $dataRoot 'private\snapshots'
$manifestSnapshotRoot = Join-Path $dataRoot 'private\manifest-snapshots'
$explicitSnapshotRoot = Join-Path $dataRoot 'private\explicit-snapshots'
$manifest = Join-Path $dataRoot 'data-manifest.yaml'
$target = Join-Path $dataRoot 'runtime\restore-target'

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

try {
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    $documents = @{
        'items.json' = '{"x":{"id":"x","title":"Card","options":["Approve","Reject"]}}'
        'results.json' = '{}'
        'tickets.json' = '{}'
        'reads.json' = '{}'
    }
    foreach ($entry in $documents.GetEnumerator()) {
        [IO.File]::WriteAllText((Join-Path $source $entry.Key), $entry.Value, [Text.UTF8Encoding]::new($false))
    }
    [IO.File]::WriteAllText(
        $manifest,
        "version: 2`nproject: `"docket`"`nassets:`n  - id: `"docket-cloud-authority`"`n    retention_daily: 5`n    retention_weekly: 6`n    retention_monthly: 7`n",
        [Text.UTF8Encoding]::new($false)
    )

    $published = & $adapter -Action Export -Source Local -DataRoot $dataRoot -LocalStoreDir $source -ExportPath $export
    Assert-True ($published.ok -eq $true) 'Adapter export did not report success.'
    Assert-True (Test-Path -LiteralPath (Join-Path $export 'docket-export.json')) 'Adapter export manifest is missing.'

    $verified = & $adapter -Action Verify -DataRoot $dataRoot -ExportPath $export
    Assert-True ($verified.ok -eq $true) 'Adapter verify did not report success.'

    $dryRun = & $adapter -Action Restore -DataRoot $dataRoot -ExportPath $export -RestoreTarget $target
    Assert-True ($dryRun.dryRun -eq $true) 'Restore must default to a dry run.'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $target 'items.json'))) 'Dry restore mutated the target.'

    $restored = & $adapter -Action Restore -DataRoot $dataRoot -ExportPath $export -RestoreTarget $target -Disposable
    Assert-True ($restored.ok -eq $true) 'Disposable restore did not report success.'
    Assert-True (Test-Path -LiteralPath (Join-Path $target 'items.json')) 'Disposable restore did not write all documents.'

    $snapshot = & $adapter -Action Snapshot -Source Local -DataRoot $dataRoot -LocalStoreDir $source `
        -SnapshotRoot $snapshotRoot -Daily 1 -Weekly 0 -Monthly 0 -RetentionDryRun
    Assert-True ($snapshot.ok -eq $true) 'Adapter snapshot did not report success.'
    Assert-True ($snapshot.retention.daily -eq 1) 'Adapter did not forward daily retention.'
    Assert-True ($snapshot.retention.weekly -eq 0) 'Adapter did not forward weekly retention.'
    Assert-True ($snapshot.retention.monthly -eq 0) 'Adapter did not forward monthly retention.'
    Assert-True ((Get-ChildItem -LiteralPath $snapshotRoot -Directory).Count -eq 1) 'Adapter did not publish one timestamped snapshot.'

    $manifestSnapshot = & $adapter -Action Snapshot -Source Local -DataRoot $dataRoot -LocalStoreDir $source `
        -SnapshotRoot $manifestSnapshotRoot -ManifestPath $manifest -RetentionDryRun
    Assert-True ($manifestSnapshot.retention.daily -eq 5) 'Adapter did not use manifest daily retention.'
    Assert-True ($manifestSnapshot.retention.weekly -eq 6) 'Adapter did not use manifest weekly retention.'
    Assert-True ($manifestSnapshot.retention.monthly -eq 7) 'Adapter did not use manifest monthly retention.'

    $explicitSnapshot = & $adapter -Action Snapshot -Source Local -DataRoot $dataRoot -LocalStoreDir $source `
        -SnapshotRoot $explicitSnapshotRoot -ManifestPath $manifest -Daily 101 -Weekly 0 -Monthly 0 -RetentionDryRun
    Assert-True ($explicitSnapshot.retention.daily -eq 101) 'Explicit daily retention did not override the manifest.'
    Assert-True ($explicitSnapshot.retention.weekly -eq 0) 'Explicit weekly zero did not override the manifest.'
    Assert-True ($explicitSnapshot.retention.monthly -eq 0) 'Explicit monthly zero did not override the manifest.'

    $escapeBlocked = $false
    try {
        & $adapter -Action Snapshot -Source Local -DataRoot $dataRoot -LocalStoreDir $source `
            -SnapshotRoot (Join-Path (Split-Path $dataRoot -Parent) 'escaped-snapshots') | Out-Null
    }
    catch {
        $escapeBlocked = $_.Exception.Message -match 'under DataRoot'
    }
    Assert-True $escapeBlocked 'Adapter allowed a snapshot root outside DataRoot.'

    Write-Output 'Manage-DocketBlob adapter tests passed.'
}
finally {
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}
