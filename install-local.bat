@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo === AutoPost — cai dat local ===
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js. Cai Node 20+ tu https://nodejs.org/
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [LOI] Khong tim thay npm.
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.version"') do set NODE_VER=%%v
echo Node %NODE_VER%

echo.
echo [1/5] npm install ...
call npm install
if errorlevel 1 (
  echo [LOI] npm install that bai.
  exit /b 1
)

echo.
echo [2/5] npm run postinstall (ffmpeg + yt-dlp) ...
call npm run postinstall
if errorlevel 1 (
  echo [CANH BAO] postinstall loi — co the chay lai: npm run postinstall
)

if not exist ".env" (
  echo.
  echo [3/5] Tao file .env ...
  if exist ".env.local.example" (
    copy /Y ".env.local.example" ".env" >nul
  ) else if exist ".env.production.example" (
    copy /Y ".env.production.example" ".env" >nul
  ) else (
    echo [LOI] Khong co .env.local.example hoac .env.production.example
    exit /b 1
  )
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\seed-local-env.ps1" -EnvPath "%~dp0.env"
) else (
  echo.
  echo [3/5] .env da ton tai — giu nguyen.
)

echo.
echo [4/5] npx drizzle-kit push ...
call npx drizzle-kit push
if errorlevel 1 (
  echo [LOI] drizzle-kit push that bai.
  exit /b 1
)

echo.
echo [5/5] Hoan tat.
echo.
echo   Dev:        npm run dev
echo   URL:        http://localhost:3000  (hoac PORT trong .env)
echo.
echo   Cap nhat code:    update-code.bat
echo   Production local: start.bat  (build truoc bang update-code.bat)
echo   Sua .env neu can: BETTER_AUTH_URL, Facebook, ENCRYPTION_KEY
echo.
endlocal
exit /b 0
