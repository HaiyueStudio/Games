# Haiyue MUGEN Fight 与角色动画查看器

`index.html` 是 M08/G08 的本地双人对战入口。选人列表来自 `charactors/catalog.json`，当前接入 Elecbyte 官方的 Kung Fu Man 与 Kung Fu Man 720；两名玩家可以任意互换，但同一局不能选择相同角色。原 G05 只读查看器保留在 `charactorPreview.html`；它打开本地角色目录，在专用 Worker 中解析 DEF、SFF/ACT 与 AIR，素材不会上传、缓存或自动保存。

角色的 DEF/SFF/AIR/SND/CMD/CNS 会经过同一正式导入链路。内置 KFM 与 KFM720 现在执行各自角色包的 37 条 CMD 命令和角色 StateDef；DEF 声明的 `common1.cns` 只补齐角色没有覆盖的公共状态。同编号 StateDef 以角色文件为准，公共文件的 controller 不会混入角色覆盖状态。`game/g08-runtime-adapter.cmd` 仍保留为可显式选择的 `adapter-v1` 兼容 profile，但产品目录不会在角色脚本失败时静默替换它。

## 使用

1. 在 `Games` 目录运行 `npm run dev`，从预览页打开 `mugen`；也可以运行 `npm run build:target -- game:mugen` 构建独立目标。默认进入双人对战，页面右上角可进入角色动画查看器。
2. 玩家一默认用 `W/A/S/D` 控制方向，`U/I/J/K` 是四个攻击键；玩家二默认用方向键控制方向，小键盘 `4/5/1/2` 是四个攻击键。
3. 点击“按键设置”后，先点需要修改的动作，再按新按键。玩家内部发生按键冲突时会交换两个动作的按键；“保存并应用”会写入浏览器本地设置并立即重开当前对局，“恢复默认”可恢复上述布局。
4. 查看器中使用“选择角色目录”或 Chromium 的“打开目录”。目录应至少包含角色入口 `.def` 及其引用的 `.sff`、`.air`，`.act` 可选。
5. 如果根目录存在多个 `.def`，先选择正确入口。成功后左侧显示 action catalog 与素材数量，中间播放动画，右侧检查当前 element、变换、palette、碰撞框和导入诊断。
6. 时间轴与逐 tick/element 控件遵循 60 tick/s；`time = -1` 显示为无限末帧，循环动作的时间轴显示循环内 tick。拖动画布平移，滚轮缩放。

测试夹具位于 `games/mugen/fixtures/g05-viewer-v1`，由仓库自有的 MIT 生成器创建，不含第三方角色素材。`charactors/kfm` 与 `charactors/kfm720` 是本地体验内容，不属于 Haiyue 自制测试夹具，不能替代可进入 CI/正式发布物的许可素材。给 URL 添加 `?verify=1` 会显示设备丢失验证按钮，仅用于本地浏览器验收。

## 架构边界

- `import/vfs`：相对路径只读 VFS、大小写冲突和文件/字节预算。
- `import/text`：DEF 入口、依赖图与带源位置诊断。
- `import/sff`、`import/air`：SFF v1/v2、ACT、AIR 的有界解析和确定性 package contribution。
- `import/worker`：可取消、latest-wins、transferable 的导入协议；主线程不解析或哈希角色内容。
- `viewer`：Node 可测的 catalog/播放模型，以及只依赖公开 `@haiyue/extensions/experimental/indexed-sprite` 的 WebGPU 视图。
- `runtime/input`：G07 的双玩家 60 Hz 输入、朝向方向、有限历史与 replay recorder。
- `runtime/match`：G08-A 的纯数据双角色比赛状态；tick 事务输出不可变 snapshot、稳定事件序列和 state/event/trace hash，不读取 DOM、WebGPU 或 audio。
- `import/cmd`、`import/cns`、`import/script`：opt-in `g08-minimal` 兼容 profile 与 `m09-native-common` 原生角色 profile；把 CMD/CNS/common state 编译为可打包 typed IR，超出 allowlist 的语法会精确失败。
- `runtime/script`：无 `eval` 的 command matcher 与状态控制器 VM；只消费 G07 tick history，并只通过 G08-A mutation API 修改权威状态。角色 constants、localcoord、Pause/SuperPause 与 RemapPal 都进入确定性 snapshot/output authority。
- `runtime/combat`：G08-C 的 AIR Clsn push/hit/guard/hitpause/damage/power/KO authority。
- `game/MugenGameFixture.ts`：读取 `charactors/catalog.json`，逐个导入本地角色包，并将每个角色的 `localcoord` 归一化到同一战斗空间。
- `game/MugenKeyBindings.ts`：版本化默认布局、改键冲突交换、浏览器本地持久化，以及键盘/Gamepad 到 G07 输入的映射。
- `game` + `main.ts`：浏览器 adapter，装载选中角色、驱动 60 Hz simulation、将 snapshot 映射到双角色 WebGPU 与 HUD；不反向修改规则状态。

运行 G05 聚焦验证：

```powershell
npx tsc -p games/mugen/tsconfig.g05.json --noEmit
node --test games/test/mugen-viewer-g05.test.mjs
npm run build:target -- game:mugen
```

完整输入边界与 Worker 生命周期仍由 `mugen-import-g02.test.mjs` 覆盖；SFF/ACT 与 AIR 的格式矩阵分别由 G03、G04 测试覆盖。

官方角色原生脚本、common-state 覆盖、选人、坐标归一化和改键验证：

```powershell
node --experimental-strip-types --test games/test/mugen-official-selection-input.test.mjs
node --experimental-strip-types --test games/test/mugen-native-common-g07c.test.mjs
```

G08-A 无界面比赛状态验证：

```powershell
node --test games/test/mugen-match-g08a.test.mjs
```

G08-B CMD/CNS 编译与动作 trace 验证：

```powershell
node --test games/test/mugen-script-g08b.test.mjs
```

该数据模型拥有位置、速度、面对方向、生命、能量、state/action、state metadata、脚本变量、回合阶段、随机状态和事件顺序。G08-B/C 已实现最小 CMD/CNS 决策、移动、碰撞、HitDef、伤害与 hitpause；G08-D 页面只消费 snapshot/events 并提供展示与输入 adapter。
