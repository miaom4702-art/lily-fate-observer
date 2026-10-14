# build_content.ps1 —— 把 content\*.txt 纯文本转成游戏数据 content\generated.js
# 一般不用手动运行：双击根目录的「启动游戏.bat」会自动先跑本脚本再打开游戏。
param([string]$Root)

Add-Type -AssemblyName System.Text.Encoding | Out-Null
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$contentDir = Join-Path $Root 'content'

function Read-Lines([string]$path){
  if (-not (Test-Path $path)) { throw "缺少文件：$path" }
  return ([System.IO.File]::ReadAllText($path, (New-Object System.Text.UTF8Encoding $false))) -split "`r?`n"
}
function Split-List($s){
  if (-not $s) { return @() }
  return @(($s -split '[、,，]') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
}

# ---------- 角色 ----------
$cblocks = New-Object System.Collections.ArrayList
$cur = $null
foreach ($line in (Read-Lines (Join-Path $contentDir 'characters.txt'))){
  if ($line -match '^\s*#'){
    $cur = [ordered]@{ __name = ($line -replace '^\s*#\s*','').Trim() }
    [void]$cblocks.Add($cur)
  } elseif ($cur -ne $null -and $line -match ':'){
    $i = $line.IndexOf(':')
    $cur[$line.Substring(0,$i).Trim()] = $line.Substring($i+1).Trim()
  }
}
$characters = New-Object System.Collections.ArrayList
foreach ($b in $cblocks){
  if (-not $b['id']) { continue }
  [void]$characters.Add([ordered]@{
    id = $b['id']
    name = $b['__name']
    title = $b['身份']
    color = if ($b['颜色']) { $b['颜色'] } else { '#8a8a8a' }
    prefs = @(Split-List $b['偏好'])
    dislikes = @(Split-List $b['雷点'])
    secret = $b['秘密']
    personality = $b['性格']
    likeTags = @(Split-List $b['喜好标签'])
    dislikeTags = @(Split-List $b['雷点标签'])
    secretResist = [double]($b['告白抵抗'])
    portrait = 'assets/images/avatars/' + $b['id'] + '.png'
  })
}

# ---------- 卡牌 ----------
$typeMap = @{ '日常'='daily'; '危机'='crisis'; '高阶'='confession' }
$cardBlocks = New-Object System.Collections.ArrayList
$cur = $null
foreach ($line in (Read-Lines (Join-Path $contentDir 'cards.txt'))){
  if ($line -match '^\s*#'){
    $cur = [ordered]@{ __name = ($line -replace '^\s*#\s*','').Trim(); __actions = @{}; __reactions = @{}; __closings = (New-Object System.Collections.ArrayList) }
    [void]$cardBlocks.Add($cur)
  } elseif ($cur -ne $null -and $line -match ':'){
    if ($line -match '^出手\s+([a-z]+)\s*:\s*(.*)$'){ $cur['__actions'][$Matches[1]] = $Matches[2].Trim() }
    elseif ($line -match '^反应\s+([a-z]+)\s*:\s*(.*)$'){ $cur['__reactions'][$Matches[1]] = $Matches[2].Trim() }
    elseif ($line -match '^尾句\s*:\s*(.*)$'){ [void]$cur['__closings'].Add($Matches[1].Trim()) }
    else { $i = $line.IndexOf(':'); $cur[$line.Substring(0,$i).Trim()] = $line.Substring($i+1).Trim() }
  }
}
$cards = New-Object System.Collections.ArrayList
foreach ($b in $cardBlocks){
  if (-not $b['id']) { continue }
  # 效果
  $effects = New-Object System.Collections.ArrayList
  if ($b['效果']){
    foreach ($part in ($b['效果'] -split '[、,，]')){
      if ($part -match '^\s*([ABab])\s*(?:>|＞|→|->)\s*([ABab])\s*([+-]?\d+)\s*$'){
        [void]$effects.Add([ordered]@{
          from = if ($Matches[1] -eq 'A') { 'self' } else { 'other' }
          to   = if ($Matches[2] -eq 'A') { 'self' } else { 'other' }
          amount = [int]$Matches[3]
        })
      }
    }
  }
  [void]$cards.Add([ordered]@{
    id = $b['id']
    name = $b['__name']
    type = if ($typeMap[$b['类型']]) { $typeMap[$b['类型']] } else { 'daily' }
    cost = [int]$b['消耗']
    targets = [int]$b['目标']
    tags = @(Split-List $b['标签'])
    effects = @($effects)
    desc = $b['说明']
    actions = $b['__actions']
    reactions = $b['__reactions']
    closings = @($b['__closings'])
  })
}

# ---------- 叙事 ----------
function Parse-Sections([string]$path){
  $secs = [ordered]@{}
  $cur = $null
  foreach ($line in (Read-Lines $path)){
    if ($line -match '^\s*\[(.+?)\]\s*$'){ $cur = $Matches[1].Trim(); $secs[$cur] = @(); continue }
    if ($cur -ne $null){ $secs[$cur] = $secs[$cur] + @($line) }
  }
  return $secs
}
function NonEmpty($arr){ return @($arr | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }) }
$story = Parse-Sections (Join-Path $contentDir 'story.txt')
$getList = { param($k) @(NonEmpty $story[$k]) }
$first = { param($k) $arr = @(NonEmpty $story[$k]); if ($arr.Count) { $arr[0] } else { '' } }
$text = [ordered]@{
  introLines = (& $getList '开场')
  chapters = (& $getList '章节')
  confessOk = (& $getList '告白成功')
  confessFail = (& $getList '告白失败')
  confessNotMet = (& $getList '告白不足')
  secretReveal = (& $first '秘密揭晓')
  secretHidden = (& $first '秘密未揭晓')
  affinityLine = (& $first '好感行')
  epilogues = [ordered]@{
    couples = (& $getList '结局-双向')
    triangle = (& $getList '结局-三角')
    unrequited = (& $getList '结局-单向')
    friendship = (& $getList '结局-挚友')
    none = (& $getList '结局-平淡')
  }
  prologue = (& $getList '序章')
  prologueChars = [ordered]@{
    mio = (& $first '序章-mio'); akari = (& $first '序章-akari'); shizuku = (& $first '序章-shizuku')
    saori = (& $first '序章-saori'); ichigo = (& $first '序章-ichigo'); yuu = (& $first '序章-yuu')
  }
}

