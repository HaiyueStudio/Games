import type { Level } from '../rules/model';
import { glassRouteGeometry, GLASS_DIAMETER as D, type GlassRouteGeometry, type Point } from '../rules/glass';
import type { WhaleScene2D } from './WhaleScene2D';

type Stroke={x:number;y:number;length:number;width:number;angle:number;color:number};
const strokes=new WeakMap<GlassRouteGeometry,Stroke[]>();
function routeStrokes(route:GlassRouteGeometry):Stroke[]{
    const cached=strokes.get(route);if(cached)return cached;
    const points=route.points,result:Stroke[]=[];
    const line=(a:Point,b:Point,width:number,color:number)=>{
        const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.00001)return;
        result.push({x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,length,width,angle:Math.atan2(b[1]-a[1],b[0]-a[0]),color});
    };
    const normals=points.map((p,n):Point=>{
        const a=points[Math.max(0,n-1)]!,b=points[Math.min(points.length-1,n+1)]!,length=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
        return [-(b[1]-a[1])/length,(b[0]-a[0])/length];
    });
    const edge=(n:number,side:number,inset=0):Point=>[points[n]![0]+normals[n]![0]*side*(D/2-inset),points[n]![1]+normals[n]![1]*side*(D/2-inset)];
    for(let n=1;n<points.length;n++)line(points[n-1]!,points[n]!,D,0);
    for(const side of [-1,1])for(let n=1;n<points.length;n++){
        line(edge(n-1,side),edge(n,side),.075,1);
        line(edge(n-1,side,.075),edge(n,side,.075),.055,2);
        line(edge(n-1,side,.13),edge(n,side,.13),.04,3);
    }
    strokes.set(route,result);return result;
}
/** Walls use the collision centreline and diameter, including every curved join. */
function drawGlassRoute(scene:WhaleScene2D,route:GlassRouteGeometry,cam:number,cy:number,z:number,view:{x:number;y:number},colors:readonly (readonly[number,number,number,number])[],opacity:number):void {
    // Trigonometry and offset edges change only when the editor changes a path.
    for(const stroke of routeStrokes(route)){
        const x=view.x+(stroke.x-cam)*z,y=view.y+(stroke.y-cy)*z,length=stroke.length*z;
        if(x+length/2+D*z<scene.board.x||x-length/2-D*z>scene.board.x+scene.board.width||y+D*z<scene.board.y||y-D*z>scene.board.y+scene.board.height)continue;
        scene.fill({x:x-length/2,y:y-stroke.width*z/2,width:length+.5,height:stroke.width*z},colors[stroke.color]!,stroke.angle);
    }
    for(const m of route.mouths){const angle=Math.atan2(m.normal[1],m.normal[0])+Math.PI/2;scene.sprite('clear',2,view.x+(m.point[0]-D*.6-cam)*z,view.y+(m.point[1]-.2-cy)*z,D*1.2*z,.4*z,false,angle,Math.min(1,opacity+.2));}
}
export function drawGlassRoutes(scene:WhaleScene2D,l:Level,cam:number,cy:number,z:number,view:{x:number;y:number},opacity=.58):void {
    const colors:readonly (readonly[number,number,number,number])[]=[[.55,.9,1,opacity*.13],[.15,.57,.7,opacity],[.88,1,1,opacity*.95],[.43,.88,.97,opacity*.45]];
    for(const route of glassRouteGeometry(l))drawGlassRoute(scene,route,cam,cy,z,view,colors,opacity);
}
