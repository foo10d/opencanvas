import {drawHandSkeleton} from './tracking-overlay.mjs';
import {applySpecial,polygonPath} from './paint.mjs';
import {createTracker,cameraErrorMessage} from './camera-runtime.mjs';
import {clamp,smoothPoint,mapHand,isPinched,isPointing,stablePoint,gestureGate} from './motion.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),W=1200,H=900;
let savedDrawing=null,tool='brush';
const snapshots=new Map();let saveTimer=null;
const overlay=$('#selection'),overlayCtx=overlay.getContext('2d');
const base=document.createElement('canvas');base.width=W;base.height=H;const baseCtx=base.getContext('2d',{willReadFrequently:true});let cachedList=null,cachedLength=-1,cachedLast=null;
let color='#000000',eraser=false,strokes=[],redo=[],active=null,filtered=null,mode='pointer',ink=false,paused=false,point={x:.5,y:.5},dirty=false;
let pointing=false;
let handFiltered=null,lastMotionTime=0,gate={since:null},pendingHandPath=[];
let showTracking=false,latestLandmarks=null,trackingDelegate='cpu',lastResultTime=0,trackingFps=0,lastMetricTime=0,rateWindowStart=0,rateFrames=0,frameIsVideo=false;
let directTracker=null,fallbackLoading=false,frameTimeout=null,hiddenTimeout=null;
let stream=null,worker=null,ready=false,busy=false,starting=false,frameId=0,generation=0,lastVideo=-1,lastFrame=0,pinch=false,lastHand=null,center={x:.5,y:.5},dwell=null,dwellStart=0,dwellDone=false,timeout;
const status=text=>$('#draw-status').textContent=text;
function drawStroke(s,target=ctx){if(s.tool==='lasso')return;if(applySpecial(s,target,W,H))return;target.save();target.globalCompositeOperation=s.erase?'destination-out':'source-over';target.strokeStyle=s.color;target.fillStyle=s.color;target.lineWidth=s.size;target.lineCap='round';target.lineJoin='round';const p=s.points;if(p.length===1){target.beginPath();target.arc(p[0].x*W,p[0].y*H,s.size/2,0,Math.PI*2);target.fill()}else if(p.length){target.beginPath();target.moveTo(p[0].x*W,p[0].y*H);for(const v of p.slice(1))target.lineTo(v.x*W,v.y*H);target.stroke()}target.restore();}
function remember(operation){
 if(snapshots.has(operation))return;
 snapshots.set(operation,baseCtx.getImageData(0,0,W,H));
 if(snapshots.size>8){const oldest=snapshots.keys().next().value;snapshots.delete(oldest);}
}
function render(){
 if(cachedList!==strokes||cachedLength!==strokes.length||cachedLast!==strokes.at(-1)){
  const last=strokes.at(-1),snapshot=snapshots.get(last);
  if(snapshot){baseCtx.clearRect(0,0,W,H);baseCtx.putImageData(snapshot,0,0);}
  else if(cachedList===strokes&&cachedLength===strokes.length-1&&cachedLast===strokes.at(-2)){drawStroke(last,baseCtx);remember(last);}
  else {baseCtx.clearRect(0,0,W,H);let start=0;for(let i=strokes.length-1;i>=0;i--){if(snapshots.has(strokes[i])){baseCtx.putImageData(snapshots.get(strokes[i]),0,0);start=i+1;break;}}
   for(let i=start;i<strokes.length;i++){drawStroke(strokes[i],baseCtx);if(i>=strokes.length-8)remember(strokes[i]);}
  }
  cachedList=strokes;cachedLength=strokes.length;cachedLast=last;
 }
 ctx.clearRect(0,0,W,H);ctx.drawImage(base,0,0);if(active)drawStroke(active);
 overlayCtx.clearRect(0,0,W,H);const poly=active?.tool==='lasso'?active.points:null;
 if(poly?.length){overlayCtx.save();const path=polygonPath(poly,W,H);overlayCtx.strokeStyle='white';overlayCtx.lineWidth=4;overlayCtx.stroke(path);overlayCtx.strokeStyle='#49305f';overlayCtx.lineWidth=2;overlayCtx.setLineDash([8,6]);overlayCtx.stroke(path);overlayCtx.restore();}
 $('#restore').hidden=!savedDrawing||strokes.length>0||!!active;$('#stroke-count').textContent=`${strokes.length} ${strokes.length===1?'edit':'edits'}`;$('#undo').disabled=!strokes.length&&!clearBackup;$('#redo').disabled=!redo.length;
}
function save(){clearTimeout(saveTimer);dirty=true;$('#save-state').textContent='saving on this device…';saveTimer=setTimeout(saveNow,120);}
function saveNow(){clearTimeout(saveTimer);saveTimer=null;try{localStorage.setItem('opencanvas-v1',JSON.stringify(strokes));savedDrawing=null;$('#restore').hidden=true;$('#save-state').textContent='saved on this device';dirty=false}catch{dirty=true;$('#save-state').textContent='Browser storage is full or unavailable. Save image to keep your drawing.'}}
function begin(p){
 if(active)return;filtered={...p};
 active={tool,color,size:Number($('#size').value),erase:eraser,points:[{...p}]};
 render();
}
function move(p,smoothing=true){
 if(!active||active.tool==='fill')return;
 filtered=smoothing?smoothPoint(filtered,p,Number($('#smooth').value)/100):p;const prev=active.points.at(-1);
 if(Math.hypot((prev.x-filtered.x)*W,(prev.y-filtered.y)*H)<.6)return;active.points.push({...filtered});
 if(active.points.length>=6000){finish();if(tool!=='lasso')begin(p)}render();
}
function finish(){
 if(!active)return;
 if(active.tool==='lasso'){if(active.points.length<3){active=null;filtered=null;render();return;}active.tool='polygon';}
 redo=[];strokes.push(active);active=null;filtered=null;render();save();
}
function undo(){finish();if(!strokes.length)return;redo.push(strokes.pop());render();save();status('Last stroke undone.')}
function redoStroke(){finish();if(!redo.length)return;const next=redo.pop();if(next.clear){clearBackup=strokes;strokes=[];}else strokes.push(next);render();save();status('Action restored.')}
function setTool(value){
 pendingHandPath=[];gate.since=null;pointing=false;finish();tool=typeof value==='boolean'?(value?'eraser':'brush'):value;eraser=tool==='eraser';
 for(const button of $$('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===tool));
 const toggle=$('[data-gesture=eraser]');toggle.textContent=eraser?'use brush':'use eraser';toggle.setAttribute('aria-pressed',String(eraser));$('#cursor').classList.toggle('erasing',eraser);
 const usesSize=['brush','eraser','airbrush'].includes(tool);$('#size').disabled=!usesSize;
 $('#tool-help').textContent={brush:'drag to draw.',eraser:'drag to erase.',fill:'tap inside a closed area to fill it.',airbrush:'drag for soft shading. repeat a pass to darken it.',lasso:'outline a shape, then release to fill it.'}[tool];
 brushPreview();render();status($('#tool-help').textContent);
}
function brushPreview(){$('#brush-dot').style.width=$('#brush-dot').style.height=Math.min(24,Number($('#size').value))+'px';$('#brush-dot').style.background=eraser?'#fff':color;$('#size-out').textContent=$('#size').value;$('#smooth-out').textContent=$('#smooth').value+'%'}
$('#size').oninput=brushPreview;$('#smooth').oninput=brushPreview;
$$('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('#undo').onclick=undo;$('#redo').onclick=redoStroke;
function pointer(e){const r=canvas.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)}}
let pointerId=null;
canvas.onpointerdown=e=>{if(mode!=='pointer'||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();canvas.focus();pointerId=e.pointerId;canvas.setPointerCapture(pointerId);begin(pointer(e))};
canvas.onpointermove=e=>{if(mode==='pointer'&&pointerId===e.pointerId)move(pointer(e))};
function endPointer(){pointerId=null;finish()}
canvas.onpointerup=endPointer;canvas.onpointercancel=endPointer;canvas.onlostpointercapture=endPointer;
function showCursor(p,drawing=false){point=p;$('#cursor').hidden=false;$('#cursor').style.left=p.x*100+'%';$('#cursor').style.top=p.y*100+'%';$('#cursor').classList.toggle('painting',drawing)}
function setInk(value){ink=value;$('#ink').setAttribute('aria-pressed',String(value));$('#ink').textContent=value?'Ink on — click to lift':'Ink off';if(!value)finish();status(value?'Ink on. Move to draw.':'Ink off. Move without drawing.')}
$('#input-mode').onchange=e=>{finish();pointerId=null;setInk(false);stopCamera();mode=e.target.value;$('#pointer-help').hidden=mode!=='pointer';$('#hand-help').hidden=mode!=='hand';$('#gesture-dock').hidden=true;$('#cursor').hidden=true;$('#mode-label').textContent={pointer:'Mouse & touch',hand:'Hand movements'}[mode];status({pointer:'Drag on the canvas to draw.',hand:'Enable your camera to begin.'}[mode]);};
$('#ink').onclick=()=>setInk(!ink);$('#gesture-mode').onchange=()=>{pendingHandPath=[];setInk(false);pinch=false;pointing=false;gate.since=null;handFiltered=null};$('#range').onchange=()=>{pendingHandPath=[];finish();filtered=null;handFiltered=null;gate.since=null};$('#center').onclick=()=>{if(lastHand){center={x:1-lastHand.x,y:lastHand.y+.07/Number($('#range').value)};finish();handFiltered=null;gate.since=null;status('Centered. Your current hand position is the canvas center.')}};
$('#clear').onclick=()=>{finish();setInk(false);$('#clear-dialog').showModal()};$('#cancel-clear').onclick=()=>$('#clear-dialog').close();$('#confirm-clear').onclick=()=>{if(strokes.length){clearBackup=strokes;strokes=[];redo=[];}render();save();$('#undo').disabled=!clearBackup;$('#clear-dialog').close();status('Fresh canvas. Undo can restore the previous drawing.')};
let clearBackup=null;const normalUndo=undo;$('#undo').onclick=()=>{if(!strokes.length&&clearBackup){strokes=clearBackup;clearBackup=null;redo.push({clear:true});render();save();status('Previous drawing restored.')}else normalUndo()};
$('#export').onclick=()=>{finish();const out=document.createElement('canvas');out.width=W;out.height=H;const c=out.getContext('2d');c.fillStyle='white';c.fillRect(0,0,W,H);c.drawImage(canvas,0,0);out.toBlob(blob=>{if(!blob){status('Could not create image. Please try again.');return}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='opencanvas-'+new Date().toISOString().slice(0,10)+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status('PNG image prepared for download.')},'image/png')};
for(const [button,dialog]of [['help','help-dialog'],['about','about-dialog']])$('#'+button).onclick=()=>{finish();setInk(false);$('#'+dialog).showModal()};$$('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
function updateCameraStatus(text){if($('#camera-status').textContent!==text)$('#camera-status').textContent=text}
function stopCamera(){latestLandmarks=null;drawHandSkeleton($('#hand-skeleton'),null);$('#tracking-metrics').textContent='camera off';pendingHandPath=[];lastMotionTime=0;lastResultTime=0;trackingFps=0;rateWindowStart=0;rateFrames=0;generation++;starting=false;ready=false;busy=false;clearTimeout(timeout);clearTimeout(frameTimeout);clearTimeout(hiddenTimeout);cancelTrackFrame();directTracker?.close();directTracker=null;fallbackLoading=false;worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;$('#video').srcObject=null;$('#camera').textContent='Enable camera';$('#camera').disabled=false;$('#camera-placeholder').hidden=false;$('#gesture-dock').hidden=true;$('#center').disabled=true;lastHand=null;pinch=false;pointing=false;handFiltered=null;gate.since=null;dwell=null;paused=false;$('[data-gesture=pause]').textContent='Pause ink';$$('[data-gesture]').forEach(b=>b.classList.remove('dwelling'));$('#cursor').hidden=true;finish();setInk(false)}
function trackingReady(token){
 if(token!==generation)return;
 clearTimeout(timeout);clearTimeout(frameTimeout);ready=true;starting=false;busy=false;
 $('#camera').textContent='turn camera off';$('#tracking-metrics').textContent='measuring tracking speed…';$('#gesture-dock').hidden=false;lastVideo=-1;lastFrame=0;
 updateCameraStatus('camera ready. bring one hand into view.');cancelTrackFrame();scheduleTrackFrame();
}
async function useCompatibleTracker(token){
 if(token!==generation||fallbackLoading)return;
 fallbackLoading=true;ready=false;busy=false;clearTimeout(timeout);clearTimeout(frameTimeout);cancelTrackFrame();
 worker?.terminate();worker=null;finish();
 updateCameraStatus('loading compatible hand tracking…');
 timeout=setTimeout(()=>{if(token===generation)cameraFailure('hand tracking could not finish loading. reload this page and try again.');},45000);
 try{
  const result=await createTracker();
  if(token!==generation){result.tracker.close();return}
  trackingDelegate=result.delegate;directTracker=result.tracker;fallbackLoading=false;trackingReady(token);
 }catch(error){if(token===generation)cameraFailure('hand tracking could not load: '+error.message+'. reload this page and try again.');}
}
async function startCamera(){
 if(starting||stream){stopCamera();updateCameraStatus('camera off.');return}
 if(!window.isSecureContext){updateCameraStatus('camera access requires https. open the secure site link.');return}
 if(!navigator.mediaDevices?.getUserMedia){updateCameraStatus('camera access is unavailable here. open this site directly in safari or chrome, rather than inside another app.');return}
 const policy=document.permissionsPolicy||document.featurePolicy;
 if(policy?.allowsFeature&&!policy.allowsFeature('camera')){updateCameraStatus('camera access is blocked in this embedded page. open the site directly in a browser tab.');return}
 starting=true;const token=++generation;$('#camera').textContent='cancel camera setup';updateCameraStatus('allow camera access when your browser asks…');
 timeout=setTimeout(()=>{if(token===generation)cameraFailure(cameraErrorMessage({name:'TimeoutError'}));},45000);
 try{
  let media;
  try{media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:640},height:{ideal:480},frameRate:{ideal:60,max:60}},audio:false});}
  catch(error){if(error.name!=='OverconstrainedError'||token!==generation)throw error;media=await navigator.mediaDevices.getUserMedia({video:true,audio:false});}
  if(token!==generation){media.getTracks().forEach(t=>t.stop());return}
  stream=media;clearTimeout(timeout);
  updateCameraStatus('starting camera preview…');
  const video=$('#video');video.muted=true;video.autoplay=true;video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.srcObject=media;
  timeout=setTimeout(()=>{if(token===generation)cameraFailure('camera preview did not start. close other camera apps and try again.');},15000);
  await video.play();if(token!==generation)return;clearTimeout(timeout);
  $('#camera-placeholder').hidden=true;updateCameraStatus('loading hand tracking…');
  media.getVideoTracks()[0].onended=()=>{if(token===generation)cameraFailure('camera access ended. enable it again to continue.');};
  if(typeof Worker==='undefined'||typeof createImageBitmap==='undefined'||typeof OffscreenCanvas==='undefined'){await useCompatibleTracker(token);return}
  try{
   worker=new Worker('./tracking-worker.js');
   timeout=setTimeout(()=>useCompatibleTracker(token),15000);
   worker.onmessage=({data})=>{
    if(token!==generation||fallbackLoading||directTracker)return;
    if(data.type==='ready'){trackingDelegate=data.delegate||'cpu';trackingReady(token);}
    else if(data.type==='result'){clearTimeout(frameTimeout);busy=false;receiveHand(data.points,data.world,data.time);}
    else if(data.type==='error')useCompatibleTracker(token);
   };
   worker.onerror=()=>useCompatibleTracker(token);worker.postMessage({type:'init'});
  }catch{await useCompatibleTracker(token)}
 }catch(error){if(token===generation)cameraFailure(cameraErrorMessage(error));}
}
function cameraFailure(message){stopCamera();updateCameraStatus(message)}
function cancelTrackFrame(){const v=$('#video');if(frameIsVideo&&v.cancelVideoFrameCallback)v.cancelVideoFrameCallback(frameId);else cancelAnimationFrame(frameId);}
function scheduleTrackFrame(){const v=$('#video');frameIsVideo=typeof v.requestVideoFrameCallback==='function';frameId=frameIsVideo?v.requestVideoFrameCallback(trackFrame):requestAnimationFrame(trackFrame);}
async function trackFrame(time){
 if(!ready||!stream)return;
 scheduleTrackFrame();
 if(document.hidden)return;
 const v=$('#video');
 if(busy||v.readyState<2||v.currentTime===lastVideo)return;
 lastVideo=v.currentTime;lastFrame=time;busy=true;const token=generation;
 try{
  if(directTracker){const result=directTracker.detectForVideo(v,time);busy=false;receiveHand(result.landmarks[0]||null,result.worldLandmarks[0]||null,time);return}
  const bitmap=await createImageBitmap(v);
  if(token!==generation||!worker){bitmap.close();return}
  frameTimeout=setTimeout(()=>useCompatibleTracker(token),5000);
  worker.postMessage({type:'frame',bitmap,time},[bitmap]);
 }catch(error){busy=false;if(token!==generation)return;if(directTracker)cameraFailure('hand tracking stopped: '+error.message+'. try enabling the camera again.');else useCompatibleTracker(token);}
}
function receiveHand(points,world,sampleTime){
 const now=performance.now(),delay=Math.max(0,now-sampleTime);
 if(!rateWindowStart)rateWindowStart=now;rateFrames++;if(now-rateWindowStart>=500){trackingFps=rateFrames*1000/(now-rateWindowStart);rateFrames=0;rateWindowStart=now;}lastResultTime=now;
 latestLandmarks=delay<=180?points:null;
 if(showTracking){const v=$('#video');drawHandSkeleton($('#hand-skeleton'),latestLandmarks,v.videoWidth||640,v.videoHeight||480);
  if(now-lastMetricTime>250){$('#tracking-metrics').textContent=`${Math.round(trackingFps)} fps · ${Math.round(delay)} ms frame delay · ${trackingDelegate}${delay>180?' · frame too old':points?'':' · hand not visible'}`;lastMetricTime=now;}
 }
 // Never connect a stroke across missing or badly delayed camera observations.
 handleHand(latestLandmarks,world,sampleTime);
}
function handleHand(points,world,sampleTime=performance.now()){
 if(document.hidden||document.querySelector('dialog[open]')){pendingHandPath=[];finish();pinch=false;pointing=false;gate.since=null;handFiltered=null;return}
 if(!points){pendingHandPath=[];lastMotionTime=0;finish();pinch=false;pointing=false;gate.since=null;handFiltered=null;lastHand=null;$('#center').disabled=true;$('#cursor').hidden=true;dwell=null;$$('[data-gesture]').forEach(b=>b.classList.remove('dwelling'));updateCameraStatus('Hand not visible. Bring it into view; ink is lifted.');return}
 // Draw and recenter from the index fingertip.
 lastHand=points[8];$('#center').disabled=false;
 const mapped=mapHand(lastHand,center,Number($('#range').value));
 const now=performance.now(),dt=lastMotionTime?Math.max(.008,Math.min(.1,(sampleTime-lastMotionTime)/1000)):1/60;lastMotionTime=sampleTime;
 handFiltered=stablePoint(handFiltered,mapped,Number($('#smooth').value)/100,dt);
 const p={x:handFiltered.x,y:clamp(handFiltered.y/.86)};
 const pose=world||points;pinch=isPinched(pose,pinch);pointing=isPointing(pose,pointing);
 const buttons=$$('[data-gesture]');
 if(handFiltered.y>.88){
  finish();pendingHandPath=[];gate.since=null;$('#cursor').hidden=true;
  const index=Math.min(buttons.length-1,Math.floor(handFiltered.x*buttons.length)),button=buttons[index];
  if(dwell!==index){dwell=index;dwellStart=now;dwellDone=false}
  buttons.forEach((b,i)=>b.classList.toggle('dwelling',i===index));
  if(!dwellDone&&now-dwellStart>=1200){dwellDone=true;button.click()}
  updateCameraStatus(`Hovering: ${button.textContent}. Hold for 1.2 seconds.`);return;
 }
 dwell=null;dwellDone=false;buttons.forEach(b=>b.classList.remove('dwelling'));
 const control=$('#gesture-mode').value;
 const wantsInk=!paused&&(control==='point'?pointing:control==='pinch'?pinch:ink);
 if(!wantsInk)pendingHandPath=[];
 else if(!active){pendingHandPath.push({...p});if(pendingHandPath.length>12)pendingHandPath.shift();}
 const drawing=gestureGate(gate,wantsInk,sampleTime);
 showCursor(p,drawing);
 if(drawing){if(!active){const first=pendingHandPath.shift()||p;begin(first);for(const q of pendingHandPath)move(q,false);pendingHandPath=[];}else move(p,false)}else finish();
 const action=eraser?'Erasing':'Drawing';
 updateCameraStatus(paused?'Ink paused. Hover over Resume ink below the canvas.':drawing?`${action}. ${control==='point'?'Open your hand to lift.':control==='pinch'?'Release the pinch to lift.':'Toggle ink off to lift.'}`:control==='point'?'Point your index finger and curl the other three fingers into your palm to draw. Open your hand to move.':control==='pinch'?'Pinch thumb and index to draw. Your palm can face the camera.':'Move your hand to aim; toggle ink to draw.');
}
$$('[data-gesture]').forEach(b=>b.onclick=()=>{finish();if(b.dataset.gesture==='eraser'){setTool(!eraser);status(eraser?'Eraser selected. Use your drawing gesture to erase.':'Brush selected.')}else if(b.dataset.gesture==='undo')$('#undo').click();else {paused=!paused;b.textContent=paused?'Resume ink':'Pause ink';status(paused?'Ink paused.':'Ink resumed.')}});
$('#camera').onclick=startCamera;
document.addEventListener('keydown',e=>{if(e.key==='Escape'){finish();setInk(false);paused=true;if(mode==='hand')$('[data-gesture=pause]').textContent='Resume ink'}});
document.addEventListener('visibilitychange',()=>{
 clearTimeout(hiddenTimeout);
 if(document.hidden){finish();setInk(false);if(stream&&!starting)hiddenTimeout=setTimeout(()=>{if(document.hidden&&stream){stopCamera();updateCameraStatus('camera stopped while this tab was hidden. enable it to continue.');}},1500);}
});
window.addEventListener('pagehide',()=>{stopCamera();if(saveTimer)saveNow()});window.addEventListener('beforeunload',e=>{finish();if(saveTimer)saveNow();if(dirty){e.preventDefault();e.returnValue=''}});
try{const saved=JSON.parse(localStorage.getItem('opencanvas-v1')||'[]');if(Array.isArray(saved)&&saved.length<10000&&saved.every(s=>Array.isArray(s.points)&&s.points.length<=6000&&s.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))&&typeof s.color==='string'&&Number.isFinite(s.size)&&(!s.tool||['brush','eraser','airbrush','fill','move','cut','polygon'].includes(s.tool))&&(s.tool!=='move'||(Number.isFinite(s.dx)&&Number.isFinite(s.dy))))){if(saved.length){savedDrawing=saved;$('#save-state').textContent='last drawing saved on this device'}}}catch{$('#save-state').textContent='Could not restore a drawing. Save image to keep your work.'}render();brushPreview();

