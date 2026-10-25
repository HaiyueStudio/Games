# 水果忍者 · Fruit Ninja

按住鼠标左键拖动才会挥刀和显示刀光，松开后刀光自然淡出；触屏按住滑动；手柄按住 A 并移动左摇杆挥刀、A 点选界面、X 暂停、Start 开始/暂停、Back 使用统一返回首页窗口。空格或 Enter 开始/暂停，P 暂停。手机横竖屏均按视口适配，水果保持比例。

每局 60 秒，每个水果 10 分；加时表增加 10 秒；劈中三次炸弹或时间耗尽结束。漏接水果不扣生命。最高分使用 Engine Save 单槽保存。加时道具每 7–11 秒投放，普通水果波随机混入炸弹。

水果、炸弹和加时表的大小由可玩区域短边决定，不直接随屏幕宽度放大。水果/炸弹的图集平面尺寸限制在 72–110 CSS 像素：390px 手机竖屏约 79px，1440×900 桌面约 110px；透明图集内的实际果实略小。命中半径、果片、汁印和爆炸随同一尺寸变化，旋转屏幕时现有物体与新物体同时更新，保持长宽比。飞行与果片运动速率为原来的 75%，沿原抛物线运动；倒计时和水果波次间隔不受减速影响。

八种水果：苹果、橙子、西瓜、猕猴桃、香蕉、草莓、椰子、葡萄。同一刀切中 N 个水果，额外奖励 `5 × N × (N−1) / 2` 分：2 连切 +5、3 连切 +15、4 连切 +30、5 连切 +50。奖励随每次命中递增结算，不会重复计算；道具不计入水果数量，炸弹会打断连切。停顿至少 150ms、明显折返、松手、离开画布或进入 GUI 都会开始新一刀；每刀最多持续 650ms，避免一直移动跨多个水果波次累积奖励。鼠标、触屏与手柄使用相同规则，暂停和重开清空连切。

- `rules/`：种子随机、抛物线、线段扫掠命中、计时与判负；无 DOM/GPU 依赖。
- `rendering/`：预加载 GPU 图集、88 个精灵槽、32 段双层刀光、24 个引擎粒子发射器，每个最多 128 粒子；果片最多 64 片。每次切果喷出 112 粒汁滴，同时出现扩散飞溅；背景最多保留 40 处果汁印记，28 秒内缓慢消退，重开时清理。汁印使用 12 种程序化不规则轮廓，命中时按独立种子变化旋转、镜像、横纵比例和浓淡，不消耗玩法随机数。
- 每处汁印生成 2–3 条重力滴流，启动时间、宽度、最大长度和速度各不相同；细流逐渐延长，末端液珠聚大后脱落并加速下坠。最多 120 条滴流，每条借用固定的流痕/液珠平面；按视觉年龄采样，暂停冻结，重开和缩放清空，流痕与汁印一起消退。
- `input/`：鼠标/触屏/手柄 PointerEvent 适配与清理；GUI 区域不挥刀。
- 炸弹命中：白热核心与橙色火球、双层扩散冲击波、8 团上升烟尘、12 片旋转弹壳碎片、128 粒高速火星，以及短促暖色闪光。镜头和粒子同步震动，650ms 内衰减归位，HUD 保持稳定；背景预留震动边缘。爆炸最多同时保留 4 组，1.1 秒内回收，暂停冻结，重开/缩放清空。
- `ui/`：同画布 Engine GuiSystem，使用生成的深色木牌、羊皮卷轴、琥珀主按钮与翡翠暂停按钮。公开的 `GuiStyle.nineSlice` 保留纹理边框，中文和交互仍由引擎 GUI 绘制；`game/` 管理生命周期，`app/` 启动，`save/` 验证最高分。
- `audio/`：五类原创离线合成音效，共 9 个 44.1kHz / 16-bit / 单声道 WAV，总计约 441KiB：木质按钮、低频爆炸、3 种抛出呼啸、3 种汁水飞溅、下降木铃与鼓点结束提示。素材在开局前解码，首次鼠标/触屏/键盘操作解锁播放。每波水果只触发一次抛出声，连切飞溅有短冷却与变体轮换；按位置轻微左右声像，炸弹和结束提示优先，最多 12 个声部。暂停停止玩法声音，系统返回窗口挂起 AudioContext，重开清空旧声，销毁关闭节点与上下文。音频失败不影响玩法。

图集由内置 imagegen 生成，完整提示词与布局见 `assets/provenance.json` 和 `assets/fruits-extra.provenance.json`。八种水果各有完整、左半、右半图；道具图集包括炸弹与加时表。新增水果使用独立图集 `assets/fruits-extra.png`，汁水颜色分别为淡黄、草莓红、椰乳白和葡萄紫。场景使用公开的 Engine Mesh3D/BasicMaterial 正交纹理平面，汁水和爆炸使用 ParticleEmitter2D/Particle2DSystem。刀光用有界平面段实现（当前安装版无专用 trail 组件）。实验接口为仓库现有的 `RenderIntegration` 和公开的 `experimental/audio` 中的 `OwnerSafeAudioMixer`；前者用于同帧共享渲染通道，后者负责音频解码、声部预算与清理，不引用引擎内部文件。

`assets/dojo-backdrop.png` 是暗胡桃木道场背景，`assets/dojo-gui.png` 是带透明通道的四格 GUI 图集；两者均由内置 imagegen 生成，完整提示词、透明边缘修整提示词和采样范围保存在 `assets/dojo.provenance.json`。背景按比例 cover 裁切并预留震动边缘，不拉伸；GUI 使用原生九宫格缩放，适配桌面和手机横竖屏。

音效位于 `assets/audio/`，设计说明、时长、响度和 SHA-256 记录在 `assets/audio/generation.json`。复现命令：`node --experimental-strip-types scripts/generate-fruit-audio.mjs`；使用确定性噪声、木质模态振动、气流滤波、水滴滑音和低频冲击，不使用外部录音或模型。生成器也输出试听串联文件 `artifacts/fruit-ninja-audio-preview.wav`。音效测试：`node --experimental-strip-types --test games/test/fruit-ninja-audio.test.mjs`。

验证：`node --experimental-strip-types --test games/test/fruit-ninja.test.mjs`；`npm run build:target -- game:fruit-ninja`；`GAMEPAD_CASE=fruit-ninja,return-fruit-ninja node scripts/verify-gamepad.mjs`。浏览器验证使用真实指针输入与只读 `?gamepadVerify=1&seed=1042` 快照，无改变游戏结果的测试后门。
