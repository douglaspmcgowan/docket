param(
    [Parameter(Mandatory)] [string]$Root,
    [Parameter(Mandatory)]
    [ValidateSet('add-task', 'complete-task', 'close-cell', 'set-ownership', 'transfer-ownership')]
    [string]$Action,
    [string]$TaskId,
    [string]$Title,
    [string]$Acceptance,
    [string[]]$Dependencies = @(),
    [string]$CheckId,
    [ValidateSet('test', 'command')] [string]$CheckVerifier,
    [string]$CheckExecutable,
    [string[]]$CheckArguments = @(),
    [string[]]$CheckInputs = @(),
    [string[]]$CheckArtifacts = @(),
    [ValidateRange(1, 3600)] [int]$CheckTimeoutSeconds = 300,
    [ValidateRange(64, 10485760)] [int64]$CheckMaxOutputBytes = 1048576,
    [string[]]$Evidence = @(),
    [string]$SessionId,
    [string[]]$Artifacts = @(),
    [string]$Artifact,
    [string]$FromSession,
    [string]$ToSession,
    [switch]$Confirmed
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkScope.psm1') -Force

$result = switch ($Action) {
    'add-task' {
        if (-not $TaskId -or -not $Title -or -not $Acceptance -or
            -not $CheckId -or -not $CheckVerifier -or -not $CheckExecutable) {
            throw 'add-task requires TaskId, Title, Acceptance, CheckId, CheckVerifier, and CheckExecutable.'
        }
        Add-WorkScopeTask -Root $Root -TaskId $TaskId -Title $Title -Acceptance $Acceptance `
            -Dependencies $Dependencies -CheckId $CheckId -CheckVerifier $CheckVerifier `
            -CheckExecutable $CheckExecutable -CheckArguments $CheckArguments `
            -CheckInputs $CheckInputs -CheckArtifacts $CheckArtifacts `
            -CheckTimeoutSeconds $CheckTimeoutSeconds `
            -CheckMaxOutputBytes $CheckMaxOutputBytes
    }
    'complete-task' {
        if (-not $TaskId) {
            throw 'complete-task requires TaskId.'
        }
        Complete-WorkScopeTask -Root $Root -TaskId $TaskId -Evidence $Evidence
    }
    'close-cell' {
        Close-WorkScopeCell -Root $Root -Evidence $Evidence
    }
    'set-ownership' {
        if (-not $SessionId) {
            throw 'set-ownership requires SessionId.'
        }
        Set-WorkScopeOwnership -Root $Root -SessionId $SessionId -Artifacts $Artifacts
    }
    'transfer-ownership' {
        if (-not $Artifact -or -not $FromSession -or -not $ToSession) {
            throw 'transfer-ownership requires Artifact, FromSession, and ToSession.'
        }
        Move-WorkScopeOwnership -Root $Root -Artifact $Artifact -FromSession $FromSession -ToSession $ToSession -Confirmed:$Confirmed
    }
}
$result | ConvertTo-Json -Depth 30
