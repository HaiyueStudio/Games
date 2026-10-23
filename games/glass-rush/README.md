# 玻璃疾驰 / Glass Rush

使用 Haiyue Engine 公共接口的隧道生存游戏。方向键或持续按住左 / 右半屏旋转；空格开始或暂停，P / Escape 暂停。前三次碰撞留下裂纹，第四次碰撞碎裂。速度随生存时间持续增加。

WGSL 绘制弯曲的十二边形霓虹隧道、旋转障碍、玻璃 Fresnel 高光和碎片。HUD、开始 / 暂停按钮、结算及 TOP 5 全部由引擎 GuiSystem 绘制。排行榜通过引擎 GameSaveService 保存于当前浏览器，不是联网榜单。

规则与渲染分离；支持 `?seed=42&verify` 的确定性场景和 `window.__glassRush` 只读快照。固定上限障碍缓冲区，页面离开时释放输入和 GPU 资源。

`npm run build:target -- game:glass-rush` 后通过 HTTP 打开 `games/glass-rush/index.html`。需要 WebGPU。

验证：`node scripts/verify-glass-rush.mjs --full` 检查实际 WebGPU 渲染、方向键长按、真实触摸、暂停、第四次碰撞结算和重开；`--portrait` 检查 390 × 844 手机布局。截图与浏览器诊断保存在 `.artifacts/glass-rush/`。规则测试为 `games/test/glass-rush.test.mjs`。
