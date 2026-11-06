# 性能检查与优化（2026-10-28）

本轮保留 120 Hz 规则更新和现有 2D 渲染方式，优化重复计算与无效 GUI 更新。

| 测量项目 | 优化前 | 优化后 | 变化 |
| --- | ---: | ---: | ---: |
| 压力场景一次物理更新 | 2.388 ms | 1.120 ms | 约减少 53% |
| 管道绘制命令生成 | 0.490 ms | 0.075 ms | 约减少 85% |
| 静止编辑器每帧多余的可见性切换 | 216 次 | 0 次 | 消除重复布局失效 |
| 每帧重复提交的按钮样式 | 81 次 | 0 次 | 跳过相同背景色 |

数据来自本机 Node v24.19.0 和 Chrome 156。物理与管道绘制取预热后七轮中位数；压力场景为 300×32 格、15 条弯管、149 个火滚配置与 24 个敌人。物理计时包含每 240 步的状态重置及结果摘要。GUI 在实际 Engine GUI 上统计 100 次静止绘制，普通编辑页与奖励/管道属性页分别验证。上述为 CPU 工作量/耗时，不代表固定的帧率提升比例。三个示范场景的物理更新中位数由约 0.018 / 0.062 / 0.055 ms 变为约 0.016 / 0.052 / 0.044 ms，绝对开销本来较小。

## 实现

- `app/bootstrap.ts`：界面节点分属唯一的可见性组，避免先显示全部精灵和奖励图标、再隐藏其他分类/页面。选中颜色未变时不再提交样式；属性标题只设置一次，避免在两个标题间反复切换。
- `rules/glass.ts`：普通地形接触先排除透明管道查询；碰撞先判断整条管道包围盒，再检查附近线段。缓存端点、圆弧、线段包围盒，二分修正复用同一份数据，矩形与线段距离计算不再创建临时数组。检查路径引用及坐标变化，支持原位编辑、增删、拖动、复制粘贴、撤销和重试后的正确刷新。
- `rendering/glass.ts`：沿用同一条碰撞中心线；只在路径变化时计算边缘、长度与角度，每帧仅做视口变换和裁剪。缓存使用 WeakMap，随关卡/管线释放，不保留历史路径。
- `audio/WhaleAudio.ts`：事件序号没有变化时跳过历史事件过滤；空播放队列立即返回。已排队但尚未成功播放的音效仍会重试。

## 验证与复测

优化前后的四组完整模拟状态摘要一致。额外用固定种子比较了 16,000 个矩形碰撞、32,000 次轴向修正和 12 组完整管道绘制命令，结果一致。新增了缓存失效、绘制命令回归、待播放音效重试测试。894 项单元测试、TypeScript 检查及构建通过；浏览器验证涵盖移动/跳跃、编辑器和透明管道编辑/穿行。实际截图已检查。

```powershell
node --experimental-strip-types games/whale-maker/benchmark.mjs artifacts/whale-current.json
# 提供同机器保存的基准文件，可同时校验模拟结果与可见命令数。
node --experimental-strip-types games/whale-maker/benchmark.mjs artifacts/whale-current.json artifacts/whale-v28-before.json
node games/whale-maker/verify-performance-browser.mjs after
```

本轮原始测量位于 `artifacts/whale-v28-before.json`、`artifacts/whale-v28-after.json` 和 `artifacts/whale-maker-performance/`。基准脚本没有固定时间阈值，避免机器负载差异导致误报。

## 第二轮：地形查询与物体较多的场景

继续优化了上一轮留下的两处重复工作，并跳过空格的渲染处理。本机同一套基准、预热后七轮中位数如下：

| 测量项目 | 本轮前 | 本轮后 | 变化 |
| --- | ---: | ---: | ---: |
| 96 个道具、24 个敌人的物理更新 | 1.806 ms | 0.333 ms | 约减少 82% |
| 局部碰撞候选收集、排序与重叠检查 | 0.00409 ms | 0.00048 ms | 约减少 88% |
| 不变地图的远景高度查询 | 0.01329 ms | 0.000013 ms | 不再扫描地图 |
| 浏览器游戏画面 `draw()` 准备 | 0.295 ms | 0.168 ms | 约减少 43% |
| 浏览器编辑器 `draw()` 准备 | 0.342 ms | 0.219 ms | 约减少 36% |

物体场景为 240×40 格；物理计时包括每 180 步重置和最终状态摘要。浏览器计时仍含 GUI 统计钩子，只测 CPU 绘制准备，不含 GPU 提交与显示时间。四种界面模式的绘制命令数维持 68 / 149 / 154 / 154，无额外显隐和样式更新。

- `rules/terrain.ts` 按 `cells` 数组缓存远景高度。`setCell` 在珊瑚地面 `#` 的增删时清理缓存；其余素材变更不触发整图分析。编辑器绘制、擦除、拖动、粘贴，管道/石头/炮塔放置及巨型角色碎地均已接入。导入、撤销、重试生成新的数组，自然获得独立缓存；宽高变化也会重新查询。今后修改已有地图中 `#` 的原位赋值应通过 `setCell`。
- `switchObstacles` 改成一次遍历、一个结果数组，先排除本次移动范围以外的物体。范围包含完整水平位移、地图边界夹紧和地形分离修正，保留全部纵向位置。按原有顺序收集和排序，且每次读取实时坐标及 alive/held/spent/cooldown 状态，不保留跨帧的候选快照。
- `app/bootstrap.ts` 跳过空格及地形通道已经画过的珊瑚格，减少素材查找与冰块回调创建；静态素材编号表也移至函数外。

898 项单元测试、类型检查及构建通过。120 组固定种子混合场景共 21,600 次完整更新，与优化前状态逐段比较一致，包含地图边界和 30/120 Hz 输入。上一轮四组模拟的状态摘要仍相同。浏览器额外检查连续拖绘、删除、撤销重做、试玩，以及远景贴合地面的截图：首次查询读取 5,460 个屏幕外单元，后续 20 帧的屏幕外读取为 0。

```powershell
node --experimental-strip-types games/whale-maker/benchmark-world.mjs artifacts/whale-world-current.json
node --experimental-strip-types games/whale-maker/benchmark-world.mjs artifacts/whale-world-current.json artifacts/whale-v29-world-before.json
node games/whale-maker/verify-world-browser.mjs
node games/whale-maker/verify-performance-browser.mjs v29-after artifacts/whale-maker-performance/v29-before.json
```

本轮记录位于 `artifacts/whale-v29-world-before.json`、`artifacts/whale-v29-world-after.json`、`artifacts/whale-v29-after.json`、`artifacts/whale-maker-world/` 和 `artifacts/whale-maker-performance/v29-*.json`。
