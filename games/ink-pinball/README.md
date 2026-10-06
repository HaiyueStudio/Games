# 墨游 · 龙鲤 / Ink Pinball

独立的水墨弹球游戏，保存槽 `ink-pinball`。宣纸山水、云龙与双鲤背景，以及透明莲花和黑墨 UI 笔触，使用内置 imagegen 生成；原始提示词保存在 `assets/provenance.json`。

## 运行

```sh
npm run build:target -- game:ink-pinball
python3 -m http.server 8088 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8088/games/ink-pinball/`。需要支持 WebGPU 的浏览器。

A / ←、D / → 控制左右挡板；S / ↓ 按住蓄力、松开发球；W / ↑ / 空格快速发球。P / Esc 暂停，R 重开。移动设备使用下方触控按钮。

莲花碰撞获得分数，连续命中最多五倍；集齐「山、水、龙」获得 1500 额外分。每局三球，左右狭窄区域保留自动救球弹簧。

## 架构

- Haiyue World、Camera2D、Mesh2D、Physics2DSystem；固定 120 Hz 的真实刚体与旋转关节挡板。
- 复用纸上弹球的纯规则、输入和救球组件，原游戏与其存档不变。新游戏有自己的渲染、布局、素材、记录槽和验证入口。
- `InkEffects.ts` 通过公开 experimental RenderIntegration 与 extension-authoring 提交 WGSL。同一 GPUDevice 绘制墨球/拖尾和独立透明 UI surface。
- UI 直接采样生成笔触的 alpha；多方向采样、连续 FBM 噪声位移和淡墨扩散形成晕染边缘。中心保持高不透明度，文本用可访问 HTML 叠加。
- `inkTrail.ts` 使用模拟时间记录轨迹，最多 180 段，1.45 秒内逐渐扩散消散；停球不画线，瞬移不跨图连线，暂停冻结，重开清空。GPU buffers 复用，销毁时释放纹理、buffers 和 UI context。

## 验证

```sh
npm run typecheck
node --experimental-strip-types --test games/test/ink-pinball-trail.test.mjs games/test/pinball-rules.test.mjs games/test/pinball-springs.test.mjs
npm run build:target -- game:ink-pinball
node scripts/verify-ink-pinball.mjs
```

浏览器验证覆盖桌面/移动布局、发球、挡板真实回弹、莲花计分、三球结束、重开、失焦、两侧静止/慢速/快速卡球复现、墨迹资源上限、shader 渲染和素材加载。截图与含源文件/素材指纹的结果保存于 `.artifacts/ink-pinball/`。
