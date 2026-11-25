# 《大肥鱼》技术债审计

日期：2026-11-24。基线：`96447c41ed2ab71dde610262a78b6f976581159f`。

范围：`games/dafeiyu/`、其测试、直接依赖的共享存档接口及构建验证入口。按本次对话审查游戏，不代表整个 Games 仓库的审计。2026-11-24 的审计未修改产品代码；2026-11-25 按用户要求完成下列修复。工作区已有的 `whale-maker` 改动未作处理。

## 2026-11-25 修复状态

| ID | 状态 | 实现与复验 |
|---|---|---|
| F001 | **RESOLVED** | `games/save/SingleSlotGameSave.ts:35` 在读取异常时保留数据并拒绝加载，`:55` 阻止未读成功的槽被默认棋盘覆盖；成功重读或显式清槽后才解锁写入。故障读取、无效数据、恢复和显式清理回归见 `games/test/single-slot-save.test.mjs:112`。拼图旧清槽测试同步改为显式重置策略。 |
| F002 | **RESOLVED** | `games/dafeiyu/app/restore.ts:9` 完整准备保存的房间栈，缺失关卡、尺寸不兼容或请求失败时拒绝恢复；`app/bootstrap.ts:942` 不再打开初始关卡覆盖原档。关卡包缺失也拒绝默认回退。嵌套房间与父地图失败/重试回归见 `games/test/dafeiyu.test.mjs:241`。 |
| F003 | **RESOLVED** | `games/dafeiyu/app/autosave.ts:32` 的 flush 暴露失败，`:59` 保留最新脏快照；显式重试或后续编辑可继续保存，持续失败不会后台忙循环。`app/bootstrap.ts:206` 显示持久化错误，`:219` 保留未读槽重试入口。相关回归见 `games/test/dafeiyu.test.mjs:192`。 |
| F004 | **RESOLVED** | `games/dafeiyu/rules/syntax.ts:108` 合并同格同义字块并保留来源 ID，`:130` 在真实预算溢出时抛出明确错误，拒绝部分语义。`rules/game.ts:506` 在提交棋盘和历史前验证规则；运行时显示提示，编辑器保留全棋盘预览以便修正。顺序、高亮来源、溢出及历史不变性回归见 `games/test/dafeiyu.test.mjs:788`。 |
| F005 | **RESOLVED** | `games/dafeiyu/verification/render-probe.mjs:2` 识别缓存 bundle 执行，并关联到实际提交的场景命令缓冲；等待 GPU 完成，排除单纯编码及无关提交。逐关脚本共用此探针，并等待转场完成。新增 `npm run verify:dafeiyu` 小型原生 WebGPU 冒烟任务和探针单元回归。正式 CI 接入此浏览器任务仍需具备相应 GPU 的执行环境；普通 Node 测试不能替代它。 |
| F006 | **RESOLVED** | `games/dafeiyu/levels/limits.ts:2` 统一单位上限 12,000、编辑器放置上限 6,000 和解析预算；解码逐层预统计，在分配物件对象前拒绝超限。初始单位、地图标记/光标、海岛、运行时生成、地图转换和存档共用单位预算。超限回合不提交，地图替换可回滚，不缓存部分转换。边界值、微小压缩输入、多层累计、运行时及地图转换回归通过。原容器格式未变；超预算社区关卡明确拒绝运行，更大规模模拟 worker 不在当前容量契约内。 |
| F007 | **RESOLVED** | `games/dafeiyu/audio/retry-asset.ts:2` 对音效和 BGM 分别保留成功状态、合并在途任务；失败后至少间隔一秒，在后续手势或恢复时重新请求/解码，不做后台忙重试。销毁时中止资源请求并抑制迟到结果。真实音频资源验证 HTTP 503 → 重试、无效音频 → 重试、成功 BGM 不重复加载及拆卸释放。 |

此前高优先级修复阶段：专项单元测试 39/39 通过；全仓库 `npm run typecheck`（36/36，无缓存）、`npm test`（36/36，24 项缓存）、`npm run build`（35/35，2 项缓存）均通过，游戏独立 `npm run build:target -- game:dafeiyu` 也通过。真实 Chromium/WebGPU 故障注入覆盖关卡 HTTP 503、写入配额不足、启动及重复读取失败、GUI 提示和继续游戏重试，见 `games/dafeiyu/verify-save-recovery.mjs` 与 `artifacts/dafeiyu/save-recovery/result.json`。原有 `verify-home-editor.mjs` 的桌面和竖屏场景也通过，包括三个存档、手柄、编辑器与嵌套地图返回。该阶段日志见 `artifacts/dafeiyu/high-priority-typecheck.log`、`high-priority-test.log`、`high-priority-build-all.log`。

