# Boxbound revision 3 验证

- 构建 SHA-256：`4f14c01281beb1f0f44609a1136b448de7b79199b0b8a40492b3ff8af9bb50da`。
- 本地诊断证据；工作区有未提交修改，不是正式发布基准。
- `npm run typecheck`：通过；最终 Boxbound 独立 TypeScript 检查和 ESLint 通过。
- 相关规则 / 存档 / 预览测试：41 / 41 通过，包含十关完整解法。最终模型单测 33 / 33 通过。
- `GAME_FILTER=boxbound GAME_BUILD_TIMEOUT_MS=180000 npm run build`：通过。
- `node scripts/verify-boxbound.mjs`：8 / 8 视图、155 条浏览器断言通过，WebGPU 错误为 0。
- 截图已目视核对：首页、世界、桌面/手机低墙关卡、双色目标、庆祝、镜头推进、即时原地跳跃。八组 JSON 均匹配上述最终 bundle。
- 使用可注入的动画时钟固定跳跃和过渡采样时间，等待真实渲染帧后读取结果。生产模式使用 `performance.now()`。
- 覆盖：即时起跳/原地落地、空中方向控制登顶下钻、九宫格不可攀墙、平出口箱子运送、旧存档迁移、进盒外景保留/镜头推进/内景揭示、过渡输入锁及撤销、四方向门洞、同色目标和庆祝。

## 全库检查限制

`npm test` 完整执行：837 项，806 通过、2 失败、9 超时取消、20 跳过。失败来自未修改的 MUGEN 相关模块：

- `mugen-import-g02.test.mjs:253`：HYMUGEN 预期指纹不匹配。
- `mugen-viewer-g05.test.mjs:258`：虚拟列表 light DOM slot 断言。
- `mugen-petra-local-compat.test.mjs`：9 个本地 Petra 导入/运行案例超时。

本次未修改这些模块，也未调整测试阈值。并行进行的 led-sudoku 修改保持原样。
