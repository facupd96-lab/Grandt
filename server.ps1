# Servidor Web Local Nativo de PowerShell (Cero dependencias)
$appDir = $PSScriptRoot
$portsToTry = @(3000, 3001, 3002, 8080, 8081, 5000)
$listener = $null
$activePort = 3000

foreach ($p in $portsToTry) {
    try {
        $tempListener = New-Object System.Net.HttpListener
        $tempListener.Prefixes.Add("http://localhost:$p/")
        $tempListener.Start()
        $listener = $tempListener
        $activePort = $p
        break
    } catch {
        if ($tempListener) { $tempListener.Close() }
    }
}

if (-not $listener -or -not $listener.IsListening) {
    Write-Host "No se pudo iniciar el servidor en ningún puerto estándar. Abriendo archivo index.html directamente..." -ForegroundColor Yellow
    Start-Process (Join-Path $appDir "index.html")
    Exit
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "🚀 SERVIDOR LOCAL GRAN DT ANALYZER PRO ACTIVO!" -ForegroundColor Green
Write-Host "👉 Abrí tu navegador en: http://localhost:$activePort" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan
Start-Process "http://localhost:$activePort"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".ico"  = "image/x-icon"
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    
    # CORS
    $response.AddHeader("Access-Control-Allow-Origin", "*")
    $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")

    if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 204
        $response.Close()
        continue
    }

    $urlPath = $request.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($urlPath)) { $urlPath = "index.html" }
    
    $filePath = Join-Path $appDir $urlPath

    if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
        $response.ContentType = $contentType
        
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.StatusCode = 200
    } else {
        $response.StatusCode = 404
        $buf = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($buf, 0, $buf.Length)
    }
    $response.Close()
}
