import {MUSIC,SOUNDS,type Sound} from './sounds';
export const SAMPLE_RATE=44100;
const TAU=Math.PI*2;
const hz=(note:number)=>440*2**((note-69)/12);
function normalize(a:Float32Array,peak:number):Float32Array {let max=0;for(const s of a)max=Math.max(max,Math.abs(s));if(max)for(let n=0;n<a.length;n++)a[n]=a[n]!/max*peak;return a;}
function random(seed:number):()=>number{return ()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};}

/** Note tails wrap into the beginning, making one continuous musical period. */
function note(out:Float32Array,at:number,midi:number,length:number,volume:number,voice:'bell'|'pluck'|'bass'|'pad',wrap=false):void {
    const f=hz(midi),count=Math.ceil((length+(voice==='bell'?.35:.1))*SAMPLE_RATE),start=Math.round(at*SAMPLE_RATE);
    for(let n=0;n<count;n++){
        const t=n/SAMPLE_RATE,p=TAU*f*t,attack=Math.min(1,t/(voice==='pad'?.04:.004)),release=Math.min(1,Math.max(0,(length+.08-t)/.08));
        const decay=Math.exp(-t/(voice==='bass'?.32:voice==='bell'?.16:voice==='pad'?.8:.25));
        const body=voice==='bell'?Math.sin(p)*.76+Math.sin(p*2.76)*Math.exp(-t*22)*.19+Math.sin(p*4.02)*Math.exp(-t*34)*.07:
            voice==='pluck'?Math.sin(p)*.67+Math.sin(p*2)*.2*Math.exp(-t*4)+Math.sin(p*3)*.09*Math.exp(-t*10):
            voice==='bass'?Math.sin(p)*.88+Math.sin(p*2)*.1:Math.sin(p)*.6+Math.sin(p*1.002)*.23+Math.sin(p*2)*.08;
        const index=start+n;if(index<out.length||wrap)out[index%out.length]!+=body*attack*release*decay*volume;
    }
}
function percussion(out:Float32Array,at:number,kind:'kick'|'rim'|'hat'|'shaker',volume:number,seed:number,wrap=false):void {
    const noise=random(seed),duration=kind==='kick'?.22:kind==='rim'?.12:.055,start=Math.round(at*SAMPLE_RATE);let low=0,phase=0;
    for(let n=0;n<duration*SAMPLE_RATE;n++){
        const t=n/SAMPLE_RATE,r=noise(),filtered=low+.16*(r-low);low=filtered;
        phase+=TAU*(48+90*Math.exp(-t*35))/SAMPLE_RATE;
        const value=kind==='kick'?Math.sin(phase)*Math.exp(-t*21):kind==='rim'?(Math.sin(TAU*290*t)*.4+filtered*.55)*Math.exp(-t*42):
            (r-low)*(kind==='hat'?.35:.2)*Math.exp(-t*90);
        const index=start+n;if(index<out.length||wrap)out[index%out.length]!+=value*volume*Math.min(1,t/.0015);
    }
}

// Four original eight-bar phrases; no borrowed melody or external samples.
export const MELODY:readonly (readonly number[])[]=[
    [76,79,81,79,76,74,72,74],[76,79,83,81,79,76,74,0],
    [74,77,81,79,77,76,74,72],[74,76,79,77,74,71,72,0],
    [79,81,84,83,81,79,76,79],[81,84,86,84,83,81,79,0],
    [77,81,79,77,76,74,72,74],[74,79,77,74,71,74,79,0],
];
export const CHORDS:readonly (readonly number[])[]=[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,65],[60,64,67,72],[57,60,64,69],[53,57,60,65],[55,59,62,65]];

