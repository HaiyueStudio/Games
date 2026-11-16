import assert from 'node:assert/strict';
import {makeCourse,verifyCourse} from './verify-fixture.mjs';

await verifyCourse('whale-maker-conditions',async ({state,load,advance,capture,checks,delay})=>{
    const course=async (condition,tile,x=4)=>{
        const level=makeCourse({condition});
        if(tile)level.cells[19*level.width+x]=tile;
        await load(level);
    };
    const flag=()=>state(g=>g.scene.draws.some(d=>d.id.startsWith('goal-flags:')&&d.rect.height<40));

    await course({kind:'coins',amount:1},'o');
    assert.equal(await flag(),false);
    await advance(35,'ArrowRight');
    assert.equal(await flag(),true);
    assert.match(await state(g=>g.scoreBanner.text),/条件达成/);
    await capture('coin-clear-flag');
    checks.push('coin-goal-completion-shows-world-flag-and-persistent-HUD');

    await course({kind:'holding',item:'pow'},'pow',5);
    await advance(65,'ArrowRight','ShiftLeft');
    assert.equal(await state(g=>g.state.held?.kind),'pow');
    assert.equal(await flag(),true);
    await capture('holding-required-pow');
    await advance(1);
    assert.equal(await state(g=>g.state.held),null);
    assert.equal(await flag(),false);
    checks.push('actual-pickup-and-release-toggle-holding-clear-flag');

    await course({kind:'no-damage'});
    await state(g=>{
        const s=g.state,p=s.player;
        s.power=1;p.h=2;p.y=18;s.invincible=0;
        s.enemies.push({kind:'duck',x:p.x+.1,y:p.y+.4,w:.8,h:.8,vx:0,vy:0,alive:true,held:false,cooldown:0});
        g.draw();
    });
    assert.equal(await flag(),true);
    await capture('no-damage-ready');
    await advance(1);
    assert.equal(await flag(),false);
    assert.equal(await state(g=>g.state.clearRun.damaged),true);
    assert.match(await state(g=>g.scoreBanner.text),/条件失败/);
    await capture('no-damage-failed');
    checks.push('effective-damage-removes-flag-and-colors-failed-condition');

    await course({kind:'no-landing'});
    await advance(1);assert.equal(await flag(),false);
    await advance(12,'Space');assert.equal(await flag(),true);
    await capture('airborne-clear-flag');
    await advance(250);assert.equal(await flag(),false);
    assert.equal(await state(g=>g.state.clearRun.landed),true);
    await capture('ordinary-landing-failed');
    checks.push('first-jump-earns-flag-and-ordinary-ground-revokes-it');

    for(const kind of ['spring-v','p-switch','J']){
        await course({kind:'no-landing'},kind,8);
        await state(g=>{
            const s=g.state,b=s.items[0]??s.enemies[0];b.cooldown=b.vx=0;
            Object.assign(s.player,{x:b.x,y:b.y-s.player.h-.025,vy:8});
            s.clearRun.leftGround=true;s.grounded=false;
        });
        await advance(1);
        assert.ok(await state(g=>g.state.player.vy)<0,kind);
        assert.equal(await flag(),true,kind);
        assert.equal(await state(g=>g.state.clearRun.landed),false,kind);
        await capture(`rebound-${kind}`);
    }
    checks.push('real-spring-P-switch-and-enemy-rebounds-keep-clear-eligibility');

    await state(g=>{g.toggle();g.selection.clear();g.p1Editor.enabled=true;g.draw();});
    const cycle=key=>state((g,key)=>{
        const editor=g.p1Editor,index=editor.keys().indexOf(key);
        editor.page=Math.floor(index/4);g.draw();editor.cycle(index%4);g.draw();
        return g.level.condition??null;
    },key);
    for(const kind of ['star','stay-water','riding','wearing',null,'coins','defeats','power','holding','no-damage','no-landing']){
        assert.equal((await cycle('condition'))?.kind??null,kind);
        if(kind==='holding'){
            assert.equal((await cycle('target')).item,'iron-shell');
            await capture('editor-required-object');
        }
    }
    await capture('editor-no-landing');
    await state(g=>g.save());await delay(200);
    await state(g=>{delete g.level.condition;g.read();});await delay(250);
    assert.equal(await state(g=>g.level.condition.kind),'no-landing');
    checks.push('native-editor-selects-all-conditions-and-holding-target-and-persists-them');
});
