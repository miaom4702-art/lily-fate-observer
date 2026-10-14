# gen_assets.ps1 —— 黑白像素风素材生成（v2 重设计）。
# 运行： powershell -ExecutionPolicy Bypass -File tools\gen_assets.ps1
# 头像用 24x24 参数化像素网格绘制（scale 4 → 96x96），含角色特征：
#   澪=细框眼镜 / 灯=运动发带 / 雫=发夹 / 纱织=银色挑染 / 苺=呆毛 / 悠=低马尾。
# 可随时用网上下载的黑白像素图同名覆盖。

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$root = "D:\LilyFateBoard\assets\images"
foreach($d in @("$root\avatars","$root\ui","$root\icons")){
	if(-not (Test-Path $d)){ New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

$BLACK = [System.Drawing.Color]::FromArgb(255, 18, 18, 18)
$DGRAY = [System.Drawing.Color]::FromArgb(255, 74, 74, 74)
$GRAY  = [System.Drawing.Color]::FromArgb(255, 138, 138, 138)
$LGRAY = [System.Drawing.Color]::FromArgb(255, 202, 202, 202)
$WHITE = [System.Drawing.Color]::FromArgb(255, 245, 245, 245)

function New-Canvas([int]$w,[int]$h){
	$b = New-Object System.Drawing.Bitmap($w,$h,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
	$g = [System.Drawing.Graphics]::FromImage($b)
	$g.Clear([System.Drawing.Color]::Transparent)
	$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
	$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
	$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
	return ,@($b,$g)
}
function Fill($g,[int]$x,[int]$y,[int]$w,[int]$h,$c,[int]$s){
	$br = New-Object System.Drawing.SolidBrush($c)
	$g.FillRectangle($br, ($x*$s), ($y*$s), ($w*$s), ($h*$s))
	$br.Dispose()
}
function Save-One($b,$g,$path){ $b.Save($path,[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose() }

# ================= 头像（24x24 网格 ×4 = 96px） =================
function Draw-Avatar($path,[int]$style){
	$s = 4
	$p = New-Canvas (24*$s) (24*$s); $b=$p[0]; $g=$p[1]

	# 制服 / 衣领
	Fill $g 3 19 18 5 $BLACK $s
	Fill $g 4 20 16 4 $GRAY  $s
	Fill $g 10 18 4 4 $WHITE $s
	Fill $g 11 20 2 2 $GRAY  $s
	# 脖子
	Fill $g 10 16 4 3 $WHITE $s
	Fill $g 10 16 4 1 $GRAY  $s
	# 头（描边 + 面部）
	Fill $g 6 4 12 13 $BLACK $s
	Fill $g 7 5 10 11 $WHITE $s

	# 头发 + 角色特征
	switch($style){
		0 { # 星见澪：长直黑发 + 细框眼镜
			Fill $g 6 2 12 6 $BLACK $s; Fill $g 5 6 2 14 $BLACK $s; Fill $g 17 6 2 14 $BLACK $s
			Fill $g 7 5 4 2 $BLACK $s; Fill $g 13 5 4 2 $BLACK $s }
		1 { # 白石灯：短发 + 运动发带
			Fill $g 6 2 12 5 $BLACK $s; Fill $g 5 6 2 4 $BLACK $s; Fill $g 17 6 2 4 $BLACK $s
			Fill $g 7 4 10 3 $BLACK $s; Fill $g 6 7 12 1 $LGRAY $s }
		2 { # 雨宫雫：中长 + 发夹
			Fill $g 6 2 12 6 $BLACK $s; Fill $g 5 6 2 9 $BLACK $s; Fill $g 17 6 2 9 $BLACK $s
			Fill $g 7 5 4 3 $BLACK $s; Fill $g 13 5 4 2 $BLACK $s; Fill $g 15 5 2 1 $LGRAY $s }
		3 { # 神代纱织：长直 + 银灰挑染
			Fill $g 6 2 12 6 $BLACK $s; Fill $g 5 6 2 15 $BLACK $s; Fill $g 17 6 2 15 $BLACK $s
			Fill $g 7 4 10 4 $BLACK $s; Fill $g 8 3 2 12 $LGRAY $s }
		4 { # 森川苺：短卷发 + 呆毛
			Fill $g 6 2 12 5 $BLACK $s; Fill $g 7 5 10 2 $BLACK $s
			Fill $g 5 3 2 3 $BLACK $s; Fill $g 17 3 2 3 $BLACK $s; Fill $g 4 5 2 2 $BLACK $s; Fill $g 18 5 2 2 $BLACK $s
			Fill $g 12 0 1 3 $BLACK $s; Fill $g 13 0 2 1 $BLACK $s }
		5 { # 莲见悠：低马尾
			Fill $g 6 2 12 6 $BLACK $s; Fill $g 5 6 2 5 $BLACK $s; Fill $g 7 4 10 4 $BLACK $s
			Fill $g 18 7 3 11 $BLACK $s; Fill $g 17 8 2 2 $GRAY $s }
	}

	# 五官
	Fill $g 9 10 2 2 $BLACK $s; Fill $g 13 10 2 2 $BLACK $s      # 眼
	Fill $g 9 10 1 1 $WHITE $s; Fill $g 13 10 1 1 $WHITE $s      # 高光
	Fill $g 9 8 2 1 $GRAY $s;  Fill $g 13 8 2 1 $GRAY $s         # 眉
	Fill $g 11 14 2 1 $BLACK $s                                   # 嘴
	Fill $g 8 13 1 1 $LGRAY $s; Fill $g 15 13 1 1 $LGRAY $s       # 腮红

	# 眼镜（最后画，压在脸上）
	if($style -eq 0){
		Fill $g 8 9 4 1 $BLACK $s; Fill $g 8 9 1 4 $BLACK $s; Fill $g 8 12 4 1 $BLACK $s
		Fill $g 12 9 4 1 $BLACK $s; Fill $g 15 9 1 4 $BLACK $s; Fill $g 12 12 4 1 $BLACK $s
		Fill $g 11 10 2 1 $BLACK $s
	}
	Save-One $b $g $path
}
Draw-Avatar "$root\avatars\mio.png" 0
Draw-Avatar "$root\avatars\akari.png" 1
Draw-Avatar "$root\avatars\shizuku.png" 2
Draw-Avatar "$root\avatars\saori.png" 3
Draw-Avatar "$root\avatars\ichigo.png" 4
Draw-Avatar "$root\avatars\yuu.png" 5

# ================= 表情（24x24 ×3 = 72px） =================
function Draw-Emote($path,[int]$kind){
	$s = 3
	$p = New-Canvas (24*$s) (24*$s); $b=$p[0]; $g=$p[1]
	# 脸
	Fill $g 6 3 12 1 $BLACK $s; Fill $g 6 20 12 1 $BLACK $s
	Fill $g 4 6 1 12 $BLACK $s; Fill $g 19 6 1 12 $BLACK $s
	Fill $g 5 4 14 16 $WHITE $s; Fill $g 6 5 12 14 $WHITE $s
	switch($kind){
		0 { # 笑 ^ ^
			Fill $g 8 10 1 1 $BLACK $s; Fill $g 9 9 1 1 $BLACK $s; Fill $g 10 10 1 1 $BLACK $s
			Fill $g 13 10 1 1 $BLACK $s; Fill $g 14 9 1 1 $BLACK $s; Fill $g 15 10 1 1 $BLACK $s
			Fill $g 9 14 1 1 $BLACK $s; Fill $g 10 15 4 1 $BLACK $s; Fill $g 14 14 1 1 $BLACK $s }
		1 { # 思考 + 问号
			Fill $g 8 10 2 2 $BLACK $s; Fill $g 14 10 2 2 $BLACK $s
			Fill $g 11 15 2 1 $BLACK $s
			Fill $g 17 4 2 1 $BLACK $s; Fill $g 19 5 1 2 $BLACK $s; Fill $g 18 7 2 1 $BLACK $s; Fill $g 18 9 1 1 $BLACK $s }
		2 { # 惊讶
			Fill $g 7 9 3 3 $BLACK $s; Fill $g 8 10 1 1 $WHITE $s
			Fill $g 14 9 3 3 $BLACK $s; Fill $g 15 10 1 1 $WHITE $s
			Fill $g 10 14 4 4 $BLACK $s; Fill $g 11 15 2 2 $WHITE $s }
		3 { # 爱心眼
			Fill $g 7 9 4 3 $BLACK $s; Fill $g 6 9 1 1 $BLACK $s; Fill $g 11 9 1 1 $BLACK $s
			Fill $g 8 12 2 1 $BLACK $s; Fill $g 9 13 1 1 $BLACK $s
			Fill $g 13 9 4 3 $BLACK $s; Fill $g 12 9 1 1 $BLACK $s; Fill $g 17 9 1 1 $BLACK $s
			Fill $g 14 12 2 1 $BLACK $s; Fill $g 15 13 1 1 $BLACK $s
			Fill $g 11 16 2 1 $BLACK $s }
		4 { # 哭
			Fill $g 8 10 2 2 $BLACK $s; Fill $g 14 10 2 2 $BLACK $s
			Fill $g 9 12 1 3 $LGRAY $s; Fill $g 15 12 1 3 $LGRAY $s
			Fill $g 9 16 1 1 $BLACK $s; Fill $g 10 15 4 1 $BLACK $s; Fill $g 14 16 1 1 $BLACK $s }
		5 { # 嘘
			Fill $g 8 10 2 2 $BLACK $s; Fill $g 14 10 2 2 $BLACK $s
			Fill $g 9 15 6 1 $BLACK $s; Fill $g 13 12 1 6 $BLACK $s }
	}
	Save-One $b $g $path
}
for($i=0; $i -lt 6; $i++){ Draw-Emote "$root\icons\emote_$i.png" $i }

# ================= 卡背（12x16 ×4 = 48x64） =================
function Draw-CardBack($path){
	$s = 4
	$p = New-Canvas (12*$s) (16*$s); $b=$p[0]; $g=$p[1]
	Fill $g 0 0 12 16 $BLACK $s
	Fill $g 1 1 10 14 $WHITE $s
	Fill $g 2 2 8 12 $BLACK $s
	for($y=2; $y -lt 14; $y++){ for($x=2; $x -lt 10; $x++){ if((($x+$y) % 2) -eq 0){ Fill $g $x $y 1 1 $DGRAY $s } } }
	# 中央菱形徽记
	Fill $g 5 7 2 2 $WHITE $s; Fill $g 4 8 4 2 $WHITE $s; Fill $g 5 6 2 6 $WHITE $s
	Fill $g 6 8 2 2 $BLACK $s
	Save-One $b $g $path
}
Draw-CardBack "$root\ui\card_back.png"

# ================= 分隔线 =================
function Draw-Divider($path){
	$s = 3
	$p = New-Canvas (32*$s) (2*$s); $b=$p[0]; $g=$p[1]
	Fill $g 0 0 32 1 $BLACK $s
	Fill $g 0 1 32 1 $LGRAY $s
	Save-One $b $g $path
}
Draw-Divider "$root\ui\divider.png"

# ================= 标题像素爱心 =================
function Draw-Heart($path){
	$s = 6
	$p = New-Canvas (16*$s) (16*$s); $b=$p[0]; $g=$p[1]
	$rows = @("..XX..XX..",".XXXXXXXX.","XXXXXXXXXX","XXXXXXXXXX","XXXXXXXXXX",".XXXXXXXX.","..XXXXXX..","...XXXX...","....XX....")
	for($y=0; $y -lt $rows.Count; $y++){ for($x=0; $x -lt 10; $x++){ if($rows[$y][$x] -eq 'X'){ Fill $g ($x+3) ($y+3) 1 1 $BLACK $s } } }
	Save-One $b $g $path
}
Draw-Heart "$root\ui\heart.png"

# ================= 标题徽记（像素百合花） =================
function Draw-Logo($path){
	$s = 4
	$p = New-Canvas (24*$s) (24*$s); $b=$p[0]; $g=$p[1]
	# 五瓣花
	$petals = @(
		@(11,2,2,5), @(11,17,2,5), @(2,11,5,2), @(17,11,5,2),
		@(5,5,4,4), @(15,5,4,4), @(5,15,4,4), @(15,15,4,4)
	)
	foreach($pt in $petals){ Fill $g $pt[0] $pt[1] $pt[2] $pt[3] $BLACK $s }
	Fill $g 10 10 4 4 $WHITE $s
	Fill $g 11 11 2 2 $BLACK $s
	Save-One $b $g $path
}
Draw-Logo "$root\ui\logo.png"

Write-Output "assets regenerated (v2) at $root"
