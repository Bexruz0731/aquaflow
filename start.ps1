# ============================================================
#  SuvPro — Start Script
#  Запускает cloudflare tunnels, обновляет .env, запускает всё
# ============================================================

$ROOT = $PSScriptRoot

function Write-Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-ERR($msg)  { Write-Host "    ERR: $msg" -ForegroundColor Red }

# ---- 1. Docker (postgres + redis) --------------------------
Write-Step "Docker: postgres + redis"
Set-Location $ROOT
docker compose up -d postgres redis 2>&1 | Out-Null
Start-Sleep -Seconds 2
Write-OK "postgres + redis"

# ---- 2. Запуск backend -------------------------------------
Write-Step "Backend (FastAPI :8000)"
$backendLog = "$ROOT\backend\backend.log"
$backendProc = Start-Process -FilePath "powershell" `
    -ArgumentList "-NoProfile -Command `"cd '$ROOT\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 2>&1 | Tee-Object -FilePath '$backendLog'`"" `
    -PassThru -WindowStyle Minimized
Write-OK "PID $($backendProc.Id)"

# ---- 3. Cloudflare tunnels ---------------------------------
Write-Step "Cloudflare tunnels"

$cfExe = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cfExe) {
    # Ищем рядом с проектом или в стандартных местах
    $candidates = @(
        "$ROOT\cloudflared.exe",
        "$env:USERPROFILE\cloudflared.exe",
        "C:\tools\cloudflared.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $cfExe = $c; break }
    }
    if (-not $cfExe) {
        Write-ERR "cloudflared не найден. Скачай: https://github.com/cloudflare/cloudflared/releases/latest"
        Write-ERR "Положи cloudflared.exe в папку проекта или в PATH и запусти снова."
        exit 1
    }
} else {
    $cfExe = $cfExe.Source
}

Write-OK "cloudflared: $cfExe"

$clientLog  = "$ROOT\tunnel_client.log"
$courierLog = "$ROOT\tunnel_courier.log"

# Запуск tunnel для client-app (порт 5173)
$tunnelClient = Start-Process -FilePath $cfExe `
    -ArgumentList "tunnel --url http://localhost:5173 --no-autoupdate" `
    -RedirectStandardError $clientLog `
    -PassThru -WindowStyle Hidden
Write-OK "Client tunnel PID $($tunnelClient.Id) -> log: tunnel_client.log"

# Запуск tunnel для courier-app (порт 5174)
$tunnelCourier = Start-Process -FilePath $cfExe `
    -ArgumentList "tunnel --url http://localhost:5174 --no-autoupdate" `
    -RedirectStandardError $courierLog `
    -PassThru -WindowStyle Hidden
Write-OK "Courier tunnel PID $($tunnelCourier.Id) -> log: tunnel_courier.log"

# ---- 4. Ждём URL из логов ----------------------------------
Write-Step "Ожидание URL от cloudflare (до 30 сек)..."

function Get-TunnelUrl($logFile) {
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $logFile) {
            $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
                return $Matches[0]
            }
        }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

$clientUrl  = Get-TunnelUrl $clientLog
$courierUrl = Get-TunnelUrl $courierLog

if (-not $clientUrl)  { Write-ERR "Не удалось получить client URL";  exit 1 }
if (-not $courierUrl) { Write-ERR "Не удалось получить courier URL"; exit 1 }

Write-OK "Client  URL: $clientUrl"
Write-OK "Courier URL: $courierUrl"

# ---- 5. Обновляем .env файлы --------------------------------
Write-Step "Обновление .env файлов"

function Set-EnvValue($file, $key, $value) {
    if (-not (Test-Path $file)) { Write-ERR ".env не найден: $file"; return }
    $content = Get-Content $file -Raw
    if ($content -match "(?m)^$key=.*$") {
        $content = $content -replace "(?m)^$key=.*$", "$key=$value"
    } else {
        $content = $content.TrimEnd() + "`n$key=$value`n"
    }
    Set-Content $file $content -NoNewline
    Write-OK "$file  →  $key=$value"
}

# client-app и courier-app
Set-EnvValue "$ROOT\client-app\.env"  "VITE_API_URL" "https://$(([Uri]$clientUrl).Host)/api/v1"

