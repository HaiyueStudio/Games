# 墨游 · 龙鲤 / Ink Pinball

独立水墨弹球，使用 Haiyue 公开 World/Physics2D/Mesh2D API 和 experimental RenderIntegration。存档槽为 `ink-pinball`。

## 运行与操作

```sh
npm run build:target -- game:ink-pinball
python3 -m http.server 8088 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8088/games/ink-pinball/`，需要 WebGPU。

A / ←、D / → 控制挡板；S / ↓ 蓄力后松开发球；W / ↑ / 空格快速发球；P / Esc 暂停，R 重开。手机有多点触控按钮。

- 三颗灵珠持续缓慢旋转，周围由 WGSL 域扭曲噪声生成流动墨气；连续碰撞最多五倍分；三只写意水墨飞鹤受击从滑翔过渡到下拍、上扬翅膀，全部命中额外加 1500 分，短暂振翅后回到滑翔开始下一轮。
- 河面三朵小莲花分别使用侧左、正面、侧右素材。每朵触碰后消失并加 250 分；三朵全中额外加 2000 分，1 秒后重新生成。部分采莲进度跨球保留，重开清空。
- 左上龙口捕获真实墨球，合颚含球 0.42 秒，再向场内喷出，加 500 分。冷却防止连续重复吞球。
- 两侧蟾蜍先蹲伏再跃起，将狭窄区域的球顶出；清除障碍后引导回场内。每只蟾蜍救球一次后跃入水中，对应侧边支撑同时消失，后续小球可从空荷叶位置真实落水。潜水 30 秒后跃回荷叶并恢复救球，倒计时独立、跨球保留；重开才全部复位。恢复支撑时会等待正在穿过缺口的球离开，避免夹球。发球口第三只蟾蜍随发球跳跃。三只蟾蜍各站在独立荷叶图层上，跳跃时离开荷叶。
- 球落水会触发独立鲤鱼图层腾空、完整翻转 360°，1.45 秒后回到河里。鲤鱼宽度从棋盘的 28% 缩小到 19.6%（缩小 30%），跃起最高 210 个逻辑单位。水面有持续流动的细波与缓慢扩散的涟漪；球接触水面、鱼起跳和鱼落水都会在实际落点触发水花。
- 山中两处瀑布使用流动噪声 shader，远山两层雾带缓缓飘移。全部使用模拟时钟；暂停时流体和角色动作一起冻结，重开清理待触发动作。

## 真实流体与参考来源

