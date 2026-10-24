# 拾光拼图

上传本地图片，选择 1–12 行、1–12 列，点击“开始新拼图”。图片仅在浏览器内读取，不上传服务器。默认使用仓库内的原创 SVG 湖景。

使用引擎统一存档接口及 IndexedDB 后端自动保存当前图片、行列数、旋转设置、拼块位置、方向、已拼合的组合和操作次数。松开拖动、旋转、整理、上传图片或开始新拼图后自动保存，刷新页面或重新进入游戏会继续上一局。图片只保存在当前浏览器本机，不上传服务器；开始新拼图会替换上一局存档。原有行列和旋转偏好设置继续兼容。

- 拖动拼块，位置和方向一致的邻块会吸附为一个组合；组合可以继续拖动和拼接。
- 内部切口采用完整的连续贝塞尔曲线，肩部、收颈和圆润榫头平滑衔接，相邻拼块共用互补轮廓。边缘带有左上高光、右下暗边和柔和投影，形成薄片倒角的立体感。
- 勾选“允许旋转”后，新拼图随机分配四个方向；选中拼块或组合，用 Q/R 或左右旋转按钮每次旋转 90°。旋转围绕组合中心，不拆散组合。
- V 或“原图”切换参考图片；滚轮或加减按钮缩放；拖动空白处平移；F 或“适应”显示全部拼块。“整理”分散现有组合，保留拼合结果。
- 手柄：左摇杆移动指针，按住 A 拖动，X 旋转，Y 查看原图，Back 暂停并确认返回首页。
- 手机通过触摸拖动及引擎 GUI 按钮操作，布局适配横竖屏。

`rules/` 是可在 Node 中运行的确定性轮廓、吸附与组合规则；`rendering/` 在离屏画布准备纹理和命中轮廓，使用 Engine 纹理网格、正交相机、透明混合及资源生命周期绘制；`ui/` 使用 Engine GUI；`game/` 协调状态和输入；`app/` 管理启动与销毁。屏幕上只有一个 canvas，DOM 仅保留原生文件选择器与启动失败提示。

渲染提交沿用仓库现有游戏使用的公开 `@haiyue/engine/experimental` 中的 `RenderIntegration` 适配器。

图片限制为 25 MB，解码后最长边缩至 1400 像素。最多 144 块，纹理分帧生成，切换图片或重开会销毁旧渲染 World。规则与存档测试：`node --experimental-strip-types --test games/test/jigsaw-puzzle.test.mjs games/test/jigsaw-save.test.mjs`。浏览器覆盖：`GAMEPAD_CASE=jigsaw-smoke,jigsaw-play,jigsaw-save-unavailable,return-jigsaw-puzzle node scripts/verify-gamepad.mjs`（Windows PowerShell 使用 `$env:GAMEPAD_CASE`）。
