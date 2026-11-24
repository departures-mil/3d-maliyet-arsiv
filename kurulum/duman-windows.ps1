# Windows duman testi (CI, windows-latest): derlenmiş exe gerçek Edge penceresiyle açılır; kabuk API'si, pencerenin
# bulunması ve pencere düğmeleri (Küçült / Orta / Tam ekran) Windows API'siyle denenir. Veriler geçici klasöre yazılır.
#   pwsh kurulum/duman-windows.ps1 -Exe dist/MaliyetArsiv3D.exe
param([string]$Exe = "dist/MaliyetArsiv3D.exe")
$ErrorActionPreference = "Stop"
$tmp = Join-Path $env:RUNNER_TEMP ("ma3d-duman-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$env:MA3D_VERI = Join-Path $tmp "veri"
$env:MA3D_CIKTI = Join-Path $tmp "cikti"
$base = "http://127.0.0.1:41751"
$p = Start-Process -FilePath (Resolve-Path $Exe) -PassThru
$sonuc = [ordered]@{}
function Get-Json($yol) { Invoke-RestMethod -Uri ($base + $yol) -TimeoutSec 10 }
function Post-Json($yol) { Invoke-RestMethod -Method Post -ContentType "application/json" -Body "{}" -Uri ($base + $yol) -TimeoutSec 15 }
try {
  for ($i = 0; $i -lt 60; $i++) { try { $info = Get-Json "/__shell/info"; break } catch { Start-Sleep -Milliseconds 500 } }
  if (-not $info) { throw "kabuk yanıt vermedi" }
  $sonuc.info = "$($info.app) $($info.version) paket $($info.bundle) port $($info.port) sabit=$($info.fixedPort)"
  # Çevrim dışı OCR (Windows.Media.Ocr): örnek dilimleyici satırı çizilir, okunur
  try {
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap 900, 140
    $gr = [System.Drawing.Graphics]::FromImage($bmp); $gr.Clear([System.Drawing.Color]::FromArgb(40, 40, 44))
    $font = New-Object System.Drawing.Font("Segoe UI", 22)
    $gr.DrawString("Total Filament:   4.79 m   14.29 g   zaxe_abs", $font, [System.Drawing.Brushes]::White, 10, 10)
    $gr.DrawString("Total time:   1h8m + Calibration Time", $font, [System.Drawing.Brushes]::White, 10, 70)
    $png = Join-Path $tmp "ocr.png"; $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
    $o = Invoke-RestMethod -Method Post -ContentType "application/octet-stream" -InFile $png -Uri ($base + "/__shell/ocr") -TimeoutSec 90
    $sonuc.ocr = ($o.satirlar -join " | ") + " [" + $o.dil + "]"
  } catch { $sonuc.ocr = "HATA: " + $_.Exception.Message }
  $html = (Invoke-WebRequest -UseBasicParsing -Uri ($base + "/")).Content
  if ($html -notmatch "cekirdek/fc-core.js") { throw "index.html yanlış" }
  $sonuc.hostjs = ((Invoke-WebRequest -UseBasicParsing -Uri ($base + "/__shell/host.js")).Content -match "window.fcHost")
  # sayfa açılıp kendini tanıtana kadar bekle (Edge ilk açılışı yavaş olabilir)
  $d = $null
  for ($i = 0; $i -lt 60; $i++) { $d = Get-Json "/__shell/pencere/durum"; if ($d.bulundu) { break }; Start-Sleep -Milliseconds 500 }
  $sonuc.pencereBulundu = [bool]$d.bulundu
  $sonuc.acilisTamEkran = [bool]$d.fullscreen
  if ($d.bulundu) {
    $o = Post-Json "/__shell/pencere/orta";  $sonuc.orta = "half=$($o.half) full=$($o.fullscreen)"
    Start-Sleep -Milliseconds 600
    $t = Post-Json "/__shell/pencere/orta";  $sonuc.ortaTekrar = "half=$($t.half) full=$($t.fullscreen)"
    Start-Sleep -Milliseconds 600
    $k = Post-Json "/__shell/pencere/kucult"; $sonuc.kucult = "min=$($k.minimized)"
    Start-Sleep -Milliseconds 600
    $f = Post-Json "/__shell/pencere/tam-ac"; $sonuc.tamAc = "full=$($f.fullscreen) min=$($f.minimized)"
  }
} finally {
  try { Post-Json "/__shell/kapat" | Out-Null } catch {}
  Start-Sleep -Seconds 3
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  $sonuc | ConvertTo-Json | Write-Host
  if ($env:GITHUB_STEP_SUMMARY) {
    "### Windows duman testi" | Out-File -Append $env:GITHUB_STEP_SUMMARY
    foreach ($k in $sonuc.Keys) { "- $k : $($sonuc[$k])" | Out-File -Append $env:GITHUB_STEP_SUMMARY }
  }
}
if (-not $sonuc.hostjs) { throw "host.js yok" }
