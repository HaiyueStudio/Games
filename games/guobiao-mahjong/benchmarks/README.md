# 国标麻将强度比较

评测运行完整东南西北四圈，与游戏共用裁判、补花、合法动作和累计番数规则。默认开发比较让每个 KD 策略分别面对三个相同的旧版内置算法；四次轮换保证目标策略坐过每个座位，同一 seed 的每局初始牌墙相同。不会把三个基线座位的总番直接与一个模型座位比较，表格按每座位每局归一化。

```sh
# 从 Games 根目录；先准备 model-service/.venv 和固定的三个 KD 权重
node games/guobiao-mahjong/benchmarks/run.mjs

# 算法候选开发集和独立验证集
node games/guobiao-mahjong/benchmarks/run.mjs games/guobiao-mahjong/benchmarks/optimize.json artifacts/guobiao-mahjong/strength/optimization
node games/guobiao-mahjong/benchmarks/run.mjs games/guobiao-mahjong/benchmarks/holdout.json artifacts/guobiao-mahjong/strength/holdout

# 归档测试时的源码，并用该版裁判重放全部动作、核对原始数据与汇总
node games/guobiao-mahjong/benchmarks/archive.mjs
node games/guobiao-mahjong/benchmarks/check-evidence.mjs
```

`MAHJONG_PYTHON` 可指定已有 Python 环境。KD 使用现有 `model-service/runtime.py`，温度为 0，固定权重版本，逐文件检查 SHA-256；每个评测通道仅开一个 BLAS 线程。仅用本机进程传输观测，无需开放端口、Docker 或云端密钥。观测来自 `observe()`，不含牌墙顺序、其他玩家暗手或未提交的响应。所有唯一合法动作直接执行，真实选择仍交给策略，包括是否接受合法胡牌。

输出包含每场 JSON 和持续更新的 `report.json`，记录配置、源码指纹、Git 版本及未提交状态、设备、完成数量、严格模式、逐手结果和可复现回放。中途失败会停止，不将超时、非法动作或错误降级当成模型棋力。已有场次只在配置及源码指纹一致时复用，修改策略后请指定新的输出目录。

主要指标为累计番数/局，同时展示比赛分/局、和牌率、放铳率、平均名次、错过合法胡牌次数和无常规八番听口次数。响应时间只统计有选择的决策，不混入强制过牌；并行评测中的耗时包含进程传输和其他通道竞争，不能直接当作浏览器 WebGPU 延迟。

配对差值先在每个 seed 内汇总全部座次和 16 局，再按 seed 整组 bootstrap，避免把同一牌山的多次轮换当成独立样本。四个 seed 的区间仍属于小样本证据。不同 KD 模型对相同基线的成绩可以比较，但不能据此断言它们在任意对手阵容中有固定排名；也不代表通用大语言模型的棋力。

`strategy-v1.ts` 为测试前冻结的内置算法，`strategy-experimental-v2.ts` 保存开发和验证时的完整候选，便于在生产算法继续改进后核对历史证据。候选的启发式调整必须通过 `holdout.json` 的独立牌山验证；规则评估的修复另有确定性回归测试。不要根据验证集结果继续调整权重后沿用原来的验证结论。

配置中的 `v2` 显式调用 `decideExperimental()`，不是游戏默认的 `decide()`。本轮验证未支持那些额外权重，默认算法只保留明确的八番听口、绝张、进张计数和数牌顺子风险修复，以及不改变评分结果的缓存。12 个固定观测会逐项核对实验入口与冻结版本的评分一致性。

向听缓存只复用手牌的数学分析，不缓存可见余牌、番数、危险度或行动评分。每个算番器最多 10,000 个条目，调用者拿到独立的进张数组；换算番器不会共用缓存。`cache-check.mjs` 用 160 个连续真实局面交替对照耗时并逐项比较动作、候选和分值，结果是本机诊断数据，不是额外的棋力收益。

## 2026-11-07 本机实测

完整数据、区间、权重版本、源码校验和及回放核验结果见 [results-20261107.json](results-20261107.json)。每个模型使用 4 个 seed × 4 次换座 × 16 局，共 256 局；每桌只有一名目标 KD，另外三名都是冻结的旧算法 depth=2。四组总计 1024 局，基线按三家各自的局数归一化。

| 策略 | 累计番/局 | 同桌旧算法番/局 | 和牌率 | 放铳率 |
| --- | ---: | ---: | ---: | ---: |
| KD Student 0 | 5.62 | 2.78 | 37.9% | 10.9% |
| KD Student 1 | 5.41 | 2.69 | 37.9% | 14.8% |
| KD Student 2 | 5.25 | 2.77 | 37.1% | 10.5% |
| KD Ensemble 3 | 5.56 | 2.77 | 38.7% | 12.1% |

这批牌山中，四个 KD 策略均领先旧算法。Student 0 的均值略高于集成，但差距不足以确认稳定排名；日常对局可优先选 Student 0，减少计算开销。这里测试的是已接入的专用麻将网络，不是通用大语言模型，也不是同算力预算对比。

额外启发式候选在开发集 256 局平均多 0.41 番/局；在另选的 8 个 seed、512 局验证中，反而少 0.35 番/局，按 seed 重采样的 95% 区间为 [-0.89, 0.23]。因此没有默认启用这组番型权重、风险权重和前瞻倍率。游戏保留规则评估修复及缓存，实验入口单独导出。缓存实测 160 个局面动作与分值完全一致，平均计算耗时降低约 19%；绝对耗时受并行负载影响。

三批数据共重放核验 1792 局、381029 个合法动作，无模型故障，所有和牌均不含花达到 8 番。下一步应优先试验 KD 策略先验结合有限多步搜索，以及学得的放铳风险、末巡和抢杠决策；需要在新牌山验证，不能把本次已看过的验证集继续用作调参依据。

## 2026-11-07 进一步提强

