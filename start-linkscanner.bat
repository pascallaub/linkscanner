@echo off
echo Starting LinkScanner API...
cd /d "%~dp0"
docker-compose up -d
echo.
echo LinkScanner API is running on http://localhost:8000
echo Press any key to view logs...
pause > nul
docker-compose logs -f