本轮剩余项复验：游戏单元测试 **37/37** 通过，覆盖探针、重试节流、成功缓存、销毁、压缩输入、多层累计、容量边界、溢出回合和地图转换回滚。ESLint 及所改文件差异空白检查通过。全仓库类型检查 **36/36**（20 项缓存）、测试 **36/36**（9 项缓存）通过，见 `artifacts/dafeiyu/remaining-typecheck-final.log`、`remaining-test-final.log`。首次测试出现的两条《鲸鱼制造》失败，在单独及整仓重跑中通过；本轮未修改对应代码。构建期间还检测到工作区依赖安装并发变化，一次构建因 Nx 模块短暂缺失中断，原始记录保留在 `remaining-build-final.log`，未覆盖依赖升级改动。

真实原生 WebGPU 冒烟通过：203 次已提交的场景 bundle，直接场景 draw 为 0，证明已适配缓存渲染路径；音效经历 HTTP 和解码失败后第 3 次成功，BGM 第 2 次成功且只启动一次。见 `artifacts/dafeiyu/smoke/result.json`。当前代码的桌面/竖屏编辑器、三个存档和手柄回归通过，见 `artifacts/dafeiyu/remaining-workshop.log`。

官方关卡 **596/596 通过 Web 逐关检查**，GPU 及浏览器未分类错误均为 0，覆盖导入、打开、实际场景提交、移动、撤销和重开，见 `artifacts/dafeiyu/web-corpus/results.json`。Node 解码及一个等待回合也全部通过，见 `artifacts/dafeiyu/remaining-corpus-final.log`。十个复杂关卡按 `advanced-solution-cases.json` 在 Node 中回放，均通关并观察到要求的规则，撤销、重做和重开一致，见 `artifacts/dafeiyu/remaining-solutions-final.log`。Web 全量检查只对原版首关额外回放解法，不代表 596 关均验证了完整解法；音频自动验证保持静音，不包含人工听感检查。

最终全仓库构建 **35/35 通过，无缓存**，见 `artifacts/dafeiyu/remaining-build-stable.log`。为复验并行构建及此前的超时，使用仓库支持的执行参数 `GAME_WORKSPACE_CONCURRENCY=2`、`GAME_BUILD_TIMEOUT_MS=120000`，未修改构建默认配置或依赖版本。依赖安装恢复后，未再出现 Nx 模块缺失。

以下保留原审计证据和建议，历史行号以审计基线为准；当前处理状态以上表为准。

## 执行摘要

- **F001 / High：存档读取异常会触发删除。** 读取失败被直接解释为损坏，临时后端故障也会进入清槽路径，影响共享存档接口。见 `games/save/SingleSlotGameSave.ts:40`。
- **F002 / High：继续游戏时，关卡请求失败会回退并覆盖棋盘进度。** 存档本身可以完全有效；任一父地图或当前关卡读取失败后，会打开初始关卡并自动保存。见 `games/dafeiyu/app/bootstrap.ts:871`、`:882`、`:893`、`:930`。
- **F003 / High：自动保存写入失败后丢失待保存快照。** 再次 `flush()` 不会重试，三个游戏存档也未接入失败提示。见 `games/dafeiyu/app/autosave.ts:43`、`games/dafeiyu/app/bootstrap.ts:45`。
- **F004 / High：规则分支预算会静默改变游戏语义。** 22 个合法叠放字块即可让同一棋盘随单位排列顺序产生不同规则；尚未证明现有官方关卡初始状态受影响。见 `games/dafeiyu/rules/syntax.ts:120`。
- **F005 / Medium：Web 全关卡验证脚本已跟渲染实现脱节。** 正常提交 RenderBundle 的画面仍被判断为绘制超时。见 `games/dafeiyu/verify-web-corpus.mjs:40`、`games/dafeiyu/rendering/scene.ts:760`。
- **F006 / Medium：导入资源预算与同步运行能力不匹配。** 单位总数无统一限制，格式上限可容纳约 210 万单位；实测 65,536 单位的简单等待回合耗时约 188 ms，仅为本机 Node 单次测量。见 `games/dafeiyu/levels/baba-format.ts:227`、`:239`、`:273`。
- **F007 / Medium：音频首次加载失败后整次会话不再重试。** 网络恢复、重新操作及切后台恢复均无法恢复对应音频。见 `games/dafeiyu/audio/LagoonAudio.ts:61`、`:109`。
- 建议先修复三条存档异常路径，再修规则解析与浏览器验证；性能优化先落实可执行的导入预算。没有发现需要整体重写的依据。

