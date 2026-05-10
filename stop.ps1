# Останавливает все процессы проекта

Write-Host "Останавливаем все процессы..." -ForegroundColor Cyan

# Убиваем cloudflared туннели
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "  cloudflared остановлен" -ForegroundColor Green

# Убиваем uvicorn (backend)
Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -like "*uvicorn*" -or $_.CommandLine -like "*uvicorn*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Убиваем node/vite процессы на наших портах
@(5173, 5174, 5175, 8000) | ForEach-Object {
    $port = $_
    $pid = (netstat -ano | Select-String ":$port " | Where-Object { $_ -match 'LISTENING' } | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1)
    if ($pid) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "  Порт $port (PID $pid) освобождён" -ForegroundColor Green
    }
}

Write-Host "Готово." -ForegroundColor Yellow
