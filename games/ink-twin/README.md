# 墨白双生 · Ink Twin

灰色宣纸上的双线数字解谜。拖动黑色或白色的 1，依次经过同色数字；另一条线绕棋盘中心旋转 180° 同步移动。只能上下左右行笔，不可相交、重叠；到达最后一个数字时，两条线必须铺满每一格。

- 入墨 6×6、行笔 8×8、化境 10×10；每日关卡按本地日期和难度固定，练习可连续换题。
- 鼠标、触屏和手柄均可拖动任意一色；在线条上重新落笔可以回退。方向键移动，空格切换执笔颜色，Z 撤销、H 提示、R 重开。
- 使用仓库统一的引擎单槽自动存档，恢复难度、路线、执笔颜色、计时和提示次数；日期变化后每日题自动换卷。
- 提示使用生成时的完整可解路线；当前路线有分歧时会明确告知并收回分歧部分，再续一格。不要求答案唯一。
- `rules/model.ts` 是无 DOM 的确定性规则；构造关卡使用有界的成对 backbite 变换，保持路径连通、不相交及完整覆盖。
- 数字使用生成的透明水墨 bitmapfont 图集，运行时按同一 alpha 分别着墨黑、白；`art/InkBoardArt.ts` 绘制渗墨、笔锋和飞白。背景为生成的灰色宣纸纹理。
- `rendering/BoardView.ts` 通过公开 `@haiyue/engine`、`@haiyue/engine/systems` 和实验性 `@haiyue/engine/experimental` 的 `RenderIntegration` 呈现水墨纹理；引擎负责 WebGPU 提交、游戏大厅挂载和资源回收。

```sh
npm run build:target -- game:ink-twin
node --experimental-strip-types --test games/test/ink-twin.test.mjs
node games/ink-twin/verify-browser.mjs
```

通过仓库 HTTP 开发服务访问 `games/ink-twin/index.html`，或在游戏大厅选择「墨白双生」。浏览器验证输出位于 `artifacts/ink-twin/`，包含桌面、触屏竖屏、双笔行迹和通关截图。
