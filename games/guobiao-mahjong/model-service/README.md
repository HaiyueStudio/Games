# 国标麻将模型服务

提供独立 CPU 推理服务和 Docker 容器。浏览器只发送当前座位的手牌、公共信息及裁判给出的合法动作；模型只在该合法集合中选择，不接收牌墙或其他人的暗手。无需 GPU、PyTorch 或付费 API。

## 已核实并接入的权重

| 模型 | 规则与许可 | 是否可直接测试 |
| --- | --- | --- |
| KD Student 0 / 1 / 2 | 国标，模型仓库声明 MIT；三个已训练学生权重 | 是，各约 26.6 MB |
| KD Ensemble 3（kdens3） | 同一家族的三模型 softmax 平均 | 是，总计约 79.7 MB |
| LegendXct M5 | 国标，MIT 代码 | 仓库未提供权重，未列为直接可用模型 |
| Mortal | 日本立直麻将，AGPL 代码，权重另有说明 | 规则与本游戏不同，未直接接入 |

核实日期：2026-11-06。主来源：[KD 模型卡](https://huggingface.co/Dannibal/ijcai-mahjong-ckpts-2026/blob/main/MODEL_CARD.md)、[部署权重与推理代码](https://huggingface.co/Dannibal/ijcai-mahjong-ckpts-2026/tree/main/champion)、[M5 权重说明](https://github.com/LegendXct/Chinese-Standard-Mahjong-AI#模型权重说明)、[Mortal](https://github.com/Equim-chan/Mortal)。

下载固定在 `5670a37c87890ffe95ea0cc0431cb1c704ec8564`，三个权重的大小与 SHA-256 见 `models.lock.json`。不会从变化的 `main` 分支自动替换模型。权重在本机已下载；大文件与虚拟环境不提交到 Git。

## 本机启动

从 Games 仓库根目录运行：

```sh
./games/guobiao-mahjong/model-service/run.sh
```

脚本建立独立 `.venv`、安装固定 NumPy 版本、校验/下载权重，然后监听 `http://127.0.0.1:8787`。也可分步执行：

```sh
python3 games/guobiao-mahjong/model-service/fetch_models.py
python3 -m venv games/guobiao-mahjong/model-service/.venv
games/guobiao-mahjong/model-service/.venv/bin/python -m pip install -r games/guobiao-mahjong/model-service/requirements.txt
games/guobiao-mahjong/model-service/.venv/bin/python games/guobiao-mahjong/model-service/server.py
```

游戏中点击 **AI 模型 → 连接 / 刷新**，给各个 AI 座位选择模型，设置温度和随机种子，点击 **应用**。玩家所在位置不会被替换。温度 0 为确定性选择；大于 0 时按概率采样，同一观测与随机种子可复现。模型加载或推理失败会按现有机制暂停，不会暗中换用内置 AI。

## Docker

在本目录运行：

```sh
python3 fetch_models.py
docker compose up --build -d
```

镜像仅安装 NumPy；三个权重以只读卷挂载，容器端口只映射到本机 8787。当前开发机器没有 Docker，已用同一套 Python 服务完成实测；镜像构建尚未在本机验证。

## 接口与参数

- `GET /health`：健康状态及可用模型。
- `GET /models`：可切换模型、规则、许可与参数范围。
- `POST /agent/kd-s0`、`/agent/kd-s1`、`/agent/kd-s2`、`/agent/kdens3`：模型决策。

```json
{
  "protocol": "haiyue.mcr/1",
  "requestId": "opaque-request-id",
  "observation": { "revision": 1, "seat": 0, "hand": [], "players": [], "legalActions": [] },
  "parameters": { "temperature": 0, "seed": 20261105 }
}
```

示例缩写了 observation；实际必须发送游戏 `controller.observation(seat)` 返回的完整对象。响应保留 `requestId`、`revision`，返回原样的合法 `action`，并附带 `model`、`inferenceMs`、`parameters` 和固定的 `weightsRevision`。

浏览器接入：

```js
const arena = window.haiyueMahjong;
await arena.modelHub.refresh('http://127.0.0.1:8787');
arena.controller.setHuman(null);
arena.modelHub.apply(['kd-s0', 'kd-s1', 'kd-s2', 'kdens3'], { temperature: 0, seed: 20261105 });
arena.controller.start();
```

其他模型可实现相同发现/决策接口，游戏端无需重新构建。增加不同网络结构时，在服务中新增推理适配器及模型元数据，保留合法动作校验和只使用当前座位信息的边界。现有大模型代理 `api/model-proxy.mjs` 和 `httpAgent` 仍可使用；密钥放在服务端。

## 验证与比较

```sh
OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 .venv/bin/python -m unittest discover -s . -p 'test_*.py' -v
```

测试覆盖全部 235 个动作编号、38 通道与上游编码对照、被吃碰的弃牌历史、暗杠保密、三个真实权重和集成推理、采样复现，以及 HTTP/浏览器跨域接口。

使用 `api/arena.models.example.json` 可跑完整 16 局并轮换座位。`parameters` 会传给所选模型。应使用多个 seed 和座次轮换比较，不能凭单场判断强弱。本次 smoke match 使用 seed 20261105、KD Student 0 对三个内置 depth=1 AI，完成 16 局且接口/非法动作故障为 0；KD 得到 72 累计番、6 胜。这是接入回归检查，不是强度评测结论。

输入布局及动作编号与上游一致，但本适配器每次请求刷新公共弃牌/副露通道；原实现仅在己方手牌变化时刷新。游戏还有花牌、牌墙规则和累计番数目标的差异。因此上游公布的成绩不能直接当作本适配版的成绩。具体来源、原始模型卡、许可与校验值保存在 `vendor/` 和 `models.lock.json`。
