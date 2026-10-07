# 谷外之光 · 地图工坊

使用 Haiyue Editor 公开能力制作正交几何解谜地图，输出可直接在《谷外之光》中加载的 JSON。包含十种标准构件、参数编辑、物体组、踩踏开关、错觉接缝和即时试玩。

## 启动

先在 Games 根目录安装项目依赖；Node.js 22+，浏览器需要 WebGPU。然后在 Games 根目录运行：

```powershell
npm --prefix tools/valley-editor install --offline --ignore-scripts
npm run build:valley-editor
npm run build:target -- game:valley-of-light
npm run editor:valley
```

打开 <http://127.0.0.1:4178/tools/valley-editor/index.html>。端口可通过 `node tools/valley-editor/serve.mjs 4180` 指定。服务器同时提供 Games 文件，游戏地址为 <http://127.0.0.1:4178/games/valley-of-light/index.html>。

## 制作地图

1. 点击左侧构件，再点击视口放置。普通路径默认是 1×1×1 方块，默认按 1 格吸附。工具栏设置放置高度和吸附间隔；按 Esc 回到选择工具。
2. 拖动物体在 XZ 平面移动。右栏可精确编辑位置、旋转、长宽厚，以及楼梯级数、扭转角、圆弧半径和角度。右键或中键拖动画面，滚轮缩放。
3. 按住 Shift 多选，在层级栏「成组」。右侧编辑组轴心，旋转动画会围绕该点进行；物体属性也可指定所属组。
4. 放置 **8 号踩踏开关**，添加目标组动作，填写目标位移、旋转、时长和缓动。一个开关可同时控制多个组；支持一次触发与重新踩入切换。
5. 三维位置相同的道路端点自动相连。要制作视觉错觉，Shift 选中两段道路，在「错觉接缝」中指定 A/B 端点。只有它们在固定正交视角中对齐时，角色才能跨越真实空间的间隔。
6. 放置一个 **9 号出生平台**及至少一个 **10 号出口平台**，点击「试玩地图」。点击道路让角色行走，拖拽 3/4 号机关。停止试玩后恢复编辑时的初始地图。
7. 「导出地图」下载 JSON；「导入 JSON」重新编辑。也可以在「查看 JSON」中修改文本并应用。所有结构修改，包括导入，都可撤销。

快捷键：Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 重做，Ctrl/Cmd+D 复制，Delete 删除。输入框获得焦点时保留原生文本编辑行为。一次拖拽只产生一条撤销记录；Esc、失去焦点和画布尺寸改变会取消尚未提交的拖动。

默认「开关花园」是一关可通关示例：先踩左边按钮，将两段桥一起移入道路；再走向第二个按钮，转正最后的回廊；最后点击出口。「物体目录」用于查看十种构件，未连接成完整关卡。

### 方块与三棱柱的正确关系

选择一个未旋转的单位方块，在右栏点击「拆为 A / B 三棱柱」。它会沿顶面对角线竖直切成两个互补的半块；A 保留原位置，B 沿视线偏移，默认从 `[x,y,z]` 移到 `[x+3,y+3,z+3]`。两者拥有独立位置，在固定正交画面中仍拼成一个完整方块。这是制作不可能几何时的分体接缝构件。

导出会保存两个 5 号实例、`prismHalf`、各自变换及对角切面连接。半块在不同物体组中也可以独立运动；投影错开或切面朝向不符时，道路断开。拆分是一条可撤销操作。普通方块四个侧边都可连接，能在相邻格子间转弯。

左侧「分体方块 · 两地拼成一格」可直接观察并试玩，也可打开 <http://127.0.0.1:4178/tools/valley-editor/index.html?demo=split>。该示例只验证分体接缝，不是完整的彭罗斯三角关卡。已有 JSON 中明确设置的非单位尺寸会保留。

## 物体编号

| type | 构件 | 主要参数 |
| --- | --- | --- |
| 1 | 普通立方体路径 | 一格默认 1×1×1，四侧可连接 |
| 2 | 楼梯 | 长度、升高、台阶数 |
| 3 | 拖拽旋转机关 | 旋转轴、角度范围、吸附间隔、目标组 |
| 4 | 拖拽平移机关 | 平移轴、距离范围、吸附间隔、目标组 |
| 5 | 三棱柱半块 | `prismHalf` A/B，互补直角三角顶面，体积各半 |
| 6 | 扭转路径 | 矩形截面、扭转角；角色朝向沿曲面变化 |
| 7 | 圆弧路径 | 半径、圆心角、宽度、厚度 |
| 8 | 踩踏开关 | 触发方式、一个或多个组动画 |
| 9 | 出生平台 | 角色初始位置 |
| 10 | 出口平台 | 通关目标 |

编号由 `catalogVersion: 1` 固定；每个实例另有唯一字符串 `id`。机器可读目录、JSON Schema 和示例在 `games/valley-of-light/maps/`。格式细节见 `games/valley-of-light/map/FORMAT.md`。

## Editor 与运行时的分工

- `ValleyAuthoring` 使用公开的 `@haiyue/editor-platform` 文档、事务历史、选择系统及插件贡献；`@haiyue/editor-shell` 管理面板贡献和快捷键。导入/导出器通过 SDK 注册。
- Editor 面板使用浏览器 DOM。地图视口由 Haiyue Engine 渲染。独立游戏 HUD 使用 Engine GUI，角色通过 Extensions glTF 插件加载 Idle/Walk 动画。
- 编辑器与游戏共享 `map/model.ts` 的校验、参数化路径、连通图和确定性动画，及 `map/view.ts` 的渲染。游戏不依赖 Editor。
- Editor 依赖是 `vendor/` 中的公开发布包：Platform 0.1.0、Plugin SDK 0.1.0、Shell 0.1.1、UI 0.1.3；来自工作区已发布的包归档。没有导入 Editor/AIStudio 私有实现或相邻仓库源码。
- 当前是桌面地图工坊：固定正交视角，最多 500 个物体；存储方式为手动导出 JSON。试玩不写入地图或游戏存档。

## 验证

在 Games 根目录：

```powershell
npm --prefix tools/valley-editor run typecheck
npm --prefix tools/valley-editor test
node --experimental-strip-types --test games/test/valley-map.test.mjs
node tools/valley-editor/verify-browser.mjs
node tools/valley-editor/verify-player.mjs
node tools/valley-editor/verify-split.mjs
```

最后三项需要相邻 Engine 仓库的浏览器验证工具以及本机 Chrome。先运行编辑器验证，生成实际导出的 JSON，再运行独立游戏验证。分体方块验证会检查一键拆分、撤销、导出、错位断路，以及角色跨越两个不同深度的半块。截图与日志输出到 `artifacts/valley-editor/`。调试快照仅在 `?verify=1` 时提供，且没有改变地图或角色的接口。
