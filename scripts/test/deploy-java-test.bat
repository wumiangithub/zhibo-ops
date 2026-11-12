@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-java-test.ps1" %*
if errorlevel 1 (
  echo Deploy failed.
  pause
  exit /b 1
)
echo Done.
pause
