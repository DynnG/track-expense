$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:FRONTEND_ORIGIN = 'http://127.0.0.1:5176'
if (!(Test-Path -LiteralPath '.venv\Scripts\python.exe') -or !(Test-Path -LiteralPath 'node_modules')) {
    throw 'Install dependencies first. See README.md.'
}
$apiProcess = Start-Process -FilePath '.venv\Scripts\python.exe' -ArgumentList @('-m','uvicorn','backend.app:app','--host','127.0.0.1','--port','8000') -WindowStyle Hidden -PassThru
try {
    npm.cmd run dev -- --port 5176 --strictPort
} finally {
    if (!$apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id }
}
