@echo off
echo ========================================
echo  SuvPro - Stopping all services
echo ========================================
echo.

REM Stop Docker services
echo [1/2] Stopping Docker services...
docker compose -f docker-compose.dev.yml down

REM Kill any remaining Node processes
echo [2/2] Stopping Node.js processes...
taskkill /F /IM node.exe >nul 2>&1

echo.
echo ========================================
echo  All services stopped!
echo ========================================
echo.
pause
