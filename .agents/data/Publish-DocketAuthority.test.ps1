[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$adapter = Join-Path $PSScriptRoot 'Publish-DocketAuthority.ps1'
$root = Join-Path ([System.IO.Path]::GetTempPath()) ("docket-authority-adapter-" + [guid]::NewGuid().ToString('N'))
$repository = Join-Path $root 'repo'
$dataRoot = Join-Path $root 'data'
$syncRoot = Join-Path $root 'sync'
$relative = 'private/docket-cloud-exports'
$exportRoot = Join-Path $dataRoot ('docket\' + $relative.Replace('/', '\'))
$failures = 0

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        $script:failures++
        Write-Output "FAIL: $Message"
    }
}

function Invoke-Adapter {
    param([string]$Action)
    & $adapter `
        -Action $Action `
        -Repository $repository `
        -Project 'docket' `
        -AssetId 'docket-cloud-authority' `
        -RelativeDestination $relative `
        -DataRoot $dataRoot `
        -SyncRoot $syncRoot
}

try {
    New-Item -ItemType Directory -Path (Join-Path $repository '.agents\data') -Force | Out-Null
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $syncRoot -Force | Out-Null

    # A stand-in for the real blob adapter: the wrapper under test must call it, never
    # reimplement it, so the test asserts the delegation rather than the blob logic.
    $stub = Join-Path $repository '.agents\data\Manage-DocketBlob.ps1'
    Set-Content -LiteralPath $stub -Value @'
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Inspect','Export','Snapshot','Verify','Restore')][string]$Action,
    [ValidateSet('Cloud','Local')][string]$Source = 'Cloud',
    [string]$DataRoot,
    [string]$SnapshotRoot,
    [string]$ExportPath
)
[pscustomobject]@{ Called = $Action; Source = $Source; SnapshotRoot = $SnapshotRoot; ExportPath = $ExportPath }
'@

    $unlinked = Invoke-Adapter -Action Publish
    Assert-True ($unlinked.Result -eq 'ATTENTION_REQUIRED') 'Publish passed without a Vercel project link.'
    Assert-True (-not $unlinked.Linked) 'Publish misreported the link state.'
    Assert-True ($unlinked.Reason -match 'vercel link') 'Publish did not name the action that unblocks it.'

    $noExport = Invoke-Adapter -Action Verify
    Assert-True ($noExport.Result -eq 'ATTENTION_REQUIRED') 'Verify passed with no retained export of the cloud authority.'

    $restore = Invoke-Adapter -Action Restore
    Assert-True ($restore.Result -eq 'PASS' -and -not $restore.Restored) 'Restore did not defer to the supervised procedure.'

    New-Item -ItemType Directory -Path (Join-Path $exportRoot '2026-08-15T02-00-00-000Z') -Force | Out-Null
    $verified = Invoke-Adapter -Action Verify
    Assert-True ($verified.Result -eq 'PASS') 'Verify failed against a retained export.'
    Assert-True ($verified.Verification.Called -eq 'Verify') 'Verify did not delegate to the blob adapter.'

    New-Item -ItemType Directory -Path (Join-Path $repository '.vercel') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $repository '.vercel\project.json') -Value '{}'
    $published = Invoke-Adapter -Action Publish
    Assert-True ($published.Result -eq 'PASS' -and $published.Published) 'Publish failed against a linked repository.'
    Assert-True ($published.Snapshot.Called -eq 'Snapshot') 'Publish did not delegate a cloud snapshot to the blob adapter.'
    Assert-True ($published.Snapshot.Source -eq 'Cloud') 'Publish did not target the declared cloud authority.'

    $rejected = $false
    try {
        & $adapter -Action Verify -Repository $repository -Project 'docket' -AssetId 'docket-cloud-authority' `
            -RelativeDestination 'runtime/exports' -DataRoot $dataRoot -SyncRoot $syncRoot | Out-Null
    }
    catch { $rejected = $true }
    Assert-True $rejected 'Adapter accepted a destination outside the private export class it owns.'
}
finally {
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}

if ($failures) {
    throw "Publish-DocketAuthority adapter tests failed: $failures"
}
Write-Output 'Publish-DocketAuthority adapter tests passed.'