export function synthesizeMusic():Float32Array {
    const out=new Float32Array(MUSIC.seconds*SAMPLE_RATE),beat=60/MUSIC.bpm;
    for(let bar=0;bar<MUSIC.bars;bar++){
        const start=bar*4*beat,chord=CHORDS[bar%8]!,phrase=MELODY[bar%8]!,section=Math.floor(bar/8);
        for(let k=0;k<8;k++){
            const at=start+k*beat/2,swing=k%2?.016:0;
            if(phrase[k]&&!(section===2&&k===6)){
                const pitch=phrase[k]!+(section===3&&bar%4===1?12:0);
                note(out,at+swing,pitch,beat*(k===7?.72:.45),section===2?.115:.15,'bell',true);
                if(section===1||section===3)note(out,at+swing+beat*.75,pitch,beat*.35,.022,'bell',true);
            }
            if(k%2===1)for(const [n,pitch]of chord.slice(0,3).entries())note(out,at+n*.008,pitch,beat*.55,.052,'pluck',true);
            note(out,at+swing,chord[(k+section)%chord.length]!+12,beat*.3,.025,'pluck',true);
            percussion(out,at,'shaker',section===2?.045:.065,bar*97+k+17,true);
            if(k%2===0)percussion(out,at,'hat',.045,bar*31+k+83,true);
        }
        for(const [k,pitch]of [chord[0]!-12,chord[0]!-12,chord[2]!-12,chord[0]!-12].entries()){
            note(out,start+k*beat,pitch,beat*.72,.17,'bass',true);
            if(k===0||k===2)percussion(out,start+k*beat,'kick',.13,bar*13+k+19,true);
            if(k===1||k===3)percussion(out,start+k*beat,'rim',.09,bar*37+k+29,true);
        }
        if(section===2)for(const pitch of chord)note(out,start,pitch+12,beat*3.6,.022,'pad',true);
        if(bar%8===7)for(let k=0;k<3;k++)percussion(out,start+(3.25+k*.25)*beat,'rim',.045+k*.008,bar*11+k+1,true);
    }
    // Circular two-tap room echo, mixed before normalization; no fade or silence at the seam.
    const dry=out.slice();for(const [seconds,gain]of [[beat*.75,.105],[beat*1.5,.045]]){const delay=Math.round(seconds!*SAMPLE_RATE);for(let n=0;n<out.length;n++)out[(n+delay)%out.length]!+=dry[n]!*gain!;}
    return normalize(out,.72);
}

