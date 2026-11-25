import type {State} from './model';
import {visitPlayers} from './coop-state';

/** Sweep only after every player and projectile has consumed this frame's contacts. */
export function compactEnemies(s:State):void {
    // Keep small authored scenes stable and amortize compaction; tombstones
    // remain bounded below this threshold even during endless spawning.
    if(s.enemies.length<64||!s.enemies.some(e=>!e.alive))return;
    visitPlayers(s,()=>{
        if(s.held&&!s.held.alive)s.held=null;
        for(const boomerang of s.boomerangs)if(boomerang.targets)boomerang.targets=boomerang.targets.filter(e=>e.alive);
    });
    let count=0;
    for(const enemy of s.enemies){if(enemy.alive)s.enemies[count++]=enemy;else{enemy.held=false;delete enemy.transit;}}
    s.enemies.length=count;
    s.pipeHits=s.pipeHits.filter(hit=>hit.enemy.alive);
}
