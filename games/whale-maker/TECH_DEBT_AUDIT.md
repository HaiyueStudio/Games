# 鲸屿制造技术债修复（2026-11-25）

本轮完成前次审计的 TD-01–TD-14。范围为 Whale Maker 及其共用构建工具链；工作区内其他游戏的独立修改不属于本轮。

`app/bootstrap.ts` 负责输入、文档和 Engine 生命周期，确定性规则在 `rules/`，编辑操作在 `editor/`，普通 2D 场景与 Engine GUI 分别提交。地图包通过工厂提供可独立修改的关卡，运行状态始终与编辑蓝图分离。本轮围绕这些边界修复数据身份和重复工作，没有替换物理或渲染架构。

| 编号 | 优先级 | 状态 | 修复与验证 |
| --- | --- | --- | --- |
| TD-01 | 高 | RESOLVED | 统一文档会话记录独立单关／地图包关卡身份，避免空地图包槽覆盖单关；实际导入、保存、读取回归通过。 |
| TD-02 | 高 | RESOLVED | 先解码候选库并解析当前关卡，再创建状态和整体提交；未保存包失效时回退到有效关卡，读取错误保留当前稿件。 |
| TD-03 | 中 | RESOLVED | 框选与粘贴各建一次对象索引，查询复用蛇形砖／大尺寸元素归属；格子访问量回归防止逐格扫描整图。 |
| TD-04 | 中 | RESOLVED | GUI 节点每次绘制只提交最终可见状态；性能脚本递归观察所有后代。普通、高级、路径、地图包模式均无稳态显隐变化。 |
| TD-05 | 中 | RESOLVED | 按关卡对象和编辑版本缓存终点、蛇形砖及扩展元素；绘制只遍历视口附近行列，保留跨视口的长管道和大型元素。连续拖绘每次落笔独立失效，撤销／切区／导入自然换缓存。 |
| TD-06 | 中 | RESOLVED | 每个共享模拟帧结束后摊销回收死亡敌人，清除抱物、回旋镖和管道接触引用；连续生成 1,000 次时死亡残留少于 64 个。小型既有场景维持稳定对象引用。 |
| TD-07 | 中 | RESOLVED | 协作旅行者死亡或跨关失败会清除目的地及全队过渡状态，存活队友可再次进入出口。 |
| TD-08 | 中 | RESOLVED | 副区验证与运行缓存使用自有属性判断，排除 `constructor` 等原型成员；缓存写入也不会触发 `__proto__` setter。 |
| TD-09 | 中 | RESOLVED | 地图库 v2 使用 RLE 和未改内置关卡引用；复制不再连带实体化源包。兼容旧 v1 存档，压缩解码在分配格子前检查尺寸和总量。 |
| TD-10 | 中 | RESOLVED | 包名和关卡名复制时为后缀预留长度，120 字符名称仍能复制和保存。 |
| TD-11 | 中 | RESOLVED | 84 个经典关卡改为按需解码和独立副本；首次选择才展开并缓存蓝图。递归验证不再对每个副区重复复制整个区域字典。 |
| TD-12 | 中 | RESOLVED | 坐标转换器移除 `node:vm`，仅用 TypeScript AST 解码白名单字面量赋值；抓取／缓存内容先校验已审核 SHA-256，拒绝可执行表达式和额外语句。 |
| TD-13 | 中 | RESOLVED | 升级 Lerna、Nx、ESLint、TypeScript ESLint 及有公告的 glob／minimatch；运行全仓类型、测试、构建与试点缓存验证，检查跨版本兼容性。 |
| TD-14 | 低 | RESOLVED | README 和地图包文档更新为 512×256 上限、初代 32 关与日版二代 52 关、统一文档槽及转换校验方式。 |

实现位置（相对 `games/whale-maker/`，根配置另标）：

