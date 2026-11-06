import type {State,Body,Enemy,Item,Tile,Defeated} from './model';

/** Ports supplied by the simulation; feature modules do not import its implementation. */
export type HitDirection='top'|'side'|'bottom';
export interface Services {
    activatePow?(s:State,item:Item):void;
    move(s:State,b:Body,dt:number,player?:boolean,breakBricks?:boolean):{floor:boolean;wall:number;slope:number};
    hurt(s:State,direction?:HitDirection):void;
    defeat(s:State,e:Enemy,cause:Defeated['cause'],source?:Body):void;
    solid(t:Tile,pTime?:number,redOn?:boolean):boolean;
    crush(s:State):void;
    hitBlock(s:State,x:number,y:number,t:Tile,down?:boolean):void;
    coin(s:State,x:number,y:number,count?:number):void;
}
