# iReview Windows installer
# Usage:  irm https://raw.githubusercontent.com/suhothayan/iReview/main/docs/install.ps1 | iex

$ErrorActionPreference = "Stop"

$dir = "$env:USERPROFILE\.ireview"
$bin = "$dir\ireview.exe"
$url = "https://github.com/suhothayan/iReview/releases/latest/download/ireview-windows-x64.exe"

Write-Host "Installing iReview to $dir" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $dir | Out-Null
Invoke-WebRequest -Uri $url -OutFile $bin -UseBasicParsing

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$dir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$dir", "User")
    Write-Host "Added $dir to your user PATH." -ForegroundColor Green
    Write-Host "Open a NEW terminal window for 'ireview' to be on PATH." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Run 'ireview' from inside any git repository." -ForegroundColor Green
