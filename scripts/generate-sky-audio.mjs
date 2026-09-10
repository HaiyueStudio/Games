import {mkdirSync,writeFileSync} from 'node:fs';
import {SKY_SOUND_IDS,soundPath,synthesizeSkySound,encodeSkyWav} from '../games/sky-strike/audio/synthesis.ts';
const root=new URL('../games/sky-strike/',import.meta.url);mkdirSync(new URL('assets/audio/',root),{recursive:true});let total=0;
for(const id of SKY_SOUND_IDS){const bytes=encodeSkyWav(synthesizeSkySound(id));writeFileSync(new URL(soundPath(id),root),bytes);total+=bytes.length;}
console.log(`${SKY_SOUND_IDS.length} mono PCM sound effects; ${total} bytes`);
