# 冰火试验与统一鲸鱼娘

顶部「鲸鱼娘 · 冰火试验」打开可直接试玩和编辑的新地图。经典 1-1～1-4 仍由右侧按钮开始。

## 形态、碰撞和动作

| 形态 | 碰撞宽度 | 站立高度 | 美术 |
| --- | --- | --- | --- |
| 初始 | 0.9 格 | 0.8 格 | 参考图一的 Q 版蓝发鲸鱼女仆 |
| 成长珍珠 | 0.9 格 | 2 格 | 参考图二的长裙、高个子形象 |
| 火焰花 | 0.9 格 | 2 格 | 同一长高形象，赤红与金色火焰服装 |
| 冰花 | 0.9 格 | 2 格 | 同一长高形象，淡蓝与银白寒冰服装 |
| 巨型珍珠 | 1.9 格 | 2 格 | 放大的图一 Q 版形象 |

变身时保留脚底位置和水平中心。蹲下只调整高度；使用共同的站立参考尺寸等比例绘制动作，头部不会随蹲下整体缩小。粉团角色选择已移除，运行时不再装载其人物帧或旧人物专用图集。原始生成源图保留在素材目录作为历史记录，混合图集中的道具和敌人仍可使用。

四套服装共用 36 个逻辑动作：站立、步行、快跑、起跳、下落、蹲下、四向旋转、发射、抱物、爬藤、游泳、蹬水、抓墙、滑行、翻筋斗、坐击、庆祝、吃金币、失败和透明管道穿行。小型图集含 34 个独立绘制姿态，其中左侧旋转由右侧姿态翻转，抱物步态复用一帧。巨型直接使用同一 Q 版图集。

## 冰花、冻结和岩浆

- 直接放在空中的火焰花和冰花受重力影响，下落后停在地面或平台上；关卡重试时恢复原始位置。
- 冰花使角色进入冰力状态。按 J 发射冰弹，普通敌人冻结为有碰撞体积的冰块，能阻挡行走，也能站在上面。Boss 不会冻结，每次有效命中只造成一次伤害。
- 按住 Shift 抱起冰冻敌人；松开轻放；持有时按 J 投掷。投出的冰块击败沿途普通敌人，撞墙碎裂，撞普通贝壳砖时同时砸碎砖。火球可将普通冻结敌人解冻。铁壳龟冻结期间暂停钻出计时。
- 岩浆在编辑器「装饰」中，用与水域相同的画笔连续涂绘。液面和内部各有四帧动画，相邻格镜像拼接；触碰岩浆会失败。
- 「敌人」第二页包含跳跃火焰。摆放位置为最高点，首次从这里下落；落到游戏视窗底部以外后，默认等待 3 秒，再从下方跳回最高点。它免疫火球，可被冰弹消灭。
- 单选火焰敌人后，右侧可调整「最小行程」（1～16 格，步进 0.5）与「等待间隔」（0.25～30 秒，步进 0.25）。视窗更低时会加大行程以从画面下方起跳，最高点不变。属性随关卡保存、导入导出和撤销。宝物块、隐藏砖、冰砖和炮台内容也可选择冰花或跳跃火焰。
- 火焰、冰力、巨型状态受伤先变为长高状态，再受伤才变为初始状态。

## 生成素材

全部使用内置 **image_gen**，未调用 CLI/API。两张用户附图仅作为角色外观和服装参考。源 PNG 保留生成透明通道，通过测量轮廓、裁切和统一缩放打包；人物和特效运行时单帧最长边不超过 96 像素。HUD 仍由引擎 GUI 绘制，人物、敌人、液面和效果仍使用普通 2D 精灵渲染。

| 源图 | 运行时图集 | 提示词及来源 |
| --- | --- | --- |
| [whale-small.png](assets/whale-small.png) | `assets/runtime/whale-small.png` | [Q 版角色提示词](assets/whale-small.provenance.json) |
| [whale-tall.png](assets/whale-tall.png) | `assets/runtime/whale-tall.png` | [长高角色提示词](assets/whale-tall.provenance.json) |
| [whale-fire.png](assets/whale-fire.png) | `assets/runtime/whale-fire.png` | [火焰服装提示词](assets/whale-fire.provenance.json) |
| [whale-ice.png](assets/whale-ice.png) | `assets/runtime/whale-ice.png` | [寒冰服装提示词](assets/whale-ice.provenance.json) |
| [frost.png](assets/frost.png) | `assets/runtime/frost.png` | [冰花、火焰敌人、冰弹和碎冰提示词](assets/frost.provenance.json) |
| [lava.png](assets/lava.png) | `assets/runtime/lava.png` | [岩浆提示词](assets/lava.provenance.json) |

执行 `python games/whale-maker/assets/measure-frost.py`，再执行 `python games/whale-maker/assets/pack-runtime.py` 可重新测量打包。旧人物专用运行时图集会在打包时移除。新文件已在 manifest 中显式声明。

## 验证

新增规则回归 `games/test/whale-maker-frost.test.mjs`，覆盖花朵下落、冰力降级、九类敌人冻结、抱放与投掷、砖块破坏、Boss 伤害、火焰跳跃周期及免疫、属性序列化、碰撞体积、动作选择和重试还原。

`verify-frost-browser.mjs` 检查实际 Engine WebGPU 画面、四套人物的等比缩放、站立与蹲下、冰弹冻结和投掷、岩浆、火焰升降、GUI 属性按钮及分类图标；截图和测量保存在 `artifacts/whale-maker-frost/`。

本次 `npm run typecheck`、`npm test`（932 项）及 `GAME_FILTER=whale-maker npm run build` 均通过。冰火与角色、经典四关和旗杆镜头三组浏览器验证均通过，控制台错误和未捕获异常均为 0；关键截图已检查人物比例、蹲姿、坐盆和岩浆拼接。manifest 声明的 92 个文件均存在。
