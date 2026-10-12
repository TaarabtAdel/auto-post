@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo === AutoPost — start (production local) ===
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js.
  exit /b 1
)

if not exist ".next\BUILD_ID" (
  echo [CANH BAO] Chua build. Chay: npm run build  hoac  update-code.bat
  echo.
)

echo URL: http://localhost:3000
echo Dang mo trinh duyet sau khi server san sang ...
echo.

start /B cmd /c "ping -n 6 127.0.0.1 >nul && start http://localhost:3000/"

call npm start
set EXIT_CODE=%ERRORLEVEL%

endlocal
exit /b %EXIT_CODE%