参考 [Volcomix/ink-drop](https://github.com/Volcomix/ink-drop) 的稳定流体步骤，针对弹球场景用 WGSL compute 实现：速度/墨浓度双缓冲、半拉格朗日平流、旋度约束、散度、Jacobi 压力迭代和压力梯度投影。球的运动注入墨与动量，实际碰撞注入径向飞墨与旋涡；球离开后，浓度场仍会继续流动和消散。没有再叠加 180 段半透明胶囊作为拖尾。

参考版本、MIT 版权及授权在 `THIRD_PARTY_NOTICES.md`。不依赖该仓库运行时，不移植百万粒子分支。

## 图层与资源

`assets/landscape-plate.png` 是去掉龙和鲤鱼后的宣纸山水底图；`dragon.png`、`toad.png`、`koi.png` 是真正透明的独立生成图层。龙身与下颚分别裁切作骨架式动画；鲤鱼与蟾蜍通过模拟状态驱动变换。`brush.png` 为 UI/围栏笔触；`spirit-orb.png` 为灵珠，`lily-pad.png` 为蟾蜍脚下荷叶。`river-lotuses.png` 为三朝向莲花图集，`crane-poses.png` 为滑翔/下拍/上扬三帧飞行图集（显示尺寸 36×36，相比原来 72×72 缩小一半；碰撞半径同步从 22 缩小为 11）。

`brush-digits.png` 为生成的 0–9 毛笔数字图集，`brush-digits.fnt.json` 为 BMFont 度量（裁切时留边排除图集分隔痕迹）。通过公开 `@haiyue/engine/font` 的 `parseFntJson` 读取；DOM HUD 使用小尺寸 2D canvas 绘制同一字体，分数变化时才重绘，同时提供准确的无障碍分值。

素材均由内置 imagegen 生成，提示词分别保存在 `assets/provenance.json` 、`assets/layers-provenance.json` 、`assets/garden-provenance.json` 和 `assets/flying-crane-provenance.json`。旧 `landscape.png` 保留作来源参考，不再用作游戏背景。

## 性能边界

- 桌面流体 192×288、12 次压力迭代、最高 60 Hz；窄屏设备 128×192、8 次、最高 30 Hz。模拟分辨率独立于屏幕 DPR。
- 流体常驻 buffers 约 2.53 MiB / 1.13 MiB；每次最多 24 个注入点。无墨迹 8 秒后跳过求解，暂停时不推进。
- 采莲循环固定复用三个 sensor 和三个图片节点，仙鹤切换同一图集的帧，不按命中创建新图片或 GPU 纹理。
- 灵珠墨气仅增加三个固定实例，复用现有 shader、uniform 与实例缓冲；旋转与墨气使用同一个可暂停的模拟时钟。蟾蜍支撑切换碰撞过滤和绘制可见性，循环不会累积实体。
- 场景 DPR 上限 1.5，UI 上限 1.25。UI 最多 30 Hz 绘制；布局仅在 resize/scroll/显隐/尺寸变化时读取，buffer 内容未变时不重复上传。
- 围栏笔触走一次纹理采样，UI 扩散采样由 12 次缩至 4 次。所有流体 buffers、pipelines、bind groups 持久复用。
- 销毁时释放 GPU buffers、纹理、UI context，断开 ResizeObserver 和事件；重开不重建物理体或 GPU 资源。
- 水面、水花和涟漪复用现有 shader 与实例缓冲，不添加画布或 GPU 资源。最多同时保留 4 组水花、8 组涟漪；每组水花由 shader 求解 12 滴水的抛物线、方向与淡出，0.95 秒结束，涟漪 2.2 秒结束。鱼在水下时位于水面效果后方，跃起后移到前方。
- 浏览器证据报告实际运行 120 帧的 CPU 帧耗时、rAF 间隔及 GPU 队列末尾等待时间。这些是不同指标，队列等待不当作 GPU 单帧耗时；未请求 timestamp-query，因此该项明确记为不可用。没有声称跨版本 FPS 提升。

## 验证

```sh
npm run typecheck
node --experimental-strip-types --test games/test/ink-pinball-toad.test.mjs games/test/ink-pinball-garden.test.mjs games/test/ink-pinball-water.test.mjs games/test/ink-pinball-scene.test.mjs games/test/pinball-rules.test.mjs games/test/pinball-springs.test.mjs
npm run build:target -- game:ink-pinball
node scripts/verify-ink-pinball.mjs
```

桌面/移动浏览器覆盖真实发球、旋转挡板、灵珠计分、采莲循环与仙鹤状态、三球结束、失焦、两侧静止/慢速/快速卡球、龙含球/喷射/暂停、蟾蜍跳跃、鲤鱼起落、重开资源稳定、UI 布局缓存、GPU 墨浓度有限且逐渐消散、UI shader 边缘实际像素变化。图像及包含源文件/素材 SHA256 的结果保存在 `.artifacts/ink-pinball/`。

### 2026-10-07 验证记录

- 类型检查、独立构建和 14 项规则单元测试通过。
- 原生 Metal WebGPU / HeadlessChrome 153：桌面、移动、龙含球、蟾蜍跳跃、鲤鱼腾空、小球入水、鲤鱼落水七组各 54 项检查通过，控制台错误、异常与未分类 GPU 失败均为 0。新增水面与水花 GPU 像素验证、入水只触发一次、发球通道排除、暂停冻结和特效回收检查。
- 每组性能样本为 120 个实际浏览器帧。下表是本机共享环境中的诊断结果，不是正式性能基线或跨版本提速结论。

| 视口 | CPU 帧中位数 / P95 | rAF 间隔中位数 / P95 | GPU 队列末尾等待 | 流体 buffers |
| --- | --- | --- | --- | --- |
| 1440×1080 | 2.07 / 5.16 ms | 16.92 / 45.11 ms | 13.45 ms | 2.53 MiB |
| 390×844 | 2.36 / 5.01 ms | 16.86 / 32.29 ms | 17.99 ms | 1.13 MiB |

此前全仓 `npm test` 的日志为 `full-test.log`：621 通过、2 失败、9 超时取消、20 跳过；失败集中于未修改的 MUGEN 字节序列化与 viewer 断言，取消集中于 Petra 导入测试。全仓构建曾因默认超时失败，延长超时后运行约十分钟仍未结束，已停止以释放验证资源，不能视为全仓构建通过；日志为 `full-build-incomplete.log`。此次水面增量执行专项测试，日志为 `water-test.log`、`water-typecheck.log`、`water-build.log`。全部保存在 `.artifacts/ink-pinball/`。

### 2026-10-07 采莲与仙鹤增量验证

- 类型检查、独立构建及 18 项专项测试通过。八组原生 Metal WebGPU 浏览器场景（含新增采莲/仙鹤画面）各 68 项通过，无控制台错误、异常或未分类 GPU 失败；源文件和资源指纹全部吻合。
- 验证真实碰撞收集、同一朵去重、三朵 2750 分总奖励、暂停冻结重生、跨球保留、重开清空、连续五轮资源稳定、仙鹤三种翼姿及奖励、实际位图分数像素与无障碍值。
- 桌面/移动 120 帧 CPU 中位数分别 2.24 / 1.45 ms，P95 5.07 / 2.20 ms；rAF 中位数 16.72 / 16.71 ms。这是共享本机的诊断采样，不代表跨版本性能提升。GPU 队列尾等待分别 42.85 / 2.28 ms，不能当作单帧 GPU 耗时。
- 截图已人工检查桌面、移动、蟾蜍跳跃和仙鹤展翅画面，并更新游戏列表缩略图。预览输出已同步。
- 本次日志：`garden-typecheck.log`、`garden-test.log`、`garden-build.log`、`garden-browser.log`、`garden-preview.log`（均位于 `.artifacts/ink-pinball/`）。
- 本次也运行了全仓命令：`npm run build` 在未修改的 2048 构建达到 60 秒超时（`garden-full-build.log`）；`npm test` 的未修改 MUGEN/Petra 测试出现多项失败，Petra 子进程持续超过七分钟后停止（`garden-full-test.log`）。因此不宣称全仓通过。

### 飞鹤素材调整

重新生成写意水墨飞行姿态三帧，显示尺寸及碰撞半径各缩小一半，仍保留命中状态和三鹤奖励。类型检查、8 项花园/角色规则测试、独立构建通过；八组浏览器场景各 69 项通过，包含半尺寸与缩小后真实碰撞验证。桌面、手机截图已复核并同步预览。日志以 `flying-crane-` 为前缀存于 `.artifacts/ink-pinball/`。本次沿用上节记录的全仓检查限制。

### 灵珠墨气、蟾蜍潜水与鲤鱼腾跃

- 类型检查、独立构建和 21 项专项规则测试通过。十组原生 WebGPU 浏览器场景各 91 项通过，控制台错误、异常和未分类 GPU 失败均为零，全部源文件指纹匹配。
- 新增左右空荷叶真实落水、潜水计时跨球保留、暂停冻结、满 30 秒后回跳与再次救球、资源数量恒定、灵珠旋转/暂停、噪声 shader 实际像素变化及鲤鱼尺寸检查。
- 桌面/移动及 `toad-away.png`、`toad-return.png`、`koi-leap.png` 已进行画面复核。日志以 `orb-toad-` 为前缀保存于 `.artifacts/ink-pinball/`。未重复此前已经失败/超时的无关全仓检查，限制沿用上节记录。
- 本机共享负载下的 120 帧诊断：桌面 CPU 中位数/P95 2.58/9.45 ms，移动 1.39/1.92 ms；rAF 中位数/P95 为 18.17/53.63 ms 与 16.68/17.62 ms，GPU 队列尾等待 86.32/11.38 ms。该采样不作为跨版本提速结论。

标题 `assets/title-moyou.png` 使用用户提供的“墨游”艺术字原图。保留原始像素，通过 CSS 裁掉周围留白，并以 multiply 混合融入宣纸背景；标题保留无障碍名称，随桌面与移动端字号缩放。
标题调整已通过桌面 1440×1080 和手机 390×844 的画面复核及各 91 项现有浏览器检查；截图和资源 SHA256 记录保存在 `.artifacts/ink-pinball/title-desktop.*`、`title-mobile.*`。

右侧瀑布 shader 对齐背景真实瀑布位置（棋盘屏幕坐标 550,523，42×168），沿山石分成两股水流，使用向下平移噪声、水线与落点水沫增强流动感；沿用共享管线和暂停时钟。
右侧瀑布增量已通过类型检查、独立构建及桌面/手机各 92 项浏览器检查（含瀑布 shader 实际像素变化），控制台与 GPU 错误为零；截图与源文件指纹保存在 `.artifacts/ink-pinball/right-waterfall-*`，预览已同步。
