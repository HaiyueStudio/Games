# 前线训练场

第三人称 AK47 射击训练场，使用用户提供的 `ren42.glb` 角色和 `qiang_ak47.glb` 步枪。透视相机从斜上方观察角色，平滑跟随位置；保持固定观察方位，摇杆方向始终对应屏幕方向。游戏仅横屏游玩；浏览器竖屏会暂停战斗并显示横屏提示，iOS 原生应用锁定左右横屏。

- 左下摇杆跑动并转向，复用 `@haiyue/extensions/controls` 的 `VirtualJoystickControls`。
- 右下按住“射击”连续开火，松手停止，可以同时移动与射击。子弹从当前枪口沿人物朝向发出，保留发射时方向，离开场地、命中角色或掩体后回收。曳光线尺寸缩小至 0.018 × 0.018 × 0.24 米。
- 弹匣 30 发，射速每秒 10 发。“重新装填”耗时 2.2 秒，期间停止开火，备弹无限。空仓需要点击装填。
- 每 3 秒在场景随机边缘刷新一名红色敌兵。敌人使用 Engine NavMesh 绕过 8 处实体掩体，沿搜索路径移动；发现玩家后瞄准射击，失去视线则搜索最后看到的位置，不读取隐藏玩家的新位置。
- 敌我视野都是前方 90°，最远 26 米，掩体阻断视线、移动和子弹。地面可见区域以动态扇形网格照亮，并在掩体处截断；暗区仍保留地形，敌兵、枪口火光和敌方曳光线按可见性隐藏，无敌人位置标记。
- 玩家 100 生命，每次受击扣 12；敌兵需要命中 3 发。敌人首次发现目标有 0.6 秒反应时间，进入 13 米射程后每 0.9 秒射击。死亡后点击“重新开始”清理本局敌兵、弹道和计时。累计射击与命中次数通过 Engine 单槽存档保存。
- Native 开火触发轻度连续反馈，受击触发中度反馈；后台停用，不使用持续震动定时器。浏览器仅在支持 Vibration API 时提供短脉冲。
- HUD 和半透明摇杆全部由 Engine GUI 渲染，按屏幕四边安全区定位。3D Canvas 全屏铺满，包括安全区背景；页面只提供 Canvas 与加载/错误提示。

`rules.ts` 是不依赖 GPU/DOM 的确定性弹药、射速、子弹、敌兵 AI、视线和命中规则，导航复用公开的 `@haiyue/engine/navigation`。`RangeGame.ts` 接入场景、骨骼动画、GUI 和输入，每帧更新；敌兵仅为当前可见角色分配复用的视觉对象，离开视野即隐藏；弹道对象按并发峰值复用，每颗弹丸寿命不超过 1.5 秒。失焦、取消、后台和卸载清理操作，恢复时不追补后台时间。

角色动画分上下身：`run_bottom`/`idle_bottom` 驱动下身，`run_top2` 提供持枪姿态，`reload_top` 用于装填。原始动画以骨盆附近为原点，通过角色父实体统一调整单位、朝向和落地高度。AK47 挂载在 `1seal_skeleton_Bip01 R Hand` 子实体的握持插槽上，跟随骨骼。镜头参数在 `RangeGame` 的 `orbit` 与 `resize` 中，摇杆参数在 controls 构造处，武器参数在 `rules.ts`。

## 资源

`assets/*.glb` 原样保留下载目录中的两个文件。运行 `python3 scripts/prepare-ak47-assets.py`（需要 Pillow）生成 runtime glTF、二进制数据与 Native RGBA 贴图。步枪只使用原模型的七个步枪部件，去掉第一人称手臂和辅助平面；不修改原始 GLB。来源与生成数据 SHA-256 见 `assets/provenance.json`。

网页通过公开 glTF 扩展加载 glTF 和图片；iOS 共享游戏代码，通过 glTF 公共的预解析资源接口和 AssetManager 上传打包 RGBA，不使用 WebView 或在线资源。渲染接线沿用现有 Native 游戏的 `RenderIntegration` 实验性桥接。

## 验证和运行

```sh
npm run typecheck
node --experimental-strip-types --test games/test/ak47-range.test.mjs
npm run build:target -- game:ak47-range
node scripts/verify-ak47-range.mjs
```

通过 HTTP 打开 `games/ak47-range/index.html`。浏览器验证保存竖屏/横屏截图与结果到 `.artifacts/ak47-range/survival/`。Native 项目位于工作区的 `Native/examples/ak47-range/`。
