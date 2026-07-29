$ErrorActionPreference = 'Stop'

$adapter = Join-Path $PSScriptRoot 'Manage-DocketBlob.ps1'
$root = Join-Path $env:TEMP ('docket-blob-adapter-' + [Guid]::NewGuid().ToString('N'))
$dataRoot = Join-Path $root 'data-root'
$source = Join-Path $dataRoot 'runtime\source'
$export = Join-Path $dataRoot 'private\export'
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

    Write-Output 'Manage-DocketBlob adapter tests passed.'
}
finally {
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}
