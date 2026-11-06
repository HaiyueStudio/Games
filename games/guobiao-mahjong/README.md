# 国标雀局 · Mahjong AI Arena

使用 Haiyue WebGPU 引擎与原生 `GuiSystem` 渲染整张牌桌、手牌、牌河和 HUD。没有 HTML 游戏界面。

```sh
npm install
npm run build:target -- game:guobiao-mahjong
# 用本地 HTTP 服务打开 games/guobiao-mahjong/index.html
# 大厅入口：?game=guobiao-mahjong
```

选择东、南、西、北任一固定座位参与人机对战，或选择“四家 AI · 观战”。点击“开始对局”。
手牌点击一次选中，再次点击打出；“吃 / 碰 / 杠 / 和 / 过”由裁判按合法动作显示。
所有牌面、花牌与牌背使用同一张 `assets/tiles-atlas.png`，由引擎 `GuiImage` 按 UV 取图。
摸到的牌单独排在手牌最右侧，并保留较大的间距；其余牌继续按花色与序数排序。
吃、碰、杠各为独立一组，组间留白；可吃碰杠的手牌高亮，副露中来自他家的牌用金色标明，最近完成的一组额外高亮。
牌桌采用正方形并增高，桌面手牌纳入桌内布局；左右手牌按完整比例放大。中央方向盘放大 25%，显示当前风圈及四家门风，当前出牌方以金色高亮。
四家 AI 观战时实时亮出全部手牌；人机对战中保留对手暗手，结算后四家一同亮牌（包括暗杠）。
观战明牌仅用于展示，传给内置与外部 AI 的决策观测仍按各自座位保密。
牌面采用用户提供图片，已去除右下角水印；`reference-tiles-clean.png` 为清理后的源图。
`pack-reference-atlas.mjs` 将 34 种牌面与已有八花、牌背合并为 43 帧 atlas，来源及编辑提示词见 `tiles-atlas.provenance.json`。

右侧（竖屏为手牌下方）显示当前番型，点击“番型明细”查看组成：

- 未和牌时，显示已识别牌张与现有面子的**参考番数**，包括五门齐（6 番）及常见花色、范围、刻杠与顺子组合；这不是完整和牌的 81 番最终结算。
- 听牌时，用完整算番器枚举现有可见余牌的点和结果，显示番数范围；需要先弃牌的会注明“打某牌后”。自摸及其他特殊和牌条件另计。
- 当前能够组成和牌时，显示完整裁判的准确番数及距离 8 番门槛的差额。
- 花牌以实际花牌贴图单独显示，不计入起胡番数。

番型明细使用引擎 GuiModal，阻挡底层输入；打开时暂停行牌，关闭后恢复先前状态。
可以吃、碰、杠、胡时，牌桌显示金色通知，直到你完成选择；已有操作按钮仍可直接点击。
四家的实际吃、碰、明杠、暗杠、加杠、胡牌均弹出通知，并在动作所在方位显示大字淡入淡出效果。
通知按动作类型使用不同颜色，胡牌使用金色并优先提示；暗杠不会在通知中公开牌面。
快速连续动作的通知队列有上限，方位效果立即触发；新比赛、切换视角和恢复存档会清除旧通知。

番型分析在麻将 Worker 中运行；展示和排序不改变裁判手牌、合法动作或 AI 决策。
P / 空格暂停，H 提示。支持引擎 GUI 手柄指针。

底部滑条设置 **AI 完成计算之后** 的等待时间（0–5 秒）；公共接口可设 0–30 秒。
暂停会冻结等待时间，“单步”执行一个决策。“下一局”进入下一盘。
共 **东南西北四圈、每圈四局，16 局**，每盘更换庄家，流局也轮转，不设连庄。
累计和牌番数（含花）为主排名，同时展示标准零和比赛分、胜局数；同番按比赛分排序。

144 张牌含八花，自动补花，支持吃、碰、明杠、暗杠、加杠、抢杠和、杠上开花、绝张、海底。
**不含花牌至少 8 番才能和牌**。标准 81 番种及不重复计分由完整 MIT 算番库处理，
另支持库中“明暗杠”的组合调整。多人同时和牌取从放铳者起最近的一家，和优先于碰杠、碰杠优先于吃。
自摸三家各付 8 + 番花总分；点和由放铳家付 8 + 番花总分，另外两家各付 8。
自动存档使用引擎 Save 服务；恢复时重放每个动作并重新验证，恢复后先暂停。
外部模型的座位在恢复后需要重新接入；未接入时会保持暂停，不会悄悄换成内置算法。

内置 AI 在专用 Worker 内进行所有和型的精确向听分析、剩余有效进张、8 番有效听牌检验、
番型价值估计、两层进张搜索和基于公共牌面的防守。国标没有振听，弃牌只作风险信号。
它是有搜索的启发式算法，尚未通过与专业国标 AI 的强度基准，不能宣称最强。

## 接入第三方算法 / 大模型

页面提供 `window.haiyueMahjong`；渲染与裁判完全独立。例：