本轮提升集中在**牌墙耗尽后的最后一次弃牌**。在自己不能胡牌时，若公开牌足以证明另一张合法弃牌不可能补成任何对手的和牌形，优先打这张牌。判断覆盖普通和牌、七对、十三幺、全不靠/七星不靠、组合龙；不会把国标当成有振听的立直规则，也不会把数牌的第四张直接当成安全牌。对手暗杠只计副露组数，不读取牌面。未知牌按上限判断，宁可不确认安全，不把缺少证据当作安全。

内置 `decide()` 默认启用；`decideExperimental()` 保持冻结候选的行为。分析系统会输出末张防守原因。浏览器模型菜单新增 **KD 0 + 末张防守**（`browser-kd-s0-safe`），复用原 KD 0 权重、Worker、WebGPU/WASM 后端和缓存。普通巡次不做额外搜索；安全判断不调用算番器，也不增加神经网络计算。原始四个 KD 模型仍可用于对照。第三方/HTTP agent 可使用 `api/defensiveAgent.ts` 的 `withLastTileDefense(agent)`。

旧数据 112 场、1792 局、381029 个动作的末张反事实核验发现 27 次安全替换，其中 9 次能阻止实际放铳：8 次来自旧内置算法，1 次来自 KD Student 1。替换弃牌在真实裁判暗手下均没有给三家留下合法胡牌机会，合计可避免当前手的 257 比赛分损失、185 对手累计番。这是**当前手的反事实证据**，不代表一般胜率增加，也不是 KD 0 已经避免了 9 次放铳。在线策略只得到脱敏观测；暗手仅用于事后核验。

另试验 KD 先验结合满足八番的听口搜索、最多一步摸打搜索：先验前 3 张候选，保留显著先验下限，限制风险不增加，最多 900 次牌形分析；中断预算时舍弃不完整估计。混合四种 KD 的开发集 128 局为 -0.625 番/局。随后改为一名搜索候选对三名相同原始 KD 0、同牌山换座 128 局，差值 -0.021 番/局，按两组 seed 重采样的 95% 区间 [-0.318, 0.276]，4 次实际改牌。均未支持默认启用，因此保留研究入口，没有打开新验证集继续调参。

上述两批对局合计 256 局、45383 个动作已按归档版本重放，零算法故障。完整指标、来源指纹和限制见 [strength-update-20261107.json](strength-update-20261107.json)。原始数据分别位于 `artifacts/guobiao-mahjong/strength/hybrid-development`、`hybrid-gpu-development`、`last-tile-proof`。这些是本机诊断，未作为注册设备的正式性能证据。

```sh
# 只重放旧数据核验末张防守，不调用模型、不联网
node games/guobiao-mahjong/benchmarks/last-tile-check.mjs

# CPU：每个通道独立 Node + Python，单 BLAS 线程
node games/guobiao-mahjong/benchmarks/run.mjs games/guobiao-mahjong/benchmarks/hybrid-dev.json artifacts/guobiao-mahjong/strength/new-hybrid-cpu

# 浏览器实际 WebGPU；一个模型 Worker 顺序评测，拒绝静默 WASM 回退
node games/guobiao-mahjong/benchmarks/gpu-run.mjs games/guobiao-mahjong/benchmarks/hybrid-paired-dev.json artifacts/guobiao-mahjong/strength/new-hybrid-gpu
```

配置可指定 `baseline`、`enhancedMetrics`、`parallelProcesses`。已有完整场次仅在源码/配置指纹相同时复用。CPU 进程并行与串行两组固定 seed 的完整回放和结果逐项一致。GPU 评测包含 12 个固定 NumPy 决策核对、实际后端检查、逐文件 HTTP 来源记录和 Worker 释放；神经推理与额外搜索耗时分别记录，不能混称模型推理时延。`hybrid-holdout.json` / `hybrid-gpu-holdout.json` 仅为未运行的新牌山计划。

## 候选学习与目标搜索 v1

