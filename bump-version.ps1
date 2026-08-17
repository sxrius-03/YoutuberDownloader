param (
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$TargetVersion
)

$ErrorActionPreference = "Stop"

# Sanitize version string (remove leading 'v' if provided)
$Version = $TargetVersion.TrimStart('v', 'V').Trim()

if ($Version -notmatch '^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$') {
    Write-Error "Invalid semver format. Example: 2.0.3 or 2.1.0"
    exit 1
}

Write-Host "Bumping version across all project files to v$Version..." -ForegroundColor Cyan

# 1. Update root package.json
$RootPkgPath = Join-Path $PSScriptRoot "package.json"
if (Test-Path $RootPkgPath) {
    $RootPkg = Get-Content $RootPkgPath -Raw | ConvertFrom-Json
    $RootPkg.version = $Version
    $RootPkg | ConvertTo-Json -Depth 10 | Set-Content $RootPkgPath -Encoding utf8
    Write-Host "  -> Updated package.json" -ForegroundColor Green
}

# 2. Update frontend package.json
$FrontendPkgPath = Join-Path $PSScriptRoot "frontend\package.json"
if (Test-Path $FrontendPkgPath) {
    $FrontendPkg = Get-Content $FrontendPkgPath -Raw | ConvertFrom-Json
    $FrontendPkg.version = $Version
    $FrontendPkg | ConvertTo-Json -Depth 10 | Set-Content $FrontendPkgPath -Encoding utf8
    Write-Host "  -> Updated frontend/package.json" -ForegroundColor Green
}

# 3. Update src-tauri/tauri.conf.json
$TauriConfPath = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
if (Test-Path $TauriConfPath) {
    $TauriConf = Get-Content $TauriConfPath -Raw | ConvertFrom-Json
    $TauriConf.version = $Version
    $TauriConf | ConvertTo-Json -Depth 15 | Set-Content $TauriConfPath -Encoding utf8
    Write-Host "  -> Updated src-tauri/tauri.conf.json" -ForegroundColor Green
}

# 4. Update src-tauri/Cargo.toml
$CargoTomlPath = Join-Path $PSScriptRoot "src-tauri\Cargo.toml"
if (Test-Path $CargoTomlPath) {
    $CargoContent = Get-Content $CargoTomlPath -Raw
    $CargoUpdated = $CargoContent -replace '(?m)^version\s*=\s*"[^"]+"', "version = `"$Version`""
    Set-Content $CargoTomlPath -Value $CargoUpdated -Encoding utf8
    Write-Host "  -> Updated src-tauri/Cargo.toml" -ForegroundColor Green
}

# 5. Update frontend App.tsx version badge if present
$AppTsxPath = Join-Path $PSScriptRoot "frontend\src\App.tsx"
if (Test-Path $AppTsxPath) {
    $AppContent = Get-Content $AppTsxPath -Raw
    $AppUpdated = $AppContent -replace 'v\d+\.\d+\.\d+', "v$Version"
    Set-Content $AppTsxPath -Value $AppUpdated -Encoding utf8
    Write-Host "  -> Updated frontend/src/App.tsx version string" -ForegroundColor Green
}

Write-Host "`nAll files successfully bumped to v$Version." -ForegroundColor Green
Write-Host "Staging files and creating git tag v$Version..." -ForegroundColor Cyan

git add package.json frontend/package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml frontend/src/App.tsx
git commit -m "chore: bump version to v$Version"
git tag "v$Version"

Write-Host "`nTag v$Version created successfully!" -ForegroundColor Green
Write-Host "To publish the release, run:" -ForegroundColor Yellow
Write-Host "  git push origin main --tags`n" -ForegroundColor White
