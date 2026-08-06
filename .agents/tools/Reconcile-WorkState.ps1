param(
    [Parameter(Mandatory)] [string]$Root,
    [switch]$Repair
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkScope.psm1') -Force
$before = Test-WorkScopeReconciliation -Root $Root
if (-not $before.reconciled -and $Repair) {
    $transactionPath = Join-Path $Root '.agents\work\transaction.json'
    if (Test-Path -LiteralPath $transactionPath) {
        Repair-WorkScopeTransaction -Root $Root | Out-Null
    }
    if ((Test-WorkScopeState -Root $Root).valid) {
        Sync-WorkScopeViews -Root $Root | Out-Null
    }
}
$result = Test-WorkScopeReconciliation -Root $Root
$result | ConvertTo-Json -Depth 20
if (-not $result.reconciled) {
    exit 1
}
