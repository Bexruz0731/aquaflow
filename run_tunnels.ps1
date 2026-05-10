$cf   = "C:\Users\user\Desktop\suv pro\cloudflared.exe"
$root = "C:\Users\user\Desktop\suv pro"
$lc   = "$root\tunnel_client.log"
$lr   = "$root\tunnel_courier.log"

Write-Host "=== SuvPro Dev Startup ===" -ForegroundColor Cyan

# 1. Stop old cloudflared and node (Vite) processes
Write-Host "[1/6] Stopping old processes..." -ForegroundColor Yellow
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. Start cloudflare tunnels (only client + courier; API goes via Vite proxy)
Write-Host "[2/6] Starting cloudflare tunnels..." -ForegroundColor Yellow
"" | Set-Content $lc; "" | Set-Content $lr

Start-Process -FilePath $cf -ArgumentList "tunnel --url http://localhost:5173 --no-autoupdate" -RedirectStandardError $lc -WindowStyle Hidden
Start-Process -FilePath $cf -ArgumentList "tunnel --url http://localhost:5174 --no-autoupdate" -RedirectStandardError $lr -WindowStyle Hidden

# 3. Wait for URLs
Write-Host "[3/6] Waiting for tunnel URLs (up to 40s)..." -ForegroundColor Yellow

function Get-Url($log) {
    $deadline = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $deadline) {
        $txt = Get-Content $log -Raw -ErrorAction SilentlyContinue
        if ($txt -match "https://[a-z0-9\-]+\.trycloudflare\.com") { return $Matches[0] }
        Start-Sleep -Milliseconds 600
    }
    return $null
}

$urlClient  = Get-Url $lc
$urlCourier = Get-Url $lr

if (-not $urlClient -or -not $urlCourier) {
    Write-Host "ERROR: failed to get tunnel URLs" -ForegroundColor Red
    exit 1
}

Write-Host "  Client  -> $urlClient" -ForegroundColor Green
Write-Host "  Courier -> $urlCourier" -ForegroundColor Green

# 4. Update .env files BEFORE starting Vite (so Vite picks up correct env)
Write-Host "[4/6] Updating .env files..." -ForegroundColor Yellow

function Set-Env($file, $key, $value) {
    if (-not (Test-Path $file)) { return }
    $c = Get-Content $file -Raw
    if ($c -match "(?m)^$key=") { $c = $c -replace "(?m)^$key=.*$", "$key=$value" }
    else { $c = $c.TrimEnd() + "`n$key=$value`n" }
    Set-Content $file $c -NoNewline
}

# Mini-apps use Vite proxy (/api/v1) — API calls go through cloudflare tunnel → Vite → backend
Set-Content "$root\client-app\.env"  "VITE_API_URL=/api/v1"
Set-Content "$root\courier-app\.env" "VITE_API_URL=/api/v1"

# Bot gets mini-app URLs (API_BASE_URL is overridden inside docker to http://backend:8000)
Set-Env "$root\bot\.env" "WEB_APP_CLIENT_URL"  $urlClient
Set-Env "$root\bot\.env" "WEB_APP_COURIER_URL" $urlCourier

# Backend CORS — only frontend origins need to be listed (web panel at localhost:5175)
Set-Env "$root\backend\.env" "ALLOWED_ORIGINS" "[`"$urlClient`",`"$urlCourier`",`"http://localhost:5173`",`"http://localhost:5174`",`"http://localhost:5175`",`"http://localhost:3000`"]"

# 5. Start Vite dev servers (now they'll read updated .env)
Write-Host "[5/6] Starting frontend dev servers..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k cd /d `"$root\client-app`" && npx vite --port 5173" -WindowStyle Minimized
Start-Process cmd -ArgumentList "/k cd /d `"$root\courier-app`" && npx vite --port 5174" -WindowStyle Minimized
Start-Process cmd -ArgumentList "/k cd /d `"$root\web`" && npx vite --port 5175" -WindowStyle Minimized
Start-Sleep -Seconds 8

# 6. Docker compose up + force restart backend (new ALLOWED_ORIGINS) and bot (new URLs)
Write-Host "[6/6] Starting Docker services..." -ForegroundColor Yellow
Set-Location $root
docker compose -f docker-compose.dev.yml up -d --build 2>&1 | Select-String -Pattern "error|Error|ERRO" | ForEach-Object { Write-Host $_ -ForegroundColor Red }
Start-Sleep -Seconds 3
docker compose -f docker-compose.dev.yml restart backend bot 2>&1 | Out-Null
Write-Host "  Backend + Bot restarted with new config" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ALL SERVICES STARTED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Web Panel  : http://localhost:5175" -ForegroundColor White
Write-Host "  Client App : $urlClient" -ForegroundColor White
Write-Host "  Courier App: $urlCourier" -ForegroundColor White
Write-Host "  Backend    : http://localhost:8000 (direct)" -ForegroundColor White
Write-Host "  API via tunnel: $urlClient/api/v1/" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "NOTE: Client mini-app calls API through Vite proxy (no separate backend tunnel)"
Write-Host "To restart bot after URL change: docker compose -f docker-compose.dev.yml restart bot"
Write-Host "To see bot logs: docker compose -f docker-compose.dev.yml logs -f bot"
Write-Host "To stop all:     docker compose -f docker-compose.dev.yml down"
