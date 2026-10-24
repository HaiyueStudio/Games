# 手柄操作

29 个 manifest 游戏通过 `installGamepad(id)` 接入。采样使用本地未发布 Engine
候选包的公共 `BrowserMultiplayerInput` API，按帧产生按下、保持和释放状态。
普通游戏复用现有键盘/指针处理器；MUGEN 保留自己的固定步长输入和回放。

首页：左摇杆或方向键选游戏，A 进入，LB/RB 切分类。搜索结果和分类过滤同时生效。
游戏内：Back 立即暂停并询问是否返回首页，默认选中“继续游戏”。
方向键 / 摇杆选择，A 确认，B / Back 取消；取消恢复之前状态，原来已暂停的仍保持暂停。
R3 单独按下再松开切换游戏/指针模式；
R3+LB/RB 切换当前列表的上一个/下一个游戏。新页面、恢复焦点和重新连接后先回中。

指针模式：左/右摇杆移动，A 按住拖拽、松开点选，B 右键，LB/RB 滚动。
普通游戏模式也可用右摇杆指针和 RT 点击菜单。Minecraft 和 AK47 的右摇杆、扳机
用于视角/瞄准和射击，菜单操作请先按 R3 切指针模式。网页下拉框 A 选择下一项，Y 选择上一项。
游戏内提示和 `profiles.ts` 列出每个游戏的具体映射。

连接与断开会显示“手柄 N 已连接 / 已断开”通知，5 秒后自动关闭，并显示剩余时间条。
设备状态通过浏览器连接事件和轮询共同检测，启动时已经连接的设备也会提示；与按键回中、
焦点和输入映射无关。同一槽位快速重连会替换旧通知并重新计时，最多同时保留 4 条。
游戏内使用 `ui/ConnectionNotifications.ts` 在原有引擎画布上绘制，暂停返回窗口也能显示，
倒计时不受游戏暂停影响；首页复用原生 Engine GUI 通知，打开游戏时由游戏接管提示。
状态与计时位于 `connections.ts`，浏览器监听及清理位于 `connectionMonitor.ts`。

统一返回流程位于 `games/session/`：复用游戏的 Engine 和 canvas 绘制 `GuiModal`；
调用引擎公开 stop/run 暂停，保留各实例原有运行状态，暂停期间隔离输入与游戏计时。
MUGEN 独立帧循环、钢琴 MIDI 播放、游戏延迟任务与现有音频上下文也接入该会话。
不新增 canvas，不改写浏览器全局计时器，网络请求与工作线程超时继续使用真实时间。

坦克大战和 Pong 的第二个已连接手柄控制 2P；MUGEN 使用固定 0/1 手柄槽位，
支持方向键和六攻击键。坦克手机版保持 1P，A 开始/继续/开火，Start 暂停；
横屏显示战场、左侧摇杆和右侧开火按钮，竖屏暂停提示旋转。

使用浏览器标准 Gamepad 映射（Xbox/兼容手柄）。先在页面激活一次手柄使浏览器
暴露设备。音频仍遵循浏览器自己的用户激活策略，必要时点击页面一次。

验证：

```sh
npm run build
node --experimental-strip-types --test games/test/gamepad.test.mjs games/test/mugen-input-g07.test.mjs
node --experimental-strip-types --test games/test/gamepad-connections.test.mjs
node scripts/verify-gamepad.mjs
```

浏览器检查复用 Engine 的 Chrome/HTTP helper，需要相邻 Engine 开发仓库和 Chrome。
统一返回检查使用 `gamepadVerify=1` 暴露只读会话快照，避免触发游戏自身的 `verify` 自动玩法测试。
脚本自动构建输入测试入口。它模拟 `navigator.getGamepads`，验证真实页面事件、双玩家、
拖拽、失焦、原生首页及同页路由切换；报告与截图在 `artifacts/gamepad`。
模拟设备验证不等于实体蓝牙/USB 手柄实测。
`notifications-sudoku`、`notifications-tank-battle`、`notifications-mugen` 和 `notifications-lobby`
覆盖连接去重、断开、重连、5 秒关闭、手机布局，以及暂停期间通知关闭但游戏帧仍冻结。
`notifications-startup` 延迟真实 GPU 初始化，验证启动加载超过 5 秒也不会提前耗尽通知时间。