## 架构模型

`main.ts` 将启动交给 `app/bootstrap.ts`，后者协调首页、三个存档、编辑器、运行验证、父地图堆栈、输入、音频和转场。`levels` 解码原版二进制关卡与侧车元数据，并将内置、官方及编辑器项目转换为统一 `LevelPack`。`rules` 提供确定性规则解析、属性查询、回合推进、增量撤销和地图解锁；地图与普通关卡共享规则运行模型。入口和编排见 `games/dafeiyu/main.ts:1`、`app/bootstrap.ts:98`、`:191`、`:856`；运行核心见 `rules/game.ts:44`、`:67`、`:499`。

表现层由 `rendering/scene.ts` 的二维精灵渲染、`rendering/portal.ts` 的切换效果，以及 `ui/hud.ts`、`ui/screens.ts` 的引擎 GUI 组成。静态场景与绘制批次缓存减少重复工作，RenderBundle 保留透明素材顺序。存档经过共享 `SingleSlotGameSave` 和引擎保存服务，游戏侧 `LatestAutosave` 合并连续快照。核心边界已经存在；当前高风险集中在边界失败时仍继续提交状态，以及解析预算溢出时返回部分结果。见 `rendering/scene-batches.ts:42`、`:56`、`:80`，`app/autosave.ts:16`，`games/save/SingleSlotGameSave.ts:23`。

## 发现表

等级表示影响；工作量 S 为局部修改，M 为跨若干函数并补充行为回归，L 为较大结构调整，不作为工期承诺。

| ID | Category | File:Line | Severity | Effort | Description | Recommendation |
|---|---|---|---|---|---|---|
| F001 | 错误处理、数据完整性 | `games/save/SingleSlotGameSave.ts:40`、`:43` | High | S | **已复现。** 任意加载异常都会调用删除，再返回 `null`。注入临时读取错误后，删除被调用一次；代码未区分后端不可用、版本不兼容和确实损坏。 | 默认保留数据；返回可重试失败，明确分类错误。只有确认无效且符合既定策略的数据才允许隔离或清理。 |
| F002 | 状态恢复、架构边界 | `games/dafeiyu/app/bootstrap.ts:871`、`:882`、`:893`、`:930` | High | M | **已复现回退路径，覆盖后果由保存调用确认。** 有效存档恢复时，任一关卡请求失败即落入初始关卡；`open()` 成功后保存新房间堆栈和初始棋盘。已通过关卡集合未必丢失，但未完成棋盘及所在地图栈会被替换。 | 区分没有存档与恢复失败；后者保留原档并回到可重试状态，禁止写入默认进度。关卡 ID 消失的迁移另行处理。 |
| F003 | 自动保存、可观察性 | `games/dafeiyu/app/autosave.ts:43`、`:45`、`:29`；`app/bootstrap.ts:45`、`:211` | High | M | **已复现。** 写入前清掉 `pending`，失败被吞掉；两次 `flush()` 均成功返回且只写一次。内存中的存档已更新，游戏槽没有 `onStatus` 提示，玩家无法知道最新进度尚未落盘。 | 保留最新脏快照，暴露保存失败和持久化状态；后续操作或有限退避可重试。避免把失败快照立即重新喂入无限循环。 |
| F004 | 规则契约、正确性、测试 | `games/dafeiyu/rules/syntax.ts:99`、`:118`、`:120`、`:133`、`:151` | High | M | **已复现。** 同格相同字块重复展开，共享的 768 分支预算静默截断后续规则；合法 22 单位棋盘正序只产生 BABA 规则，逆序只产生 ROCK 规则。 | 合并同格同义词并合并来源 ID，复用等价解析状态；对仍超预算的输入明确返回复杂度错误，不能当作完整规则。补充顺序不变性回归。 |
| F005 | 浏览器验证、实现漂移 | `games/dafeiyu/verify-web-corpus.mjs:40`、`:51`、`:61`；`rendering/scene.ts:760`；`rendering/scene-batches.ts:91` | Medium | S | **真实浏览器已复现。** 探针只监听 RenderPass 的直接 `draw()`；游戏改成 `executeBundles()` 后计数一直为零，首关就超时。现有部署检查也未执行这条浏览器路径，见 `.github/workflows/deploy-pages.yml:46`。 | 检查本场景 bundle 的实际执行及对应帧提交，保留 GPU 错误检查与画面冒烟验证；增加小型 WebGPU 冒烟任务，让渲染接口变化能及时暴露。 |
| F006 | 性能、导入契约 | `games/dafeiyu/levels/baba-format.ts:211`、`:227`、`:239`、`:273`；`rules/game.ts:45`、`:72`、`:77`、`:502`；`rules/progress.ts:50` | Medium | M | **可重复的边界风险。** 32 层、每层 256² 格可分配 2,097,152 个单位。124 字节的有效关卡已展开为 16,384 单位；回合会在主线程复制并处理全部单位。现有 12,000 上限仅覆盖生成单位和进度验证，未覆盖初始导入。 | 统一文档化的单位、规则解析和展开预算，在大量对象分配前检查。若必须支持更大社区关卡，再将计算移入专用 worker 并给出明确容量状态。 |
| F007 | 资源恢复、错误处理 | `games/dafeiyu/audio/LagoonAudio.ts:61`、`:100`、`:109`、`:114`、`:137` | Medium | S | **隔离网络故障已复现。** 首次请求或解码失败被捕获为正常任务完成；首次 effects Promise 和两项 job 永久缓存，恢复网络后仍各只请求一次。 | 只缓存成功状态；失败后清除 job，并为 effects 重建读取请求。后续用户手势或恢复时有限重试，保留已安装成功的资源。 |

