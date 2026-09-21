# Boxbound 验证记录

日期：2026-09-20。运行环境：macOS / Node.js 24 / Chrome WebGPU Metal。

- `npm run typecheck`：通过。
- `eslint games/boxbound`：通过。
- 21 个新游戏规则测试：全部通过。包含 10 关逐步解法、嵌套推箱、跨空间进出、一格跳跃、自引用与缩放分类、大箱体碰撞、五档独立保存、损坏存档与重置。
- 新游戏 + Pages 大厅 + 共享存档测试：29 项通过。manifest 最后补充实验性渲染依赖后，大厅 2 项测试再次通过。
- `npm run build:target -- game:boxbound`：通过，最终构建 47.5 秒。
- `node scripts/verify-boxbound.mjs`：桌面首页、桌面世界、桌面关卡、390×844 手机关卡；每个浏览器场景执行 9 项断言，包括实际键盘通关第 4 关。JSON 中记录 WebGPU 检查、Chrome 身份与 bundle SHA-256；对应 PNG 经目视检查。

全仓库检查未全部通过：

- `npm test` 的首次全量运行显示 751 通过、3 失败、8 取消、20 跳过。MUGEN 的 HYMUGEN 指纹、虚拟列表断言失败，Petra 导入相关用例超时；本次新增游戏最初缺失大厅缩略图导致的失败已经修正，并通过定向复测。未修改 MUGEN、UI 依赖或降低其测试要求。
- `npm run build` 在原有 `2048` 构建阶段达到默认 60 秒超时，因此全仓库构建未完成。新增游戏的单独构建已通过。

范围：本验证覆盖 10 个原创关卡；不构成 Patrick's Parabox 所有规则或原版关卡的兼容性认证。详细语义及未实现项见 `games/boxbound/README.md`。