| 编号 | 代码位置 |
| --- | --- |
| TD-01／TD-02 | `app/document-session.ts:22`、`app/document-session.ts:27`、`app/bootstrap.ts:788` |
| TD-03 | `editor/selection.ts:49`、`editor/selection.ts:70`、`editor/query.ts:8` |
| TD-04 | `editor/p1.ts:129`、`verify-performance-browser.mjs:13` |
| TD-05 | `app/bootstrap.ts:82`、`app/bootstrap.ts:590`、`app/bootstrap.ts:936`、`editor/query.ts:25` |
| TD-06 | `rules/entity-lifecycle.ts:5` |
| TD-07 | `rules/course-travel.ts:7`、`rules/player-damage.ts:25` |
| TD-08 | `rules/p2-schema.ts:40`、`rules/p2-areas.ts:16` |
| TD-09 | `editor/map-pack-library.ts:184`、`levels/classic-codec.ts:13` |
| TD-10 | `editor/map-pack-library.ts:20` |
| TD-11 | `levels/classic-codec.ts:24`、`rules/model.ts:384` |
| TD-12 | `scripts/read-coordinate-data.mjs:4`、`scripts/convert-classic.mjs:13` |
| TD-13 | 根 `package.json:46`、根 `package.json:58` |
| TD-14 | `README.md:5`、`MAP_PACKS.md:9` |

## 保留的设计

- `rules/model.ts` 仍集中描述规则状态和步进顺序。它的体积较大，但本次未把文件长度当成重写理由；现有行为测试验证了各机制的顺序依赖。
- 编辑历史和试玩使用独立副本，避免试玩消耗编辑稿；保留必要的隔离复制，只消除副区递归校验时的重复拷贝。
- GUI 继续负责 HUD 和编辑工具，角色与场景仍使用普通 2D 精灵。消除无效 GUI 更新不改变这一职责划分。
- 经典关卡继续作为紧凑生成数据提交，转换器和来源哈希负责复现；不将生成文件手工拆成逐格编辑代码。

## 测量

本机 Node v24.19.0、Chrome 157，时间是 CPU 工作量观测，不代表帧率承诺。框选采用与审计相同的 512×256 空地图、三轮中位数；本轮同时运行全仓检查，计时含系统负载影响。读取量、可见性计数和序列化字符数为确定性指标。

| 场景 | 修复前 | 修复后 |
| --- | ---: | ---: |
| 16×16 框选 | 335.76 ms | 12.76 ms |
| 512×256 编辑器稳态每帧格子读取 | 270,855 | 2,350 |
| 普通／高级面板每帧无效显隐 | 4／22 次 | 0／0 次 |
| 初代包和两份日版二代副本存档 | 约 679 万字符 | 201,392 字符 |
| 120 字符包名复制 | 123 字符，无法保存 | 120 字符，可保存 |

保存仍会检查实际容量并提示导出；压缩没有取消数据校验。内置引用仅用于与原蓝图相同的关卡；修改后的数据会完整压缩保存。根依赖审计从 23 个受影响节点降为 1 个中危项；剩余 `fflate@0.8.2` 属于国标麻将工作区，不被 Whale Maker 使用，本轮未修改该工作区依赖。

## 复验

规则测试位于 `games/test/whale-maker-classic.test.mjs`；新增回归覆盖文档身份与失败恢复、压缩兼容与容量、惰性解码、选择复杂度、长管道裁剪、协作死亡、原型键、实体回收与转换器输入限制。

已通过全仓 1,547 项测试（鲸屿规则 567 项，其中经典关卡／地图包 35 项）、36 个工作区类型检查、全仓 lint 和完整构建。最终浏览器回归通过文档恢复、大地图、连续拖绘／擦除／撤销重做、递归 GUI 稳定性、地图包分页／选关／跨关和终关流程，控制台错误与异常均为零。

```powershell
node --test games/test/whale-maker-classic.test.mjs
npm run typecheck
npm run lint
npm test
npm run build
npm run workspaces:verify-cache
node games/whale-maker/verify-debt-browser.mjs
node games/whale-maker/verify-map-packs-browser.mjs
node games/whale-maker/verify-performance-browser.mjs debt-fixed
```

原始证据位于 `artifacts/whale-debt-fixed/`、`artifacts/whale-debt-*.log`、`artifacts/whale-debt-editor-after.json`、`artifacts/whale-debt-audit-final.json`、`artifacts/whale-maker-performance/debt-fixed.json` 和 `artifacts/workspaces-cache/result.json`。浏览器截图已经人工查看；大地图读取量脚本明确断言被测尺寸为 512×256，且在截图前恢复真实渲染循环。
