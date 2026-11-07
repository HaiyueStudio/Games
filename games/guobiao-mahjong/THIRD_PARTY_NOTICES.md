# 国标麻将算法

算番及各类和型向听数来自 Jeff Wang (summerinsects) 的 MIT 许可项目
[mahjong-algorithm](https://github.com/summerinsects/mahjong-algorithm)，固定版本
`44a178af08bf11f82a8993fddbe2fe8876ddd8f3`。原始源码、版权及完整许可保留于
`vendor/mahjong-algorithm/`。`vendor/bridge.cpp` 为本游戏的独立 WebAssembly 适配层。

`assets/mcr.wasm` 使用 WASI SDK 25 / Clang 19 编译，未导入 WASI、文件系统或网络能力。
运行及正常游戏构建无需安装编译工具。重新生成：

```sh
node games/guobiao-mahjong/vendor/build-wasm.mjs /absolute/path/to/wasi-sdk-25
```

本地规则参照 [EMA 公布的 Mahjong Competition Rules](https://mahjong-europe.org/portal/images/docs/mcr_EN.pdf)。
支持标准 81 番种及原库的“明暗杠”组合计分调整；没有启用天和、地和、人和扩展。

`games/test/fixtures/mahjong-scoring.json` 从所固定源码的 `unit_test.cpp` 中的
214 个算番示例，经原生 C++ 算番程序生成，以核对 WASM 的逐项番种、次数及排除关系。
这些是上游兼容性回归数据，不代表经过官方裁判认证。

## 麻将牌面

34 种基础牌面由用户提供的图片裁切，使用内置 image_gen 去除右下角水印。
清理后的源图保存在 `assets/reference-tiles-clean.png`；八花及牌背沿用 HaiyueStudio 自制图案。
编辑提示词、打包映射和校验值见 `assets/tiles-atlas.provenance.json`。

## 国标预训练模型

模型服务使用 Dannibal/ijcai-mahjong-ckpts-2026 的 MIT 部署权重及 NumPy 推理代码，固定在 `5670a37c87890ffe95ea0cc0431cb1c704ec8564`。原始模型卡、来源及许可位于 `model-service/vendor/`，文件校验值位于 `model-service/models.lock.json`。大权重通过脚本下载，不纳入源码版本控制；构建时可复制到浏览器资源包。浏览器与 HTTP 服务使用相同的固定权重。

## 浏览器模型运行时

TensorFlow.js、WASM 后端及 WebGPU 后端固定为 4.22.0，许可证 Apache-2.0，来源 https://github.com/tensorflow/tfjs/tree/tfjs-v4.22.0 。完整许可证保留于 `ai/browser/LICENSE.tensorflow.txt`，构建复制到 `ai/tfjs/LICENSE.txt`。运行库文件的大小、版本与 SHA-256 在生成的 `ai/tfjs/provenance.json` 中记录。

Worker 内的 checkpoint 解压使用 fflate 0.8.2（MIT，Copyright © 2023 Arjun Barrett），来源 https://github.com/101arrowz/fflate 。构建将完整许可证复制到 `ai/tfjs/LICENSE.fflate.txt`。浏览器 checkpoint 目录附带原模型 MIT 许可证与固定版本目录信息。

## 界面装饰

`assets/ui-backdrop-v1.png`、`ui-drawer-v1.png` 和带透明背景的 `ui-ranking-v1.png` 使用内置 OpenAI image_gen 工具生成。完整提示词、尺寸与 SHA-256 见 `assets/ui-art.provenance.json`。播放器与菜单图标由本项目的几何路径在启动时合成小型图标合图。

## 本地训练的联合候选

`ai/joint/candidate.json` 的对手推断与联合策略小网络由本仓库的离线裁判模拟、自博弈牌谱和 NumPy 训练器生成；来源、校准、数据划分和检查点 SHA-256 记录于联赛结果。它继续使用上述固定 MIT KD0 主干，未引入新的第三方预训练权重。浏览器资源只含小网络的量化推理数据，不含训练器或暗手标签。
