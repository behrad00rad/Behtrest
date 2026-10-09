$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Virtual environment setup failed.' }
    }
    & ./.venv/Scripts/python.exe -m pip install -r backend/requirements-lock.txt
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
    & ./.venv/Scripts/python.exe scripts/setup_backend.py
    if ($LASTEXITCODE -ne 0) { throw 'Environment setup failed.' }
    & ./.venv/Scripts/python.exe backend/manage.py migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migrations failed.' }
    Push-Location frontend
    try {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    } finally { Pop-Location }
    Write-Host 'Setup complete. See README.md for the two development server commands.'
} finally { Pop-Location }
