# set_avatar.ps1 —— 把任意图片自动裁成方形并缩放，替换指定角色的头像。
# 用法： powershell -ExecutionPolicy Bypass -File tools\set_avatar.ps1 -Char mio -Image "D:\图片.png"
# 可加 -Bias 0.02~0.20 调整竖向裁切位置（越大越往下，默认 0.06 偏向头顶）。
param(
  [Parameter(Mandatory=$true)][string]$Char,
  [Parameter(Mandatory=$true)][string]$Image,
  [double]$Bias = 0.06,
  [int]$Size = 640
)
Add-Type -AssemblyName System.Drawing
$ids = @('mio','akari','shizuku','saori','ichigo','yuu')
if ($ids -notcontains $Char) { Write-Host "角色 id 必须是：$($ids -join ' / ')" -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath $Image)) { Write-Host "找不到图片：$Image" -ForegroundColor Red; exit 1 }

$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root "assets\images\avatars\$Char.png"
$src = [System.Drawing.Image]::FromFile($Image)
$W = $src.Width; $H = $src.Height

# —— 检测主体包围盒（背景多为白色）——
$bmp0 = New-Object System.Drawing.Bitmap($src)
$minX = $W; $minY = $H; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $H; $y += 2) {
  for ($x = 0; $x -lt $W; $x += 2) {
    $p = $bmp0.GetPixel($x, $y)
    $lum = 0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B
    if ($p.A -gt 16 -and $lum -lt 235) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$bmp0.Dispose()
if ($maxX -le $minX) { $minX = 0; $maxX = $W - 1; $minY = 0; $maxY = $H - 1 }

$side = [Math]::Min($W, $H)
$cx = ($minX + $maxX) / 2.0
$cropX = [int][Math]::Max(0, [Math]::Min($W - $side, $cx - $side / 2.0))
$cropY = [int][Math]::Max(0, [Math]::Min($H - $side, $minY - $side * $Bias))

$bmp = New-Object System.Drawing.Bitmap($Size, $Size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.DrawImage($src,
  (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)),
  $cropX, $cropY, $side, $side,
  [System.Drawing.GraphicsUnit]::Pixel)
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()

Write-Host "已更新：$outPath （裁自 ${W}x${H} 的 ($cropX,$cropY) 起 $side 方形）" -ForegroundColor Green
