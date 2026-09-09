@echo off

if not exist .env (
  echo No .env file found — copy .env.example to .env and add your Discord OAuth credentials.
  echo Discord login will be disabled until then.
  echo.
)

echo Starting Florr3D server...

start "Florr3D" cmd /k "npm run server"

timeout /t 5


echo Starting Cloudflare Tunnel...

start "Tunnel" cmd /k "cloudflared tunnel --url http://localhost:8081 > cloudflared.log"


timeout /t 10


echo Updating Worker...

node update-worker.js


echo DONE
pause