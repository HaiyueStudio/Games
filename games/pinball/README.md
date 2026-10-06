# 纸上弹球 · Notebook Pinball

使用 Haiyue Engine 的 WebGPU 二维网格渲染、World / Entity、Physics2DSystem / Box2D 和两个真实转轴挡板。暖色练习本格子纸、石墨线条和彩铅星形碰撞器。

## 运行

在 Games 仓库根目录：

```sh
npm run build:target -- game:pinball
python3 -m http.server 8080
```

打开 `http://localhost:8080/games/pinball/`，需支持 WebGPU 的浏览器。

## 操作

| 操作 | 方向键 | WASD |
| --- | --- | --- |
| 左挡板 | ← | A |
| 右挡板 | → | D |
| 蓄力，松开发球 | ↓ | S |
| 快速发球 / 结束后再开一局 | ↑ | W |

P / Esc 暂停，R 重开，空格也可快速发球。下方提供触屏按钮；失焦自动暂停并清除按键状态。

三球一局。星形碰撞器基础 100 分，书签目标 150 分；2.2 秒内连续命中可叠加至 5 倍。集齐三个书签额外 1500 分。最高纪录保存在本地，浏览器禁止存储时仍可正常游戏。

## 素材

内置 image_gen 生成并保存在本项目：

- `assets/notebook-paper.png`：暖色田字格练习纸，边缘铅笔涂鸦。
- `assets/star-bumper.png`：带透明通道的石墨和彩铅星形碰撞器。
- `assets/provenance.json`：完整原始提示词和生成方式。

纸张与碰撞器使用固定比例的 DOM 图片层；Haiyue 的透明 WebGPU 画布渲染球、挡板、轨道和碰撞火花。所有碰撞均由 Haiyue 2D 物理处理，DOM 素材坐标与 600 × 900 物理台面一致。挡板保持固定转轴关节，通过角速度驱动，不在按键变化时重建关节。渲染提交使用当前 Games 包已有的公开实验性 `RenderIntegration`，在 manifest 中明确标注。

## 验证

```sh
npm run typecheck
npm test
npm run build:target -- game:pinball
node scripts/verify-pinball.mjs
```

浏览器验证复用 Engine 的 Chrome / WebGPU runner，覆盖真实键盘事件、发球通道、挡板击球、碰撞计分、三球结束、失焦暂停及连续 20 次重开资源数量。桌面与手机尺寸截图和含源文件 / 素材 SHA-256 的报告写入 `.artifacts/pinball/`，不会自动更新截图基线。

`rules.ts` 不依赖 DOM / GPU；固定 120 Hz 步进使浏览器验证可复现。`input.ts` 的监听器统一由 AbortController 释放；音频节点、动画和碰撞火花均有界，退出页面时销毁 World、物理系统和引擎。

## 课间奇遇场景元素

- 两个彩铅蘑菇：球碰到后向上弹射，获得 200 分。
- 中部四叶纸风车：Haiyue 两根运动碰撞体组成旋转叶片，命中加速，每次 250 分，每五次额外 1000 分。
- 左右星星奖励通道：每球每侧只能领取一次 300 分，双侧集齐额外 800 分；掉球后可重新收集。
- 纸飞机和虚线航迹、侧边铅笔、小尺、星星、爱心、发球弹簧涂鸦。

新增透明素材 `assets/mushroom-bumper.png`、`assets/pinwheel.png` 使用内置 image_gen 生成，完整提示词记录在 `assets/scenery-provenance.json`。物理体和视觉坐标定义位于 `scenery.ts`。旋转随游戏暂停，重开复位；无额外循环计时器。浏览器验证覆盖蘑菇弹射、通道重复进入防刷分、风车实际碰撞、暂停与资源数量稳定。

## 夹角回弹弹簧

左右斜护栏与短直护栏之间各有一个自动弹簧。Haiyue 触发器检测落入或静止在夹角里的球，短暂压缩后先竖直向上弹射，越过短直护栏顶部才向中央导向，避免斜向推球时再次顶住护栏。弹簧不扣球、不加分；暂停会冻结压缩进度，掉球和重开清除待执行动作。

`springRules.ts` 保存确定性的压缩、弹射、导向与冷却状态，`PocketSprings.ts` 负责引擎触发器、速度控制和矢量弹簧显示。浏览器回归测试覆盖截图中的左侧静止球、左右两侧慢速和高速落球、暂停恢复与重开；每个卡球案例须在两秒内进入中央场地。
