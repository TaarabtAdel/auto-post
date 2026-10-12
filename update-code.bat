@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo === AutoPost — cap nhat code ===
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [LOI] Khong tim thay git. Cai Git for Windows hoac them git vao PATH.
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js.
  exit /b 1
)

echo [1/2] git pull ...
git pull
if errorlevel 1 (
  echo [LOI] git pull that bai.
  exit /b 1
)

echo.
echo [2/2] npm run build ...
call npm run build
if errorlevel 1 (
  echo [LOI] npm run build that bai.
  exit /b 1
)

echo.
echo Hoan tat. Chay start.bat de mo app production local.
echo.
endlocal
exit /b 0
