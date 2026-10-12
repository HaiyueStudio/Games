# 地图工坊 API v1

编辑器初始化后提供 `window.valleyEditor`，并发送 `valley-editor-ready` 事件。无需 `?verify=1`。这是当前页面内的建图 API，没有开放网络写入服务，也不需要访问引擎、Editor 或游戏的私有字段。

## 通过 API 搭建第二关

在编辑器页面的浏览器控制台、同源自动化或自己的编辑器扩展中调用：

```js
const api = window.valleyEditor;
const recipe = await fetch('./recipes/chapter-two.commands.json').then(r => r.json());
recipe.expectedRevision = api.status().revision;
api.validate(recipe); // 只校验，不改地图
api.apply(recipe);    // 整批创建，单次撤销
api.fit();
api.play(true);       // 进入试玩
```

这会替换当前地图，可以停止试玩后调用 `api.undo()` 还原。也可使用工具栏「API 建图」→「填入第二关建图命令」→「只校验」→「应用整批命令」。文本框只接收 JSON 数据，不运行粘贴的 JavaScript。

左侧示例「第二关 · 旋庭（API 搭建）」及 `?demo=chapter-two` 都执行同一套批量 API。生成的标准构件仍能在层级和属性中修改。

- `recipes/chapter-two.ts`：原始参数化建图脚本。
- `recipes/chapter-two.commands.json`：展开后的命令文件。
- `../../games/valley-of-light/maps/chapter-two-garden.json`：可直接导入游戏的精简地图。

该关依据参考截图重建三座金顶亭、庭院、圆塔、花木和双层转桥。截图不可见的连接和机关顺序经过重新设计，并非原版关卡的完整数据复刻。通关流程：入口爬梯 → 手轮转 90°，接通下层东岸与南岸 → 踩西侧开关 → 爬上西亭 → 手轮反转 90°，接通上层西岸与北岸 → 前往后方金亭。角度可整周累加；入口与西亭设有检查点。

## 方法

| 方法 | 结果／用途 |
| --- | --- |
| `status()` | API 版本、文档 revision、地图 ID、可编辑状态、选中 ID、能否撤销／重做 |
| `catalog()` | 标准构件编号与名称，与地图目录 v1 一致 |
| `read()` | 完整地图副本；修改副本不影响编辑器 |
| `validate(batch)` | 校验命令及最终地图，返回物体数、组数、试玩问题；无副作用 |
| `apply(batch)` | 提交一个文档事务，成功后返回 status；无变化不产生撤销项 |
| `select(ids)` | 选中已有节点 |
| `undo()` / `redo()` | 与编辑器共用撤销历史 |
| `exportJSON(compact = true)` | 返回精简／完整地图字符串，不自动下载或改变“已保存”状态 |
| `fit()` | 当前视角适应整张地图 |
| `play(enabled = true)` | 开始／停止试玩；开始前检查地图可玩配置 |
| `runtime()` | 当前角色位置、路线状态、通关状态和逻辑状态的只读副本；未试玩返回 null |

试玩或拖拽期间拒绝编辑修改；读取、校验、导出仍可使用。后台制作工具可从 `src/api-entry.ts` 导入 `ValleyAuthoring`、`createValleyEditorApi`，使用相同校验与撤销实现；无渲染宿主时不支持 `play()`。

## 批量命令

```js
api.apply({
  apiVersion: 1,
  label: '生成高架道路',
  expectedRevision: api.status().revision,
  commands: [
    {op: 'group.create', group: {id: 'bridge', name: '高架桥', position: [0, 3, 0]}},
    {op: 'object.create', object: {id: 'road-a', type: 1, groupId: 'bridge', position: [0, 0, 0]}},
    {op: 'object.create', object: {id: 'road-b', type: 1, groupId: 'bridge', position: [1, 0, 0]}},
    {op: 'object.update', id: 'road-b', patch: {colors: {surface: '#e2dfb4'}}}
  ]
});
```

每批 1～1000 条命令，JSON 文本上限 2 MB；最终地图不超过 500 个构件、100 个父节点。`label` 是撤销历史名称。可选 `expectedRevision` 用于拒绝过期提交，避免脚本覆盖另一轮修改。命令先在副本执行，最终校验通过才更新场景、层级和撤销历史；任意错误都保留当前地图。

| `op` | 参数 | 说明 |
| --- | --- | --- |
| `map.create` | `id`, `name` | 清空并创建新地图；只能作为首条命令 |
| `map.configure` | `settings` | 设置 id/name、appearance、logic、story、stages、opticalLinks；这些字段整体替换 |
| `object.create` | `object: {id,type,...参数}` | 从标准编号默认值创建，其余参数可省略 |
| `object.update` | `id`, `patch` | 修改已有物体，不能改 ID 和类型 |
| `group.create` | `group: {id,name,...参数}` | pivot 默认 `[0,0,0]`；支持 parentId、position、rotation、scale、platform |
| `group.update` | `id`, `patch` | 修改已有父节点的名称、变换或平台配置 |
| `nodes.reparent` | `ids`, `parentId` | 保持世界姿态换父节点；null 为地图根节点 |
| `nodes.remove` | `ids` | 删除子树和附着物，并清理依赖引用 |
| `marker.set` | `id`, `kind`, `face?` | kind 为 spawn/exit/null；face 默认 0，设置出生会清除原出生记号 |
| `portal.bind` | `id`, `pathId`, `face?` | 绑定已有传送门；目的地通过 object.update 的 portal.targetId 设置 |

坐标使用地图本地坐标约定；普通立方体 `position` 是顶面中心，厚度向局部负 Y 延伸。旋转为角度，父节点及实际导航规则与手工编辑一致。新建不自动套用当前选中组或鼠标吸附，请直接提供 `groupId`。换父节点需保持世界姿态时使用 `nodes.reparent`。

物体 `colors`、`motion`、`water`、`trigger`、`portal`、`state`、`marker`、`checkpoint` 的 patch 按子字段合并；其他数组和字段整体替换。动作列表、台词、条件树请提交完整新列表。手轮 `motion.targetGroup` 可引用同批创建的组，最终统一校验引用；绑定门、设记号、修改、删除及换父节点的目标需在该命令前创建。未知命令、拼错参数、重复 ID、无效坐标和悬空引用会报错。API 允许刻意重叠构件，以支持拱门、窗饰和复合建筑。

完整字段约束见 [地图协议](../../games/valley-of-light/map/FORMAT.md) 和地图 JSON Schema。`appearance` 支持 `background: '#rrggbb'` 和可选 `ambientIntensity: 0..4`；未设置时保持原浅绿背景和 0.85 环境亮度。编辑器与独立游戏共用配置。

## 重生成与验证

在 Games 根目录执行：

```powershell
node tools/valley-editor/test/build.mjs
node tools/valley-editor/generate-chapter-two.mjs
node --test tools/valley-editor/test/api.test.mjs
npm run build:valley-editor
npm run build:target -- game:valley-of-light
node tools/valley-editor/verify-api-chapter-two.mjs
```

浏览器验证使用新实例，实际调用公开 API 建图、撤销重做，再通过鼠标攀梯与两次转轮通关，并检查独立游戏，不操作已有编辑页面的未保存地图。