# Нет — client-app и courier-app обращаются к бэкенду через отдельный tunnel.
# Используем один общий API tunnel (порт 8000) — ниже.

# backend tunnel (порт 8000) для mini-apps
$backendLog2 = "$ROOT\tunnel_backend.log"
$tunnelBackend = Start-Process -FilePath $cfExe `
    -ArgumentList "tunnel --url http://localhost:8000 --no-autoupdate" `
    -RedirectStandardError $backendLog2 `
    -PassThru -WindowStyle Hidden
Write-OK "Backend tunnel PID $($tunnelBackend.Id)"

$backendUrl = Get-TunnelUrl $backendLog2
if (-not $backendUrl) { Write-ERR "Не удалось получить backend tunnel URL"; exit 1 }
Write-OK "Backend URL: $backendUrl"

# Обновляем .env для mini-apps (API)
Set-EnvValue "$ROOT\client-app\.env"  "VITE_API_URL" "$backendUrl/api/v1"
Set-EnvValue "$ROOT\courier-app\.env" "VITE_API_URL" "$backendUrl/api/v1"

# Обновляем bot/.env
Set-EnvValue "$ROOT\bot\.env" "WEB_APP_CLIENT_URL"  $clientUrl
Set-EnvValue "$ROOT\bot\.env" "WEB_APP_COURIER_URL" $courierUrl

# Обновляем backend ALLOWED_ORIGINS
Set-EnvValue "$ROOT\backend\.env" "ALLOWED_ORIGINS" "$clientUrl,$courierUrl,http://localhost:5173,http://localhost:5174,http://localhost:3000"

# ---- 6. Сборка/запуск frontend dev серверов ----------------
Write-Step "Client Mini App (Vite :5173)"
$clientProc = Start-Process -FilePath "powershell" `
    -ArgumentList "-NoProfile -Command `"cd '$ROOT\client-app'; npm run dev -- --port 5173 --host`"" `
    -PassThru -WindowStyle Minimized
Write-OK "PID $($clientProc.Id)"

Write-Step "Courier Mini App (Vite :5174)"
$courierProc = Start-Process -FilePath "powershell" `
    -ArgumentList "-NoProfile -Command `"cd '$ROOT\courier-app'; npm run dev -- --port 5174 --host`"" `
    -PassThru -WindowStyle Minimized
Write-OK "PID $($courierProc.Id)"

Write-Step "Web Panel (Vite :5175)"
$webProc = Start-Process -FilePath "powershell" `
    -ArgumentList "-NoProfile -Command `"cd '$ROOT\web'; npm run dev -- --port 5175 --host`"" `
    -PassThru -WindowStyle Minimized
Write-OK "PID $($webProc.Id)"

# ---- 7. Бот ------------------------------------------------
Write-Step "Telegram Bot"
$botProc = Start-Process -FilePath "powershell" `
    -ArgumentList "-NoProfile -Command `"cd '$ROOT\bot'; .\.venv\Scripts\python.exe main.py`"" `
    -PassThru -WindowStyle Minimized
Write-OK "PID $($botProc.Id)"

# ---- 8. Итог -----------------------------------------------
Write-Host ""
Write-Host "=============================================" -ForegroundColor Yellow
Write-Host "  ВСЁ ЗАПУЩЕНО!" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow
Write-Host "  Web Panel:    http://localhost:5175" -ForegroundColor White
Write-Host "  Client App:   $clientUrl" -ForegroundColor White
Write-Host "  Courier App:  $courierUrl" -ForegroundColor White
Write-Host "  Backend API:  $backendUrl" -ForegroundColor White
Write-Host "  Backend API:  http://localhost:8000" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Для остановки всего: ./stop.ps1" -ForegroundColor Gray
Write-Host ""

# Сохраняем текущие URL в файл для удобства
@"
CLIENT_URL=$clientUrl
COURIER_URL=$courierUrl
BACKEND_URL=$backendUrl
GENERATED=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@ | Set-Content "$ROOT\current_urls.txt"

Write-OK "URL сохранены в current_urls.txt"
