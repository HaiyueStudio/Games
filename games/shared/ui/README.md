# 游戏屏幕与 GUI 检查

2026-10-23，范围为 `games/manifest.json` 中的 28 个游戏入口；大厅与角色资源查看器属于独立工具页面。

## 屏幕适配

- 数独、扫雷保持 3:2；路径拼图保持 30:19；Pac-Man、MUGEN 保持 16:9；纸上弹球保持 2:3。用视口宽高共同限制画布，居中留边，不能用 cover 裁切，也不能分别把固定投影拉伸到任意宽高。
- 三角日历、墨游等已有等比容器或引擎 Camera2D 的 fit/expand 视口，继续使用。铁甲前线桌面版取消固定页面高度，战场和 GUI 一起等比缩放到可见视口；手机版继续使用原有横屏布局。
- 透视相机的 aspect 由引擎负责。2048、蜘蛛纸牌、三维台球、Pong、俄罗斯方块、重力迷宫、推箱子、二十面体扫雷、WFC 的窄屏水平视野由 `shared/rendering/fitPerspectiveCamera.ts` 调整公开 Camera3D.fov；旋转、投影和拾取仍使用引擎组件。
- 消消乐已有棋盘视野适配，额外保留 HUD 空间；钢琴已有按宽高比调整相机距离；方块世界等自由视角场景继续填满视口。
- `GameHud` 在普通屏幕按设计比例布局，在手机竖屏把操作按钮排列为底部工具栏，状态文字靠上下边缘。中文字符进入引擎字体图集，不依赖 DOM 字体节点。

## GUI 实现清单

| 游戏 | HUD / 菜单实现 |
| --- | --- |
| valley-of-light | 引擎 GuiSystem，原有实现 |
| tank-battle | 引擎 GuiSystem，同画布，原有实现 |
| 2048 | 引擎 GuiSystem，原有实现 |
| billiards-3d | 引擎 GuiSystem，原有实现 |
| billiards | 引擎 GuiSystem，原有实现 |
| triangle-calendar-puzzle | 引擎 GuiSystem，原有实现 |
| entanglement-path | 引擎 CanvasText / Mesh 纹理界面，无 DOM HUD；不是 GuiSystem 控件 |
| icosahedron-minesweeper | 迁移到 MinesHud；数字标注使用引擎 GuiLabel |
| gravity-maze | 迁移到 MazeHud |
| match-3 | 迁移到 Match3Hud |
| neon-circuit | 引擎 GuiSystem，原有实现 |
| minesweeper | 迁移到 MinesHud；数字标注使用引擎 GuiLabel |
| minecraft-lite | 迁移到 MinecraftHud，包含材质栏和开始菜单 |
| mugen | 原有 MugenFlowUi 承接按键设置、AI 控制、FightFX、调试选项；移除重复 DOM 界面 |
| pad-simulator | 标题迁移到 GameHud；平板内嵌应用保留其纹理渲染 |
| pacman | 迁移到 PacmanHud，包含方向按钮 |
| piano | 迁移到 PianoHud，使用 GuiSelect / GuiProgress / GuiButton |
| pong | 迁移到 PongHud |
| sokoban-3d | 迁移到 SokobanHud；关卡面板共用同一个 GuiRoot / GuiSystem |
| sky-strike | 引擎 GuiSystem，原有实现 |
| spider-solitaire | 引擎 GuiSystem，原有实现 |
| sudoku | 引擎 CanvasText / Mesh 纹理界面，无 DOM HUD；不是 GuiSystem 控件 |
| tetris | 迁移到 TetrisHud，预览格保持正方形 |
| wfc-map | 迁移到 WfcHud，使用 GuiInput / GuiCheckbox |
| rubiks-cube | 引擎 GuiSystem，原有实现 |
| ak47-range | 引擎 GuiSystem，原有实现 |
| pinball | 迁移到 PinballHud，包含分数、状态、蓄力、按钮与台面文字 |
| ink-pinball | 引擎 InkGui，原有实现 |

共享手柄光标与提示使用 `gamepad/ui/ControllerOverlay.ts`，在已有引擎画布上叠加 GuiSystem。没有额外的光标、提示 DOM 或 UI canvas。数独静态画面在光标活动时补充重绘，避免留下光标残影。

## 有意保留的浏览器内容

启动失败提示在 GPU 初始化失败时必须仍然可读；原生文件选择器用于打开文件权限；隐藏 result/progress 节点仅供验证读取。离屏 canvas 用于生成或上传纹理，不是 DOM HUD。纸上弹球和墨游仍有 HTML 图片 / SVG 游戏场景装饰，它们是场景渲染层，不是交互控件；这里没有把它们算成已迁移的引擎场景素材。

`GameHud.guardOrbit` 隔离 GUI 操作与后方相机拖拽；生命周期通过 World 的公开 runtime integration 解绑监听与 OrbitControl。各游戏的按钮和状态放在自己的 ui/ 目录，规则与输入保持分离。

## 验证入口

`node scripts/verify-gamepad.mjs` 的 `gui-*` 用例覆盖迁移后的游戏在 1440×900、390×844、844×390 的实际画布和 GUI 边界，并保存截图。`piano-return` 验证播放/暂停时间，`minecraft` 验证材质选择与菜单，`gui-mugen` 验证按键保存/取消，`return-*` 验证共享返回对话框。证据包含源码、构建产物哈希和浏览器身份，存放在忽略提交的 artifacts/gamepad/ 下。

## 本次验证结果

- 全量构建与类型检查通过，改动 TypeScript 文件的 ESLint 检查通过。
- 13 个 `gui-*` 通用布局用例和 MUGEN 设置用例通过；检查桌面、手机横竖屏、画布比例、GUI 控件边界及没有 DOM 操作控件，并人工核对代表性截图。
- 28 个游戏的 `return-*` 用例全部通过，每个包含 3 组视口布局和手柄暂停、断连、取消、确认返回，共 20 项检查。
- 数独 6 组屏幕适配共 24 项检查通过；坦克手机版与 1P/2P 菜单、钢琴播放暂停、弹球物理及 GUI 蓄力/发射/暂停/重开通过。
- 全量单测首次运行 853 项：819 通过、20 跳过、14 失败。其中 7 项是本次 DOM→GUI 迁移导致旧源码断言失效，更新为对应的引擎 GUI 契约后，定向复跑通过；三维台球、2048、蜘蛛纸牌、手柄及 WFC 的相关定向测试也通过。
- 仍有 7 项既有失败：台球旧源码断言、MUGEN G08-E 资源包、G03 控制器台账、G08-D 正式素材、Petra 兼容素材、G05 golden 素材，以及私有 CalendarPuzzle 边界检查。全套测试不能标记为全部通过。

详细日志：`artifacts/gui-migration-build-final.log`、`gui-migration-build-verified.log`、`gui-migration-tests.log`、`gui-migration-focused-tests.log`、`gui-migration-adaptation-tests.log`、`gui-migration-wfc-tests.log` 和 `gui-migration-return-*.log`。后续局部修正均单独重建相应游戏并复核。
