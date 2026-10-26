export const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
export function smoothPoint(previous,next,amount){if(!previous)return {...next};const a=1-clamp(amount,0,.9);return {x:previous.x+(next.x-previous.x)*a,y:previous.y+(next.y-previous.y)*a};}
export function mapHand(p,center,gain){return {x:clamp(.5+(1-p.x-center.x)*gain),y:clamp(.5+(p.y-center.y)*gain)};}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
export function isPinched(points,previous=false){const palm=Math.max(.001,distance(points[0],points[9]));return distance(points[4],points[8])/palm<(previous?.52:.38);}
export function isPointing(points,previous=false){
 if(!points||points.length<21)return false;
 const bend=(base,joint,tip)=>{
  const a=points[base],b=points[joint],c=points[tip];
  const u=[a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0)],v=[c.x-b.x,c.y-b.y,(c.z||0)-(b.z||0)];
  const length=Math.hypot(...u)*Math.hypot(...v);
  return length>1e-8?u.reduce((sum,n,i)=>sum+n*v[i],0)/length:null;
 };
 const index=bend(5,6,8);
 if(index===null||index>=(previous?-.65:-.75)||distance(points[8],points[0])<=distance(points[6],points[0])*(previous?1.04:1.08))return false;
 // A non-straight finger is not necessarily curled: require a deep bend
 // and a fingertip that has returned toward the palm, for all three fingers.
 return [[9,10,12],[13,14,16],[17,18,20]].every(([base,joint,tip])=>{
  const angle=bend(base,joint,tip);
  // A small release margin prevents threshold noise from breaking an active stroke.
  return angle!==null&&angle>(previous?-.35:-.25)&&distance(points[tip],points[0])<distance(points[joint],points[0])*(previous?.96:.92);
 });
}
export function stablePoint(previous,next,amount,dt=1/30){
 if(!previous)return {...next};
 const strength=clamp(amount,0,.9),delta=Math.hypot(next.x-previous.x,next.y-previous.y);
 if(strength===0)return {...next};
 const deadzone=.001+strength*strength*.009;
 if(delta<=deadzone)return {...previous};
 // Ignore tremor-sized movement; ease in outside that radius rather than jumping.
 const speed=delta/Math.max(.008,dt);
 const cutoff=.7+(1-strength)*1.5+Math.min(80,Math.max(0,speed-.35)*24);
 const alpha=1-Math.exp(-2*Math.PI*cutoff*Math.min(.1,dt));
 const follow=alpha*(delta-deadzone)/delta;
 return {x:previous.x+(next.x-previous.x)*follow,y:previous.y+(next.y-previous.y)*follow};
}
export function gestureGate(state,wantsInk,time){
 if(!wantsInk){state.since=null;return false;}
 if(state.since===null)state.since=time;
 return time-state.since>=45;
}
