@echo off
setlocal EnableExtensions

pushd "%~dp0" || (
  echo [Backoffice] Failed to access the script directory.
  exit /b 1
)

set "URL=http://127.0.0.1:4310"

where npm >nul 2>nul
if errorlevel 1 (
  echo [Backoffice] npm was not found. Please install Node.js.
  pause
  popd
  exit /b 1
)

netstat -ano | findstr /R /C:":4310 .*LISTENING" >nul
if not errorlevel 1 (
  start "" "%URL%"
  popd
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath 'npm' -ArgumentList 'run','backoffice' -WorkingDirectory '%CD%'"
if errorlevel 1 (
  echo [Backoffice] Failed to start npm run backoffice.
  popd
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(30); do { Start-Sleep -Milliseconds 500; $ok=$false; try { $c=New-Object Net.Sockets.TcpClient; $ar=$c.BeginConnect('127.0.0.1',4310,$null,$null); $ok=$ar.AsyncWaitHandle.WaitOne(250); $c.Close() } catch {}; if($ok){ exit 0 } } while((Get-Date)-lt $deadline); exit 1"
if errorlevel 1 (
  echo [Backoffice] Server did not respond within 30 seconds. Opening anyway.
)

start "" "%URL%"
popd
exit /b 0