export function synthesizeSound(id:Sound):Float32Array {
    const out=new Float32Array(Math.round(SOUNDS[id].seconds*SAMPLE_RATE));
    const chime=(notes:number[],spacing:number,voice:'bell'|'pluck'='bell')=>notes.forEach((pitch,n)=>note(out,n*spacing,pitch,Math.min(.24,SOUNDS[id].seconds-n*spacing-.02),.7,voice));
    if(id==='coin')chime([88,95],.065);
    else if(id==='reward')chime([72,76,79],.075,'pluck');
    else if(id==='power')chime([60,64,67,72,76,79],.08);
    else if(id==='star')chime([72,79,84,88,91,96],.11);
    else if(id==='checkpoint')chime([72,76,79,84,88],.12);
    else if(id==='key')chime([79,83,86,91],.1);
    else if(id==='goal')chime([72,76,79,84,79,84],.12);
    else if(id==='victory'){
        chime([72,76,79,84,0].filter(Boolean),.12);
        for(const [n,pitch]of [79,81,83,84,88,86,84].entries())note(out,.65+n*.15,pitch,.24,.55,'bell');
        for(const pitch of [60,64,67,72])note(out,1.85,pitch,.6,.3,'pluck');
    }else if(id==='death'){
        for(const [n,pitch]of [76,72,67,64,60,55].entries())note(out,n*.19,pitch,.3,.6,'pluck');
    }else{
        let seed=0x7a1e;for(const c of id)seed=(Math.imul(seed,31)+c.charCodeAt(0))>>>0;const noise=random(seed);let phase=0,low=0;
        for(let n=0;n<out.length;n++){
            const t=n/SAMPLE_RATE,p=t/SOUNDS[id].seconds,r=noise();low+=.12*(r-low);let v=0,f=0;
            if(id==='jump'||id==='spin'||id==='spring'){f=id==='jump'?210+650*p:id==='spin'?350+300*p+100*Math.sin(p*TAU*3):135+530*p+190*Math.sin(p*TAU*2)*Math.exp(-p*2);phase+=TAU*f/SAMPLE_RATE;v=(Math.sin(phase)*.7+Math.sin(phase*2)*.12)*Math.exp(-p*(id==='spring'?2.6:3));}
            else if(['bump','stomp','kick','land','step','stone'].includes(id)){f=id==='bump'?170:id==='stomp'?260:id==='kick'?330:id==='stone'?78:id==='step'?115:100;phase+=TAU*(f*Math.exp(-p*2)+35)/SAMPLE_RATE;v=(Math.sin(phase)*.7+low*(id==='stone'?.6:.2))*Math.exp(-p*5);}
            else if(['break','hit','pow','cannon','ice'].includes(id)){phase+=TAU*(id==='pow'?48+100*Math.exp(-t*16):id==='cannon'?70+180*Math.exp(-t*25):id==='ice'?1450*(1-p)+300:110+240*(1-p))/SAMPLE_RATE;v=(low*.9+Math.sin(phase)*(id==='ice'?.22:.55))*Math.exp(-p*5)+r*.1*Math.exp(-t*80);}
            else if(id==='fire'||id==='throw'||id==='pipe'){f=id==='pipe'?420-280*p+30*Math.sin(p*TAU*4):id==='fire'?850*Math.exp(-p*5)+120:550*(1-p)+150;phase+=TAU*f/SAMPLE_RATE;v=(Math.sin(phase)*.6+low*.22)*Math.exp(-p*3.7);}
            else if(id==='splash'||id==='swim'||id==='skid'){f=id==='skid'?350:750+350*Math.sin(p*TAU*2);phase+=TAU*f/SAMPLE_RATE;v=(low*.8+Math.sin(phase)*(id==='skid'?.1:.2))*Math.sin(Math.PI*p)*Math.exp(-p*3);}
            else if(id==='hurt'){phase+=TAU*(610*(1-p)+100+50*Math.sin(p*TAU*7))/SAMPLE_RATE;v=(Math.sin(phase)*.6+Math.sin(phase*1.5)*.15)*Math.exp(-p*3);}
            else if(id==='metal'){v=(Math.sin(TAU*830*t)+.4*Math.sin(TAU*1373*t)+.2*Math.sin(TAU*2241*t))*Math.exp(-t*17);}
            else if(id==='door'){phase+=TAU*(180+130*Math.sin(p*Math.PI))/SAMPLE_RATE;v=(Math.sin(phase)*.65+low*.35)*Math.exp(-p*3);}
            else{f=id==='grab'?620:id==='switch'?330:id==='click'?1080:860;phase+=TAU*(f+p*f*.45)/SAMPLE_RATE;v=(Math.sin(phase)*.7+Math.sin(phase*2)*.12)*Math.exp(-p*6);}
            out[n]=v;
        }
    }
    for(let n=0;n<out.length;n++)out[n]!*=Math.min(1,n/(SAMPLE_RATE*.003))*Math.min(1,(out.length-1-n)/(SAMPLE_RATE*.015));
    return normalize(out,.76);
}

export function encodeWav(samples:Float32Array):Uint8Array {
    const bytes=new Uint8Array(44+samples.length*2),view=new DataView(bytes.buffer);
    const text=(at:number,s:string)=>{for(let n=0;n<s.length;n++)bytes[at+n]=s.charCodeAt(n);};
    text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,SAMPLE_RATE,true);view.setUint32(28,SAMPLE_RATE*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);
    for(let n=0;n<samples.length;n++)view.setInt16(44+n*2,Math.round(Math.max(-1,Math.min(1,samples[n]!))*32767),true);
    return bytes;
}