$('#restore').onclick=()=>{if(!savedDrawing||strokes.length||active)return;strokes=savedDrawing;savedDrawing=null;redo=[];clearBackup=null;render();status('Last drawing restored.');$('#save-state').textContent='saved on this device'};

// Keep browser editing shortcuts intact when focus is in an input or dialog.
document.addEventListener('keydown',e=>{
 if(e.defaultPrevented||e.altKey||!(e.ctrlKey||e.metaKey)||document.querySelector('dialog[open]'))return;
 if(e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
 const key=e.key.toLowerCase();
 const action=key==='z'?(e.shiftKey?'redo':'undo'):key==='y'?'redo':null;
 if(!action)return;e.preventDefault();finish();
 const button=$('#'+action);if(!button.disabled)button.click();
});

function changeColor(value){
 if(!/^#[0-9a-f]{6}$/i.test(value))return;
 finish();color=value.toLowerCase();$('#ink-color').value=color;$('#color-hex').value=color;brushPreview();
}
$('#ink-color').oninput=e=>changeColor(e.target.value);
$('#color-hex').oninput=e=>changeColor(e.target.value);
$('#color-hex').onblur=()=>{$('#color-hex').value=color};

function toggleTracking(){
 showTracking=!showTracking;$('#show-tracking').setAttribute('aria-pressed',String(showTracking));$('#show-tracking').textContent=showTracking?'hide hand tracking (h)':'show hand tracking (h)';
 $('#hand-skeleton').hidden=!showTracking;$('#tracking-detail').hidden=!showTracking;
 if(showTracking){const v=$('#video');drawHandSkeleton($('#hand-skeleton'),latestLandmarks,v.videoWidth||640,v.videoHeight||480);if(!stream)$('#tracking-metrics').textContent='enable camera to see tracking';}
}
$('#show-tracking').onclick=toggleTracking;
document.addEventListener('keydown',e=>{
 if(mode!=='hand'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.key.toLowerCase()!=='h'||document.querySelector('dialog[open]')||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
 e.preventDefault();toggleTracking();
});
