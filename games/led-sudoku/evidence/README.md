> 以下为旧版 DOM UI 的历史验证。当前引擎 GUI 的验证见 `Native/examples/led-sudoku/evidence/gui/README.md`。

# LED Sudoku 本地验收

2026-09-20，Node v24.19.0，Codex In-app Browser（真实 WebGPU 页面）。这是本地功能/视觉验收，非性能基线。

- 标准固定种子 `20260920`：R1C3 的规则候选为 6、7、9，LED 进一步排除 7、9，仅剩 6。
- `browser-smoke.mjs` 的 11 类公开界面检查通过：候选过滤、笔记、鼠标填数、键盘、擦除、撤销、推理解释、存档恢复、答案取消/确认/撤销、组合设置、控制台错误检查。测试没有读取或修改隐藏游戏状态。
- `notes.png` 验证 R1C7 中间/下横灯段与笔记 2、6 的独立间距。
- 另经棋盘坐标点击验证 R1C1 为给定 5，选中后擦除禁用。
- `desktop-standard.png`：1280×720 视口内滚动至棋盘，实际渲染截图。七段灯管、三种数字来源、候选面板和规则开关可辨识。
- `mobile-combined.png`：390×844 视口，固定种子与全部附加规则开启。棋盘 344×344，文档宽度与视口宽度均为 390，无横向溢出。黑格、笼和、紫线、白点均有独立视觉标注。恢复了测试前的浏览器视口设置。
- 截图通过原生浏览器截图接口保存，无图片重绘/生成或像素修饰。计时器随真实交互变化，题面由 seed 固定。

验证结果：

- LED 专项：43 项通过，包括 32 种规则组合 × 3 档难度的 96 个唯一解样例。
- 大厅/响应式与渲染默认值：4 项通过。
- 共享构建 runner 与目标路由策略：10 项通过。
- 新游戏 ESLint：通过。
- `npm run typecheck`：通过。
- `npm run build:target -- game:led-sudoku`：主 bundle 与出题 Worker 均产出。

全仓库检查未全绿，未修改其他游戏以掩盖结果：

- 全量 `npm test` 共 715 项；首次运行 689 通过、3 失败、3 超时取消、20 跳过。其中一个失败为新缩略图尚未生成，补齐后 Pages/集成测试已重跑通过。其余失败来自 `mugen-import-g02.test.mjs` 的 HYMUGEN hash 断言及 `mugen-viewer-g05.test.mjs` 的 UI virtual-list 断言；三个 30 秒超时来自 `mugen-petra-local-compat.test.mjs`。
- 全量 `npm run build` 在 `pad-simulator` 未能于现有 60 秒时限内产出完成标记，流程停止。未提高超时限制。

测试及构建日志位于本次开发环境的 `/tmp/led-*.log`；最终源码指纹见 `verification.json`。
