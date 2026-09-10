import {SkyStrikeAudio, SKY_AUDIO_SETTINGS_KEY} from '../../../sky-strike/audio/SkyStrikeAudio';
import {SkyStrikeBrowserAudio} from '../../../sky-strike/audio/browser';
import {SKY_SOUND_IDS} from '../../../sky-strike/audio/synthesis';
import { SkyStrikeLocale, SKY_LANGUAGE_KEY, type SkyLanguage } from '../../../sky-strike/i18n';
import { HaiyueEngine, World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { MemorySaveBackend } from '@haiyue/engine/save';
import { SkyStrikeGame } from '../../../sky-strike/SkyStrikeGame';
import { SkyStrikeBattleLayer, loadSkySprites } from '../../../sky-strike/battleLayer';
import { SkyStrikeGuiHud } from '../../../sky-strike/guiHud';
import { ENEMY_DEFINITIONS } from '../../../sky-strike/rules';
import { loadSkyStrikeLevels } from '../../../sky-strike/levels/loader';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const check = (value: boolean, message: string) => { if (!value) throw new Error(message); };
const result = document.querySelector<HTMLElement>('#result')!;
async function run() {
  const canvas = document.querySelector('canvas')!;
  const engine = new HaiyueEngine({ canvas, msaaSamples: 4, devicePixelRatio: () => 1 }); await engine.init();
  const world = new World('Sky native browser verification');
  const battle = new SkyStrikeBattleLayer(engine, await loadSkySprites('../../../sky-strike/')); world.addSystem(battle);
  localStorage.removeItem(SKY_LANGUAGE_KEY);
  const locale = new SkyStrikeLocale(localStorage);
  const hud = new SkyStrikeGuiHud(world, id => battle.guiImage(id), undefined, locale);
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  const levels = await loadSkyStrikeLevels(async source => (await fetch(`../../../sky-strike/${source}`)).json());
  const haptics: string[] = [];
  const audioBackend = new SkyStrikeBrowserAudio(); await audioBackend.load('../../../sky-strike/');
  localStorage.removeItem(SKY_AUDIO_SETTINGS_KEY);
  const audio = new SkyStrikeAudio(audioBackend,localStorage);
  const game = new SkyStrikeGame(canvas, battle, engine, world, { ui: hud, locale, levels, audio, haptic: event => haptics.push(event), keyboard: true, acceptsGameplayInput: (_x,y) => y >= 94 && y <= innerHeight - 94, saveBackend: new MemorySaveBackend() });
  await game.init();
  const integration = new RenderIntegration(engine); world.addRuntimeIntegration(integration); integration.registerAll(world);
  let frames = 0;
  const update = ({ detail: { time, delta } }: { detail: { time: number; delta: number } }) => {
    game.update(16); world.update(frames * 16, 16); frames++;
  };
  engine.on('update', update); engine.run(); await wait(500);
  const scene = new URLSearchParams(location.search).get('scene');
  const send = (type: string, x: number, y: number) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, button: 0 }));
  const panelHeight = Math.min(720, Math.max(280, innerHeight - 36));
  const panelWidth = Math.min(410, innerWidth - 24), panelLeft = (innerWidth - panelWidth) / 2;
  const arrowSize = Math.max(48, Math.min(64, panelWidth * 0.16));
  const arrowY = (innerHeight - panelHeight) / 2 + panelHeight * 0.36;
  const click = async (x: number,y: number) => { send('pointerdown',x,y); await wait(40); send('pointerup',x,y); await wait(80); };
  await click(panelLeft + panelWidth - 4 - arrowSize / 2, arrowY);
  check(game.snapshot().selectedLevel === 1, 'skinned next button');
  await click(panelLeft + 4 + arrowSize / 2, arrowY);
  check(game.snapshot().selectedLevel === 0, 'skinned previous button');
  const mission=Number(new URLSearchParams(location.search).get('mission')??1);
  for(let i=1;i<mission;i++)await click(panelLeft + panelWidth - 4 - arrowSize / 2, arrowY);
  check(game.snapshot().selectedLevel===mission-1,'requested mission carousel');
  const language = (new URLSearchParams(location.search).get('lang') ?? 'zh') as SkyLanguage;
  if (scene === 'options' || language !== 'zh') {
    await click(panelLeft+panelWidth-32,(innerHeight-panelHeight)/2+panelHeight*0.035+24);
    check(game.snapshot().optionsOpen, 'gear opens options');
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); await wait(40);
    check(game.snapshot().phase==='ready','options blocks launch keyboard');
    const selected=game.snapshot().selectedLevel;
    send('pointerdown',panelLeft+30,arrowY);send('pointerup',panelLeft+panelWidth-30,arrowY);await wait(60);
    check(game.snapshot().selectedLevel===selected,'options blocks carousel swipes');
    const optionsHeight=Math.min(640,innerHeight-48), top=(innerHeight-optionsHeight)/2;
    await click(innerWidth/2,top+optionsHeight*(0.3525+['zh','en','ja'].indexOf(language)*0.125));
    check(game.snapshot().language===language,'language applies immediately');
    check(new SkyStrikeLocale(localStorage).language===language,'language persists across new instance');
    if(scene==='options') {
      await click(innerWidth/2,top+optionsHeight*0.7425);check(!audio.enabled,'GUI sound mute');
      const cw=Math.min(400,innerWidth-24);await click((innerWidth-cw)/2+cw*.205,top+optionsHeight*.8325);check(audio.volume===.55,'GUI volume down');
      await click((innerWidth-cw)/2+cw*.795,top+optionsHeight*.8325);check(audio.volume===.65,'GUI volume up');
      await click(innerWidth/2,top+optionsHeight*.7425);check(audio.enabled,'GUI sound enable');
      check(JSON.parse(localStorage.getItem(SKY_AUDIO_SETTINGS_KEY)!).volume===.65,'GUI audio persistence');
      engine.stop();result.textContent=JSON.stringify({status:'passed',checks:['settings-modal','language-persistence','input-isolation'],state:game.snapshot()});result.dataset.status='passed';return;
    }
    await click(innerWidth/2,top+optionsHeight*0.9325);check(!game.snapshot().optionsOpen,'close settings');
  }
  if (scene === 'menu') {
    if(new URLSearchParams(location.search).get('mission')==='7') {const carousel=(game as any).levelCarousel;check(carousel.bossImage.rect.x+carousel.bossImage.rect.width*0.85<carousel.companionImage.rect.x,'twin preview hulls have separate positions');}
    engine.stop(); result.textContent = JSON.stringify({ status:'passed', checks:['engine-gui-menu','skinned-next','skinned-previous'], state:game.snapshot() }); result.dataset.status='passed'; return;
  }

  const startY = (innerHeight - panelHeight) / 2 + panelHeight * 0.91;
  send('pointerdown', innerWidth / 2, startY); send('pointerup', innerWidth / 2, startY); await wait(150);
  check(game.snapshot().phase === 'playing', 'GUI start');
  if (scene === 'audio') {
    engine.stop();const f=game as any;f.levelTimeline=[];f.enemies=[];f.enemyBullets=[];f.player.invulnerableMs=999999;
    check(audioBackend.snapshot().buffers===13 && audioBackend.snapshot().error===null,'all real WAV buffers decoded');
    audio.resume();await wait(80);check(audioBackend.snapshot().state==='running','WebAudio unlocked');
    for(const form of ['basic','red','blue']){f.weaponForm=form;f.player.fireCooldownMs=0;f.pointerFiring=true;game.update(16);check(audioBackend.snapshot().voices>0,'game fires '+form+' sound');audio.stop();}
    f.weaponForm='purple';game.update(16);check(audio.snapshot().loops===1,'game starts laser');
    for(let i=0;i<70;i++){game.update(16);audio.play('bomb');audio.play('explosion-large');audio.play('shot-enemy');}
    check(audioBackend.snapshot().voices<=12&&audioBackend.snapshot().error===null,'dense effects obey voice budget without failure');
    check(audio.snapshot().loops===1,'loop survives higher-impact effects');
    f.pointerFiring=false;game.update(16);check(audio.snapshot().loops===0,'laser release');
    audio.stop();for(const id of SKY_SOUND_IDS){audio.update(500);audio.play(id);check(audioBackend.snapshot().voices>0,'play '+id);audio.stop();}
    f.pointerFiring=true;game.update(16);game.suspend();await wait(80);check(audioBackend.snapshot().voices===0&&audioBackend.snapshot().state==='suspended','background silences audio');
    f.togglePause();await wait(80);check(audioBackend.snapshot().state==='running','resume after background');
    audio.pause();audio.resume();audio.pause();audio.resume();await wait(100);check(audioBackend.snapshot().state==='running','rapid pause/resume keeps latest intent');
    audio.settings(false);check(audioBackend.snapshot().voices===0,'mute stops all voices');audio.settings(true,.65);
    const beforeDispose=audio.snapshot();game.dispose();await wait(30);check(audioBackend.snapshot().state==='closed'&&audioBackend.snapshot().voices===0,'dispose closes audio');
    result.textContent=JSON.stringify({status:'passed',checks:['13-decoded-effects','game-weapon-audio','laser-lifecycle','12-voice-budget','background-resume','rapid-resume','mute-dispose'],audio:beforeDispose});result.dataset.status='passed';return;
  }
  if (scene === 'fighter-aim') {
    engine.stop();const f=game as any;f.levelTimeline=[];f.enemies=[];f.enemyBullets=[];f.playerBullets=[];f.boss=null;f.player.x=400;f.player.y=760;f.player.invulnerableMs=999999;
    const spawn=(id:string,x:number,y:number)=>{const e=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id===id),x,y);e.phaseOffset=0;e.fireCooldownMs=240;return e;};
    const scout=spawn('scout',80,400);f.updateEnemies(16);
    check(scout.rotation<0&&Math.abs(scout.rotation)<.08,'fighter smoothly begins turning toward player');check(f.enemyBullets.length===0,'no early shot before windup');
    const frozen=scout.rotation;f.phase='paused';f.update(34);check(scout.rotation===frozen,'pause freezes aiming');f.phase='playing';
    let elapsed=16;while(!f.enemyBullets.length&&elapsed<1600){const before=scout.rotation;f.updateEnemies(16);elapsed+=16;check(Math.abs(scout.rotation-before)<=.076801,'bounded angular speed');}
    check(f.enemyBullets.length===1&&elapsed>=240,'aimed shot occurs after lead animation');const b=f.enemyBullets[0],dx=b.x-scout.x,dy=b.y-scout.y;
    check(Math.abs(dx*b.vy-dy*b.vx)<1e-6,'bullet emerges along rotated nose');check(dx>0&&b.vx>0&&b.vy>0,'nose and shot face player');
    const after=scout.rotation;for(let i=0;i<8;i++)f.updateEnemies(16);check(scout.rotation===after,'muzzle flash holds firing pose');
    for(let i=0;i<35;i++)f.updateEnemies(16);check(Math.abs(scout.rotation)<.001,'fighter smoothly returns to cruise heading');
    f.enemies=[];f.enemyBullets=[];const delayed=spawn('dart',80,500);delayed.rotation=Math.PI;delayed.fireCooldownMs=0;
    f.updateEnemies(16);check(f.enemyBullets.length===0,'unready fighter waits for turn rather than snapping and firing');
    for(let i=0;i<100&&!f.enemyBullets.length;i++)f.updateEnemies(16);check(f.enemyBullets.length===1,'late alignment fires one shot without burst catch-up');
    f.enemies=[];f.enemyBullets=[];f.combatEffects.clear();
    for(const [id,x,y] of [['scout',75,300],['dart',390,250],['drone',115,500],['bomber',370,450],['stealth',110,150],['gunship',310,130]])spawn(id as string,x as number,y as number);
    const stage=new URLSearchParams(location.search).get('stage');for(let i=0;i<(stage==='turn'?5:17);i++)f.updateEnemies(16);
    f.phase='paused';f.syncHud();engine.run();await wait(160);engine.stop();
    result.textContent=JSON.stringify({status:'passed',checks:['prefire-turn','bounded-shortest-arc','rotated-muzzle','aligned-shot','pause-aim','firing-pose-hold','return-to-cruise','delayed-alignment-no-catch-up'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if (scene === 'mining' || scene === 'mining-rules' || scene === 'asteroid-belt' || scene === 'mining-live') {
    engine.stop(); const f=game as any;
    const reset=()=>{f.startSortie();f.beginLevel(7);f.levelTimeline=[];f.enemies=[];f.boss=null;f.twins=null;
      f.enemyBullets=[];f.playerBullets=[];f.player.invulnerableMs=0;f.player.health=100;f.player.lives=3;f.player.x=240;f.player.y=820;
      f.asteroids.clear();f.spaceBackdrop.select('asteroid-forge',true);f.spaceBackdrop.update(22000);f.backgroundTransitionMs=9000;};
    const bullet=(x:number,y:number,hostile=false,damage=10)=>({x,y,vx:0,vy:0,radius:4,damage,hostile,color:hostile?'#ff415e':'#48a7ff'});
    const spawn=(id:string,x=240,y=150)=>{const e=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id===id),x,y);e.entered=true;return e;};
    reset();haptics.length=0;f.damagePlayer(10);check(haptics.join()==='player-hit','accepted damage emits light feedback');
    f.damagePlayer(100);check(haptics.length===1,'invulnerability suppresses damage feedback');
    f.player.invulnerableMs=0;f.damagePlayer(100);check(haptics.join()==='player-hit,player-destroyed','life loss emits strong feedback once');
    reset();haptics.length=0;f.bombs=0;f.activateBomb();check(haptics.length===0,'empty bomb does not vibrate');
    f.bombs=2;f.activateBomb();f.activateBomb();check(haptics.join()==='bomb','only successfully released bomb vibrates');
    reset();let rock=f.asteroids.spawn(240,500,80),health=rock.health;
    f.playerBullets.push(bullet(240,500));f.resolveCollisions();check(rock.health===health-10&&f.playerBullets.length===0,'player bullet damages rock');
    f.player.invulnerableMs=100;f.enemyBullets.push(bullet(240,500,true,20));f.resolveCollisions();check(rock.health===health-30&&f.enemyBullets.length===0,'hostile bullets hit neutral cover during invulnerability');
    reset();f.asteroids.spawn(100,500,64);for(let i=0;i<12;i++)f.enemyBullets.push(bullet(240,820,true,100));
    f.resolveCollisions();check(f.player.lives===2,'lethal bullet cleanup safely handles remaining projectiles');
    reset();rock=f.asteroids.spawn(240,820,64);f.resolveCollisions();check(f.player.lives===2&&f.player.health===100,'rock collision deals exactly 100 HP and loses one life');
    check(f.asteroids.rocks.length===0,'contact destroys rock');
    rock=f.asteroids.spawn(240,820,64);f.resolveCollisions();check(f.player.lives===2,'contact respects respawn invulnerability');
    reset();rock=f.asteroids.spawn(240,600,64);const enemy=spawn('scout',240,450),hp=enemy.hitPoints;
    f.playerBullets.push({...bullet(240,400),previousX:240,previousY:800});f.resolveCollisions();check(enemy.hitPoints===hp&&rock.health<rock.maxHealth,'nearest rock intercepts a fast bullet before enemy');
    reset();rock=f.asteroids.spawn(240,820,64);rock.previousX=240;rock.previousY=700;rock.y=920;f.resolveCollisions();check(f.player.lives===2,'fast thrown rock cannot tunnel through player');
    reset();rock=f.asteroids.spawn(240,710,64);f.weaponForm='purple';f.weaponLevel=3;f.laserFiring=true;f.updatePlayerLaser(100);check(rock.health<rock.maxHealth,'player laser damages asteroid');
    reset();rock=f.asteroids.spawn(240,620,100);f.activateBomb();check(f.asteroids.rocks.length===0,'bomb clears rocks in radius');
    reset();haptics.length=0;const elite=spawn('fission-elite');f.damageEnemy(f.enemies.indexOf(elite),elite,99999);check(haptics.join() === 'elite-defeated','elite haptic once');
    const boss=spawn('ore-reaper');rock=f.asteroids.spawn(100,200,64);f.updateAsteroids(16);f.damageEnemy(f.enemies.indexOf(boss),boss,99999);
    check(haptics.join() === 'elite-defeated,boss-defeated','boss haptic once');check(f.asteroids.rocks.length===0&&f.asteroids.arms.length===0,'boss victory clears rocks and arms');
    reset();haptics.length=0;spawn('twin-red');const pair=[...f.twins];f.damageEnemy(f.enemies.indexOf(pair[0]),pair[0],99999);
    check(haptics.length===0,'single downed twin has no victory haptic');f.damageEnemy(f.enemies.indexOf(pair[1]),pair[1],99999);check(haptics.join()==='boss-defeated','twin victory emits one haptic');
    reset();f.levelElapsedMs=9499;f.updateAsteroids(16);check(f.asteroids.rocks.length===0,'belt not before scheduled time');
    f.levelElapsedMs=10000;f.updateAsteroids(16);check(f.asteroids.rocks.length===1,'mid-level belt activates');
    for(let i=0;i<80;i++)f.updateAsteroids(16);f.phase='paused';const before=JSON.stringify(f.asteroids.rocks);f.update(34);check(before===JSON.stringify(f.asteroids.rocks),'pause freezes rocks');
    f.returnHome();check(f.asteroids.rocks.length===0&&f.asteroids.arms.length===0,'home clears hazard state');
    reset();f.levelElapsedMs=16000;f.player.invulnerableMs=999999;
    if(scene==='mining-live') {
      f.beginLevel(7);f.player.invulnerableMs=999999;const seen=new Set();let maxRocks=0,maxThrown=0;
      for(let i=0;i<4500;i++) {f.update(16);maxRocks=Math.max(maxRocks,f.asteroids.rocks.length);
        for(const rock of f.asteroids.rocks)if(rock.thrown)seen.add(rock);maxThrown=Math.max(maxThrown,f.asteroids.rocks.filter((r:any)=>r.thrown).length);}
      check(f.boss?.definition.id==='ore-reaper'&&f.boss.entered,'scheduled miner enters battle');
      check(maxRocks>=12&&maxRocks<=28,'dense scheduled belt stays bounded');check(seen.size>=5,'live boss repeatedly grabs and throws actual rocks');
      check(f.enemyBullets.length>0,'mining boss also fires bullets');f.phase='paused';f.syncHud();engine.run();await wait(160);engine.stop();
      result.textContent=JSON.stringify({status:'passed',checks:['full-level-timeline','72-seconds-live-simulation','repeated-real-rock-throws','boss-projectiles','bounded-hazards'],maxRocks,maxThrown,throws:seen.size,state:game.snapshot()});result.dataset.status='passed';return;
    }
    if(scene!=='asteroid-belt') {const miner=spawn('ore-reaper');miner.hitPoints=1200;
      for(const x of [65,160,320,415])for(const y of [200,290]){const r=f.asteroids.spawn(x,y,42+(x%60));r.vx=r.vy=0;}
      const stage=new URLSearchParams(location.search).get('stage');
      for(let i=0;i<(stage==='windup'?58:110);i++)f.updateAsteroids(16);
      if(stage==='windup')check(f.asteroids.arms.some((a:any)=>a.phase==='windup'),'visible arm windup');
      else check(f.asteroids.rocks.some((r:any)=>r.thrown),'visible thrown asteroid');
    }
    for(let i=0;i<14;i++)f.asteroids.spawn(35+(i*117)%410,380+(i*83)%510,32+(i*19)%76);
    f.enemyBullets.push(bullet(165,570,true),bullet(300,720,true));
    f.phase='paused';f.syncHud();engine.run();await wait(160);engine.stop();
    check(game.snapshot().rendering.frameTextureUploads===0,'static asteroid textures');
    result.textContent=JSON.stringify({status:'passed',checks:['both-sides-hit-rocks','size-health','100-contact-damage','swept-nearest-hit','laser-and-bomb','pause-and-home-cleanup','haptics-once','damage-death-bomb-haptics','mining-render'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if (scene === 'space') {
    engine.stop();const f=game as any,params=new URLSearchParams(location.search),theme=Number(params.get('theme')??0);
    f.levelTimeline=[];f.enemies=[];f.enemyBullets=[];f.playerBullets=[];f.twins=null;f.boss=null;f.elapsedMs=20000;
    f.beginLevel(theme);f.levelTimeline=[];f.spaceBackdrop.select(levels[theme]!.id,true);
    f.spaceBackdrop.update(Number(params.get('age')??18000));
    const next=params.get('next');
    if(next!==null) {
      const before=f.spaceBackdrop.snapshot();f.beginLevel(Number(next));f.levelTimeline=[];
      check(JSON.stringify(before.weights)===JSON.stringify(f.spaceBackdrop.weights()),'level transition starts continuously');
      const fade=Number(params.get('fade')??4500);f.spaceBackdrop.update(fade);f.backgroundTransitionMs=fade;
      check(Math.abs(f.spaceBackdrop.weights().reduce((a:number,b:number)=>a+b,0)-1)<1e-9,'fade retains exposure');
    }
    f.player.x=Number(params.get('playerX')??240);f.player.invulnerableMs=10000;
    // Keep a representative enemy/bullets over the new backdrop to check contrast.
    const bossId=levels[next===null?theme:Number(next)]!.bossId;
    f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id===bossId));
    for(const e of f.enemies){e.y=180;e.entered=true;}
    f.enemyBullets.push({x:180,y:570,vx:0,vy:0,radius:6,damage:10,hostile:true,color:'#ff415e'},
      {x:300,y:690,vx:0,vy:0,radius:6,damage:10,hostile:true,color:'#48a7ff'});
    f.phase='paused';f.syncHud();const before=f.spaceBackdrop.snapshot();f.update(34);
    check(f.spaceBackdrop.snapshot().ageMs===before.ageMs,'pause freezes background travel');
    engine.run();await wait(160);engine.stop();
    check(game.snapshot().rendering.frameTextureUploads===0,'background uses static GPU textures');
    check(game.snapshot().rendering.pendingUploadBytes===0,'all themes ready before gameplay');
    check(document.querySelectorAll('canvas').length===1,'single canvas');
    result.textContent=JSON.stringify({status:'passed',checks:['theme-background','continuous-level-fade','paused-background','static-gpu-textures','single-canvas'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if (scene === 'twins-rules' || scene === 'twins-down' || scene === 'bubble-blast' || scene === 'fission') {
    engine.stop();const f=game as any;
    const near=(a:number,b:number,label:string)=>check(Math.abs(a-b)<1e-6,label);
    const reset=()=>{
      f.enemies=[];f.enemyBullets=[];f.playerBullets=[];f.twins=null;f.boss=null;f.twinReviveMs=0;f.hostileLasers=[];
      f.phase='playing';f.bombBlast=null;f.bombs=3;f.levelAdvanceMs=0;f.laserFiring=false;f.pointerFiring=false;f.weaponForm='basic';
      f.player.x=240;f.player.y=840;f.player.health=100;f.player.invulnerableMs=10000;
      f.beginLevel(6);f.levelTimeline=[];f.combatEffects.clear();
    };
    const pair=()=>{f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id==='twin-red'),130,180);return f.twins as any[];};
    reset();let twins=pair();check(twins.length===2&&f.enemies.length===2,'one primary spawn creates two bosses');
    f.damageEnemy(f.enemies.indexOf(twins[0]),twins[0],1800);
    check(twins[0].hitPoints===0&&f.twinReviveMs===5000&&f.levelAdvanceMs===0,'first twin down opens five-second window');
    f.updateTwins(4999);check(twins[0].hitPoints===0&&f.twinReviveMs===1,'no early revival');
    f.phase='paused';f.update(34);check(f.twinReviveMs===1,'pause freezes revival clock');f.phase='playing';
    f.updateTwins(1);near(twins[0].hitPoints,360,'revival at exactly five seconds to twenty percent');
    check(f.twinReviveMs===0&&twins[1].hitPoints===1800,'survivor health unaffected');
    f.damageEnemy(f.enemies.indexOf(twins[1]),twins[1],1800);f.updateTwins(4999);
    const defeated=f.bossesDefeated;f.damageEnemy(f.enemies.indexOf(twins[0]),twins[0],360);
    check(!f.twins&&!f.boss&&f.enemies.length===0&&f.levelAdvanceMs>0&&f.bossesDefeated===defeated+1,'both down before timeout wins once');
    reset();twins=pair();for(const t of twins){t.hitPoints=100;t.y=400;}f.player.y=635;f.activateBomb();
    check(!f.twins&&!f.boss&&f.enemies.length===0,'same bomb defeats both safely');
    reset();twins=pair();
    f.triggerBossAttack(twins[0]);f.triggerBossAttack(twins[1]);
    check(f.enemyBullets.length===2&&f.enemyBullets[0].bubbleColor==='red'&&f.enemyBullets[1].bubbleColor==='blue','matched bubble colors');
    const bubble=f.enemyBullets[0];for(let i=0;i<5;i++)f.damageBubble(bubble,4);
    check(f.enemyBullets.includes(bubble)&&bubble.bubbleHealth===4,'bubble needs repeated hits');
    f.damageBubble(bubble,4);check(!f.enemyBullets.includes(bubble),'six basic hits safely pop bubble');
    f.enemyBullets=[];f.triggerBossAttack(twins[0]);f.triggerBossAttack(twins[1]);
    f.enemyBullets.forEach((b:any)=>{b.x=240;b.y=500;});f.player.y=640;f.player.invulnerableMs=0;
    f.resolveBubbleCollisions();near(f.player.health,45,'opposite bubbles deal wide area damage');check(f.enemyBullets.length===0,'each pair consumed once');
    f.player.invulnerableMs=0;f.resolveBubbleCollisions();near(f.player.health,45,'explosion cannot repeat next frame');
    f.triggerBossAttack(twins[0]);f.triggerBossAttack(twins[0]);f.enemyBullets.forEach((b:any)=>{b.x=240;b.y=400;});
    f.resolveBubbleCollisions();check(f.enemyBullets.length===2,'same color bubbles do not detonate');
    f.enemyBullets=[];f.triggerBossAttack(twins[0]);const shotBubble=f.enemyBullets[0];shotBubble.x=240;shotBubble.y=500;
    f.playerBullets.push({x:240,y:500,vx:0,vy:-1,radius:4,damage:4,color:'#ffffff',hostile:false});f.player.invulnerableMs=10000;f.resolveCollisions();
    check(shotBubble.bubbleHealth===20&&f.playerBullets.length===0,'actual bullet collision chips bubble and consumes shot');
    f.player.x=240;f.player.y=600;f.weaponForm='purple';f.laserFiring=true;f.laserDamageCooldownMs=0;f.updatePlayerLaser(16);
    check(shotBubble.bubbleHealth<20,'purple beam targets destructible bubbles');
    f.enemyBullets=[];f.fireEnemyPattern(twins[0]);check(f.enemyBullets.every((b:any)=>b.color==='#ff415e'),'red twin ordinary shots');
    f.enemyBullets=[];f.fireEnemyPattern(twins[1]);check(f.enemyBullets.every((b:any)=>b.color==='#48a7ff'),'blue twin ordinary shots');
    for(let i=0;i<50;i++)f.triggerBossAttack(twins[i%2]);check(f.enemyBullets.filter((b:any)=>b.bubbleHealth!==undefined).length===24,'bubble population bounded');
    reset();const elite=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id==='fission-elite'),240,400);
    f.damageEnemy(f.enemies.indexOf(elite),elite,180);check(f.enemies.length===2&&f.enemies.every((e:any)=>e.definition.id==='scout'),'elite splits into exactly two normals');
    const children=[...f.enemies];for(const child of children)f.damageEnemy(f.enemies.indexOf(child),child,1000);check(f.enemies.length===0,'split children never recursively split');
    reset();pair();f.phase='paused';f.returnHome();check(!f.twins&&f.twinReviveMs===0&&f.enemyBullets.length===0,'home clears encounter');
    f.levelCarousel.hide();f.ui.status(null);reset();twins=pair();
    if(scene==='twins-down')f.damageEnemy(f.enemies.indexOf(twins[0]),twins[0],1800);
    if(scene==='fission'){f.enemies=[];f.twins=null;f.boss=null;f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id==='fission-elite'),240,300);}
    for(let i=0;i<3;i++){f.triggerBossAttack(twins[0]);f.triggerBossAttack(twins[1]);}
    f.enemyBullets.forEach((b:any,i:number)=>{b.y=360+Math.floor(i/2)*125;b.x=i%2?310:170;});
    if(scene==='bubble-blast'){f.enemyBullets[0].x=240;f.enemyBullets[1].x=240;f.resolveBubbleCollisions();f.updateEnergyImpacts(150);f.updateImpacts(100);}
    f.phase='paused';f.syncHud();f.render();engine.run();await wait(180);engine.stop();
    check(game.snapshot().rendering.frameTextureUploads===0,'static single-canvas GPU rendering');
    result.textContent=JSON.stringify({status:'passed',checks:['twins-revive-boundary','pause-clock','pair-victory-once','simultaneous-bomb-win','bubble-hitpoints','bubble-collision-explosion','bubble-laser-target','matched-shot-colors','bounded-bubbles','elite-split','home-clears-twins'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if (scene === 'balance') {
    engine.stop();
    const f=game as any;
    const near=(a:number,b:number,message:string)=>check(Math.abs(a-b)<1e-6,message);
    const reset=(id:string)=>{
      f.enemies=[];f.hostileLasers=[];f.boss=null;f.bombBlast=null;f.bombs=3;f.phase='playing';f.levelTimeline=[];
      f.player.x=240;f.player.y=600;f.player.invulnerableMs=10000;
      return f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id===id),240,365);
    };
    for(const id of ['dreadnought','ion-seraph','void-mantis','star-carrier']) {
      const b=reset(id),hp=b.hitPoints;f.activateBomb();near(hp-b.hitPoints,126,id+' bomb reduction');
    }
    let b=reset('helios-prism'),hp=b.hitPoints;
    const emitter=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id==='helios-emitter'),240,365);
    f.activateBomb();near(hp-b.hitPoints,36*7*0.3,'proxy bomb reduction');
    check(!f.enemies.includes(emitter),'bomb destroys emitter');
    b=reset('iron-serpent');hp=b.hitPoints;
    let parts=f.enemies.filter((e:any)=>e.segmentOwner===b);
    for(const part of parts){part.x=240;part.y=365;}
    f.activateBomb();near(hp-b.hitPoints,126,'one bomb per serpent group');
    for(const part of parts)near(part.hitPoints,106,'bomb shared among nine parts');
    f.damageEnemy(f.enemies.indexOf(parts[0]),parts[0],90);
    for(const part of parts)near(part.hitPoints,96,'body hit shared');
    f.damageEnemy(f.enemies.indexOf(b),b,90);
    for(const part of parts)near(part.hitPoints,86,'head hit shared');
    f.damageEnemy(f.enemies.indexOf(b),b,1000);
    check(f.enemies.filter((e:any)=>e.segmentOwner===b).length===0,'parts destroyed safely');
    hp=b.hitPoints;f.damageEnemy(f.enemies.indexOf(b),b,50);near(hp-b.hitPoints,50,'head damage after all parts destroyed');
    b=reset('helios-prism');f.spawnHeliosEmitters(b);
    const laserSource=f.enemies.find((e:any)=>e.definition.id==='helios-emitter');
    const old={x:laserSource.x,y:laserSource.y};f.startHostileLaser(laserSource);
    f.updateHostileLasers(10000);
    check(laserSource.x===old.x&&laserSource.y===old.y,'warning does not relocate');
    f.updateHostileLasers(10000);
    check(Math.hypot(laserSource.x-old.x,laserSource.y-old.y)>=100,'relocate after attack');
    check(f.hostileLasers.length===0&&laserSource.fireCooldownMs>0,'clean laser and reset warning cooldown');
    b=reset('star-carrier');
    const deploy=()=>{f.enemies=f.enemies.filter((e:any)=>e.definition.tier!=='normal');f.triggerBossAttack(b);};
    for(let n=1;n<=9;n++){
      deploy();check(b.laserCooldownMs===3000,'faster carrier interval');
      check(f.enemies.filter((e:any)=>e.definition.tier==='elite').length===Math.min(2,Math.floor(n/3)),'every third wave / two elite cap');
    }
    const elite=f.enemies.find((e:any)=>e.definition.tier==='elite');f.destroyEnemy(f.enemies.indexOf(elite),elite);
    deploy();deploy();deploy();check(f.enemies.filter((e:any)=>e.definition.tier==='elite').length===2,'replace defeated elite on third wave');
    reset('star-carrier');f.boss.y=220;f.syncHud();f.phase='paused';
    f.syncHud();
    result.textContent=JSON.stringify({status:'passed',checks:['boss-bomb-resistance','proxy-bomb-resistance','serpent-shared-damage','serpent-bomb-deduplication','laser-relocation-after-attack','carrier-cadence-elite-cap'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if (scene === 'hud') {
    const fixture = game as any, params = new URLSearchParams(location.search);
    fixture.player.health=Number(params.get('health')??100);fixture.player.lives=Number(params.get('lives')??3);
    fixture.score=987654;fixture.highScore=1234567;fixture.levelTimeline=[];
    const bossId=params.get('boss');
    if(bossId) { fixture.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id===bossId));fixture.boss.y=240;fixture.boss.hitPoints=fixture.boss.definition.hitPoints*0.5; }
    fixture.phase='paused';fixture.syncHud(); // Freeze this visual fixture without opening the pause dialog.
    await wait(120);engine.stop();
    const root=(hud as any).root.root;
    check(root.findById('sky-boss-ring').visible===!!bossId,'boss gauge is conditional');
    for(let i=0;i<3;i++)check(root.findById(`sky-life-${i}`).visible===(i<fixture.player.lives),'lives match mini fighters');
    const scoreRect=root.findById('sky-score').rect;
    check(Math.abs(scoreRect.x+scoreRect.width/2-innerWidth/2)<1,'score stays centered');
    check(game.snapshot().rendering.frameTextureUploads===0,'static GPU image resources');
    result.textContent=JSON.stringify({status:'passed',checks:['compact-vitals','lives-icons','conditional-boss','centered-score'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if (scene === 'pause' || scene === 'home') {
    await click(innerWidth / 2 + Math.min(innerWidth, innerHeight / 2) / 2 - 60, innerHeight - 36);
    check(game.snapshot().phase === 'paused', 'skinned pause dialog');
    if (scene === 'home') {
      const cardHeight = Math.min(Math.min(400, Math.min(innerWidth,innerHeight/2)-28)*0.98,innerHeight-40);
      for (let cycle=0;cycle<2;cycle++) {
        await click(innerWidth/2,innerHeight/2+cardHeight*0.27);
        const home=game.snapshot();
        check(home.phase==='ready' && home.enemies===0 && home.bullets===0 && !home.firing,'home clears battle and input');
        check(home.effects.detonations===0 && home.effects.muzzleFlashes===0,'home clears effects');
        await click(innerWidth/2,startY);check(game.snapshot().phase==='playing' && game.snapshot().bombs===3 && game.snapshot().score===0,'launch after returning home');
        await click(innerWidth/2+Math.min(innerWidth,innerHeight/2)/2-60,innerHeight-36);
        check(game.snapshot().phase==='paused','pause after relaunch');
      }
    }
    engine.stop(); result.textContent=JSON.stringify({status:'passed',checks:scene==='home'?['home-clears-battle','home-relaunch-twice','pause-dialog']:['pause-dialog'],state:game.snapshot()}); result.dataset.status='passed'; return;
  }
  if (scene) {
    // Test-only scene injection exercises procedural boss devices without adding product debug APIs.
    const fixture = game as unknown as { spawnEnemy(d: typeof ENEMY_DEFINITIONS[number]): void; enemies: { y: number; entered: boolean; laserCooldownMs: number }[]; player: { invulnerableMs: number }; levelTimeline: unknown[]; addImpact(x: number,y: number,s: number): void; addLaserImpact(x: number,y: number,s: number): void };
    fixture.player.invulnerableMs = 999999; fixture.levelTimeline = [];
    if (scene.startsWith('boss:') || scene==='boss-explosion' || scene==='elite') {
      const definition = ENEMY_DEFINITIONS.find(d => d.id === (scene==='boss-explosion'?'dreadnought':scene==='elite'?'violet-fortress':scene.slice(5))); check(!!definition, 'known boss'); fixture.spawnEnemy(definition!);
      for (const enemy of fixture.enemies) { enemy.y = Math.max(130, enemy.y + 380); enemy.entered = true; enemy.laserCooldownMs = 100; }
    }
    const combat = game as any;
    if (scene==='red-fire' || scene==='blue-fire') { combat.weaponForm=scene==='red-fire'?'red':'blue';combat.weaponLevel=2;combat.pointerFiring=true; }
    const targetFrame = frames + 100;
    while (frames < targetFrame) await wait(10);
    if(scene==='boss-explosion') { const boss=combat.boss;combat.destroyEnemy(combat.enemies.indexOf(boss),boss); }
    fixture.addImpact(140,430,100); fixture.addLaserImpact(310,510,70);
    const effectFrame = frames + 8;
    while (frames < effectFrame) await wait(10);
    engine.stop();
    await engine.device.queue.onSubmittedWorkDone(); await wait(100);
    if (scene==='boss-explosion') check(game.snapshot().effects.detonations===1 && Math.abs(game.snapshot().effects.shake.x)>0,'boss explosion shake');
    if (scene.startsWith('boss:')) check(game.snapshot().enemies > 0, 'boss remains visible');
    check(game.snapshot().rendering.drawCalls > 0, 'GPU draws'); check(game.snapshot().rendering.pendingUploadBytes === 0, 'static uploads completed');
    result.textContent = JSON.stringify({ status:'passed', checks:['combat-render',scene,'static-atlas'], state:game.snapshot() }); result.dataset.status='passed'; return;
  }
  const beforeBomb = game.snapshot().player;
  await click(innerWidth/2-Math.min(innerWidth,innerHeight/2)/2+55,innerHeight-48);
  check(game.snapshot().bombs===2 && !game.snapshot().firing,'skinned bomb button consumes one bomb without gameplay touch');
  check(game.snapshot().player.x===beforeBomb.x && game.snapshot().player.y===beforeBomb.y,'bomb button does not move fighter');
  const y = innerHeight * 0.72;
  send('pointerdown', innerWidth * 0.1, y); await wait(80); const left = game.snapshot();
  send('pointermove', innerWidth * 0.9, y); await wait(80); const right = game.snapshot();
  check(right.player.x > left.player.x, 'fighter moves right');
  if (innerWidth / innerHeight < 0.5) check(right.viewport.cameraX > left.viewport.cameraX, 'narrow camera follows proportionally');
  else check(right.viewport.cameraX === 0 && right.viewport.left >= 0, 'wide camera remains fixed');
  send('pointercancel', innerWidth * 0.9, y); await wait(80); check(!game.snapshot().firing, 'cancel stops firing');
  game.suspend(); await wait(80); check(game.snapshot().phase === 'paused', 'background pauses');
  // Resume through the actual HUD button.
  send('pointerdown', innerWidth / 2, innerHeight / 2 + Math.min(400, Math.min(innerWidth,innerHeight/2)-28)*0.98*0.06); send('pointerup', innerWidth / 2, innerHeight / 2 + Math.min(400, Math.min(innerWidth,innerHeight/2)-28)*0.98*0.06); await wait(100);
  check(game.snapshot().phase === 'playing', 'GUI resume');
  check(document.querySelectorAll('canvas').length === 1, 'one visible canvas');
  check(game.snapshot().rendering.frameTextureUploads === 0, 'no frame raster uploads');
  check(game.snapshot().rendering.drawCalls > 0, 'GPU sprite batches submitted');
  engine.stop();
  result.textContent = JSON.stringify({ status: 'passed', checks: ['gui-start','skinned-bomb','fighter-input','viewport-tracking','pointer-cancel','pause-resume'], left, right, state: game.snapshot() }); result.dataset.status = 'passed';
}
run().catch(error => { result.textContent = JSON.stringify({ status: 'failed', message: String(error) }); result.dataset.status = 'failed'; });
