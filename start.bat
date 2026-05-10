@echo off
echo ========================================
echo  SuvPro - Starting all services
echo ========================================
echo.

REM Stop any running Node processes
echo [1/3] Stopping old Node.js processes...
taskkill /F /IM node.exe >nul 2>&1

REM Start Docker Compose
echo [2/3] Starting Docker services...
docker compose -f docker-compose.dev.yml up -d

REM Wait for services to start
echo [3/3] Waiting for services to start...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo  All services started!
echo ========================================
echo.
echo  Web Panel:       http://localhost:5173
echo  Courier App:     http://localhost:5174
echo  Backend API:     http://localhost:8000
echo  API Docs:        http://localhost:8000/docs
echo.
echo Press any key to view logs...
pause >nul

docker compose -f docker-compose.dev.yml logs -f
