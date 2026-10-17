@echo off
title Studia - Servidor Local
echo ========================================================
echo   Iniciando Studia...
echo ========================================================

REM Intentar con Python si existe
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Iniciando con Python en http://localhost:8000
    start http://localhost:8000
    python -m http.server 8000
    goto :eof
)

REM Si no hay Python, intentar con Node (npx)
where npx >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Iniciando con Node en http://localhost:8000
    start http://localhost:8000
    npx serve . -l 8000
    goto :eof
)

REM Si no hay ni Python ni Node, usar PowerShell (integrado en todo Windows)
echo Iniciando servidor nativo de Windows (PowerShell)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port = 8000; Start-Process 'http://localhost:'+$port; $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:'+$port+'/'); $listener.Start(); Write-Host 'Studia activo en http://localhost:'+$port; while ($listener.IsListening) { $ctx = $listener.GetContext(); $req = $ctx.Request; $res = $ctx.Response; $path = $req.Url.LocalPath.TrimStart('/'); if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }; $full = Join-Path (Get-Location) $path; if (Test-Path $full -PathType Leaf) { $bytes = [System.IO.File]::ReadAllBytes($full); $ext = [System.IO.Path]::GetExtension($full).ToLower(); $mimes = @{'.html'='text/html'; '.css'='text/css'; '.js'='application/javascript'; '.json'='application/json'; '.pdf'='application/pdf'; '.md'='text/plain'}; $res.ContentType = if ($mimes.ContainsKey($ext)) { $mimes[$ext] } else { 'application/octet-stream' }; $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length) } else { $res.StatusCode = 404 }; $res.Close() }"
pause
