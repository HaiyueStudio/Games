// Extend the game's editable SVG icon system for simple mechanical parts.
import {writeFileSync} from 'node:fs';
const p=(d,fill='#75d4df',extra='')=>`<path d="${d}" fill="${fill}" ${extra}/>`;
const box=(fill='#75d4df',inside='')=>`<rect x="12" y="12" width="72" height="72" rx="13" fill="${fill}"/>${inside}`;
const eye=(x,y)=>`<ellipse cx="${x}" cy="${y}" rx="4" ry="7" fill="#14384f" stroke="none"/><circle cx="${x-1}" cy="${y-3}" r="1.6" fill="white" stroke="none"/>`;
const ball=(fill='#e5f8ff')=>`<circle cx="48" cy="51" r="32" fill="${fill}"/><path d="M25 45 Q34 21 57 24" fill="none" stroke="white" stroke-width="5"/>${eye(39,51)}${eye(58,51)}`;
const arrow=p('M28 28L62 48L28 68L39 48Z','#fff6c9');
const spikes=Array.from({length:8},(_,n)=>`<path d="M40 20L48 2L56 20" fill="#faf8dd" transform="rotate(${n*45} 48 48)"/>`).join('');
const snow=Array.from({length:3},(_,n)=>`<circle cx="${48+(n-1)*3}" cy="${75-n*24}" r="17" fill="#edfbff"/>`).join('')+eye(40,26)+eye(54,26);
const art=[
 box('#8babbc','<path d="M12 40H84M35 12V40M63 40V84M12 65H63" fill="none"/><circle cx="72" cy="24" r="4" fill="#fff3c5"/>'),
 '<path d="M44 55V92H54V55" fill="#98633e"/>'+box('#c38852',arrow),
 '<rect x="6" y="24" width="84" height="48" rx="18" fill="#1c6b7c"/>'+[24,48,72].map(x=>`<circle cx="${x}" cy="49" r="12" fill="#9ddfdf"/>`).join('')+'<path d="M9 34H87M9 65H87" stroke="#ffce79"/>',
 box('#ee9f50',arrow.replace('M28','M17').replace('L62','L51'))+p('M49 28L78 48L49 68L60 48Z','#fff6c9'),
 box('#ed5e68','<path d="M20 48H33L40 31L51 67L59 48H77" fill="none" stroke="#fff7df" stroke-width="7"/>'),
 box('#f2c65a','<path d="M45 26H53V57H45Z" fill="#fff4c5"/><circle cx="49" cy="70" r="5" fill="#fff4c5"/>'),
 box('#68bde7',eye(35,42)+eye(61,42)+'<path d="M31 66Q48 78 65 66" fill="none"/>'),
 '<ellipse cx="48" cy="48" rx="31" ry="38" fill="#f59cce"/><ellipse cx="48" cy="48" rx="23" ry="30" fill="#ffe7f4"/>'+p('M42 34a9 9 0 1 0 12 0M48 48V69H59V61H52','#e16aab'),
 box('#50b8ba','<path d="M20 20L76 76M76 20L20 76" fill="none" stroke="#a6f5e5"/><circle cx="48" cy="48" r="20" fill="#e3e9ff"/>'),
 box('#edbd5c','<path d="M34 44V32a14 14 0 0 1 28 0V44" fill="none" stroke="#fff1b9" stroke-width="8"/><rect x="28" y="40" width="40" height="33" rx="7" fill="#d99444"/><circle cx="48" cy="54" r="4" fill="#163e50"/>'),
 spikes+'<circle cx="48" cy="48" r="29" fill="#d9948d"/>'+eye(39,48)+eye(57,48),ball(),
 '<path d="M28 70L22 79L37 81H61L77 77L69 66Q65 56 65 39Q65 20 48 20Q31 20 31 39Q31 56 28 70Z" fill="#efd081"/><path d="M33 25L29 12L44 22M54 22L68 12L63 28" fill="#efd081"/><circle cx="48" cy="82" r="7" fill="#d09254"/>'+eye(40,43)+eye(56,43),
 '<path d="M46 61V90M48 76Q25 54 15 67M48 70Q70 49 84 63" fill="none" stroke="#3d9b8f" stroke-width="8"/>'+[0,60,120,180,240,300].map(a=>`<ellipse cx="48" cy="24" rx="13" ry="21" fill="#7bdfdd" transform="rotate(${a} 48 43)"/>`).join('')+'<circle cx="48" cy="43" r="16" fill="#fff3c4"/>',
 '<path d="M40 42L55 48L38 91L24 83Z" fill="#b08050"/>'+p('M17 11L75 26L67 56L9 41Z','#f3c753')+'<path d="M28 23L53 30M36 19L43 39" stroke="#fff2c5" stroke-width="5"/>',
 p('M12 69L43 18Q47 12 52 18L85 65L69 77L48 47L28 82Z','#9aebeb')+'<path d="M20 69L46 27L77 66" fill="none" stroke="#d5ffff" stroke-width="4"/>',
 '<path d="M44 42L31 94H66L55 41" fill="#a17758"/>'+p('M48 3C20 0 0 16 9 36C-2 54 13 66 32 62C47 81 68 67 70 58C92 63 99 39 82 28C86 5 61-6 48 3Z','#62b887')+'<path d="M44 44L53 63M44 65L32 74" fill="none" stroke="#d8d383"/>',
 '<path d="M32 53L28 91H66L62 53" fill="#fff0ce"/>'+p('M4 58Q4 10 48 9Q92 10 92 58Q48 72 4 58Z','#ec7f89')+'<ellipse cx="30" cy="35" rx="9" ry="7" fill="#fff4d7"/><ellipse cx="67" cy="40" rx="8" ry="7" fill="#fff4d7"/>',
 '<path d="M32 53L28 91H66L62 53" fill="#fff0ce"/>'+p('M4 58Q4 10 48 9Q92 10 92 58Q48 72 4 58Z','#75c5e5')+'<path d="M16 44L30 33L45 44L60 33L75 44" fill="none" stroke="#e6fbff" stroke-width="7"/>',
 '<path d="M32 53L28 91H66L62 53" fill="#fff0ce"/>'+p('M4 58Q4 10 48 9Q92 10 92 58Q48 72 4 58Z','#dfb957')+'<path d="M30 34H65M30 49H65" stroke="#fff3ce" stroke-width="7"/>',
 box('#ed7e8c','<path d="M22 49H73M60 35L75 49L60 62" fill="none" stroke="#fff5d9" stroke-width="6"/>'),
 box('#7aaee7','<path d="M22 49H73M60 35L75 49L60 62" fill="none" stroke="#fff5d9" stroke-width="6"/>'),
 box('#ba99bf','<circle cx="48" cy="48" r="21" fill="#ead6eb"/>'+eye(42,48)+eye(56,48)),
 spikes+box('#ba99bf',eye(38,44)+eye(58,44)),
 p('M44 74Q4 75 4 41Q23 45 45 20Q51 26 52 45Q73 22 90 21Q94 64 58 78Z','#edf7ff'),
 '<path d="M14 39L43 87H53L82 39M48 38V87" fill="none" stroke="#cddce4"/>'+p('M4 40Q48-15 92 40Z','#f3afcd'),
 p('M6 73Q35 8 88 15Q44 35 30 85M24 86Q56 28 88 39Q58 59 49 93','#b6f3ff'),
 p('M48 2L59 27L83 15L72 39L96 48L70 59L83 83L58 72L48 96L36 71L12 83L24 58L0 48L25 36L12 13L38 25Z','#ffe295'),
 ball('#8cceac')+'<path d="M23 67L9 81M73 67L87 81" stroke="#265f63" stroke-width="10"/>',snow,
 '<rect x="3" y="18" width="90" height="19" rx="8" fill="#d0a27d"/><path d="M17 35V94M78 35V94" stroke="#ae8b71" stroke-width="10"/><path d="M3 16Q27 6 48 16Q73 4 93 16" fill="#bce8d9"/>',
 '<path d="M2 46Q22 15 43 41Q64 7 94 41L94 94H2Z" fill="#e6f5ff"/>'
];
art.splice(28,2);
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="384" viewBox="0 0 768 384"><g stroke="#173e56" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${art.map((s,n)=>`<g transform="translate(${n%8*96} ${Math.floor(n/8)*96})">${s}</g>`).join('')}</g></svg>`;
writeFileSync(new URL('../assets/p1-icons.svg',import.meta.url),svg);
console.log('30 editable P1 mechanical icons');
