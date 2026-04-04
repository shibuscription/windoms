[CmdletBinding()]
param(
  [string]$BucketName = "windoms-minamigaoka.firebasestorage.app",
  [string]$ConfigPath = "",
  [switch]$Apply,
  [switch]$SkipConfirm
)

$ErrorActionPreference = "Stop"

if (-not $ConfigPath) {
  $scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
  $ConfigPath = Join-Path $scriptDirectory "storage-cors.minamigaoka.json"
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud CLI was not found. Install Google Cloud SDK and run this script in an authenticated environment."
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "CORS config file was not found: $ConfigPath"
}

$resolvedConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
$bucketUrl = "gs://$BucketName"
$describeArgs = @("storage", "buckets", "describe", $bucketUrl, "--format=default(cors_config)")
$updateArgs = @("storage", "buckets", "update", $bucketUrl, "--cors-file=$resolvedConfigPath")

function Invoke-GcloudCommand {
  param(
    [string[]]$Arguments,
    [string]$FailureMessage
  )

  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
}

Write-Host "Target bucket : $bucketUrl"
Write-Host "Config file   : $resolvedConfigPath"
Write-Host ""
Write-Host "[1/3] Checking current CORS configuration"
Invoke-GcloudCommand -Arguments $describeArgs -FailureMessage "Failed to describe current bucket CORS configuration."

if (-not $Apply) {
  Write-Host ""
  Write-Host "Dry-run only. No changes were applied."
  Write-Host "Run again with -Apply to update the bucket CORS configuration."
  return
}

if (-not $SkipConfirm) {
  $answer = Read-Host "Type y to apply this CORS configuration"
  if ($answer -notin @("y", "Y")) {
    Write-Host "Canceled."
    return
  }
}

Write-Host ""
Write-Host "[2/3] Applying CORS configuration"
Invoke-GcloudCommand -Arguments $updateArgs -FailureMessage "Failed to apply bucket CORS configuration."

Write-Host ""
Write-Host "[3/3] Verifying updated CORS configuration"
Invoke-GcloudCommand -Arguments $describeArgs -FailureMessage "Failed to verify updated bucket CORS configuration."