## 最值得先修的五项

### 1. F001：停止把读取异常直接转换为删除

调整 `games/save/SingleSlotGameSave.ts:34` 的加载契约：`missing / loaded / unavailable / invalid` 明确区分，或至少让非确定性错误向上传播。先移除通用 `catch` 中的自动删除；不要把错误返回为“没有存档”，否则调用端仍可能新建并覆盖。损坏数据的备份、隔离和版本迁移需有明确策略。

回归场景：后端第一次读取抛错、第二次成功；期间不得调用删除，第二次仍能读到原数据。现有 `games/test/single-slot-save.test.mjs:90` 覆盖写入错误后的新写入恢复，未覆盖这一读取失败路径。

### 2. F002：让恢复流程成功后再提交游戏状态

将 `games/dafeiyu/app/bootstrap.ts:863` 的恢复路径改成完整的准备与提交两步：先读取所有父地图和当前关卡，在局部变量中创建 Puzzle；全部成功后再 `show()` 和保存。读取错误向 `beginSlot()` 已有失败处理传播，见 `app/bootstrap.ts:350`；保留原 `profile` 及持久化快照。只有确实没有存档时才使用 `pack.initial`。

回归场景：保存了高难关卡第 50 回合，父地图或当前关卡首次请求失败；随后重试，仍恢复原回合和父地图入口。另测关卡 ID 被删除，确保迁移不会假装成正常继续游戏。

### 3. F003：把“队列处理完成”和“成功落盘”分开

保留 `games/dafeiyu/app/autosave.ts:16` 的合并策略，增加最新未持久化快照和失败状态。写入成功后只清理对应版本；失败时保留该版本，后续新快照可以替换它。`flush()` 失败应向调用者暴露，或返回明确结果，不能继续表示持久化完成。将游戏三个槽接入已有 `onStatus` 能力，参见 `app/bootstrap.ts:48` 的编辑器提示模式。

回归场景：写第 1 版失败，在无新编辑时恢复存储并显式重试，仍能保存第 1 版；若期间产生第 2 版，应最终保存第 2 版；持续配额不足时不得无限忙循环。

### 4. F004：消除重复解析分支，显式处理预算耗尽

最小复现是横向 11 格：第一格叠放 `BABA / ROCK`，其余格各叠放两份 `IS YOU AND PUSH AND STOP AND WIN AND FLOAT`。共 22 个文本单位，两个主语都应获得五条规则。实测正序只有 BABA 五条，逆序只有 ROCK 五条。

