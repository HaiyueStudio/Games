/** Screen-space polar dragging shared by the editor preview and game. */
export type Point2=[number,number];
export interface WheelDrag { lastAngle:number|null; value:number; direction:number }
const angleAt=(p:Point2,c:Point2):number|null=>Math.hypot(p[0]-c[0],p[1]-c[1])<8?null:Math.atan2(p[1]-c[1],p[0]-c[0]);
export function beginWheelDrag(point:Point2,center:Point2,value:number,direction:number):WheelDrag {
  return {lastAngle:angleAt(point,center),value,direction};
}
export function moveWheelDrag(drag:WheelDrag,point:Point2,center:Point2):number {
  const angle=angleAt(point,center);
  if(angle!==null&&drag.lastAngle!==null){const delta=Math.atan2(Math.sin(angle-drag.lastAngle),Math.cos(angle-drag.lastAngle));drag.value+=delta*180/Math.PI*drag.direction;}
  drag.lastAngle=angle;return drag.value;
}
