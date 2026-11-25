# 地图包编辑与跳关

顶部「地图包 / 选关」现在包含初代 32 关、鲸屿冒险、机关试验，以及日版二代 **Super Mario Bros. 2 / The Lost Levels** 的 52 关（1–9、A–D 世界，各四关）。二代不是美国版 SMB2。额外世界直接开放选关，使用鲸鱼娘、现有素材和本游戏的动作规则。

## 编辑整包

先「载入编辑」，再打开地图包面板，可新建／复制包、修改名称、新增／复制／删除关卡、调整关卡顺序、切换顺序闯关，以及保存、导出和导入整个地图包。关卡较多时分页显示，每页 32 关；地图包列表也支持分页。

切关前自动将当前主、副区域的编辑内容保留在内存。点击「保存地图包」写入本地存档；顶部「保存」写入统一文档会话，明确记录独立单关或地图包关卡；「读取」先准备目标再一次提交，失败保留当前编辑稿。旧版单关和地图包存档可迁移。整包文件扩展名为 `.whale-pack.json`，单关 JSON 导入导出仍保留。内置包作为蓝图，修改和自制包保存在 `whale-maker-packs` 文档槽中，采用版本化 RLE 压缩和未改内置关引用；旧 `whale-maker` 单关槽只用于兼容读取。

每关有稳定的 ID，改名、重排不会改变跳关目的地。复制地图包时，同包内的连接自动改指向副本。删除关卡会清除指向它的已编辑连接；无效目的地、重复 ID 或损坏关卡会阻止整包导入／保存。

## 设置跨关出口

在编辑器中选择管道、门、P 门、上锁门、传送箱或上锁传送箱，点击顶部「设置出口跳关」，在地图包面板选择目的地，再点击「使用此关」。可以跨地图包，也可以回到先前关卡。多选出口时统一设置；「清除跳关」恢复为普通出口，可以重新配置原有的同关连接。

没有选中这些出口时，顶部按钮为「设置终点后续关」，指定通关后的目标。未设置显式目标的顺序地图包，按当前排序进入下一关；最后一关显示整包完成。显式目标优先于顺序推进。

管道仍按管口方向进入，门按上键，传送箱接触触发；P 门需要 P 开关生效，上锁出口消耗一把钥匙。传送使用现有进管动画，跨关保留金币、得分、生命、死亡次数及各玩家形态；新关使用自己的机关状态、计时和通关条件。协作模式中任意玩家进入跨关出口，整队进入新关；终点通关仍等待所有玩家完成。

## 一代跳关区

- 1-2：走天花板的隐藏路线进入跳关地带，三根管道从左至右前往 4-1、3-1、2-1。原本的普通出口和金币房间保持可用。
- 4-2：地下跳关区前往 5-1；藤蔓高处的跳关区从左至右前往 8-1、7-1、6-1。

## 日版二代数据

使用公开的 [SMB2J 反汇编工程](https://github.com/threecreepio/smb2j-disassembly) 的区域、敌人、地形和传送坐标表转换。主文件为 [sm2main.asm](https://github.com/threecreepio/smb2j-disassembly/blob/master/sm2main.asm)，后续世界来自 [sm2data2.asm](https://github.com/threecreepio/smb2j-disassembly/blob/master/sm2data2.asm)、[sm2data3.asm](https://github.com/threecreepio/smb2j-disassembly/blob/master/sm2data3.asm)、[sm2data4.asm](https://github.com/threecreepio/smb2j-disassembly/blob/master/sm2data4.asm)。文件内容校验记录在 `levels/lost-levels-provenance.json`，运行时不执行这些源程序，也不读取 ROM、原版图片或音乐。

转换包括地面、砖组、奖励块／隐藏块、管道／水下／藤蔓副区域、敌人、平台、弹簧、火棍、熔岩、首领吊桥和旗杆，以及前进／后退的跳关出口。新增紫色「毒珍珠」对应毒蘑菇，会下落、滚动并造成普通伤害，也能在编辑器中放置或设为容器内容。

这是关卡路线改编：保留本游戏的 3D 世界动作和鲸屿机关物理，未模拟二代马里奥／路易吉的独立参数和额外世界解锁流程。奖励砖使用现有容器外观，藤蔓直接显示为可攀爬通路；源风场使用现有恒风，循环城堡按有限路线游玩。源平台、敌人和首领使用最接近的现有鲸屿类型。

开发数据是普通格子数组；生成文件使用游程压缩，选择关卡时才展开并缓存蓝图。重新抓取并转换：

```powershell
node games/whale-maker/scripts/convert-classic.mjs --fetch
node games/whale-maker/scripts/convert-lost-levels.mjs --fetch
```

不带 `--fetch` 时使用 `artifacts/whale-classic-reference` 和 `artifacts/whale-smb2-reference` 的本地缓存。

初代坐标脚本仅按字面量数据解析，下载的 JavaScript 不会被执行。抓取或使用缓存前均比对已提交的 `reference-provenance.json` 中的 SHA-256；上游内容改变时转换会停止，需要先检查源差异并明确更新已审核哈希，再重新转换。

## 验证

规则测试覆盖全部内置关卡校验、起点、可达终点、稳定 ID、整包往返、重排／复制／删除后的连接、非法导入、协作跨关、P／锁门限制和毒珍珠伤害。

```powershell
node --test games/test/whale-maker-classic.test.mjs
npm run typecheck
npm test
npm run build:target -- game:whale-maker
node games/whale-maker/verify-map-packs-browser.mjs
```

浏览器脚本在构建后运行，覆盖实际 Engine GUI 分页、新建包、出口目的地选择、本地存档恢复、跨包进管、进度继承，以及一代最终城堡。截图输出到 `artifacts/whale-map-packs/`。
