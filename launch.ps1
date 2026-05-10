$root = "C:\Users\user\Desktop\suv pro"

Start-Process powershell -ArgumentList "-NoProfile -NoExit -Command `"cd '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000`"" -WindowStyle Normal
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoProfile -NoExit -Command `"cd '$root\bot'; .\.venv\Scripts\python.exe main.py`"" -WindowStyle Normal

Write-Host "Backend + Bot started"
