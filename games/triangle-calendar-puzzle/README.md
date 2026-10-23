# 三角日历拼图

棋盘与 11 块拼图由 Haiyue `Mesh2DRenderSystem` 绘制，日期下拉框、按钮、文字和完成提示使用 `GuiSystem`，共用一个 WebGPU canvas。使用公开 `RenderIntegration` 组合 2D 与 GUI 渲染通道，启用四倍 MSAA。没有 SVG 或 Canvas2D 游戏渲染器。

- 鼠标 / 触屏拖动拼块；R 旋转 60°，F 翻转；双击旋转，右键翻转。Tab 切换选中的拼块。
- 手柄左摇杆移动指针，A 拾取 / 拖动，X 旋转，Y 翻转，LB / RB 滚动日期下拉列表。
- Back 暂停并询问是否返回首页；方向键选择，A 确认，B / Back 取消。打断拖拽会还原拖动前的位置。
- 沿用原存档槽位与数据结构；读取存档时重新验证实际拼块几何，保留日期、位置、朝向和有效吸附。

目录职责：`app/` 负责启动与退出，`game/` 管理交互及对局状态，`rules/` 保存纯规则，`rendering/` 生成拼块网格，`ui/` 负责引擎 GUI，`save/` 定义存档验证。统一会话暂停与返回逻辑位于 `../session/`。

验证：

```sh
npm run typecheck
node --experimental-strip-types --test games/test/triangle-calendar-puzzle.test.mjs games/test/game-session.test.mjs
npm run build:target -- game:triangle-calendar-puzzle
# PowerShell
$env:GAMEPAD_CASE='triangle-calendar,return-triangle-calendar-puzzle'
node scripts/verify-gamepad.mjs
```
