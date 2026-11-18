import {GuiElement, type GuiButton, type GuiLabel, type GuiRect, type GuiRoot} from '@haiyue/engine/gui';
import type {PadFrame} from '../../gamepad/sampler';
import {ACTIONS,ACTION_LABELS,assignDevice,capturedPadBinding,changeBinding,defaultControls,keyLabel,padLabel,type CoopSettings} from './coop-controls';

export const COOP_CHARS=ACTION_LABELS.join('')+'协作设置本地玩家人数控制键盘手柄当前连接未绑定十字摇杆空格回车小请按一个取消应用恢复默认此按键不可用，请换一个。先连接分配给本玩家的手柄推动摇杆更改人数会重新开始当前关卡。已到达等待队友全员抵达相机共用倒下了全队重试';
type Host={ui:GuiRoot;rect(node:GuiElement,rect:GuiRect):GuiElement;label(text:string,x:number,y:number,w:number,h?:number):GuiLabel;button(text:string,x:number,y:number,w:number,action:()=>void):GuiButton;highlight(button:GuiButton,selected:boolean):void};
type Capture={device:'keys'|'pad';action:number;neutral:boolean};

export class CoopSettingsPanel {
    private readonly nodes:GuiElement[]=[];
    private readonly counts:GuiButton[]=[];
    private readonly tabs:GuiButton[]=[];
    private readonly rows:{keys:GuiButton;pad:GuiButton}[]=[];
    private readonly device:GuiButton;
    private readonly hint:GuiLabel;
    private draft:CoopSettings|null=null;
    private player=0;
    private capture:Capture|null=null;
    private error='';
    get open():boolean {return this.draft!==null;}

    constructor(private readonly host:Host,private readonly apply:(value:CoopSettings)=>void){
        const pane=(x:number,y:number,width:number,height:number,color:string,radius:number)=>{
            const box=new GuiElement({pointerFilter:'stop',style:{backgroundColor:color,radius}});
            host.ui.add(host.rect(box,{x,y,width,height}));this.nodes.push(box);
        };
        const label=(text:string,x:number,y:number,w:number,h=28)=>{const node=host.label(text,x,y,w,h);this.nodes.push(node);return node;};
        const button=(text:string,x:number,y:number,w:number,action:()=>void)=>{const node=host.button(text,x,y,w,action);this.nodes.push(node);return node;};
        pane(0,0,1280,800,'#061b29ae',0);
        pane(310,34,660,727,'#123546',20);
        label('本地协作设置',344,58,270,35);
        label('玩家人数',344,106,112);
        for(let i=0;i<4;i++)this.counts.push(button(`${i+1} 人`,456+i*74,103,64,()=>{this.draft!.count=i+1;this.cancelCapture();}));
        for(let i=0;i<4;i++)this.tabs.push(button(`P${i+1}`,344+i*74,159,62,()=>{this.player=i;this.cancelCapture();}));
        this.device=button('',661,159,275,()=>{
            const d=this.draft!,current=d.players[this.player]!.device;
            assignDevice(d,this.player,current===3?-1:current+1);this.cancelCapture();
        });
        label('键盘',534,211,164);label('手柄',737,211,199);
        ACTIONS.forEach((_,i)=>{
            const y=243+i*41,begin=(device:Capture['device'])=>{this.capture={device,action:i,neutral:false};this.error='';};
            label(ACTION_LABELS[i]!,344,y+3,180);
            this.rows.push({keys:button('',534,y,180,()=>begin('keys')),pad:button('',737,y,199,()=>begin('pad'))});
        });
        this.hint=label('',344,657,592);
        button('恢复默认',344,702,123,()=>{
            const d=this.draft!,p=defaultControls(this.player);
            for(const [index,key] of p.keys.entries())changeBinding(d,this.player,'keys',index,key);
            d.players[this.player]!.pad=p.pad;assignDevice(d,this.player,p.device);this.cancelCapture();
        });
        button('取消',735,702,92,()=>this.close());
        button('应用',841,702,95,()=>{const value=this.draft!;this.close();this.apply(value);});
        this.close();
    }
    show(value:CoopSettings):void {this.draft=structuredClone(value);this.player=0;this.cancelCapture();this.nodes.forEach(node=>node.setVisible(true));}
    close():void {this.draft=null;this.cancelCapture();this.nodes.forEach(node=>node.setVisible(false));}
    private cancelCapture():void {this.capture=null;this.error='';}
    private bind(value:string):void {
        const c=this.capture!;
        if(changeBinding(this.draft!,this.player,c.device,c.action,value))this.cancelCapture();
        else this.error='此按键不可用，请换一个。';
    }
    key(e:KeyboardEvent):void {
        e.preventDefault();if(e.repeat)return;
        if(e.code==='Escape'){if(this.capture)this.cancelCapture();else this.close();}
        else if(this.capture?.device==='keys')this.bind(e.code);
    }
    update(pads:readonly PadFrame[]):void {
        const d=this.draft;if(!d)return;
        const p=d.players[this.player]!,pad=pads.find(frame=>frame.index===p.device);
        if(this.capture?.device==='pad'&&pad){
            const binding=capturedPadBinding(pad);
            if(!binding)this.capture.neutral=true;
            else if(this.capture.neutral)this.bind(binding);
        }
        this.counts.forEach((button,i)=>this.host.highlight(button,d.count===i+1));
        this.tabs.forEach((button,i)=>this.host.highlight(button,this.player===i));
        this.device.setText(p.device<0?'手柄未绑定':`手柄 ${p.device+1} · ${pad?'已连接':'未连接'}`);
        for(const [i,row]of this.rows.entries()){
            row.keys.setText(keyLabel(p.keys[i]!));row.pad.setText(padLabel(p.pad[i]!));
            this.host.highlight(row.keys,this.capture?.device==='keys'&&this.capture.action===i);
            this.host.highlight(row.pad,this.capture?.device==='pad'&&this.capture.action===i);
        }
        this.hint.setText(this.error||(this.capture?.device==='keys'?'请按一个键盘按键 · Esc 取消':this.capture?.device==='pad'?(pad?'请按手柄按键或推动摇杆 · Esc 取消':'请先连接分配给本玩家的手柄'):'更改人数会重新开始当前关卡。'));
    }
}
