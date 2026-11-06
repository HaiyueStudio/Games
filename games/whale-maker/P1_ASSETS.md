# P1 素材与生成来源

本轮复杂角色均使用**内置 image_gen**，限流后继续重试，未使用 CLI 或 API 备用方案。五次成功调用的完整提示词、源文件 ID 和参考图保存在 [assets/p1-prompts.json](assets/p1-prompts.json)。原图复制到本项目，不依赖用户目录才能运行。

| 素材 | 原图 | 运行时 | 内容 |
| --- | --- | --- | --- |
| 核心新敌人 | `assets/p1-creatures.png` | `assets/runtime/p1-creatures.png`，576×576 | 8×8，单帧 72；蚁、尖刺蚁、鼠、尖刺鼠、骷髅龟、鱼骨、花、火焰兄弟各 8 帧 |
| 三套服装 | `assets/p1-costumes.png`、修订 `assets/p1-costumes-v2.png` | `assets/runtime/p1-costumes.png`，896×672 | 8×6，单帧 112；猫、回旋镖、建造锤各 16 帧；修订去掉爬墙木板和手持木箱，空手由游戏叠加实物 |
| 投球怪与雪仙人球 | `assets/p1-special.png` | `assets/runtime/p1-special.png`，768×192 | 8×2，单帧 96；投球怪步行／举球／抛球／收手，雪仙人球三层／两层／头部 |
| 补充动作 | `assets/p1-actions.png` | `assets/runtime/p1-actions.png`，1344×1024 | 8×8，变宽帧；小型／长高／火／冰／猫／回旋镖／锤各一行：翻滚四帧、远跳、蓄力、横向穿管两帧；末行完整回旋镖角色的投掷／接回帧 |
| 简单机关图标 | `assets/p1-icons.svg` | 直接加载 SVG 并提取 30 帧 | 延续已有 `desert-icons.svg` 的原生图标方式，程序编辑的砖、箭头、平台、铃铛、锤、回旋镖、翅膀、降落伞及短攻击特效 |

服装原图未删除，运行图移除已被补充动作替代的最后两行。原服装生成中一张回旋镖攻击格误画为独立弹丸；游戏攻击改用新动作图集最后一行的完整人物，不采样该误帧。

`scripts/pack-p1-assets.py` 只做确定性分格、alpha 边界测量、等比缩小、透明补边和脚底对齐，不绘制或替换角色像素。每套服装 16 帧、每行敌人／补充动作 8 帧共用缩放基准，蹲下或滚动不会单独放大身体。补充动作按完整连通轮廓取样，避免原图少量跨格画出的头尾被裁掉；每行以首帧保持人物比例，为横向远跳和穿管分配更宽的 UV，不因轮廓变宽把整个人缩小。运行帧 UV 写入 `assets/runtime/frames.json`，对应 `.provenance.json` 记录生成源、源网格、运行网格和尺寸。

`scripts/build-p1-icons.mjs` 是机械图标的可编辑源，普通渲染与 GUI 图标共用。连续地形图标另裁去外圈透明留白，输送带用循环滚子动画，树干按高度绘制而不纵向拉伸树冠。人物、敌人、管道、路线、特效均由普通 2D 渲染；GUI 只承担界面。

复现打包：在 Games 根目录运行 `python games/whale-maker/scripts/pack-p1-assets.py`；重新生成机械 SVG 用 `node games/whale-maker/scripts/build-p1-icons.mjs`。已有项目原图齐全时不需要访问内置生成目录。manifest 仅包含运行 PNG、SVG 与来源记录，大尺寸源图不进入游戏加载清单。
