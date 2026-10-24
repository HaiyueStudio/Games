# 玻璃疾驰 / Glass Rush

使用 Haiyue Engine 公共接口的隧道生存游戏。方向键或持续按住左 / 右半屏旋转，左右输入已按屏幕方向统一修正；空格开始或暂停，P / Escape 暂停。前三次碰撞留下裂纹，第四次碰撞碎裂。速度随生存时间持续增加。

WGSL 绘制弯曲的晶体隧道，包含青紫霓虹光轨、螺旋光带、流动脉冲、纵深雾和碰撞冲击波。障碍包含弧形、对向双叶、三齿冠和双菱晶，使用连续流动的虹彩薄膜、干涉色与玻璃高光，完整表面弱化三角网格。球体也采用随表面法线和时间变化的炫彩 shader，保留高光和受损裂纹。渲染和碰撞共享各形状的角度范围，形状间的空隙可以穿过。

球体和障碍都通过引擎公共接口 `separateGeometryTriangles` 拆分为独立三角形。球体有 624 个非退化三角碎片；前三次撞击产生裂纹并击碎障碍，第四次球体也会炸裂。顶点 shader 按三角形质心计算旋转、冲量飞散、重力、缩小和淡出，碎片沿负 Z 加速飞向镜头，透视放大后越过近裁面消退。障碍碎片朝镜头的三维位置加速飞出，叠加宽范围的横纵向随机散射，形成逐渐放大、掠过镜头的效果。障碍碎片最长持续 1.8 秒，球体碎片最长持续 3 秒；暂停冻结动画，结束后动画继续，重开清空上一轮效果。GPU 网格按障碍缓存，离场或碎片到期后销毁，最多保留 32 个障碍和 8 次撞击。

背景音乐为原创合成的 128 BPM、八小节、15 秒无缝立体声电子循环，包含四拍底鼓、军鼓、十六分镲片、贝斯、琶音和侧链铺底。普通撞碎与最终球体碎裂分别使用两种玻璃共振和碎屑音效。点击开始后解锁音频，暂停冻结播放位置；结束停止音乐并保留最后一次碎裂声，重开和退出清理声音。顶部声音按钮或 M 键可以静音。采用引擎公共实验音频接口 `OwnerSafeAudioMixer` 和会话音频管理，最多五个声部。音频无需外部采样，通过 `node scripts/generate-glass-rush-audio.mjs` 确定性重建，波形和哈希记录在 `assets/audio/generation.json`。

HUD、开始 / 暂停按钮、结算及 TOP 5 全部由引擎 GuiSystem 绘制。排行榜通过引擎 GameSaveService 保存于当前浏览器，不是联网榜单。

规则与渲染分离；支持 `?seed=42&verify` 的确定性场景和 `window.__glassRush` 只读快照。固定上限障碍缓冲区，页面离开时释放输入和 GPU 资源。

`npm run build:target -- game:glass-rush` 后通过 HTTP 打开 `games/glass-rush/index.html`。需要 WebGPU。

`node scripts/verify-glass-rush.mjs --scene=impact-camera` 固定在障碍撞碎后 0.55 秒，对比 `--scene=impact` 的初期画面，检查碎片朝镜头飞近后的透视放大，可叠加 `--portrait` 检查竖屏。

验证：`node scripts/verify-glass-rush.mjs --full` 检查实际 WebGPU 渲染、键盘与触摸方向、音乐启动、暂停恢复、静音、四次碎裂音效、结算、碎片消退和重开；`--portrait` 检查 390 × 844 手机布局。音频 HTTP 字节长度与哈希也会对照生成记录验证。`--scene=tunnel`、`--scene=impact`、`--scene=shatter`、`--scene=shatter-near` 捕获固定时间、固定障碍的视觉场景，可与 `--portrait` 组合，后两个场景对比碎片接近镜头前后的透视。这些场景仅通过 `?verify&scene=…` 启用，不播放声音或写入排行榜。截图与浏览器诊断保存在 `.artifacts/glass-rush/`，人工查看后可用 `--update-thumbnail` 更新游戏缩略图。规则和音频测试为 `games/test/glass-rush*.test.mjs`。
