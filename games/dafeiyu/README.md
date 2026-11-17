# 大肥鱼

推动棋盘上的词块可以转移操控权、打开通路或改写胜利目标。棋盘上的 `BABA` 对应大肥鱼鲸鱼娘。珊瑚湾大世界串联五个原创关卡。

| 操作 | 键盘 | 手柄 |
| --- | --- | --- |
| 移动、选择关卡 | 方向键、WASD | 左摇杆、十字键 |
| 等待 | 空格 | A |
| 撤销 | Z 或退格 | B |
| 重做 | Y 或 Ctrl+Shift+Z | RB |
| 重开 | R | X |
| 打开或关闭关卡列表 | L | Y |
| 确认、进入地图节点、通关后返回地图 | Enter | A |
| 打开或关闭暂停面板 | M、Esc | Menu |
| 导入文件、导入文件夹 | I、F | 关卡列表中的按钮，可用平台指针模式 |

首页的「新游戏」和「继续游戏」都可选择 3 个存档位。每个存档保存当前关卡、地图解锁与已游玩的内置关卡包进度。覆盖已有存档需要确认。旧版进度迁移到存档 1。通过文件选择器临时导入的关卡包在当前游玩会话中保留进度。

游玩时，右上角依次是撤销、重做、重开和暂停。暂停时可继续当前房间、回到大世界或返回首页。试玩可从暂停面板返回编辑器。

在 `Games` 中运行 `npm run dev`，从游戏大厅打开「大肥鱼」，或在开发服务器访问 `/games/dafeiyu/`。构建单个游戏用 `npm run build:target -- game:dafeiyu`。

## 安装本地官方关卡包

用自己的 Steam 安装目录运行以下命令。本地版选择「新游戏」后进入官方主线，也可以从「关卡」中的「切换关卡包」进入 New Adventures、Museum 和珊瑚湾。

```powershell
node games/dafeiyu/levels/install-official.mjs "<Baba Is You 安装目录>/Data/Worlds"
```

脚本复制原始 `.l`、`.ld` 和 `world_data.txt`，并生成关卡目录。官方数据保存在本地，公开预览包从珊瑚湾开始新游戏。开发环境可用 `/games/dafeiyu/?start=coral` 选择珊瑚湾作为新游戏的入口。

## 世界编辑器

从首页进入「编辑器」。选中物件或规则字块后点按棋盘放置。右键擦掉顶层物件，`Z` 撤销，`R` 从当前房间开始试玩。也可以用方向键移动编辑光标，按空格放置。

在地图中添加「新关卡」或「新地图」，再用入口工具把它放到棋盘。用开放路径、隐藏路径和地图起点工具安排游玩顺序。锁定入口会在相邻的通关路径接通后开放。编辑时可看见隐藏路径。试玩使用正式规则引擎，退出试玩回到原来的草稿。

草稿自动存到当前浏览器。「导出」和「导入」使用包含完整世界与子关卡的 JSON 工程文件。

## 手动导入关卡

从「关卡」选择「导入文件」，同时选择同名的 `.l`、`.ld`。批量导入时可多选文件，或用「导入关卡包」选择含 `world_data.txt` 的原版关卡包目录。首次游玩从元数据的 `firstlevel` 开始，通关后返回 `start` 指定的地图。地图使用同一套棋盘规则，额外读取关卡入口、路径和门槛。完成关卡会开放相邻路径和入口。整关变形会返回上一层，并替换对应的关卡入口。

图集覆盖常见物件。其余导入对象会显示带名称的棋盘图块。

本机 Steam 安装的 Baba Is You、Museum、New Adventures 和 debug 共有 600 个 ACHTUNG! 0x0105 关卡对，均通过二进制解码和对象 ID 验证。复杂回合时序、高级规则、地图解锁与特殊事件仍有运行行为差异。Lua 模组执行和原版资源呈现也在当前兼容范围之外。

珊瑚湾关卡由 `node --experimental-strip-types games/dafeiyu/levels/build-builtin.mjs` 生成。 [Baba Is Harbor 格式记录](https://github.com/stared/baba-is-harbor/blob/main/docs/FORMAT.md)

## 素材与验证

原创《珊瑚湾》BGM 循环长度约 46 秒，与按钮、移动、胜利、失败、进关和退关音效分为两份 Ogg 文件。浏览器收到首次有效输入后启用音频。失败音效在失去最后一个可控角色时触发，之后仍可撤销或重开。

主角使用参考用户提供的「照片 1.jpg」制作的四向行走图集，每个方向四帧。图集布局和提示词见 [assets/whale-walk/atlas.json](assets/whale-walk/atlas.json)，图块和背景来源见 [assets/provenance.json](assets/provenance.json)。

开发时用 `npm run dev -- dafeiyu` 加载 `assets/` 下的源图，替换单张 PNG 后刷新页面即可看到结果。发布时，`npm run build:target -- game:dafeiyu` 按 [atlas.config.json](atlas.config.json) 把物件与行走图合成 `assets/atlas.build.png`，图中区域和版本写入游戏 bundle。更新图集里的源图后重新构建即可，生成文件由构建缓存管理。图集输入支持八位、非交错的 RGB/RGBA PNG。

首页和关卡背景在进入对应界面时加载，并保留源图像素到 2560×1440 的范围内。发布版使用对应的 WebP，替换背景 PNG 后，构建会校验配置中的源图 SHA-256，源图有更新时使用 PNG。重新压缩为 WebP 后，可用 `Get-FileHash -Algorithm SHA256` 更新配置中的源图摘要。进入游戏后，160 像素的物件和文字图块与逐帧角色贴图跨关卡复用。角色的四向原始条带保留每帧 320 像素，运行时图集每帧 160 像素。

```powershell
node --experimental-strip-types --test games/test/dafeiyu.test.mjs
npm run build:target -- game:dafeiyu
node games/dafeiyu/verify-browser.mjs
```

浏览器验证使用仓库的 Chrome WebGPU runner。通过 `CHROME_PATH` 可指定 Chromium。设置 `DAFEIYU_BABA_WORLD` 为原版安装的 `Data/Worlds/baba` 目录后，浏览器会额外从磁盘导入原版第一关和地图，并回放第一关的解法。安装本地官方关卡包后，设置 `DAFEIYU_OFFICIAL=1` 可追加验证默认启动、官方存档、地图解锁和关卡包切换。

用 `node games/dafeiyu/verify-corpus.mjs "<Baba Is You 安装目录>/Data/Worlds"` 重新扫描原版关卡文件。

用 `node games/dafeiyu/verify-web-corpus.mjs "<Baba Is You 安装目录>/Data/Worlds"` 在 Chromium 中逐关验证。脚本通过关卡菜单打开每一关，并检查 WebGPU 绘制、移动回合、撤销和重开。逐关结果和每个关卡包的截图写入 `artifacts/dafeiyu/web-corpus/`。

用 `node games/dafeiyu/verify-solution-replays.mjs "<Baba Is You 安装目录>/Data/Worlds/baba"` 回归地图入口、首关解锁与 10 个原版解谜场景。报告和截图写入 `artifacts/dafeiyu/solution-audit/`。

进阶关卡回放复用同一脚本。它记录关键规则第一次出现的回合，以及指定棋子的位置和朝向。

```powershell
node games/dafeiyu/verify-solution-replays.mjs "<Baba Is You 安装目录>/Data/Worlds/baba" games/dafeiyu/advanced-solution-cases.json artifacts/dafeiyu/advanced-solution-audit
```
