# 公开关卡数据：Mix and Jam 错视旋塔

检索日期：2026-11-09。本次检索没有找到 ustwo 官方公开的原版关卡 JSON／场景数据包。找到并实际转换的是 [Mix and Jam 的 MonumentValley-LevelDesign](https://github.com/mixandjam/MonumentValley-LevelDesign) 社区机制复现项目，不把它称为原版第二关，也不把之前的截图重建地图当作原版数据。

## 来源与许可

- [SampleScene.unity](https://github.com/mixandjam/MonumentValley-LevelDesign/blob/master/Assets/Scenes/SampleScene.unity)：路径局部坐标、层级、导航邻居、条件角度、相机和人物出生位置。
- [Walkable.cs](https://github.com/mixandjam/MonumentValley-LevelDesign/blob/master/Assets/Walkable.cs)：节点的行走点、楼梯、movingGround、按钮标记。
- [GameManager.cs](https://github.com/mixandjam/MonumentValley-LevelDesign/blob/master/Assets/GameManager.cs)：中心转轴以 90° 增量旋转，按钮将右侧桥翻至 Z=90°，按姿态开启七组连接。
- [PlayerController.cs](https://github.com/mixandjam/MonumentValley-LevelDesign/blob/master/Assets/PlayerController.cs)：人物可附着 movingGround 随中心转台移动。
- [上游 MIT LICENSE](https://github.com/mixandjam/MonumentValley-LevelDesign/blob/master/LICENSE)，本目录保留 [许可证副本](./LICENSE)。Copyright (c) 2019 Mix and Jam。

`scene.json` 是从公开场景提取的数据子集，保留原组件/Transform ID、31 个路径节点、2 个旋转轴、7 组连接条件、隐藏面配置及来源信息。原始场景 SHA-256 为 `1b664eb9c08d92243b438ca4abb9376ba0200a64da45ef418208eba743a02447`；文件内容摘要用于识别本次输入，并不声称 master 分支不会变化。未复制或执行 Unity 脚本、第三方插件、人物模型、音频或纹理。

公开攻略还提供原版第二关的流程证据，例如 [Pocket Gamer](https://www.pocketgamer.com/monument-valley/how-to-finish-monument-valley-the-complete-walkthrough-to-ustwos-escher-like-adv/) 和 [GameFAQs](https://gamefaqs.gamespot.com/android/822305-monument-valley/faqs/76038/chapter-2-the-garden)。它们不是机器可导入的关卡数据，本次没有据此声称原版关卡完整还原。

## 转换内容与边界

1. Unity Z 轴镜像到本编辑器的等轴观察方向；普通方块的实体中心转换为顶面中心。保留路径和两根转轴的相对位置。
2. 六个源楼梯节点转为标准 2 号楼梯，使用相同落脚层高和连接方向；ProBuilder 的具体台阶造型由本地几何替代。
3. CenterPivot 的下层三格和上层四格道路共用手轮。源键盘左右转动替换为屏幕极角手轮拖动。新增可选 `motion.carryRider`，角色可随转台旋转，包含子组、任意轴、连续多圈、吸附、取消与检查点恢复；旧地图默认仍锁定占用中的机关。
4. 17button 踩踏后驱动 RightPivot 翻折 90°。16 号补路在动画结束后显示并开放，防止角色提前进入尚未展开的通路。原场景通过连接条件控制它的邻接，这里用显隐及可行走状态表达。
5. 七组来源连接都由实际几何接合验证。其中 `p3 ↔ u_1` 是跨深度错视连接，只在默认等轴视图、翻折完成、中心角度合适时成立；改变视角后不会强行传送。其他连接由物理端口匹配建立。
6. Env 的两个无入口节点保留为不可行走的塔身。塔柱、拱门、海面、终点门和配色是本地补建装饰，未复刻上游整套 ProBuilder 网格。源隐藏面的投机遮挡不导入，角色接缝呈现使用已有的深度修正。

转换后共 52 个标准构件、4 个父节点，可选择、改色、重编组、撤销和导出。原节点名保留在构件名和 `mv-*` ID 中，方便对照原始数据。

## 编辑与通关

打开 `http://127.0.0.1:4178/tools/valley-editor/index.html?demo=mixandjam`，或选择左侧「错视旋塔 · 开源数据转换」。工具栏「API 建图」也可填入同一命令文件。应用会替换当前地图，可一次撤销。

1. 从入口沿楼梯走至左岸 `mv-12`。
2. 手轮从 0° 转至 90°，走上 `mv-l_1`，留在桥上。
3. 转至 -90°（与 270° 等价），随桥到右岸，踩 `mv-17button`。
4. 等翻折完成，回到 `mv-l_1`，转回 0°，走到中间长廊 `mv-15`。
5. 点击可见的上层桥顶面 `mv-u_1`，人物经展开桥和投影接缝到上层。接缝背后的 `mv-p3` 被前景桥面遮住时，无需直接点它。
6. 留在上层桥，把手轮转到 180°，走到 `mv-18final` 通关。

如果旋转视角后不连通，先点击「复位等轴视角」。本关故意允许载人转动；其他关卡可在机关属性中单独开启此选项。

## 离线重生成

在 Games 根目录执行，无需联网：

```powershell
node tools/valley-editor/test/build.mjs
node tools/valley-editor/generate-source-level.mjs
node --test games/test/valley-map-carry.test.mjs tools/valley-editor/test/source-level.test.mjs
```

生成 `recipes/mixandjam.commands.json` 和 `games/valley-of-light/maps/mixandjam-monument.json`。生成器通过公开 `createValleyEditorApi().apply()` 提交地图，后者是带静态合并分析的精简格式。

如需重新提取，先自行获取来源场景文本，再运行 `node tools/valley-editor/importers/extract-mixandjam.mjs <SampleScene.unity路径> tools/valley-editor/sources/mixandjam/scene.json`。提取器只解析已知组件的数据字段，遇到不同节点数量、无效引用或不支持的缩放会拒绝；更新后应重新检查七组接合及视觉效果。

浏览器验证：构建编辑器及 Valley 游戏后运行 `node tools/valley-editor/verify-source-level.mjs`。使用独立 Chrome 配置，实际点击楼梯和开关、四次拖动手轮、通过错视接缝并到达出口，同时检查编辑器与独立游戏。
