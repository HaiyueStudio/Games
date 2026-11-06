# P2 素材与生成来源

复杂装备、敌人与首领使用 **内置 image_gen**，没有使用 CLI 或 API 备用方案。源 PNG、完整提示词及生成 ID 均保存在本项目 `assets/`；运行时不依赖用户临时目录。

| 图集 | 源布局 | 运行图尺寸 | 内容 |
| --- | --- | --- | --- |
| `p2-wearables.png` | 8×5，40 帧 | 768×480，格上限 96 | 鲸炮、旋桨、咕嘎伪装、鲸弹与红脉冲五类独立头部装备；待机、蓄力、暴露与触发帧 |
| `p2-enemies.png` | 8×8，64 帧 | 640×640，格上限 80 | 蜜蜂、弹簧怪、环绕幽灵、推人企鹅、巨型食人鱼、岩浆龙、魔法龟、正常／损坏龟壳车 |
| `p2-bosses.png` | 8×6，48 源帧 | 1024×768，格上限 128 | 珊瑚拳王、珍珠幻忍、猫鲸龙王，各十六源帧，含移动／攻击／防护／受伤／倒下 |
| `p2-bills-cutout.png` | 4×4，16 帧 | `runtime/p2-bills.png`，448×448，格上限 112 | 追踪、巨大、猫炮弹和绿色生命珍珠，各四帧 |
| `p2-icons.svg` | 15 帧 | 直接加载 SVG | 节拍砖实体／虚体、坠落圈砖、冰柱、四帧风场、镜头路线／停止区、10／30／50 金币、飞镖和魔法 |

炮弹图集保留初始 `p2-bills.png` 和内置编辑后的 `p2-bills-cutout.png`。两者实际文件均包含 alpha，最终打包采用修订图，并检查透明角落及帧间空隙。装备仅生成独立头饰，身体复用现有八种形态，不需要为每种身体重复保存整个人物图集。

首领源第 43 帧生成了独立火焰特效，未包含完整角色；运行时丢弃该帧，状态机不会采样它，喷火使用现有独立弹丸。源图仍保留，来源文件记录了舍弃原因。

完整提示词与来源：

- [五类装备](assets/p2-wearables.provenance.json)
- [敌人与车辆](assets/p2-enemies.provenance.json)
- [三类首领](assets/p2-bosses.provenance.json)
- [炮弹与生命珍珠](assets/p2-bills.provenance.json)
- [炮弹图集透明背景编辑](assets/p2-bills-cutout.provenance.json)

`scripts/pack-p2-assets.py` 通过完整连通轮廓测量取样，不用固定网格边线切掉头、尾或脚。它只做原图裁切、按动画家族统一比例缩小、透明补边和脚底对齐；不重画角色像素。最终 UV 写入 `assets/runtime/frames.json`，以实际轮廓大小提取 GPU 帧，避免大量透明留白造成视觉体积过小。大源图不列入运行加载清单。

简单机械图标延续项目已有的原生 SVG 工作流，可编辑源为 `scripts/build-p2-icons.mjs`。运行与 GUI 调色板共享素材，风场／机关状态在普通 2D 通道绘制。

在 Games 根目录可复现打包：

```powershell
python games/whale-maker/scripts/pack-p2-assets.py
node games/whale-maker/scripts/build-p2-icons.mjs
```

验证截图在 `artifacts/whale-maker-p2/`，覆盖十四张示范、五类穿戴叠加、车辆跳跃、三类首领受击与进城、机关显隐以及编辑器区域入口预览。
