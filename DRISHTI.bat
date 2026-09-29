@echo off
rem Starts DRISHTI (server + demo fleet) and opens it as a phone-sized app window.
setlocal
set "ROOT=%~dp0"
powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) { Start-Process -WindowStyle Hidden -WorkingDirectory '%ROOT%backend' -FilePath python -ArgumentList '-m','uvicorn','main:app','--host','0.0.0.0','--port','8000' }"
timeout /t 4 /nobreak >nul
powershell -NoProfile -Command "if (-not (Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*simulator.py*' })) { Start-Process -WindowStyle Hidden -WorkingDirectory '%ROOT%backend' -FilePath python -ArgumentList 'simulator.py' }"
start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:8000/ --window-size=430,900 --user-data-dir="%LOCALAPPDATA%\DRISHTI\profile"
endlocal
