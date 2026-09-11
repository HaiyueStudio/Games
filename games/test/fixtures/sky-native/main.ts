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
  const uiSounds:string[]=[];const playSound=audioBackend.play.bind(audioBackend);audioBackend.play=(id,options)=>{if(id.startsWith('ui-'))uiSounds.push(id);return playSound(id,options);};
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
  check(game.snapshot().selectedLevel === 1, 'skinned next button '+JSON.stringify({frames,selected:game.snapshot().selectedLevel,viewport:[innerWidth,innerHeight],display:[engine.displayWidth,engine.displayHeight],panel:(game as any).levelCarousel.panel?.rect}));
  await click(panelLeft + 4 + arrowSize / 2, arrowY);
  check(game.snapshot().selectedLevel === 0, 'skinned previous button');
  check(audio.snapshot().uiClicks >= 2,'carousel buttons play GUI sounds');
  const mission=Number(new URLSearchParams(location.search).get('mission')??1);
  const missionIndex=levels.findIndex((level,i)=>(level.number??i+1)===mission);
  check(missionIndex>=0,'requested mission exists');
  for(let i=0;i<missionIndex;i++)await click(panelLeft + panelWidth - 4 - arrowSize / 2, arrowY);
  check(game.snapshot().selectedLevel===missionIndex,'requested mission carousel');
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
    await click(innerWidth/2,top+optionsHeight*(0.2825+['zh','en','ja'].indexOf(language)*0.115));
    check(game.snapshot().language===language,'language applies immediately');
    check(new SkyStrikeLocale(localStorage).language===language,'language persists across new instance');
    if(scene==='options') {
      const clicksBefore=audio.snapshot().uiClicks;
      await click(innerWidth/2,top+optionsHeight*0.6675);check(!audio.enabled,'GUI sound mute');
      const cw=Math.min(400,innerWidth-24);await click((innerWidth-cw)/2+cw*.205,top+optionsHeight*.7725);check(audio.volume===.55,'GUI volume down');
      await click((innerWidth-cw)/2+cw*.795,top+optionsHeight*.7725);check(audio.volume===.65,'GUI volume up');
      await click(innerWidth/2,top+optionsHeight*.6675);check(audio.enabled,'GUI sound enable');
      check(JSON.parse(localStorage.getItem(SKY_AUDIO_SETTINGS_KEY)!).volume===.65,'GUI audio persistence');
      check(audio.snapshot().uiClicks>clicksBefore,'unmuting plays GUI confirmation');
      engine.stop();result.textContent=JSON.stringify({status:'passed',checks:['settings-modal','language-persistence','input-isolation'],state:game.snapshot()});result.dataset.status='passed';return;
    }
    await click(innerWidth/2,top+optionsHeight*0.8725);check(!game.snapshot().optionsOpen,'close settings');check(uiSounds.at(-1)==='ui-back','settings return uses distinct sound');
  }
  if (scene === 'menu') {
    if(new URLSearchParams(location.search).get('mission')==='7') {const carousel=(game as any).levelCarousel;check(carousel.bossImage.rect.x+carousel.bossImage.rect.width*0.85<carousel.companionImage.rect.x,'twin preview hulls have separate positions');}
    engine.stop(); result.textContent = JSON.stringify({ status:'passed', checks:['engine-gui-menu','skinned-next','skinned-previous'], state:game.snapshot() }); result.dataset.status='passed'; return;
  }

  const startY = (innerHeight - panelHeight) / 2 + panelHeight * 0.91;
  send('pointerdown', innerWidth / 2, startY); send('pointerup', innerWidth / 2, startY); await wait(150);
  check(game.snapshot().phase === 'playing', 'GUI start');
  if(scene==='cinder-entry'){
    engine.stop();const f=game as any;f.beginLevel(10);f.enemies=[];f.enemyBullets=[];f.playerBullets=[];f.player.invulnerableMs=999999;f.flameProtectionMs=999999;f.pointerFiring=false;
    let observedBeforeEntry=false,observedWarning=false,observedFire=false;
    for(let time=0;time<12200;time+=16){
      game.update(16);const elite=f.enemies.find((e:any)=>e.definition.id==='cinder-elite');
      if(elite&&!elite.entered){observedBeforeEntry=true;check(!f.flames.cones.some((c:any)=>!c.boss),'no elite fire before entry');}
      if(elite?.entered){observedWarning ||=f.flames.cones.some((c:any)=>!c.boss&&c.warning);observedFire ||=f.flames.cones.some((c:any)=>!c.boss&&!c.warning);}
    }
    check(observedBeforeEntry&&observedWarning&&observedFire,'timeline-spawned elite enters, telegraphs and emits fire without forced entry flags');
    const elite=f.enemies.find((e:any)=>e.definition.id==='cinder-elite'),cone=f.flames.cones.find((c:any)=>!c.boss&&!c.warning);check(!!cone,'natural elite is actively flaming');
    f.player.x=cone.x+Math.cos(cone.angle)*150;f.player.y=cone.y+Math.sin(cone.angle)*150;f.player.health=100;f.player.invulnerableMs=0;f.flameProtectionMs=0;f.updateFlames(200);check(f.player.health===97,'naturally activated flame deals expected contact tick');
    f.pause();const paused=JSON.stringify(f.flames.snapshot());game.update(34);check(JSON.stringify(f.flames.snapshot())===paused,'pause freezes natural flame');f.togglePause();
    const hp=f.player.health;f.damageEnemy(f.enemies.indexOf(elite),elite,99999);f.flames.clearBurn();f.updateFlames(200);check(!f.flames.cones.some((c:any)=>!c.boss)&&f.player.health===hp,'dead elite cannot keep spraying');
    // Restore the same real timeline for visual capture, with no synthetic entry flag.
    f.beginLevel(10);f.enemies=[];f.enemyBullets=[];f.playerBullets=[];f.player.x=240;f.player.y=800;f.player.health=100;f.player.invulnerableMs=999999;f.flameProtectionMs=999999;
    for(let time=0;time<12200;time+=16)game.update(16);
    f.phase='paused';f.syncHud();f.render();engine.run();await wait(180);engine.stop();await engine.device.queue.onSubmittedWorkDone();
    check(game.snapshot().rendering.frameTextureUploads===0,'natural elite uses static GPU textures');
    result.textContent=JSON.stringify({status:'passed',checks:['real-level-11-timeline','offscreen-entry-gate','natural-warning-and-fire','contact-damage','pause-freeze','death-cleanup','zero-frame-upload'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if(scene==='inferno'){
    engine.stop();const f=game as any,stage=new URLSearchParams(location.search).get('stage')??'long';
    const reset=()=>{f.beginLevel(10);f.levelCarousel.hide();f.score=0;f.phase='playing';f.levelTimeline=[];f.enemies=[];f.enemyBullets=[];f.playerBullets=[];f.boss=null;f.flames.clear();f.flameProtectionMs=0;f.player.invulnerableMs=0;f.player.health=100;f.player.x=240;f.player.y=680;f.pointerFiring=false;};
    const spawn=(id:string,x:number,y:number)=>{const e=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id===id),x,y);e.entered=true;return e;};
    reset();let elite=spawn('cinder-elite',240,100);f.player.y=260;f.flames.update(890,f.enemies,f.player);f.updateFlames(200);check(f.player.health===97,'flame ticks bypass bullet hit cooldown and deal three');
    f.player.y=850;for(let i=0;i<25;i++)f.updateFlames(200);check(f.player.health===72&&f.flames.burnMs===0,'five-second residual burn deals exactly 25');
    reset();let boss=spawn('inferno-ark',240,145);const small=spawn('scout',188,340);f.player.x=188;f.player.y=650;f.flames.update(1400,f.enemies,f.player);check(f.flames.charges.length===1,'boss flame ignites small fighter');
    f.damageEnemy(f.enemies.indexOf(small),small,999);check(f.flames.charges.length===1&&!f.flames.charges[0].source,'shot-down fighter leaves armed wreck');
    f.player.x=188;f.player.y=340;f.player.invulnerableMs=0;f.flames.clearBurn();f.flames.cones=[];f.enemies=[];f.boss=null;
    f.updateFlames(3000);check(f.flames.charges.length===0&&f.player.health===40,'wreck still explodes and deals circular area damage');
    reset();const live=spawn('scout',180,430);f.flames.ignite(live);f.updateFlames(2999);check(f.enemies.includes(live),'living ignited fighter survives until fuse deadline');f.updateFlames(1);check(!f.enemies.includes(live),'living ignited fighter explodes at deadline');
    reset();boss=spawn('inferno-ark',240,145);const doomed=spawn('scout',180,430);f.flames.ignite(doomed);f.damageEnemy(f.enemies.indexOf(boss),boss,99999);check(f.levelAdvanceMs>=3000&&f.flames.charges.length===1,'boss death cannot cancel a pending fuse');
    reset();f.player.health=1;f.player.lives=2;f.damagePlayer(3,true);check(f.player.health===100&&f.player.lives===1&&f.flameProtectionMs===1800,'burn death respawns once');f.damagePlayer(3,true);check(f.player.health===100,'respawn protects against repeated burn ticks');
    reset();boss=spawn('inferno-ark',240,145);boss.fireCooldownMs=0;f.updateEnemies(16);check(f.enemyBullets.length===3,'boss emits ordinary three-round salvo');
    f.flames.update(1500,f.enemies,f.player,true);const activeAngle=f.flames.cones[0].angle;f.player.x=420;f.flames.update(500,f.enemies,f.player,true);check(f.flames.cones[0].angle<activeAngle&&activeAngle-f.flames.cones[0].angle<=.08001,'live narrow cone tracks with bounded turn speed');
    const chase=spawn('scout',80,330);f.flames.ignite(chase);const beforeX=chase.x,beforeY=chase.y;f.updateEnemies(100);check(Math.abs(Math.hypot(chase.x-beforeX,chase.y-beforeY)-6)<.0001&&chase.x>beforeX&&chase.y>beforeY,'ignited fighter replaces regular flight with slow pursuit');
    f.updateFlames(100);const remaining=f.flames.charges.find((c:any)=>c.source===chase).remainingMs;f.damageEnemy(f.enemies.indexOf(chase),chase,999);const wreck=f.flames.charges.find((c:any)=>!c.source);const wreckX=wreck.x,wreckY=wreck.y;f.player.x=30;f.updateEnemies(100);f.updateFlames(100);check(wreck.x===wreckX&&wreck.y===wreckY&&wreck.remainingMs===remaining-100,'shot-down pursuer leaves stationary timed wreck');
    reset();boss=spawn('inferno-ark',240,145);f.triggerBossAttack(boss);check(f.enemies.filter((e:any)=>e.definition.tier==='normal').length===2,'boss summons escorts');
    for(let i=0;i<10;i++)f.triggerBossAttack(boss);check(f.enemies.filter((e:any)=>e.definition.tier==='normal').length===8,'escort cap is bounded');
    f.flames.ignite(f.enemies.find((e:any)=>e.definition.tier==='normal'));f.pause();const before=JSON.stringify(f.flames.snapshot());game.update(34);check(JSON.stringify(f.flames.snapshot())===before,'pause freezes burns and fuse');f.returnHome();check(f.flames.charges.length===0,'home clears hazards');
    reset();boss=spawn(stage==='elite'?'cinder-elite':'inferno-ark',240,155);f.player.y=720;
    const elapsed=stage==='warning'?700:stage==='wide'?6500:stage==='elite'?1400:1900;
    f.elapsedMs=elapsed;f.flames.update(elapsed,f.enemies,f.player,true);
    if(stage==='long'){f.player.x=420;f.flames.update(900,f.enemies,f.player,true);f.elapsedMs+=900;boss.fireCooldownMs=0;f.updateEnemies(16);f.updateBullets(350);}
    if(stage==='wreck'){const small=spawn('scout',150,530);f.flames.ignite(small);f.damageEnemy(f.enemies.indexOf(small),small,999);}
    if(stage==='burn'){f.flames.burnMs=4000;f.flames.burnDamage=2;}
    f.phase='paused';f.syncHud();f.render();engine.run();await wait(180);engine.stop();await engine.device.queue.onSubmittedWorkDone();
    check(game.snapshot().rendering.frameTextureUploads===0,'fire uses static GPU textures');
    result.textContent=JSON.stringify({status:'passed',checks:['elite-ticks','five-second-burn','boss-ignition','dead-hull-fuse','live-hull-fuse','boss-death-fuse','burn-respawn','blast-damage','escort-cap','boss-ordinary-salvo','narrow-tracking','ignited-pursuit','stationary-wreck','pause-home-cleanup','zero-frame-upload'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if(scene==='ship-parts') {
    engine.stop();const f=game as any,stage=new URLSearchParams(location.search).get('stage')??'serpent';
    f.levelTimeline=[];f.enemies=[];f.enemyBullets=[];f.playerBullets=[];f.player.invulnerableMs=999999;f.player.x=240;f.player.y=800;f.pointerFiring=false;
    const spawn=(id:string,x:number,y:number)=>{const e=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id===id),x,y);e.entered=true;e.ageMs=420;e.rotation=0;return e;};
    if(stage==='serpent'){
      const head=spawn('iron-serpent',240,230);f.spaceBackdrop.select('serpent-rail',true);
      for(const e of f.enemies.filter((e:any)=>e.segmentOwner===head)){e.x=240+Math.sin(e.segmentOrder*.65)*80;e.y=230+e.segmentOrder*48;e.ageMs=420;}
    }else{
      const ids=stage==='elites'?['crimson-lance','violet-fortress','prism-lancer','fission-elite']:stage==='bosses-a'?['dreadnought','ion-seraph','void-mantis']:['star-carrier','helios-prism','ore-reaper'];
      for(let i=0;i<ids.length;i++){const e=spawn(ids[i]!,240,180+i*230);e.laserCooldownMs=stage==='bosses-b'?1380:0;}
    }
    f.phase='paused';f.syncHud();f.render();engine.run();await wait(160);engine.stop();await engine.device.queue.onSubmittedWorkDone();
    check(game.snapshot().rendering.frameTextureUploads===0,'animated parts never upload textures per frame');
    check(game.snapshot().rendering.pendingUploadBytes===0,'new parts uploaded');
    result.textContent=JSON.stringify({status:'passed',checks:['hull-specific-parts',stage,'static-atlas','zero-frame-uploads'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if (scene === 'audio') {
    engine.stop();const f=game as any;f.levelTimeline=[];f.enemies=[];f.enemyBullets=[];f.player.invulnerableMs=999999;
    check(audioBackend.snapshot().buffers===19 && audioBackend.snapshot().error===null,'all real WAV buffers decoded');
    audio.resume();await wait(80);check(audioBackend.snapshot().state==='running','WebAudio unlocked');
    audio.stop();
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
    result.textContent=JSON.stringify({status:'passed',checks:['19-decoded-effects','game-weapon-audio','laser-lifecycle','12-voice-budget','background-resume','rapid-resume','mute-dispose'],audio:beforeDispose});result.dataset.status='passed';return;
  }
  if (scene === 'bomb-crates' || scene === 'crate-rules') {
    engine.stop();const f=game as any;
    const reset=(mission=7)=>{f.beginLevel(mission);f.phase='playing';f.levelTimeline=[];f.enemies=[];f.enemyBullets=[];f.playerBullets=[];f.boss=null;f.bombPowerups=[];f.powerups=[];f.asteroids.clear();f.bombCrates.clear();f.player.x=240;f.player.y=820;f.player.invulnerableMs=999999;f.laserFiring=false;f.pointerFiring=false;f.bombs=1;};
    const miner=()=>{const e=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id==='ore-reaper'),240,160);e.entered=true;return e;};
    reset(0);for(let i=0;i<450;i++)game.update(16);check(f.bombCrates.crates.length===0,'no crates in other stages');
    reset();for(let i=0;i<450;i++)game.update(16);check(f.bombCrates.crates.length===0,'no crates before mining boss');
    const boss=miner();for(let i=0;i<375;i++)game.update(16);check(f.bombCrates.crates.length===1,'mining boss naturally spawns first crate after six seconds');
    const before=JSON.stringify(f.bombCrates.snapshot());f.pause();for(let i=0;i<40;i++)game.update(16);check(JSON.stringify(f.bombCrates.snapshot())===before,'pause freezes crate and supply timer');f.togglePause();
    reset();let c=f.bombCrates.spawn(240,600);const bullet=(damage:number)=>({x:240,y:500,previousX:240,previousY:750,vx:0,vy:-800,radius:4,damage,hostile:false,color:'#5ef'});
    f.playerBullets.push(bullet(20));f.resolveCollisions();check(c.health===22&&f.bombPowerups.length===0&&f.playerBullets.length===0,'first swept hit damages sealed crate without drop');
    f.playerBullets.push(bullet(22));f.resolveCollisions();check(f.bombCrates.crates.length===0&&f.bombPowerups.length===1,'breaking crate releases one bomb');f.damageBombCrate(c,999);check(f.bombPowerups.length===1,'cannot duplicate drop');
    f.player.x=240;f.player.y=600;f.updatePowerups(0);check(f.bombs===2&&f.bombPowerups.length===0,'touch released bomb adds exactly one');
    reset();c=f.bombCrates.spawn(240,600);f.player.y=600;f.resolveCollisions();f.updatePowerups(0);check(f.bombs===1&&f.player.health===100&&f.bombCrates.crates.length===1,'sealed crate cannot be collected and causes no contact damage');
    f.player.y=820;f.weaponForm='purple';f.weaponLevel=3;f.laserFiring=true;f.laserDamageCooldownMs=0;for(let i=0;i<30&&f.bombCrates.crates.length;i++)f.updatePlayerLaser(100);check(f.bombCrates.crates.length===0&&f.bombPowerups.length===1,'laser breaks crate and releases bomb');
    reset();c=f.bombCrates.spawn(240,600);const rock=f.asteroids.spawn(240,700,64),hp=rock.health;f.playerBullets.push(bullet(20));f.resolveCollisions();check(c.health===42&&rock.health===hp-20,'nearest asteroid shields farther crate');
    reset();miner();c=f.bombCrates.spawn(240,600);f.damageEnemy(f.enemies.indexOf(f.boss),f.boss,999999);check(f.bombCrates.crates.length===0,'boss death clears sealed supplies');
    reset();const played:string[]=[];const original=audioBackend.play.bind(audioBackend);audioBackend.play=(id,options)=>{played.push(id);return original(id,options);};audio.resume();await wait(40);
    for(const form of ['red','blue','purple']){f.powerups.push({x:240,y:820,baseX:240,ageMs:0,formTimerMs:4000,orbitAngle:0,form,radius:18});f.updatePowerups(0);check(f.weaponForm===form,'collect '+form);}
    f.spawnBombPowerup({x:240,y:820});f.bombPowerups[0].orbitAngle=0;f.updatePowerups(0);check(['pickup-red','pickup-blue','pickup-purple','pickup-bomb'].every(id=>played.includes(id)),'each actual pickup triggers its distinct audio');
    const count=played.length;f.updatePowerups(0);check(played.length===count,'collected items cannot replay pickup');audioBackend.play=original;
    reset();miner();f.bombCrates.spawn(160,550);f.asteroids.spawn(80,400,70);f.asteroids.spawn(340,660,88);f.asteroids.update(16,false,420,f.boss,f.player);f.bombCrates.crates[0].health=28;f.spaceBackdrop.select('asteroid-forge',true);f.spaceBackdrop.update(22000);f.player.invulnerableMs=0;f.phase='paused';f.syncHud();engine.run();await wait(160);engine.stop();
    check(game.snapshot().rendering.frameTextureUploads===0,'crate uses existing GPU primitives with no uploads');
    result.textContent=JSON.stringify({status:'passed',checks:['boss-only-supply-timing','pause-freeze','swept-hit','single-drop','pickup-bomb','laser-crate','occlusion','boss-cleanup','four-pickup-sounds','zero-texture-upload'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if(scene==='quantum'){
    engine.stop();const f=game as any,stage=new URLSearchParams(location.search).get('stage')??'battle';
    const renderFrames=async()=>{const target=frames+3,deadline=performance.now()+10000;engine.run();while(frames<target&&performance.now()<deadline)await wait(16);engine.stop();check(frames>=target,'actual quantum frames rendered');};
    const reset=()=>{f.levelCarousel?.hide();f.hideStatus();f.impacts=[];f.energyImpacts=[];f.debris=[];f.sparks=[];f.powerups=[];f.bombPowerups=[];f.shakeMs=0;f.enemies=[];f.boss=null;f.playerBullets=[];f.enemyBullets=[];f.phase='playing';f.player.x=240;f.player.y=750;f.player.health=100;f.player.lives=3;f.player.invulnerableMs=0;f.pointerFiring=false;f.laserFiring=false;f.weaponForm='basic';f.weaponLevel=0;f.combatEffects.clear();f.beginLevel(levels.length-1);f.levelTimeline=[];f.asteroids.clear();f.player.invulnerableMs=0;};
    const spawn=(id='bomber',x=120,y=240)=>{const e=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id===id),x,y,true);e.entered=true;return e;};
    const shot=(x:number,y:number,damage=8)=>({x,y,previousX:x,previousY:y+30,vx:0,vy:-700,radius:4,damage,hostile:false,color:'#65eaff'});
    if(stage==='live'){
      reset();f.beginLevel(levels.length-1);f.player.invulnerableMs=999999;f.pointerFiring=true;f.weaponForm='blue';f.weaponLevel=3;
      let seenBoss=false,seenGhost=false,finished=false;const render=f.render;f.render=()=>{};
      try{for(let i=0;i<11000;i++){if(i%128===0)await wait(0);if(f.boss)f.player.x=f.boss.x;game.update(16);seenBoss ||= !!f.boss;seenGhost ||= game.snapshot().quantum.length>0;if(f.levelIndex===0){finished=true;break;}}}finally{f.render=render;}
      check(seenBoss&&seenGhost&&finished,'full mission timeline naturally reaches boss victory and next mission');check(game.snapshot().quantum.length===0,'victory clears all quantum bodies');
      f.phase='paused';f.syncHud();await renderFrames();result.textContent=JSON.stringify({status:'passed',checks:['full-quantum-timeline','natural-boss-victory','transition-cleanup'],durationMs:f.elapsedMs,state:game.snapshot()});result.dataset.status='passed';return;
    }
    reset();let entering=spawn('bomber',120,-80);check(game.snapshot().quantum[0]!.ghost.y===-80,'both paired enemies enter from above');f.updateEnemies(1000);check(game.snapshot().quantum[0]!.body.y===game.snapshot().quantum[0]!.ghost.y,'paired entry remains at identical height');
    reset();let body=spawn();body.rotation=.3;
    let pair=game.snapshot().quantum[0]!;check(Math.abs(pair.body.x+pair.ghost.x-2*f.quantumCenterX())<.001&&pair.body.y===pair.ghost.y,'left-right symmetry at identical height including narrow camera');
    f.player.x=430;pair=game.snapshot().quantum[0]!;check(Math.abs(pair.body.x+pair.ghost.x-2*f.quantumCenterX())<.001,'tracked camera preserves visual symmetry');f.player.x=240;
    pair=game.snapshot().quantum[0]!;const hp=body.hitPoints;
    f.playerBullets.push(shot(pair.ghost.x,pair.ghost.y));f.resolveCollisions();check(body.hitPoints===hp&&f.playerBullets.length===1,'bullets pass through quantum ghost without damage or interception');
    f.player.x=pair.ghost.x;f.weaponForm='purple';f.weaponLevel=1;f.laserFiring=true;f.updatePlayerLaser(100);check(f.laserTarget!==pair.ghost&&(!f.laserTarget||f.enemies.includes(f.laserTarget)),'laser only acquires real bodies');
    f.playerBullets=[];body.rotation=0;f.fireEnemyPattern(body);check(f.enemyBullets.length===6&&f.enemyBullets.filter((b:any)=>b.quantumOwner===body).length===3,'paired salvo fires once from both hulls');
    const a=f.enemyBullets[0],b=f.enemyBullets[1];check(Math.abs(a.vx+b.vx)<.001&&Math.abs(a.vy-b.vy)<.001&&a.y===b.y,'quantum bullets mirror horizontally and retain downward travel');
    const score=f.score;f.damageEnemy(f.enemies.indexOf(body),body,9999);check(game.snapshot().quantum.length===0&&f.score-score===body.definition.score,'body death removes ghost and awards score once');check(f.enemyBullets.every((b:any)=>!b.quantumOwner),'body death removes quantum fire');
    reset();body=spawn('bomber',240,240);pair=game.snapshot().quantum[0]!;f.player.x=pair.ghost.x;f.player.y=pair.ghost.y;f.resolveCollisions();check(f.player.health===65&&f.enemies.includes(body),'ghost contact hurts player without destroying pair');
    reset();body=spawn();body.y=1200;f.updateEnemies(16);check(game.snapshot().quantum.length===0,'offscreen cleanup cannot orphan a ghost');
    reset();body=spawn('quantum-dreadnought',240,180);f.updateEnemies(16);check(body.definition.fireIntervalMs===875,'boss retains reduced firing cadence');const leftX=body.x;body.ageMs=Math.PI/.0005;f.updateEnemies(0);check(leftX<f.quantumCenterX()-80&&body.x>f.quantumCenterX()+80,'boss crosses both visible halves');const sweptPair=game.snapshot().quantum[0]!;check(Math.abs(sweptPair.body.x+sweptPair.ghost.x-2*f.quantumCenterX())<.001,'wide sweep keeps opposite mirror movement');body.ageMs=16;f.updateEnemies(0);f.fireEnemyPattern(body);check(f.enemyBullets.length===24&&new Set(f.enemyBullets.filter((b:any)=>!b.quantumOwner).map((b:any)=>`${b.x}:${b.y}`)).size===12,'six independent triple-barrel mounts emit paired rounds from their tips');
    const rounds=f.enemyBullets.filter((b:any)=>!b.quantumOwner);
    for(let i=0;i<6;i++){const g=f.quantumGun(body,i);check(Math.hypot((rounds[i*2].x+rounds[i*2+1].x)/2-g.muzzle.x,(rounds[i*2].y+rounds[i*2+1].y)/2-g.muzzle.y)<.001,'projectiles start at actual rotated barrel tips');}
    const oldAngles=[...body.quantumTurretAngles];f.player.x=430;f.updateEnemies(16);check(body.quantumTurretAngles.some((a:number,i:number)=>a!==oldAngles[i])&&body.quantumTurretAngles.every((a:number,i:number)=>Math.abs(a-oldAngles[i])<=2.4*.016+.0001),'six turrets turn smoothly toward player');
    f.player.x=240;const savedAngles=[...body.quantumTurretAngles];f.phase='paused';game.update(34);check(body.quantumTurretAngles.every((a:number,i:number)=>a===savedAngles[i]),'pause freezes turret rotation');f.phase='playing';
    body.hitPoints=body.definition.hitPoints*.35;check(!game.snapshot().quantum[0]!.core!.critical,'35 percent remains calm');body.hitPoints=body.definition.hitPoints*.349;check(game.snapshot().quantum[0]!.core!.critical&&game.snapshot().quantum[0]!.core!.periodMs===420,'below 35 percent red fast alert');body.hitPoints=body.definition.hitPoints;
    f.triggerBossAttack(body);check(f.hostileLasers.length===4&&game.snapshot().quantumLasers.every(l=>l.phase==='warning'),'four paired lasers telegraph');
    const before=f.hostileLasers[0].timerMs;f.phase='paused';game.update(34);check(f.hostileLasers[0].timerMs===before,'pause freezes quantum laser warning');f.phase='playing';
    const q=f.hostileLasers.find((l:any)=>l.quantum);q.targetX=400;const path=f.hostileLaserPath(q);f.player.x=240;f.player.y=path.y+(path.endY-path.y)*(240-path.x)/(path.endX-path.x);f.player.invulnerableMs=0;
    f.updateHostileLasers(1199);check(f.player.health===100,'telegraph never damages player');f.updateHostileLasers(1);check(f.player.health===35,'active quantum laser uses matching collision path');
    f.damageEnemy(f.enemies.indexOf(body),body,99999);check(!f.boss&&f.hostileLasers.length===0&&game.snapshot().quantum.length===0,'boss death cancels mirror ship and all owned lasers');
    reset();spawn('quantum-dreadnought',240,180);f.triggerBossAttack(f.boss);f.pause();f.returnHome();check(game.snapshot().quantum.length===0&&f.hostileLasers.length===0,'home cleans pairs and laser hazards');
    reset();const boss=spawn('quantum-dreadnought',240,185);boss.ageMs=4000;boss.rotation=.09;f.player.x=90;f.player.y=550;f.player.invulnerableMs=999999;f.elapsedMs=4000;f.updateEnemies(0);
    if(stage.startsWith('sweep-')){boss.ageMs=stage==='sweep-left'?0:Math.PI/.0005;f.updateEnemies(0);f.enemyBullets=[];f.hostileLasers=[];f.combatEffects.clear();f.elapsedMs=boss.ageMs;}else if(stage.startsWith('core-')){boss.hitPoints=boss.definition.hitPoints*(stage==='core-alert'?.34:1);boss.ageMs=stage==='core-dim'?0:stage==='core-alert'?210:1100;f.enemyBullets=[];f.hostileLasers=[];f.combatEffects.clear();f.elapsedMs=boss.ageMs;}else if(stage==='fleet'){f.enemies=[];f.boss=null;spawn('bomber',125,270);spawn('stealth',340,380);spawn('crimson-lance',260,145);}else{f.fireEnemyPattern(boss);f.updateBullets(600);f.triggerBossAttack(boss);if(stage==='active')f.updateHostileLasers(1200);}
    f.phase='paused';f.syncHud();await renderFrames();check(game.snapshot().rendering.frameTextureUploads===0,'quantum effects never upload textures per frame');
    result.textContent=JSON.stringify({status:'passed',checks:['horizontal-symmetry','opposite-rotation','ghost-bullet-immunity','laser-real-targets','paired-fire','single-score','owned-hazard-cleanup','ghost-contact','offscreen-cleanup','six-mount-broadside','rotating-barrel-tips','smooth-turret-tracking','wide-boss-sweep','35-percent-reactor-threshold','four-laser-warning','quantum-laser-hit','pause-home-cleanup','zero-texture-upload'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if(scene==='prism'){
    engine.stop();const f=game as any,stage=new URLSearchParams(location.search).get('stage')??'battle';
    const renderFrames=async()=>{const target=frames+3,deadline=performance.now()+10000;engine.run();while(frames<target&&performance.now()<deadline)await wait(16);engine.stop();check(frames>=target,'actual prism frames rendered');};
    const reset=()=>{f.levelCarousel?.hide();f.hideStatus();f.impacts=[];f.energyImpacts=[];f.debris=[];f.sparks=[];f.powerups=[];f.bombPowerups=[];f.shakeMs=0;f.enemies=[];f.boss=null;f.playerBullets=[];f.enemyBullets=[];f.phase='playing';f.player.x=240;f.player.y=840;f.player.health=100;f.player.lives=3;f.player.invulnerableMs=0;f.pointerFiring=false;f.laserFiring=false;f.weaponForm='basic';f.weaponLevel=0;f.combatEffects.clear();f.beginLevel(9);f.levelTimeline=[];f.asteroids.clear();f.player.invulnerableMs=0;};
    const spawn=(boss=false,x=240,y=300)=>{const e=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id===(boss?'crystal-prism':'mirror-triangle')),x,y);e.entered=true;return e;};
    const shot=(damage=8)=>({x:240,y:160,previousX:240,previousY:700,vx:0,vy:-700,radius:4,damage,hostile:false,color:'#65eaff'});
    if(stage==='live'){
      reset();spawn(true,240,142);f.player.invulnerableMs=999999;f.pointerFiring=true;f.weaponForm='blue';f.weaponLevel=3;
      let shattered=false,finished=false,peakShards=0;const render=f.render;f.render=()=>{};
      try{for(let i=0;i<10000;i++){if(i%128===0)await wait(0);game.update(16);peakShards=Math.max(peakShards,game.snapshot().mirrors.shards);shattered ||= !f.boss&&f.levelAdvanceMs>0;if(f.levelIndex===(9+1)%levels.length){finished=true;break;}}}finally{f.render=render;}
      check(shattered&&finished&&peakShards===30,'normal fire overloads prism, survives full shard storm and advances');
      f.phase='paused';f.syncHud();await renderFrames();result.textContent=JSON.stringify({status:'passed',checks:['natural-overload','thirty-shard-storm','delayed-victory','hazard-cleanup'],durationMs:f.elapsedMs,state:game.snapshot()});result.dataset.status='passed';return;
    }
    reset();let m=spawn();f.playerBullets.push(shot());f.resolveCollisions();check(m.hitPoints===24&&f.playerBullets.length===0,'reflection consumes exact original bullet damage');
    let b=f.enemyBullets.find((p:any)=>p.reflected);check(!!b&&b.hostile&&b.vy>0&&Math.abs(b.vx)<.001,'facet returns player bullet as hostile');
    f.player.x=b.x;f.player.y=b.y+18;f.updateBullets(34);f.resolveCollisions();check(f.player.health===93,'reflected bullet deals exactly seven player damage');
    reset();m=spawn();m.hitPoints=3;f.playerBullets.push(shot(20));f.resolveCollisions();check(!f.enemies.includes(m)&&f.enemyBullets[0].damage===7,'last reflection deals seven damage while saturating finite budget and shattering');
    reset();m=spawn();m.rotation=.35;f.playerBullets.push(shot());f.resolveCollisions();check(Math.abs(f.enemyBullets[0].vx)>100,'rotating facet changes reflection angle');
    reset();m=spawn();f.updateEnemies(1000);check(m.rotation>.3&&m.rotation<.34&&f.enemyBullets.length===0,'ordinary mirror rotates slowly without firing');
    reset();let boss=spawn(true,240,142);for(let i=0;i<20;i++)f.triggerBossAttack(boss);check(f.enemies.filter((e:any)=>e.definition.id==='mirror-triangle').length===10,'prism deployments capped at ten live mirrors');f.updateEnemies(1000);check(boss.rotation>1.6,'boss rotates faster');
    reset();m=spawn();f.weaponForm='purple';f.weaponLevel=1;f.laserFiring=true;
    for(let i=0;i<30;i++)f.updatePlayerLaser(16);
    check(!!f.mirrorLaser&&f.mirrorLaser.warningMs===0&&f.mirrorLaser.endY>840,'laser reflects down from bottom facet');check(f.player.health<100&&m.hitPoints<32,'reflected laser hurts player and consumes budget');
    const state=JSON.stringify(game.snapshot().mirrors);f.pause();for(let i=0;i<12;i++)game.update(16);check(JSON.stringify(game.snapshot().mirrors)===state,'pause freezes reflected laser');f.returnHome();check(!f.mirrorLaser&&f.enemyBullets.length===0,'home clears reflective hazards');
    reset();boss=spawn(true,240,142);boss.hitPoints=5;f.playerBullets.push(shot(20));f.resolveCollisions();
    check(!f.boss&&f.enemyBullets.filter((p:any)=>p.crystalShard).length===30,'prism explosion keeps thirty shards after boss cleanup');check(f.enemyBullets.find((p:any)=>p.reflected)?.damage===7,'last boss reflection deals seven damage and survives explosion cleanup');
    check(f.enemyBullets.filter((p:any)=>p.crystalShard).every((p:any)=>p.damage===90),'all fragments have ninety damage');
    const shard=f.enemyBullets.find((p:any)=>p.crystalShard);f.enemyBullets=[{...shard,x:240,y:840,previousX:240,previousY:800}];f.resolveCollisions();check(f.player.health===10,'shard actually removes ninety armor');
    f.updateLevelTransition(2600);check(f.levelIndex===9&&f.levelAdvanceMs>0,'stage does not erase shards prematurely');f.updateLevelTransition(3900);check(f.levelIndex===(9+1)%levels.length&&f.enemyBullets.length===0,'storm finishes before next level and clears hazards');
    reset();boss=spawn(true,240,170);boss.rotation=.4;boss.hitPoints=410;m=spawn(false,110,405);m.rotation=.3;spawn(false,365,490).rotation=-.45;spawn(false,280,340).rotation=.9;
    if(stage==='laser'){
      f.enemies=[boss];m=spawn(false,240,380);m.hitPoints=32;f.weaponForm='purple';f.weaponLevel=1;f.laserFiring=true;for(let i=0;i<25;i++)f.updatePlayerLaser(16);
    }else if(stage==='shards'){
      f.enemies=[boss];f.spendMirrorBudget(boss,2000);f.updateBullets(1550);f.combatEffects.update(500);
    }else{
      for(let i=0;i<10;i++)f.enemyBullets.push({x:150+i*13,y:430+i*25,vx:80,vy:320,radius:4,damage:2,hostile:true,reflected:true,color:'#ffd9f4'});
    }
    f.phase='paused';f.syncHud();await renderFrames();check(game.snapshot().rendering.frameTextureUploads===0,'crystals use cached GPU textures');
    result.textContent=JSON.stringify({status:'passed',checks:['facet-reflection','finite-budget','seven-damage-hostile-return','slow-passive-mirrors','fast-boss-rotation','bounded-deployment','laser-reflection','pause-home-cleanup','thirty-shards','ninety-damage','full-dodge-window','gpu-crystals'],state:game.snapshot()});result.dataset.status='passed';return;
  }
  if (scene === 'black-hole' || scene === 'hole-live') {
    engine.stop();const f=game as any,params=new URLSearchParams(location.search);const stage=params.get('stage')??'feeding';
    const renderFrames=async()=>{const target=frames+3,deadline=performance.now()+10000;engine.run();while(frames<target&&performance.now()<deadline)await wait(16);engine.stop();check(frames>=target,'rendered verification frames');};
    const reset=()=>{f.enemies=[];f.enemyBullets=[];f.playerBullets=[];f.powerups=[];f.bombPowerups=[];f.boss=null;f.phase='playing';f.player.x=240;f.player.y=840;f.player.health=100;f.player.lives=3;f.player.invulnerableMs=0;f.pointerTarget=null;f.combatEffects.clear();f.beginLevel(8);f.levelTimeline=[];f.asteroids.clear();};
    if(scene==='hole-live'){
      reset();f.player.invulnerableMs=999999;f.pointerFiring=true;let peak=0,sawWarning=false,sawWave=false,finished=false;
      for(let i=0;i<12000;i++){if(i%128===0)await wait(0);game.update(16);const state=f.blackHole.snapshot();peak=Math.max(peak,state.mass);sawWarning ||=state.phase==='warning';sawWave ||=state.phase==='wave';if(f.levelIndex===9){finished=true;break;}}
      check(sawWarning&&sawWave&&finished,'natural fire and matter absorption completes level and advances');check(peak===360,'no passive mass shortcut');
      f.phase='paused';f.syncHud();await renderFrames();check((game.snapshot().rendering.lens?.targetBytes??0)===0,'offscreen targets released on exit');
      result.textContent=JSON.stringify({status:'passed',checks:['natural-level-progression','absorption-threshold','warning-wave-victory','target-release'],durationMs:f.elapsedMs,state:game.snapshot()});result.dataset.status='passed';return;
    }
    reset();check(f.boss?.definition.id==='black-hole'&&f.boss.entered,'black hole enters at start');const h=f.blackHole,hp=f.boss.hitPoints;
    const charge=()=>{h.absorb(1200);for(let i=0;i<2000&&h.phase==='feeding';i++)h.update(16);check(h.phase==='warning','continuous growth completes before warning');};
    f.damageEnemy(f.enemies.indexOf(f.boss),f.boss,99999);f.damageEnemy(f.enemies.indexOf(f.boss),f.boss,99999,false,'bomb');check(f.boss.hitPoints===hp&&h.mass===0,'direct weapons and bombs do not damage or feed black hole');
    const bullet=(y:number)=>({x:h.x,y,vx:0,vy:-100,radius:4,damage:10,hostile:false,color:'#75dcff'});
    f.playerBullets.push(bullet(h.y));f.enemyBullets.push({...bullet(h.y),hostile:true});f.updateBlackHole(16);check(h.snapshot().absorbedMass===.6&&f.playerBullets.length===0&&f.enemyBullets.length===0,'both sides bullets swallowed into mass');
    const rock=f.asteroids.spawn(h.x,h.y,64);const enemy=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id==='scout'),24);enemy.x=h.x;enemy.y=h.y;f.updateBlackHole(16);check(!f.asteroids.rocks.includes(rock)&&!f.enemies.includes(enemy)&&h.snapshot().absorbedMass>9,'asteroids and enemies feed mass');
    for(let i=0;i<120;i++)f.updateBlackHole(16);check(f.enemies.some((e:any)=>e.definition.tier!=='boss'&&(e.x<0||e.x>480)),'enemy enters from side');
    const elite=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id==='crimson-lance'),24);const eh=elite.hitPoints;f.damageEnemy(f.enemies.indexOf(elite),elite,100,false,'bomb');check(elite.hitPoints===eh-50,'elite takes half bomb damage');
    const fixed=JSON.stringify(h.snapshot());f.pause();for(let i=0;i<20;i++)game.update(16);check(JSON.stringify(h.snapshot())===fixed,'pause freezes hole');f.togglePause();
    reset();charge();let ms=1999;while(ms>0){const dt=Math.min(16,ms);f.updateBlackHole(dt);ms-=dt;}check(h.phase==='warning','full two second warning');
    f.enemyBullets=[{...bullet(h.y+470),hostile:true},{...bullet(h.y+470),x:h.x+220,hostile:true}];f.player.invulnerableMs=0;f.updateBlackHole(1);check(h.phase==='wave'&&!f.boss&&f.player.health===100,'outside circle safe and boss victory');check(f.enemyBullets.length===1&&f.enemyBullets[0].x===h.x+220,'only circular blast area cleared');
    reset();charge();f.player.x=h.x;f.player.y=h.y+470;f.player.invulnerableMs=0;for(let i=0;i<125;i++)f.updateBlackHole(16);check(f.player.lives===2,'inside circular blast destroys player');
    reset();h.absorb(stage==='small'?0:260/.3);for(let i=0;i<1000;i++)h.update(16);
    if(stage==='warning'||stage==='wave'){charge();if(stage==='wave'){for(let i=0;i<125;i++)f.updateBlackHole(16);for(let i=0;i<32;i++)f.updateBlackHole(16);}}
    for(let i=0;i<32;i++){const a=i*.48,r=110+i*5;f.playerBullets.push({x:h.x+Math.cos(a)*r,y:h.y+Math.sin(a)*r,vx:0,vy:0,radius:3,damage:2,hostile:false,color:i%2?'#69d8ff':'#ff846e'});}
    for(const [x,y] of [[60,450],[400,400]]){const e=f.spawnEnemy(ENEMY_DEFINITIONS.find(d=>d.id==='scout'),x);e.x=x;e.y=y;e.entered=true;}
    f.asteroids.spawn(120,540,64);f.player.invulnerableMs=0;f.phase='paused';f.syncHud();await renderFrames();
    const lens=game.snapshot().rendering.lens;check(!!lens&&lens.passes>0,'actual scene lensing shader executed');check(!!lens&&lens.targetBytes>0,'offscreen targets allocated');
    if(stage==='resources'){
      f.beginLevel(0);f.enemies=[];f.boss=null;f.phase='paused';await renderFrames();
      check(game.snapshot().rendering.lens?.targetBytes===0,'allocated lens targets released after stage exit');
    }
    result.textContent=JSON.stringify({status:'passed',checks:['start-boss','damage-immunity','absorption-growth','side-enemies','elite-bomb-half','pause','two-second-warning','blast-region','actual-lens-shader'],state:game.snapshot()});result.dataset.status='passed';return;
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
    const pauseClicks=audio.snapshot().uiClicks;
    await click(innerWidth / 2 + Math.min(innerWidth, innerHeight / 2) / 2 - 60, innerHeight - 36);
    check(game.snapshot().phase === 'paused', 'skinned pause dialog');
    check(audio.snapshot().uiClicks>pauseClicks&&!audio.snapshot().active,'pause confirmation plays without combat');
    if (scene === 'home') {
      const cardHeight = Math.min(Math.min(400, Math.min(innerWidth,innerHeight/2)-28)*0.98,innerHeight-40);
      for (let cycle=0;cycle<2;cycle++) {
        await click(innerWidth/2,innerHeight/2+cardHeight*0.27);
        check(uiSounds.at(-1)==='ui-back','main menu return uses distinct sound');
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
