// Drawing operations are replayable so every tool supports undo and local restore.
export function floodFill(image, x, y, tolerance=28, color='#000000') {
 const {width:w,height:h,data:d}=image;
 x=Math.floor(x); y=Math.floor(y); if(x<0||y<0||x>=w||y>=h)return image;
 const start=y*w+x, seen=new Uint8Array(w*h), queue=new Int32Array(w*h);
 const shade=i=>{const a=d[i*4+3]/255;return [0,1,2].map(c=>d[i*4+c]*a+255*(1-a));};
 const fill=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 const source=shade(start); if(source.every((v,c)=>Math.abs(v-fill[c])<1))return image;
 let head=0,tail=0;queue[tail++]=start;seen[start]=1;
 while(head<tail){const i=queue[head++],rgb=shade(i);if(rgb.some((v,c)=>Math.abs(v-source[c])>tolerance))continue;
 d[i*4]=fill[0];d[i*4+1]=fill[1];d[i*4+2]=fill[2];d[i*4+3]=255;
 const px=i%w,py=Math.floor(i/w);
 for(const n of [px>0?i-1:-1,px<w-1?i+1:-1,py>0?i-w:-1,py<h-1?i+w:-1])if(n>=0&&!seen[n]){seen[n]=1;queue[tail++]=n;}
 }return image;
}
export function polygonPath(points,w,h){const path=new Path2D();if(points.length){path.moveTo(points[0].x*w,points[0].y*h);for(const p of points.slice(1))path.lineTo(p.x*w,p.y*h);path.closePath();}return path;}
export function contains(points,p){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function applySpecial(s,ctx,w,h){
 if(s.tool==='polygon'){ctx.save();ctx.fillStyle=s.color;ctx.fill(polygonPath(s.points,w,h));ctx.restore();return true;}
 if(s.tool==='fill'){ctx.putImageData(floodFill(ctx.getImageData(0,0,w,h),s.points[0].x*w,s.points[0].y*h,28,s.color),0,0);return true;}
 if(s.tool==='move'||s.tool==='cut'){
 const layer=document.createElement('canvas');layer.width=w;layer.height=h;const c=layer.getContext('2d'),path=polygonPath(s.points,w,h);
 c.save();c.clip(path);c.drawImage(ctx.canvas,0,0);c.restore();
 ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fill(path);ctx.restore();
 if(s.tool==='move')ctx.drawImage(layer,s.dx*w,s.dy*h);return true;
 }
 if(s.tool==='airbrush'){
 ctx.save();const radius=s.size*1.5,rgb=[1,3,5].map(i=>parseInt(s.color.slice(i,i+2),16)).join(',');
 const stamp=p=>{const x=p.x*w,y=p.y*h,g=ctx.createRadialGradient(x,y,0,x,y,radius);g.addColorStop(0,`rgba(${rgb},.16)`);g.addColorStop(.5,`rgba(${rgb},.06)`);g.addColorStop(1,`rgba(${rgb},0)`);ctx.fillStyle=g;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);};
 stamp(s.points[0]);for(let i=1;i<s.points.length;i++){const a=s.points[i-1],b=s.points[i],n=Math.max(1,Math.ceil(Math.hypot((b.x-a.x)*w,(b.y-a.y)*h)/Math.max(1,radius/6)));for(let j=1;j<=n;j++)stamp({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n});}ctx.restore();return true;
 }return false;
}
