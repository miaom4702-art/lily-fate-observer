assets/ —— 美术与音频素材（黑白像素风，全部相对路径 res:// 即网页相对路径）

目录结构
────────
assets/
├─ images/
│  ├─ avatars/        6 名少女头像（96x96，透明背景）
│  │     mio.png   星见澪（细框眼镜）
│  │     akari.png 白石灯（运动发带）
│  │     shizuku.png 雨宫雫（发夹）
│  │     saori.png 神代纱织（银灰挑染）
│  │     ichigo.png 森川苺（呆毛）
│  │     yuu.png   莲见悠（低马尾）
│  ├─ icons/          快捷表情 emote_0..5.png（72x72）
│  ├─ ui/             界面素材
│  │     logo.png            标题徽记（像素花）
│  │     heart.png           像素爱心
│  │     card_back.png       卡背
│  │     divider.png         分隔线
│  │     bg_title.png        标题背景（像素校园）
│  │     characters_sheet.png 角色总览图（6 张头像排一起，仅供查看）
│  └─ scenes/         场景横幅（随学期轮换显示在叙事区上方）
│        library.png 图书室 / corridor.png 走廊 / field.png 操场
│        infirmary.png 保健室 / rooftop.png 天台
├─ audio/
│  ├─ bgm/
│  └─ sfx/
└─ fonts/

如何替换
────────
· 头像：把同名 png（建议 96x96 或同等正方形、透明背景）覆盖 assets/images/avatars/<id>.png 即可。
· 表情：覆盖 assets/images/icons/emote_N.png。
· 界面：覆盖 assets/images/ui/ 下对应文件。
· 素材会用「最近邻」放大，保持像素锐利；风格建议纯黑白像素。

重新生成占位素材
────────────────
powershell -ExecutionPolicy Bypass -File tools\gen_assets.ps1      # 重画头像 / 表情 / 界面
powershell -ExecutionPolicy Bypass -File tools\gen_scenes.ps1      # 重画场景图 / 标题背景
powershell -ExecutionPolicy Bypass -File tools\make_charsheet.ps1  # 重新拼角色总览图

音频缺失时会用代码合成占位音；BGM 缺失则静默。

想找现成的网图素材（免费 / 可商用，注意看授权）
────────────────────────────────────────────
· Kenney（CC0，最省心）        https://kenney.nl/assets
· OpenGameArt（筛 CC0）        https://opengameart.org/
· itch.io 免费像素素材         https://itch.io/game-assets/free/tag-pixel-art
· Lospec 像素配色 + 资源       https://lospec.com/
· 角色头像可搜「pixel avatar generator」或 itch 上的 free portrait 包

用法：下载后把图片裁成正方形、去掉背景，用同名文件覆盖上面列出的文件即可。
建议保持纯黑白 / 灰阶风格，尺寸接近（头像 96x96、场景 160x90）。

