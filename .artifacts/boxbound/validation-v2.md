# Boxbound revision 2 验证

2026-09-20；macOS / Node.js 24 / Chrome WebGPU Metal。

- 30 项规则与视觉数学测试通过：十关解法、同色目标、普通出口门槛、开放出口跨关运输、闭合侧面的门洞/碰撞一致性、墙体合并无遗漏无重叠、遮挡检测、庆祝时序、旧存档迁移、重置不丢失外来箱子。
- 加上 Pages 大厅和共享存档检查，共 38 项相关测试通过。
- `tsc -p games/boxbound/tsconfig.json --noEmit` 与 `eslint games/boxbound` 通过。
- `GAME_FILTER=boxbound npm run build` 通过；构建日志中的 led-sudoku 类型警告来自工作区中并行修改的其他模块。本游戏没有相应错误。
- 浏览器验证涵盖首页、世界地图、桌面/手机关卡、双色目标展示、通关庆祝，共六组；每组 13 项断言，双色展示 14 项。所有组均无 WebGPU 错误。对应 PNG 已目视检查；JSON 绑定最终 bundle 的 SHA-256。
- 庆祝截图在动画中途冻结渲染以呈现腾空、大笑与旋转，其他验证会等待完整动画结束并确认恢复微笑；不使用玩家真实存档。

全仓库检查不作为本游戏通过结论：`npm run typecheck` 受到并行修改中的 `games/led-sudoku/extra-rules.ts` 类型错误影响；全量 `npm test` 完成，794 项中 770 通过、2 失败、2 取消、20 跳过；失败/取消来自原有 MUGEN 的 HYMUGEN 指纹差异、虚拟列表断言及 Petra 超时。未修改这些模块或放宽其断言。

玩法细节：普通关卡外沿门槛高一格，角色可跳，箱子不会获得抬升；第 7、8 关内层保留平口货运通道。门洞与目标颜色均由规则数据驱动。遮挡墙为 15% 不透明度，保留实际碰撞。旧存档更新到 rulesRevision 2，保留完成记录及已运出的箱子。
