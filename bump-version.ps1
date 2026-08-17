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

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Read-Utf8($path) {
    [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8NoBom($path, $content) {
    [System.IO.File]::WriteAllText($path, $content, $Utf8NoBom)
}

# 1. Update root package.json
$RootPkgPath = Join-Path $PSScriptRoot "package.json"
if (Test-Path $RootPkgPath) {
    $RootPkg = Read-Utf8 $RootPkgPath | ConvertFrom-Json
    $RootPkg.version = $Version
    $json = $RootPkg | ConvertTo-Json -Depth 10
    Write-Utf8NoBom $RootPkgPath $json
    Write-Host "  -> Updated package.json" -ForegroundColor Green
}

# 2. Update frontend package.json
$FrontendPkgPath = Join-Path $PSScriptRoot "frontend\package.json"
if (Test-Path $FrontendPkgPath) {
    $FrontendPkg = Read-Utf8 $FrontendPkgPath | ConvertFrom-Json
    $FrontendPkg.version = $Version
    $json = $FrontendPkg | ConvertTo-Json -Depth 10
    Write-Utf8NoBom $FrontendPkgPath $json
    Write-Host "  -> Updated frontend/package.json" -ForegroundColor Green
}

# 3. Update src-tauri/tauri.conf.json
$TauriConfPath = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
if (Test-Path $TauriConfPath) {
    $TauriConf = Read-Utf8 $TauriConfPath | ConvertFrom-Json
    $TauriConf.version = $Version
    $json = $TauriConf | ConvertTo-Json -Depth 15
    Write-Utf8NoBom $TauriConfPath $json
    Write-Host "  -> Updated src-tauri/tauri.conf.json" -ForegroundColor Green
}

# 4. Update src-tauri/Cargo.toml
$CargoTomlPath = Join-Path $PSScriptRoot "src-tauri\Cargo.toml"
if (Test-Path $CargoTomlPath) {
    $CargoContent = Read-Utf8 $CargoTomlPath
    $CargoUpdated = $CargoContent -replace '(?m)^version\s*=\s*"[^"]+"', "version = `"$Version`""
    Write-Utf8NoBom $CargoTomlPath $CargoUpdated
    Write-Host "  -> Updated src-tauri/Cargo.toml" -ForegroundColor Green
}

# 5. Update frontend App.tsx version badge if present
$AppTsxPath = Join-Path $PSScriptRoot "frontend\src\App.tsx"
if (Test-Path $AppTsxPath) {
    $AppContent = Read-Utf8 $AppTsxPath
    $AppUpdated = $AppContent -replace 'v\d+\.\d+\.\d+', "v$Version"
    Write-Utf8NoBom $AppTsxPath $AppUpdated
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