在 `games/dafeiyu/rules/syntax.ts:99` 建立词堆时按 `name + type` 合并等价词，保留来源 ID 用于文本高亮；解析层再按等价状态削减重复工作。不能仅扩大 `768`，也不能在超限时继续返回看似完整的规则列表。现有浅层叠词测试见 `games/test/dafeiyu.test.mjs:542`；新增上述完整语义及排列不变性测试。

### 5. F005：修复真正能观测当前渲染的验证信号

更新 `games/dafeiyu/verify-web-corpus.mjs:39` 的探针，使其识别当前场景 bundle 的执行，以及之后的队列提交。单独统计 bundle 编码阶段的 `draw()` 仍不够，因为缓存 bundle 不会每帧重新编码；单独统计任意队列提交也不足以证明棋盘已画出。

先用一个内置关卡检查打开、移动、撤销、重开和实际渲染，再运行官方全量扫描。在支持 WebGPU 的验证环境中接入这个小型冒烟任务；全量扫描可以单独运行。当前探针在 24 帧内观测到 24 次 bundle 执行、0 次直接场景 draw，随后 `first-dive` 被误判超时，详见 `artifacts/dafeiyu/debt-browser-probe.json`。

## 快速收益清单

- [x] **F001**：移除任意读取异常时自动清槽的策略，并让调用方能区分不可用与空槽。
- [x] **F005**：更新 bundle 渲染探针，恢复单关冒烟和全量浏览器验证能力。
- [x] **F007**：失败后释放音频加载 job，允许后续操作有限重试。

## 看起来有问题，但目前合理

- **`bootstrap.ts` 超过千行。** 它确实集中编排状态，但本次问题的直接原因是失败处理和提交时机。按行数拆文件不会解决 F002/F003。先修提交边界；只有出现实际复用需求再提取恢复协调器。见 `games/dafeiyu/app/bootstrap.ts:191`、`:856`。
- **没有把所有精灵全局按图集排序。** `rendering/scene-batches.ts:56`、`:80` 按图集上传后按原始连续区间重放，保证透明、叠放元素的顺序，直接全局排序会改变画面。
- **运行时仍有标签图集缓存。** `rendering/scene.ts:448` 已在 8 页或 16 MiB 处整理，`:771` 有资源销毁；没有证据支持“无限 GPU 缓存泄漏”的结论。
- **规则上下文存在阶段快照。** `rules/game.ts:100` 用于保持阶段内条件一致，不能为了减少扫描而随意改成实时共享可变上下文。
- **撤销历史保留单位顺序。** `rules/history.ts:20` 保存变化单位，结构变化时才保存顺序；`rules/game.ts:506` 将过去历史限制为 256，已有成本控制。
- **解压实现有边界。** `levels/baba-format.ts:87` 已在流式解压时检查输出限额。F006 是有效对象总量及运行预算问题，不能描述为无界解压。
- **音频声道和转场资源有释放。** `audio/LagoonAudio.ts:38` 限制声音数量，`:173` 同声道替换，`:190` 注销及销毁；`rendering/portal.ts:134` 处理恢复、释放与待完成转场，无证据表明重复操作会无限累积这些资源。

## 九个维度的覆盖结论

| 维度 | 本次结论 |
|---|---|
| 架构退化 | F002 的恢复提交边界需要收紧；未仅按文件长度提出拆分。 |
| 一致性 | F003：编辑器已有保存错误提示，游戏三个存档槽未接入，见 `app/bootstrap.ts:45`、`:48`。 |
| 类型与契约 | F004 的部分规则结果、F006 的导入预算是已确认的契约缺口；未把类型断言本身当作问题。 |
| 测试 | F001–F004 的异常/复杂状态缺少相应回归；F005 的浏览器探针已失效。已有成功路径测试通过。 |
| 依赖与配置 | 未确认重大问题；漏洞扫描被网络权限阻断，不能据此判断没有 CVE。未安装额外依赖分析工具。 |
| 性能与资源 | F006；已有合批、缓存、增量撤销应保留，进一步热路径优化需浏览器实测。 |
| 错误与可观察性 | F001–F003、F007 均有明确异常恢复缺口。 |
| 安全卫生 | 本次范围未确认重大问题。F006 按容量与响应性问题记录；本次不是完整安全审计。 |
| 文档漂移 | README 声称逐关脚本检查 WebGPU 绘制，但当前脚本实际超时，见 `games/dafeiyu/README.md:73` 与 F005。 |

