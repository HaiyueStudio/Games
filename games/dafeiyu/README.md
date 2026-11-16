# 大肥鱼

从珊瑚湾大世界进入五个原创关卡。推动棋盘上的词块可以转移操控权、打开通路或改写胜利目标。通关后按确认返回地图，会点亮通向下一关的海路。棋盘上的 `BABA` 对应大肥鱼鲸鱼娘。

| 操作 | 键盘 | 手柄 |
| --- | --- | --- |
| 移动、选择关卡 | 方向键、WASD | 左摇杆、十字键 |
| 等待 | 空格 | A |
| 撤销 | Z 或退格 | B |
| 重开 | R | X |
| 打开或关闭关卡列表 | L | Y |
| 确认、进入地图节点、通关后返回地图 | Enter | A |
| 导入文件、导入文件夹 | I、F | 关卡列表中的按钮，可用平台指针模式 |

游戏自动保存内置关卡进度。导入的关卡包在当前游戏会话中保留通关、地图解锁和整关变形进度。

在 `Games` 中运行 `npm run dev`，从游戏大厅打开「大肥鱼」，或在开发服务器访问 `/games/dafeiyu/`。构建单个游戏用 `npm run build:target -- game:dafeiyu`。

## 导入原版关卡

从「关卡」选择「导入文件」，同时选择同名的 `.l`、`.ld`。批量导入时可多选文件，或用「导入关卡包」选择含 `world_data.txt` 的原版关卡包目录。首次游玩从元数据的 `firstlevel` 开始，通关后返回 `start` 指定的地图。地图使用同一套棋盘规则，额外读取关卡入口、路径和门槛。完成关卡会开放相邻路径和入口。整关变形会返回上一层，并替换对应的关卡入口。

图集覆盖常见物件。其余导入对象会显示带名称的棋盘图块。

本机 Steam 安装的 Baba Is You、Museum、New Adventures 和 debug 共有 600 个 ACHTUNG! 0x0105 关卡对，均通过二进制解码和对象 ID 验证。复杂回合时序、高级规则、地图解锁与特殊事件仍有运行行为差异。Lua 模组执行和原版资源呈现也在当前兼容范围之外。

内置关卡由 `node --experimental-strip-types games/dafeiyu/levels/build-builtin.mjs` 生成。内置关卡和美术均为新制作内容。 [Baba Is Harbor 格式记录](https://github.com/stared/baba-is-harbor/blob/main/docs/FORMAT.md)

## 素材与验证

主角使用参考用户提供的「照片 1.jpg」制作的四向行走图集，每个方向四帧。图集布局和提示词见 [assets/whale-walk/atlas.json](assets/whale-walk/atlas.json)，图块和背景来源见 [assets/provenance.json](assets/provenance.json)。

```powershell
node --experimental-strip-types --test games/test/dafeiyu.test.mjs
npm run build:target -- game:dafeiyu
node games/dafeiyu/verify-browser.mjs
```

浏览器验证使用仓库的 Chrome WebGPU runner。通过 `CHROME_PATH` 可指定 Chromium。设置 `DAFEIYU_BABA_WORLD` 为原版安装的 `Data/Worlds/baba` 目录后，浏览器会额外从磁盘导入原版第一关和地图，并回放第一关的解法。

用 `node games/dafeiyu/verify-corpus.mjs "<Baba Is You 安装目录>/Data/Worlds"` 重新扫描原版关卡文件。

用 `node games/dafeiyu/verify-web-corpus.mjs "<Baba Is You 安装目录>/Data/Worlds"` 在 Chromium 中逐关验证。脚本通过关卡菜单打开每一关，并检查 WebGPU 绘制、移动回合、撤销和重开。逐关结果和每个关卡包的截图写入 `artifacts/dafeiyu/web-corpus/`。

用 `node games/dafeiyu/verify-solution-replays.mjs "<Baba Is You 安装目录>/Data/Worlds/baba"` 回归地图入口、首关解锁与 10 个原版解谜场景。报告和截图写入 `artifacts/dafeiyu/solution-audit/`。

进阶关卡回放复用同一脚本。它记录关键规则第一次出现的回合，以及指定棋子的位置和朝向。

```powershell
node games/dafeiyu/verify-solution-replays.mjs "<Baba Is You 安装目录>/Data/Worlds/baba" games/dafeiyu/advanced-solution-cases.json artifacts/dafeiyu/advanced-solution-audit
```
