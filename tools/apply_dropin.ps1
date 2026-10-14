# apply_dropin.ps1 —— 把「素材放入区」里的图片按文件名应用到游戏。
# 文件名规则：
#   <角色id>.png / .jpg …        → 裁成方形头像（mio akari shizuku saori ichigo yuu）
#   scene_<名>.png               → 覆盖 assets/images/scenes/<名>.png
#   ui_<名>.png                  → 覆盖 assets/images/ui/<名>.png
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$drop = Join-Path $PSScriptRoot '素材放入区'
if (-not (Test-Path $drop)) { New-Item -ItemType Directory -Path $drop | Out-Null; Write-Host "已创建：$drop"; exit 0 }

$ids = @('mio','akari','shizuku','saori','ichigo','yuu')
$imgs = Get-ChildItem -LiteralPath $drop -File -Include *.png,*.jpg,*.jpeg,*.webp,*.ogg,*.mp3,*.wav,*.m4a -ErrorAction SilentlyContinue
if (-not $imgs) { Write-Host "「素材放入区」里还没有文件。"; exit 0 }

foreach ($f in $imgs) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($f.Name).ToLower()
  $ext = $f.Extension.ToLower()
  # 音频：sfx_xxx / bgm_xxx
  if ($name -like 'sfx_*') {
    $n = $name.Substring(4)
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $root "assets\audio\sfx\$n$ext") -Force
    Write-Host "已替换音效：sfx\$n$ext" -ForegroundColor Green
    continue
  }
  if ($name -like 'bgm_*') {
    $n = $name.Substring(4)
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $root "assets\audio\bgm\$n$ext") -Force
    Write-Host "已替换 BGM：bgm\$n$ext" -ForegroundColor Green
    continue
  }
  if ($ext -notin @('.png','.jpg','.jpeg','.webp')) { Write-Host "跳过：$($f.Name)"; continue }
  if ($ids -contains $name) {
    & (Join-Path $PSScriptRoot 'set_avatar.ps1') -Char $name -Image $f.FullName
    continue
  }
  if ($name -like 'scene_*') {
    $n = $name.Substring(6)
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $root "assets\images\scenes\$n.png") -Force
    Write-Host "已替换场景：scenes\$n.png" -ForegroundColor Green
    continue
  }
  if ($name -like 'ui_*') {
    $n = $name.Substring(3)
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $root "assets\images\ui\$n.png") -Force
    Write-Host "已替换界面：ui\$n.png" -ForegroundColor Green
    continue
  }
  Write-Host "跳过无法识别的文件名：$($f.Name)"
}
Write-Host "完成。浏览器按 Ctrl+F5 刷新查看。"