# ---------- 界面 ----------
$ui = Parse-Sections (Join-Path $contentDir 'ui.txt')
function KV($arr){
  $m = [ordered]@{}
  foreach ($l in $arr){ if ($l -match '^\s*([^=]+?)\s*=\s*(.*)$'){ $m[$Matches[1].Trim()] = $Matches[2].Trim() } }
  return $m
}
$helpSections = New-Object System.Collections.ArrayList
$hcur = $null
foreach ($l in $ui['帮助']){
  if ($l -match '^\s*#\s+(.+)$'){ $hcur = [ordered]@{ h = $Matches[1].Trim() }; [void]$helpSections.Add($hcur) }
  elseif ($hcur -ne $null){
    if ($l -match '^\s*-\s*(.+)$'){ if (-not $hcur['list']){ $hcur['list'] = New-Object System.Collections.ArrayList }; [void]$hcur['list'].Add($Matches[1].Trim()) }
    elseif ($l.Trim() -ne ''){ $hcur['p'] = ($hcur['p'] + $l.Trim()) }
  }
}
# ArrayList → 普通数组，去掉空
$helpOut = @()
foreach ($s in $helpSections){
  $o = [ordered]@{ h = $s['h'] }
  if ($s['p']) { $o['p'] = $s['p'] }
  if ($s['list']) { $o['list'] = @($s['list']) }
  $helpOut += $o
}
$uiOut = [ordered]@{
  phaseNames = (KV $ui['阶段'])
  steps = @(NonEmpty $ui['步骤'])
  sectionTitles = (KV $ui['标题'])
  guide = (KV $ui['引导'])
  buttons = (KV $ui['按钮'])
  notes = (KV $ui['说明'])
  help = [ordered]@{ title = '玩法说明'; sections = @($helpOut) }
  tips = [ordered]@{ title = '玩法提示'; items = @(NonEmpty $ui['玩法提示']) }
}

# ---------- 输出 ----------
$content = [ordered]@{
  characters = @($characters)
  cards = @($cards)
  text = $text
  ui = $uiOut
}
$json = $content | ConvertTo-Json -Depth 30
$outPath = Join-Path $contentDir 'generated.js'
$js = "window.CONTENT = " + $json + ";`r`n"
[System.IO.File]::WriteAllText($outPath, $js, (New-Object System.Text.UTF8Encoding $false))
Write-Output ("已生成 content\generated.js：角色 " + $characters.Count + "，卡牌 " + $cards.Count + "，开场 " + $text.introLines.Count + "，章节 " + $text.chapters.Count + "，帮助章节 " + $helpOut.Count + "，玩法提示 " + $uiOut.tips.items.Count)
