import {prepareDocument,saveDocument,isDocumentSave,validDocumentSave,type DocumentIdentity,type CompatibleDocumentSave} from './document-session';
import {indexEditorLevel,editorVisibleCells,type EditorIndex} from '../editor/query';
import { MapPackPanel } from './map-pack-panel';
import { MapPackLibrary } from '../editor/map-pack-library';
import { COURSE_PORTALS, cancelCourseTravel, type CourseDestination } from '../rules/course-travel';
import { MAP_PACK_CHARS } from '../rules/map-packs';
import { loadArtwork, loadImage } from './artwork';
import {PLAYER_FORMS} from '../rules/player-body';
import {P2_DEMOS,P2_HELP} from '../rules/p2-levels';
import { P1Editor, P1_EDITOR_CHARS, movePathNode } from '../editor/p1';
import { P2_TOOLS, P2_NAMES } from '../rules/p2-schema';
import { emptySubArea } from '../editor/p2-settings';
import { inheritArea, changeArea } from '../rules/p2-areas';
import { cameraFor } from '../rules/p2-camera';
import { p2Art, drawP2Tile, drawP2Enemy, drawP2World, drawWearable, drawAreaEntryPreview } from '../rendering/p2';
import { elementFits } from '../editor/p1-geometry';
import { P1_TOOLS, P1_NAMES, CONTAINER_TILES, PATH_TILES } from '../rules/p1-schema';
import { P1_DEMOS, P1_HELP } from '../rules/p1-levels';
import { conditionProgress } from '../rules/p1';
import { drawP1,drawP1Player, drawP1Tile, drawP1Enemy, drawModifiers, drawP1Overlay } from '../rendering/p1';
import { Entity, World } from '@haiyue/engine';
import { GuiRoot, GuiSystem, GuiElement, GuiImage, GuiLabel, GuiButton, GuiDirtyFlags, type GuiRect } from '@haiyue/engine/gui';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { InputMap } from '@haiyue/engine/input';
import { GameEngine } from '../../session/GameEngine';
import { SingleSlotGameSave } from '../../save/SingleSlotGameSave';
import { gamepadFrames, installGamepad, isGamepadPointerMode } from '../../gamepad/runtime';
import {NeutralGate,type PadFrame} from '../../gamepad/sampler';
import {ACTIONS,defaultSettings,keyLabel,playerInput,validSettings,type Action,type CoopSettings} from './coop-controls';
import {COOP_CHARS,CoopSettingsPanel} from './coop-settings';
import {asPlayer,coopCamera,playerAt} from '../rules/coop-state';
import {drawPlayerNumber} from '../rendering/coop';
import {BUBBLE_RADIUS} from '../rules/coop-recovery';
import { configureCoop,create, validate, stepCoop, respawn, blockOffset, tile, TOOLS, NAMES, CONTENTS, CONTENT_NAMES, SHOT_DURATION, SHOT_WINDUP, type BlockContent, type Level, type State, type Tile, type Input } from '../rules/model';
import { objectCells, selectBox, clearCells, moveSelection, stampSelection, pasteStamp, type EditorTool, type Stamp } from '../editor/selection';
import { placePipe } from '../rules/levels';
import { isPipe, pipeShape, rotatePipe } from '../rules/pipes';
import { drawPipe, drawPipePlant } from '../rendering/pipes';
import { drawDesertBackground, drawQuicksand, drawCactus, drawSnowball, drawDesertEffects } from '../rendering/desert';
import { placeCactus } from '../rules/desert';
import { modernLevel, rulesFor, REFERENCE_RULES, LEGACY_RULES, elementOrigin } from '../rules/profile';
import { EXTRA_ENEMIES } from '../rules/catalog';
import { coinFrame, biteFlight, ENEMY_SIZE, checkpointFrame, flagWobble, checkpointRect } from '../rendering/poses';
import { centeredCamera } from '../rules/camera';
import {resizeLevelHeight} from '../editor/height';
import {drawSinkingEnemies,drawLavaSplashes} from '../rendering/lava';
import { playerArt } from '../rendering/player';
import { drawWorkshopTile, drawWorkshop, drawWorkshopEnemy, drawWorkshopEffect } from '../rendering/workshop';
import { editSnakeEnd, validSnakePath, DEFAULT_SNAKE_PATH } from '../rules/snake-path';
import { WhaleScene2D } from '../rendering/WhaleScene2D';
import { extraArt, enemyArt, drawExtraTile, drawItem } from '../rendering/expansion';
import { placeGlassPipe, upgradeGlassPipes, glassCells, editGlassEnd, DEFAULT_GLASS_PATH, isGlass } from '../rules/glass';
import { drawGlassRoutes } from '../rendering/glass';
import { placeCannon, cannonCells } from '../rules/advanced';
import { drawCannon, drawAnimatedEnemy, drawAdvancedTile, drawIronTurtle } from '../rendering/advanced';
import { placeStone } from '../rules/adventure';
import { drawFrozenEnemy, drawFrostEffects } from '../rendering/frost';
import { drawDust } from '../rendering/dust';
import { drawTerrain, isCoral, loadSlopeIcons } from '../rendering/terrain';
import { drawEnvironmentWind, tornadoPlanes } from '../rendering/wind';
import { drawClearFlag } from '../rendering/conditions';
import { courseBounds } from '../rules/course-bounds';
import { drawCourseEdge } from '../rendering/course-bounds';
import { drawCoinPops } from '../rendering/brick-reactions';
import { drawGoal,drawGoalLock } from '../rendering/goal';
import { PALETTE_CATEGORIES, categoryOf, categoryTools, categoryPages } from '../editor/catalog';
import { WhaleBrowserAudio } from '../audio/BrowserAudio';
import { WhaleAudio } from '../audio/WhaleAudio';
import { gameSession } from '../../session/SessionPause';
import { classicLevel, courseComplete, transferCourse, classicStageName } from '../rules/classic';
import { placeBoss } from '../rules/fortress';
import { drawFortressTile, drawFortress } from '../rendering/fortress';
import { backdropGround, setCell } from '../rules/terrain';
const W = 1280, H = 800, S = 48, VIEW = { x: 24, y: 148, w: 1232, h: 576 };
const EDIT_VIEW = { x: 210, y: 166, w: 828, h: 576 };
const COPY = '经典闯关首领吊桥鲸鱼铃铛熔岩月夜地窟龟堡蓄力喷火完成下一顺序平台循环音乐音效开关最层巨型砖块及路径道具装饰缩短延长远景背景海岸云朵珊瑚城堡远山原野平原震碎了火焰机关城红蓝机关炮塔发射高度金币冰冻结害羞幽灵铁壳龟可爱炮弹火球熔化砸地翻筋斗轻放蹬水总分旗杆滑下进入城堡坐进铁盆加跳跃可以跳出秘境隐藏钥匙上锁藤蔓攀爬方形石头闭眼生气冲撞往左往右下方完整空间获得开启跟在身后这扇需要一把顶起了方向↑↓←→快跑滑行玻璃横向纵向弹簧铁盆水域鱼鱿旋转火滚门出现消失路径尖刺斜坡滑梯无敌星连接编号长度转速固定伸缩添加移除配对页上一下一穿戴免疫伤害挡住头顶秒地面震飞通道机关试验海岸已启动时间结束需要先踩请给两扇设置相同个捧着蹲开心庆祝场景元素单选框选删除复制粘贴选择内容自动成长空方块选中对象个方块奖励敌人配置拖拽移动框选区域已粘贴位置超出地图再次点击地图粘贴取消物出现内无效组合工具内容设置点击宝物查看道具黑线接缝初见鲸屿任务失败正在穿过管道秘密金币区右侧管道返回海岸回到海岸继续前进顶宝物块获得成长珍珠发光管道上按下进入出口格式无效鲸屿制造珍珠海岸我的星海地图设置起点失败太大泡跳旋确认实验视窗游戏编辑器试玩返回编辑重新出发暂停继续角色鲸鱼娘金币成长火力普通剩余时间关卡保存读取导出导入清空撤销重做画笔橡皮擦起点终点检查点珊瑚地面贝壳砖宝物方块单向云台尖刺成长珍珠火珊瑚龟龟咕咕嘎嘎抵达星海受伤了小心敌人落入海中从重试已点亮格式无效请放置至少一个本地失败成功文件读取下载拖动绘制右键擦除滚轮平移移动普通跳旋转跳抱壳松开投掷泡泡快速下落反墙跳蓝鲸教学冒险按住收集探索体型变大现在能撞碎贝壳砖发射泡泡切换示范关卡第二新地图保留已保存未保存操作开始重置确认按键屏幕太窄请横屏游玩；，。·！：→←↑↓×★';
const TILE_ART: Partial<Record<Tile, number>> = { '#': 0, B: 1, '=': 3, '^': 4, E: 6 };
const CLASSIC_COPY='高级条件玩法主题海岸地下森林雪地沙漠城堡无收集金币击败敌人指定形态目标数量敌人形态管道规则旧图返程受困失败轮廓生成范围预览定位错误宽度深度高度长度沿路速度运动速度生成间隔范围数量上限弹丸安装方向巨大翅膀降落伞启动方式踩踏颜色绿红蓝黄掉落光滑惯性连接编号上一页下一页属性输入值批量无效当前规则校验通过数量必须新动作蓄力蹲跳翻滚远跳高旋转猫爪扑击建造冲刺普通火炮射器树半实体 规则基础扩展工具兼容计分计时解冻永久冻结封冻掉落无连击累计保留金币冰晶试验普通滑面抗性 沙漠金字塔流沙仙人球雪球叠层头部身体陷入过深跳跃高度减半吞没持续移动可以减慢下陷 顺时针°管口朝旋转后空间不足请先移开障碍管道方向已旋转 场景高度上限行先清除裁掉区域中的元素保持原有关卡已扩展最小行程加速带绿色蛇形砖木箱炸弹小怪投锤海獭光滑冰面开关路线长度格缩短刹车倍沿往返工坊冰花冰力冰弹冻住冻结碎裂跳跃火焰岩浆等待间隔秒融化准备进入下一关……速度平台横向纵向经典闯关完成首领吊桥鲸鱼铃铛熔岩月夜城堡地窟龟堡';
class WhaleMaker {
    private editRevision=0;
    private editorIndexCache:{level:Level;revision:number;index:EditorIndex}|undefined;
    private editorIndex():EditorIndex {
        const cached=this.editorIndexCache;if(cached?.level===this.level&&cached.revision===this.editRevision)return cached.index;
        const index=indexEditorLevel(this.level);this.editorIndexCache={level:this.level,revision:this.editRevision,index};return index;
    }
    editAreaId='main';
    areaRoot:Level|undefined;
    private editorContexts=new WeakMap<Level,{root:Level;id:string}>();
    readonly audioBackend=new WhaleBrowserAudio();
    readonly audio=new WhaleAudio(this.audioBackend);
    private removeAudioSession:(()=>void)|undefined;
    private background=false;
    musicButton!:GuiButton;
    effectsButton!:GuiButton;
    p1Editor!:P1Editor;
    p1DemoIndex=-1;
    p2DemoIndex=-1;
    p2Hud!:GuiLabel;
    pathDrag:null|{id:number;index:number;original:Level}=null;
    ruleButton!:GuiButton;
    scoreBanner!:GuiLabel;
    engine: GameEngine;
    world = new World('Whale Maker 2D');
    scene!: WhaleScene2D;
    ui = new GuiRoot();
    system!: GuiSystem;
    level = modernLevel(classicLevel());
    campaignActive=true;
    activePackId='classic';
    activeCourse=0;
    activeCourseId='1-1';
    readonly packLibrary=new MapPackLibrary();
    private documentIdentity:DocumentIdentity={kind:'course',pack:'classic',course:'1-1'};
    private readonly packSave=new SingleSlotGameSave<CompatibleDocumentSave>({gameId:'whale-maker-packs',name:'鲸屿制造文档',validateData:validDocumentSave});
    jumpButton!:GuiButton;
    packPanel!:MapPackPanel;
    state = create(this.level);
    controls=defaultSettings();
    private readonly controlSave=new SingleSlotGameSave<CoopSettings>({gameId:'whale-maker-controls',name:'鲸屿制造控制设置',validateData:validSettings});
    settingsPanel!:CoopSettingsPanel;
    private readonly mainUi=new GuiElement({pointerFilter:'ignore'});
    private readonly actionEdges=Array.from({length:4},()=>new Set<Action>());
    private readonly padGate=new NeutralGate();
    private lastPadCommands:PadFrame|undefined;
    editing = false;
    paused = false;
    selected: Tile = '#';
    editorTool: EditorTool = 'paint';
    selection = new Set<number>();
    drag: { start: [number, number]; end: [number, number] } | null = null;
    clipboard: Stamp | null = null;
    pastePending = false;
    inspector!: GuiLabel;
    contentHint!: GuiLabel;
    contentButtons: GuiButton[] = [];
    contentNodes: GuiElement[] = [];
    palettePage=0;
    paletteCategory=1;
    categoryButtons:GuiButton[]=[];
    contentPage=0;
    paletteNodes:{category:number;page:number;nodes:GuiElement[]}[]=[];
    contentPages:{page:number;nodes:GuiElement[]}[]=[];
    propertyNodes:{node:GuiElement;kinds:string[]}[]=[];
    propertyLabels:Record<string,GuiLabel>={};
    backdropNodes:GuiElement[]=[];
    selectionHints:GuiElement[]=[];
    mapHeightLabel!:GuiLabel;
    backdropButtons:{button:GuiButton;value:NonNullable<Level['backdrop']>}[]=[];
    paletteTitle!:GuiLabel;
    toolbarButtons: { button: GuiButton; tool: EditorTool }[] = [];
    private readonly fontSizes = new WeakMap<GuiElement, number>();
    camera = 0;
    editCamera = 0;
    selectedLevel = 5;
    editY = 4;
    cameraY = 4;
    setSpawn = false;
    saves = new SingleSlotGameSave<Level>({ gameId: 'whale-maker', name: '鲸屿制造关卡', validateData: (value: unknown): value is Level => { try {
            validate(value);
            return true;
        }
        catch {
            return false;
        } } });
    keys = new Set<string>();
    pendingJump = false;
    pendingSpin = false;
    pendingFire = false;
    pendingSpecial=false;
    pendingBuild=false;
    abort = new AbortController();
    resize!: ResizeObserver;
    disposed = false;
    accumulator = 0;
    pointer = false;
    erase = false;
    lastCell = -1;
    frames!: Record<string, number[][]>;
    history: Level[] = [];
    redo: Level[] = [];
    characters!: HTMLImageElement;
    terrain!: HTMLImageElement;
    expansion!: HTMLImageElement;
    coins!: HTMLImageElement;
    tokens!: HTMLImageElement;
    shell!: HTMLImageElement;
    checkpointArt!: HTMLImageElement;
    extraImages:Record<string,HTMLImageElement>={};
    hudCoin!: GuiImage;
    coinIcons: GuiImage[] = [];
    editTime = 0;
    status!: GuiLabel;
    hint!: GuiLabel;
    banner!: GuiLabel;
    mode!: GuiButton;
    pause!: GuiButton;
    toolButtons: GuiButton[] = [];
    editorNodes: GuiElement[] = [];
    private editorChrome:GuiElement[]=[];
    private contentChrome:GuiElement[]=[];
    notice = '';
    touch: Partial<Input> = {};
    private readonly placements = new WeakMap<GuiElement, GuiRect>();
    constructor(readonly canvas: HTMLCanvasElement) { this.engine = new GameEngine({ canvas, clearColor: { r: .055, g: .15, b: .21, a: 1 }, alphaMode: 'opaque', msaaSamples: 4, devicePixelRatio: () => Math.min(devicePixelRatio, 2) }); }
    rect(node: GuiElement, r: GuiRect) {
        let placement = this.placements.get(node);
        if (placement && placement.x === r.x && placement.y === r.y && placement.width === r.width && placement.height === r.height) return node;
        if (placement) Object.assign(placement, r);
        else {
            placement = { ...r };
            this.placements.set(node, placement);
            const designRect = placement;
            node.layout = parent => {
                const z = Math.min(parent.width / W, parent.height / H);
                Object.assign(node.rect, {
                    x: (parent.width - W * z) / 2 + designRect.x * z,
                    y: (parent.height - H * z) / 2 + designRect.y * z,
                    width: designRect.width * z, height: designRect.height * z,
                });
                if (node instanceof GuiLabel) node.setFontSize((this.fontSizes.get(node) ?? (node === this.hint ? 13 : 16)) * z);
            };
        }
        // Visual dirtiness alone repaints the old rect. Coordinate changes must
        // invalidate GuiRoot's cached layout before its next GPU submission.
        node.markDirty(GuiDirtyFlags.Layout | GuiDirtyFlags.Visual);
        return node;
    }
    label(text: string, x: number, y: number, width: number, height = 30) { const n = new GuiLabel({ text, style: { color: '#e6fbf8', padding: 4 }, fontSize: 16 }); this.ui.add(this.rect(n, { x, y, width, height })); return n; }
    button(text: string, x: number, y: number, width: number, fn: () => void) { const n = new GuiButton({ text, onClick:()=>{this.audio.click();fn();}, hoverTransition: true, style: { backgroundColor: '#173f50', hoverBackgroundColor: '#2d7180', color: '#e8fcf5', borderColor: '#56c7c7', radius: 12, padding: 4 } }); this.ui.add(this.rect(n, { x, y, width, height: y > 770 ? 24 : 36 })); return n; }
    highlight(button:GuiButton,selected:boolean,color='#a45575') {
        const backgroundColor=selected?color:'#173f50';
        if(button.style.backgroundColor!==backgroundColor)button.setStyle({backgroundColor});
    }
    async init() {
        const audioLoad=this.audioBackend.load(this.abort.signal);
        const savedLoad=Promise.allSettled([this.controlSave.load(),this.packSave.load(),this.saves.load()]);
        const {images,frames,sourceSizes}=await loadArtwork();
        const {characters,world,expansion,coins,tokens,shell,checkpoint,...extraImages}=images;
        this.characters=characters!;this.terrain=world!;this.expansion=expansion!;this.coins=coins!;
        this.tokens=tokens!;this.shell=shell!;this.checkpointArt=checkpoint!;
        this.frames=frames;this.extraImages=extraImages;
        this.extraImages['slope-icons']=await loadSlopeIcons(this.terrain,this.frames.world![0]!);
        this.frames['slope-icons']=[[0,0,.5,1],[.5,0,.5,1]];
        {const plane=tornadoPlanes()[0]!,canvas=document.createElement('canvas');canvas.width=plane.width;canvas.height=plane.height;
            canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(plane.pixels),plane.width,plane.height),0,0);
            this.extraImages['tornado-icon']=await loadImage(canvas.toDataURL());this.frames['tornado-icon']=[[0,0,1,1]];}

        for(let frame=0;frame<4;frame++)for(let stage=1;stage<=8;stage++){const [u,v,w,h]=this.frames.creatures![frame]!;this.frames.creatures!.push([u!,v!,w!,h!*stage/8]);}
        for(let stage=1;stage<=8;stage++){const [u,v,w,h]=this.frames.pearls![1]!;this.frames.pearls!.push([u!,v!,w!,h!*stage/8]);}
        {const rim=this.frames.gadgets![0]!,shaft=this.frames.gadgets![1]!;this.frames.gadgets!.push([rim[0]!,rim[1]!,rim[2]!,rim[3]!*.45],[shaft[0]!+shaft[2]!*.04,shaft[1]!+shaft[3]!*.26,shaft[2]!*.92,shaft[3]!*.46]);}
        for(const [u,v,w,h]of this.frames.environment!.slice(4,8))this.frames.environment!.push([u!+w!*.035,v!+h!*.12,w!*.93,h!*.84]);
        for(const [u,v,w]of this.frames.backdrops!.slice())this.frames.backdrops!.push([u!,v!+8/this.extraImages.backdrops!.naturalHeight,w!,2/this.extraImages.backdrops!.naturalHeight]);
        const [,,loads]=await Promise.all([this.engine.init(),audioLoad,savedLoad]);
        if(this.disposed){this.engine.destroy();return;}
        const [controls,savedDocument,legacy]=loads;
        if(controls.status==='fulfilled'&&controls.value)this.controls=controls.value;
        if(savedDocument.status==='fulfilled'){
            const raw=savedDocument.value;
            try{if(raw||legacy.status==='fulfilled'&&legacy.value)this.commitDocument(prepareDocument(raw,this.documentIdentity,legacy.status==='fulfilled'?legacy.value:null),false);}
            catch(error){this.notice='恢复失败，已保留原存档：'+String(error);}
        }else this.notice='读取失败，可点击读取重试：'+String(savedDocument.reason);
        this.syncTeam();
        this.scene = new WhaleScene2D(this.engine, { characters: this.characters, world: this.terrain, expansion: this.expansion, coins: this.coins, tokens: this.tokens, shell: this.shell, checkpoint: this.checkpointArt, ...this.extraImages }, this.frames,
            { x: VIEW.x, y: VIEW.y, width: VIEW.w, height: VIEW.h }, sourceSizes);
        this.world.addSystem(this.scene);
        this.world.addEntity(new Entity('Whale interface').addComponent(this.ui));
        // Gameplay owns arrows and Space even after a GUI button receives focus.
        this.system = new GuiSystem(this.engine, { navigationMap: new InputMap({}), loadOp: 'load', font: { chars: [...new Set(COPY + CLASSIC_COPY + MAP_PACK_CHARS + COOP_CHARS + '等待复活已泡泡碰触救援队友救出了全队倒下了生命用尽' + P2_NAMES.join('') + P2_DEMOS.join('') + P2_HELP.join('') + '龟壳帽尖刺骨头漂浮水面岩浆五秒自动复原顶起炮台改变起点落定盔保留'+ '水中持续主区域副区穿戴装备炮箱蓄力松开发射旋桨上升三次落地恢复俯冲安静行走伪装跳跃攻击暴露鲸弹推进结束方向升降红脉冲箱向下从方撞击发动生命珍珠耐久获得条用尽重新开始计时奖励时间到抵达参数范围不存在嵌套新增最多八个尺寸清除空副区域仅能删除还没有放置元素的副区创建并进入区域出口全部本金残余上升风力触发预警秒数复位环绕半径检查点形态旗杆高度顶端有限循环跟随人物自动镜头模式滚屏液体最低最高行' + P1_EDITOR_CHARS + P1_NAMES.join('') + P1_DEMOS.join('') + P1_HELP.join('') + '技造尚未满足普通形态规则不能与检查点组合未知受困开始结束伸展回缩' + CONTENT_NAMES.join('') + '透明管道出口被挡住了正在内穿梭穿出末端延长转弯撤去末段管线格双向超出地图或发生重叠已更新入口朝上可放食人花‹›−有无反转方向配置选中机关场景翻页已经戴着铁盆挡住了头顶伤害戴好了可抵挡来自一次被地面敌人震飞P开关启动秒路径变化时间结束P门需要先踩下开关请给两扇门设置相同连接编号游泳机关试验海岸' + NAMES.join('') + Object.values(PLAYER_FORMS).map(form=>form.label+form.hudLabel).join('') + Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''))].join(''), fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 28, atlasSize: 2048 } });
        this.system.priority = 1000;
        this.world.addSystem(this.system);
        const render = new RenderIntegration(this.engine, { label: 'WhaleMaker.Scene2D+HUD' });
        this.world.addRuntimeIntegration(render);
        render.registerAll(this.world, system => system === this.scene ? this.scene.renderPipelineOptions : { pass: 'shared', loadOp: 'load', sort: 1000 });
        const plaque = new GuiImage({ source: this.terrain, uv: this.frames.world![10]! as [number, number, number, number] });
        this.ui.add(this.rect(plaque, { x: 24, y: 12, width: 52, height: 48 }));
        this.label('鲸屿制造  /  WHALE MAKER', 90, 18, 380, 40);
        this.button('设置',405,20,78,()=>{this.clearControls();this.settingsPanel.show(this.controls);});
        this.status = this.label('', 532, 21, 724);
        this.musicButton=this.button('音乐开',1088,20,80,()=>this.audio.toggleMusic());
        this.effectsButton=this.button('音效开',1176,20,80,()=>this.audio.toggleEffects());
        this.hudCoin = new GuiImage({ source: this.tokens, uv: this.frames.tokens![0]! as [number,number,number,number], pointerFilter: 'ignore' });
        this.ui.add(this.rect(this.hudCoin,{x:500,y:24,width:26,height:26})); this.coinIcons.push(this.hudCoin);
        this.mode = this.button('编辑器  E', 24, 70, 136, () => this.toggle());
        this.pause = this.button('暂停 P', 170, 70, 100, () => { this.paused = !this.paused; this.clearControls(); });
        this.button('重新出发 R', 280, 70, 132, () => this.restart());
        this.jumpButton=this.button('鲸鱼娘 · 冰火试验', 422, 70, 180, () => {if(this.editing)this.configureCourseTarget();else this.launchPack('whale',5);});
        this.button('地图包 / 选关', 612, 70, 154, () => this.showMapPacks());
        this.button('重开地图包',1138,70,118,()=>this.launchPack(this.activePackId,0));
        this.button('保存', 776, 70, 82, () => this.save());
        this.button('读取', 868, 70, 82, () => this.read());
        this.button('导出', 960, 70, 82, () => this.export());
        this.button('导入', 1052, 70, 82, () => this.import());
        this.hint = this.label('', 24, 112, 1230);
        this.banner = this.label('', 360, 340, 560, 100);
        this.banner.setStyle({ backgroundColor: '#102e48ee', color: '#fff0c4', radius: 20, padding: 24 });
        this.buildEditor();this.p1Editor=new P1Editor(this);
        this.scoreBanner=this.label('',1060,150,186,30);this.fontSizes.set(this.scoreBanner,14);
        const p0=this.button('P0 冰晶试验',210,744,172,()=>this.launchPack('trials',0));
        const p0Layout=p0.layout.bind(p0);p0.layout=r=>{p0Layout(r);p0.setVisible(!this.editing);};
        const p1=this.button('P1 试验工坊',394,744,162,()=>{this.p1DemoIndex=(this.p1DemoIndex+1)%P1_DEMOS.length;this.launchPack('trials',1+this.p1DemoIndex);this.state.notice=P1_HELP[this.p1DemoIndex]!;});const p1Layout=p1.layout.bind(p1);p1.layout=r=>{p1Layout(r);p1.setVisible(!this.editing);};
        const p2=this.button('P2 试验关',570,744,172,()=>{this.p2DemoIndex=(this.p2DemoIndex+1)%P2_DEMOS.length;this.launchPack('trials',1+P1_DEMOS.length+this.p2DemoIndex);this.state.notice=P2_HELP[this.p2DemoIndex]!;});const p2Layout=p2.layout.bind(p2);p2.layout=r=>{p2Layout(r);p2.setVisible(!this.editing);};
        this.p2Hud=this.label('',500,47,574,19);this.fontSizes.set(this.p2Hud,12);
        const touchKeys: [
            string,
            number,
            Partial<Input>
        ][] = [['←', 24, { axis: -1 }], ['→', 100, { axis: 1 }], ['跳', 900, { jump: true }], ['旋', 976, { spin: true }], ['跑/抱', 1052, { grab: true }], ['火/投', 1128, { fire: true }], ['↓', 824, { down: true }],['↑',748,{interact:true}],['技 K',584,{special:true}],['造 L',660,{build:true}]];
        for (const [text, x, input] of touchKeys) {
            const b = new GuiButton({ text, style: { backgroundColor: '#174758c9', color: '#e7fcfa', radius: 16 }, onPointerDown: () => { Object.assign(this.touch, input); if (input.jump) this.pendingJump = true; if (input.spin) this.pendingSpin = true; if (input.fire) this.pendingFire = true;if(input.special)this.pendingSpecial=true;if(input.build)this.pendingBuild=true; }, onPointerUp: () => { for (const key of Object.keys(input))
                    delete this.touch[key as keyof Input]; }, onPointerCancel: () => { this.touch = {}; } });
            this.ui.add(this.rect(b, { x, y: input.special||input.build?684:738, width: 66, height: 48 }));
            const prior = b.layout.bind(b);
            b.layout = p => { prior(p); b.setVisible(!this.editing&&!this.settingsPanel?.open); };
        }
        // Keep ordinary labels and controls below the modal in the GUI paint order.
        for(const node of [...this.ui.root.children]){this.ui.remove(node);this.mainUi.add(node);}
        this.ui.add(this.mainUi);
        this.mainUi.layout=area=>{Object.assign(this.mainUi.rect,area);for(const node of this.mainUi.children)node.layout(area);};
        this.settingsPanel=new CoopSettingsPanel(this,settings=>this.applyControls(settings));
        this.packPanel=new MapPackPanel(this,this.packLibrary,(pack,index,edit)=>this.launchPack(pack,index,edit),()=>{this.clearControls();this.reconcileCourse();},{save:()=>this.savePacks(),export:pack=>this.exportPack(pack),import:()=>this.importPack()});
        const opt = { signal: this.abort.signal };
        const unlockAudio=()=>{if(!document.hidden&&!gameSession.paused){this.background=false;this.audio.unlock();}};
        this.canvas.addEventListener('pointerdown',unlockAudio,{...opt,capture:true});
        window.addEventListener('keydown',unlockAudio,{...opt,capture:true});
        window.addEventListener('focus',()=>{this.background=false;},opt);
        this.removeAudioSession=gameSession.register({pause:()=>this.audio.suspend(),resume:()=>{this.background=false;}});
        window.addEventListener('keydown', e => this.key(e, true), opt);
        window.addEventListener('keyup', e => this.key(e, false), opt);
        window.addEventListener('blur', () => { this.background=true;this.audio.suspend();this.clearControls(); this.pointer = false; this.drag = null; }, opt);
        document.addEventListener('visibilitychange', () => { if (document.hidden){this.audio.suspend();this.clearControls();} }, opt);
        this.canvas.addEventListener('contextmenu', e => e.preventDefault(), opt);
        this.canvas.addEventListener('pointerdown', e => this.down(e), opt);
        this.canvas.addEventListener('pointermove', e => { if (this.pointer)
            this.paint(e); }, opt);
        window.addEventListener('pointerup', () => this.endPointer(), opt);
        window.addEventListener('pointercancel', () => { this.pointer = false; this.drag = null; this.touch = {}; }, opt);
        this.canvas.addEventListener('wheel', e => { if (this.editing&&!this.packPanel.open&&!this.settingsPanel.open) {
            e.preventDefault();
            if (e.shiftKey)
                this.editY = Math.max(0, Math.min(Math.max(0, this.level.height - EDIT_VIEW.h / 36), this.editY + Math.sign(e.deltaY)));
            else
                this.editCamera = Math.max(0, Math.min(Math.max(0, Math.max(this.level.width,this.editorIndex().endZone?.right??0) - EDIT_VIEW.w / 36), this.editCamera + e.deltaY * .025 + e.deltaX * .025));
        } }, { ...opt, passive: false });
        this.resize = new ResizeObserver(() => this.engine.resizeToDisplaySize());
        this.resize.observe(this.canvas);
        this.engine.on('update', ({ detail: { time, delta } }) => { this.tick(Math.min(.1, delta / 1000)); this.draw(); this.world.update(time, delta); });
        if (new URLSearchParams(location.search).has('verify'))
            Object.assign(window, { __whaleMaker: this });
        this.engine.run();
        document.body.dataset.renderStatus = 'passed';
    }
    private stashCourse(force=false):void {
        if(this.packPanel?.open)return;
        if((this.editing||force)&&this.documentIdentity.kind==='course'&&this.packLibrary.get(this.activePackId).courses.some(course=>course.id===this.activeCourseId))
            this.packLibrary.update(this.activePackId,this.activeCourseId,this.packLevel());
    }
    private reconcileCourse():void {
        const pack=this.packLibrary.list().find(pack=>pack.id===this.activePackId)??this.packLibrary.list()[0]!,index=pack.courses.findIndex(course=>course.id===this.activeCourseId);
        if(this.documentIdentity.kind==='standalone'){this.activePackId=pack.id;this.activeCourse=Math.max(0,index);this.activeCourseId=pack.courses[this.activeCourse]!.id;return;}
        if(index>=0){
            this.activeCourse=index;
            if(this.editing){
                const root=this.packLibrary.level(pack.id,this.activeCourseId);
                if(this.editAreaId!=='main'&&root.areas?.[this.editAreaId]){this.areaRoot=root;this.level=structuredClone(inheritArea(root,this.editAreaId));}
                else{this.editAreaId='main';this.areaRoot=undefined;this.level=root;}
            }
            return;
        }
        this.editing=false;this.launchPack(pack.id,Math.min(this.activeCourse,pack.courses.length-1),true);
    }
    showMapPacks():void {
        this.stashCourse();this.clearControls();this.pointer=false;this.drag=null;
        this.reconcileCourse();this.mainUi.setVisible(false);this.packPanel.show(this.activePackId,this.activeCourse,this.editing);
    }
    launchPack(pack:string,index=0,edit=false):void {
        this.stashCourse();
        const document=this.packLibrary.get(pack),course=document.courses[index];if(!course)throw Error('关卡不存在');
        const level=course.make();
        this.packPanel?.close();this.mainUi.setVisible(true);
        this.activePackId=pack;this.activeCourse=index;this.activeCourseId=course.id;this.documentIdentity={kind:'course',pack,course:course.id};
        this.editAreaId='main';this.areaRoot=undefined;this.level=level;this.state=create(level);
        this.campaignActive=document.sequential&&!edit;this.selectedLevel=pack==='classic'?5+index:this.selectedLevel;
        const camera=centeredCamera(level,this.state.player,VIEW.w/S,VIEW.h/S);
        this.camera=this.editCamera=camera.x;this.cameraY=camera.y;this.editY=2;
        this.selection.clear();this.history=[];this.redo=[];this.clipboard=null;this.pastePending=false;this.pathDrag=null;
        this.editing=edit;this.paused=false;this.accumulator=0;this.clearControls();this.syncTeam();this.audio.reset(this.state);
    }
    private nextDestination():CourseDestination|null {
        if(this.state.level.nextCourse)return this.state.level.nextCourse;
        if(this.state.startLevel.nextCourse)return this.state.startLevel.nextCourse;
        if(!this.campaignActive)return null;
        const pack=this.packLibrary.get(this.activePackId),index=pack.courses.findIndex(course=>course.id===this.activeCourseId);
        return pack.courses[index+1]?{pack:pack.id,course:pack.courses[index+1]!.id}:null;
    }
    private travelCourse(destination:CourseDestination):void {
        const level=this.packLibrary.level(destination.pack,destination.course),pack=this.packLibrary.get(destination.pack);
        this.state=transferCourse(this.state,level);this.level=structuredClone(this.state.startLevel);
        this.documentIdentity={kind:'course',pack:pack.id,course:destination.course};this.activePackId=pack.id;this.activeCourseId=destination.course;this.activeCourse=pack.courses.findIndex(course=>course.id===destination.course);
        this.campaignActive=pack.sequential;this.editAreaId='main';this.areaRoot=undefined;
        this.accumulator=0;this.clearControls();this.audio.reset(this.state);
    }
    configureCourseTarget():void {
        const ids=[...this.selection].filter(id=>COURSE_PORTALS.has(this.level.cells[id]!));
        const target=ids.length?this.level.properties?.[ids[0]!]?.destination:this.level.nextCourse;
        this.stashCourse();this.clearControls();this.mainUi.setVisible(false);
        const pack=target?.pack??this.activePackId,document=this.packLibrary.get(pack);
        const index=target?Math.max(0,document.courses.findIndex(course=>course.id===target.course)):this.activeCourse;
        this.packPanel.show(pack,index,false,destination=>{
            this.record();
            if(ids.length)for(const id of ids){const props=(this.level.properties??={})[id]??={};if(destination){props.destination={...destination};delete props.area;}else delete props.destination;}
            else if(destination)this.level.nextCourse={...destination};else delete this.level.nextCourse;
            this.stashCourse();this.notice=destination?'跳关 → '+this.packLibrary.get(destination.pack).title+' / '+destination.course:'已清除跳关';
        });
    }
    startClassic(index=0):void {this.launchPack('classic',index);}
    restart() {
        if (this.editing) { this.editCamera = 0; this.editY = Math.max(0,this.level.height-EDIT_VIEW.h/36); return; }
        if (this.state.phase === 'dead') respawn(this.state);
        else this.state = this.testState();
        this.syncTeam();
        this.audio.reset(this.state);
        this.paused = false;
        this.accumulator = 0;
        this.clearControls();
        this.camera = Math.max(0, this.state.player.x - 9);
        this.cameraY = Math.max(0, Math.min(this.level.height - 12, this.state.player.y - 8));
    }
    clearControls() {
        this.keys.clear(); this.touch = {};
        this.pendingJump = this.pendingSpin = this.pendingFire = this.pendingSpecial = this.pendingBuild = false;
        this.actionEdges.forEach(edges=>edges.clear());
        this.padGate.reset();
    }
    private syncTeam():void {
        if((this.state.coop?.players.length??1)!==this.controls.count)configureCoop(this.state,this.controls.count,VIEW.w/S,VIEW.h/S);
    }
    private applyControls(settings:CoopSettings):void {
        const changed=this.controls.count!==settings.count;
        this.controls=settings;this.controlSave.save(settings);this.clearControls();
        if(changed&&!this.editing){this.state.phase='playing';this.restart();}
    }
    key(e: KeyboardEvent, down: boolean) {
        if(this.packPanel?.open){if(down)this.packPanel.key(e);return;}
        if(this.settingsPanel?.open){if(down)this.settingsPanel.key(e);return;}
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyX'].includes(e.code)||!this.editing&&this.controls.players.slice(0,this.controls.count).some(p=>p.keys.includes(e.code)))
        e.preventDefault(); if (down) {
        if (!e.repeat && !this.keys.has(e.code) && !this.editing && !this.paused) {
            for(let index=0;index<this.controls.count;index++){
                const profile=this.controls.players[index]!,action=ACTIONS[profile.keys.indexOf(e.code)];
                if(action&&['jump','spin','fire','special','build','interact'].includes(action))this.actionEdges[index]!.add(action);
            }
            const primary=this.controls.players[0]!;
            if(e.code==='KeyZ'&&this.controls.count===1&&primary.keys[4]==='Space'&&!primary.keys.includes(e.code))this.actionEdges[0]!.add('jump');
        }
        this.keys.add(e.code);
        if (!e.repeat) {
            if(e.code==='KeyM')this.audio.toggleMusic();
            if(e.code==='KeyN')this.audio.toggleEffects();
            if (e.code === 'KeyE')
                this.toggle();
            if (e.code === 'KeyP') {
                this.paused = !this.paused;
                this.clearControls();
            }
            if (e.code === 'KeyR' && !this.editing) this.restart();
            if (this.editing && e.code === 'Delete') { e.preventDefault(); this.deleteSelection(); }
            if (this.editing && e.code === 'Escape') { this.selection.clear(); this.pastePending = false; this.drag = null; }
            if (this.editing && e.ctrlKey && e.code === 'KeyC') { e.preventDefault(); this.copySelection(); }
            if (this.editing && e.ctrlKey && e.code === 'KeyV') { e.preventDefault(); this.pastePending = !!this.clipboard; }
            if (this.editing && e.ctrlKey && e.code === 'KeyZ')
                this.undo();
            if (this.editing && e.ctrlKey && e.code === 'KeyY')
                this.redoEdit();
        }
    }
    else
        this.keys.delete(e.code); }
    input(index=0,pads=isGamepadPointerMode()?[]:gamepadFrames()): Input {
        const input=playerInput(this.controls,index,this.keys,pads,this.actionEdges[index]!);
        if(index!==0)return input;
        Object.assign(input,this.touch);
        input.jump||=this.pendingJump;input.spin||=this.pendingSpin;input.fire||=this.pendingFire;input.special||=this.pendingSpecial;input.build||=this.pendingBuild;
        return input;
    }
    private gamepadCommands(pads:readonly PadFrame[]):void {
        const profile=this.controls.players[0]!,pad=pads.find(p=>p.index===profile.device);
        if(pad===this.lastPadCommands)return;
        this.lastPadCommands=pad;
        if(!pad||this.editing||this.background||gameSession.paused)return;
        const pressed=(key:string)=>pad.pressed.has(key)&&!profile.pad.includes(key);
        if(pressed('b9')){this.paused=!this.paused;this.clearControls();}
        else if(pressed('b3'))this.toggle();
        else if(pressed('b5'))this.restart();
    }
    tick(dt: number) {
        if(this.editing){
            const portal=[...this.selection].find(id=>COURSE_PORTALS.has(this.level.cells[id]!)),target=portal===undefined?this.level.nextCourse:this.level.properties?.[portal]?.destination;
            this.jumpButton.setText((portal===undefined?'设置终点后续关':'设置出口跳关')+(target?' → '+target.course:''));
        }else this.jumpButton.setText('鲸鱼娘 · 冰火试验');
        const pads=gamepadFrames(),settingsOpen=this.settingsPanel.open||this.packPanel.open;
        this.mainUi.setVisible(!settingsOpen);
        this.audio.update(this.state,{paused:this.paused||settingsOpen,editing:this.editing,hidden:document.hidden||this.background,sessionPaused:gameSession.paused},dt);
        if(settingsOpen){this.lastPadCommands=pads.find(p=>p.index===this.controls.players[0]!.device);this.settingsPanel.update(pads);return;}
        const gameplayPads=this.padGate.filter(isGamepadPointerMode()?[]:pads);
        this.gamepadCommands(gameplayPads);
        this.syncTeam();
        if (this.editing) {
        this.editTime += dt;
        const dx=Number(this.keys.has('ArrowRight'))-Number(this.keys.has('ArrowLeft')),dy=Number(this.keys.has('ArrowDown'))-Number(this.keys.has('ArrowUp'));
        this.editCamera = Math.max(0,Math.min(Math.max(0,Math.max(this.level.width,this.editorIndex().endZone?.right??0)-EDIT_VIEW.w/36),this.editCamera+dx*dt*15));
        this.editY = Math.max(0,Math.min(Math.max(0,this.level.height-EDIT_VIEW.h/36),this.editY+dy*dt*15));
        return;
    } if (this.paused)
        return; this.accumulator += dt; while (this.accumulator >= 1 / 120) {
        this.state.view={x:this.camera,y:this.cameraY,w:VIEW.w/S,h:VIEW.h/S};
        const inputs=Array.from({length:this.controls.count},(_,index)=>{
            const previous=playerAt(this.state,index).previous,edges=this.actionEdges[index]!;
            for(const action of ['jump','spin','fire','special','build','interact'] as const)if(edges.has(action))previous[action]=false;
            if(index===0){
                if(this.pendingJump)previous.jump=false;if(this.pendingSpin)previous.spin=false;if(this.pendingFire)previous.fire=false;
                if(this.pendingSpecial)previous.special=false;if(this.pendingBuild)previous.build=false;
            }
            return this.input(index,gameplayPads);
        });
        stepCoop(this.state,inputs);
        this.audio.events(this.state);
        this.pendingJump = this.pendingSpin = this.pendingFire = this.pendingSpecial = this.pendingBuild = false;
        this.actionEdges.forEach(edges=>edges.clear());
        this.accumulator -= 1 / 120;
    }
        if(this.state.courseDestination&&this.state.pipe&&this.state.pipe.age>=.45){
            const destination=this.state.courseDestination;this.state.courseDestination=null;
            try{this.travelCourse(destination);}catch(error){cancelCourseTravel(this.state);this.state.notice=String(error);}
        }else if(courseComplete(this.state)){const destination=this.nextDestination();if(destination)try{this.travelCourse(destination);}catch(error){cancelCourseTravel(this.state);this.state.notice=String(error);}}
        const camera=this.state.coop?coopCamera(this.state):cameraFor(this.state,centeredCamera(this.state.level,this.state.player,VIEW.w/S,VIEW.h/S),VIEW.w/S,VIEW.h/S);
        this.camera=camera.x;this.cameraY=camera.y;
    }
    toggle() { this.campaignActive=false;if (this.editing) {
        try {
            validate(this.packLevel());this.stashCourse();
        }
        catch (e) {
            this.notice = String(e);
            return;
        }
        this.state = this.testState();
        this.camera = 0;
    }
    else {
        upgradeGlassPipes(this.level);
        this.editRevision++;
        this.editCamera = Math.min(Math.max(0,Math.max(this.level.width,this.editorIndex().endZone?.right??0)-EDIT_VIEW.w/36),this.camera);
        this.editY = Math.min(Math.max(0,this.level.height-EDIT_VIEW.h/36),this.cameraY);
    } this.editing = !this.editing;this.audio.reset(this.state,true); this.paused = false; this.accumulator = 0; this.clearControls(); this.notice = ''; }
    point(e: PointerEvent) { const r = this.canvas.getBoundingClientRect(), scale = Math.min(r.width / W, r.height / H); return { x: (e.clientX - r.left - (r.width - W * scale) / 2) / scale, y: (e.clientY - r.top - (r.height - H * scale) / 2) / scale }; }
    cellPoint(e: PointerEvent): [number, number] | null {
        const p = this.point(e), v = EDIT_VIEW;
        if (p.x < v.x || p.x >= v.x + v.w || p.y < v.y || p.y >= v.y + v.h) return null;
        const x = Math.floor((p.x - v.x) / 36 + this.editCamera), y = Math.floor((p.y - v.y) / 36 + this.editY);
        return x >= 0 && x < this.level.width && y >= 0 && y < this.level.height ? [x,y] : null;
    }
    down(e: PointerEvent) {
        if(this.settingsPanel.open||this.packPanel.open)return;
        if (!this.editing) return;
        const cell = this.cellPoint(e); if (!cell) return;
        const [x,y] = cell, id = y*this.level.width+x;
        if(this.pathDrag){const d=this.pathDrag,draft=structuredClone(d.original);if(movePathNode(draft,d.id,d.index,[x-d.id%this.level.width,y-Math.floor(d.id/this.level.width)]))this.level=draft;return;}
        this.pointer = true; this.erase = e.button === 2; this.lastCell = -1;
        this.canvas.setPointerCapture(e.pointerId);
        if (this.pastePending && this.clipboard && !this.erase) {
            const draft=structuredClone(this.level),result=pasteStamp(draft,this.clipboard,x,y);
            if (result) { this.record(); this.level=draft; this.selection=result; this.notice='已粘贴'; } else this.notice='粘贴位置超出地图';
            this.pastePending = false; this.pointer = false; return;
        }
        if(this.p1Editor.preview&&!this.erase){for(const selectedId of this.selection){const path=this.level.properties?.[selectedId]?.path;const n=path?.findIndex((p,n)=>n>0&&selectedId%this.level.width+p[0]===x&&Math.floor(selectedId/this.level.width)+p[1]===y)??-1;if(n>0){this.pathDrag={id:selectedId,index:n,original:structuredClone(this.level)};this.record();return;}}}
        if (!this.erase && !e.shiftKey && !this.setSpawn && (this.editorTool === 'select' || this.editorTool === 'box')) {
            if (this.editorTool === 'select' && !this.selection.has(id)) this.selection = new Set(objectCells(this.level,x,y));
            this.drag = {start:cell,end:cell}; return;
        }
        if(!this.erase&&!e.shiftKey&&!this.setSpawn&&this.editorTool==='paint'&&this.level.cells[id]==='ice'&&this.selected!=='ice'&&this.frozenContent(this.selected)){this.record();this.paint(e);this.pointer=false;return;}
        if (!this.erase && !e.shiftKey && !this.setSpawn && this.editorTool === 'paint' && CONTAINER_TILES.has(this.level.cells[id]!)) {
            this.selection = new Set(objectCells(this.level,x,y)); this.pointer = false; return;
        }
        if(!this.erase&&!e.shiftKey&&!this.setSpawn&&this.editorTool==='paint'&&(['firebar','door','p-door','locked-door','stone','stone-body','cannon-body','cannon','cactus','cactus-body','plant'].includes(this.level.cells[id]!)||isPipe(this.level.cells[id]!)||isGlass(this.level.cells[id]!))&&this.selected!=='plant'){this.selection=new Set(objectCells(this.level,x,y));this.pointer=false;return;}
        if(!this.erase&&!e.shiftKey&&!this.setSpawn&&(['T','J',...EXTRA_ENEMIES].includes(this.level.cells[id]!))){this.selection=new Set([id]);this.pointer=false;return;}
        if(!this.erase&&this.editorTool==='paint'&&([...P1_TOOLS,...P2_TOOLS] as readonly string[]).includes(this.level.cells[id]!)){this.selection=new Set([id]);this.pointer=false;return;}
        this.record(); this.paint(e);
    }
    frozenContent(t:Tile):BlockContent|undefined{return ({o:'coin',G:'growth',F:'fire',J:'duck',T:'turtle'} as Partial<Record<Tile,BlockContent>>)[t]??(CONTENTS.includes(t as BlockContent)?t as BlockContent:undefined);}
    paint(e: PointerEvent) {
        const cell = this.cellPoint(e); if (!cell) return;
        if (this.drag) { this.drag.end = cell; return; }
        const [x,y] = cell, id = y*this.level.width+x;
        if(this.pathDrag){const d=this.pathDrag,draft=structuredClone(d.original);if(movePathNode(draft,d.id,d.index,[x-d.id%this.level.width,y-Math.floor(d.id/this.level.width)]))this.level=draft;return;}
        if (id === this.lastCell || (this.editorTool === 'paint' && (this.selected === 'P'||this.selected==='glass-pipe') && !this.erase && this.lastCell !== -1)) return;
        this.lastCell = id;
        // A drag is one undo entry but may span many rendered frames.
        this.editRevision++;
        this.audio.edit();
        if (e.shiftKey || this.setSpawn) { this.setSpawn = false; this.level.spawn = [x,y]; this.notice = '起点已设置'; return; }
        if (this.erase || this.editorTool === 'erase' || this.selected === '.') {
            clearCells(this.level,[id,...objectCells(this.level,x,y)]); this.selection.clear(); return;
        }
        if(this.selected==='plant'&&(['P','Q','p','q'].includes(this.level.cells[id]!)||isGlass(this.level.cells[id]!))){
            const cells=objectCells(this.level,x,y),anchor=cells[0];if(anchor!==undefined){(this.level.properties??={})[anchor]={...this.level.properties?.[anchor],plant:true};this.selection=new Set(cells);}return;
        }
        if(this.level.cells[id]==='ice'&&this.selected!=='ice'&&this.frozenContent(this.selected)){(this.level.contents??={})[id]=this.frozenContent(this.selected)!;this.selection=new Set([id]);return;}
        if(this.selected==='ice'){const content=this.frozenContent(this.level.cells[id]!);clearCells(this.level,[id,...objectCells(this.level,x,y)]);this.level.cells[id]='ice';if(content)(this.level.contents??={})[id]=content;this.selection=new Set([id]);return;}
        if(this.selected==='gentle-up'||this.selected==='gentle-down'){if(x+1>=this.level.width)return;clearCells(this.level,[...objectCells(this.level,x,y),...objectCells(this.level,x+1,y),id,id+1]);setCell(this.level,id,this.selected);setCell(this.level,id+1,this.selected==='gentle-up'?'gentle-up-body':'gentle-down-body');this.selection=new Set([id,id+1]);return;}
        if(PATH_TILES.has(this.selected)){const path=validSnakePath(this.level,id,DEFAULT_SNAKE_PATH)?structuredClone(DEFAULT_SNAKE_PATH):[[0,0],[x+4<this.level.width?4:-4,0]] as [number,number][];if(!validSnakePath(this.level,id,path)||!elementFits(this.level,this.selected,x,y,{path,length:4})){this.notice='路线或元素尺寸超出地图';return;}clearCells(this.level,[id,...objectCells(this.level,x,y)]);this.level.cells[id]=this.selected;(this.level.properties??={})[id]={path,length:4};this.selection=new Set([id]);return;}
        if(this.selected==='snake-block'){const path=validSnakePath(this.level,id,DEFAULT_SNAKE_PATH)?structuredClone(DEFAULT_SNAKE_PATH):[[0,0],[x+4<this.level.width?4:-4,0]] as [number,number][];if(!validSnakePath(this.level,id,path))return;clearCells(this.level,[id,...objectCells(this.level,x,y)]);this.level.cells[id]='snake-block';(this.level.properties??={})[id]={path,length:4};this.selection=new Set([id]);return;}
        if(this.selected==='giant-pearl'){
            if(x+1>=this.level.width||y<1)return;
            const cells=[id-this.level.width,id-this.level.width+1,id,id+1],old=new Set(cells);
            for(const n of cells)for(const v of objectCells(this.level,n%this.level.width,Math.floor(n/this.level.width)))old.add(v);
            clearCells(this.level,old);this.level.cells[id]='giant-pearl';this.selection=new Set(cells);return;
        }
        if(this.selected==='cactus'){if(y<2)return;const draft=structuredClone(this.level);if(!placeCactus(draft,x,y,3)){this.notice='仙人球需要完整的叠层空间';return;}this.level=draft;this.selection=new Set(objectCells(this.level,x,y));return;}
        if(this.selected==='cannon'){if(y<1)return;const old=new Set<number>([id,id-this.level.width]);for(const n of [...old])for(const v of objectCells(this.level,n%this.level.width,Math.floor(n/this.level.width)))old.add(v);clearCells(this.level,old);placeCannon(this.level,x,y,2);this.selection=new Set(objectCells(this.level,x,y));return;}
        if(this.selected==='glass-pipe'){
            const cells=glassCells(this.level,id,DEFAULT_GLASS_PATH);if(!cells.length){this.notice='管道超出地图';return;}
            const old=new Set<number>(cells);for(const n of cells)for(const v of objectCells(this.level,n%this.level.width,Math.floor(n/this.level.width)))old.add(v);
            clearCells(this.level,old);placeGlassPipe(this.level,id);this.selection=new Set(objectCells(this.level,x,y));
        }else if(this.selected==='stone'||this.selected==='turtle-boss'){
            if(x+2>this.level.width||y+2>this.level.height)return;const old=new Set<number>();for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)for(const n of [id+dy*this.level.width+dx,...objectCells(this.level,x+dx,y+dy)])old.add(n);clearCells(this.level,old);(this.selected==='stone'?placeStone:placeBoss)(this.level,x,y);this.selection=new Set(objectCells(this.level,x,y));
        }else if (this.selected === 'P') {
            if (x+1 >= this.level.width || y+3 > this.level.height) return;
            const old = new Set<number>();
            for (let dy=0;dy<3;dy++) for (let dx=0;dx<2;dx++) {
                old.add((y+dy)*this.level.width+x+dx);
                for (const n of objectCells(this.level,x+dx,y+dy)) old.add(n);
            }
            clearCells(this.level,old); placePipe(this.level,x,y,3);(this.level.properties??={})[id]={link:1}; this.selection = new Set(objectCells(this.level,x,y));
        } else {
            if(([...P1_TOOLS,...P2_TOOLS] as readonly string[]).includes(this.selected)&&!elementFits(this.level,this.selected,x,y)){this.notice='元素尺寸超出地图';return;}
            if(this.selected==='E')for(let old=0;old<this.level.cells.length;old++)if(old!==id&&this.level.cells[old]==='E')clearCells(this.level,[old]);
            const underlying=this.level.cells[id];clearCells(this.level,[id,...objectCells(this.level,x,y)]);
            setCell(this.level,id,this.selected);if((underlying==='water'||underlying==='lava'||underlying==='quicksand')&&this.frozenContent(this.selected))(this.level.properties??={})[id]={...this.level.properties?.[id],liquid:underlying};
            this.selection = [...P1_TOOLS,...P2_TOOLS,'?','hidden-block','plant','firebar','door','p-door','locked-door','bridge','bridge-bell','moving-platform','fire-jumper'].includes(this.selected) ? new Set([id]) : new Set();
            if(this.selected==='firebar')(this.level.properties??={})[id]={length:4,speed:1.5};
            if(this.selected==='plant')(this.level.properties??={})[id]={mode:'fixed'};
            if(this.selected==='door'||this.selected==='p-door'||this.selected==='locked-door')(this.level.properties??={})[id]={link:1};
        }
    }
    endPointer() {
        if(this.pathDrag){this.pathDrag=null;this.pointer=false;return;}
        if (this.drag) {
            if (this.editorTool === 'box') this.selection = selectBox(this.level,this.drag.start,this.drag.end);
            else {
                const dx=this.drag.end[0]-this.drag.start[0],dy=this.drag.end[1]-this.drag.start[1];
                if ((dx||dy) && this.selection.size) {
                    const draft=structuredClone(this.level),result=moveSelection(draft,this.selection,dx,dy);
                    if (result) { this.record(); this.level=draft; this.selection=result; }
                }
            }
        }
        this.drag = null; this.pointer = false; this.lastCell = -1;
    }
    deleteSelection() { if (!this.selection.size) return; this.record(); clearCells(this.level,this.selection); this.selection.clear(); }
    copySelection() { this.clipboard=stampSelection(this.level,this.selection); if (this.clipboard) this.notice='已复制，点击粘贴后选择地图位置'; }
    setContent(content: BlockContent) {
        const ids = [...this.selection].filter(id=>CONTAINER_TILES.has(this.level.cells[id]!)); if (!ids.length) return;
        this.record(); for (const id of ids) (this.level.contents ??= {})[id]=content;
        this.notice='方块内容已设置：'+CONTENT_NAMES[CONTENTS.indexOf(content)];
    }
    editorIcon(tile: Tile): [HTMLImageElement,number[],number] {
        if(tile==='slope-up'||tile==='slope-down'){const frame=tile==='slope-up'?0:1;return [this.extraImages['slope-icons']!,this.frames['slope-icons']![frame]!,frame];}
        if(tile==='tornado')return [this.extraImages['tornado-icon']!,this.frames['tornado-icon']![0]!,0];
        const extra=p2Art(tile)??extraArt(tile);if(extra)return [extra.atlas==='world'?this.terrain:extra.atlas==='characters'?this.characters:extra.atlas==='expansion'?this.expansion:this.extraImages[extra.atlas]!,this.frames[extra.atlas]![extra.frame]!,extra.frame];
        if(tile==='C') return [this.checkpointArt,this.frames.checkpoint![0]!,0];
        if(tile==='o') return [this.tokens,this.frames.tokens![0]!,0];
        if(tile==='hidden-block')return [this.terrain,this.frames.world![1]!,1];
        if(tile==='?') return [this.coins,this.frames.coins![8]!,8];
        if (tile === 'P') return [this.extraImages.mechanics!,this.frames.mechanics![12]!,12];
        if (tile === 'E') return [this.extraImages['goal-flags']!,this.frames['goal-flags']![0]!,0];
        if (tile === 'U') return [this.expansion,this.frames.expansion![14]!,14];
        const art = TILE_ART[tile];
        if (art !== undefined) return [this.terrain,this.frames.world![art]!,art];
        const frame = tile === 'G' ? 12 : tile === 'F' ? 13 : tile === 'T' ? 9 : tile === 'J' ? 8 : 15;
        return [this.characters,this.frames.characters![frame]!,frame];
    }
    iconButton(text: string, tile: Tile, x: number, y: number, width: number, onClick: ()=>void, nodes=this.editorNodes) {
        const b=this.button('',x,y,width,onClick); this.rect(b,{x,y,width,height:66}); nodes.push(b);
        const [image,uv]=this.editorIcon(tile), ratio=uv[2]!*image.naturalWidth/(uv[3]!*image.naturalHeight);
        const iw=ratio>1?38:38*ratio,ih=ratio>1?38/ratio:38;
        if(tile==='P') for(const [frame,dy,h]of [[13,13,26],[12,4,15]]) {
            const icon=new GuiImage({source:this.extraImages.mechanics!,uv:this.frames.mechanics![frame!]! as [number,number,number,number],pointerFilter:'ignore'});
            this.ui.add(this.rect(icon,{x:x+width/2-19,y:y+dy!,width:38,height:h!}));nodes.push(icon);
        } else if(tile==='.') {
            const eraser=this.label('×',x+width/2-18,y+4,36,38);eraser.setTextAlign('center');this.fontSizes.set(eraser,30);eraser.pointerFilter='ignore';nodes.push(eraser);
        } else {
            const icon=new GuiImage({source:image,uv:uv as [number,number,number,number],tint:tile==='poison-pearl'?'#bf40e6':'#ffffff',pointerFilter:'ignore'});
            this.ui.add(this.rect(icon,{x:x+(width-iw)/2,y:y+4+(38-ih)/2,width:iw,height:ih})); nodes.push(icon); if(tile==='o') this.coinIcons.push(icon);
        }
        const caption=this.label(text,x+2,y+43,width-4,21); caption.pointerFilter='ignore'; caption.setTextAlign('center'); this.fontSizes.set(caption,11); nodes.push(caption);
        return b;
    }
    buildEditor() {
        const pane=(x:number,y:number,width:number,height:number)=>{const n=new GuiElement({style:{backgroundColor:'#103747',radius:14},pointerFilter:'ignore'});this.ui.add(this.rect(n,{x,y,width,height}));this.editorNodes.push(n);};
        pane(16,166,180,578);pane(1052,166,212,578);
        this.paletteTitle=this.label('场景元素',28,174,96,28);this.editorNodes.push(this.paletteTitle,this.button('‹',124,170,30,()=>{this.palettePage=(this.palettePage+categoryPages(this.paletteCategory)-1)%categoryPages(this.paletteCategory);}),this.button('›',160,170,30,()=>{this.palettePage=(this.palettePage+1)%categoryPages(this.paletteCategory);}));
        PALETTE_CATEGORIES.forEach((name,category)=>{const button=this.button(name,24+category%2*84,210+Math.floor(category/2)*37,78,()=>{this.paletteCategory=category;this.palettePage=0;});this.fontSizes.set(button,12);this.categoryButtons.push(button);this.editorNodes.push(button);});
        TOOLS.forEach((tile,i)=>{const category=categoryOf(tile),position=categoryTools(category).indexOf(tile),start=this.editorNodes.length,n=position%12;this.toolButtons[i]=this.iconButton(NAMES[i]!,tile,24+(n%2)*84,292+Math.floor(n/2)*75,78,()=>{this.selected=tile;this.editorTool=tile==='.'?'erase':'paint';this.pastePending=false;});this.paletteNodes.push({category,page:Math.floor(position/12),nodes:this.editorNodes.slice(start)});});
        const tools: [EditorTool,string][]=[['paint','画笔'],['select','单选'],['box','框选'],['erase','橡皮擦']];
        tools.forEach(([tool,text],i)=>{const button=this.button(text,24+i*96,116,88,()=>{this.editorTool=tool;if(tool==='paint'&&this.selected==='.')this.selected='#';this.pastePending=false;});this.editorNodes.push(button);this.toolbarButtons.push({button,tool});});
        this.editorNodes.push(this.button('撤销',416,116,68,()=>this.undo()),this.button('重做',492,116,68,()=>this.redoEdit()),this.button('删除',568,116,68,()=>this.deleteSelection()),this.button('复制',644,116,68,()=>this.copySelection()),this.button('粘贴',720,116,68,()=>{this.pastePending=!!this.clipboard;this.notice=this.clipboard?'再次点击地图粘贴':'请先选择对象并复制';}),this.button('设起点',806,116,92,()=>{this.setSpawn=true;this.notice='点击地图设置起点';}),this.button('新地图',908,116,92,()=>{
            this.record();this.editAreaId='main';this.areaRoot=undefined;this.level={version:1,rules:{...REFERENCE_RULES},width:100,height:18,spawn:[2,13],name:'我的星海',cells:Array(1800).fill('.')};for(let x=0;x<100;x++)this.level.cells[15*100+x]='#';this.level.cells[14*100+95]='E';this.editCamera=0;this.editY=2;this.selection.clear();
        }));
        this.mapHeightLabel=this.label('',1010,116,104,32);this.editorNodes.push(this.mapHeightLabel,this.button('256',1116,116,50,()=>this.setMapHeight(256)),this.button('−',1174,116,38,()=>this.setMapHeight(this.level.height-(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?16:1))),this.button('+',1218,116,38,()=>this.setMapHeight(this.level.height+(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?16:1))));
        this.editorNodes.push(this.label('内容设置',1064,178,190,30));
        this.inspector=this.label('',1064,216,190,30);this.editorNodes.push(this.inspector);
        this.contentHint=this.label('点击宝物方块',1064,250,190,30);this.fontSizes.set(this.contentHint,14);this.editorNodes.push(this.contentHint);
        const tiles: Tile[]=['?','o','G','F','J','T','U','spring-v','basin','pow','p-switch','star','plant','fish','squid','spiky','key','cannonball','iron-turtle','ghost','giant-pearl','ice-flower','fire-jumper','wood-crate','bomb','hammer-otter','spring-h','snowball','cactus'];
        CONTENTS.forEach((content,i)=>{const start=this.contentNodes.length,n=i%8;this.contentButtons.push(this.iconButton(CONTENT_NAMES[i]!,tiles[i]??(content==='duck'?'J':content==='turtle'?'T':content==='fire'?'F':content==='growth'?'G':content==='coin'?'o':content==='empty'?'U':content==='auto'?'?':content as Tile),1062+(n%2)*100,300+Math.floor(n/2)*88,92,()=>this.setContent(content),this.contentNodes));this.contentPages.push({page:Math.floor(i/8),nodes:this.contentNodes.slice(start)});});
        this.contentNodes.push(this.button('上一页',1062,640,92,()=>this.contentPage=(this.contentPage+1)%Math.ceil(CONTENTS.length/8)),this.button('下一页',1162,640,92,()=>this.contentPage=(this.contentPage+1)%Math.ceil(CONTENTS.length/8)));
        const propertyLabel=(key:string,y:number,kinds:string[])=>{const node=this.label('',1064,y,190,30);this.propertyLabels[key]=node;this.propertyNodes.push({node,kinds});};
        const propertyButton=(text:string,x:number,y:number,width:number,kinds:string[],fn:()=>void)=>{const node=this.button(text,x,y,width,fn);this.propertyNodes.push({node,kinds});};
        propertyLabel('height',250,['cannon','cactus']);this.rect(this.propertyLabels.height!,{x:1064,y:250,width:100,height:30});propertyButton('−',1166,250,38,['cannon','cactus'],()=>this.cactusOrCannonHeight(-1));propertyButton('+',1210,250,38,['cannon','cactus'],()=>this.cactusOrCannonHeight(1));
        propertyLabel('iceGrip',250,['ice','ice-solid']);this.rect(this.propertyLabels.iceGrip!,{x:1064,y:250,width:120,height:30});propertyButton('切换',1190,250,62,['ice','ice-solid'],()=>{const ids=this.propertyIds().filter(id=>['ice','ice-solid'].includes(this.level.cells[id]!));if(!ids.length)return;this.record();for(const id of ids){const p=(this.level.properties??={})[id]??={};p.slippery=p.slippery===false;}});
        propertyLabel('snakeLength',570,['snake-block']);propertyButton('−',1064,608,86,['snake-block'],()=>this.adjustProperty('length',-1));propertyButton('+',1164,608,86,['snake-block'],()=>this.adjustProperty('length',1));
        propertyLabel('snakeRoute',300,['snake-block']);propertyButton('↑',1114,338,86,['snake-block'],()=>this.extendSnake(0,-1));propertyButton('←',1064,382,86,['snake-block'],()=>this.extendSnake(-1,0));propertyButton('→',1164,382,86,['snake-block'],()=>this.extendSnake(1,0));propertyButton('↓',1114,426,86,['snake-block'],()=>this.extendSnake(0,1));propertyButton('缩短路线',1064,522,186,['snake-block'],()=>this.extendSnake(0,0,true));
        const links=['door','p-door','locked-door','P','bridge','bridge-bell','turtle-boss'];
        propertyLabel('link',300,links);propertyButton('−',1064,338,86,links,()=>this.adjustProperty('link',-1));propertyButton('+',1164,338,86,links,()=>this.adjustProperty('link',1));
        propertyLabel('length',300,['firebar','moving-platform']);propertyButton('−',1064,338,86,['firebar','moving-platform'],()=>this.adjustProperty('length',-1));propertyButton('+',1164,338,86,['firebar','moving-platform'],()=>this.adjustProperty('length',1));
        propertyLabel('speed',390,['firebar','moving-platform']);propertyButton('−',1064,428,86,['firebar','moving-platform'],()=>this.adjustProperty('speed',-.25));propertyButton('+',1164,428,86,['firebar','moving-platform'],()=>this.adjustProperty('speed',.25));
        propertyButton('反转方向',1064,484,186,['firebar','moving-platform'],()=>this.adjustProperty('speed',0,true));
        propertyLabel('jumpHeight',300,['fire-jumper']);propertyButton('−',1064,338,86,['fire-jumper'],()=>this.adjustFlame('jumpHeight',-.5));propertyButton('+',1164,338,86,['fire-jumper'],()=>this.adjustFlame('jumpHeight',.5));
        propertyLabel('period',390,['fire-jumper']);propertyButton('−',1064,428,86,['fire-jumper'],()=>this.adjustFlame('period',-.25));propertyButton('+',1164,428,86,['fire-jumper'],()=>this.adjustFlame('period',.25));
        propertyLabel('direction',300,['stone']);
        for(const [direction,text,x]of [['left','←',1064],['down','↓',1128],['right','→',1192]] as const)propertyButton(text,x,338,58,['stone'],()=>this.setStoneDirection(direction));
        propertyLabel('plant',390,['plant','P']);propertyButton('切换食人花',1064,428,186,['plant','P'],()=>this.togglePlant());
        propertyLabel('pipeRotation',480,['P']);propertyButton('顺时针旋转 90°',1064,518,186,['P'],()=>this.rotateSelectedPipe());
        propertyLabel('pipe',300,['glass-pipe']);propertyButton('↑',1114,338,86,['glass-pipe'],()=>this.extendGlass(0,-1));propertyButton('←',1064,382,86,['glass-pipe'],()=>this.extendGlass(-1,0));propertyButton('→',1164,382,86,['glass-pipe'],()=>this.extendGlass(1,0));propertyButton('↓',1114,426,86,['glass-pipe'],()=>this.extendGlass(0,1));propertyButton('撤去末段',1064,522,186,['glass-pipe'],()=>this.extendGlass(0,0,true));
        propertyButton('延长',1064,478,86,['glass-pipe'],()=>this.resizeGlass(1));propertyButton('缩短',1164,478,86,['glass-pipe'],()=>this.resizeGlass(-1));
        propertyLabel('glassPlant',570,['glass-pipe']);propertyButton('切换食人花',1064,608,186,['glass-pipe'],()=>this.togglePlant());
        this.selectionHints=[this.label('单选后拖拽移动',1064,672,190,26),this.label('Delete 删除',1064,700,190,26)];this.editorNodes.push(...this.selectionHints);
        propertyButton('横向 / 纵向',1064,540,186,['moving-platform'],()=>{const ids=this.propertyIds().filter(n=>this.level.cells[n]==='moving-platform');if(!ids.length)return;this.record();for(const id of ids){const p=(this.level.properties??={})[id]??={};p.axis=p.axis==='y'?'x':'y';const center=p.axis==='y'?Math.floor(id/this.level.width):id%this.level.width;p.range=[Math.max(0,center-3),Math.min(p.axis==='y'?this.level.height-1:this.level.width-1,center+3)];}});
        const enemyKinds=['T','J',...EXTRA_ENEMIES];
        propertyLabel('drop',570,enemyKinds);propertyButton('掉落切换',1064,608,186,enemyKinds,()=>{const ids=this.propertyIds().filter(id=>enemyKinds.includes(this.level.cells[id]!));if(!ids.length)return;this.record();for(const id of ids){const p=(this.level.properties??={})[id]??={},next=p.drop===undefined?'coin':p.drop==='coin'?'key':undefined;if(next)p.drop=next;else delete p.drop;}});
        this.ruleButton=this.button('',1064,250,186,()=>{this.record();this.level.rules={...(rulesFor(this.level).rewards==='score'?LEGACY_RULES:REFERENCE_RULES)};});this.backdropNodes.push(this.ruleButton);
        this.backdropNodes.push(this.label('远景 / 背景',1064,290,190,30));
        const choices=[['coast','海岸云朵'],['castle','珊瑚城堡'],['mountains','远山'],['plains','原野平原'],['night','月夜城堡'],['desert','沙漠金字塔']] as const;
        for(const [n,[value,text]]of choices.entries()){
            const y=324+n*66,button=this.button(text,1064,y,186,()=>{this.record();this.level.backdrop=value;this.notice=`远景：${text}`;});
            this.backdropButtons.push({button,value});this.backdropNodes.push(button);
            const source=value==='desert'?this.extraImages['desert-icons']!:value==='coast'?this.terrain:value==='night'?this.extraImages['night-coast']!:this.extraImages.backdrops!,uv=(value==='desert'?this.frames['desert-icons']![3]:value==='coast'?this.frames.world![14]:value==='night'?this.frames['night-coast']![0]:this.frames.backdrops![n-1])! as [number,number,number,number];
            const ratio=uv[2]*source.naturalWidth/(uv[3]*source.naturalHeight),width=Math.min(174,24*ratio),height=width/ratio;
            const preview=new GuiImage({source,uv,pointerFilter:'ignore'});
            this.ui.add(this.rect(preview,{x:1157-width/2,y:y+37+(24-height)/2,width,height}));this.backdropNodes.push(preview);
        }
        // Every control belongs to one visibility group. Showing the page chrome
        // must not briefly unhide every icon on the other pages each frame.
        const palette=new Set(this.paletteNodes.flatMap(p=>p.nodes)),contents=new Set(this.contentPages.flatMap(p=>p.nodes));
        const managed=new Set([...this.contentNodes,...this.propertyNodes.map(p=>p.node),...this.backdropNodes,...this.selectionHints,this.contentHint,this.inspector]);
        this.editorChrome=this.editorNodes.filter(n=>!palette.has(n)&&!managed.has(n));
        this.contentChrome=this.contentNodes.filter(n=>!contents.has(n)&&n!==this.contentHint&&n!==this.inspector);
    }
    setMapHeight(height:number){const next=resizeLevelHeight(this.level,Math.max(10,Math.min(256,height)));if(!next){this.notice='先清除裁掉区域中的元素';return;}if(next.height===this.level.height)return;this.record();this.level=next;this.editY=Math.max(0,Math.min(this.editY,Math.max(0,next.height-EDIT_VIEW.h/36)));this.notice=`场景高度 ${next.height} 行 · 0–${next.height-1}`;}
    propertyIds(){return [...this.selection].filter(id=>['door','p-door','locked-door','P','glass-pipe','firebar','plant','stone','cannon','cactus','bridge','bridge-bell','turtle-boss','moving-platform','fire-jumper','ice','ice-solid','snake-block',...EXTRA_ENEMIES,'T','J','C','E',...P1_TOOLS,...P2_TOOLS].includes(this.level.cells[id]!));}
    rotateSelectedPipe(){const id=this.propertyIds().find(n=>this.level.cells[n]==='P');if(id===undefined)return;const draft=structuredClone(this.level);if(!rotatePipe(draft,id)){this.notice='旋转后空间不足，请先移开障碍';return;}this.record();this.level=draft;this.selection=new Set(pipeShape(draft,id)!.cells);this.notice='管道方向已旋转';}
    extendSnake(dx:number,dy:number,remove=false){const id=this.propertyIds().find(n=>this.level.cells[n]==='snake-block');if(id===undefined)return;const draft=structuredClone(this.level);if(!editSnakeEnd(draft,id,dx,dy,remove)){this.notice='路线超出地图或发生重叠';return;}this.record();this.level=draft;this.notice='路线已更新：每秒一格';}
    extendGlass(dx:number,dy:number,remove=false){const id=this.propertyIds().find(n=>this.level.cells[n]==='glass-pipe');if(id===undefined)return;const draft=structuredClone(this.level);if(!editGlassEnd(draft,id,dx,dy,remove)){this.notice='管道超出地图或发生重叠';return;}this.record();this.level=draft;this.selection=new Set(objectCells(draft,id%draft.width,Math.floor(id/draft.width)));this.notice='管线已更新';}
    resizeGlass(amount:number){const id=this.propertyIds().find(n=>this.level.cells[n]==='glass-pipe'),path=id===undefined?undefined:this.level.properties?.[id]?.path;if(!path)return;const a=path.at(-2)!,b=path.at(-1)!;if(amount<0&&Math.hypot(b[0]-a[0],b[1]-a[1])<=3){this.notice='末段已到最短长度';return;}this.extendGlass(Math.sign(b[0]-a[0])*amount,Math.sign(b[1]-a[1])*amount);}
    adjustProperty(key:'link'|'length'|'speed',delta:number,reverse=false){const ids=this.propertyIds().filter(id=>key==='link'?['door','p-door','locked-door','P','glass-pipe','bridge','bridge-bell','turtle-boss'].includes(this.level.cells[id]!):[ 'firebar','moving-platform','snake-block'].includes(this.level.cells[id]!));if(!ids.length)return;this.record();for(const id of ids){const p=(this.level.properties??={})[id]??={};const value=p[key]??(key==='link'?1:key==='length'?4:1.5);p[key]=reverse?-value:Math.max(key==='speed'?-6:1,Math.min(key==='link'?99:key==='length'?16:6,value+delta));}}
    adjustFlame(key:'jumpHeight'|'period',delta:number){const ids=this.propertyIds().filter(id=>this.level.cells[id]==='fire-jumper');if(!ids.length)return;this.record();for(const id of ids){const p=(this.level.properties??={})[id]??={};p[key]=Math.max(key==='jumpHeight'?1:.25,Math.min(key==='jumpHeight'?16:30,(p[key]??(key==='jumpHeight'?4:3))+delta));}}
    cactusOrCannonHeight(delta:number){const id=this.propertyIds().find(n=>this.level.cells[n]==='cactus');if(id===undefined){this.cannonHeight(delta);return;}const h=Math.max(1,Math.min(8,(this.level.properties?.[id]?.height??3)+delta)),draft=structuredClone(this.level);if(!placeCactus(draft,id%this.level.width,Math.floor(id/this.level.width),h)){this.notice='仙人球需要完整的叠层空间';return;}this.record();this.level=draft;this.selection=new Set(objectCells(draft,id%draft.width,Math.floor(id/draft.width)));}
    cannonHeight(delta:number){const id=this.propertyIds().find(n=>this.level.cells[n]==='cannon');if(id===undefined)return;const oldHeight=this.level.properties?.[id]?.height??2,h=Math.max(1,Math.min(8,oldHeight+delta)),y=Math.floor(id/this.level.width),x=id%this.level.width;if(y-h+1<0)return;const old=new Set(cannonCells(this.level,id));for(let n=0;n<h;n++)if(!old.has(id-n*this.level.width)&&this.level.cells[id-n*this.level.width]!=='.')return;const content=this.level.contents?.[id];this.record();clearCells(this.level,old);placeCannon(this.level,x,y,h);if(content)(this.level.contents??={})[id]=content;this.selection=new Set(objectCells(this.level,x,y));}
    setStoneDirection(direction:'left'|'right'|'down'){const ids=this.propertyIds().filter(id=>this.level.cells[id]==='stone');if(!ids.length)return;this.record();for(const id of ids)((this.level.properties??={})[id]??={}).direction=direction;}
    togglePlant(){const ids=this.propertyIds().filter(id=>['plant','P','glass-pipe'].includes(this.level.cells[id]!));if(!ids.length)return;this.record();for(const id of ids){const p=(this.level.properties??={})[id]??={};if(this.level.cells[id]==='plant')p.mode=p.mode==='pipe'?'fixed':'pipe';else p.plant=!p.plant;}}
    packLevel():Level {if(this.editAreaId==='main'||!this.areaRoot)return structuredClone(this.level);const root=structuredClone(this.areaRoot),area=structuredClone(this.level);delete area.areas;root.areas??={};root.areas[this.editAreaId]=area;if(area.progress)root.progress=structuredClone(area.progress);else delete root.progress;if(area.rules)root.rules={...area.rules};if(area.condition)root.condition=structuredClone(area.condition);else delete root.condition;return root;}
    switchEditArea(id:string):void {const root=this.packLevel();if(id!=='main'&&!root.areas?.[id])return;this.areaRoot=root;this.editAreaId=id;this.level=structuredClone(inheritArea(root,id));this.selection.clear();this.editCamera=Math.max(0,this.level.spawn[0]-7);this.editY=Math.max(0,Math.min(this.level.height-16,this.level.spawn[1]-8));this.notice=id==='main'?'主区域':'副区 '+id;}
    addSubArea():void {const root=this.packLevel();root.areas??={};if(Object.keys(root.areas).length>=8){this.notice='最多八个副区';return;}let n=1;while(root.areas['area'+n])n++;root.areas['area'+n]=emptySubArea('副区 '+n);this.level=root;this.editAreaId='main';this.areaRoot=undefined;this.switchEditArea('area'+n);}
    removeSubArea():void {if(this.editAreaId==='main'){this.notice='不能移除主区域';return;}const original=emptySubArea(this.level.name);if(this.level.width!==original.width||this.level.height!==original.height||this.level.cells.some((t,n)=>t!==original.cells[n])||Object.keys(this.level.properties??{}).length){this.notice='仅能移除尚未编辑的副区';return;}const root=this.packLevel(),id=this.editAreaId;delete root.areas![id];for(const area of [root,...Object.values(root.areas??{})])for(const p of Object.values(area.properties??{}))if(p.area===id){delete p.area;delete p.targetX;delete p.targetY;}this.level=root;this.editAreaId='main';this.areaRoot=undefined;this.selection.clear();}
    testState(){const state=create(this.packLevel());if(this.editAreaId!=='main')changeArea(state,this.editAreaId,create);return state;}
    editorSnapshot(){const l=structuredClone(this.level);this.editorContexts.set(l,{root:this.packLevel(),id:this.editAreaId});return l;}
    restoreEditor(l:Level){const c=this.editorContexts.get(l);this.editAreaId=c?.id??'main';this.areaRoot=c?.root;this.level=l;this.selection.clear();}
    record() { this.editRevision++;this.campaignActive=false;this.history.push(this.editorSnapshot()); if (this.history.length > 60)
        this.history.shift(); this.redo = []; }
    undo() { const l = this.history.pop(); if (l) {
        this.redo.push(this.editorSnapshot());
        this.restoreEditor(l);
    } }
    redoEdit() { const l = this.redo.pop(); if (l) {
        this.history.push(this.editorSnapshot());
        this.restoreEditor(l);
    } }
    savePacks():void {void this.save();}
    private commitDocument(prepared:ReturnType<typeof prepareDocument>,edit:boolean):void {
        const level=prepared.level,state=create(level);
        if(this.controls.count>1)configureCoop(state,this.controls.count,VIEW.w/S,VIEW.h/S);
        this.packPanel?.close();
        this.packLibrary.adopt(prepared.library);this.documentIdentity=prepared.active;
        const pack=prepared.active.kind==='course'?this.packLibrary.get(prepared.active.pack):this.packLibrary.list()[0]!;
        const courseId=prepared.active.kind==='course'?prepared.active.course:null;
        this.activePackId=pack.id;this.activeCourse=courseId?pack.courses.findIndex(course=>course.id===courseId):0;
        this.activeCourseId=pack.courses[this.activeCourse]!.id;
        this.editAreaId='main';this.areaRoot=undefined;this.level=level;this.state=state;this.editing=edit;this.campaignActive=prepared.active.kind==='course'&&pack.sequential&&!edit;
        this.selection.clear();this.history=[];this.redo=[];this.pathDrag=null;this.editorIndexCache=undefined;
        this.editCamera=this.camera=Math.max(0,level.spawn[0]-7);this.editY=this.cameraY=Math.max(0,level.spawn[1]-8);
        this.accumulator=0;this.clearControls();this.audio.reset(state);
    }
    private packMessage(message:string):void {this.notice=message;if(this.packPanel.open)this.packPanel.message(message);}
    exportPack(id:string):void {
        try{this.stashCourse();const pack=this.packLibrary.editable(id);this.packLibrary.check(pack);
            const url=URL.createObjectURL(new Blob([JSON.stringify(pack)],{type:'application/json'})),a=document.createElement('a');
            a.href=url;a.download=id+'.whale-pack.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.notice='地图包已导出';
        }catch(error){this.notice=String(error);}
    }
    importPack():void {
        const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
        input.onchange=()=>{const file=input.files?.[0];if(!file)return;if(file.size>32000000){this.notice='地图包文件太大';return;}
            void file.text().then(text=>{if(this.disposed)return;this.stashCourse();const pack=this.packLibrary.import(JSON.parse(text));
                this.editing=false;this.launchPack(pack.id,0,true);this.showMapPacks();this.notice='地图包已导入';
            }).catch(error=>{this.notice=String(error);});};input.click();
    }
    async save():Promise<void> {
        try{
            this.stashCourse(true);const data=saveDocument(this.packLibrary,this.documentIdentity,this.packLevel());
            const checked=new MapPackLibrary();checked.restore(data.library);
            if(JSON.stringify(data).length>4_500_000)throw Error('文档超过本地存档容量，请先导出地图包');
            await this.packSave.saveNow(data);this.packMessage('文档及地图包已保存');
        }catch(error){this.packMessage('保存失败，可导出文档：'+String(error));}
    }
    async read():Promise<void> {
        try{
            const raw=await this.packSave.load();
            const legacy=(!raw||!isDocumentSave(raw)&&raw.packs.length===0)?await this.saves.load():null;
            if(this.disposed)return;if(!raw&&!legacy){this.notice='还没有保存的文档';return;}
            const prepared=prepareDocument(raw,this.documentIdentity,legacy);this.commitDocument(prepared,true);this.notice='文档已读取';
        }catch(error){this.notice='读取失败，当前文档已保留：'+String(error);}
    }
    export() { try {
        const data = JSON.stringify(validate(this.packLevel()), null, 2), url = URL.createObjectURL(new Blob([data], { type: 'application/json' })), a = document.createElement('a');
        a.href = url;
        a.download = 'whale-island.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.notice = '关卡文件已导出';
    }
    catch (e) {
        this.notice = String(e);
    } }
    import() { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.onchange = () => { const file = input.files?.[0]; if (!file)
        return; if (file.size > 2000000) {
        this.notice = '关卡文件太大';
        return;
    } void file.text().then(text => { if (this.disposed)
        return; const level = validate(JSON.parse(text));upgradeGlassPipes(level); this.record();this.editAreaId='main';this.areaRoot=undefined; this.level = level; this.state = create(level);this.documentIdentity={kind:'standalone'}; this.editCamera = 0; this.editY = 0; this.selection.clear(); this.notice = '关卡已导入'; }).catch(e => { this.notice = String(e); }); }; input.click(); }
    coin(x: number, feet: number, size: number, time: number, offset=0, opacity=1) {
        this.scene.actor('tokens',coinFrame(time,offset),x,feet,size,false,0,0,opacity);
    }
    private drawActor(s:State,cam:number,cy:number,z:number,v:{x:number;y:number},coinTime:number){
        if(s.coop?.active){drawDust(this.scene,s.dust,cam,cy,z,v);drawP1Player(this.scene,s,cam,cy,z,v);}
        const p = s.player, victory = s.victory, winAge = victory?.age ?? 0;
        const celebrating = s.phase === 'won' && victory?.stage==='cheer' && victory?.ready && winAge > .14 && winAge < 1.4;
        const traveling=!!(s.pipe?.glass&&s.pipe.path),travelAngle=s.pipe?.angle??0,travelFlip=s.pipe?.flip??false,travelRotation=travelAngle-(travelFlip?Math.PI:0);
        const shooting=s.phase==='playing'&&!traveling&&s.shootAge<SHOT_DURATION;
        const phase=s.coop&&s.phase==='dead'&&s.coop.failed!==s.coop.active?'playing':s.phase;
        const art=playerArt(phase===s.phase?s:{...s,phase}),{atlas,frame,reference}=art,actorSize=art.size,cheerLift=art.lift*art.size/48;
        const flip=traveling?travelFlip:art.flip;
        const recoil = shooting ? -s.shootFacing * Math.sin(s.shootAge / SHOT_DURATION * Math.PI) * 3 : 0;
        const goalOpacity=s.victory?.stage==='done'?0:s.victory?.stage==='walk'?Math.min(1,Math.max(0,(s.victory.castleX-p.x)/.7)):1;
        const pipeOpacity = goalOpacity*(s.door?Math.abs(s.door.age-.35)/.35:s.pipe&&!s.pipe.glass ? Math.abs(s.pipe.age - .45) / .45 : 1);
        let playerRect;
        if (traveling||phase !== 'playing' || s.invincible <= 0 || Math.floor(s.time * 12) % 2 === 0)
            playerRect=traveling?this.scene.centeredActor(atlas,frame,v.x+(p.x+p.w/2-cam)*z,v.y+(p.y+p.h/2-cy)*z,actorSize,reference,travelRotation,1,travelFlip):this.scene.actor(atlas,frame,v.x + (p.x + p.w / 2 - cam) * z + recoil,v.y + (p.y + p.h - cy) * z+cheerLift,actorSize,flip,
                reference,s.pound==='flip'?s.poundAge/.22*Math.PI*2:phase === 'dead' ? Math.sin(s.deathAge * 9) * .15 : celebrating ? Math.sin(winAge * 15) * .08 : 0,pipeOpacity,s.starTime>0?[1,.8+.2*Math.sin(s.time*12),.85+.15*Math.cos(s.time*10),1]:undefined);
        if(s.boneTime===0)drawWearable(this.scene,s,cam,cy,z,v);
        if((s.helmet||s.shellHelmet)&&s.boneTime===0&&playerRect){const hatAtlas=s.shellHelmet?'shell-equipment':'gadgets',hatFrame=s.shellHelmet==='shell-helmet'?0:s.shellHelmet==='spike-shell-helmet'?1:7;if(traveling)this.scene.centeredActor(hatAtlas,hatFrame,v.x+(p.x+p.w/2-cam)*z+(Math.cos(travelAngle)*.22+Math.sin(travelRotation)*.12)*actorSize,v.y+(p.y+p.h/2-cy)*z+(Math.sin(travelAngle)*.22-Math.cos(travelRotation)*.12)*actorSize,actorSize*.55,hatFrame,travelRotation,1,travelFlip);else this.scene.actor(hatAtlas,hatFrame,playerRect.x+playerRect.width/2+(flip?-1:1)*actorSize*.15,playerRect.y+actorSize*.27,actorSize*.66,flip,hatFrame);}
        if(s.phase==='playing') for(const bite of s.bites) {
            const bodySize=actorSize/S,mouth={x:p.x+p.w/2+(flip?-1:1)*bodySize*.22,
                y:p.y+p.h-bodySize*(s.crouching?.40:.48)};
            const flight=biteFlight(bite,mouth,bite.age),size=40*flight.size;
            if(flight.opacity>0) this.coin(v.x+(flight.x-cam)*z,v.y+(flight.y-cy)*z+size/2,size,coinTime,0,flight.opacity);
        }
        if (shooting && s.shootAge >= SHOT_WINDUP && s.shootAge < .12) {
            const flash = (s.shootAge - SHOT_WINDUP) / (.12 - SHOT_WINDUP);
            this.scene.actor(s.power===4?'frost':'characters',s.power===4?9:15,v.x+(p.x+p.w/2+s.shootFacing*.62-cam)*z,
                v.y+(p.y+p.h-(s.crouching?.3:.6)-cy)*z+10,12+flash*14,false,s.power===4?9:15,flash*2,1-flash);
        }
        if(traveling&&s.held&&'frozen'in s.held&&s.held.frozen)drawFrozenEnemy(this.scene,s.held,v.x+(s.held.x+s.held.w/2-cam)*z,v.y+(s.held.y+s.held.h-cy)*z,z);
        if(traveling&&s.held?.kind==='shell'&&!s.held.frozen)this.scene.centeredActor('shell',0,v.x+(s.held.x+s.held.w/2-cam)*z,v.y+(s.held.y+s.held.h/2-cy)*z,44,0,travelRotation,1,travelFlip);
        return playerRect;
    }
    draw() {
        const v=this.editing?EDIT_VIEW:VIEW,z=this.editing?36:S;
        Object.assign(this.scene.board,{x:v.x,y:v.y,width:v.w,height:v.h});
        this.scene.begin();
        this.scene.fill({ x: v.x, y: v.y, width: v.w, height: v.h }, !this.state.level.classicStage&&this.state.player.x>220&&!!this.state.level.warps?.some(w=>w.to[0]>=221)&&!this.editing ? [.12, .25, .36, 1] : [180 / 255, 232 / 255, 228 / 255, 1]);
        const s = this.state, l = this.editing ? {...this.level,endZone:this.editorIndex().endZone} : s.level;
        const shaking=!this.editing&&!s.coop?s.shake:0;
        const cam=(this.editing?this.editCamera:this.camera)+Math.sin(s.time*91)*shaking*.18,cy=(this.editing?this.editY:this.cameraY)+Math.cos(s.time*109)*shaking*.1;
        const coinTime = this.editing ? this.editTime : s.time + (s.victory?.age ?? (s.phase==='dead'?s.deathAge:0));
        this.hudCoin.setVisible(!this.editing);
        this.rect(this.status,{x:this.editing?500:532,y:21,width:this.editing?574:542,height:30});
        this.musicButton.setText(this.audio.musicEnabled?'音乐开':'音乐关');this.effectsButton.setText(this.audio.effectsEnabled?'音效开':'音效关');
        for(const icon of this.coinIcons) if(icon.visible) icon.setUv(this.frames.tokens![coinFrame(coinTime)]! as [number,number,number,number]);
        const bonusRoom=!this.editing&&!l.classicStage&&s.player.x>220&&!!l.warps?.some(w=>w.to[0]>=221);
        const coinRoom=!this.editing&&l.rooms?.some(r=>s.player.x+s.player.w>r.x&&s.player.x<r.x+r.w&&s.player.y>=r.y);
        const backdrop=l.backdrop??'coast';
        if(coinRoom)this.scene.fill({x:v.x,y:v.y,width:v.w,height:v.h},[.06,.14,.24,1]);
        else if(!bonusRoom&&backdrop==='desert')drawDesertBackground(this.scene,cam,cy,z,v,backdropGround(l));
        else if(!bonusRoom&&backdrop==='night'){
            const height=13*z,im=this.extraImages['night-coast']!,uv=this.frames['night-coast']![0]!,width=Math.max(v.w,height*uv[2]!*im.naturalWidth/(uv[3]!*im.naturalHeight)),ground=l.classicStage&&l.classicStage%4===0?15:backdropGround(l);
            this.scene.fill({x:v.x,y:v.y,width:v.w,height:v.h},[.025,.07,.18,1]);
            this.scene.sprite('night-coast',0,v.x+(v.w-width)/2+Math.sin(cam*.01)*(width-v.w)/2,v.y+(ground-cy)*z-height,width,height);
        }else if(!bonusRoom&&backdrop!=='coast'){
            const frame=['castle','mountains','plains'].indexOf(backdrop),uv=this.frames.backdrops![frame]!,im=this.extraImages.backdrops!,height=13*z,width=height*uv[2]!*im.naturalWidth/(uv[3]!*im.naturalHeight),offset=((cam*z*.08)%width+width)%width;
            const ground=backdropGround(l);
            // Mirrored repeats meet at the same source edge; the horizon moves slowly.
            const cycle=Math.floor(cam*z*.08/width);
            for(let n=0;n<2;n++){
                const x=v.x-offset+n*width-(width-v.w)/2,flip=(cycle+n)%2!==0;
                this.scene.sprite('backdrops',frame+3,x,v.y,width,v.h,flip);
                this.scene.sprite('backdrops',frame,x,v.y+(ground-cy)*z-height,width,height,flip);
            }
        }
        if(l.classicStage===2||l.theme==='underground')this.scene.fill({x:v.x,y:v.y,width:v.w,height:v.h},[.01,.03,.10,.5]);
        if (!bonusRoom&&!coinRoom&&backdrop!=='night'&&backdrop!=='desert'&&l.classicStage!==2&&l.theme!=='underground'&&l.liquid?.kind!=='water') for (let i = 0; i < 4; i++)
            this.scene.sprite('world', 14, v.x + ((i * 760 - cam * 9) % 3000 + 3000) % 3000 - 200, v.y + 25 + (i % 3) * 45, 160, 100);
        for(let y=Math.max(0,Math.floor(cy)-2);y<Math.min(l.height,cy+v.h/z+2);y++)for(let x=Math.max(0,Math.floor(cam)-3);x<Math.min(l.width,cam+v.w/z+3);x++)if(l.cells[y*l.width+x]==='smile-cloud')this.scene.sprite('world',14,v.x+(x-cam-.9)*z,v.y+(y-cy-.4)*z,2.8*z,1.7*z);
        if (this.editing) for (let i = 0; i < 42; i++) {
            const vertical=i<25,offset=vertical?i:i-25;
            this.scene.fill(vertical?{x:v.x+offset*z-(this.editCamera%1)*z,y:v.y,width:1,height:v.h}:{x:v.x,y:v.y+offset*z-(this.editY%1)*z,width:v.w,height:1},[53/255,122/255,138/255,.16]);
        }
        if (!this.editing) for (const r of s.rewards) {
            if(r.kind==='giant-pearl')this.scene.actor('pearls',r.age<.4?2+Math.min(7,Math.floor(r.age/.4*8)):1,v.x+(r.x+r.w/2-cam)*z,v.y+((r.age<.4?r.originY:r.y+r.h)-cy)*z,2*z,false,1);
            else if(r.kind==='coin') this.coin(v.x+(r.x+r.w/2-cam)*z,v.y+(r.y+r.h-cy)*z,40*z/S,coinTime);
            else if(r.kind==='poison-pearl')this.scene.actor('pearls',0,v.x+(r.x+r.w/2-cam)*z,v.y+(r.y+r.h-cy)*z,44*z/S,false,0,0,1,[.75,.25,.9,1]);
            else {const art=extraArt(r.kind,coinTime);if(art)this.scene.actor(art.atlas,art.frame,v.x+(r.x+r.w/2-cam)*z,v.y+(r.y+r.h-cy)*z,44*z/S);else this.scene.actor('characters',r.kind==='growth'?12:r.kind==='fire'?13:r.kind==='turtle'?9:8,v.x+(r.x+r.w/2-cam)*z,v.y+(r.y+r.h-cy)*z,(r.kind==='turtle'?58:44)*z/S);}
        }
        if(!this.editing)drawSinkingEnemies(this.scene,s,cam,cy,z,v);
        if(!this.editing)for(const e of s.enemies)if(e.alive&&!e.frozen&&e.kind==='plant'&&e.plantMouth)drawPipePlant(this.scene,e,v.x+(e.plantMouth[0]-cam)*z,v.y+(e.plantMouth[1]-cy)*z,z,s.time);
        const pipeLayerStart=this.scene.draws.length,pipeDraws:typeof this.scene.draws=[];
        drawTerrain(this.scene,l,cam,cy,z,v,bonusRoom);
        const drawCells=editorVisibleCells(l,this.editing?this.editorIndex():{pipes:[],extended:[]},cam,cy,v.w/z,v.h/z,!this.editing);
        for(const id of drawCells){const x=id%l.width,y=Math.floor(id/l.width);
                if (bonusRoom && x < 221) continue;
                const t = l.cells[y * l.width + x]!;
                // Empty cells have no draw work; coral already belongs to the
                // terrain pass. Avoid per-cell art lookups and frozen callbacks.
                if(t==='.'||t==='smile-cloud'||t==='quicksand'||t==='cactus-body'||isCoral(t))continue;
                const px = v.x + (x - cam) * z;
                const bump = !this.editing ? s.bumps.find(b => b.x === x && b.y === y) : undefined;
                const py = v.y + (y - cy + (bump ? blockOffset(bump.age)*(bump.down?-1:1) : 0)) * z;
                if(t==='o'&&l.liquid?.kind==='water'&&y>=(l.liquidSurface??l.liquid.low))drawExtraTile(this.scene,s,l,'water',x,y,px,py,z,coinTime,this.editing);
                const art = TILE_ART[t];
                if(t==='snake-block')continue;
                if(t==='cactus'){if(this.editing)drawCactus(this.scene,{...s.player,h:l.properties?.[y*l.width+x]?.height??3,vx:-.6},px+z/2,py+z,z,coinTime);continue;}
                if(t==='snowball'){drawSnowball(this.scene,s.player,px+z/2,py+z,z);continue;}
                const liquid=l.properties?.[y*l.width+x]?.liquid;if(this.editing&&liquid)drawExtraTile(this.scene,s,l,liquid,x,y,px,py,z,coinTime,true);
                const previewState=this.editing?{...s,redOn:this.p1Editor.switchOn}:s;
                if(drawP1Tile(this.scene,previewState,l,t,x,y,px,py,z,coinTime,this.editing))continue;
                if(drawWorkshopTile(this.scene,l,t,x,y,px,py,z,coinTime,this.editing))continue;
                const p2Tile=drawP2Tile(this.scene,s,l,t,x,y,px,py,z,coinTime,this.editing);
                const advanced=p2Tile||drawAdvancedTile(this.scene,this.editing?{...s,redOn:this.p1Editor.switchOn}:s,l,t,x,y,px,py,z,this.editing,content=>{if(content==='coin')this.scene.actor('tokens',0,px+z/2,py+z*.9,z*.7);else if(content!=='empty'&&content!=='auto'){const art=extraArt(content,0);if(art)this.scene.actor(art.atlas,art.frame,px+z/2,py+z*.9,z*.8);else this.scene.actor('characters',content==='growth'?12:content==='fire'?13:content==='turtle'?9:8,px+z/2,py+z*.9,z*.8);}});
                const rendered=drawFortressTile(this.scene,s,l,t,x,y,px,py,z,coinTime,this.editing)||
                    advanced||drawExtraTile(this.scene,s,l,t,x,y,px,py,z,coinTime,this.editing);
                if(!rendered){
                    if (t === 'P') {
                        const start=this.scene.draws.length;
                        const pipe=pipeShape(l,y*l.width+x)!,cap=this.frames.mechanics![12]!,image=this.extraImages.mechanics!;
                        drawPipe(this.scene,pipe,px,py,z,cap[3]!*image.naturalHeight/(cap[2]!*image.naturalWidth),l.properties?.[y*l.width+x]?.color);
                        pipeDraws.push(...this.scene.draws.splice(start));
                    } else if (t === '?') this.scene.sprite('coins',8,px,py,z,z);
                    else if (t === 'C') {
                        const frame=checkpointFrame(coinTime,!this.editing&&!!s.litCheckpoints[y*l.width+x]);
                        const wave=!this.editing?s.flagWaves.find(w=>w.x===x&&w.y===y):undefined;
                        const angle=wave?flagWobble(wave.age,wave.direction):0;
                        const rect=checkpointRect(this.scene.sourceSize('checkpoint',frame),px+z/2,py+z,72*z/S,angle);
                        this.scene.sprite('checkpoint',frame,rect.x,rect.y,rect.width,rect.height,false,angle);
                    }
                    else if (t === 'U') this.scene.sprite('expansion',14,px,py,z,z);
                    else if (t === 'Q' || t === 'p' || t === 'q') { /* Complete pipe drawn from its P cell. */ }
                    else if(t==='E'){if(l.finish!=='castle')drawGoal(this.scene,s,x,y,px,py,z,coinTime,this.editing);}
                    else if (art !== undefined)
                        this.scene.sprite('world', art, px, py, z, z);
                    else if(t==='o') this.coin(px+z/2,py+z,40*z/S,coinTime);
                    else if (t === 'G' || t === 'F' || t === 'T' || t === 'J')
                        this.scene.actor('characters',t==='G'?12:t==='F'?13:t==='T'?9:8,px+z/2,py+z,44*z/S);
                }
                if(this.editing && (t==='?'||t==='hidden-block')) {
                    const content=l.contents?.[y*l.width+x]??'auto';
                    if(content==='coin') this.coin(px+.77*z,py+.48*z,18*z/S,coinTime);
                    else if(content!=='auto'&&content!=='empty'){const art=extraArt(content,coinTime);if(art)this.scene.actor(art.atlas,art.frame,px+.77*z,py+.48*z,18*z/S);else this.scene.actor('characters',content==='growth'?12:content==='fire'?13:content==='turtle'?9:8,px+.77*z,py+.48*z,18*z/S);}
                }
                if (t === 'E') {this.scene.actor('expansion', 15, px + (l.finish==='castle'?.5:4) * z, py + z, 3.5 * z);if(l.finish==='castle')drawGoalLock(this.scene,s,px,py,z,this.editing);}
                if(this.editing&&t==='P'&&l.properties?.[y*l.width+x]?.plant){const pipe=pipeShape(l,y*l.width+x)!;drawPipePlant(this.scene,{...s.player,kind:'plant',alive:true,held:false,cooldown:0,w:pipe.normal[0]?1.15:.8,h:pipe.normal[0]?.8:1.15,plantDirection:pipe.normal},v.x+(pipe.mouth[0]-cam)*z,v.y+(pipe.mouth[1]-cy)*z,z,0);}else if(this.editing&&t==='glass-pipe'&&l.properties?.[y*l.width+x]?.plant)this.scene.actor('creatures',0,px+z,py+z*.05,60*z/S);
            }
        if(this.editing)for(const id of this.editorIndex().snakeAnchors){const t=l.cells[id]!,x=id%l.width,y=Math.floor(id/l.width);drawWorkshopTile(this.scene,l,t,x,y,v.x+(x-cam)*z,v.y+(y-cy)*z,z,coinTime,true);}
        const glassStart=this.scene.draws.length;drawGlassRoutes(this.scene,l,cam,cy,z,v);pipeDraws.push(...this.scene.draws.splice(glassStart));
        this.scene.draws.splice(pipeLayerStart,0,...pipeDraws);
        for (const warp of l.warps ?? []) if (tile(l, warp.from[0], warp.from[1]) === 'P') {
            const bob = Math.sin(s.time * 4) * 3;
            this.coin(v.x+(warp.from[0]+1-cam)*z,v.y+(warp.from[1]-cy)*z-10+bob,18,coinTime);
        }
        if(!this.editing)drawLavaSplashes(this.scene,s,cam,cy,z,v);
        if (this.editing) {
            drawQuicksand(this.scene,l,cam,cy,z,v,coinTime);
            this.scene.actor('whale-small', 0, v.x + (l.spawn[0] + .45 - cam) * z, v.y + (l.spawn[1] + .8 - cy) * z, 50*z/S);
            const border=(x:number,y:number,w:number,h:number)=>{
                this.scene.fill({x,y,width:w,height:h},[1,.82,.32,.15]);
                for(const r of [{x,y,width:w,height:2},{x,y:y+h-2,width:w,height:2},{x,y,width:2,height:h},{x:x+w-2,y,width:2,height:h}])this.scene.fill(r,[1,.85,.4,1]);
            };
            const dx=this.drag&&this.editorTool==='select'?this.drag.end[0]-this.drag.start[0]:0,dy=this.drag&&this.editorTool==='select'?this.drag.end[1]-this.drag.start[1]:0;
            for(const id of this.selection) border(v.x+(id%l.width-cam+dx)*z,v.y+(Math.floor(id/l.width)-cy+dy)*z,z,z);
            if(this.drag&&this.editorTool==='box')border(v.x+(Math.min(this.drag.start[0],this.drag.end[0])-cam)*z,v.y+(Math.min(this.drag.start[1],this.drag.end[1])-cy)*z,(Math.abs(this.drag.start[0]-this.drag.end[0])+1)*z,(Math.abs(this.drag.start[1]-this.drag.end[1])+1)*z);
        } else {
            drawP1(this.scene,s,cam,cy,z,v);drawP2World(this.scene,s,cam,cy,z,v);
            drawFortress(this.scene,s,cam,cy,z,v);
            drawWorkshop(this.scene,s,cam,cy,z,v);
            drawCoinPops(this.scene,s,cam,cy,z,v);
            for(const stone of s.stones){if(stone.winged)this.scene.centeredActor('p1-icons',24,v.x+(stone.x+stone.w/2-cam)*z,v.y+(stone.y+stone.h*.45-cy)*z,z*stone.w*(1.35+.08*Math.sin(s.time*24)),24);this.scene.sprite('adventure',stone.phase==='idle'?3:stone.phase==='alert'||stone.phase==='return'||stone.phase==='pause'?4:5,v.x+(stone.x-cam-.1)*z,v.y+(stone.y-cy-.2)*z,(stone.w+.2)*z,(stone.h+.2)*z);}
            for(const key of s.keys)this.scene.actor('adventure',0,v.x+(key.x-cam)*z,v.y+(key.y-cy)*z,30*z/S,false,0,Math.sin(key.age*4)*.06);
            for(const c of s.turrets)drawCannon(this.scene,c,v.x+(c.x-cam)*z,v.y+(c.y-cy)*z,z,s.player.x<c.x);
            drawDust(this.scene,s.dust,cam,cy,z,v);
            for (const [index, e] of s.enemies.entries()) if (e.alive && !(e.held&&s.pipe?.glass&&s.pipe.path) && (!bonusRoom || e.x >= 221)) {
                if(e.lakitu&&e.kind==='turtle')this.scene.sprite('world',14,v.x+(e.x-.3-cam)*z,v.y+(e.y+.45-cy)*z,1.4*z,.65*z);
                drawModifiers(this.scene,e,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,z,s.time);
                if(drawP2Enemy(this.scene,e,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,z,s.time))continue;
                if(drawP1Enemy(this.scene,e,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,z,s.time))continue;
                if(e.kind==='cactus'){drawCactus(this.scene,e,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,z,e.age??s.time);continue;}
                if(e.kind==='fire-jumper'&&e.flamePhase==='wait')continue;
                if(e.frozen){drawFrozenEnemy(this.scene,e,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,z);continue;}
                if(drawWorkshopEnemy(this.scene,e,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,z*(e.modifiers?.large?2:1),s.time))continue;
                if(drawAnimatedEnemy(this.scene,e,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,ENEMY_SIZE[e.kind]*(e.modifiers?.large?2:1)))continue;
                if(e.kind==='plant'&&(e.h<.08||e.plantMouth))continue;const art=enemyArt(e,s.time,index%4);
                this.scene.actor(art.atlas,art.frame,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,art.size*(e.modifiers?.large?2:1),e.vx<0,art.reference);
            }
            for (const e of s.defeated) {
                if(e.cause==='lava'||e.cause==='sand')continue;
                if(e.kind==='cactus'){drawCactus(this.scene,e,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,z,s.time,Math.max(0,1-e.age/.75));continue;}
                const art=enemyArt(e,0);const frame=art.frame,atlas=art.atlas;
                const size=ENEMY_SIZE[e.kind]*(e.cause==='stomp'?Math.max(.05,1-e.age/.6):1);
                if(e.kind==='iron-turtle')drawIronTurtle(this.scene,e,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,size,Math.max(0,1-e.age/.75),e.angle);
                else this.scene.actor(atlas,frame,v.x+(e.x+e.w/2-cam)*z,v.y+(e.y+e.h-cy)*z,size,e.vx<0,frame,e.angle,Math.max(0,1-e.age/.75));
                for(let n=0;n<5;n++) { const angle=n*Math.PI*2/5,ease=Math.min(1,e.age/.4),radius=ease*32;
                    this.coin(v.x+(e.x+e.w/2-cam)*z+Math.cos(angle)*radius,v.y+(e.y+e.h/2-cy)*z+Math.sin(angle)*radius,12*(1-e.age/.75),coinTime,n,Math.max(0,1-e.age/.75));
                }
            }
            for(const b of s.shots)this.scene.actor(b.kind==='ice'?'frost':'mechanics',b.kind==='ice'?8:4+Math.floor(s.time*12)%2,v.x+(b.x+b.w/2-cam)*z,v.y+(b.y+b.h-cy)*z,24,false,b.kind==='ice'?8:4,b.kind==='ice'?s.time*9:0);
            const p=s.player,victory=s.victory,winAge=victory?.age??0;
            const actors=(s.coop?.players??[s]).map((_,index)=>playerAt(s,index));
            const playerRects=actors.map((_,index)=>asPlayer(s,index,()=>{
                const recovery=s.coop?.recovery[index];
                if(recovery&&s.phase==='dead'&&s.coop?.failed!==index)return undefined;
                if(s.phase!=='playing')return this.drawActor(s,cam,cy,z,v,coinTime);
                if(recovery?.kind==='waiting')return undefined;
                if(recovery?.kind==='bubble'){
                    const q=s.player,x=v.x+(q.x+q.w/2-cam)*z,y=v.y+(q.y+q.h/2-cy)*z;
                    this.scene.rescueBubble(x,y,BUBBLE_RADIUS*z);
                    return this.scene.centeredActor('whale-small',0,x,y,z*.73);
                }
                return this.drawActor(s,cam,cy,z,v,coinTime);
            }));
            for(const pop of s.coop?.pops??[])this.scene.rescueBubble(v.x+(pop.x-cam)*z,v.y+(pop.y-cy)*z,(BUBBLE_RADIUS+pop.age*2)*z,Math.max(0,1-pop.age/.28));
            const traveling=(s.coop?.players??[s]).some((_,index)=>!!playerAt(s,index).pipe?.glass);
            for(const item of s.items)if(item.alive){
                const owner=actors.find(a=>a.held===item||a.riding===item);
                if(owner?.pipe?.glass&&item.held){const art=extraArt(item.kind,s.time)!;this.scene.centeredActor(art.atlas,art.frame,v.x+(item.x+item.w/2-cam)*z,v.y+(item.y+item.h/2-cy)*z,44,art.frame,(owner.pipe.angle??0)-(owner.pipe.flip?Math.PI:0),1,!!owner.pipe.flip);}
                else{const rider=owner?.riding===item?owner:undefined,q=rider?.player;const floating=q&&item.kind==='bone-shell'&&rider.grounded&&['water','lava'].includes(tile(s.level,q.x+q.w/2,q.y+q.h+.2));const feet=q?q.y+q.h+(floating?.15:.02):item.y+item.h;drawItem(this.scene,s,item,v.x+(item.x+item.w/2-cam)*z,v.y+(feet-cy)*z,z);}
            }
            drawFrostEffects(this.scene,s,cam,cy,z,v);
            for(const fx of s.effects){if(fx.kind==='frost'||fx.kind==='snow'||fx.kind==='cactus')continue;if(drawWorkshopEffect(this.scene,fx,v.x+(fx.x-cam)*z,v.y+(fx.y-cy)*z,z))continue;if(fx.kind==='stone'){this.scene.actor('adventure',3,v.x+(fx.x-cam)*z,v.y+(fx.y-cy)*z,2*z,false,3,fx.age*4,Math.max(0,1-fx.age/.8));continue;}const opacity=Math.max(0,1-fx.age/(fx.kind==='helmet'?.65:.4)),atlas=fx.kind==='helmet'?(fx.headgear?'shell-equipment':'gadgets'):'mechanics',frame=fx.kind==='helmet'?(fx.headgear==='shell-helmet'?0:fx.headgear==='spike-shell-helmet'?1:7):fx.kind==='fire'?6+Math.min(3,Math.floor(fx.age*10)):fx.age<.13?10:fx.age<.26?11:15;this.scene.actor(atlas,frame,v.x+(fx.x-cam)*z,v.y+(fx.y-cy)*z,(fx.kind==='helmet'?44:fx.kind==='ice'?58:32)*z/S,false,frame,fx.kind==='helmet'?fx.age*4:0,opacity);}
            if(!s.coop?.recovery[0])drawClearFlag(this.scene,s,v.x+(p.x+p.w/2-cam)*z,playerRects[0]?.y??v.y+(p.y-cy)*z,z,coinTime,v.y);
            drawEnvironmentWind(this.scene,l,coinTime,cam,cy,z,v);
            if((s.areaFade??0)>0)this.scene.fill({x:v.x,y:v.y,width:v.w,height:v.h},[.03,.09,.14,(s.areaFade??0)/.5]);
            if(traveling)drawGlassRoutes(this.scene,l,cam,cy,z,v,.22);
            if (s.phase === 'won' && victory?.ready && winAge > .14 && winAge < 1.6) {
                const progress = (winAge - .14) / 1.46;
                for (let n = 0; n < 10; n++) {
                    const angle = n * Math.PI / 5, radius = 20 + progress * 65;
                    this.coin(v.x+(p.x+p.w/2-cam)*z+Math.cos(angle)*radius,
                        v.y+(p.y+p.h/2-cy)*z+Math.sin(angle)*radius-progress*20,14*(1-progress*.5),coinTime,n,1-progress);
                }
            }
            for (const f of s.fragments) this.scene.actor('world', 1, v.x + (f.x - cam) * z, v.y + (f.y - cy) * z, 18, false, 1, f.angle, Math.max(0, 1 - f.age / .8));
            drawQuicksand(this.scene,l,cam,cy,z,v,coinTime);drawDesertEffects(this.scene,s,cam,cy,z,v);
            if(s.coop)for(let i=0;i<s.coop.players.length;i++){
                if(s.coop.recovery[i]&&(s.phase==='dead'?s.coop.failed!==i:s.coop.recovery[i]?.kind==='waiting'))continue;
                const actor=playerAt(s,i);if(actor.victory?.stage==='done')continue;
                const q=actor.player,x=q.x+q.w/2;
                const crowded=s.coop.players.some((_,j)=>{const b=playerAt(s,j).player;return i!==j&&Math.abs(x-b.x-b.w/2)<.45&&Math.abs(q.y-b.y)<.7;});
                const tagX=v.x+(x-cam)*z+(crowded?(i-(s.coop.players.length-1)/2)*17:0);
                drawPlayerNumber(this.scene,i,Math.min(v.x+v.w-9,Math.max(v.x+9,tagX)),Math.max(v.y+16,playerRects[i]?.y??v.y+(q.y-cy)*z-4),!!s.coop.arrivals[i]);
            }
            if(s.powFlash>0)this.scene.fill({x:v.x,y:v.y,width:v.w,height:v.h},[.8,.95,1,s.powFlash*.8]);
            if (s.phase === 'dead') {
                const shade = Math.min(.65, Math.max(0, (s.deathAge - .65) * .65));
                this.scene.fill({ x: v.x, y: v.y, width: v.w, height: v.h }, [.025, .06, .12, shade]);
            }
        }
        if(this.editing){drawEnvironmentWind(this.scene,l,coinTime,cam,cy,z,v);drawP1Overlay(this.scene,l,this.selection,cam,cy,z,v,this.p1Editor.preview);if(this.p1Editor.preview&&[...this.selection].some(id=>l.properties?.[id]?.area))drawAreaEntryPreview(this.scene,this.editAreaId==='main'?l:this.areaRoot??l,l,this.selection,v);}
        drawCourseEdge(this.scene,l,this.editing?l.endZone?.right??l.width:courseBounds(l,s.player).right,cam,z,v,this.editing);
        const winFinished=s.phase==='won'&&s.victory?.stage==='done'&&(!s.coop||s.coop.players.every((_,i)=>playerAt(s,i).victory?.stage==='done'));
        this.banner.setVisible(!this.editing && (winFinished || (s.phase === 'dead' && s.deathAge > .9)));
        const bannerAge = s.phase === 'dead' ? s.deathAge - .9 : (s.victory?.age ?? 0) - 1.5;
        this.rect(this.banner, { x: 360, y: 340 + 24 * Math.max(0,1-bannerAge/.25), width: 560, height: 100 });
        this.banner.setText(s.phase==='dead'&&s.coop?(s.gameOver?'生命用尽 · R 重新开始':s.timeRemaining===0&&s.level.progress?.timeLimit?'时间到 · R 全队重试':'全队倒下了 · R 从检查点重试'):s.phase === 'won' ? (this.campaignActive?(this.nextDestination()?'准备进入下一关……':this.packLibrary.get(this.activePackId).title+'全部完成！  E 制造关卡'):'抵达星海！  R 重新出发 / E 制造关卡') : '任务失败  ·  R 从检查点重试');
        this.mode.setText(this.editing ? '试玩  E' : '编辑器  E');
        this.pause.setText(this.paused ? '继续 P' : '暂停 P');
        this.pause.setVisible(!this.editing);
        this.editorChrome.forEach(n => n.setVisible(this.editing));
        this.mapHeightLabel.setText(`高度 ${l.height}`);
        this.paletteTitle.setText(`场景 ${this.palettePage+1}/${categoryPages(this.paletteCategory)}`);
        this.categoryButtons.forEach((button,n)=>this.highlight(button,n===this.paletteCategory));
        this.paletteNodes.forEach(p=>p.nodes.forEach(n=>n.setVisible(this.editing&&p.category===this.paletteCategory&&p.page===this.palettePage)));
        this.toolButtons.forEach((b,i)=>this.highlight(b,TOOLS[i]===this.selected));
        this.toolbarButtons.forEach(({button,tool})=>this.highlight(button,this.editorTool===tool,'#aa6175'));
        const questionIds=[...this.selection].filter(id=>CONTAINER_TILES.has(l.cells[id]!)), first=questionIds[0], firstContent=first===undefined?null:l.contents?.[first]??(l.cells[first]==='cannon'?'cannonball':l.cells[first]==='ice'?'empty':'auto');
        const content=questionIds.every(id=>(l.contents?.[id]??(l.cells[id]==='cannon'?'cannonball':l.cells[id]==='ice'?'empty':'auto'))===firstContent)?firstContent:null;
        const propertyId=this.propertyIds()[0],propertyKind=propertyId===undefined?'':l.cells[propertyId]!,props=propertyId===undefined?{}:l.properties?.[propertyId]??{};
        this.inspector.setText(questionIds.length?`${NAMES[TOOLS.indexOf(l.cells[first!]!)]??'方块'} × ${questionIds.length} · ${elementOrigin(l.cells[first!]!)}`:propertyId!==undefined?`${NAMES[TOOLS.indexOf(propertyKind as Tile)]??'机关设置'} · ${elementOrigin(propertyKind as Tile)}`:`${NAMES[TOOLS.indexOf(this.selected)]??'元素'} · ${elementOrigin(this.selected)}`);
        this.inspector.setVisible(this.editing);
        this.contentHint.setText(questionIds.length?`道具/敌人 ${this.contentPage+1}/${Math.ceil(CONTENTS.length/8)}`:propertyId!==undefined?'配置选中机关':'点击元素配置内容');
        this.propertyLabels.link!.setText(`连接编号 ${props.link??1}`);this.propertyLabels.length!.setText(`${propertyKind==='moving-platform'?'平台长度':'火滚长度'} ${props.length??4}`);this.propertyLabels.speed!.setText(propertyKind==='moving-platform'?`移动速度 ${props.speed??2} 格/s`:`转速 ${props.speed??1.5} rad/s`);this.propertyLabels.plant!.setText(propertyKind==='plant'?(props.mode==='pipe'?'食人花：伸缩':'食人花：固定'):(props.plant?'管内食人花：有':'管内食人花：无'));
        this.propertyLabels.height!.setText(propertyKind==='cactus'?`仙人球 ${props.height??3} 层`:`高度 ${props.height??2} 格`);const advancedPanel=this.p1Editor.update(),basicEditing=this.editing&&!advancedPanel;this.contentHint.setVisible(basicEditing&&(questionIds.length>0||propertyId!==undefined)&&propertyKind!=='cannon'&&propertyKind!=='cactus'&&propertyKind!=='ice'&&propertyKind!=='ice-solid');
        this.fontSizes.set(this.inspector,12);
        this.propertyLabels.drop!.setText(`掉落：${props.drop==='coin'?'Token金币':props.drop==='key'?'钥匙':'无'}`);
        this.ruleButton.setText(`规则：${rulesFor(l).rewards==='score'?'计分':'旧关金币'} · ${rulesFor(l).freezing==='timed'?'计时解冻':'永久冻结'}`);
        this.fontSizes.set(this.ruleButton,11);
        this.propertyLabels.iceGrip!.setText(`光滑冰面：${props.slippery===false?'关':'开'}`);this.propertyLabels.snakeLength!.setText(`蛇砖长度 ${props.length??4} 格`);this.propertyLabels.snakeRoute!.setText('路线 · 每秒一格');
        this.propertyLabels.jumpHeight!.setText(`最小行程 ${props.jumpHeight??4} 格`);this.propertyLabels.period!.setText(`等待间隔 ${props.period??3} 秒`);
        this.propertyLabels.direction!.setText(`石头方向 ${props.direction==='left'?'←':props.direction==='right'?'→':'↓'} · 2×2`);
        this.propertyLabels.pipe!.setText(`管线 ${props.path?.slice(1).reduce((sum,p,n)=>sum+Math.abs(p[0]-props.path![n]![0])+Math.abs(p[1]-props.path![n]![1]),0)??0} 格 · 双向`);this.propertyLabels.glassPlant!.setText(props.plant?'入口食人花：有':'入口食人花：无');
        this.propertyLabels.pipeRotation!.setText(`管口朝${['上','右','下','左'][(props.rotation??0)/90]} · ${props.rotation??0}°`);
        this.propertyNodes.forEach(({node,kinds})=>node.setVisible(basicEditing&&(!questionIds.length||propertyKind==='cannon'||propertyKind==='ice'||propertyKind==='ice-solid')&&kinds.includes(propertyKind)));
        this.contentChrome.forEach(n=>n.setVisible(basicEditing&&questionIds.length>0));
        this.contentPages.forEach(p=>p.nodes.forEach(n=>n.setVisible(basicEditing&&questionIds.length>0&&p.page===this.contentPage)));
        this.contentButtons.forEach((b,i)=>this.highlight(b,CONTENTS[i]===content));
        this.selectionHints.forEach(n=>n.setVisible(basicEditing&&propertyId!==undefined));
        this.backdropNodes.forEach(n=>n.setVisible(basicEditing&&!questionIds.length&&propertyId===undefined));
        this.backdropButtons.forEach(({button,value})=>this.highlight(button,(l.backdrop??'coast')===value));
        this.rect(this.hint,{x:24,y:this.editing?758:112,width:1230,height:30});
        const lastScore=s.scorePops.findLast(pop=>pop.oneUp)??s.scorePops.at(-1),clear=conditionProgress(s),hasCondition=!!s.level.condition;
        this.rect(this.scoreBanner,hasCondition?{x:36,y:158,width:900,height:30}:{x:1060,y:150,width:186,height:30});
        const clearColor=hasCondition&&clear.failed?'#ff9eb4':lastScore?.oneUp||hasCondition&&clear.done?'#ffe387':'#e6fbf8',clearBackground=hasCondition||lastScore?.oneUp?'#173f50':'#00000000';
        if(this.scoreBanner.style.color!==clearColor||this.scoreBanner.style.backgroundColor!==clearBackground)this.scoreBanner.setStyle({color:clearColor,backgroundColor:clearBackground,radius:8});
        this.scoreBanner.setVisible(!this.editing&&(!!lastScore||hasCondition));this.scoreBanner.setText([hasCondition?`${clear.failed?'条件失败':clear.done?'条件达成':'通关条件'} · ${clear.text}`:'',lastScore?`${lastScore.chain>1?'连击 ×'+lastScore.chain+'  ':''}${lastScore.oneUp?'1UP':'+'+lastScore.points}`:''].filter(Boolean).join('  |  '));
        this.status.setText(this.editing ? `LEVEL LAB  /  ${l.name}  /  ${Math.floor(cam)} m` : `得分 ${s.score}  金币 ${s.coins.toString().padStart(3, '0')}    ${PLAYER_FORMS[s.power].hudLabel}    ${s.level.progress?.timeLimit?'剩余 '+Math.ceil(s.timeRemaining)+'s':Math.floor(s.time)+'s'}  ${s.pTime>0?'P '+Math.ceil(s.pTime)+'s  ':''}${s.starTime>0?'★ '+Math.ceil(s.starTime)+'s  ':''}${s.redOn?'红 ': '蓝 '}${s.boneTime>0?'骨头 '+Math.ceil(s.boneTime)+'s  ':s.riding?.kind==='bone-shell'?'骨头龟壳  ':''}${s.shellHelmet==='shell-helmet'?'龟壳帽  ':s.shellHelmet==='spike-shell-helmet'?'尖刺龟壳帽  ':s.helmet?'铁盆  ':''}${s.keys.length?'钥匙 '+s.keys.length+'  ':''}${s.phase === 'won' ? '抵达星海！' : s.phase === 'dead' ? '按 R 重试' : this.paused ? '暂停' : l.name}`);
        const entry=[...this.selection].map(id=>l.properties?.[id]).find(p=>p?.area);const wear=s.wearable;const recoveryText=s.phase==='playing'?s.coop?.recovery.flatMap((r,i)=>r?[`P${i+1} ${r.kind==='bubble'?'泡泡待救':'等待复活'}`]:[]).join(' · '):'';this.p2Hud.setVisible(this.editing||!!(s.coop||wear||s.level.progress?.lives||s.rootLevel?.areas||s.level.areas));this.p2Hud.setText(this.editing?`${this.editAreaId==='main'?'主区域':this.editAreaId} · ${l.width} × ${l.height}${entry?' → '+entry.area+' ('+(entry.targetX??2)+', '+(entry.targetY??2)+')':''}`:[l.classicStage?'初代 '+classicStageName(l.classicStage-1):'',s.coop?`协作 ${s.coop.players.length} 人 · 到达 ${s.coop.arrivals.filter(Boolean).length}/${s.coop.players.length}`:'',recoveryText,s.level.progress?.lives?'生命 '+s.lives:'',wear?P2_NAMES[P2_TOOLS.indexOf(wear.kind)]+(wear.kind==='propeller-box'||wear.kind==='pow-box'?' '+wear.uses+' 次':wear.kind==='cannon-box'?' 蓄力 '+Math.round(wear.charge*100)+'%':wear.kind==='bullet-mask'&&wear.active?s.swimming?' 水中持续':' '+Math.ceil(wear.flight)+'s':wear.kind==='goomba-mask'?wear.exposed>0?' 已暴露':' 伪装中':''):'',s.currentArea!=='main'?'副区 '+s.level.name:s.level.areas?'主区域':''].filter(Boolean).join(' · '));
        this.hint.setText(this.notice || (this.editing ? '元素翻页 · 单选拖拽 · 框选组合 · 点击配置机关 · 方向键平移 / Shift 滚轮垂直 · Ctrl C / V 复制粘贴 · E 试玩' : (s.coop?'全员抵达终点即可通关 · 在设置中配置每位玩家的键盘和手柄  |  ':`${this.controls.players[0]!.keys.map(keyLabel).slice(0,2).join(' / ')} 移动 · ${keyLabel(this.controls.players[0]!.keys[4]!)} 跳跃 · ${keyLabel(this.controls.players[0]!.keys[6]!)} 抱物 · ${keyLabel(this.controls.players[0]!.keys[7]!)} 发射 / 投掷  |  `) + s.notice));
    }
    destroy() { if (this.disposed)
        return; this.disposed = true;this.removeAudioSession?.();this.audio.dispose(); this.abort.abort(); this.resize?.disconnect(); this.engine.stop(); this.world.destroy(); this.engine.destroy(); }
}
const game = new WhaleMaker(document.getElementById('whale-board') as HTMLCanvasElement);
const disposeGamepad = installGamepad('whale-maker',()=>!game.editing||!!game.settingsPanel?.open||!!game.packPanel?.open);
window.addEventListener('pagehide', e => { if (!e.persisted) {
    disposeGamepad();
    game.destroy();
} }, { signal: game.abort.signal });
void game.init().catch(error => { game.destroy(); document.body.dataset.renderStatus = 'failed'; console.error(error); });
