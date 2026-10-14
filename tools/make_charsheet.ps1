Add-Type -AssemblyName System.Drawing
$root="D:\LilyFateBoard\assets\images"
$names=@{mio='星见澪';akari='白石灯';shizuku='雨宫雫';saori='神代纱织';ichigo='森川苺';yuu='莲见悠'}
$ids=@('mio','akari','shizuku','saori','ichigo','yuu')
$cellW=150; $cellH=180
$W=$cellW*6; $H=$cellH
$bmp=New-Object System.Drawing.Bitmap($W,$H)
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255,242,242,242))
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.TextRenderingHint=[System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
$font=New-Object System.Drawing.Font("Microsoft YaHei",14)
$brush=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,20,20,20))
for($i=0;$i -lt 6;$i++){
  $id=$ids[$i]
  $img=[System.Drawing.Image]::FromFile("$root\avatars\$id.png")
  $x=$i*$cellW + ($cellW-120)/2
  $g.DrawImage($img,[int]$x,14,120,120)
  $sz=$g.MeasureString($names[$id],$font)
  $g.DrawString($names[$id],$font,$brush,[single]($i*$cellW+($cellW-$sz.Width)/2),[single]140)
  $img.Dispose()
}
$bmp.Save("$root\ui\characters_sheet.png",[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose()
Write-Output "sheet saved"
