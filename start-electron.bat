@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден.
  echo Установите Node.js 18+ с https://nodejs.org/ и запустите снова.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Установка зависимостей...
  call npm install
  if errorlevel 1 (
    echo [ОШИБКА] Не удалось установить зависимости.
    pause
    exit /b 1
  )
)

echo Сборка и запуск MilitaRIA в Electron...
call npm run electron:start
if errorlevel 1 (
  echo.
  echo [ОШИБКА] Запуск завершился с ошибкой.
  pause
)

endlocal
