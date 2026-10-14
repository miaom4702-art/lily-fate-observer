# gen_scenes.ps1 —— 生成黑白像素场景图 + 标题背景。
# 运行： powershell -ExecutionPolicy Bypass -File tools\gen_scenes.ps1
# 场景图放在 assets/images/scenes/，标题背景放在 assets/images/ui/。
# 想换成网图：同名覆盖即可（见 assets/README.txt）。

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
$root = "D:\LilyFateBoard\assets\images"
New-Item -ItemType Directory -Path "$root\scenes" -Force | Out-Null

$K = [System.Drawing.Color]::FromArgb(255, 18, 18, 18)
$D = [System.Drawing.Color]::FromArgb(255, 74, 74, 74)
$M = [System.Drawing.Color]::FromArgb(255, 138, 138, 138)
$L = [System.Drawing.Color]::FromArgb(255, 205, 205, 205)
$W = [System.Drawing.Color]::FromArgb(255, 245, 245, 245)

function New-Bmp([int]$w,[int]$h,[System.Drawing.Color]$bg){
  $b = New-Object System.Drawing.Bitmap($w,$h,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.Clear($bg); $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  return ,@($b,$g)
}
function F($g,[int]$x,[int]$y,[int]$w,[int]$h,$c){
  $br = New-Object System.Drawing.SolidBrush($c); $g.FillRectangle($br,$x,$y,$w,$h); $br.Dispose()
}
function E($g,[int]$x,[int]$y,[int]$w,[int]$h,$c){
  $br = New-Object System.Drawing.SolidBrush($c); $g.FillEllipse($br,$x,$y,$w,$h); $br.Dispose()
}
function Save-One($b,$g,$path){ $b.Save($path,[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose() }

$sw=80; $sh=45

# 图书室
$p=New-Bmp $sw $sh $W; $b=$p[0]; $g=$p[1]
F $g 0 38 $sw 7 $M
F $g 34 6 16 12 $L; F $g 34 6 16 1 $K; F $g 34 6 1 12 $K; F $g 49 6 1 12 $K; F $g 34 17 16 1 $K
F $g 5 8 22 30 $K; F $g 6 9 20 28 $W
for($y=12;$y -lt 36;$y+=6){ F $g 6 $y 20 1 $K
  for($x=8;$x -lt 25;$x+=3){ F $g $x ($y+1) 2 4 $D } }
F $g 53 8 22 30 $K; F $g 54 9 20 28 $W
for($y=12;$y -lt 36;$y+=6){ F $g 54 $y 20 1 $K
  for($x=56;$x -lt 73;$x+=3){ F $g $x ($y+1) 2 4 $M } }
Save-One $b $g "$root\scenes\library.png"

# 走廊
$p=New-Bmp $sw $sh $W; $b=$p[0]; $g=$p[1]
F $g 0 36 $sw 9 $M
for($i=0;$i -lt 4;$i++){ $x=8+$i*18; F $g $x 9 13 18 $L; F $g $x 9 13 1 $K; F $g ($x+12) 9 1 18 $K; F $g $x 9 13 1 $K; F $g $x 26 13 1 $K; F $g ($x+6) 9 1 18 $K }
F $g 0 33 $sw 1 $K
Save-One $b $g "$root\scenes\corridor.png"

# 操场
$p=New-Bmp $sw $sh $W; $b=$p[0]; $g=$p[1]
F $g 0 0 $sw 22 $L
F $g 0 22 $sw 1 $K
F $g 0 28 $sw 1 $M; F $g 0 34 $sw 1 $M; F $g 0 40 $sw 1 $M
F $g 66 12 10 14 $M; F $g 69 24 4 10 $D; F $g 68 10 6 4 $M
Save-One $b $g "$root\scenes\field.png"

# 保健室
$p=New-Bmp $sw $sh $W; $b=$p[0]; $g=$p[1]
F $g 0 38 $sw 7 $L
F $g 8 22 34 16 $K; F $g 9 23 32 14 $W
F $g 10 20 10 4 $L
F $g 58 8 12 12 $W; F $g 58 8 12 1 $K; F $g 58 19 12 1 $K; F $g 58 8 1 12 $K; F $g 69 8 1 12 $K
F $g 62 11 4 6 $M; F $g 63 12 2 4 $W
Save-One $b $g "$root\scenes\infirmary.png"

# 天台
$p=New-Bmp $sw $sh $W; $b=$p[0]; $g=$p[1]
F $g 0 0 $sw 30 $L
E $g 60 6 14 14 $W; F $g 60 6 14 1 $M
F $g 0 30 $sw 1 $K
for($x=2;$x -lt $sw;$x+=8){ F $g $x 30 1 8 $K }
F $g 0 30 $sw 1 $K; F $g 0 36 $sw 1 $K
F $g 0 38 $sw 7 $M
Save-One $b $g "$root\scenes\rooftop.png"

# 标题背景（160x90）
$p=New-Bmp 160 90 $W; $b=$p[0]; $g=$p[1]
F $g 0 0 160 40 $L
E $g 126 8 20 20 $W
F $g 40 34 80 40 $K; F $g 42 36 76 38 $W
for($y=42;$y -lt 72;$y+=8){ for($x=46;$x -lt 116;$x+=8){ F $g $x $y 4 5 $M } }
F $g 0 74 160 16 $W; F $g 0 74 160 1 $K
F $g 14 50 10 24 $D; E $g 8 40 22 18 $K; E $g 9 41 20 16 $M
F $g 136 52 8 22 $D; E $g 131 44 18 16 $K; E $g 132 45 16 14 $M
Save-One $b $g "$root\ui\bg_title.png"

Write-Output "scenes regenerated at $root\scenes"