## 检查、测量和限制

- 已读取范围内 README、清单、适用 `AGENTS.md`，检查最近 200 条提交及六个月变更统计，并比较代码量前 20 与变更频次前 20。近期范围内仅 4 次提交，不能把这个短历史当成长期热点统计。主要交集为 `app/bootstrap.ts`、`rendering/scene.ts` 及浏览器验证脚本；文件大小本身未记为缺陷。
- `npm run typecheck`、`npm test`、`GAME_FILTER=dafeiyu npm run build` 均通过，但这三项命中 Nx 缓存，不能表述为全部重新执行。日志在 `artifacts/dafeiyu/debt-typecheck.log`、`debt-test.log`、`debt-build.log`。
- 另行实际执行 `node --experimental-test-coverage --test games/test/dafeiyu.test.mjs`：**23/23 通过**。`node --test games/test/single-slot-save.test.mjs`：**6/6 通过**。现有成功测试没有排除上述故障注入结果。
- 覆盖率仅针对该测试导入的模块：`rules/game.ts` 行 88.85%、分支 74.62%；`syntax.ts` 行 98.83%、分支 86.99%；`app/autosave.ts` 行 98.08%，但失败处理尚未有效覆盖。`bootstrap`、场景、GUI、音频未计入这次单元测试覆盖率，不能将合计值视为整个游戏覆盖率。详见 `artifacts/dafeiyu/debt-coverage.log`。
- 本地 ESLint 检查游戏 35 个文件：0 error、0 warning。日志在 `artifacts/dafeiyu/debt-eslint.json`。
- `npm audit --json` 无法连接 registry（`EACCES`）；未得出依赖漏洞结论。`knip`、`madge`、`depcheck` 未安装，未自动下载。详见 `artifacts/dafeiyu/debt-npm-audit.json`。
- 主代理已独立运行逻辑故障探针，记录规则顺序差异、写入失败后未重试、读取错误进入删除，以及小文件展开。探针及结果见 `artifacts/dafeiyu/debt-logic-probe.mjs`、`debt-logic-probe.json`。F001 的删除实测使用注入的 MemorySaveBackend，证明错误分类和删除决策，不代表已破坏用户实际存档。
- F002 以实际 `openStart` 方法的隔离执行确认回退，后续覆盖由 `show()` → `save()` 调用链确认；没有在用户真实存档上制造丢失。
- F007 使用实际音频源码的隔离网络/mixer 故障注入，首次 HTTP 503 后恢复网络，多次解锁及后台恢复仍只请求各一次；没有把它表述为已完成真实设备音频故障测试。
- 真实 Chromium/WebGPU 探针确认 F005：24 次 bundle 执行、0 次直接场景 draw，首关渲染检测超时。**本次未完成 596 关的浏览器逐关扫描或全部解法回放。**
- 对本地 596 个官方关卡初始单位，额外比较正序与逆序规则标签，未出现差异。F004 来自构造的合法叠词状态，不能外推为这 596 个初始棋盘已发生错误。
- 性能样本为本机 Node v24.19.0 单次执行，不是浏览器帧率或 p95：无规则密集棋盘 1,024 / 4,096 / 16,384 / 65,536 单位的等待回合分别约 **10 / 21 / 52 / 188 ms**。未运行 210 万单位极端输入；无需使环境失去响应即可确认预算缺口。
- 审计探针和日志位于忽略的 `artifacts/`，只用于复核证据，不属于正式产品测试的新增实现。

## 留给维护者的设计问题

这些问题不阻塞以上修复，也不作为已确认缺陷：

1. 社区关卡需要支持的最大单位数、解析复杂度和目标设备响应时间是多少？如果不能限制规模，F006 的 worker 化才有明确验收标准。
2. 损坏、旧版本存档的策略是保留备份、可导出恢复，还是明确允许删除？F001 不应靠所有异常共用一个清理策略决定。
3. 本地导入包是否需要正式存档？当前 `app/bootstrap.ts:204`–`:205` 明确排除未登记包；这是现有行为，未当作当前存档丢失问题。
4. 哪个有 WebGPU 能力的环境适合运行小型浏览器门禁？当前部署工作流只执行常规检查和构建，见 `.github/workflows/deploy-pages.yml:46`。
