# Chromatic Tetris

方块使用实时 WGSL shader 生成共享虹彩纹理。消行前捕获原始方块位置，使用 `subdivideGeometryTriangles` 和 `separateGeometryTriangles` 将每块拆成 48 个三角形，旋转、散开、受重力下落并缩小消失。碎片按方块批量绘制，最多复用四行的绘制实体；暂停冻结动画，新局清除碎片。

按钮与信息面板使用 GPU shader 绘制流动虹彩边缘、柔光和深色玻璃底纹；悬停与按压改变亮度。棋盘使用单个网格绘制发光格线、双侧导光轨和扫描光带，消行时底盘和面板会同步闪亮，暂停时所有 shader 时钟冻结。

音效由 Web Audio 实时合成，包括按钮、清脆落地音，以及四套消除乐句：单行水晶短音、双行上扬双音、三行快速三连音、四行琶音加庆祝和弦。首次按键或点击解锁音频，右下角可静音。所有音源有限时长且总数受限，离开页面时释放音频和 GPU 资源。

操作：方向键 / WASD 移动旋转，Space 直落，P 暂停。

验证：

```powershell
npm run typecheck
npm test
npm run build:target -- game:tetris
node games/tetris/verify-browser.mjs
node games/tetris/verify-browser.mjs --portrait
```

浏览器验证需要本机 Chrome 和 WebGPU，复用仓库的 Chrome fixture runner。`?verify=1` 才开放确定性棋盘夹具；截图和验证结果写入 `artifacts/tetris/`。
