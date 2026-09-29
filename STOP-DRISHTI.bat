@echo off
rem Stops the DRISHTI server and the demo fleet simulator.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*simulator.py*' -or $_.CommandLine -like '*uvicorn main:app*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo DRISHTI stopped.
timeout /t 2 >nul