```js
const arena = window.haiyueMahjong;
arena.controller.setHuman(null);
arena.controller.setAgent(0, arena.httpAgent('模型 A', 'http://127.0.0.1:8765/agent/model-a'));
arena.controller.setAgent(1, {
  name: '自定义算法',
  async decide(observation, { signal, requestId }) {
    // 在合法动作集合中选择，必要时调用第三方服务。
    return observation.legalActions.find(a => a.type === 'hu')
      ?? observation.legalActions.find(a => a.type === 'pass')
      ?? observation.legalActions[0];
  },
});
arena.controller.setDelay(2000);
arena.controller.timeoutMs = 60000;
arena.controller.depth = 2; // 内置 AI：1 快速，2 两层搜索（默认）
arena.controller.autoNext = true;
arena.controller.start();
```

HTTP 端点收到 POST：

```json
{"protocol":"haiyue.mcr/1","requestId":"对局:决策:座位","observation":{"revision":0,"seat":0,"hand":[0,1,2],"legalActions":[{"type":"discard","tile":0}]}}
```

上面仅缩写展示字段。完整观测包含自己的手牌、各家手牌张数、公开副露/花牌/弃牌、当前舍牌、
圈风门风、剩余牌数、当前盘公开事件、之前各盘结果和合法动作；
**不含牌墙顺序、随机数状态、对手手牌、对手暗杠牌面、其他家的未决选择**。
`revision` 随每次有效决策递增。接口返回同一请求号、同一版本，并原样选择合法动作：

```json
{"requestId":"对局:决策:座位","revision":0,"action":{"type":"discard","tile":0}}
```

牌号：0–8 一至九万，9–17 一至九条，18–26 一至九筒，27–30 东南西北，31 中、32 发、33 白；
34–41 春夏秋冬梅兰竹菊。动作包括 `discard/chow/pung/kong/concealed-kong/add-kong/hu/pass`。
`chow` 必须保留完整 `tiles` 数组。观测的动作已经过裁判验证，大模型不需要自行声明和牌番种。
HTTP 返回错误、超时、版本不符或非法动作时，交互对局暂停并显示原因；不会暗中替换模型决策。
`setAgent(seat, null)` 恢复内置 AI；`controller.observation(seat)` 供裁判端调试，
参赛算法仅应使用传入的观测。JavaScript 插件属于受信任代码，不是恶意代码隔离环境。

`api/model-proxy.mjs` 提供能直接调用 chat/completions 兼容服务的大模型代理，密钥仅从服务端环境变量读取。
创建本地 `providers.json`（不要写入密钥）：

```json
{
  "model-a": {"endpoint":"https://provider.example/v1/chat/completions","model":"your-model-name","keyEnv":"MODEL_A_KEY","jsonMode":true},
  "model-b": {"endpoint":"https://provider.example/v1/chat/completions","model":"another-model","keyEnv":"MODEL_B_KEY","jsonMode":false}
}
```

```sh
node --experimental-strip-types games/guobiao-mahjong/api/model-proxy.mjs /path/to/providers.json
```

代理只监听本机，仅允许本机页面跨域访问；需要服务支持相应 JSON 返回格式。
可从 `arena.systemPrompt` 取得规则提示词，从 `arena.fanCatalog` 取得完整番种目录。

## 批量比赛与复盘

```sh
node --experimental-strip-types games/guobiao-mahjong/api/arena.mjs games/guobiao-mahjong/api/arena.example.json /tmp/mahjong-results.json
```

配置可混合内置算法与 HTTP 算法。默认同一 seed 轮换四次座位，每次完整 16 局，减小座次和牌运偏差。
结果包含排名、番数、比赛分、胜局、故障次数和每局详情。无界面比赛无展示等待；
超时/非法返回记录 `faults` 并执行过牌或首个合法动作，比较模型时必须同时检查故障数。
也可直接导入 `api/tournament.ts` 的 `runTournament`，传入四个 `MahjongAgent`，支持取消和事件回调。
批量场景的内置算法可同步运行；浏览器交互对局使用 Worker。

“导出回放”包含 seed、原始动作、公共事件及结果；可用 `rules/replay.ts` 的 `replayMatch` 重新裁判。
完整回放属于裁判数据，会暴露随机种子及暗杠，不应在对局中提供给参赛模型。

```sh
node --experimental-strip-types --test games/test/guobiao-mahjong.test.mjs games/test/guobiao-mahjong-presentation.test.mjs
node games/guobiao-mahjong/verify-browser.mjs
```

测试覆盖 214 个原生 C++ 算番回归样例、番花门槛、牌张守恒、抢杠、优先级、四圈、
信息隔离、可调等待、暂停/单步及无界面比赛。浏览器脚本检查真实 GUI 点击、后台决策、暂停和竖屏布局。
源码与许可见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 免费预训练模型与容器

已接入三个 MIT 国标 KD 模型及三模型集成模式，支持 CPU 推理。点击原生 GUI 的 **AI 模型**，连接本机模型服务后按座位切换，并设置温度和随机种子。
模型来源、启动命令、Docker Compose、公共接口、测试与适配差异见 [模型服务说明](model-service/README.md)。
