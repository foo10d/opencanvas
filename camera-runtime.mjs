export async function createTracker(){
 const {FilesetResolver,HandLandmarker}=await import('./vendor/vision_bundle.mjs');
 const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',import.meta.url).href);
 const options={runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5};
 const create=delegate=>HandLandmarker.createFromOptions(files,{...options,baseOptions:{modelAssetPath:new URL('./vendor/hand_landmarker.task',import.meta.url).href,delegate}});
 try{return {tracker:await create('GPU'),delegate:'gpu'};}catch{return {tracker:await create('CPU'),delegate:'cpu'};}

}
export function cameraErrorMessage(error){
 const name=error?.name||'Error';
 const messages={NotAllowedError:'camera access was blocked. allow camera access for this site in your browser’s website settings, then try again.',NotFoundError:'no camera was found. connect a camera and try again.',NotReadableError:'the camera is busy or blocked by your device. close other camera apps and check device camera permissions.',OverconstrainedError:'this camera could not use the requested settings. try again.',SecurityError:'this browser has disabled camera access. open the site directly in safari or chrome.',TimeoutError:'camera setup timed out. check for a permission prompt, then try again.'};
 return messages[name]||'camera setup failed. please try again. details: '+name+(error?.message?' — '+error.message:'');
}
