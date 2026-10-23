# 水果忍者 · Fruit Ninja

鼠标移动即可挥刀，触屏按住滑动；手柄左摇杆挥刀、A 点选界面、X 暂停、Start 开始/暂停、Back 使用统一返回首页窗口。空格或 Enter 开始/暂停，P 暂停。手机横竖屏均按视口适配，水果保持比例。

每局 60 秒，每个水果 10 分；加时表增加 10 秒；劈中三次炸弹或时间耗尽结束。漏接水果不扣生命。最高分使用 Engine Save 单槽保存。加时道具每 7–11 秒投放，普通水果波随机混入炸弹。

八种水果：苹果、橙子、西瓜、猕猴桃、香蕉、草莓、椰子、葡萄。同一刀切中 N 个水果，额外奖励 `5 × N × (N−1) / 2` 分：2 连切 +5、3 连切 +15、4 连切 +30、5 连切 +50。奖励随每次命中递增结算，不会重复计算；道具不计入水果数量，炸弹会打断连切。停顿至少 150ms、明显折返、松手、离开画布或进入 GUI 都会开始新一刀；每刀最多持续 650ms，避免一直移动跨多个水果波次累积奖励。鼠标、触屏与手柄使用相同规则，暂停和重开清空连切。

- `rules/`：种子随机、抛物线、线段扫掠命中、计时与判负；无 DOM/GPU 依赖。
- `rendering/`：共享图集、88 个精灵槽、32 段双层刀光、16 个引擎粒子发射器，每个最多 72 粒子；果片最多 64 片。
- `input/`：鼠标/触屏/手柄 PointerEvent 适配与清理；GUI 区域不挥刀。
- `ui/`：同画布 Engine GuiSystem；`game/` 管理生命周期，`app/` 启动，`save/` 验证最高分。

图集由内置 imagegen 生成，完整提示词与布局见 `assets/provenance.json` 和 `assets/fruits-extra.provenance.json`。八种水果各有完整、左半、右半图；道具图集包括炸弹与加时表。新增水果使用独立图集 `assets/fruits-extra.png`，汁水颜色分别为淡黄、草莓红、椰乳白和葡萄紫。场景使用公开的 Engine Mesh3D/BasicMaterial 正交纹理平面，汁水和爆炸使用 ParticleEmitter2D/Particle2DSystem。刀光用有界平面段实现（当前安装版无专用 trail 组件）。唯一实验接口是仓库现有的 `RenderIntegration`，用于同帧共享渲染通道；不引用引擎内部文件。

验证：`node --experimental-strip-types --test games/test/fruit-ninja.test.mjs`；`npm run build:target -- game:fruit-ninja`；`GAMEPAD_CASE=fruit-ninja,return-fruit-ninja node scripts/verify-gamepad.mjs`。浏览器验证使用真实指针输入与只读 `?gamepadVerify=1&seed=1042` 快照，无改变游戏结果的测试后门。
