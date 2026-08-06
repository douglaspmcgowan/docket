param(
    [Parameter(Mandatory)] [string]$Root,
    [Parameter(Mandatory)] [ValidateSet('drilldown', 'expand')] [string]$Mode,
    [Parameter(Mandatory)] [bool]$Automatic,
    [Parameter(Mandatory)] [ValidateSet('D0', 'D1', 'D2', 'D3', 'D4', 'D5')] [string]$DepthCeiling,
    [Parameter(Mandatory)] [ValidateSet('capability', 'track', 'project', 'portfolio', 'system')] [string]$BreadthBoundary,
    [Parameter(Mandatory)] [ValidateSet('dependency-first', 'highest-value', 'highest-risk', 'shortest-ready', 'balanced')] [string]$SelectionStrategy,
    [switch]$Confirmed
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkScope.psm1') -Force
Set-WorkScopeFrontier @PSBoundParameters | ConvertTo-Json -Depth 20
