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
