@echo off
setlocal

if not exist .env (
  echo No .env file found — copy .env.example to .env and fill in your values.
  echo.
)

echo Starting Florr3D backend on port 8081...
start "Florr3D Backend" cmd /k "npm run server"

timeout /t 3 >nul

echo Starting Cloudflare Tunnel (public URL for Vercel + WebSocket)...
if exist cloudflared.log del cloudflared.log
start "Tunnel" cmd /k "cloudflared tunnel --url http://localhost:8081 > cloudflared.log 2>&1"

echo.
echo Waiting for tunnel URL...
set TUNNEL=
for /L %%i in (1,1,30) do (
  timeout /t 2 >nul
  if exist cloudflared.log (
    for /f "delims=" %%u in ('findstr /R "https://.*\.trycloudflare\.com" cloudflared.log') do set TUNNEL=%%u
    if defined TUNNEL goto :found
  )
)

:found
echo.
echo ============================================
echo  Backend + tunnel setup
echo ============================================
echo.
echo Local server:  http://localhost:8081
if defined TUNNEL (
  echo Public tunnel: %TUNNEL%
  echo.
  echo Set in your local .env:
  echo   DISCORD_REDIRECT_URI=%TUNNEL%/auth/callback
  echo.
  echo Set in Vercel ^(Settings - Environment Variables^):
  echo   VITE_API_URL=%TUNNEL%
  echo   VITE_WS_URL=wss://YOUR-TUNNEL-HOST/ws
  echo.
  echo Then redeploy on Vercel after changing env vars.
) else (
  echo Tunnel URL not found yet — check the Tunnel window or cloudflared.log
)
echo.
echo Keep both windows open while players are online.
echo ============================================
pause