本轮采用独立候选评分器，保留固定 KD 0 的输入和权重。参考 [M5](https://github.com/LegendXct/Chinese-Standard-Mahjong-AI) 的逐弃牌特征、[Aleo](https://github.com/KiddoZhu/Aleo) 的成牌搜索思路，以及 [Tjong](https://doi.org/10.1049/cit2.12298) 的番数回传方向，实现自己的有限搜索和 NumPy 小模型训练。

`ai/candidates/targets.ts` 只沿降低向听的路径搜索，最多两次进张、64 次数学分析、24 个目标。返回路线必须通过真实八番裁判，分别保留自摸、点和资格。相同目标去重；条件收集概率按单条路线所需牌的多元超几何分布计算，不把重叠路线概率求和。未知牌包含可能在对手暗手中的牌；自摸次数上限为八，忽略后续副露、对手抢和和补花。预算截断明确标记，不能据此认定死听。

风险模型为 28→16→2 的小网络，预测每家当前合法八番 Ron 的概率和条件番数；在校准 seed 上做 Platt 校准。候选模型为 26→8→1，输出对 `log(KD先验)` 的有界残差。特征包括逐弃牌牌效、真实八番听口、目标路线、公开弃牌时序、余牌和累计番排名信息。候选学习使用记录中 KD 家族的真实动作，以本局成和番数和整场名次加权，并用 KL 锚定原先验。这是**事后加权的监督偏好学习，不是反事实 Q 值，也不是完整复刻 Tjong 的奖励分配**。

策略只检查先验支持的前 3 张牌，保留向听不变或改善的候选、常规八番听口及风险增加上限；选择差值需达到固定门槛。温度不为 0 时不应用学习残差，仍保留末张安全规则。该模式在菜单中标为实验，默认内置策略继续保留既有验证过的行为。

语料来自五批已归档的本机对局，共 128 场、2048 局、426412 个动作，严格重放逐项核对结算。固定采样得到 320826 条风险样本、1166 组 KD 候选观测。风险正例由裁判在副本中判断“现在打出此牌，对手是否达到合法八番”，不是猜测暗手；特征不包含对手暗手、未来牌墙或事后结果。候选偏好标签包含事后成和与名次，仅供训练损失使用。

牌山划分在提取前固定：训练 1101/1102/1103/2101–2104/3101，校准 1104/2105，离线测试 2106–2108/3102。新实战开发集为 5101/5102，独立对局验证集为 6101–6104。旧策略研究的牌谱在这里作为新训练语料使用；各轮数据的用途和声明不能混淆。

离线风险测试共 50961 条样本、365 个正例，AUC 0.8414；Brier 与 log loss 均优于按训练集正例率输出的常数基线。`check-learning.mjs` 用 TypeScript 推理重新计算整份测试集，逐项对照 NumPy 指标，并按 seed 单独输出结果。它验证预测模型，不能据此宣称整体棋力提升。权重、特征顺序、训练来源及限制保存在 `ai/candidates/weights.ts` 和 `training.json`。

```sh
# 先按前文生成五批完整旧牌谱；所有命令从 Games 根目录运行
node games/guobiao-mahjong/benchmarks/learning-data.mjs
node games/guobiao-mahjong/benchmarks/learning-policy.mjs
OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 games/guobiao-mahjong/model-service/.venv/bin/python games/guobiao-mahjong/benchmarks/train-candidates.py artifacts/guobiao-mahjong/learning/data-v1 --output artifacts/guobiao-mahjong/learning/model-v1
node games/guobiao-mahjong/benchmarks/export-candidates.mjs
node games/guobiao-mahjong/benchmarks/check-learning.mjs
node games/guobiao-mahjong/benchmarks/gpu-run.mjs games/guobiao-mahjong/benchmarks/learned-dev.json artifacts/guobiao-mahjong/strength/new-learned-dev
node games/guobiao-mahjong/benchmarks/gpu-run.mjs games/guobiao-mahjong/benchmarks/learned-holdout.json artifacts/guobiao-mahjong/strength/new-learned-holdout
```

训练数据、原始策略概率及完整训练报告位于 `artifacts/guobiao-mahjong/learning/`。当前部署导出使用训练输出 `model.json` 的同一数值，并有独立 NumPy→TypeScript 推理夹具。更新权重时应重新导出、检查特征版本、更新夹具并重做独立牌山对局，不能手工修改权重。

评测支持独立比赛的神经批量推理：每次最多 8 场独立比赛、16 个观测，各自保留独立牌墙和裁判；只把脱敏观测传给共享模型 Worker。先核对 12 个固定 NumPy 动作的单条与批量结果，再运行完整比赛。总批推理耗时、每条摊销耗时、搜索耗时和含排队的实际选择耗时分开保存；不能把摊销耗时当成实时单局延迟。原始单条推理路径仍用于游戏。

`learning-validation.mjs` 明确默认策略的提升门槛：与训练/校准/离线测试不重叠的新牌山、至少四个 seed 全部换座、完整严格对局且零故障、累计番数差值 95% 区间完全高于零、平均比赛名次不变差。未满足时保留实验标记，不通过改动验证口径来启用默认策略。

### v1 新牌山实测结果

模型与参数在开发、验证期间保持冻结。开发集 8 场、128 局，学习版比同桌 KD 末张防守版平均多 0.195 番/局；独立验证集 16 场、256 局，学习版为 3.805 番/局，对照为 3.725，差值 +0.079，按四个 seed 整组重采样的 95% 区间为 **[-0.046, 0.242]**。学习版放铳率 17.19%，对照 19.01%；平均名次 2.438，对照 2.521。验证发生 15 次学习评分改牌。

这些是正向的小样本结果，主要累计番数区间仍跨零，**没有达到默认启用门槛**，保留菜单中的实验标记。次要比赛分指标为正不能替代用户设定的累计番数目标。两批实战共 384 局，均已按归档源码完整重放，模型故障为零。完整数据、模型校验和、来源和提升判断见 [learned-results-20261107.json](learned-results-20261107.json)。

## 行动价值 v1 历史实验：真实候选分支模拟

`ai/value/` 提供公开观测清洗、未知牌抽样、行动及吃碰后弃牌分支、完整单局模拟、价值特征和模型推理。`sampleWorld()` 不接收真实对手暗手或真实牌墙；按公开牌、己方暗手、暗杠约束、加杠已声明牌及各家手牌张数抽样。`simulatePlan()` 复制同一个样本世界，执行指定分支，用真实裁判走到本局结束；所有后续策略只得到 `observe()`，已经提交但未公开的响应重新决策。后续行动包括吃碰杠、补花、抢杠、点和、自摸和流局。

样本生成固定为 80 个独立牌墙 × 完整 16 局，按合法行动机会抽取每个 seed 的 24 个局面，覆盖四个风圈及不同副露机会，共 1920 个局面。训练 71001–71064，校准 72001–72008，离线测试 73001–73008；同一 seed 的所有局面严格留在同一份数据。每个局面最多保留前三张 KD 弃牌，保留所有合法响应和杠，吃碰各保留两个数学形状较好的弃牌分支。共 6383 个分支，每条使用 8 个相同抽样世界，总计 51064 次单局模拟。额外训练数据可通过新配置扩展种子和采样预算。

模型有三个按完整训练 seed 重采样得到的网络，每个为 194→32→4。输出己方预期番数、其他三家平均预期番数、和牌概率、当前单局放铳概率。训练使用模拟均值回归、同局面行动优势损失和辅助概率损失；校准集选择训练轮次，离线测试不参与选择。推理比较预期番差，结合固定 KD 先验约束和网络分歧门槛。分歧只是保守选择信号，不是校准过的置信区间。权重由训练脚本导出，不手工调节。

```sh
# 从 Games 根目录执行；已有输出拒绝被不同源码/配置覆盖，重跑时使用新的目录
node games/guobiao-mahjong/benchmarks/value-data.mjs positions games/guobiao-mahjong/benchmarks/value-config.json artifacts/guobiao-mahjong/value/data-v2
node games/guobiao-mahjong/benchmarks/value-policy.mjs artifacts/guobiao-mahjong/value/data-v2
node games/guobiao-mahjong/benchmarks/value-data.mjs label games/guobiao-mahjong/benchmarks/value-config.json artifacts/guobiao-mahjong/value/data-v2
OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 games/guobiao-mahjong/model-service/.venv/bin/python games/guobiao-mahjong/benchmarks/train-values.py artifacts/guobiao-mahjong/value/data-v2 --output artifacts/guobiao-mahjong/value/model-v1
node games/guobiao-mahjong/benchmarks/export-values.mjs artifacts/guobiao-mahjong/value/model-v1
node games/guobiao-mahjong/benchmarks/check-values.mjs
node games/guobiao-mahjong/benchmarks/export-value-decisions.mjs
node games/guobiao-mahjong/benchmarks/gpu-run.mjs games/guobiao-mahjong/benchmarks/value-dev.json artifacts/guobiao-mahjong/strength/value-development-v2
node games/guobiao-mahjong/benchmarks/gpu-run.mjs games/guobiao-mahjong/benchmarks/value-holdout.json artifacts/guobiao-mahjong/strength/value-holdout-v2
```

`label` 使用四个本机线程，每完成一个局面就保存独立分片；配置、源码及原始 KD 概率哈希相符时可继续未完成的生成。模型训练后先检查 NumPy→TypeScript 推理一致性，再独立重算所有公开特征和测试指标，并重演每个行动家族的共同世界分支。实战仍须归档源码并用 `check-evidence.mjs` 完整重放。

最终实战开发 seed 为 81003/81004，独立验证预先固定为 83001–83008，均四座轮换；独立验证共 512 局。初版开发检查发现低置信吃碰仍强制使用启发式后续弃牌，已修正为只执行价值模型确认的组合，其他情况继续由 KD 决策；修正后的结果使用新牌墙重新评测。对手为三个相同 KD-safe，主要指标仍为累计番/局，整组 seed 重采样。该结果只支持这一阵容下的判断，不能视为所有国标模型的排名。

此版本模拟到**当前单局结束**，不是模拟所有剩余风圈。未知牌使用公开计数约束下的均匀分布，不利用弃牌策略的似然推断对手进度；续打策略是冻结的内置 depth=1。两者都可能使动作价值产生偏差。离线标签收益、回归误差和真实 KD 对局强度分别报告，未通过独立实战门槛不替换默认模型。

第三方算法可通过 `simulatePlan(world, seat, plan, scorer, policy, signal)` 提供同步或异步 `policy(observation)` 参与模拟，也可用 `actionValueFeatures()` 和 `predictActionValue()` 读取同版本价值预测。不要把 `sampleWorld()` 的完整样本对象或裁判回放传给参赛策略。

### 行动价值 v1 最终实测

完整记录见 [value-results-20261107.json](value-results-20261107.json)。训练生成 51064 次完整单局模拟、8305321 个合法裁判动作；1920 个公开局面、6383 个分支的特征全部独立重算，七类动作各重演共同世界分支。NumPy 与 TypeScript 推理一致，训练损失的数值梯度检查最大误差约 9.91e-12。导出模型约 424 KB。

离线测试的价值损失为 0.00972，常数预测基线为 0.01286；模拟均值目标上的己方番数 MAE 为 2.193。它检验模拟分布下的预测，不证明真实 KD 对局强度。最终开发集 128 局中，价值版为 3.922 番/局，对照 4.081；独立验证结果如下：

| 最终策略 | 累计番/局 | 和牌率 | 放铳率 | 平均比赛名次 |
| --- | ---: | ---: | ---: | ---: |
| KD0 行动价值 | 3.588 | 24.80% | 16.41% | 2.313 |
| 同桌 KD-safe | 3.245 | 23.11% | 16.86% | 2.563 |

独立验证为 8 个新 seed × 4 座轮换 × 16 局，共 512 局；对照的三家按各自局数归一化。累计番差均值 +0.343 番/局，按完整 seed 重采样的 95% 区间为 **[-0.139, 0.870]**，仍跨零，未达到默认启用门槛。平均名次和均值有正向迹象，保留 **实验 · KD0 行动价值**。不能将不同牌墙研究中的原始均值直接用于排列模型强弱。

验证中发生 81 次相对原 KD 决策的改动，其中一次为已有末张防守；88 次根节点价值重排包含同一吃碰动作改选后续弃牌的情况。只对价值评分确认的组合执行续牌记忆，低置信兜底交回 KD。开发和验证共 640 局、124277 个动作全部按归档源码重放，模型故障和错过合法胡牌均为零。未根据独立验证结果修改模型或门槛。

全仓类型检查、测试和构建通过，麻将 126 项测试通过。真实浏览器的 WebGPU/WASM 后端、原生菜单、组合续牌、温度采样、存档、取消和回退均通过。14 个固定价值局面的 3 秒连续推理测量中，价值计算中位数约 0.6 ms，主线程长任务为零、张量数无增长；这些是当前设备和固定工作负载的诊断数据。原始检查位于 `artifacts/guobiao-mahjong/value-browser/` 和 `value-validation/`。

## 离线教师蒸馏与紧凑发布

新增 `browser-kd-s0-distilled`，保留原版 `browser-kd-s0-value`。旧的 `ai/value/weights.ts` 用于构建可选原版 JSON 和离线 `kd-value-v1` 对照，不进入游戏入口的静态依赖图。教师权重和完整训练报告保存在 `artifacts/guobiao-mahjong/distillation/model-v1/`，不会复制到游戏资产。紧凑模式只加载 `ai/value/distilledWeights.ts`，在现有推理 Worker 内解码一次；选择原版时才加载 `assets/models/value-original-v1.json`，用版本化 URL、长度和 SHA-256 校验。KD 的 TensorFlow.js WebGPU/WASM 路径、共享 Worker、取消与恢复协议保持原样。

离线教师为三个 194→128→4 网络，学生为三个 194→16→4 网络。以完整牌墙 seed 重采样分别训练教师，再将每个教师的软价值和候选策略分布蒸馏给对应学生，保留成员间差异作为保守选择信号。损失包含 70% 教师目标与 30% 实际模拟目标、同局面价值优势和温度 0.1 的策略 KL；教师只见公开特征，真实后续结果仅作为训练标签。校准集选择检查点及验证压缩门槛，离线测试和新实战牌墙不参与调参。

原始模拟数据与源文件先通过 `archive-value-data.mjs` 归档。模拟器与纯观测处理已拆开，旧数据的原始来源哈希保留；新版运行时对 6383 个分支重新生成特征，与原始数据逐项一致后才复用标签。这避免为部署结构调整重复执行 830 万个裁判动作。

```sh
# 一次完成：来源校验 → 教师训练 → 蒸馏 → 候选校验 → FP16 导出 → 推理核验 → 决策夹具
node games/guobiao-mahjong/benchmarks/distill.mjs artifacts/guobiao-mahjong/value/data-v2 artifacts/guobiao-mahjong/distillation/model-v1

# 已有训练结果时，仅校验并重新导出；不重新模拟或训练
node games/guobiao-mahjong/benchmarks/distill.mjs --export-only

# 构建后检查实际 Worker；教师、优化器和完整模拟代码不应出现
npm run build --workspace @haiyue/game-guobiao-mahjong
node games/guobiao-mahjong/benchmarks/check-distillation.mjs --bundle

# 原生 GUI、真实 WebGPU/WASM 与新学生模型
node games/guobiao-mahjong/verify-browser-models.mjs artifacts/guobiao-mahjong/distillation-browser-published

# 与上版未压缩价值头比较；八个新 seed，四座轮换，512 局
node games/guobiao-mahjong/benchmarks/gpu-run.mjs games/guobiao-mahjong/benchmarks/distilled-holdout.json artifacts/guobiao-mahjong/strength/distilled-holdout-reproduced
```

`distillation-config.json` 固定容量、优化预算和保真门槛。教师不允许通过浏览器模型导出校验，打包格式也拒绝超出小模型容量的网络。学生导出采用共享 FP32 均值/尺度和 FP16 权重，包含格式版本、字节长度、FNV 损坏检查及 SHA-256 发布记录；NumPy 的指标和夹具使用量化后实际部署数值计算。

教师有 76428 个参数，学生有 9564 个。数据载荷 20680 字节，完整学生源码模块 31028 字节，原版未压缩模块为 424283 字节，减少约 92.7%。保留原版的按需加载器后，推理 Worker 为 161333 字节，原版为 569095 字节。KD 主干 checkpoint 仍为 26564407 字节，这不是把完整 KD 主干压成 31 KB。

离线测试共 192 个局面、624 个分支：量化学生与教师候选一致率 **96.35%**，策略 KL 为 0.00201；教师价值损失 0.0096213，学生 0.0096200。所有分支特征、推理和指标已通过 TypeScript 独立核对。源码依赖边界测试覆盖四个游戏入口，禁止导入离线模拟器、旧未压缩价值头或教师。

实战预先固定为 91001–91008，完整东南西北四圈；其他规则、KD 主干和保守选择门槛相同。逐次决策只传公开观测，严格处理非法输出和超时，结果按完整 seed 计算区间。录制时 `kd-value` 代表学生，`kd-value-v1` 代表上版价值头；原始配置保存在 `distilled-holdout-recorded.json`，原始源码也已归档。发布时保留原 ID 给原版，当前复现配置使用明确的 `kd-distilled` 学生策略，权重和实际选牌数学逻辑未改变。

512 局中，学生为 3.354 番/局，上版为 3.672，差值 -0.318，95% 的 seed 整组重采样区间为 **[-0.645, -0.002]**；平均比赛名次分别为 2.719 与 2.427。此次棋力对照有回落，因此原版继续保留，学生只作为体积更小的实验选项，不以 96.35% 保真率宣称保持或提升棋力。两者均零模型故障、零错过合法胡牌；没有根据该验证结果重新训练或调节门槛。

最终发布版本通过全仓类型检查、测试与构建，麻将 132 项测试通过。真实 WebGPU/WASM 均验证了学生和原版选牌、吃碰续牌、菜单混用与存档，紧凑模式不会加载原版价值权重；连续推理未观测到主线程长任务或张量增长。另用前两个已测 seed 重放 8 场、128 局，所有 24780 个行动及结算与原录制完全一致。这是模型选项分离和按需加载后的部署核对，不增加独立棋力样本。汇总见 [蒸馏评测记录](distillation-results-20261107.json)，原始检查位于 `distillation-browser-published/` 和 `strength/distilled-published-smoke/`。

## 教师独立评测与强策略标签

四版本消融将教师质量、学生蒸馏阶段和权重量化拆开：原版三个 194→32→4 价值头、三个 194→128→4 教师、三个 194→16→4 FP32 学生及其部署 FP16 版本。KD0 主干、候选范围、先验与保守门槛一致。教师→FP32 的差异包括容量、训练目标和优化效果，不能单独归因于容量；FP32→FP16 主要检查权重量化。教师只在专用 `offline.worker` 加载，标准游戏入口不会导入这些工具或权重。

原训练器现在额外保留 `student-fp32.json` 和训练源码快照。已有模型的 FP32 学生通过复现训练补回，导出的 FP16 学生与游戏现有模型完全一致。教师的浮点末位可能随计算库不同而变化，评测以各份冻结资产的 SHA-256 为准。完整 FP32 归一化在两个学生之间共享，因此 FP32/FP16 对照主要隔离权重量化。

```bash
# 在 Games 目录运行；仅训练并保存离线资产，不导出或替换浏览器模型
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 games/guobiao-mahjong/model-service/.venv/bin/python games/guobiao-mahjong/benchmarks/train-distillation.py artifacts/guobiao-mahjong/value/data-v2 --output artifacts/guobiao-mahjong/distillation/model-v1-ablation-reproduced

# 教师 / FP32 学生 / FP16 学生，各对三家原版；101001–101008，四座轮换
node games/guobiao-mahjong/benchmarks/ablate-values.mjs games/guobiao-mahjong/benchmarks/teacher-ablation.json artifacts/guobiao-mahjong/strength/teacher-ablation-reproduced artifacts/guobiao-mahjong/distillation/model-v1-ablation-reproduced
node games/guobiao-mahjong/benchmarks/archive.mjs artifacts/guobiao-mahjong/strength/teacher-ablation-reproduced
node games/guobiao-mahjong/benchmarks/check-evidence.mjs artifacts/guobiao-mahjong/strength/teacher-ablation-reproduced
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 games/guobiao-mahjong/model-service/.venv/bin/python games/guobiao-mahjong/benchmarks/ablation-parity.py artifacts/guobiao-mahjong/strength/teacher-ablation-reproduced
node games/guobiao-mahjong/benchmarks/analyze-ablation.mjs artifacts/guobiao-mahjong/strength/teacher-ablation-reproduced

# 分层抽样试运行：三个 fold 各取弃牌、吃碰、杠局面，实际执行强策略续局
node games/guobiao-mahjong/benchmarks/adaptive-value-data.mjs games/guobiao-mahjong/benchmarks/adaptive-value-config.json artifacts/guobiao-mahjong/value/adaptive-pilot-reproduced
node games/guobiao-mahjong/benchmarks/check-adaptive-values.mjs artifacts/guobiao-mahjong/value/adaptive-pilot-reproduced

# 全量预览：1920 个局面 / 6383 个候选分支，上限 817024 次完整续局；不创建输出或浏览器
node games/guobiao-mahjong/benchmarks/adaptive-value-data.mjs games/guobiao-mahjong/benchmarks/adaptive-value-full.json --plan-only

# 使用新的输出目录执行全量标注；按实际预算提前停止或算到上限
node games/guobiao-mahjong/benchmarks/adaptive-value-data.mjs games/guobiao-mahjong/benchmarks/adaptive-value-full.json artifacts/guobiao-mahjong/value/adaptive-full-new

# 最终工具的小规模实际 KD 检查，包含坏校验码与局面缓存复用
node games/guobiao-mahjong/benchmarks/verify-offline.mjs artifacts/guobiao-mahjong/offline-smoke-reproduced

# 离线 Worker 也单独检查类型
npx tsc --noEmit -p games/guobiao-mahjong/benchmarks/tsconfig.offline.json
```

输出目录应使用新路径；同目录只用于继续相同源码、模型、配置和输入指纹的任务。每场完整比赛或每个标注局面保存一个分片，过期分片会被拒绝。`teacherQualified` 要求教师相对原版的累计番数差值 95% 区间下界大于零、平均名次没有变差、无模型故障及漏胡；本命令只评测，不会自动发布。

输入文件在续跑时校验并保留，分片和进度采用原子写入。`selection=all` 可复用完整源数据，分层抽样也支持按 fold 指定数量，并在各类局面中分散抽取不同牌墙。局面文件由离线 Worker 校验 SHA-256 后只加载一次，后续按编号查找；独立续局的神经网络请求批量合并，最多 16 个观测。标注和验证结果默认写入各自输出目录，复现不会覆盖本轮已归档的汇总。

决策审计按动作类别记录改选频率、之后该局的和牌和放铳结果；这些是条件统计，不能把整局收益因果归于单个动作。`analyze-ablation.mjs` 将审计与逐手合法回放核对，并用固定离线测试局面比较原版→教师→FP32→FP16 的候选价值差异、实际动作及续牌一致率。汇总在 [四版本评测记录](teacher-ablation-results-20261107.json)。

本轮完成 96 场、1536 局、285884 次合法行动，并逐一核对 90818 次有选择的决策。每个候选各占 512 局，其余三座为原版，按完整 seed 分组计算区间：

| 候选 | 候选番/局 | 同桌原版番/局 | 候选平均名次 |
| --- | ---: | ---: | ---: |
| 教师 | 3.473 | 3.633 | 2.594 |
| FP32 学生 | 3.410 | 3.636 | 2.719 |
| FP16 学生 | 3.410 | 3.636 | 2.719 |

教师相对原版差值为 -0.161 番/局，95% 区间 [-0.671, 0.294]，平均名次也未改善，`teacherQualified=false`。FP32 学生相对教师的配对差值为 -0.065，区间 [-0.318, 0.174]，同样不足以确定实战差异。不能仅凭点估计把全部回落归因于容量。

FP32/FP16 两组 32 场、512 局的全部 95524 次行动和结算完全一致；192 个固定测试局面的实际动作和续牌选择也完全一致，价值差异 RMSE 约 0.000857 番。本轮未观察到额外 FP16 棋力损失。独立 NumPy 的七类动作、504 个输出与 TypeScript 的最大误差为 4.44e-16。FP32 与 FP16 均从训练中的 FP64 参数分别取整，记录了一个中点双重舍入差异，保持原部署权重不变。

三组均零模型故障、零漏胡。这次结果支持先改进标签与教师训练，教师独立过关后再考虑新的蒸馏发布；不把离线保真率作为提强证明。原始记录在 `artifacts/guobiao-mahjong/strength/teacher-ablation-v1/`。耗时含同时运行的离线任务与构建，不作为浏览器交互延迟指标。

强策略标注采用真实 KD0 神经网络先验和冻结的原版价值头。每个采样世界安排两家 KD0、两家原版价值模型，逐世界轮换座位分配；该分配对同局面的所有候选相同。只向策略提供公共观测，未知暗手和牌墙仅由模拟裁判使用。每条候选分支拥有独立续牌记忆，合法胡牌优先，不允许故障时回退到内置策略。

`adaptive-value-config.json` 固定 8→32→64→128 档位。普通动作至少 8 次，吃碰杠或公共风险超过门槛的弃牌至少 32 次。只有最优候选相对所有其他候选的配对收益差都超过 `closeFan + confidenceZ × pairedSE` 才提前结束；否则继续到上限。这里的 SE 是预算启发式，经过自适应停止后不能视作严格置信区间。实际次数、各档统计、旧/新标签变化见 [自适应标注记录](adaptive-value-results-20261107.json)。

这轮分层标注是流程试运行，规模不足以训练或证明更强的新模型。该轮采用按公开牌数一致的均匀未知手牌采样；本轮新增的对手推断、整场价值及自博弈训练见后文联合学习章节。各局面的样本数可以不同，训练应读取 `sampling.worlds` 和实际 `outcomes`，不能沿用固定 8 次的假设。原 `train-distillation.py` 按每行实际结果取均值，可消费新标签；先扩充数据并完成教师实战，再考虑导出。

实测试跑覆盖 9 个局面、30 个分支，共 3840 次完整续局、588038 次模拟行动，包含弃牌、过、吃、碰、明杠；暗杠与加杠另有规则、候选覆盖和数值夹具验证。本批全部达到 128 次上限，未在实测中提前停止；提前停止、战术最低预算及串并行一致性由确定性测试覆盖。3 个局面的最高估值候选与旧标签不同，6 个局面的最佳候选在强策略 8→128 次采样间变化。各局面配对 SE 的均值由约 3.241 降至 0.813 番，是描述性的样本估计，不是棋力提升证明。

源指纹、按完整牌墙划分、候选覆盖、配对样本数、预算决策、规则结果及零和结算核验通过。浏览器与 Node 特征的最大差异为 1.11e-16；验证仅容许 1e-12 以内的数学函数舍入差异，维度和非有限数仍严格拒绝。原始数据在 `artifacts/guobiao-mahjong/value/adaptive-pilot-v1/`，最后一轮工具检查在 `offline-published-smoke/`。本次保留现有模型，后续需用更大规模的新标签训练并独立验证教师。

最终工具通过全仓类型检查、测试与构建，麻将 139 项测试通过。缓存与输入保护收尾后，又用实际 WebGPU 完成两次标注任务、24 次续局，确认错误校验码拒绝、两次任务共用一次局面加载、候选特征及结算正确。大规模对照和试跑均保留对应版本的源码快照；后续的缓存、原子写入和预算预览改动由最后一轮小规模检查及测试覆盖。

## 对手推断、联合动作学习与整场联赛

第 3–5 项使用独立的 `league/` 数据与检查点，已有模型和历史评测保持可回放。浏览器候选 ID 为 `browser-kd-s0-joint`，菜单为「实验 · KD0 联合候选」。KD0 主干仍为原来的固定权重，小模型只在该选项启用时加载；默认后端 WebGPU，可切换 WASM。

- 对手网络为 290→24→44：己方手牌、公开弃牌与副露、最近四次弃牌顺序、座风、余牌和累计分差，输出听牌、34 种点和危险、8 类牌型兼容性与截断番值。暗手只在离线提供标签；在线明确移除其他玩家暗手、暗杠身份和牌墙。牌型兼容性描述当前暗手形状，不代表最终做成该番型的概率。
- 未知世界保留四张牌计数和公开约束，使用预测边际对合法均匀提案作有界似然比加权。候选共用样本和权重，均匀混合比例至少 25%，有效样本量至少一半。它是近似后验；少量提案没有某类听牌时，重加权无法创造该状态。本轮扩展搜索是 9 个局面、83 个动作计划、664 次完整续局的试运行，不能代替更大规模标签。
- 联合网络为 234→64→8 教师，蒸馏为 234→32→8 学生。动作计划包含全部合法弃牌、全部吃法及每种吃碰后的合法弃牌、过和各类杠。父动作概率与吃碰后续弃牌概率分层计算，候选多的吃法不会仅因枚举更多而得到额外概率。输出策略残差、本局双方番数、和牌、放铳、整场剩余双方番数与夺冠辅助值。
- 联赛保留 KD0、冻结的原版行动价值、历代联合模型，以及进攻、防守风格。PFSP 对更难的对手提高抽样权重，同时强制保留历史和风格覆盖。两个迭代各有四个新牌墙、四座轮换、16 局完整比赛。训练采用合法分布采样；每局均匀抽取两个可训练决策，保留逆抽样概率权重。胡牌保护、末张保护和已经确认的后续弃牌不计作新的策略采样。
- PPO 更新以「剩余己方累计番数－其余三家平均番数」除以 32 为主目标，加 0.2 倍整场冠军奖励；平手按最终累计番数、标准分判定并共享奖励。按完整牌墙分训练与校准，裁剪比例 0.2，校准 KL 上限 0.03。教师独立评测与学生量化评测都通过才考虑替换原版。

以下命令在 Games 根目录运行，Python 环境需要 NumPy。模拟和联赛采集复用现有 Chrome/WebGPU 离线工具；只训练已有标签时无需重新采集。首次生成依赖已有 `value/data-v2` 和 `strength/` 牌谱；`MAHJONG_PYTHON` 可指定 Python。输出按模型、源码和配置校验，同目录只用于相同版本续跑。首次复现应使用独立输出，保留已归档数据；改变配置不能混用旧分片。

```sh
node games/guobiao-mahjong/benchmarks/belief-data.mjs
./games/guobiao-mahjong/model-service/.venv/bin/python games/guobiao-mahjong/benchmarks/train-belief.py artifacts/guobiao-mahjong/league/belief-data-v1 --output artifacts/guobiao-mahjong/league/belief-v1
node games/guobiao-mahjong/benchmarks/joint-bootstrap.mjs
node games/guobiao-mahjong/benchmarks/joint-data.mjs
./games/guobiao-mahjong/model-service/.venv/bin/python games/guobiao-mahjong/benchmarks/train-joint.py pretrain --output artifacts/guobiao-mahjong/league/teacher-g0
node games/guobiao-mahjong/benchmarks/train-league.mjs
./games/guobiao-mahjong/model-service/.venv/bin/python games/guobiao-mahjong/benchmarks/export-joint.py
node games/guobiao-mahjong/benchmarks/verify-league.mjs
node games/guobiao-mahjong/benchmarks/evaluate-league.mjs
npm run build:target -- game:guobiao-mahjong
node games/guobiao-mahjong/verify-joint.mjs
```

`league-config.json` 固定训练与最终评测牌墙，整场所有 16 局和座位轮换保持同一划分。`verify-league.mjs` 对实际牌谱逐动作重新裁判，同时核对每个保存决策的公开观测、候选特征、行为概率、终局目标、抽样权重、源码及模型校验值；另用 TypeScript 重算留出牌墙上的听牌和危险牌指标。`check-joint-gradients.py` 对分层策略、PPO 裁剪、熵项与价值梯度做有限差分核验。

`export-joint.py` 只导出两个小网络的 FP16 权重、FP32 归一化与校准参数，生成独立 NumPy 对照夹具和 SHA-256。游戏入口的依赖检查禁止教师、训练器和整局模拟器。`verify-joint.mjs` 在真实 Worker 的 WebGPU/WASM 上比较量化模型动作及最终父动作概率，检查吃碰续牌、非零温度确定性、张量稳定、按需释放、取消和存档。大任务的浏览器结果分块传回离线进程，避免一次传输整个轨迹对象。

复现到独立目录可使用完整离线训练入口，避免覆盖本轮档案。先预览，移除 `--plan-only` 后执行。该入口生成训练结果；导出仍是单独步骤，会更新实验候选资源，随后需要独立评测。

```sh
node games/guobiao-mahjong/benchmarks/league-pipeline.mjs artifacts/guobiao-mahjong/league-fresh games/guobiao-mahjong/benchmarks/league-config.json --plan-only
node games/guobiao-mahjong/benchmarks/league-pipeline.mjs artifacts/guobiao-mahjong/league-fresh games/guobiao-mahjong/benchmarks/league-config.json
./games/guobiao-mahjong/model-service/.venv/bin/python games/guobiao-mahjong/benchmarks/export-joint.py --base artifacts/guobiao-mahjong/league-fresh
node games/guobiao-mahjong/benchmarks/verify-league.mjs artifacts/guobiao-mahjong/league-fresh
node games/guobiao-mahjong/benchmarks/evaluate-league.mjs artifacts/guobiao-mahjong/league-fresh/evaluation-v1 artifacts/guobiao-mahjong/league-fresh
```

对更长的实验可复制配置并增加每轮的独立牌墙与迭代数；最终评测必须使用未参与训练或选参数的牌墙。两轮小规模试跑只验证训练闭环，不能视为训练充分。按输出文件的源码和模型指纹恢复，改变版本后使用新目录。

### 本轮联合学习结果

实际完成 8640 条对手标签、9 个全动作扩展局面（83 个计划、664 次完整续局）、两代联赛 32 场 / 512 局 / 1024 个抽样决策。联赛共 108680 次合法行动，全部训练样本的公开观测、候选特征、行为概率、抽样权重及整场目标通过实际牌谱重算；浏览器与 Node 的最大特征差异为 2.22e-16。

最终独立对照使用 201001–201004 四个未参与训练、校准或离线测试的牌墙，各四座轮换。每个候选对战三家冻结原版，原版统计按三座平均。共 512 局、93677 次行动，逐手裁判回放通过，零故障、零漏胡：

| 候选 | 候选番/局 | 同桌原版番/局 | 候选平均名次 | 番/局差值的牌墙分组 95% 区间 |
| --- | ---: | ---: | ---: | --- |
| 联合教师 | 2.609 | 3.799 | 3.125 | [-1.633, -0.708] |
| 联合 FP16 学生 | 2.859 | 3.712 | 2.938 | [-1.534, -0.424] |

本轮未提强，不替换原版。学生相对教师的离线计划一致率为 98.96%，量化夹具的计划一致率为 100%；这些数值不能消除教师实战偏弱的问题。对手听牌 Brier 为 0.08598（常数基线 0.11163），危险牌 Brier 为 0.004736（基线 0.004772）；危险牌改善较小，测试只含三个原始牌墙。当前 8 世界的扩展标注很稀疏，边际后验的重加权也无法补出提案中缺失的听牌形态。后续应先扩大全动作标签和整场样本，再使用新的留出牌墙评估，避免在这组结果上调参后重复当作独立验证。

原始档案位于 `artifacts/guobiao-mahjong/league/`。`evaluation-v1/analysis.json` 对全部独立比赛逐动作回放，并从实际行动数核对强制动作统计；初始采集报告另存 `collector-report.json`。原版、旧蒸馏模型及历史证据均保留。正式汇总见 [联合学习记录](league-results-20261107.json)。

游戏页面构建只包含运行入口及依赖；离线工具继续由完整类型检查覆盖。麻将的三个 Worker 与页面在四个独立编译进程中构建，逐一校验产物完成标记，保留原有每阶段超时约束，避免单进程累计驻留多个编译器导致超时。
