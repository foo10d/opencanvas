export const handConnections=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export function drawHandSkeleton(canvas,points,width=640,height=480){
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 const c=canvas.getContext('2d');c.clearRect(0,0,width,height);if(!points)return;
 const scale=width/640;c.lineCap='round';c.lineJoin='round';c.lineWidth=2*scale;c.strokeStyle='#ffffff';c.shadowColor='#000';c.shadowBlur=3*scale;
 c.beginPath();for(const [a,b] of handConnections){c.moveTo(points[a].x*width,points[a].y*height);c.lineTo(points[b].x*width,points[b].y*height);}c.stroke();
 for(let i=0;i<points.length;i++){c.beginPath();c.arc(points[i].x*width,points[i].y*height,(i===8?7:3)*scale,0,Math.PI*2);c.fillStyle=i===8?'#f5a5d6':'#ffffff';c.fill();}
 c.shadowBlur=0;
}
