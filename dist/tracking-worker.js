let tracker;
self.onmessage=async({data})=>{try{
 if(data.type==='init'){
  const {createTracker}=await import('./camera-runtime.mjs');
  const result=await createTracker();tracker=result.tracker;
  self.postMessage({type:'ready',delegate:result.delegate});
 }else if(data.type==='frame'){
  try{const result=tracker.detectForVideo(data.bitmap,data.time);self.postMessage({type:'result',time:data.time,points:result.landmarks[0]||null,world:result.worldLandmarks[0]||null});}finally{data.bitmap.close();}
 }
}catch(e){self.postMessage({type:'error',message:e.message})}};
